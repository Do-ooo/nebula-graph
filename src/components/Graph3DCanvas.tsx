import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { AppConfig, GraphData, GraphNode, GraphEdge, ForceConfig, SimNode, SimEdge } from "../types";
import { hubForceLayout } from "../layout/hubForceLayout";
import { clusteredForceLayout, getLastClusterMeta } from "../layout/clusteredForceLayout";
import { getCategoryColor, getRelationColor } from "../lib/colorPalette";
import { Camera, Video, Square } from "lucide-react";

// ============================================================
// Module-level utility functions (extracted from component)
// ============================================================

/** Draw high quality text labels on a 2D canvas and convert to texture */
function createLabelTexture(
  name: string,
  color: string,
  isHighlighted: boolean,
  isImportant: boolean = false
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  
  const scaleFactor = 2;
  const fontSize = 13 * scaleFactor;
  ctx.font = `${isHighlighted ? "bold" : "500"} ${fontSize}px system-ui, -apple-system, sans-serif`;
  
  const textMetrics = ctx.measureText(name);
  const textWidth = textMetrics.width;
  
  const padX = 10 * scaleFactor;
  const padY = 6 * scaleFactor;
  const dotSize = 3.5 * scaleFactor;
  const dotGap = 6 * scaleFactor;
  const tagWidth = isImportant ? 18 * scaleFactor : 0;
  const tagGap = isImportant ? 5 * scaleFactor : 0;
  
  const bgWidth = textWidth + padX * 2 + dotSize + dotGap + tagWidth + tagGap;
  const bgHeight = fontSize + padY * 2;
  
  canvas.width = bgWidth + 12;
  canvas.height = bgHeight + 12;
  
  ctx.font = `${isHighlighted ? "bold" : "500"} ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  
  const x = 6;
  const y = 6;
  const w = bgWidth;
  const h = bgHeight;
  const r = 5 * scaleFactor;
  
  ctx.save();
  
  ctx.fillStyle = isHighlighted ? "rgba(245, 158, 11, 0.28)" : "rgba(8, 8, 10, 0.88)";
  ctx.strokeStyle = isHighlighted ? "rgba(245, 158, 11, 0.95)" : "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1.5 * scaleFactor;
  
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(x + padX + dotSize, y + h / 2, dotSize, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Dark outline around the category dot so light-colored dots stay legible
  // against the dark label background and don't bleed into nearby text.
  ctx.lineWidth = 1 * scaleFactor;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.stroke();

  // Text with dark outline: guarantees contrast regardless of the node color
  // or any bright glow bleeding through the semi-transparent label background.
  const textColor = isHighlighted ? "#fef3c7" : "#f1f5f9";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 * scaleFactor;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(name, x + padX + dotSize * 2 + dotGap, y + h / 2);
  ctx.fillStyle = textColor;
  ctx.fillText(name, x + padX + dotSize * 2 + dotGap, y + h / 2);
  
  if (isImportant) {
    const tx = x + padX + dotSize * 2 + dotGap + textWidth + tagGap;
    const ty = y + h / 2 - fontSize / 2 - 1 * scaleFactor;
    const tw = tagWidth;
    const th = fontSize + 2 * scaleFactor;
    const tr = 2 * scaleFactor;
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(tx + tr, ty);
    ctx.lineTo(tx + tw - tr, ty);
    ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + tr);
    ctx.lineTo(tx + tw, ty + th - tr);
    ctx.quadraticCurveTo(tx + tw, ty + th, tx + tw - tr, ty + th);
    ctx.lineTo(tx + tr, ty + th);
    ctx.quadraticCurveTo(tx, ty + th, tx, ty + th - tr);
    ctx.lineTo(tx, ty + tr);
    ctx.quadraticCurveTo(tx, ty, tx + tr, ty);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.font = `bold ${8 * scaleFactor}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("\u2605", tx + tw / 2, y + h / 2);
  }
  
  ctx.restore();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return { texture, width: canvas.width / scaleFactor, height: canvas.height / scaleFactor };
}

/** Compute 3D quadratic Bezier curve points between two positions.
 *  When emissionDir is provided (non-null), the control point is pushed
 *  along that direction from p0 so edges from the same source share an
 *  initial tangent (the "flashlight" effect).  Null = legacy arch. */
const getBezierPoints = (
  p0: THREE.Vector3,
  p2: THREE.Vector3,
  segments: number,
  emissionDir?: { x: number; y: number; z: number } | null,
) => {
  const points: THREE.Vector3[] = [];
  const d = p0.distanceTo(p2);
  let p1: THREE.Vector3;

  if (emissionDir && d > 0.01) {
    const beamLen = Math.min(d * 0.45, 50);
    p1 = new THREE.Vector3(
      p0.x + emissionDir.x * beamLen,
      p0.y + emissionDir.y * beamLen,
      p0.z + emissionDir.z * beamLen,
    );
  } else {
    const M = new THREE.Vector3().addVectors(p0, p2).multiplyScalar(0.5);
    const M_dir = M.length() > 0.1 ? M.clone().normalize() : new THREE.Vector3(0, 1, 0);
    p1 = M.clone().add(M_dir.multiplyScalar(d * 0.18));
  }

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const p = new THREE.Vector3()
      .addScaledVector(p0, mt * mt)
      .addScaledVector(p1, 2 * mt * t)
      .addScaledVector(p2, t * t);
    points.push(p);
  }
  return points;
};

// ============================================================
// Extracted: 3D Force Layout Simulation
// Computes node positions using Coulomb repulsion + spring attraction + center pull
// ============================================================

/**
 * Distribute N categories evenly on a sphere (Fibonacci-sphere style) so each
 * category cluster gets its own region of 3D space. Shared by the force layout
 * (for initial node placement) and the nebula builder (for cloud centers).
 * Radius scales dynamically with node count to prevent clusters from overlapping.
 */
function computeCategoryAnchors(categories: string[], nodeCount: number): Map<string, { x: number; y: number; z: number }> {
  const anchors = new Map<string, { x: number; y: number; z: number }>();
  const n = categories.length;
  if (n === 0) return anchors;
  const radius = 15 + Math.sqrt(nodeCount) * 5;
  categories.forEach((cat, index) => {
    const phi = Math.acos(-1 + (2 * index) / n);
    const theta = Math.sqrt(n * Math.PI) * phi;
    anchors.set(cat, {
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
    });
  });
  return anchors;
}

interface SimResult {
  simNodes: SimNode[];
  simEdges: SimEdge[];
  nodeDegrees: Map<string, number>;
  maxDegree: number;
}

function computeForceLayout(
  activeNodes: GraphNode[],
  activeEdges: GraphEdge[],
  config: ForceConfig,
  prevPositions: Map<string, { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }>
): SimResult {
  // Compute 3D anchors for each unique category to form natural galactic clusters
  const uniqueCategories: string[] = Array.from(new Set(activeNodes.map(n => (n.category as string) || "").filter(Boolean))) as string[];
  const categoryAnchors = computeCategoryAnchors(uniqueCategories, activeNodes.length);

  const simNodes: SimNode[] = activeNodes.map((n) => {
    if (prevPositions.has(n.id)) {
      const prev = prevPositions.get(n.id)!;
      return {
        ...n,
        x: prev.x, y: prev.y, z: prev.z,
        rx: prev.rx !== undefined ? prev.rx : prev.x,
        ry: prev.ry !== undefined ? prev.ry : prev.y,
        rz: prev.rz !== undefined ? prev.rz : prev.z,
        vx: 0, vy: 0, vz: 0,
        hoverFactor: 0, neighborFactor: 0, dimFactor: 0,
      };
    } else {
      const anchor = n.category ? categoryAnchors.get(n.category as string) : null;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 15 + Math.random() * 25 + (n.weight ?? 50) * 0.1;
      let x = r * Math.sin(phi) * Math.cos(theta);
      let y = r * Math.sin(phi) * Math.sin(theta);
      let z = r * Math.cos(phi);
      if (anchor) { x += anchor.x; y += anchor.y; z += anchor.z; }
      return { ...n, x, y, z, rx: x, ry: y, rz: z, vx: 0, vy: 0, vz: 0, hoverFactor: 0, neighborFactor: 0, dimFactor: 0 };
    }
  });

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const simEdges: SimEdge[] = activeEdges.map((e) => {
    const sourceNode = nodeMap.get(e.source) || simNodes[0];
    const targetNode = nodeMap.get(e.target) || simNodes[0];
    return { source: sourceNode, target: targetNode, weight: e.weight, relation: e.relation };
  });

  // Run force simulation ticks
  const ticks = 160;
  const chargeStrength = (config.charge ?? -300) * 0.18;
  const linkStrength = (config.linkStrength ?? 0.055) * 0.12;
  const centerStrength = 0.015;
  const damping = 0.85;

  for (let step = 0; step < ticks; step++) {
    // 1. Repulsion (3D Coulomb)
    for (let i = 0; i < simNodes.length; i++) {
      const n1 = simNodes[i];
      for (let j = i + 1; j < simNodes.length; j++) {
        const n2 = simNodes[j];
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dz = n1.z - n2.z;
        const distSq = dx * dx + dy * dy + dz * dz + 0.1;
        const dist = Math.sqrt(distSq);
        if (dist < 130) {
          const distSqClamped = Math.max(16.0, distSq);
          const distClamped = Math.sqrt(distSqClamped);
          const force = (chargeStrength / distSqClamped) * (1.2 - dist / 130);
          const fx = (dx / distClamped) * force;
          const fy = (dy / distClamped) * force;
          const fz = (dz / distClamped) * force;
          n1.vx -= fx; n1.vy -= fy; n1.vz -= fz;
          n2.vx += fx; n2.vy += fy; n2.vz += fz;
        }
      }
    }

    // 2. Spring attraction along links
    simEdges.forEach((edge) => {
      const n1 = edge.source;
      const n2 = edge.target;
      const dx = n1.x - n2.x;
      const dy = n1.y - n2.y;
      const dz = n1.z - n2.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
      const restLength = config.linkDistance ?? 40;
      const force = (dist - restLength) * linkStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;
      n1.vx -= fx; n1.vy -= fy; n1.vz -= fz;
      n2.vx += fx; n2.vy += fy; n2.vz += fz;
    });

    // 3. Center pull + integration
    simNodes.forEach((node) => {
      const anchor = node.category ? categoryAnchors.get(node.category as string) : null;
      if (anchor) {
        node.vx -= (node.x - anchor.x) * centerStrength * 0.82;
        node.vy -= (node.y - anchor.y) * centerStrength * 0.82;
        node.vz -= (node.z - anchor.z) * centerStrength * 0.82;
        node.vx -= node.x * centerStrength * 0.18;
        node.vy -= node.y * centerStrength * 0.18;
        node.vz -= node.z * centerStrength * 0.18;
      } else {
        node.vx -= node.x * centerStrength;
        node.vy -= node.y * centerStrength;
        node.vz -= node.z * centerStrength;
      }
      node.x += node.vx; node.y += node.vy; node.z += node.vz;
      node.vx *= damping; node.vy *= damping; node.vz *= damping;
    });
  }

  // Calculate node degree for LOD label relevance
  const nodeDegrees = new Map<string, number>();
  simNodes.forEach((node) => nodeDegrees.set(node.id, 0));
  simEdges.forEach((edge) => {
    const srcId = typeof edge.source === "object" ? edge.source.id : edge.source;
    const tgtId = typeof edge.target === "object" ? edge.target.id : edge.target;
    if (nodeDegrees.has(srcId)) nodeDegrees.set(srcId, nodeDegrees.get(srcId)! + 1);
    if (nodeDegrees.has(tgtId)) nodeDegrees.set(tgtId, nodeDegrees.get(tgtId)! + 1);
  });
  let maxDegree = 1;
  nodeDegrees.forEach((deg) => { if (deg > maxDegree) maxDegree = deg; });

  return { simNodes, simEdges, nodeDegrees, maxDegree };
}

// ============================================================
// Extracted: WebGL support detection
// ============================================================
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

// ============================================================
// Extracted: Create particle/nebula textures
// ============================================================
function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.35, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.55, "rgba(240, 245, 255, 0.9)");
  gradient.addColorStop(0.75, "rgba(200, 220, 255, 0.4)");
  gradient.addColorStop(0.9, "rgba(150, 180, 255, 0.12)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// ============================================================
// Extracted: Create background starfield  (REMOVED per request — pure black space)
// ============================================================

// ============================================================
// Extracted: Create category nebula clouds (static, one Points per category)
// Positions are fixed once after force layout; only per-category opacity
// is lerped on hover. No per-frame position/color writes.
// ============================================================
interface NebulaCloud {
  category: string;
  points: THREE.Points;
  baseColor: THREE.Color;
  // current opacity (lerped each frame toward target)
  opacity: number;
}

interface NebulaResult {
  group: THREE.Group | null;
  clouds: NebulaCloud[];
}

function createNebula(
  simNodes: GraphNode[],
  config: AppConfig,
  clusterMeta?: Array<{ category: string; cx: number; cy: number; cz: number; radius: number }>
): NebulaResult {
  const uniqueCategories: string[] = Array.from(new Set(simNodes.map(n => (n.category as string) || "").filter(Boolean))) as string[];
  if (uniqueCategories.length === 0) return { group: null, clouds: [] };

  // Build cluster meta lookup for precise nebula positioning
  const clusterMetaMap = new Map<string, { cx: number; cy: number; cz: number; radius: number }>();
  if (clusterMeta) {
    clusterMeta.forEach((m) => clusterMetaMap.set(m.category, m));
  }

  // Reuse the same category anchors the force layout used, so each nebula
  // sits behind its own cluster.
  const categoryAnchors = computeCategoryAnchors(uniqueCategories, simNodes.length);

  const group = new THREE.Group();
  const clouds: NebulaCloud[] = [];

  // Soft radial sprite for additive cloud look
  const cloudTexture = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.2, "rgba(255,255,255,0.25)");
    g.addColorStop(0.5, "rgba(255,255,255,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();

  const baseParticlesPerCategory = 60;

  uniqueCategories.forEach((cat) => {
    const catNodes = simNodes.filter(n => (n.category as string) === cat);
    if (catNodes.length === 0) return;

    // Scale particle count and cloud radius with the number of nodes in this category.
    //   5 nodes  → ~90 particles, radius ~24
    //  20 nodes  → ~160 particles, radius ~42
    //  50 nodes  → ~260 particles, radius ~60
    const nodeCount = catNodes.length;
    const particlesPerCategory = baseParticlesPerCategory + Math.floor(nodeCount * 4);

    const catColorHex = getCategoryColor(cat, config.particle.categoryColors, config.particle.defaultColor);
    const baseColor = new THREE.Color(catColorHex);
    const anchor = categoryAnchors.get(cat)!;

    // Use precise cluster meta if available (from clustered layout),
    // otherwise fall back to anchor/centroid blend
    const meta = clusterMetaMap.get(cat);
    let centerX: number, centerY: number, centerZ: number, cloudRadius: number;
    if (meta) {
      centerX = meta.cx;
      centerY = meta.cy;
      centerZ = meta.cz;
      cloudRadius = meta.radius * 1.05; // layout already has 20% padding, just slight overshoot for soft wrap
    } else {
      // Compute centroid of the category's actual nodes for a tighter cloud
      const cx = catNodes.reduce((s, n) => s + (n.x || 0), 0) / catNodes.length;
      const cy = catNodes.reduce((s, n) => s + (n.y || 0), 0) / catNodes.length;
      const cz = catNodes.reduce((s, n) => s + (n.z || 0), 0) / catNodes.length;
      // Blend centroid with the force-layout anchor so the cloud stays near its cluster
      centerX = (cx + anchor.x) / 2;
      centerY = (cy + anchor.y) / 2;
      centerZ = (cz + anchor.z) / 2;
      cloudRadius = 18 + Math.sqrt(nodeCount) * 6;
    }

    const positions = new Float32Array(particlesPerCategory * 3);
    const colors = new Float32Array(particlesPerCategory * 3);

    for (let j = 0; j < particlesPerCategory; j++) {
      // Distribute particles in a soft sphere around the category center
      const radius = cloudRadius * (0.2 + Math.random() * 0.8);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[j * 3] = centerX + radius * Math.sin(phi) * Math.cos(theta);
      positions[j * 3 + 1] = centerY + radius * Math.sin(phi) * Math.sin(theta);
      positions[j * 3 + 2] = centerZ + radius * Math.cos(phi);

      const t = baseColor.clone().offsetHSL((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05);
      colors[j * 3] = t.r;
      colors[j * 3 + 1] = t.g;
      colors[j * 3 + 2] = t.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 32.0,
      map: cloudTexture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.28,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    group.add(points);
    clouds.push({ category: cat, points, baseColor, opacity: 0.28 });
  });

  return { group, clouds };
}

// ============================================================
// Node halos for hub layout — per-node glow proportional to degree
// ============================================================
interface NodeHalo {
  nodeId: string;
  points: THREE.Points;
  opacity: number;
  degreeRatio: number;
}

interface NodeHaloResult {
  group: THREE.Group;
  halos: NodeHalo[];
}

function createNodeHalos(
  simNodes: SimNode[],
  nodeDegrees: Map<string, number>,
  maxDegree: number,
  config: AppConfig
): NodeHaloResult {
  const group = new THREE.Group();
  const halos: NodeHalo[] = [];
  const maxDeg = Math.max(1, maxDegree);

  const haloTexture = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.7)");
    g.addColorStop(0.12, "rgba(255,255,255,0.35)");
    g.addColorStop(0.35, "rgba(255,255,255,0.1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();

  const defaultColor = new THREE.Color(config.particle.defaultColor);

  simNodes.forEach((node) => {
    const degree = nodeDegrees.get(node.id) || 0;
    const degreeRatio = degree / maxDeg;
    // Only top 30% nodes get halos to reduce particle count
    if (degreeRatio < 0.30) return;

    const particleCount = Math.floor(6 + degreeRatio * 30);
    const haloRadius = 3 + degreeRatio * 15;
    const positions = new Float32Array(particleCount * 3);

    for (let j = 0; j < particleCount; j++) {
      const r = haloRadius * (0.1 + Math.random() * 0.9);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[j * 3] = (node.x || 0) + r * Math.sin(phi) * Math.cos(theta);
      positions[j * 3 + 1] = (node.y || 0) + r * Math.sin(phi) * Math.sin(theta);
      positions[j * 3 + 2] = (node.z || 0) + r * Math.cos(phi);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const nodeColor = node.category
      ? new THREE.Color(getCategoryColor(node.category, config.particle.categoryColors, config.particle.defaultColor))
      : defaultColor;
    const haloColor = nodeColor.clone().multiplyScalar(1.3);

    const material = new THREE.PointsMaterial({
      size: 22 + degreeRatio * 28,
      map: haloTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      depthWrite: false,
      color: haloColor,
    });

    const points = new THREE.Points(geometry, material);
    group.add(points);
    halos.push({ nodeId: node.id, points, opacity: 0, degreeRatio });
  });

  return { group, halos };
}

// ============================================================
// Extracted: Create connection lines (Bezier curves)
// ============================================================
function createLineSegments(
  simEdges: SimEdge[],
  config: AppConfig
): THREE.LineSegments {
  const linePositions: number[] = [];
  const lineColors: number[] = [];

  simEdges.forEach((edge) => {
    const src = edge.source;
    const tgt = edge.target;
    const relation = edge.relation || "";
    const edgeColor = new THREE.Color(getRelationColor(relation, config.particle.relationColors, config.particle.defaultColor));
    const weightBrightness = 0.6 + (edge.weight / 100) * 0.8;
    edgeColor.multiplyScalar(weightBrightness);

    const bPoints = getBezierPoints(
      new THREE.Vector3(src.x || 0, src.y || 0, src.z || 0),
      new THREE.Vector3(tgt.x || 0, tgt.y || 0, tgt.z || 0),
      8,
      (src as SimNode).emissionDir,
    );

    for (let i = 0; i < 8; i++) {
      const ptStart = bPoints[i];
      const ptEnd = bPoints[i + 1];
      linePositions.push(ptStart.x, ptStart.y, ptStart.z);
      linePositions.push(ptEnd.x, ptEnd.y, ptEnd.z);
      lineColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
      lineColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: config.line.opacity,
  });

  return new THREE.LineSegments(geometry, material);
}

// ============================================================
// Extracted: Create sprite labels
// ============================================================

// Simple LRU cache for label textures so filter changes don't re-create every canvas.
const labelTextureCache = new Map<string, THREE.CanvasTexture>();
const MAX_LABEL_CACHE = 500;
const LABEL_SCALE_FACTOR = 2;

function getCachedLabelTexture(name: string, color: string, isImportant: boolean): THREE.CanvasTexture {
  const key = `${name}|${color}|${isImportant ? 1 : 0}`;
  let texture = labelTextureCache.get(key);
  if (texture) {
    // Move to end to keep LRU order.
    labelTextureCache.delete(key);
    labelTextureCache.set(key, texture);
    return texture;
  }
  if (labelTextureCache.size >= MAX_LABEL_CACHE) {
    const firstKey = labelTextureCache.keys().next().value;
    const oldTexture = labelTextureCache.get(firstKey);
    if (oldTexture) oldTexture.dispose();
    labelTextureCache.delete(firstKey);
  }
  const { texture: newTexture } = createLabelTexture(name, color, false, isImportant);
  labelTextureCache.set(key, newTexture);
  return newTexture;
}

function createLabels(
  simNodes: GraphNode[],
  config: AppConfig,
  nodeDegrees: Map<string, number> = new Map(),
  maxDegree: number = 1
): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < simNodes.length; i++) {
    const node = simNodes[i];
    const categoryColor = getCategoryColor(node.category || "", config.particle.categoryColors, config.particle.defaultColor);
    const degreeRatio = (nodeDegrees.get(node.id) || 0) / Math.max(1, maxDegree);
    const isImportant = degreeRatio >= 0.5;
    const texture = getCachedLabelTexture(node.name, categoryColor, isImportant);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 1.0, depthWrite: false, depthTest: true });
    const sprite = new THREE.Sprite(material);
    const width = texture.image.width / LABEL_SCALE_FACTOR;
    const height = texture.image.height / LABEL_SCALE_FACTOR;
    const aspect = width / height;
    const labelHeight = 2.6;
    sprite.scale.set(labelHeight * aspect, labelHeight, 1);
    const baseScale = ((node.weight ?? 50) / 100) * 1.5 + 0.6;
    const nodeRadius = 2.0 * baseScale;
    sprite.position.set(node.x || 0, (node.y || 0) + nodeRadius + 0.15, node.z || 0);
    sprite.userData = { nodeIdx: i, nodeId: node.id };
    group.add(sprite);
  }
  return group;
}

// ============================================================
// Extracted: Setup pointer event handlers
// ============================================================
interface PointerHandlers {
  onPointerMove: (event: MouseEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
}

function setupPointerEvents(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  instancedMeshRef: RefObject<THREE.InstancedMesh | null>,
  labelsGroupRef: RefObject<THREE.Group | null>,
  simNodesRef: RefObject<SimNode[]>,
  setHoveredNode: (n: GraphNode | null) => void,
  setHoveredPos: (p: { x: number; y: number } | null) => void,
  setHoverHighlightNodeId: (id: string | null) => void,
  isHighlightActive: () => boolean
): PointerHandlers {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const findNodeAtPointer = (): GraphNode | null => {
    let foundNode: GraphNode | null = null;
    if (instancedMeshRef.current) {
      const intersects = raycaster.intersectObject(instancedMeshRef.current);
      if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        if (instanceId !== undefined && simNodesRef.current) {
          foundNode = simNodesRef.current[instanceId] || null;
        }
      }
    }
    if (!foundNode && labelsGroupRef.current) {
      const intersectsSprites = raycaster.intersectObjects(labelsGroupRef.current.children);
      if (intersectsSprites.length > 0) {
        const sprite = intersectsSprites[0].object;
        const nodeIdx = sprite.userData?.nodeIdx;
        if (nodeIdx !== undefined && simNodesRef.current) {
          foundNode = simNodesRef.current[nodeIdx] || null;
        }
      }
    }
    // In association (highlight) mode, dimmed nodes are visually hidden —
    // they must NOT be clickable. A node is dimmed when its dimFactor has
    // ramped up past ~0.5 (lerped each frame while not self/neighbor).
    if (foundNode && (foundNode as any).dimFactor !== undefined && (foundNode as any).dimFactor > 0.5) {
      return null;
    }
    return foundNode;
  };

  const onPointerMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const foundNode = findNodeAtPointer();
    document.body.style.cursor = foundNode ? "pointer" : "default";
  };

  let startX = 0;
  let startY = 0;
  const onPointerDown = (event: PointerEvent) => {
    startX = event.clientX;
    startY = event.clientY;
  };

  const onPointerUp = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const diffX = event.clientX - startX;
    const diffY = event.clientY - startY;
    const distance = Math.sqrt(diffX * diffX + diffY * diffY);
    if (distance > 5) return;

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // If already in highlight (association) mode, any tap only exits — never
    // switch directly to another node. User must dismiss first, then tap again.
    if (isHighlightActive()) {
      setHoveredNode(null);
      setHoveredPos(null);
      setHoverHighlightNodeId(null);
      return;
    }

    const foundNode = findNodeAtPointer();

    if (foundNode) {
      setHoveredNode(foundNode);
      setHoveredPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      setHoverHighlightNodeId(foundNode.id);
    } else {
      setHoveredNode(null);
      setHoveredPos(null);
      setHoverHighlightNodeId(null);
    }
  };

  return { onPointerMove, onPointerDown, onPointerUp };
}

// ============================================================
// Extracted: Cleanup scene resources
// ============================================================
function cleanupScene(
  scene: THREE.Scene,
  labelsGroupRef: RefObject<THREE.Group | null>,
  instancedMeshRef: RefObject<THREE.InstancedMesh | null>,
  lineSegmentsRef: RefObject<THREE.LineSegments | null>,
  nebulaCloudsRef: RefObject<NebulaCloud[] | null>,
  nodeHaloGroupRef: RefObject<THREE.Group | null>,
  nodeHalosRef: RefObject<NodeHalo[] | null>
) {
  if (labelsGroupRef.current) {
    labelsGroupRef.current.children.forEach((child: any) => {
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }
  if (instancedMeshRef.current) {
    scene.remove(instancedMeshRef.current);
    if (instancedMeshRef.current.geometry) instancedMeshRef.current.geometry.dispose();
    if (Array.isArray(instancedMeshRef.current.material)) {
      instancedMeshRef.current.material.forEach((m) => m.dispose());
    } else if (instancedMeshRef.current.material) {
      instancedMeshRef.current.material.dispose();
    }
    instancedMeshRef.current = null;
  }
  if (lineSegmentsRef.current) {
    lineSegmentsRef.current.geometry.dispose();
    if (Array.isArray(lineSegmentsRef.current.material)) {
      lineSegmentsRef.current.material.forEach((m) => m.dispose());
    } else {
      lineSegmentsRef.current.material.dispose();
    }
  }
  // Dispose each static nebula cloud
  if (nebulaCloudsRef.current) {
    nebulaCloudsRef.current.forEach((cloud) => {
      scene.remove(cloud.points);
      cloud.points.geometry.dispose();
      const mat = cloud.points.material as THREE.PointsMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
    });
    nebulaCloudsRef.current = null;
  }
  // Dispose node halos
  if (nodeHalosRef.current) {
    nodeHalosRef.current.forEach((halo) => {
      scene.remove(halo.points);
      halo.points.geometry.dispose();
      const mat = halo.points.material as THREE.PointsMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
    });
    nodeHalosRef.current = null;
  }
  if (nodeHaloGroupRef.current) {
    scene.remove(nodeHaloGroupRef.current);
    nodeHaloGroupRef.current = null;
  }
}

// ============================================================
// Component
// ============================================================

interface Graph3DCanvasProps {
  data: GraphData;
  config: AppConfig;
  minWeight: number;
  hiddenCategories: string[];
  hiddenRelations: string[];
  presetCameraTrigger: string | null;
  onClearPresetCamera: () => void;
  onViewStatsChange?: (stats: { nodeCount: number; edgeCount: number }) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  layoutMode?: string;
}

export default function Graph3DCanvas({
  data,
  config,
  minWeight,
  hiddenCategories,
  hiddenRelations,
  presetCameraTrigger,
  onClearPresetCamera,
  onViewStatsChange,
  onRecordingStateChange,
  layoutMode = "hub",
}: Graph3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ relation: string; weight: number; source: string; target: string; x: number; y: number } | null>(null);
  
  const [hoverHighlightNodeId, setHoverHighlightNodeId] = useState<string | null>(null);
  const hoverHighlightNodeIdRef = useRef<string | null>(null);

  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    hoverHighlightNodeIdRef.current = hoverHighlightNodeId;
  }, [hoverHighlightNodeId]);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimeLeft, setRecordTimeLeft] = useState(10);
  const [recordingPresetDuration, setRecordingPresetDuration] = useState(10);
  const recordingTimeoutRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const adaptivePausedRef = useRef<boolean>(false);

  useEffect(() => {
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

  // Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<any[]>([]);
  const nodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const nodeDegreesRef = useRef<Map<string, number>>(new Map());
  const maxDegreeRef = useRef<number>(1);
  const hoverIntensityRef = useRef<number>(0.0);
  const needsAutoFitRef = useRef<boolean>(true);

  // Mesh refs
  const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const lineSegmentsRef = useRef<THREE.LineSegments | null>(null);
  const nebulaCloudsRef = useRef<NebulaCloud[] | null>(null);
  const nebulaGroupRef = useRef<THREE.Group | null>(null);
  const nodeHalosRef = useRef<NodeHalo[] | null>(null);
  const nodeHaloGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const layoutModeRef = useRef(layoutMode);
  useEffect(() => {
    layoutModeRef.current = layoutMode;
  }, [layoutMode]);

  // Local data filtered
  const [activeNodes, setActiveNodes] = useState<GraphNode[]>([]);
  const [activeEdges, setActiveEdges] = useState<GraphEdge[]>([]);

  // Smooth camera flight target
  const cameraFlightRef = useRef<{
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startLook: THREE.Vector3;
    endLook: THREE.Vector3;
    progress: number;
    duration: number;
  } | null>(null);

  // Particle metadata
  const nodeParticlesMetaRef = useRef<Array<{
    offset: number;
    count: number;
    degree: number;
    maxDegree: number;
  }>>([]);

  // (nebula now uses per-category static clouds in nebulaCloudsRef; no per-frame offsets/colors)

  // Pre-allocated temp objects for render loop (avoid GC pressure)
  const _tmpDummy = new THREE.Object3D();
  const _tmpNodeColor = new THREE.Color();
  const _tmpFrustum = new THREE.Frustum();
  // P1 fix: reusable per-frame buffers instead of allocating new ones each frame.
  const _culledNodesBuf = useRef(new Uint8Array(512));
  const _firstDegreeSet = useRef(new Set<string>());
  const _activeCatsSet = useRef(new Set<string>());
  const _tmpMatrix4 = new THREE.Matrix4();
  const _tmpVec3 = new THREE.Vector3();
  const _tmpColorSrc = new THREE.Color();
  const _tmpColorTgt = new THREE.Color();
  const _tmpColorStart = new THREE.Color();
  const _tmpColorEnd = new THREE.Color();
  const _tmpMidPoint = new THREE.Vector3();
  const _tmpVec3b = new THREE.Vector3();
  const prevHoverIdRef = useRef<string | null>(null);
  // Track camera movement so the node billboard matrices (which copy
  // camera.quaternion) can be re-written only while the camera is actually
  // moving/rotating — skipped when the view is fully static.
  const prevCamPosRef = useRef(new THREE.Vector3());
  const prevCamTargetRef = useRef(new THREE.Vector3());
  const prevCameraDistRef = useRef<number>(0);
  const prevLodAlphaRef = useRef<number>(-1);

  // Filter nodes and edges based on filters
  useEffect(() => {
    const nodes = data.nodes.filter(
      (node) =>
        (node.weight ?? 50) >= minWeight &&
        (hiddenCategories.length === 0 || (node.category && !hiddenCategories.includes(node.category)))
    );
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter(
      (edge) =>
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        (!edge.relation || !hiddenRelations.includes(edge.relation))
    );

    setActiveNodes(nodes);
    setActiveEdges(edges);
    // Dataset changed → camera should auto-fit to the new layout bounds
    needsAutoFitRef.current = true;

    if (onViewStatsChange) {
      onViewStatsChange({ nodeCount: nodes.length, edgeCount: edges.length });
    }
  }, [data, minWeight, hiddenCategories, hiddenRelations]);

  // Force layout simulation when data updates
  useEffect(() => {
    if (activeNodes.length === 0) return;

    // Map existing node positions for layout stability
    const prevPositions = new Map<string, { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }>();
    if (simNodesRef.current.length > 0) {
      simNodesRef.current.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined && n.z !== undefined) {
          prevPositions.set(n.id, { x: n.x, y: n.y, z: n.z, rx: n.rx, ry: n.ry, rz: n.rz });
        }
      });
    }

    let result;
    if (layoutModeRef.current === "hub") {
      result = hubForceLayout.compute({
        nodes: activeNodes,
        edges: activeEdges,
        config: configRef.current.force,
        prevPositions,
      });
    } else if (layoutModeRef.current === "clustered") {
      result = clusteredForceLayout.compute({
        nodes: activeNodes,
        edges: activeEdges,
        config: configRef.current.force,
        prevPositions,
      });
    } else {
      result = computeForceLayout(activeNodes, activeEdges, configRef.current.force, prevPositions);
    }
    simNodesRef.current = result.simNodes;
    simEdgesRef.current = result.simEdges;
    nodeMapRef.current = new Map(result.simNodes.map((n) => [n.id, n]));

    // Update orbit controls target to the centroid of the layout so rotation
    // pivots around the visual center of the graph, not the world origin.
    if (controlsRef.current && result.simNodes.length > 0) {
      let cx = 0, cy = 0, cz = 0;
      result.simNodes.forEach(n => {
        cx += n.x || 0;
        cy += n.y || 0;
        cz += n.z || 0;
      });
      const len = result.simNodes.length;
      controlsRef.current.target.set(cx / len, cy / len, cz / len);
      controlsRef.current.update();
    }

    // Store degree metadata for LOD label relevance & isMinor
    nodeDegreesRef.current = result.nodeDegrees;
    maxDegreeRef.current = result.maxDegree;

    // ── Auto-fit camera to layout bounding sphere ──
    if (needsAutoFitRef.current && result.simNodes.length > 0) {
      needsAutoFitRef.current = false;
      let bx = 0, by = 0, bz = 0;
      result.simNodes.forEach(n => { bx += n.x || 0; by += n.y || 0; bz += n.z || 0; });
      const bLen = result.simNodes.length;
      const centroid = new THREE.Vector3(bx / bLen, by / bLen, bz / bLen);

      let maxR = 0;
      result.simNodes.forEach(n => {
        const dx = (n.x || 0) - centroid.x;
        const dy = (n.y || 0) - centroid.y;
        const dz = (n.z || 0) - centroid.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxR) maxR = d;
      });

      const boundingR = Math.max(maxR * 1.2 + 10, 20);
      const fovRad = (50 / 2) * (Math.PI / 180);
      const fitDist = boundingR / Math.tan(fovRad);
      const camDist = Math.max(60, Math.min(fitDist * 0.85, 600));

      // Place camera at an angled overview: mostly Z, slight Y elevation
      const camPos = new THREE.Vector3(0, camDist * 0.25, camDist);

      if (cameraRef.current) {
        cameraRef.current.position.copy(camPos);
      }
      if (controlsRef.current) {
        controlsRef.current.target.copy(centroid);
        controlsRef.current.update();
      }
    }

    const meta: typeof nodeParticlesMetaRef.current = [];
    result.simNodes.forEach((node) => {
      meta.push({
        offset: 0,
        count: 0,
        degree: result.nodeDegrees.get(node.id) || 0,
        maxDegree: result.maxDegree,
      });
    });
    nodeParticlesMetaRef.current = meta;
  }, [activeNodes, activeEdges, config.force.charge, config.force.linkDistance, config.force.linkStrength, layoutMode]);

  // ===== Main canvas initialization (scene, objects, render loop) =====
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // WebGL support check
    if (!isWebGLAvailable()) {
      setWebglError(true);
      return;
    }

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 550;

    // Cache existing camera position to avoid resets on slider updates.
    // When auto-fit is needed (dataset changed), compute a fresh position.
    let initialCamPos: THREE.Vector3;
    if (needsAutoFitRef.current || !cameraRef.current) {
      initialCamPos = new THREE.Vector3(0, 80, 280); // placeholder, auto-fit will override
    } else {
      initialCamPos = cameraRef.current.position.clone();
    }
    const cachedControlsTarget = controlsRef.current ? controlsRef.current.target.clone() : new THREE.Vector3(0, 0, 0);

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#06070e");
    scene.fog = new THREE.FogExp2("#06070e", 0.0008);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 6000);
    camera.position.copy(initialCamPos);
    cameraRef.current = camera;

    // preserveDrawingBuffer required for PNG capture and video recording — this is a known performance tradeoff
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Adaptive pixel ratio: will be lowered automatically if FPS drops.
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 1200;
    controls.minDistance = 10;
    controls.target.copy(cachedControlsTarget);
    controlsRef.current = controls;

    // --- Lights ---
    scene.add(new THREE.AmbientLight("#111528", 1.5));
    const dirLight1 = new THREE.DirectionalLight("#4a9eff", 2.0);
    dirLight1.position.set(100, 200, 50);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight("#ff4a4a", 1.0);
    dirLight2.position.set(-100, -200, -50);
    scene.add(dirLight2);

    // --- Textures ---
    const particleTexture = createParticleTexture();
    // (starfield removed; nebulaTexture no longer needed — clouds bake their own)

    // --- Category Nebula Clouds (static, one Points per category) ---
    const nebulaResult = createNebula(
      simNodesRef.current,
      configRef.current,
      layoutModeRef.current === "clustered" ? getLastClusterMeta() : undefined
    );
    if (nebulaResult.group) {
      scene.add(nebulaResult.group);
      nebulaGroupRef.current = nebulaResult.group;
    }
    nebulaCloudsRef.current = nebulaResult.clouds;

    // --- Node Halos for hub layout ---
    if (layoutModeRef.current === "hub" && simNodesRef.current.length > 0) {
      const haloResult = createNodeHalos(
        simNodesRef.current,
        nodeParticlesMetaRef.current.reduce((map, m, i) => {
          map.set(simNodesRef.current[i].id, m.degree);
          return map;
        }, new Map<string, number>()),
        nodeParticlesMetaRef.current[0]?.maxDegree || 1,
        configRef.current
      );
      scene.add(haloResult.group);
      nodeHaloGroupRef.current = haloResult.group;
      nodeHalosRef.current = haloResult.halos;
    }

    // --- Resize Handler ---
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // --- Pointer Events ---
    const pointerHandlers = setupPointerEvents(
      canvasRef.current,
      camera,
      instancedMeshRef,
      labelsGroupRef,
      simNodesRef,
      setHoveredNode,
      setHoveredPos,
      setHoverHighlightNodeId,
      () => hoverHighlightNodeIdRef.current !== null
    );
    canvasRef.current.addEventListener("mousemove", pointerHandlers.onPointerMove);
    canvasRef.current.addEventListener("pointerdown", pointerHandlers.onPointerDown);
    canvasRef.current.addEventListener("pointerup", pointerHandlers.onPointerUp);

    // --- Build Connection Lines ---
    if (lineSegmentsRef.current) {
      scene.remove(lineSegmentsRef.current);
      lineSegmentsRef.current.geometry.dispose();
      if (Array.isArray(lineSegmentsRef.current.material)) {
        lineSegmentsRef.current.material.forEach((m) => m.dispose());
      } else {
        lineSegmentsRef.current.material.dispose();
      }
    }
    if (simEdgesRef.current.length > 0) {
      const lineSegments = createLineSegments(simEdgesRef.current, configRef.current);
      lineSegmentsRef.current = lineSegments;
      scene.add(lineSegments);
    }

    // --- Build Sprite Labels ---
    if (labelsGroupRef.current) {
      scene.remove(labelsGroupRef.current);
      labelsGroupRef.current.children.forEach((child: any) => {
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
    const labelsGroup = createLabels(simNodesRef.current, configRef.current, nodeDegreesRef.current, maxDegreeRef.current);
    labelsGroupRef.current = labelsGroup;
    scene.add(labelsGroup);

    // --- WebGL Context Lost Handler ---
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setWebglError(true);
    };
    canvasRef.current.addEventListener("webglcontextlost", onContextLost);

    // =====================
    // Render Loop
    // =====================
    const clock = new THREE.Clock();
    let animId = 0;
    const FPS_CHECK_INTERVAL = 1.0;
    let frameCount = 0;
    let lastFpsCheck = 0;

    const tick = () => {
      animId = requestAnimationFrame(tick);
      const time = clock.getElapsedTime();

      // Adaptive pixel ratio: if FPS stays low, lower DPR to save fill-rate;
      // if FPS recovers, raise it back up. Paused while recording to avoid
      // changing stream resolution mid-capture.
      let fps = 0;
      if (!adaptivePausedRef.current && rendererRef.current && containerRef.current && cameraRef.current) {
        frameCount++;
        if (time - lastFpsCheck > FPS_CHECK_INTERVAL) {
          fps = frameCount / (time - lastFpsCheck);
          frameCount = 0;
          lastFpsCheck = time;
          const currentDpr = rendererRef.current.getPixelRatio();
          const maxDpr = Math.min(window.devicePixelRatio, 2);
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          if (fps < 25 && currentDpr > 1.25) {
            rendererRef.current.setPixelRatio(1.25);
            rendererRef.current.setSize(w, h);
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
          } else if (fps > 48 && currentDpr < maxDpr) {
            rendererRef.current.setPixelRatio(maxDpr);
            rendererRef.current.setSize(w, h);
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
          }
        }
      }

      // --- Camera Flight Interpolation ---
      if (cameraFlightRef.current && cameraRef.current && controlsRef.current) {
        const flight = cameraFlightRef.current;
        flight.progress += 0.03;
        if (flight.progress >= 1.0) {
          cameraRef.current.position.copy(flight.endPos);
          controlsRef.current.target.copy(flight.endLook);
          cameraFlightRef.current = null;
        } else {
          const t = flight.progress;
          const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          cameraRef.current.position.lerpVectors(flight.startPos, flight.endPos, ease);
          controlsRef.current.target.lerpVectors(flight.startLook, flight.endLook, ease);
        }
        controlsRef.current.update();
      } else if (controlsRef.current) {
        if (configRef.current.interaction.autoRotate) {
          controlsRef.current.autoRotate = true;
          controlsRef.current.autoRotateSpeed = 0.5;
        } else {
          controlsRef.current.autoRotate = false;
        }
        controlsRef.current.update();
      }

      // (Background starfield removed — pure black space.)

      // --- Update Nodes, Edges, Labels ---
      if (simNodesRef.current.length > 0 && rendererRef.current && sceneRef.current && cameraRef.current) {
        const simNodes = simNodesRef.current;
        const simEdges = simEdgesRef.current;

        // Re-create InstancedMesh if count changed
        if (!instancedMeshRef.current || instancedMeshRef.current.count !== simNodes.length) {
          if (instancedMeshRef.current) scene.remove(instancedMeshRef.current);
          const planeGeo = new THREE.PlaneGeometry(4.0, 4.0);
          const sphereMat = new THREE.MeshBasicMaterial({
            map: particleTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
          });
          const instMesh = new THREE.InstancedMesh(planeGeo, sphereMat, simNodes.length);
          instancedMeshRef.current = instMesh;
          scene.add(instMesh);
        }

        // LOD calculation
        const cameraDist = camera.position.distanceTo(controls.target);
        const hoverHighlightNodeId = hoverHighlightNodeIdRef.current;
        const LOD_FAR = 380;
        const LOD_CLOSE = 100;
        const zoomProgress = Math.max(0, Math.min(1, 1.0 - (cameraDist - LOD_CLOSE) / (LOD_FAR - LOD_CLOSE)));
        const lodAlpha = zoomProgress * zoomProgress * (3 - 2 * zoomProgress);

        // Dynamic minor threshold: fewer nodes → stricter threshold → fewer nodes hidden
        // 200+ nodes: 0.12 (current), 50 nodes: ~0.03, <30: only true orphans (0.01)
        const _nc = simNodes.length;
        const minorThreshold = Math.max(0.01, Math.min(0.12, (_nc - 20) / 1500));

        // P1 fix: reuse buffers instead of allocating every frame
        if (_culledNodesBuf.current.length < simNodes.length) {
          _culledNodesBuf.current = new Uint8Array(simNodes.length);
        }
        const culledNodes = _culledNodesBuf.current;
        const firstDegreeSet = _firstDegreeSet.current;
        firstDegreeSet.clear();
        if (hoverHighlightNodeId) {
          simEdges.forEach((edge) => {
            const sId = typeof edge.source === "object" ? edge.source.id : edge.source;
            const tId = typeof edge.target === "object" ? edge.target.id : edge.target;
            if (sId === hoverHighlightNodeId) firstDegreeSet.add(tId);
            else if (tId === hoverHighlightNodeId) firstDegreeSet.add(sId);
          });
        }

        // P1 fix: compute a single "did anything move / hover change" signal up
        // front so nodes and edges can skip geometry writes when the scene is
        // static (e.g. just orbiting/zooming). firstDegreeSet must be computed
        // first because the dimTarget check depends on it.
        let maxPosDelta = 0;
        let maxDimDelta = 0;
        for (let i = 0; i < simNodes.length; i++) {
          const n = simNodes[i];
          const dp = Math.abs((n.rx ?? n.x ?? 0) - (n.x ?? 0))
                   + Math.abs((n.ry ?? n.y ?? 0) - (n.y ?? 0))
                   + Math.abs((n.rz ?? n.z ?? 0) - (n.z ?? 0));
          if (dp > maxPosDelta) maxPosDelta = dp;
          const dimTarget = (hoverHighlightNodeId && n.id !== hoverHighlightNodeId && !firstDegreeSet.has(n.id)) ? 1.0 : 0.0;
          const dd = Math.abs((n.dimFactor ?? 0) - dimTarget);
          if (dd > maxDimDelta) maxDimDelta = dd;
        }
        const hoverChanged = prevHoverIdRef.current !== hoverHighlightNodeId;
        prevHoverIdRef.current = hoverHighlightNodeId;
        // Billboard fix: node planes copy camera.quaternion, so their matrices
        // MUST be re-written whenever the camera moves/rotates — otherwise the
        // flat planes reveal their edge and look like "片" instead of spheres.
        // Only skip the write when the camera is truly static AND nodes are
        // settled AND no hover animation is running.
        const camMoved = prevCamPosRef.current.distanceToSquared(camera.position) > 0.0001
                      || prevCamTargetRef.current.distanceToSquared(controls.target) > 0.0001;
        prevCamPosRef.current.copy(camera.position);
        prevCamTargetRef.current.copy(controls.target);
        const needNodeMatrixWrite = maxPosDelta > 0.01 || maxDimDelta > 0.005 || hoverChanged || camMoved;
        // color (lodAlpha-dependent) must refresh every frame the camera distance
        // is changing or hover is animating — we keep writing color but skip
        // the matrix when static.

        // Frustum culling (using pre-allocated objects)
        _tmpMatrix4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _tmpFrustum.setFromProjectionMatrix(_tmpMatrix4);

        // --- Nebula per-category visibility based on highlight scope ---
        // When a node is highlighted, only the categories present among the
        // highlighted node + its 1-degree neighbors keep their nebula clouds;
        // other categories' clouds fade out via material.opacity (cheap: one
        // uniform per cloud, no per-pixel color writes).
        if (nebulaCloudsRef.current && nebulaCloudsRef.current.length > 0) {
          const clouds = nebulaCloudsRef.current;

          // Categories that should stay visible while a node is highlighted
          const activeCats = _activeCatsSet.current;
          activeCats.clear();
          if (hoverHighlightNodeId) {
            const hoveredNode = nodeMapRef.current.get(hoverHighlightNodeId);
            if (hoveredNode && hoveredNode.category) activeCats.add(hoveredNode.category);
            firstDegreeSet.forEach((nid) => {
              const nb = nodeMapRef.current.get(nid);
              if (nb && nb.category) activeCats.add(nb.category);
            });
          }

          const BASE_OPACITY = layoutModeRef.current === "hub" ? 0 : 0.28;
          clouds.forEach((cloud) => {
            const target = !hoverHighlightNodeId ? BASE_OPACITY : (activeCats.has(cloud.category) ? BASE_OPACITY : 0.0);
            cloud.opacity = THREE.MathUtils.lerp(cloud.opacity, target, 0.18);
            (cloud.points.material as THREE.PointsMaterial).opacity = cloud.opacity;
          });
        }

        // --- Node halos for hub layout ---
        if (nodeHalosRef.current && nodeHalosRef.current.length > 0) {
          const isHub = layoutModeRef.current === "hub";
          const halos = nodeHalosRef.current;
          halos.forEach((halo) => {
            let target = isHub ? 0.25 : 0;
            if (isHub && hoverHighlightNodeId) {
              const isHighlighted = halo.nodeId === hoverHighlightNodeId || firstDegreeSet.has(halo.nodeId);
              target = isHighlighted ? 0.25 : 0;
            }
            halo.opacity = THREE.MathUtils.lerp(halo.opacity, target, 0.12);
            const mat = halo.points.material as THREE.PointsMaterial;
            mat.opacity = halo.opacity;
            const baseSize = 22 + (halo.degreeRatio || 0) * 28;
            mat.size = THREE.MathUtils.lerp(mat.size, isHub ? baseSize : 0, 0.12);
          });
        }

        // --- Update each node ---
        const nodeDistances = new Map<string, number>();

        // Pre-compute unique category/relation colors once per frame to avoid
        // repeated Map lookups + new THREE.Color allocations in hot loops.
        const categoryColorMap = new Map<string, THREE.Color>();
        const defaultCatColor = new THREE.Color(configRef.current.particle.defaultColor);
        for (let i = 0; i < simNodes.length; i++) {
          const cat = simNodes[i].category || "";
          if (!categoryColorMap.has(cat)) {
            categoryColorMap.set(cat, new THREE.Color(getCategoryColor(cat, configRef.current.particle.categoryColors, configRef.current.particle.defaultColor)));
          }
        }
        const getColor = (cat: string): THREE.Color => categoryColorMap.get(cat) || defaultCatColor;

        const relationColorMap = new Map<string, THREE.Color>();
        const defaultRelColor = new THREE.Color(configRef.current.particle.defaultColor);
        for (let i = 0; i < simEdges.length; i++) {
          const rel = simEdges[i].relation || "";
          if (!relationColorMap.has(rel)) {
            relationColorMap.set(rel, new THREE.Color(getRelationColor(rel, configRef.current.particle.relationColors, configRef.current.particle.defaultColor)));
          }
        }
        const getRelColor = (rel: string): THREE.Color => relationColorMap.get(rel) || defaultRelColor;

        for (let idx = 0; idx < simNodes.length; idx++) {
          const node = simNodes[idx];
          // Lerp render positions
          node.rx = node.rx !== undefined ? THREE.MathUtils.lerp(node.rx, node.x || 0, 0.08) : (node.x || 0);
          node.ry = node.ry !== undefined ? THREE.MathUtils.lerp(node.ry, node.y || 0, 0.08) : (node.y || 0);
          node.rz = node.rz !== undefined ? THREE.MathUtils.lerp(node.rz, node.z || 0, 0.08) : (node.z || 0);

          _tmpVec3.set(node.rx, node.ry, node.rz);
          const inFrustum = _tmpFrustum.containsPoint(_tmpVec3);
          const distToCam = camera.position.distanceTo(_tmpVec3);
          nodeDistances.set(node.id, distToCam);

          // Scale mapping (compute raw scale first so the near-hide threshold
          // can scale with node visual size — small low-weight nodes need a
          // smaller threshold so they can be zoomed into before being hidden
          // as "front occluders", otherwise they vanish before becoming legible).
          const sizeFactor = configRef.current.particle.size / 0.040;
          const rawBaseScale = (node.computedSize ?? (((node.weight ?? 50) / 100) * 1.0 + 0.35)) * sizeFactor;
          // Large nodes occlude more aggressively -> hide earlier; small nodes
          // only hide when truly in the camera's face. Floor at 6 to avoid
          // the camera clipping plane.
          const nearHideThreshold = Math.max(6, rawBaseScale * 12);
          const nearFadeRange = 30;

          let isCulled = false;
          if (!inFrustum || distToCam > 500) isCulled = true;
          if (distToCam < nearHideThreshold) isCulled = true;
          const isMinor = (nodeDegreesRef.current.get(node.id) || 0) / Math.max(1, maxDegreeRef.current) < minorThreshold;
          if (isMinor && distToCam > 450) isCulled = true;
          culledNodes[idx] = isCulled ? 1 : 0;

          // Position & rotation (using pre-allocated dummy)
          _tmpDummy.position.copy(_tmpVec3);
          _tmpDummy.quaternion.copy(camera.quaternion);

          let baseScale = rawBaseScale;
          let nearScaleMultiplier = 1.0;
          if (distToCam < nearHideThreshold + nearFadeRange) {
            nearScaleMultiplier = Math.max(0, Math.min(1, (distToCam - nearHideThreshold) / nearFadeRange));
          }
          baseScale *= nearScaleMultiplier;

          let isHigh = false;
          let isFirstDegree = false;
          let isDimmed = false;
          if (hoverHighlightNodeId) {
            const isSelf = node.id === hoverHighlightNodeId;
            const isNeighbor = firstDegreeSet.has(node.id);
            if (isSelf) isHigh = true;
            else if (isNeighbor) isFirstDegree = true;
            else isDimmed = true;
          }

          // Smooth hover state interpolation
          if (node.hoverFactor === undefined) node.hoverFactor = 0.0;
          if (node.neighborFactor === undefined) node.neighborFactor = 0.0;
          if (node.dimFactor === undefined) node.dimFactor = 0.0;
          node.hoverFactor = THREE.MathUtils.lerp(node.hoverFactor, isHigh ? 1.0 : 0.0, 0.22);
          node.neighborFactor = THREE.MathUtils.lerp(node.neighborFactor, isFirstDegree ? 1.0 : 0.0, 0.22);
          node.dimFactor = THREE.MathUtils.lerp(node.dimFactor, isDimmed ? 1.0 : 0.0, 0.22);

          // LOD scale compression
          if (cameraDist > 240 && !isHigh) baseScale *= 0.8;
          if (isMinor) baseScale *= Math.max(0.65, 0.65 + 0.35 * lodAlpha);

          if (isCulled) {
            _tmpDummy.scale.set(0, 0, 0);
          } else {
            _tmpDummy.scale.set(baseScale, baseScale, baseScale);
          }
          _tmpDummy.updateMatrix();
          instancedMeshRef.current!.setMatrixAt(idx, _tmpDummy.matrix);

          // Color (using pre-allocated color object)
          _tmpNodeColor.copy(getColor(node.category || ""));
          let defaultB = cameraDist > 240 ? 1.15 : 1.4;
          const currentBrightness = (defaultB + 0.4 * node.hoverFactor) * (1.0 - node.dimFactor);
          _tmpNodeColor.multiplyScalar(currentBrightness);
          if (isMinor) _tmpNodeColor.multiplyScalar(0.50 + 0.50 * lodAlpha);
          instancedMeshRef.current!.setColorAt(idx, _tmpNodeColor);
        }

        // P1 fix: only mark the instance matrix dirty when node geometry actually
        // moved this frame. Color (lodAlpha/hover) still refreshes every frame
        // so the cloud brightness tracks the camera distance smoothly.
        // P2: skip color upload when camera, hover, and dim state are all static.
        const colorDirty = maxDimDelta > 0.005 || hoverChanged || Math.abs(prevCameraDistRef.current - cameraDist) > 0.5 || prevLodAlphaRef.current !== lodAlpha;
        prevCameraDistRef.current = cameraDist;
        prevLodAlphaRef.current = lodAlpha;
        if (needNodeMatrixWrite) {
          instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        }
        if (instancedMeshRef.current.instanceColor && colorDirty) {
          instancedMeshRef.current.instanceColor.needsUpdate = true;
        }

        // --- Update edges ---
        if (lineSegmentsRef.current && simEdges.length > 0) {
          const colorsAttr = lineSegmentsRef.current.geometry.getAttribute("color") as THREE.BufferAttribute;
          const posAttr = lineSegmentsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
          if (colorsAttr || posAttr) {
            // Edge geometry only needs position rewrite when node positions
            // actually changed (lerp settling), OR when dim/hover state changes
            // (edge shrinking effect depends on dimFactor).
            const needPositionRewrite = maxPosDelta > 0.01 || maxDimDelta > 0.005 || hoverChanged;

            let attrIdx = 0;
            for (let ei = 0; ei < simEdges.length; ei++) {
              const edge = simEdges[ei];
              const src = edge.source;
              const tgt = edge.target;
              if (!src || !tgt) continue;

              const isSrcMinor = (nodeDegreesRef.current.get(src.id) || 0) / Math.max(1, maxDegreeRef.current) < minorThreshold;
              const isTgtMinor = (nodeDegreesRef.current.get(tgt.id) || 0) / Math.max(1, maxDegreeRef.current) < minorThreshold;

              const relation = edge.relation || "";
              const relColor = getRelColor(relation);
              _tmpColorSrc.copy(relColor);
              _tmpColorTgt.copy(relColor);

              // Weight controls brightness: heavier edges are brighter
              const weightBrightness = 0.6 + (edge.weight / 100) * 0.8;

              const srcDim = src.dimFactor !== undefined ? src.dimFactor : 0.0;
              const tgtDim = tgt.dimFactor !== undefined ? tgt.dimFactor : 0.0;
              const edgeDim = Math.max(srcDim, tgtDim);
              const edgeOpacityMultiplier = 1.0 - edgeDim;

              const srcHover = src.hoverFactor !== undefined ? src.hoverFactor : 0.0;
              const tgtHover = tgt.hoverFactor !== undefined ? tgt.hoverFactor : 0.0;
              const edgeHover = Math.max(srcHover, tgtHover);

              // Hide dimmed edges completely (set to black)
              if (edgeDim > 0.5) {
                _tmpColorSrc.set(0, 0, 0);
                _tmpColorTgt.set(0, 0, 0);
              } else {
                const baseB = (1.5 + 0.5 * edgeHover) * weightBrightness;
                _tmpColorSrc.multiplyScalar(baseB * edgeOpacityMultiplier);
                _tmpColorTgt.multiplyScalar(baseB * edgeOpacityMultiplier);
              }

              if (isSrcMinor || isTgtMinor) {
                const edgeLOD = Math.max(0.65, 0.65 + 0.35 * lodAlpha);
                _tmpColorSrc.multiplyScalar(edgeLOD);
                _tmpColorTgt.multiplyScalar(edgeLOD);
              }

              if (needPositionRewrite) {
                // Bezier points for this edge (only recompute when geometry changed)
                const bPoints = getBezierPoints(
                  _tmpVec3.set(src.rx !== undefined ? src.rx : (src.x || 0), src.ry !== undefined ? src.ry : (src.y || 0), src.rz !== undefined ? src.rz : (src.z || 0)),
                  _tmpVec3b.set(tgt.rx !== undefined ? tgt.rx : (tgt.x || 0), tgt.ry !== undefined ? tgt.ry : (tgt.y || 0), tgt.rz !== undefined ? tgt.rz : (tgt.z || 0)),
                  8,
                  (src as SimNode).emissionDir,
                );

                _tmpMidPoint.addVectors(bPoints[0], bPoints[8]).multiplyScalar(0.5);

                for (let i = 0; i < 8; i++) {
                  let ptStart = bPoints[i];
                  let ptEnd = bPoints[i + 1];

                  if (edgeOpacityMultiplier < 0.99) {
                    ptStart = ptStart.clone().lerp(_tmpMidPoint, 1.0 - edgeOpacityMultiplier);
                    ptEnd = ptEnd.clone().lerp(_tmpMidPoint, 1.0 - edgeOpacityMultiplier);
                  }

                  if (posAttr && attrIdx + 1 < posAttr.count) {
                    posAttr.setXYZ(attrIdx, ptStart.x, ptStart.y, ptStart.z);
                    posAttr.setXYZ(attrIdx + 1, ptEnd.x, ptEnd.y, ptEnd.z);
                  }

                  const tStart = i / 8;
                  const tEnd = (i + 1) / 8;
                  _tmpColorStart.copy(_tmpColorSrc).lerp(_tmpColorTgt, tStart);
                  _tmpColorEnd.copy(_tmpColorSrc).lerp(_tmpColorTgt, tEnd);

                  if (colorsAttr && attrIdx + 1 < colorsAttr.count) {
                    colorsAttr.setXYZ(attrIdx, _tmpColorStart.r, _tmpColorStart.g, _tmpColorStart.b);
                    colorsAttr.setXYZ(attrIdx + 1, _tmpColorEnd.r, _tmpColorEnd.g, _tmpColorEnd.b);
                  }
                  attrIdx += 2;
                }
              } else {
                // Geometry static: only refresh colors (lodAlpha / hover lerp still affect brightness)
                for (let i = 0; i < 8; i++) {
                  const tStart = i / 8;
                  const tEnd = (i + 1) / 8;
                  _tmpColorStart.copy(_tmpColorSrc).lerp(_tmpColorTgt, tStart);
                  _tmpColorEnd.copy(_tmpColorSrc).lerp(_tmpColorTgt, tEnd);

                  if (colorsAttr && attrIdx + 1 < colorsAttr.count) {
                    colorsAttr.setXYZ(attrIdx, _tmpColorStart.r, _tmpColorStart.g, _tmpColorStart.b);
                    colorsAttr.setXYZ(attrIdx + 1, _tmpColorEnd.r, _tmpColorEnd.g, _tmpColorEnd.b);
                  }
                  attrIdx += 2;
                }
              }
              attrIdx += 0; // already incremented by 16 total
            }

            if (colorsAttr) colorsAttr.needsUpdate = true;
            if (posAttr && needPositionRewrite) posAttr.needsUpdate = true;
          }

          const mat = lineSegmentsRef.current.material as THREE.LineBasicMaterial;
          if (mat) {
            let baseLineOpacity = configRef.current.line.opacity;
            if (hoverHighlightNodeId) baseLineOpacity = 0.88;
            if (cameraDist > 240) {
              const minFade = hoverHighlightNodeId ? 0.35 : 0.22;
              mat.opacity = Math.max(minFade, baseLineOpacity * (1.0 - (cameraDist - 240) / 350));
            } else if (cameraDist < 110) {
              mat.opacity = Math.min(0.95, baseLineOpacity * 1.35);
            } else {
              mat.opacity = baseLineOpacity;
            }
          }
        }

        // --- Update labels ---
        if (labelsGroupRef.current) {
          const labelChildren = labelsGroupRef.current.children;
          for (let li = 0; li < labelChildren.length; li++) {
            const sprite: any = labelChildren[li];
            const node = simNodes[sprite.userData.nodeIdx];
            if (!node) continue;

            const isNodeCulled = culledNodes[sprite.userData.nodeIdx] === 1;
            const rx = node.rx !== undefined ? node.rx : (node.x || 0);
            const ry = node.ry !== undefined ? node.ry : (node.y || 0);
            const rz = node.rz !== undefined ? node.rz : (node.z || 0);

            _tmpVec3.set(rx, ry, rz);
            const distToCam = nodeDistances.get(node.id) ?? camera.position.distanceTo(_tmpVec3);

            const refDist = 180.0;
            const scaleExponent = 0.65;
            const distanceScale = Math.pow(distToCam / refDist, scaleExponent);
            const adaptiveScale = Math.max(0.4, Math.min(2.0, distanceScale));

            const sizeFactor = configRef.current.particle.size / 0.040;
            const rawBaseScale = (node.computedSize ?? (((node.weight ?? 50) / 100) * 1.0 + 0.35)) * sizeFactor;
            // Near fade threshold scales with node size (same as the node body),
            // so small low-weight nodes can be zoomed close before fading.
            const nearHideThreshold = Math.max(6, rawBaseScale * 12);
            const nearFadeRange = 30;
            let nearScaleMultiplier = 1.0;
            if (distToCam < nearHideThreshold + nearFadeRange) {
              nearScaleMultiplier = Math.max(0, Math.min(1, (distToCam - nearHideThreshold) / nearFadeRange));
            }
            let baseScale = rawBaseScale * nearScaleMultiplier;

            if (node.hoverFactor === undefined) node.hoverFactor = 0.0;
            if (node.neighborFactor === undefined) node.neighborFactor = 0.0;
            if (node.dimFactor === undefined) node.dimFactor = 0.0;

            const isMinor = (nodeDegreesRef.current.get(node.id) || 0) / Math.max(1, maxDegreeRef.current) < minorThreshold;
            if (isMinor) baseScale *= Math.max(0.5, 0.5 + 0.5 * lodAlpha);
            baseScale *= adaptiveScale;

            const nodeRadius = 2.0 * baseScale;
            sprite.position.set(rx, ry + nodeRadius + 0.15, rz);

            const aspect = sprite.material.map ? sprite.material.map.image.width / sprite.material.map.image.height : 1.5;
            // Label height floor: low-weight nodes get a minimum readable label size
            // when zoomed in, instead of scaling strictly with (tiny) baseScale.
            // The floor is only meaningful up close (nearScaleMultiplier high);
            // far away the distance-based fade still shrinks minor labels.
            // labelScale is a user-tunable multiplier (ControlPanel slider).
            const labelScale = (configRef.current.interaction as any).labelScale ?? 1.0;
            const minLabelHeight = 1.6 * labelScale;
            let labelHeight = Math.max(minLabelHeight, 2.6 * baseScale * labelScale);
            // Don't let the floor inflate labels when zoomed out (nearScaleMultiplier≈0)
            labelHeight *= nearScaleMultiplier > 0.5 ? 1.0 : nearScaleMultiplier * 2;
            sprite.scale.set(labelHeight * aspect, labelHeight, 1);

            let opacity = 1.0;
            opacity *= nearScaleMultiplier;
            const meta = nodeParticlesMetaRef.current[sprite.userData.nodeIdx];
            const degree = meta ? meta.degree : 0;
            const maxDegree = meta ? meta.maxDegree : 1;
            const relevance = ((node.weight ?? 50) / 100) * 0.45 + (degree / maxDegree) * 0.55;

            if (cameraDist > 320) {
              if (relevance < 0.55) {
                opacity = 0;
              } else {
                opacity = Math.max(0, 1.0 - (cameraDist - 320) / 200);
              }
            } else if (cameraDist < 140) {
              opacity = 1.0;
            } else {
              const zoomFactor = (cameraDist - 140) / 180;
              opacity = Math.max(0.15, 1.0 - zoomFactor * (1.1 - relevance));
            }

            opacity *= (1.0 - node.dimFactor);
            if (node.hoverFactor > 0.01) opacity = THREE.MathUtils.lerp(opacity, 1.0, node.hoverFactor);
            if (node.neighborFactor > 0.01) opacity = THREE.MathUtils.lerp(opacity, Math.max(opacity, 1.0), node.neighborFactor);
            if (isMinor) opacity *= Math.max(0.2, 0.2 + 0.8 * lodAlpha);

            sprite.material.opacity = opacity;
            sprite.visible = opacity > 0.02 && !isNodeCulled;
          }
        }
      }

      renderer.render(scene, camera);
    };

    tick();

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      if (canvasRef.current) {
        canvasRef.current.removeEventListener("mousemove", pointerHandlers.onPointerMove);
        canvasRef.current.removeEventListener("pointerdown", pointerHandlers.onPointerDown);
        canvasRef.current.removeEventListener("pointerup", pointerHandlers.onPointerUp);
        canvasRef.current.removeEventListener("webglcontextlost", onContextLost);
      }
      cleanupScene(scene, labelsGroupRef, instancedMeshRef, lineSegmentsRef, nebulaCloudsRef, nodeHaloGroupRef, nodeHalosRef);
      nebulaGroupRef.current = null;
      // P0 fix: clear recording interval if active when the scene unmounts /
      // dataset switches, otherwise it keeps ticking and mutates stale state.
      if (recordingTimeoutRef.current) {
        clearInterval(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      renderer.dispose();
    };
  }, [activeNodes, activeEdges]);

  // Hide/show scene objects when filter empties or restores the node list
  useEffect(() => {
    const isEmpty = activeNodes.length === 0;
    if (instancedMeshRef.current) instancedMeshRef.current.visible = !isEmpty;
    if (lineSegmentsRef.current) lineSegmentsRef.current.visible = !isEmpty;
    if (nebulaGroupRef.current) nebulaGroupRef.current.visible = !isEmpty;
    if (nodeHaloGroupRef.current) nodeHaloGroupRef.current.visible = !isEmpty;
    if (labelsGroupRef.current) labelsGroupRef.current.visible = !isEmpty;
  }, [activeNodes]);

  // Handle Preset Camera Actions
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || simNodesRef.current.length === 0) return;

    if (presetCameraTrigger) {
      const startPos = cameraRef.current.position.clone();
      const startLook = controlsRef.current.target.clone();
      const endLook = new THREE.Vector3(0, 0, 0);
      const endPos = new THREE.Vector3();
      const R = 280;
      if (presetCameraTrigger === "俯瞰") {
        endPos.set(0.1, R, 0.1);
      } else if (presetCameraTrigger === "正面") {
        endPos.set(0, 0, R);
      } else if (presetCameraTrigger === "侧面") {
        endPos.set(R, 0, 0.1);
      } else {
        endPos.set(R * 0.7, R * 0.5, R * 0.7);
      }

      cameraFlightRef.current = { startPos, endPos, startLook, endLook, progress: 0, duration: 30 };
      onClearPresetCamera();
    }
  }, [presetCameraTrigger]);

  // ===== Rebuild nebula + halos when layout mode changes =====
  useEffect(() => {
    if (!sceneRef.current || simNodesRef.current.length === 0) return;
    const scene = sceneRef.current;

    // --- Rebuild nebula: needed because clustered layout uses clusterMeta positions ---
    if (nebulaGroupRef.current) {
      scene.remove(nebulaGroupRef.current);
      nebulaGroupRef.current = null;
    }
    if (nebulaCloudsRef.current) {
      nebulaCloudsRef.current.forEach((cloud) => {
        cloud.points.geometry.dispose();
        const mat = cloud.points.material as THREE.PointsMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
      nebulaCloudsRef.current = null;
    }
    const nebulaResult = createNebula(
      simNodesRef.current,
      configRef.current,
      layoutModeRef.current === "clustered" ? getLastClusterMeta() : undefined
    );
    if (nebulaResult.group) {
      scene.add(nebulaResult.group);
      nebulaGroupRef.current = nebulaResult.group;
    }
    nebulaCloudsRef.current = nebulaResult.clouds;

    // --- Rebuild halos: only for hub layout ---
    if (nodeHalosRef.current) {
      nodeHalosRef.current.forEach((halo) => {
        scene.remove(halo.points);
        halo.points.geometry.dispose();
        const mat = halo.points.material as THREE.PointsMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
      nodeHalosRef.current = null;
    }
    if (nodeHaloGroupRef.current) {
      scene.remove(nodeHaloGroupRef.current);
      nodeHaloGroupRef.current = null;
    }
    if (layoutModeRef.current === "hub" && simNodesRef.current.length > 0) {
      const haloResult = createNodeHalos(
        simNodesRef.current,
        nodeParticlesMetaRef.current.reduce((map, m, i) => {
          map.set(simNodesRef.current[i].id, m.degree);
          return map;
        }, new Map<string, number>()),
        nodeParticlesMetaRef.current[0]?.maxDegree || 1,
        configRef.current
      );
      scene.add(haloResult.group);
      nodeHaloGroupRef.current = haloResult.group;
      nodeHalosRef.current = haloResult.halos;
    }
  }, [layoutMode]);

  // Edge hover detection via closest-point-on-segment
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const camera = cameraRef.current;
    if (!camera) return;

    const _edgeVec3 = new THREE.Vector3();

    let pendingEdgeEvent: MouseEvent | null = null;
    let edgeRafId: number | null = null;

    const processEdgeHover = (e: MouseEvent) => {
      if (simNodesRef.current.length === 0) { setHoveredEdge(null); return; }
      const edges = simEdgesRef.current;
      if (!edges || edges.length === 0) { setHoveredEdge(null); return; }

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let bestDist = 40;
      let bestEdge: typeof edges[0] | null = null;

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const src = edge.source;
        const tgt = edge.target;
        if (!src || !tgt) continue;

        const srcDim = (src as SimNode).dimFactor ?? 0;
        const tgtDim = (tgt as SimNode).dimFactor ?? 0;
        if (srcDim > 0.5 || tgtDim > 0.5) continue;

        const sx = src.rx ?? src.x ?? 0;
        const sy = src.ry ?? src.y ?? 0;
        const sz = src.rz ?? src.z ?? 0;
        const tx = tgt.rx ?? tgt.x ?? 0;
        const ty = tgt.ry ?? tgt.y ?? 0;
        const tz = tgt.rz ?? tgt.z ?? 0;

        _edgeVec3.set(sx, sy, sz).project(camera);
        const ax = (_edgeVec3.x * 0.5 + 0.5) * rect.width;
        const ay = (-_edgeVec3.y * 0.5 + 0.5) * rect.height;

        _edgeVec3.set(tx, ty, tz).project(camera);
        const bx = (_edgeVec3.x * 0.5 + 0.5) * rect.width;
        const by = (-_edgeVec3.y * 0.5 + 0.5) * rect.height;

        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((mx - ax) * dx + (my - ay) * dy) / lenSq : 0.5;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx, cy = ay + t * dy;
        const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

        if (dist < bestDist) {
          bestDist = dist;
          bestEdge = edge;
        }
      }

      if (bestEdge) {
        setHoveredEdge({
          relation: bestEdge.relation || "未知",
          weight: bestEdge.weight,
          source: bestEdge.source.name || bestEdge.source.id,
          target: bestEdge.target.name || bestEdge.target.id,
          x: mx,
          y: my,
        });
      } else {
        setHoveredEdge(null);
      }
    };

    const onEdgeMouseMove = (e: MouseEvent) => {
      pendingEdgeEvent = e;
      if (edgeRafId !== null) return;
      edgeRafId = requestAnimationFrame(() => {
        edgeRafId = null;
        if (!pendingEdgeEvent) return;
        const ev = pendingEdgeEvent;
        pendingEdgeEvent = null;
        processEdgeHover(ev);
      });
    };

    const onEdgeMouseLeave = () => {
      setHoveredEdge(null);
      pendingEdgeEvent = null;
      if (edgeRafId !== null) {
        cancelAnimationFrame(edgeRafId);
        edgeRafId = null;
      }
    };

    canvas.addEventListener("mousemove", onEdgeMouseMove);
    canvas.addEventListener("mouseleave", onEdgeMouseLeave);
    return () => {
      canvas.removeEventListener("mousemove", onEdgeMouseMove);
      canvas.removeEventListener("mouseleave", onEdgeMouseLeave);
      if (edgeRafId !== null) {
        cancelAnimationFrame(edgeRafId);
        edgeRafId = null;
      }
    };
  }, [activeEdges]);

  // Video Recording (MP4 preferred, WebM fallback)
  const startRecording = () => {
    if (!canvasRef.current) return;
    setIsRecording(true);
    adaptivePausedRef.current = true;
    setRecordTimeLeft(recordingPresetDuration);

    const stream = canvasRef.current.captureStream(30);

    // Prefer MP4/H.264 for universal compatibility; fall back to WebM if unsupported
    let options = { mimeType: "video/mp4;codecs=h264" };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: "video/mp4" };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: "video/webm;codecs=h264" };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: "video/webm;codecs=vp9" };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: "video/webm" };
    }

    try {
      const chunks: Blob[] = [];
      const mediaRecorder = MediaRecorder.isTypeSupported(options.mimeType)
        ? new MediaRecorder(stream, options)
        : new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const isWebM = mediaRecorder.mimeType && mediaRecorder.mimeType.includes("webm");
        const fileExt = isWebM ? "webm" : "mp4";
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `node-orbit-${Date.now()}.${fileExt}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        adaptivePausedRef.current = false;
        setIsRecording(false);
      };

      mediaRecorder.start();

      const interval = setInterval(() => {
        setRecordTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
              mediaRecorderRef.current.stop();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      recordingTimeoutRef.current = interval;
    } catch (err) {
      console.error("Recording failed to start:", err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recordingTimeoutRef.current) clearInterval(recordingTimeoutRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    adaptivePausedRef.current = false;
    setIsRecording(false);
  };

  // High quality PNG screenshot
  const captureScreenshot = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `node-orbit-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Tooltip position with boundary detection ---
  const tooltipStyle = (() => {
    if (!hoveredPos) return {};
    const tooltipWidth = 208; // w-52 = 13rem = 208px
    const tooltipHeight = 120;
    const containerW = containerRef.current?.clientWidth || 800;
    const containerH = containerRef.current?.clientHeight || 600;
    let left = hoveredPos.x + 15;
    let top = hoveredPos.y + 15;
    if (left + tooltipWidth > containerW) left = hoveredPos.x - tooltipWidth - 15;
    if (top + tooltipHeight > containerH) top = hoveredPos.y - tooltipHeight - 15;
    return { left: `${Math.max(0, left)}px`, top: `${Math.max(0, top)}px` };
  })();

  return (
    <div id="graph-container-wrapper" className="relative w-full h-full" ref={containerRef}>
      {/* WebGL not supported fallback */}
      {webglError ? (
        <div className="w-full h-full flex items-center justify-center bg-[#020204] text-center">
          <div className="space-y-3">
            <div className="text-2xl">⚠️</div>
            <p className="text-slate-400 text-sm">
              您的浏览器不支持 WebGL，无法渲染 3D 图谱。<br />
              请使用 Chrome、Firefox 或 Edge 等现代浏览器。
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* 3D WebGL Canvas */}
          <canvas id="three-webgl-canvas" ref={canvasRef} className="w-full h-full block" />

          {/* Hover Node Tooltip (with boundary detection) */}
          {hoveredNode && hoveredPos && !hoveredEdge && (
            <div
              id="node-hover-tooltip"
              className="absolute z-20 bg-slate-950/95 border border-slate-800 text-white text-xs rounded-lg p-3 shadow-2xl pointer-events-none transition-all duration-150 backdrop-blur-md w-52"
              style={tooltipStyle}
            >
              <div className="flex items-center gap-2 border-b border-slate-900 pb-1.5 mb-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor:
                      getCategoryColor(hoveredNode.category || "", config.particle.categoryColors, config.particle.defaultColor),
                  }}
                />
                <span className="font-bold text-slate-100">{hoveredNode.name}</span>
                <span className="ml-auto text-[12px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded font-mono" style={{ color: getCategoryColor(hoveredNode.category || "", config.particle.categoryColors, config.particle.defaultColor) }}>
                  {hoveredNode.category || "未分类"}
                </span>
              </div>
              <div className="flex justify-between text-[12px] text-slate-400 font-mono">
                <span>核心影响力指数:</span>
                <span className="text-amber-400 font-bold">{hoveredNode.weight}</span>
              </div>
              <p className="text-[12px] text-slate-500 mt-2 italic leading-relaxed">
                点击该节点可聚焦、高亮与其关联的一阶社会关系
              </p>
            </div>
          )}

          {/* Hover Edge Tooltip */}
          {hoveredEdge && (
            <div
              id="edge-hover-tooltip"
              className="absolute z-20 bg-slate-950/95 border border-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-2xl pointer-events-none backdrop-blur-md"
              style={{ left: hoveredEdge.x + 12, top: hoveredEdge.y - 10 }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-bold text-slate-100">{hoveredEdge.source}</span>
                <span className="text-slate-500">→</span>
                <span className="font-bold text-slate-100">{hoveredEdge.target}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-slate-400">关系: <span style={{ color: getRelationColor(hoveredEdge.relation, configRef.current.particle.relationColors, configRef.current.particle.defaultColor) }}>{hoveredEdge.relation}</span></span>
                <span className="text-slate-400">关系强度: <span className="text-amber-400">{hoveredEdge.weight}</span></span>
              </div>
            </div>
          )}
          {isRecording && (
            <div
              id="recording-banner"
              className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600/90 border border-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2.5 shadow-[0_0_15px_rgba(239,68,68,0.55)] text-xs animate-pulse font-mono z-30"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              <span>正在录制高清 3D 动画中: {recordTimeLeft}s...</span>
              <button
                onClick={stopRecording}
                className="ml-2 bg-black hover:bg-slate-900 text-white rounded px-2 py-0.5 text-[12px] transition font-sans font-medium"
              >
                完成
              </button>
            </div>
          )}

          {/* Bottom Floating Visual Utilities */}
          <div id="bottom-canvas-toolbar" className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
            {/* Preset Record Durations */}
            {!isRecording ? (
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-1 text-[12px] text-slate-400 font-mono">
                <span className="px-1.5 text-slate-500">录制</span>
                {[5, 10, 15].map((d) => (
                  <button
                    key={d}
                    onClick={() => setRecordingPresetDuration(d)}
                    className={`px-2 py-1 rounded transition ${
                      recordingPresetDuration === d
                        ? "bg-slate-800 text-slate-100 font-bold"
                        : "hover:text-slate-200"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            ) : null}

            {/* Video Recorder Trigger (MP4 preferred) */}
            <button
              id="btn-record-mp4"
              onClick={isRecording ? stopRecording : startRecording}
              title="录制高清 MP4 视频"
              className={`h-9 px-3.5 rounded-lg flex items-center gap-2 text-xs transition font-medium ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20 animate-pulse"
                  : "bg-slate-950 hover:bg-slate-900 text-slate-200 border border-slate-800 hover:border-slate-700"
              }`}
            >
              {isRecording ? <Square size={13} className="fill-white" /> : <Video size={13} />}
              <span>{isRecording ? "停止录制" : "录制视频"}</span>
            </button>

            {/* High-res PNG Screenshot */}
            <button
              id="btn-capture-png"
              onClick={captureScreenshot}
              title="保存当前高清 3D 视口为 PNG"
              className="h-9 px-3.5 rounded-lg bg-slate-950 hover:bg-slate-900 text-slate-200 border border-slate-800 hover:border-slate-700 flex items-center gap-2 text-xs transition font-medium"
            >
              <Camera size={13} />
              <span>保存图片</span>
            </button>
          </div>

          {/* Tutorial overlay */}
          <div id="control-tutorial-overlay" className="absolute bottom-4 left-4 bg-slate-950/70 backdrop-blur-sm border border-slate-800/80 rounded-lg py-1.5 px-3 text-[12px] text-slate-400 font-mono pointer-events-none select-none flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse" />
            <span>左键拖拽旋转 · 滚轮缩放 · 右键平移 · 点击节点高亮</span>
          </div>
        </>
      )}
    </div>
  );
}

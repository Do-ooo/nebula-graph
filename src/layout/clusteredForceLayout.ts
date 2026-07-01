import {
  LayoutEngine,
  LayoutInput,
  LayoutResult,
  SimNode,
  SimEdge,
  buildSimEdges,
  computeDegrees,
  baseSizeFromWeight,
  resolvePrevPosition,
  computeEmissionDirs,
} from "./types";

/**
 * ============================================================
 * 方案3 v3: Clustered Force Layout — 共圆心辐射聚类
 * ============================================================
 *
 * 核心设计:
 *   1. 共圆心: 所有 category 从同一个原点辐射, 锚点均匀分布在球面上
 *   2. 类内聚合: 同 category 节点聚在锚点方向, 同类排斥防粘 + 弹簧拉近
 *   3. 不糊成一片: 去掉类间排斥 (方案1的问题: 全节点互斥 → 同类也散开)
 *   4. 锚点强锁定: 方案1锚点力仅0.012, 节点轻易飘走; 这里加强到 0.045
 *   5. 无硬边界: 整体自然形成大致球形, 不强制压进一个球
 *   6. 星云跟随: ClusterMeta 从实际节点分布计算
 */

// ── Exported metadata for downstream consumers (nebula, etc.) ──
export interface ClusterMeta {
  category: string;
  cx: number; cy: number; cz: number;
  radius: number;
}

let _lastClusterMeta: ClusterMeta[] = [];
export function getLastClusterMeta(): ClusterMeta[] {
  return _lastClusterMeta;
}

/**
 * Fibonacci sphere for category anchors.
 * Moderate radius — categories spread from center but share the same origin.
 * Slightly smaller than grouped layout (which uses 100 + √N×5) to bring things
 * a bit closer while still maintaining clear directional separation.
 */
function computeCategoryAnchors(
  categories: string[],
  nodeCount: number,
): Map<string, { x: number; y: number; z: number }> {
  const anchors = new Map<string, { x: number; y: number; z: number }>();
  const n = categories.length;
  if (n === 0) return anchors;

  // Compact anchor radius: scales more aggressively for small datasets
  // so nodes stay dense and readable without excessive zooming.
  // 54 nodes → ~47, 200 → ~92, 400 → ~115
  const anchorRadius = 15 + Math.sqrt(nodeCount) * 5;

  categories.forEach((cat, index) => {
    const phi = Math.acos(-1 + (2 * index + 1) / n);
    const theta = Math.sqrt(n * Math.PI) * phi;
    anchors.set(cat, {
      x: anchorRadius * Math.sin(phi) * Math.cos(theta),
      y: anchorRadius * Math.sin(phi) * Math.sin(theta),
      z: anchorRadius * Math.cos(phi),
    });
  });

  return anchors;
}

export const clusteredForceLayout: LayoutEngine = {
  name: "聚类星云视图",

  compute(input: LayoutInput): LayoutResult {
    const { nodes: activeNodes, edges: activeEdges, config, prevPositions } = input;

    // ── Phase A: Category analysis ──

    const categoryMap = new Map<string, string[]>();
    activeNodes.forEach((n) => {
      const cat = (n.category as string) || "__uncategorized__";
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(n.id);
    });

    const uniqueCategories = Array.from(categoryMap.keys()).filter(
      (c) => c !== "__uncategorized__"
    );
    const categorySizes = new Map<string, number>();
    categoryMap.forEach((ids, cat) => categorySizes.set(cat, ids.length));

    const anchors = computeCategoryAnchors(uniqueCategories, activeNodes.length);

    // Node → category anchor lookup
    const nodeAnchor = new Map<string, { x: number; y: number; z: number }>();
    activeNodes.forEach((n) => {
      const cat = (n.category as string) || "";
      const a = anchors.get(cat);
      if (a) nodeAnchor.set(n.id, a);
    });

    // ── Phase B: Initialize nodes ──

    // Compute degree early so it can influence computedSize
    const { nodeDegrees, maxDegree } = computeDegrees(activeNodes, activeEdges);

    const simNodes: SimNode[] = activeNodes.map((n) => {
      const degree = nodeDegrees.get(n.id) || 0;
      const degreeRatio = maxDegree > 0 ? degree / maxDegree : 0;
      const weightSize = baseSizeFromWeight(n.weight);
      // Blend: weight provides base, degree scales 0.4×–1.0×
      // Orphan (degree=0) → 40% of weight size; max degree → full weight size
      const computedSize = weightSize * (0.4 + 0.6 * degreeRatio);

      const prev = resolvePrevPosition(n.id, prevPositions);
      if (prev) {
        return {
          ...n,
          x: prev.x, y: prev.y, z: prev.z,
          rx: prev.x, ry: prev.y, rz: prev.z,
          vx: 0, vy: 0, vz: 0,
          hoverFactor: 0, neighborFactor: 0, dimFactor: 0,
          computedSize,
          emissionDir: null,
        };
      }

      const anchor = nodeAnchor.get(n.id);
      // Initialize around the category anchor
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const maxR = 20 + Math.random() * 15;
      const r = maxR * Math.cbrt(Math.random());
      let x = r * Math.sin(phi) * Math.cos(theta);
      let y = r * Math.sin(phi) * Math.sin(theta);
      let z = r * Math.cos(phi);
      if (anchor) { x += anchor.x; y += anchor.y; z += anchor.z; }

      return {
        ...n,
        x, y, z,
        rx: x, ry: y, rz: z,
        vx: 0, vy: 0, vz: 0,
        hoverFactor: 0, neighborFactor: 0, dimFactor: 0,
        computedSize,
        emissionDir: null,
      };
    });

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const simEdges: SimEdge[] = buildSimEdges(activeEdges, nodeMap);

    // Pre-compute edge category relationship
    const edgeMeta = simEdges.map((e) => {
      const srcCat = (e.source as SimNode).category || "";
      const tgtCat = (e.target as SimNode).category || "";
      return { edge: e, sameCategory: srcCat === tgtCat };
    });

    // ── Phase B: Force simulation ──

    const ticks = 200;
    const charge = config.charge ?? -300;
    const linkStrength = config.linkStrength ?? 0.055;
    const linkDistance = config.linkDistance ?? 40;

    // KEY DIFFERENCE from grouped layout:
    //   Grouped: ALL nodes repel each other → same-category nodes also scatter
    //   Clustered: only same-category nodes repel → tighter clustering without cross-cat push
    const sameCatRepulsion = charge * 0.15;     // ~-45, prevents sticking
    // Cross-category: NO repulsion — let them naturally fill space
    const sameCatSpringStr = linkStrength * 0.15;  // moderate intra-cat spring
    const crossCatSpringStr = linkStrength * 0.05; // weak inter-cat spring
    const anchorPinStrength = 0.045;               // STRONG (grouped: 0.012, v2: 0.025)
    const globalCenterPull = 0.005;                // mild pull toward origin
    const damping = 0.82;

    for (let step = 0; step < ticks; step++) {
      const alpha = 1.0 - (step / ticks) * 0.6;

      // 1. Same-category repulsion only
      for (let i = 0; i < simNodes.length; i++) {
        const n1 = simNodes[i];
        const cat1 = n1.category || "";
        for (let j = i + 1; j < simNodes.length; j++) {
          const n2 = simNodes[j];
          const cat2 = n2.category || "";

          if (cat1 !== cat2) continue;

          const dx = n1.x! - n2.x!;
          const dy = n1.y! - n2.y!;
          const dz = n1.z! - n2.z!;
          const distSq = dx * dx + dy * dy + dz * dz + 0.1;

          if (distSq > 6400) continue; // 80² cutoff

          const dist = Math.sqrt(distSq);
          const distSqClamped = Math.max(16.0, distSq);
          const distClamped = Math.sqrt(distSqClamped);

          const falloff = 1.0 - dist / 80;
          const force = (sameCatRepulsion / distSqClamped) * falloff * alpha;

          const fx = (dx / distClamped) * force;
          const fy = (dy / distClamped) * force;
          const fz = (dz / distClamped) * force;

          n1.vx! -= fx; n1.vy! -= fy; n1.vz! -= fz;
          n2.vx! += fx; n2.vy! += fy; n2.vz! += fz;
        }
      }

      // 2. Spring attraction along edges
      for (const { edge, sameCategory } of edgeMeta) {
        const n1 = edge.source as SimNode;
        const n2 = edge.target as SimNode;
        const dx = n1.x! - n2.x!;
        const dy = n1.y! - n2.y!;
        const dz = n1.z! - n2.z!;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;

        const restLength = sameCategory
          ? linkDistance * 0.65
          : linkDistance * 1.3;
        const strength = sameCategory ? sameCatSpringStr : crossCatSpringStr;

        const force = (dist - restLength) * strength * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        n1.vx! -= fx; n1.vy! -= fy; n1.vz! -= fz;
        n2.vx! += fx; n2.vy! += fy; n2.vz! += fz;
      }

      // 3. Anchor pin + global center pull + integration
      for (const node of simNodes) {
        const anchor = nodeAnchor.get(node.id);
        if (anchor) {
          // Strong pull toward category anchor — keeps nodes in their sector
          const dx = node.x! - anchor.x;
          const dy = node.y! - anchor.y;
          const dz = node.z! - anchor.z;
          node.vx! -= dx * anchorPinStrength * alpha;
          node.vy! -= dy * anchorPinStrength * alpha;
          node.vz! -= dz * anchorPinStrength * alpha;
        }

        // Mild global center pull (prevents far drift)
        node.vx! -= node.x! * globalCenterPull * alpha;
        node.vy! -= node.y! * globalCenterPull * alpha;
        node.vz! -= node.z! * globalCenterPull * alpha;

        // Integration
        node.x! += node.vx!;
        node.y! += node.vy!;
        node.z! += node.vz!;
        node.vx! *= damping;
        node.vy! *= damping;
        node.vz! *= damping;
      }
    }

    // No hard boundary — the natural forces already form a roughly spherical shape.

    // ── Phase C: Compute cluster meta from actual node positions ──
    const clusterMeta: ClusterMeta[] = [];
    const catNodeGroups = new Map<string, SimNode[]>();
    simNodes.forEach((n) => {
      const cat = (n.category as string) || "";
      if (!catNodeGroups.has(cat)) catNodeGroups.set(cat, []);
      catNodeGroups.get(cat)!.push(n);
    });

    catNodeGroups.forEach((nodes, cat) => {
      if (!cat || cat === "__uncategorized__") return;
      const cx = nodes.reduce((s, n) => s + (n.x || 0), 0) / nodes.length;
      const cy = nodes.reduce((s, n) => s + (n.y || 0), 0) / nodes.length;
      const cz = nodes.reduce((s, n) => s + (n.z || 0), 0) / nodes.length;

      let maxDist = 0;
      nodes.forEach((n) => {
        const dx = (n.x || 0) - cx;
        const dy = (n.y || 0) - cy;
        const dz = (n.z || 0) - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxDist) maxDist = d;
      });

      clusterMeta.push({
        category: cat,
        cx, cy, cz,
        radius: maxDist * 1.2 + 3,
      });
    });

    _lastClusterMeta = clusterMeta;

    computeEmissionDirs(simNodes, simEdges);
    return { simNodes, simEdges, nodeDegrees, maxDegree };
  },
};

import { GraphNode, GraphEdge, ForceConfig, SimNode as BaseSimNode, SimEdge } from "../types";

export type LayoutMode = "hub" | "clustered" | "radial";

export interface LayoutInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  config: ForceConfig;
  /** Used for smooth position continuity when the graph data changes. */
  prevPositions: Map<string, { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }>;
  /** Optional root node id for radial / tree layouts. */
  rootNodeId?: string;
  /** Spatial scale of the layout. */
  bounds?: number;
}

export interface LayoutResult {
  simNodes: SimNode[];
  simEdges: SimEdge[];
  nodeDegrees: Map<string, number>;
  maxDegree: number;
}

/** Runtime node produced by a layout engine. */
export interface SimNode extends BaseSimNode {}

export type { SimEdge } from "../types";

export interface LayoutEngine {
  name: string;
  compute(input: LayoutInput): LayoutResult;
}

export const DEFAULT_BOUNDS = 140;

/** Base visual size helper used by all engines. */
export function baseSizeFromWeight(weight: number): number {
  return (weight / 100) * 1.0 + 0.35;
}

/** Resolve node positions from the previous layout run to keep transitions smooth. */
export function resolvePrevPosition(
  id: string,
  prevPositions: Map<string, { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }>
): { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number } | null {
  const prev = prevPositions.get(id);
  if (!prev) return null;
  return { x: prev.x, y: prev.y, z: prev.z };
}

/** Build simEdges from graph edges and the simNodes lookup map. */
export function buildSimEdges(
  edges: GraphEdge[],
  nodeMap: Map<string, SimNode>
): SimEdge[] {
  return edges
    .map((e) => {
      const sourceNode = nodeMap.get(e.source);
      const targetNode = nodeMap.get(e.target);
      if (!sourceNode || !targetNode) return null;
      return { source: sourceNode, target: targetNode, weight: e.weight, relation: e.relation };
    })
    .filter(Boolean) as SimEdge[];
}

/** Compute node degrees and max degree from a list of edges. */
export function computeDegrees(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodeDegrees: Map<string, number>; maxDegree: number } {
  const nodeDegrees = new Map<string, number>();
  nodes.forEach((n) => nodeDegrees.set(n.id, 0));
  edges.forEach((e) => {
    if (nodeDegrees.has(e.source)) nodeDegrees.set(e.source, nodeDegrees.get(e.source)! + 1);
    if (nodeDegrees.has(e.target)) nodeDegrees.set(e.target, nodeDegrees.get(e.target)! + 1);
  });
  let maxDegree = 1;
  nodeDegrees.forEach((deg) => {
    if (deg > maxDegree) maxDegree = deg;
  });
  return { nodeDegrees, maxDegree };
}

export interface LayoutRegistry {
  get(mode: LayoutMode): LayoutEngine;
  list(): { mode: LayoutMode; name: string }[];
}

/** Compute each node's preferred emission direction as the normalized
 *  vector from the node itself toward the centroid of its neighbours.
 *  Used by the renderer for the "flashlight" edge-bundling effect:
 *  edges from the same node all start along this direction. */
export function computeEmissionDirs(simNodes: SimNode[], simEdges: SimEdge[]) {
  const neighborSum = new Map<string, { x: number; y: number; z: number; count: number }>();
  simNodes.forEach(n => neighborSum.set(n.id, { x: 0, y: 0, z: 0, count: 0 }));

  simEdges.forEach(e => {
    const src = e.source as SimNode;
    const tgt = e.target as SimNode;
    // Direction FROM src TO tgt
    const s = neighborSum.get(src.id);
    if (s) { s.x += (tgt.x || 0) - (src.x || 0); s.y += (tgt.y || 0) - (src.y || 0); s.z += (tgt.z || 0) - (src.z || 0); s.count++; }
    // Direction FROM tgt TO src
    const t = neighborSum.get(tgt.id);
    if (t) { t.x += (src.x || 0) - (tgt.x || 0); t.y += (src.y || 0) - (tgt.y || 0); t.z += (src.z || 0) - (tgt.z || 0); t.count++; }
  });

  simNodes.forEach(n => {
    const sum = neighborSum.get(n.id);
    if (sum && sum.count > 0) {
      // Average direction (already a relative vector, just normalize)
      const ax = sum.x / sum.count;
      const ay = sum.y / sum.count;
      const az = sum.z / sum.count;
      const len = Math.sqrt(ax * ax + ay * ay + az * az);
      if (len > 0.001) {
        n.emissionDir = { x: ax / len, y: ay / len, z: az / len };
        return;
      }
    }
    // isolated node: random direction fallback
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * 2 * Math.PI;
    n.emissionDir = {
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.cos(phi),
      z: Math.sin(phi) * Math.sin(theta),
    };
  });
}

export function createLayoutRegistry(engines: Record<LayoutMode, LayoutEngine>): LayoutRegistry {
  return {
    get(mode: LayoutMode) {
      return engines[mode] ?? engines.hub;
    },
    list() {
      return (Object.keys(engines) as LayoutMode[]).map((mode) => ({
        mode,
        name: engines[mode].name,
      }));
    },
  };
}

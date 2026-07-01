export interface GraphNode {
  id: string;
  name: string;
  category?: string;
  weight: number; // 0-100
  // Position coordinates added by force layout
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface GraphEdge {
  source: string; // id
  target: string; // id
  relation?: string;
  weight: number; // 0-100
}

export interface GraphMeta {
  title?: string;
  description?: string;
  /** Internal: preserved raw import data for structural category restoration */
  _rawImport?: {
    names: string[];               // original node display names
    structuralCategories: string[]; // jLouvain-assigned categories
    hasOriginalCategories: boolean; // whether the CSV had a category column
  };
}

export interface GraphData {
  meta?: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ParticleConfig {
  count: number; // reserved: intended particles per cluster (currently fixed at 75 internally)
  size: number;
  categoryColors: Record<string, string>;
  relationColors: Record<string, string>;
  defaultColor: string;
  bloomIntensity: number; // reserved: not yet wired to a postprocessing pipeline
  floatAnimation: boolean; // reserved: not yet implemented
}

export interface LineConfig {
  minWidth: number; // reserved: not yet used (thickness is derived from weight)
  maxWidth: number; // reserved: not yet used
  opacity: number;
}

export interface ForceConfig {
  charge: number;
  linkDistance: number;
  linkStrength: number;
}

export interface InteractionConfig {
  enableZoom: boolean;
  enableRotate: boolean;
  enablePan: boolean;
  autoRotate: boolean;
  presetCameras: string[];
  labelScale: number; // multiplier for node label size (1.0 = default)
}

export interface ExportConfig {
  png: { enabled: boolean; resolution: number }; // enabled/resolution reserved: capture uses fixed resolution 2
  mp4: { enabled: boolean; maxDuration: number }; // enabled reserved: recording always available
}

export interface ShareConfig {
  urlEncoding: boolean; // reserved: encoding always uses btoa+encodeURIComponent
  encodeCameraState: boolean; // reserved: not yet implemented
  encodeFilterState: boolean; // reserved: filter state IS encoded, this flag is unused
}

export interface AppConfig {
  particle: ParticleConfig;
  line: LineConfig;
  force: ForceConfig;
  interaction: InteractionConfig;
  export: ExportConfig;
  share: ShareConfig;
}

/**
 * A node augmented with runtime state produced by the 3D force layout and the
 * render loop. All the rx/ry/rz and *Factor fields are mutable and lerped
 * each frame; they do not exist on the source data.
 */
export interface SimNode extends GraphNode {
  // Smoothed render positions (lerped toward x/y/z each frame)
  rx: number;
  ry: number;
  rz: number;
  // Velocity (used during force simulation, zeroed afterwards)
  vx: number;
  vy: number;
  vz: number;
  // Per-frame animated factors in [0,1] driving hover/neighbor/dim visuals
  hoverFactor: number;
  neighborFactor: number;
  dimFactor: number;
  // Optional: precomputed visual size from layout engine (defaults to weight-based)
  computedSize?: number;
  // Optional: preferred emission direction for edge bundling (hub layout only).
  // Null/undefined = use legacy Bezier arch.
  emissionDir?: { x: number; y: number; z: number } | null;
}

/** An edge whose source/target have been resolved to SimNode references. */
export interface SimEdge {
  source: SimNode;
  target: SimNode;
  weight: number;
  relation?: string;
}

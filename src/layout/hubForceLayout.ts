import {
  LayoutEngine,
  LayoutInput,
  LayoutResult,
  SimNode,
  SimEdge,
  buildSimEdges,
  computeDegrees,
} from "./types";

/**
 * Hub Layout — degree-tiered radial placement.
 *
 * Each node is assigned a target radius based on its degree:
 *   - Top-degree nodes  → outer shell (radius ~210)
 *   - Mid-degree nodes  → middle shell
 *   - Low-degree nodes  → inner shell (radius ~25)
 *
 * A light force simulation relaxes angular positions so connected
 * nodes drift toward each other, but the radial tiering is enforced
 * by a strong pin to the assigned radius.  Hubs end up on the outside
 * with all their edges pointing inward.
 *
 * When prevPositions are available (e.g. slider drag), existing nodes
 * keep their current positions and only the radial pin adjusts — no
 * re-randomisation, no visual jump.
 */
export const hubForceLayout: LayoutEngine = {
  name: "核心权重网络图",
  compute(input: LayoutInput): LayoutResult {
    const { nodes: activeNodes, edges: activeEdges, prevPositions } = input;

    const { nodeDegrees, maxDegree } = computeDegrees(activeNodes, activeEdges);
    const maxDeg = Math.max(1, maxDegree);

    // ── Phase 1: Build simNodes ──
    const simNodes: SimNode[] = activeNodes.map((n) => {
      const degree = nodeDegrees.get(n.id) || 0;
      const degreeRatio = degree / maxDeg;
      const weightRatio = n.weight / 100;
      const sizeBlend = 0.6 * degreeRatio + 0.4 * weightRatio;
      const computedSize = Math.max(0.35, Math.min(2.2, 0.4 + sizeBlend * 1.8));

      // Target radius: smooth ramp scaled by dataset size.
      // Large graphs (400 nodes) reach ~280, small (50) reach ~110.
      const maxR = Math.min(280, 60 + activeNodes.length * 0.55);
      const targetR = 30 + Math.pow(degreeRatio, 1.5) * (maxR - 30);

      const prev = prevPositions.get(n.id);

      if (prev) {
        // Keep existing position — slider drag won't cause visual jump.
        return {
          ...n,
          x: prev.x,
          y: prev.y,
          z: prev.z,
          rx: prev.rx ?? prev.x,
          ry: prev.ry ?? prev.y,
          rz: prev.rz ?? prev.z,
          vx: 0, vy: 0, vz: 0,
          hoverFactor: 0, neighborFactor: 0, dimFactor: 0,
          computedSize,
          emissionDir: null,
          _targetR: targetR,
        };
      }

      // New node: random angular position on its target shell.
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi   = Math.acos(2.0 * v - 1.0);

      return {
        ...n,
        x:  targetR * Math.sin(phi) * Math.cos(theta),
        y:  targetR * Math.sin(phi) * Math.sin(theta),
        z:  targetR * Math.cos(phi),
        rx: 0, ry: 0, rz: 0,
        vx: 0, vy: 0, vz: 0,
        hoverFactor: 0, neighborFactor: 0, dimFactor: 0,
        computedSize,
        emissionDir: null,
        _targetR: targetR,
      };
    });

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const simEdges: SimEdge[] = buildSimEdges(activeEdges, nodeMap);

    // ── Phase 1.5: Compute ideal angular positions for outer-shell nodes ──
    // Nodes with high degree should spread evenly on the sphere surface
    // so the visual result is a ring of hubs rather than a clumped spindle.
    const OUTER_THRESHOLD = 0.4;
    const outerNodes = simNodes.filter(
      (n) => (nodeDegrees.get(n.id) || 0) / maxDeg > OUTER_THRESHOLD
    );
    const outerAnchors = new Map<string, { x: number; y: number; z: number }>();
    {
      const on = outerNodes;
      // Dynamic shell radius: scales with dataset size
      const shellR = Math.min(300, 80 + activeNodes.length * 0.4 + on.length * 10);
      for (let i = 0; i < on.length; i++) {
        const phi   = Math.acos(-1 + (2 * (i + 0.5)) / on.length);
        const theta = Math.sqrt(on.length * Math.PI) * phi;
        outerAnchors.set(on[i].id, {
          x: shellR * Math.sin(phi) * Math.cos(theta),
          y: shellR * Math.sin(phi) * Math.sin(theta),
          z: shellR * Math.cos(phi),
        });
      }
    }

    // ── Phase 2: Light relaxation ──
    const ticks = 120;
    const chargeStrength = (input.config.charge ?? -300) * 0.12;
    const linkStrength   = (input.config.linkStrength ?? 0.055) * 0.06;
    const pinStrength    = 0.12;
    const angularPull    = 0.08;
    const damping        = 0.82;

    for (let step = 0; step < ticks; step++) {
      // 1. Coulomb repulsion (weak, short range)
      for (let i = 0; i < simNodes.length; i++) {
        const n1 = simNodes[i];
        for (let j = i + 1; j < simNodes.length; j++) {
          const n2 = simNodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dz = n1.z - n2.z;
          const distSq = dx * dx + dy * dy + dz * dz + 0.1;
          const dist = Math.sqrt(distSq);
          if (dist < 60) {
            const distSqClamped = Math.max(9.0, distSq);
            const distClamped = Math.sqrt(distSqClamped);
            const force = (chargeStrength / distSqClamped) * (1.0 - dist / 60);
            const fx = (dx / distClamped) * force;
            const fy = (dy / distClamped) * force;
            const fz = (dz / distClamped) * force;
            n1.vx -= fx; n1.vy -= fy; n1.vz -= fz;
            n2.vx += fx; n2.vy += fy; n2.vz += fz;
          }
        }
      }

      // 2. Spring attraction (weak, only when close enough)
      simEdges.forEach((edge) => {
        const n1 = edge.source as SimNode;
        const n2 = edge.target as SimNode;
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dz = n1.z - n2.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
        if (dist < 250) {
          const restLength = 50;
          const force = (dist - restLength) * linkStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;
          n1.vx -= fx; n1.vy -= fy; n1.vz -= fz;
          n2.vx += fx; n2.vy += fy; n2.vz += fz;
        }
      });

      // 3. Radial pin — pull each node to its assigned target radius
      simNodes.forEach((node) => {
        const targetR = (node as any)._targetR as number;
        const distFromOrigin = Math.sqrt(
          node.x * node.x + node.y * node.y + node.z * node.z
        );
        const dNorm = Math.max(0.1, distFromOrigin);
        const radialPull = (targetR - distFromOrigin) * pinStrength;
        node.vx += (node.x / dNorm) * radialPull;
        node.vy += (node.y / dNorm) * radialPull;
        node.vz += (node.z / dNorm) * radialPull;

        // 4. Angular pull — spread outer-shell nodes toward ideal positions
        const anchor = outerAnchors.get(node.id);
        if (anchor) {
          node.vx += (anchor.x - node.x) * angularPull;
          node.vy += (anchor.y - node.y) * angularPull;
          node.vz += (anchor.z - node.z) * angularPull;
        }

        // Integration
        node.x  += node.vx;
        node.y  += node.vy;
        node.z  += node.vz;
        node.vx *= damping;
        node.vy *= damping;
        node.vz *= damping;
      });
    }

    // Clean up stash
    simNodes.forEach((n) => { delete (n as any)._targetR; });

    return { simNodes, simEdges, nodeDegrees, maxDegree: maxDeg };
  },
};

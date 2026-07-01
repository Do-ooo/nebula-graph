import { createLayoutRegistry, LayoutMode } from "./types";
import { hubForceLayout } from "./hubForceLayout";
import { clusteredForceLayout } from "./clusteredForceLayout";

export const layoutRegistry = createLayoutRegistry({
  hub: hubForceLayout,
  clustered: clusteredForceLayout,
  radial: {
    name: "中心放射层级图",
    compute: () => {
      throw new Error("Radial layout is not implemented yet.");
    },
  },
});

export { hubForceLayout, clusteredForceLayout };
export type { LayoutMode } from "./types";

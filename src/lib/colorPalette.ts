// Visually distinct color palette for auto-assigning unknown categories
// Colors are chosen to be distinguishable on dark backgrounds and from each other
const PALETTE = [
  "#f43f5e", // rose
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#a855f7", // purple
  "#ef4444", // red
  "#0ea5e9", // sky
  "#d946ef", // fuchsia
  "#22c55e", // green
  "#eab308", // yellow
  "#e11d48", // rose-600
  "#2563eb", // blue-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#0891b2", // cyan-600
  "#db2777", // pink-600
  "#0d9488", // teal-600
  "#ea580c", // orange-600
  "#4f46e5", // indigo-600
  "#65a30d", // lime-600
  "#9333ea", // purple-600
  "#dc2626", // red-600
];

// Simple string hash to get a consistent index for a category name
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Cache for auto-assigned colors
const autoColorCache = new Map<string, string>();
let nextPaletteIndex = 0;

/**
 * Get a color for a category. Uses hardcoded colors first,
 * then auto-assigns from palette for unknown categories.
 */
export function getCategoryColor(
  category: string,
  hardcodedColors: Record<string, string>,
  defaultColor: string
): string {
  // Check hardcoded colors first
  if (hardcodedColors[category]) {
    return hardcodedColors[category];
  }

  // Check auto-color cache
  if (autoColorCache.has(category)) {
    return autoColorCache.get(category)!;
  }

  // Assign next color from palette (deterministic based on category name)
  const color = PALETTE[hashString(category) % PALETTE.length];
  autoColorCache.set(category, color);
  return color;
}

// ── Relation color system (separate from category colors) ──

const RELATION_PALETTE = [
  "#f43f5e", // rose — 竞争/敌对
  "#3b82f6", // blue — 合作/协作
  "#10b981", // emerald — 投资/控股
  "#f59e0b", // amber — 供应/依赖
  "#8b5cf6", // violet — 归属/隶属
  "#06b6d4", // cyan — 研究/探索
  "#ec4899", // pink — 对立/博弈
  "#14b8a6", // teal — 保护/守护
  "#f97316", // orange — 影响/推动
  "#6366f1", // indigo — 创立/发起
  "#84cc16", // lime — 破解/解密
  "#a855f7", // purple — 传递/联络
  "#ef4444", // red — 毁灭/打击
  "#0ea5e9", // sky — 建造/制造
  "#d946ef", // fuchsia — 授予/赠予
  "#22c55e", // green — 逃离/逃亡
];

const relationColorCache = new Map<string, string>();

/**
 * Get a color for a relation type. Uses hardcoded colors first,
 * then auto-assigns from palette for unknown relations.
 */
export function getRelationColor(
  relation: string,
  hardcodedColors: Record<string, string>,
  defaultColor: string
): string {
  if (hardcodedColors[relation]) return hardcodedColors[relation];
  if (relationColorCache.has(relation)) return relationColorCache.get(relation)!;
  const color = RELATION_PALETTE[hashString(relation) % RELATION_PALETTE.length];
  relationColorCache.set(relation, color);
  return color;
}

export function resetRelationColorCache(): void {
  relationColorCache.clear();
}

/**
 * Reset auto-color cache (call when dataset changes)
 */
export function resetColorCache(): void {
  autoColorCache.clear();
  nextPaletteIndex = 0;
}

import { useMemo, useState } from "react";
import { GraphData } from "../types";
import { getCategoryColor, getRelationColor } from "../lib/colorPalette";

interface FilterBarProps {
  dataset: GraphData;
  hiddenCategories: string[];
  setHiddenCategories: (cats: string[]) => void;
  hiddenRelations: string[];
  setHiddenRelations: (rels: string[]) => void;
  categoryColors: Record<string, string>;
  relationColors: Record<string, string>;
  defaultColor: string;
}

const MAX_VISIBLE = 4;

export default function FilterBar({
  dataset,
  hiddenCategories,
  setHiddenCategories,
  hiddenRelations,
  setHiddenRelations,
  categoryColors,
  relationColors,
  defaultColor,
}: FilterBarProps) {
  const [catExpanded, setCatExpanded] = useState(false);
  const [relExpanded, setRelExpanded] = useState(false);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    dataset.nodes.forEach((n) => { if (n.category) cats.add(n.category); });
    return Array.from(cats);
  }, [dataset]);

  const allRelations = useMemo(() => {
    const rels = new Set<string>();
    dataset.edges.forEach((e) => { if (e.relation) rels.add(e.relation); });
    return Array.from(rels);
  }, [dataset]);

  const toggleCategory = (cat: string) => {
    setHiddenCategories(
      hiddenCategories.includes(cat)
        ? hiddenCategories.filter((c) => c !== cat)
        : [...hiddenCategories, cat]
    );
  };

  const toggleRelation = (rel: string) => {
    setHiddenRelations(
      hiddenRelations.includes(rel)
        ? hiddenRelations.filter((r) => r !== rel)
        : [...hiddenRelations, rel]
    );
  };

  const visibleCats = catExpanded ? allCategories : allCategories.slice(0, MAX_VISIBLE);
  const visibleRels = relExpanded ? allRelations : allRelations.slice(0, MAX_VISIBLE);
  const hasMoreCats = allCategories.length > MAX_VISIBLE;
  const hasMoreRels = allRelations.length > MAX_VISIBLE;

  if (allCategories.length === 0 && allRelations.length === 0) return null;

  const allCatsHidden = hiddenCategories.length === allCategories.length;
  const allRelsHidden = hiddenRelations.length === allRelations.length;

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none max-w-[420px]">
      {allCategories.length > 0 && (
        <div className="bg-black/50 backdrop-blur-md rounded-lg border border-white/10 px-3 py-2 pointer-events-auto">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-mono">类别</span>
            <span className="text-[10px] text-white/25 font-mono">{allCategories.length}</span>
            <div className="ml-auto flex gap-1">
              <button
                onClick={() => setHiddenCategories([])}
                className={`text-[10px] px-1.5 py-0.5 rounded transition border ${
                  hiddenCategories.length === 0
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                    : "border-transparent text-white/30 hover:text-white/50"
                }`}
              >全选</button>
              <button
                onClick={() => setHiddenCategories([...allCategories])}
                className={`text-[10px] px-1.5 py-0.5 rounded transition border ${
                  allCatsHidden
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                    : "border-transparent text-white/30 hover:text-white/50"
                }`}
              >全不选</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {visibleCats.map((cat) => {
              const isHidden = hiddenCategories.includes(cat);
              const color = getCategoryColor(cat, categoryColors, defaultColor);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-all duration-150 ${
                    isHidden
                      ? "bg-white/5 border-white/10 text-white/30"
                      : "border-white/15 text-white/85 hover:bg-white/10"
                  }`}
                  style={!isHidden ? { borderColor: color + "50" } : undefined}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                    style={{ backgroundColor: isHidden ? "#444" : color }}
                  />
                  {cat}
                </button>
              );
            })}
            {hasMoreCats && (
              <button
                onClick={() => setCatExpanded(!catExpanded)}
                className="px-2 py-0.5 rounded text-[11px] text-white/40 hover:text-white/60 border border-white/10 transition"
              >
                {catExpanded ? "收起" : `+${allCategories.length - MAX_VISIBLE}`}
              </button>
            )}
          </div>
        </div>
      )}

      {allRelations.length > 0 && (
        <div className="bg-black/50 backdrop-blur-md rounded-lg border border-white/10 px-3 py-2 pointer-events-auto">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-mono">关系</span>
            <span className="text-[10px] text-white/25 font-mono">{allRelations.length}</span>
            <div className="ml-auto flex gap-1">
              <button
                onClick={() => setHiddenRelations([])}
                className={`text-[10px] px-1.5 py-0.5 rounded transition border ${
                  hiddenRelations.length === 0
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                    : "border-transparent text-white/30 hover:text-white/50"
                }`}
              >全选</button>
              <button
                onClick={() => setHiddenRelations([...allRelations])}
                className={`text-[10px] px-1.5 py-0.5 rounded transition border ${
                  allRelsHidden
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                    : "border-transparent text-white/30 hover:text-white/50"
                }`}
              >全不选</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {visibleRels.map((rel) => {
              const isHidden = hiddenRelations.includes(rel);
              const color = getRelationColor(rel, relationColors, defaultColor);
              return (
                <button
                  key={rel}
                  onClick={() => toggleRelation(rel)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-all duration-150 ${
                    isHidden
                      ? "bg-white/5 border-white/10 text-white/30"
                      : "border-white/15 text-white/85 hover:bg-white/10"
                  }`}
                  style={!isHidden ? { borderColor: color + "50" } : undefined}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                    style={{ backgroundColor: isHidden ? "#444" : color }}
                  />
                  {rel}
                </button>
              );
            })}
            {hasMoreRels && (
              <button
                onClick={() => setRelExpanded(!relExpanded)}
                className="px-2 py-0.5 rounded text-[11px] text-white/40 hover:text-white/60 border border-white/10 transition"
              >
                {relExpanded ? "收起" : `+${allRelations.length - MAX_VISIBLE}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

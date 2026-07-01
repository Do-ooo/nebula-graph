import { useState, useRef, useEffect, ChangeEvent } from "react";
import { Upload, FileText, FileSpreadsheet, FileJson } from "lucide-react";
import { GraphData } from "../types";
import * as XLSX from "xlsx";
import { jLouvain } from "jlouvain";

interface ImportButtonProps {
  onLoadCustomJSON: (data: GraphData, fileName?: string) => void;
}

type ImportType = "csv" | "excel" | "json";

interface ImportOption {
  type: ImportType;
  icon: typeof FileText;
  label: string;
  accept: string;
}

const IMPORT_OPTIONS: ImportOption[] = [
  { type: "csv", icon: FileText, label: "CSV 导入", accept: ".csv,text/csv" },
  { type: "excel", icon: FileSpreadsheet, label: "Excel 导入", accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { type: "json", icon: FileJson, label: "JSON 导入", accept: ".json,application/json" },
];

function parseCSV(text: string): GraphData {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV 至少需要表头行和一行数据");

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const sourceIdx = header.findIndex((h) => h === "source" || h === "from" || h === "起始" || h === "源");
  const targetIdx = header.findIndex((h) => h === "target" || h === "to" || h === "目标" || h === "终");
  const relationIdx = header.findIndex((h) => h === "relation" || h === "关系" || h === "label" || h === "标签");
  const weightIdx = header.findIndex((h) => h === "weight" || h === "权重");
  const categoryIdx = header.findIndex((h) => h === "category" || h === "分类" || h === "类型");

  if (sourceIdx === -1 || targetIdx === -1) {
    throw new Error("CSV 需要包含 source/from/起始 和 target/to/目标 列");
  }

  const nodeMap = new Map<string, { id: string; name: string; incoming: number; outgoing: number; degree: number; category?: string }>();
  const edges: GraphData["edges"] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length <= Math.max(sourceIdx, targetIdx)) continue;

    const srcName = cols[sourceIdx];
    const tgtName = cols[targetIdx];
    const relation = relationIdx !== -1 && cols[relationIdx] ? cols[relationIdx] : undefined;
    const weight = weightIdx !== -1 && cols[weightIdx] ? Math.min(100, Math.max(1, parseInt(cols[weightIdx], 10) || 50)) : 50;
    const cat = categoryIdx !== -1 && cols[categoryIdx] ? cols[categoryIdx] : undefined;

    if (!srcName || !tgtName) continue;

    const srcId = srcName.replace(/\s+/g, "_");
    const tgtId = tgtName.replace(/\s+/g, "_");

    if (!nodeMap.has(srcId)) nodeMap.set(srcId, { id: srcId, name: srcName, incoming: 0, outgoing: 0, degree: 0, category: cat });
    if (!nodeMap.has(tgtId)) nodeMap.set(tgtId, { id: tgtId, name: tgtName, incoming: 0, outgoing: 0, degree: 0, category: cat });

    // Keep first-seen category for this node (CSV may have multiple rows for same node)
    const srcEntry = nodeMap.get(srcId)!;
    if (cat && !srcEntry.category) srcEntry.category = cat;
    const tgtEntry = nodeMap.get(tgtId)!;
    if (cat && !tgtEntry.category) tgtEntry.category = cat;

    // Degree counts unique connections (self-loop counts once)
    if (srcId === tgtId) {
      nodeMap.get(srcId)!.degree += 1;
    } else {
      nodeMap.get(srcId)!.degree += 1;
      nodeMap.get(tgtId)!.degree += 1;
    }
    nodeMap.get(srcId)!.outgoing += weight;
    nodeMap.get(tgtId)!.incoming += weight;

    edges.push({ source: srcId, target: tgtId, relation, weight });
  }

  if (nodeMap.size === 0) throw new Error("未能从 CSV 中解析出有效节点");

  // Weight derived from degree (connection count) — degree is the true
  // indicator of node importance in edge-list data.  Edge weights represent
  // connection strength, not node importance, so averaging them produces
  // near-uniform values.  We map degree to [10, 100] via sqrt scaling.
  const maxDeg = Math.max(1, ...Array.from(nodeMap.values()).map(n => n.degree));

  // ── Community detection: when CSV has no category column, use Louvain ──
  const hasCategoryColumn = categoryIdx !== -1;
  let communityMap: Record<string, number> = {};
  if (!hasCategoryColumn && edges.length >= 2) {
    try {
      const nodeIds = Array.from(nodeMap.keys());
      const louvainEdges = edges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight ?? 1,
      }));
      const community = jLouvain().nodes(nodeIds).edges(louvainEdges);
      communityMap = community();
    } catch {
      // Louvain failed — fall through, nodes will get "未分类"
    }
  }

  const nodes = Array.from(nodeMap.values()).map((n) => {
    const degreeRatio = n.degree / maxDeg;
    // Priority: CSV category > Louvain community > "未分类"
    let category: string;
    if (n.category) {
      category = n.category;
    } else if (communityMap[n.id] !== undefined) {
      category = `Group ${communityMap[n.id]}`;
    } else {
      category = "未分类";
    }
    return {
      id: n.id,
      name: n.name,
      category,
      weight: Math.min(100, Math.max(10, Math.round(10 + Math.sqrt(degreeRatio) * 90))),
    };
  });

  // Preserve raw import metadata for structural category restoration
  const structuralCategories = nodes.map(n => n.category || "未分类");
  const rawImportMeta = {
    names: Array.from(nodeMap.values()).map(n => n.name),
    structuralCategories,
    hasOriginalCategories: hasCategoryColumn,
  };

  return { meta: { _rawImport: rawImportMeta }, nodes, edges };
}

export default function ImportButton({ onLoadCustomJSON }: ImportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ImportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedType(null);
        setError(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleOptionClick = (type: ImportType) => {
    if (selectedType === type) {
      setSelectedType(null);
      setError(null);
      return;
    }
    setSelectedType(type);
    setError(null);
    const option = IMPORT_OPTIONS.find((o) => o.type === type)!;
    if (fileInputRef.current) {
      fileInputRef.current.accept = option.accept;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) return;

    const fileName = file.name.replace(/\.[^.]+$/, "");

    if (selectedType === "excel") {
      // Excel files are binary, read as ArrayBuffer
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csvText = XLSX.utils.sheet_to_csv(firstSheet);
          const result = parseCSV(csvText);
          onLoadCustomJSON(result, fileName);
          setIsOpen(false);
          setSelectedType(null);
          setError(null);
        } catch (err: any) {
          setError(err.message || "Excel 文件解析失败");
          setSelectedType(null);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV and JSON are text files
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          let data: GraphData;

          if (selectedType === "json") {
            const parsed = JSON.parse(text);
            if (!parsed.nodes || !Array.isArray(parsed.nodes)) throw new Error("JSON 缺少 nodes 数组");
            if (!parsed.edges || !Array.isArray(parsed.edges)) throw new Error("JSON 缺少 edges 数组");
            data = parsed as GraphData;
          } else {
            data = parseCSV(text);
          }

          onLoadCustomJSON(data, fileName);
          setIsOpen(false);
          setSelectedType(null);
          setError(null);
        } catch (err: any) {
          setError(err.message || "文件解析失败");
          setSelectedType(null);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-full">
          <div className="bg-[#0c0d12] border border-white/10 rounded-lg p-3 shadow-2xl shadow-black/60">
            {error && (
              <div className="mb-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
                {error}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {IMPORT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.type}
                    onClick={() => handleOptionClick(opt.type)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded border transition cursor-pointer ${
                      selectedType === opt.type
                        ? "bg-blue-500/10 border-blue-500 text-blue-300"
                        : "bg-white/5 border-white/10 hover:border-blue-500 hover:bg-white/[0.08] text-white/60 hover:text-white/90"
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-[11px] font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => { setIsOpen(!isOpen); setError(null); }}
        className={`w-full h-10 rounded flex items-center justify-center gap-2 text-xs font-mono font-bold transition border cursor-pointer ${
          isOpen
            ? "bg-blue-500/10 border-blue-500 text-blue-300"
            : "bg-white/5 hover:bg-white/10 text-[#E0E0E0] border-white/10 hover:border-blue-500"
        }`}
      >
        <Upload size={13} />
        <span>导入数据</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

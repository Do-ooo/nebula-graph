import { useEffect, useRef, useState, useCallback } from "react";
import { AppConfig, GraphData } from "./types";
import { DATASETS } from "./data/datasets";
import { decodeStateFromHash } from "./lib/urlSharing";
import { loadAllDatasets, saveDataset, deleteDataset } from "./lib/datasetStore";
import Graph3DCanvas from "./components/Graph3DCanvas";
import ControlPanel from "./components/ControlPanel";
import FilterBar from "./components/FilterBar";
import CanvasErrorBoundary from "./components/CanvasErrorBoundary";
import { Sparkles } from "lucide-react";

// Default configuration for the 3D graph visualizer
const defaultConfig: AppConfig = {
  particle: {
    count: 75, // fixed particle count per cluster (MVP requirement)
    size: 0.040, // scale of individual dust particle
    categoryColors: {
      "角色": "#f43f5e",
      "团队": "#3b82f6",
      "技能": "#10b981",
      "核心人物": "#f472b6",
      "三体文明": "#ef4444",
      "人类组织": "#6366f1",
      "关键概念": "#f59e0b",
      "宇宙文明": "#a855f7",
      "公司": "#0ea5e9",
      "大模型": "#f59e0b",
      "开源生态": "#10b981",
      "基础设施": "#06b6d4",
      "产品": "#ec4899",
      "超级核心中心": "#38bdf8",
      "企业边缘数据中心": "#c084fc",
      "物联网微型感应器集群": "#fb923c",
      "完全孤立气泡": "#f472b6",
      // 科技产业图谱
      "互联网": "#3b82f6",
      "AI": "#f59e0b",
      "芯片": "#ef4444",
      "云计算": "#06b6d4",
      "安全": "#10b981",
      "开源": "#a855f7",
      "投资": "#f97316",
      "学术": "#6366f1",
      "硬件": "#ec4899",
      "软件": "#14b8a6",
      // 外围节点
      "框架": "#8b5cf6",
      "工具": "#0ea5e9",
      "服务": "#f43f5e",
      "协议": "#84cc16",
      "标准": "#f59e0b",
      "概念": "#6366f1",
      "趋势": "#ec4899",
      "组件": "#10b981",
      "库": "#06b6d4",
    },
    relationColors: {
      "竞争": "#f43f5e",
      "敌对": "#f43f5e",
      "合作": "#3b82f6",
      "协作": "#3b82f6",
      "投资": "#10b981",
      "控股": "#10b981",
      "收购": "#10b981",
      "供应": "#f59e0b",
      "供应商": "#f59e0b",
      "隶属": "#8b5cf6",
      "自有": "#8b5cf6",
      "保护": "#14b8a6",
      "影响": "#f97316",
      "创立": "#6366f1",
      "发起": "#6366f1",
      "研究": "#06b6d4",
      "破解": "#84cc16",
      "传递": "#a855f7",
      "联络": "#a855f7",
      "毁灭": "#ef4444",
      "打击": "#ef4444",
      "制造": "#0ea5e9",
      "建造": "#0ea5e9",
      "逃离": "#22c55e",
      "逃亡": "#22c55e",
      "对立": "#ec4899",
      "博弈": "#ec4899",
    },
    defaultColor: "#06b6d4", // Cyan
    bloomIntensity: 1.5,
    floatAnimation: false,
  },
  line: {
    minWidth: 0.02,
    maxWidth: 0.15,
    opacity: 0.48,
  },
  force: {
    charge: -300,
    linkDistance: 60,
    linkStrength: 0.45,
  },
  interaction: {
    enableZoom: true,
    enableRotate: true,
    enablePan: true,
    autoRotate: false,
    presetCameras: ["俯瞰", "正面", "侧面"],
    labelScale: 1.0,
  },
  export: {
    png: { enabled: true, resolution: 2 },
    mp4: { enabled: true, maxDuration: 15 },
  },
  share: {
    urlEncoding: true,
    encodeCameraState: true,
    encodeFilterState: true,
  },
};

export default function App() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  
  // Datasets State (includes standard ones, and expands if user imports custom ones)
  const [allDatasets, setAllDatasets] = useState<Record<string, GraphData>>(DATASETS);
  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string>(Object.keys(DATASETS)[0]);
  const [customKeys, setCustomKeys] = useState<string[]>([]);

  // Filter and highlight states
  const [minWeight, setMinWeight] = useState<number>(0);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [hiddenRelations, setHiddenRelations] = useState<string[]>([]);

  // Triggering smooth camera presets
  const [presetCameraTrigger, setPresetCameraTrigger] = useState<string | null>(null);

  // Statistics of currently visible sub-graph elements
  const [viewStats, setViewStats] = useState({ nodeCount: 0, edgeCount: 0 });

  // Live recording state sync from Canvas
  const [isRecording, setIsRecording] = useState(false);
  const [layoutMode, setLayoutMode] = useState<string>("hub");

  // Share restoration toast notice
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const [restoredTitle, setRestoredTitle] = useState("");
  // P0 fix: hold the toast timer so we can clear it on unmount.
  const restoredNoticeTimerRef = useRef<number | null>(null);

  // Responsive URL hash state
  const [urlHash, setUrlHash] = useState<string>(window.location.hash);

  // Restore state from URL Hash on mount
  useEffect(() => {
    const sharedState = decodeStateFromHash();
    if (sharedState) {
      if (DATASETS[sharedState.datasetKey]) {
        setSelectedDatasetKey(sharedState.datasetKey);
        setMinWeight(sharedState.minWeight);
        setHiddenCategories(sharedState.hiddenCategories);
        
        setRestoredTitle(DATASETS[sharedState.datasetKey].meta?.title || "已分享的 3D 视角");
        setShowRestoredNotice(true);
        if (restoredNoticeTimerRef.current) window.clearTimeout(restoredNoticeTimerRef.current);
        restoredNoticeTimerRef.current = window.setTimeout(() => setShowRestoredNotice(false), 5000);
      }
    }
  }, []);

  // Track URL hash changes responsively
  useEffect(() => {
    const onHashChange = () => setUrlHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // P0 fix: clear the toast timer on unmount to avoid setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (restoredNoticeTimerRef.current) window.clearTimeout(restoredNoticeTimerRef.current);
    };
  }, []);

  // Load custom datasets from IndexedDB on mount
  useEffect(() => {
    loadAllDatasets().then((customDatasets) => {
      const keys = Object.keys(customDatasets);
      if (keys.length > 0) {
        setAllDatasets((prev) => ({ ...prev, ...customDatasets }));
        setCustomKeys(keys);
      }
    });
  }, []);

  // Handle loading custom JSON dataset
  const handleLoadCustomJSON = (customData: GraphData, fileName?: string) => {
    const customKey = `custom_${Date.now()}`;
    const customTitle = customData.meta?.title || fileName || "导入图谱";

    const enrichedData: GraphData = {
      meta: {
        title: customTitle,
      },
      nodes: customData.nodes,
      edges: customData.edges,
    };

    // Save to IndexedDB
    saveDataset(customKey, enrichedData);

    // Update state
    setAllDatasets((prev) => ({
      ...prev,
      [customKey]: enrichedData,
    }));
    setCustomKeys((prev) => [...prev, customKey]);

    setSelectedDatasetKey(customKey);
    setMinWeight(0);
    setHiddenCategories([]);
    setHiddenRelations([]);
  };

  // Handle deleting custom dataset
  const handleDeleteCustomDataset = (key: string) => {
    deleteDataset(key);
    setAllDatasets((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCustomKeys((prev) => prev.filter((k) => k !== key));
    // If deleted the currently selected, switch to first built-in dataset
    if (selectedDatasetKey === key) {
      setSelectedDatasetKey(Object.keys(DATASETS)[0]);
    }
  };

  const handleSelectDataset = (key: string) => {
    setSelectedDatasetKey(key);
    setMinWeight(0);
    setHiddenCategories([]);
    setHiddenRelations([]);
  };

  const currentDataset = allDatasets[selectedDatasetKey] || allDatasets["threeBody"];

  // Category classification is now structural only (jLouvain). Semantic classification removed.
  // Category classification is now structural only (jLouvain). Semantic classification removed.

  return (
    <div id="app-root" className="w-screen h-screen bg-[#050506] text-[#E0E0E0] font-sans flex flex-col overflow-hidden relative select-none antialiased">
      
      {/* Header Navigation */}
      <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between bg-[#08080A] z-20 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.4)] flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-xs">RG</span>
            </div>
            <h1 className="text-sm sm:text-lg font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              NodeOrbit <span className="text-[12px] text-blue-400 font-mono ml-1 uppercase opacity-80 hidden sm:inline">v{__APP_VERSION__}</span>
            </h1>
          </div>
          <div className="h-4 w-px bg-white/10 mx-2 hidden sm:block"></div>
          
          <div className="hidden sm:flex items-center space-x-3 text-xs uppercase tracking-widest text-white/40">
            <span className="hover:text-white transition-colors cursor-pointer">Dataset:</span>
            <select
              value={selectedDatasetKey}
              onChange={(e) => handleSelectDataset(e.target.value)}
              className="bg-transparent border-none text-blue-400 font-semibold focus:ring-0 cursor-pointer text-xs"
            >
              {(Object.entries(allDatasets) as [string, GraphData][]).map(([key, dataset]) => (
                <option key={key} value={key} className="bg-[#08080A] text-slate-200">
                  {dataset.meta?.title || key}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {isRecording && (
            <div className="flex items-center bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full space-x-2 animate-pulse">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-[12px] font-bold text-red-400 uppercase tracking-tighter">REC</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex relative min-h-0">
        
        {/* Sidebar Controls */}
        <aside
          id="sidebar-container"
          className="relative inset-y-0 left-0 w-96 z-30 h-full"
        >
          <ControlPanel
            datasets={allDatasets}
            selectedDatasetKey={selectedDatasetKey}
            onSelectDataset={handleSelectDataset}
            config={config}
            onChangeConfig={setConfig}
            minWeight={minWeight}
            setMinWeight={setMinWeight}
            onTriggerPresetCamera={setPresetCameraTrigger}
            onLoadCustomJSON={handleLoadCustomJSON}
            viewStats={viewStats}
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            customKeys={customKeys}
            onDeleteCustomDataset={handleDeleteCustomDataset}
            hiddenCategories={hiddenCategories}
          />
        </aside>

        {/* Main Canvas Viewport */}
        <div id="main-viewport-panel" className="flex-grow relative bg-[#020204]">
          
          {/* Floating Filter Bar */}
          <FilterBar
            dataset={currentDataset}
            hiddenCategories={hiddenCategories}
            setHiddenCategories={setHiddenCategories}
            hiddenRelations={hiddenRelations}
            setHiddenRelations={setHiddenRelations}
            categoryColors={config.particle.categoryColors}
            relationColors={config.particle.relationColors}
            defaultColor={config.particle.defaultColor}
          />

          {/* Desktop Overlay: floating Title info card */}
          <div
            id="desktop-floating-title"
            className="absolute top-5 left-5 z-10 bg-black/40 backdrop-blur-md border border-white/10 rounded px-4 py-3 shadow-2xl pointer-events-none select-none max-w-sm flex-col gap-1 transition-all hidden lg:flex"
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="font-mono text-[12px] text-blue-400 tracking-widest uppercase">Active Canvas Matrix</span>
            </div>
            <h2 className="text-xs font-bold text-white font-sans tracking-wide">
              {currentDataset?.meta?.title || "三维数据关系图谱"}
            </h2>
          </div>

          {/* Share Restoration Toast Notification */}
          {showRestoredNotice && (
            <div
              id="restoration-toast"
              className="absolute top-5 right-5 z-50 bg-black/80 border border-blue-500 text-blue-400 rounded px-4 py-3 shadow-2xl flex items-center gap-3 animate-fade-in backdrop-blur-md"
            >
              <Sparkles size={16} className="text-blue-400 animate-bounce" />
              <div className="flex flex-col">
                <span className="text-[12px] font-mono text-blue-400 uppercase tracking-widest font-bold">Successfully Restored</span>
                <span className="text-xs font-semibold text-slate-200">已载入分享视角: {restoredTitle}</span>
              </div>
            </div>
          )}

          {/* The core 3D graph visualizer engine */}
          <div id="canvas-wrapper-dom" className="w-full h-full flex-1 min-h-0 bg-[#020204]">
            <CanvasErrorBoundary>
              <Graph3DCanvas
                data={currentDataset}
                config={config}
                minWeight={minWeight}
                hiddenCategories={hiddenCategories}
                hiddenRelations={hiddenRelations}
                presetCameraTrigger={presetCameraTrigger}
                onClearPresetCamera={() => setPresetCameraTrigger(null)}
                onViewStatsChange={setViewStats}
                onRecordingStateChange={setIsRecording}
                layoutMode={layoutMode}
              />
            </CanvasErrorBoundary>
          </div>
        </div>
      </main>

      {/* Bottom Information Bar / Footer */}
      <footer className="h-10 border-t border-white/10 bg-[#08080A] flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center space-x-6 text-[12px] uppercase tracking-widest text-white/40 font-mono">
          <span>Nodes: {viewStats.nodeCount}</span>
          <span>Edges: {viewStats.edgeCount}</span>
          <span>Render Engine: WebGL/Three.js</span>
        </div>
        <div className="flex items-center space-x-4">
           <span className="text-[12px] text-white/30 font-mono hidden md:inline">
             URL_HASH: {urlHash || "#dataset=" + selectedDatasetKey}
           </span>
           <div className="h-3 w-px bg-white/10 hidden md:inline"></div>
           <button
             onClick={() => {
               const shareBtn = document.getElementById("btn-share-trigger");
               if (shareBtn) shareBtn.click();
             }}
             className="text-[12px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors cursor-pointer"
           >
             Copy Share Link
           </button>
        </div>
      </footer>
    </div>
  );
}

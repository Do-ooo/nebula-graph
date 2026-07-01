import { useState } from "react";
import { AppConfig, GraphData } from "../types";
import { DATASET_KEYS } from "../data/datasets";
import { copyShareLink, SharedViewState } from "../lib/urlSharing";
import ImportButton from "./ImportButton";
import {
  Sliders,
  Share2,
  Database,
  Compass,
  ChevronDown,
  ChevronUp,
  Award,
  Network
} from "lucide-react";

interface ControlPanelProps {
  datasets: Record<string, GraphData>;
  selectedDatasetKey: string;
  onSelectDataset: (key: string) => void;
  config: AppConfig;
  onChangeConfig: (newConfig: AppConfig) => void;
  minWeight: number;
  setMinWeight: (weight: number) => void;
  onTriggerPresetCamera: (preset: string) => void;
  onLoadCustomJSON: (data: GraphData, fileName?: string) => void;
  viewStats: { nodeCount: number; edgeCount: number };
  layoutMode?: string;
  setLayoutMode?: (mode: string) => void;
  customKeys?: string[];
  onDeleteCustomDataset?: (key: string) => void;
  hiddenCategories?: string[];
}

export default function ControlPanel({
  datasets,
  selectedDatasetKey,
  onSelectDataset,
  config,
  onChangeConfig,
  minWeight,
  setMinWeight,
  onTriggerPresetCamera,
  onLoadCustomJSON,
  viewStats,
  layoutMode = "hub",
  setLayoutMode,
  customKeys = [],
  onDeleteCustomDataset,
  hiddenCategories = [],
}: ControlPanelProps) {
  const currentDataset = datasets[selectedDatasetKey];

  // UI Accordion States
  const [openSection, setOpenSection] = useState<string>("data");
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  const handleShareClick = async () => {
    const shareState: SharedViewState = {
      datasetKey: selectedDatasetKey,
      minWeight,
      hiddenCategories,
    };
    try {
      await copyShareLink(shareState);
      setShareSuccess(true);
      setIsCopied(true);
      setTimeout(() => {
        setShareSuccess(false);
        setIsCopied(false);
      }, 3000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-96 bg-[#08080A] border-r border-white/10 flex flex-col h-full text-[#E0E0E0] backdrop-blur-md overflow-y-auto">
      
      {/* Title Header */}
      <div className="p-5 border-b border-white/10 flex flex-col gap-1.5 shrink-0 bg-[#08080A]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_#3b82f6] animate-pulse" />
          <h1 className="text-sm tracking-widest font-mono font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">三维数据关系图谱</h1>
          <span className="text-[12px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-blue-400">
            V{__APP_VERSION__}
          </span>
        </div>
        <p className="text-[12px] text-white/50 font-sans">
          轻量级 3D 粒子集群关系图谱可视化引擎
        </p>
      </div>

      {/* Accordion List */}
      <div className="flex-1 p-4 space-y-4">
        
        {/* 1. Dataset Selection Section */}
        <div className="border border-white/10 rounded overflow-hidden bg-black/20">
          <button
            onClick={() => setOpenSection(openSection === "data" ? "" : "data")}
            className="w-full px-4 py-3 bg-[#08080A] flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-white/40 font-bold hover:text-white transition border-b border-white/10"
          >
            <div className="flex items-center gap-2">
              <Database size={13} className="text-blue-400" />
              <span>图谱数据集选择</span>
            </div>
            {openSection === "data" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          
          {openSection === "data" && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 gap-2">
                {DATASET_KEYS.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => onSelectDataset(item.key)}
                    className={`px-3 py-2.5 rounded border text-left text-xs flex flex-col gap-1 transition ${
                      selectedDatasetKey === item.key
                        ? "bg-blue-500/10 border-blue-500 text-blue-300"
                        : "bg-white/5 border-white/10 hover:border-blue-500 hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-[12px] text-white/40 font-mono">
                      内置精品数据 • {item.count} 节点
                    </span>
                  </button>
                ))}
              </div>

              {customKeys.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  <div className="text-[11px] text-white/30 uppercase tracking-wider font-mono px-1">用户导入</div>
                  {customKeys.map((key) => {
                    const ds = datasets[key];
                    return (
                      <div
                        key={key}
                        className={`px-3 py-2.5 rounded border text-left text-xs flex items-center justify-between gap-2 transition ${
                          selectedDatasetKey === key
                            ? "bg-blue-500/10 border-blue-500 text-blue-300"
                            : "bg-white/5 border-white/10 hover:border-blue-500 hover:bg-white/[0.08]"
                        }`}
                      >
                        <button
                          onClick={() => onSelectDataset(key)}
                          className="flex-1 text-left"
                        >
                          <span className="font-semibold">{ds?.meta?.title || key}</span>
                          <span className="block text-[12px] text-white/40 font-mono">
                            自定义导入 • {ds?.nodes?.length || 0} 节点
                          </span>
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteKey(pendingDeleteKey === key ? null : key);
                            }}
                            className="text-white/30 hover:text-red-400 transition p-1"
                            title="删除"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                          </button>
                          {pendingDeleteKey === key && (
                            <div className="absolute right-0 bottom-full mb-1 z-50 bg-[#1a1b23] border border-white/10 rounded-lg p-2.5 shadow-xl shadow-black/50 min-w-[140px]">
                              <p className="text-[11px] text-white/70 mb-2">确认删除？</p>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteCustomDataset?.(key);
                                    setPendingDeleteKey(null);
                                  }}
                                  className="flex-1 px-2 py-1 text-[11px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition"
                                >
                                  删除
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendingDeleteKey(null);
                                  }}
                                  className="flex-1 px-2 py-1 text-[11px] font-medium bg-white/5 text-white/50 border border-white/10 rounded hover:bg-white/10 transition"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 1b. Layout Mode Section */}
        <div className="border border-white/10 rounded overflow-hidden bg-black/20">
          <button
            onClick={() => setOpenSection(openSection === "layout" ? "" : "layout")}
            className="w-full px-4 py-3 bg-[#08080A] flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-white/40 font-bold hover:text-white transition border-b border-white/10"
          >
            <div className="flex items-center gap-2">
              <Compass size={13} className="text-blue-400" />
              <span>布局模式</span>
            </div>
            {openSection === "layout" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {openSection === "layout" && (
            <div className="p-4 space-y-2">
              <button
                onClick={() => setLayoutMode?.("hub")}
                className={`w-full px-3 py-2.5 rounded border text-left text-xs transition ${
                  layoutMode === "hub"
                    ? "bg-blue-500/10 border-blue-500 text-blue-300"
                    : "bg-white/5 border-white/10 hover:border-blue-500 hover:bg-white/[0.08]"
                }`}
              >
                <span className="font-semibold">径向中心视图</span>
                <span className="block text-[12px] text-white/40 mt-0.5">按连接度分层辐射，核心在外围</span>
              </button>
              <button
                onClick={() => setLayoutMode?.("clustered")}
                className={`w-full px-3 py-2.5 rounded border text-left text-xs transition ${
                  layoutMode === "clustered"
                    ? "bg-blue-500/10 border-blue-500 text-blue-300"
                    : "bg-white/5 border-white/10 hover:border-blue-500 hover:bg-white/[0.08]"
                }`}
              >
                <span className="font-semibold">分簇球面视图</span>
                <span className="block text-[12px] text-white/40 mt-0.5">按类别聚合球面分布，星云跟随</span>
              </button>

            </div>
          )}
        </div>

        {/* 2. Interactive Filters Section */}
        <div className="border border-white/10 rounded overflow-hidden bg-black/20">
          <button
            onClick={() => setOpenSection(openSection === "filters" ? "" : "filters")}
            className="w-full px-4 py-3 bg-[#08080A] flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-white/40 font-bold hover:text-white transition border-b border-white/10"
          >
            <div className="flex items-center gap-2">
              <Sliders size={13} className="text-blue-400" />
              <span>关系筛选与控制</span>
            </div>
            {openSection === "filters" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {openSection === "filters" && (
            <div className="p-4 space-y-5">
              {/* Weight threshold filter */}
              <div className="space-y-2">
                <div className="flex justify-between text-[12px] uppercase tracking-[0.1em] text-white/40 font-mono">
                  <span>最低影响力阈值</span>
                  <span className="text-blue-400 font-bold">{minWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="95"
                  value={minWeight}
                  onChange={(e) => setMinWeight(Number(e.target.value))}
                  className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                />
                <p className="text-[12px] text-white/40 font-sans leading-relaxed">
                  低于此核心影响力的边缘人物将从 3D 网络中折叠隐藏
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 3. Camera Controls */}
        <div className="border border-white/10 rounded overflow-hidden bg-black/20">
          <button
            onClick={() => setOpenSection(openSection === "camera" ? "" : "camera")}
            className="w-full px-4 py-3 bg-[#08080A] flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-white/40 font-bold hover:text-white transition border-b border-white/10"
          >
            <div className="flex items-center gap-2">
              <Compass size={13} className="text-blue-400" />
              <span>3D 视角与控制</span>
            </div>
            {openSection === "camera" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {openSection === "camera" && (
            <div className="p-4 space-y-4">
              {/* Preset Position Buttons */}
              <div className="space-y-1.5">
                <span className="text-[12px] uppercase tracking-[0.15em] text-white/40 font-mono block">预设微调机位</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {config.interaction.presetCameras.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => onTriggerPresetCamera(preset)}
                      className="py-1.5 px-2 bg-white/5 hover:bg-white/10 hover:border-blue-500 hover:text-white border border-white/10 rounded text-[12px] font-mono transition"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aesthetics settings */}
              <div className="space-y-3 border-t border-white/10 pt-3.5">
                <span className="text-[12px] uppercase tracking-[0.15em] text-white/40 font-mono block">自适应视觉调节</span>

                {/* Particle Size */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[12px] font-mono text-white/50">
                    <span>微尘粒子大小</span>
                    <span>{config.particle.size.toFixed(3)}px</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.12"
                    step="0.01"
                    value={config.particle.size}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        particle: { ...config.particle, size: Number(e.target.value) },
                      })
                    }
                    className="w-full h-1 bg-white/5 rounded accent-blue-500 appearance-none"
                  />
                </div>

                {/* Auto Rotate Toggle */}
                <label className="flex items-center justify-between text-[12px] text-white/60 cursor-pointer pt-1 select-none">
                  <span>启动太空漫游(自动慢速旋转)</span>
                  <input
                    type="checkbox"
                    checked={config.interaction.autoRotate}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        interaction: { ...config.interaction, autoRotate: e.target.checked },
                      })
                    }
                    className="rounded border-white/10 bg-black/40 text-blue-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                </label>

                {/* Label Size Slider */}
                <div className="space-y-1 border-t border-white/10 pt-3">
                  <div className="flex justify-between text-[12px] font-mono text-white/50">
                    <span>节点标签大小</span>
                    <span>{((config.interaction as any).labelScale ?? 1.0).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="4"
                    step="0.1"
                    value={(config.interaction as any).labelScale ?? 1.0}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        interaction: { ...config.interaction, labelScale: Number(e.target.value) },
                      })
                    }
                    className="w-full h-1 bg-white/5 rounded accent-blue-500 appearance-none"
                  />
                  <p className="text-[12px] text-white/40 font-sans leading-relaxed">
                    调大可让小节点的标签在放大时更清晰可读
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Footer Section: Share & Star */}
      <div className="p-4 border-t border-white/10 bg-[#08080A] shrink-0 space-y-3">
        
        {/* Realtime stats summary */}
        <div className="flex items-center justify-between text-[12px] text-white/40 font-mono">
          <span>当前渲染:</span>
          <span>
            <strong className="text-white/85 font-bold">{viewStats.nodeCount}</strong> 个核心粒子群 ·{" "}
            <strong className="text-white/85 font-bold">{viewStats.edgeCount}</strong> 条关联连线
          </span>
        </div>

        {/* Import Button */}
        <ImportButton onLoadCustomJSON={onLoadCustomJSON} />

        {/* Share buttons */}
        <button
          id="btn-share-trigger"
          onClick={handleShareClick}
          className={`w-full h-10 rounded flex items-center justify-center gap-2 text-xs font-mono font-bold transition border cursor-pointer ${
            shareSuccess
              ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
              : "bg-white/5 hover:bg-white/10 text-[#E0E0E0] border-white/10 hover:border-blue-500"
          }`}
        >
          <Share2 size={13} />
          <span>{shareSuccess ? "分享链接已复制！" : "分享 3D 当前视角图谱"}</span>
        </button>

        {/* Github Star CTA banner */}
        <div className="bg-blue-900/10 border border-blue-500/20 rounded p-3 flex items-start gap-2.5">
          <Award size={14} className="text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-[12px] font-bold text-blue-300 font-sans leading-relaxed">
              如果你喜欢三维数据关系图谱，欢迎给作者一个 Star 支持！
            </h4>
            <p className="text-[12px] text-blue-400/60 leading-normal font-sans">
              极简轻量，免服务器直接部署，支持在 Vue/React 系统中一行代码无缝嵌入 3D。
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

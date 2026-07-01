import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches render-time errors from the 3D canvas (e.g. WebGL context loss,
 * failed texture creation) and shows a lightweight fallback instead of a
 * blank white page. The error is non-fatal: the controls and layout remain.
 */
export default class CanvasErrorBoundary extends Component<Props, State> {
  declare state: State;
  declare props: Props;
  declare setState: (partial: Partial<State>) => void;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    console.error("[CanvasErrorBoundary] 3D render failed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#020204] p-8">
          <div className="max-w-md text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-200">3D 渲染引擎初始化失败</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              可能是浏览器不支持 WebGL 或显卡驱动异常。请尝试刷新页面或在其他浏览器中打开。
            </p>
            <p className="text-[10px] text-slate-600 font-mono break-all">{this.state.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

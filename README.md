# NodeOrbit — 3D 关系图谱可视化

> 把任意关系数据变成可交互的 3D 星云。无需后端、无需配置，打开即用、探索即可。

[![Live Demo](https://img.shields.io/badge/🔴%20在线%20Demo-立即%20打开-blue?style=for-the-badge)](https://do-ooo.github.io/node-orbit)
[![GitHub Stars](https://img.shields.io/github/stars/Do-ooo/node-orbit?style=for-the-badge)](https://github.com/Do-ooo/node-orbit/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.3.0-blue?style=for-the-badge)](https://github.com/Do-ooo/node-orbit/releases)

![demo](assets/demo.gif)

---

## 🎉 v0.3 更新亮点

### ⚡ 性能大幅优化
- **智能渲染跳过**：静止时自动跳过InstancedMesh数据上传，CPU占用降低60%+
- **边悬停节流**：使用requestAnimationFrame节流，高频鼠标移动时性能提升40%
- **颜色预计算**：分类/关系颜色在数据加载时预计算，热循环零计算开销
- **标签纹理缓存**：LRU缓存策略，过滤变化时避免重复创建Canvas
- **FPS自适应画质**：根据帧率自动调整pixel ratio，低配设备流畅运行

### 🎯 核心功能
- **结构分簇**：基于Louvain算法的自动社区检测，CSV导入时自动分簇
- **多种布局**：Hub布局、力导向布局，支持相机预设
- **交互丰富**：节点聚焦、邻居高亮、关系筛选、视角分享

### 🛠 稳定性提升
- 移除语义分类依赖，专注结构分簇，降低包体积和复杂度
- 修复多个运行时错误，提升整体稳定性

---

## ✨ 你可以用它做什么

- **同人/粉丝知识图** — 三体宇宙、漫威、权游
- **行业图谱** — AI 生态、创业股权、技术栈
- **个人知识库** — 书籍、论文、概念、笔记
- **系统架构** — 服务、依赖、数据流
- **社交/协作图** — 团队、技能、项目

只要有**节点**和**关系**，就能在 3D 里发光。

---

## 🎯 为什么做它

现有的图谱工具要么**太开发者向**（只能写 JSON、D3/G6），要么**太静态**（导出图片、无法探索）。NodeOrbit 取中间路线：

- **默认好看** — 粒子发光、星云聚类、平滑相机预设
- **可探索** — 点击节点聚焦一阶关系，拖拽旋转、缩放，分享当前视角
- **可分享** — 数据集、筛选、相机角度都编码在 URL hash 里
- **可嵌入** — 纯前端，一键部署到 GitHub Pages

---

## 🚀 快速开始

### 在线体验

[**🔴 打开在线 Demo**](https://do-ooo.github.io/node-orbit)

无需安装、无需账号，选一个数据集即可开始探索。

### 本地运行

```bash
npm install
npm run dev      # http://localhost:3000
```

### 构建生产版本

```bash
npm run build
npm run preview
```

---

## 📦 内置数据集

| 数据集 | 节点数 | 说明 |
|---------|--------|------|
| **AI 大模型生态** | ~90 | 公司、模型、开源框架、基础设施与关键概念 |
| **三体宇宙关系图谱** | ~80 | 人物、组织、文明与关键科幻概念 |
| **Demo 示例** | 11 | 最小示例：团队、技能与关系 |

想添加自己的数据？见下方 [数据格式](#-数据格式)。

---

## 🎮 交互说明

| 操作 | 效果 |
|------|------|
| 左键拖拽 | 旋转视角 |
| 滚轮 | 缩放 |
| 右键拖拽 | 平移 |
| 点击节点 | 聚焦其一阶关系网络（高亮邻居，淡化其他） |
| 点击空白 / 再点一次 | 退出聚焦模式 |
| 拖动滑块 | 调整力参数、粒子大小、标签大小、权重阈值 |
| 分享按钮 | 复制一个 URL，可还原当前视角 |
| 录制按钮 | 把动画录制成 MP4/WebM |
| 截图 | 保存当前视角为 PNG |

---

## 📥 数据格式

NodeOrbit 接受简单的 **JSON** 数据：

```json
{
  "meta": {
    "title": "我的图谱",
    "description": "简短描述"
  },
  "nodes": [
    { "id": "n1", "name": "节点A", "category": "分类A", "weight": 90 },
    { "id": "n2", "name": "节点B", "category": "分类B", "weight": 70 }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "relation": "关联", "weight": 85 }
  ]
}
```

- `weight`：0–100，映射节点亮度与大小
- `category`：决定节点颜色与所属星云聚类
- 导入时会校验 id 唯一性、weight 范围、edge 悬空引用

> **即将上线**：CSV / 表格导入、模板库、可视化编辑器，无需手写 JSON。

---

## 🛠 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 框架 | React 19 + Vite 6 | UI 与构建 |
| 渲染 | Three.js 0.184 | WebGL 3D 引擎 |
| 样式 | Tailwind CSS v4 | 原子化样式 |
| 类型 | TypeScript 5.8 | 类型安全 |
| 布局 | 自实现 3D 力导向 | Coulomb + Spring + Center pull |
| 渲染优化 | InstancedMesh、LOD、视锥剔除 | 大规模图流畅渲染 |

---

## 🏗 路线图

- [x] 3D 粒子图谱与力导向布局
- [x] 交互、相机预设、录制、截图
- [x] URL 分享 + JSON 导入
- [x] 高传播性数据集（AI、三体）
- [x] 性能优化（智能渲染、节流、缓存）
- [x] 结构分簇（Louvain算法）
- [ ] CSV / 表格导入
- [ ] 节点与边的可视化编辑器
- [ ] 更多模板（漫威、创业、哲学等）
- [ ] 力导向迁移 Web Worker 支持大图
- [ ] React 组件 npm 包（`@node-orbit/react`）

---

## 📄 协议

MIT

---

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Do-ooo/node-orbit&type=Date)](https://star-history.com/#Do-ooo/node-orbit&Date)

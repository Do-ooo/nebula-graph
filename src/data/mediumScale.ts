import { GraphData } from "../types";

const nodes: GraphData["nodes"] = [];
const edges: GraphData["edges"] = [];

const cats = ["互联网", "AI", "芯片", "云计算", "安全", "开源", "投资", "学术"];

// --- Hub nodes (8) ---
const hubs = [
  { name: "Google", cat: "互联网", w: 100 },
  { name: "Microsoft", cat: "互联网", w: 98 },
  { name: "Amazon", cat: "云计算", w: 97 },
  { name: "NVIDIA", cat: "芯片", w: 96 },
  { name: "OpenAI", cat: "AI", w: 95 },
  { name: "Meta", cat: "互联网", w: 94 },
  { name: "Apple", cat: "互联网", w: 93 },
  { name: "Samsung", cat: "芯片", w: 92 },
];
hubs.forEach((h, i) => {
  nodes.push({ id: `h${i}`, name: h.name, category: h.cat, weight: h.w });
});

// --- Mid-tier nodes (30) ---
const midTier = [
  "AWS", "Azure", "GCP", "TensorFlow", "PyTorch", "React", "Vue", "Docker",
  "Kubernetes", "GitHub", "GitLab", "VS Code", "Linux", "Python", "Rust", "Go",
  "TypeScript", "Node.js", "Redis", "PostgreSQL", "MongoDB", "Kafka", "GraphQL",
  "Stripe", "Shopify", "Cloudflare", "CrowdStrike", "Palantir", "Snowflake", "Databricks",
];
midTier.forEach((name, i) => {
  const cat = cats[Math.floor(Math.random() * cats.length)];
  nodes.push({ id: `m${i}`, name, category: cat, weight: 70 + Math.floor(Math.random() * 25) });
});

// --- Peripheral nodes (162) ---
const perCats = ["产品", "框架", "工具", "服务", "协议", "标准", "概念", "趋势"];
for (let i = 0; i < 162; i++) {
  const cat = perCats[i % perCats.length];
  nodes.push({
    id: `p${i}`,
    name: `${cat}-${String(i + 1).padStart(3, "0")}`,
    category: cat,
    weight: 30 + Math.floor(Math.random() * 50),
  });
}

// --- Edges ---
const rng = (() => { let s = 123; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

// Hub -> Mid (each hub connects to 10-20 mid-tier)
hubs.forEach((_, hi) => {
  const count = 10 + Math.floor(rng() * 11);
  for (let c = 0; c < count; c++) {
    const mi = Math.floor(rng() * 30);
    edges.push({ source: `h${hi}`, target: `m${mi}`, relation: "关联", weight: 60 + Math.floor(rng() * 40) });
  }
});

// Hub -> Peripheral (each hub connects to 15-25 peripherals)
hubs.forEach((_, hi) => {
  const count = 15 + Math.floor(rng() * 11);
  for (let c = 0; c < count; c++) {
    const pi = Math.floor(rng() * 162);
    edges.push({ source: `h${hi}`, target: `p${pi}`, relation: "影响", weight: 40 + Math.floor(rng() * 40) });
  }
});

// Mid -> Peripheral (each mid connects to 3-8 peripherals)
midTier.forEach((_, mi) => {
  const count = 3 + Math.floor(rng() * 6);
  for (let c = 0; c < count; c++) {
    const pi = Math.floor(rng() * 162);
    edges.push({ source: `m${mi}`, target: `p${pi}`, relation: "使用", weight: 50 + Math.floor(rng() * 30) });
  }
});

// Hub -> Hub
for (let i = 0; i < hubs.length; i++) {
  for (let j = i + 1; j < hubs.length; j++) {
    if (rng() > 0.4) {
      edges.push({ source: `h${i}`, target: `h${j}`, relation: "竞争", weight: 70 + Math.floor(rng() * 30) });
    }
  }
}

// Deduplicate
const edgeSet = new Set<string>();
const uniqueEdges = edges.filter((e) => {
  const k = `${e.source}->${e.target}`;
  const kr = `${e.target}->${e.source}`;
  if (edgeSet.has(k) || edgeSet.has(kr)) return false;
  edgeSet.add(k);
  return true;
});

export const mediumScale: GraphData = {
  meta: {
    title: "科技产业图谱（200 节点）",
    description: "8 个核心企业 + 30 个中层实体 + 162 个外围节点，测试中等规模下的布局表现。",
  },
  nodes,
  edges: uniqueEdges,
};

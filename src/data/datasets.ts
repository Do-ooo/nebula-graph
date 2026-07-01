import { GraphData } from "../types";
import { threeBody } from "./threeBody";
import { aiEcosystem } from "./aiEcosystem";
import { mediumScale } from "./mediumScale";
import { largeScale } from "./largeScale";

export const DATASETS: Record<string, GraphData> = {
  threeBody,
  aiEcosystem,
  mediumScale,
  largeScale,
};

export const DATASET_KEYS = [
  { key: "threeBody", label: "《三体》宇宙关系图谱", count: threeBody.nodes.length },
  { key: "aiEcosystem", label: "AI 大模型生态图谱", count: aiEcosystem.nodes.length },
  { key: "mediumScale", label: "科技产业图谱（200 节点）", count: mediumScale.nodes.length },
  { key: "largeScale", label: "科技产业图谱（400 节点）", count: largeScale.nodes.length },
];

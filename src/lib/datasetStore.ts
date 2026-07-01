import { openDB } from "idb";
import { GraphData } from "../types";

const DB_NAME = "node-orbit-datasets";
const DB_VERSION = 1;
const STORE_NAME = "custom-datasets";

let dbPromise: ReturnType<typeof openDB> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveDataset(key: string, data: GraphData): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, data, key);
}

export async function loadAllDatasets(): Promise<Record<string, GraphData>> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  const result: Record<string, GraphData> = {};
  for (const key of keys) {
    const data = await db.get(STORE_NAME, key);
    if (data) result[key as string] = data as GraphData;
  }
  return result;
}

export async function deleteDataset(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

export async function getDatasetKeys(): Promise<string[]> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map((k) => k as string);
}

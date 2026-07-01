import { AppConfig } from "../types";

export interface SharedViewState {
  datasetKey: string;
  minWeight: number;
  hiddenCategories: string[];
  cameraPos?: [number, number, number];
  cameraTarget?: [number, number, number];
}

/**
 * Encodes the current view state into the URL hash
 */
export function encodeStateToHash(state: SharedViewState): void {
  try {
    const jsonStr = JSON.stringify(state);
    // Use btoa with encodeURIComponent to support Chinese characters and special symbols safely
    const b64 = btoa(encodeURIComponent(jsonStr));
    window.location.hash = `view=${b64}`;
  } catch (err) {
    console.error("Failed to encode state to hash:", err);
  }
}

/**
 * Decodes the view state from the URL hash
 */
export function decodeStateFromHash(): SharedViewState | null {
  try {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#view=")) return null;
    
    const b64 = hash.substring(6);
    if (!b64) return null;
    
    const jsonStr = decodeURIComponent(atob(b64));
    return JSON.parse(jsonStr) as SharedViewState;
  } catch (err) {
    console.error("Failed to decode state from hash:", err);
    return null;
  }
}

/**
 * Copies the current sharing link to clipboard
 */
export async function copyShareLink(state: SharedViewState): Promise<string> {
  encodeStateToHash(state);
  const link = window.location.href;
  await navigator.clipboard.writeText(link);
  return link;
}

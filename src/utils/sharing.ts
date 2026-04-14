import type { PlannerState } from './storage';

export function encodeState(state: PlannerState): string {
  const compact = {
    r: state.selectedRegions,
    c: state.completedTasks,
    p: state.taskPhases,
    o: state.taskOrder,
  };
  const json = JSON.stringify(compact);
  return btoa(encodeURIComponent(json));
}

export function decodeState(encoded: string): Partial<PlannerState> | null {
  try {
    const json = decodeURIComponent(atob(encoded));
    const compact = JSON.parse(json);
    return {
      selectedRegions: compact.r || [],
      completedTasks: compact.c || [],
      taskPhases: compact.p || {},
      taskOrder: compact.o || [],
    };
  } catch {
    return null;
  }
}

export function getShareUrl(state: PlannerState): string {
  const encoded = encodeState(state);
  const url = new URL(window.location.href);
  url.searchParams.set('state', encoded);
  return url.toString();
}

export function getStateFromUrl(): Partial<PlannerState> | null {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get('state');
  if (!encoded) return null;
  return decodeState(encoded);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readFromClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

const STORAGE_KEY = 'demonic-pacts-planner';

export interface PlannerState {
  selectedRegions: string[];
  completedTasks: number[];
  taskPhases: Record<number, number>;
  taskOrder: number[];
  version: number;
}

const DEFAULT_STATE: PlannerState = {
  selectedRegions: [],
  completedTasks: [],
  taskPhases: {},
  taskOrder: [],
  version: 1,
};

export function loadState(): PlannerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: PlannerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

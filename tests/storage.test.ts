import { describe, it, expect, beforeEach } from 'vitest';
import { loadState, saveState } from '../src/utils/storage';
import type { PlannerState } from '../src/utils/storage';

beforeEach(() => {
  localStorage.clear();
});

describe('storage', () => {
  it('returns default state when nothing saved', () => {
    const state = loadState();
    expect(state.selectedRegions).toEqual([]);
    expect(state.completedTasks).toEqual([]);
    expect(state.taskPhases).toEqual({});
    expect(state.taskOrder).toEqual([]);
    expect(state.version).toBe(1);
  });

  it('round-trips state through save and load', () => {
    const state: PlannerState = {
      selectedRegions: ['Desert', 'Morytania'],
      completedTasks: [1, 5, 10],
      taskPhases: { 1: 2, 5: 3 },
      taskOrder: [5, 1, 10],
      version: 1,
    };
    saveState(state);
    const loaded = loadState();
    expect(loaded).toEqual(state);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('demonic-pacts-planner', 'not json');
    const state = loadState();
    expect(state.selectedRegions).toEqual([]);
  });
});

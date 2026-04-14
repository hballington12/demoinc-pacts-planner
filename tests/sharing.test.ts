import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '../src/utils/sharing';
import type { PlannerState } from '../src/utils/storage';

describe('sharing', () => {
  it('round-trips state through encode and decode', () => {
    const state: PlannerState = {
      selectedRegions: ['Desert', 'Wilderness'],
      completedTasks: [0, 3, 7],
      taskPhases: { 0: 1, 3: 2 },
      taskOrder: [3, 0, 7],
      version: 1,
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.selectedRegions).toEqual(state.selectedRegions);
    expect(decoded!.completedTasks).toEqual(state.completedTasks);
    expect(decoded!.taskPhases).toEqual(state.taskPhases);
    expect(decoded!.taskOrder).toEqual(state.taskOrder);
  });

  it('returns null for invalid encoded data', () => {
    expect(decodeState('not-valid-base64!@#$')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeState('')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { PHASES } from '../src/data/phases';

describe('phases', () => {
  it('has 8 phases (including unassigned)', () => {
    expect(PHASES).toHaveLength(8);
  });

  it('phase 0 is Unassigned', () => {
    expect(PHASES[0].name).toBe('Unassigned');
  });

  it('each phase has required fields', () => {
    for (const phase of PHASES) {
      expect(phase).toHaveProperty('id');
      expect(phase).toHaveProperty('name');
      expect(phase).toHaveProperty('shortName');
      expect(phase).toHaveProperty('description');
      expect(phase).toHaveProperty('color');
      expect(phase.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('phase ids are sequential from 0', () => {
    PHASES.forEach((phase, index) => {
      expect(phase.id).toBe(index);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { tasks, TIERS, REGIONS, REGION_INFO } from '../src/data/tasks';

describe('tasks data', () => {
  it('has tasks loaded', () => {
    expect(tasks.length).toBeGreaterThan(600);
  });

  it('each task has required fields', () => {
    for (const task of tasks) {
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('name');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('tier');
      expect(task).toHaveProperty('region');
      expect(task).toHaveProperty('points');
      expect(['easy', 'medium', 'hard', 'elite', 'master']).toContain(task.tier);
    }
  });

  it('task ids are unique', () => {
    const ids = tasks.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('task points match tier', () => {
    for (const task of tasks) {
      expect(task.points).toBe(TIERS[task.tier]);
    }
  });

  it('all task regions are in REGIONS list', () => {
    const regionSet = new Set(REGIONS as readonly string[]);
    for (const task of tasks) {
      expect(regionSet.has(task.region)).toBe(true);
    }
  });

  it('REGION_INFO has all regions', () => {
    const infoKeys = Object.keys(REGION_INFO);
    expect(infoKeys).toContain('Varlamore');
    expect(infoKeys).toContain('Karamja');
    expect(infoKeys).toContain('General');
    expect(REGION_INFO['Varlamore'].type).toBe('starting');
    expect(REGION_INFO['Karamja'].type).toBe('first_unlock');
    expect(REGION_INFO['General'].type).toBe('always');
  });

  it('has expected tier distribution', () => {
    const tierCounts = { easy: 0, medium: 0, hard: 0, elite: 0, master: 0 };
    for (const task of tasks) {
      tierCounts[task.tier]++;
    }
    expect(tierCounts.easy).toBeGreaterThan(50);
    expect(tierCounts.medium).toBeGreaterThan(100);
    expect(tierCounts.hard).toBeGreaterThan(80);
    expect(tierCounts.elite).toBeGreaterThan(100);
    expect(tierCounts.master).toBeGreaterThan(10);
  });
});

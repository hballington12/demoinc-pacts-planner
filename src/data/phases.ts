export interface Phase {
  id: number;
  name: string;
  shortName: string;
  description: string;
  color: string;
}

export const PHASES: Phase[] = [
  {
    id: 0,
    name: 'Unassigned',
    shortName: 'None',
    description: 'Not yet assigned to a phase',
    color: '#4a4a4a',
  },
  {
    id: 1,
    name: 'Dead Weight',
    shortName: 'Dead Weight',
    description:
      'Universal grind tasks - same speed regardless of relics. Do these first while you have minimal buffs.',
    color: '#6b7280',
  },
  {
    id: 2,
    name: 'Early Burners',
    shortName: 'Early Burn',
    description:
      'Easy quick wins with minimal reliance on levels or items.',
    color: '#22c55e',
  },
  {
    id: 3,
    name: 'Balancing Load',
    shortName: 'Balance',
    description:
      'Even stat progression for a good balance of tasks without overcommitting into high levels.',
    color: '#3b82f6',
  },
  {
    id: 4,
    name: 'Mid Game Juice',
    shortName: 'Mid Game',
    description:
      'Start bossing more, push combat up, integrate tasks from other regions.',
    color: '#a855f7',
  },
  {
    id: 5,
    name: 'Bossing & Mid-Late Drags',
    shortName: 'Bossing',
    description:
      'Serious bossing and mid-to-late game grinds.',
    color: '#ef4444',
  },
  {
    id: 6,
    name: 'Pact Pushing',
    shortName: 'Pact Push',
    description:
      'Decent skill base - push through good value tasks and pact tasks to boost combat.',
    color: '#f59e0b',
  },
  {
    id: 7,
    name: 'Other Crap',
    shortName: 'Other',
    description:
      'Optional extras if you want more points.',
    color: '#78716c',
  },
];

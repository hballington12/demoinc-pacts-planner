import { TIERS } from '../data/tasks';
import type { Task } from '../data/tasks';
import { PHASES } from '../data/phases';

interface Props {
  tasks: Task[];
  completedTasks: number[];
  taskPhases: Record<number, number>;
}

export function StatsBar({ tasks, completedTasks, taskPhases }: Props) {
  const totalTasks = tasks.length;
  const completedCount = completedTasks.filter((id) =>
    tasks.some((t) => t.id === id)
  ).length;

  const totalPoints = tasks.reduce((sum, t) => sum + TIERS[t.tier], 0);
  const completedPoints = tasks
    .filter((t) => completedTasks.includes(t.id))
    .reduce((sum, t) => sum + TIERS[t.tier], 0);

  const totalPacts = tasks.filter((t) => t.pact).length;
  const completedPacts = tasks.filter(
    (t) => t.pact && completedTasks.includes(t.id)
  ).length;

  const phaseCounts = PHASES.map((phase) => {
    const count = tasks.filter(
      (t) => (taskPhases[t.id] || 0) === phase.id
    ).length;
    const done = tasks.filter(
      (t) =>
        (taskPhases[t.id] || 0) === phase.id &&
        completedTasks.includes(t.id)
    ).length;
    return { ...phase, count, done };
  });

  return (
    <div className="stats-bar">
      <div className="stats-overview">
        <div className="stat">
          <span className="stat-value">
            {completedCount}/{totalTasks}
          </span>
          <span className="stat-label">Tasks</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {completedPoints.toLocaleString()}/{totalPoints.toLocaleString()}
          </span>
          <span className="stat-label">Points</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-pact">
            {completedPacts}/{totalPacts}
          </span>
          <span className="stat-label">Pacts</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {totalTasks > 0
              ? Math.round((completedCount / totalTasks) * 100)
              : 0}
            %
          </span>
          <span className="stat-label">Progress</span>
        </div>
      </div>
      <div className="phase-stats">
        {phaseCounts
          .filter((p) => p.id > 0 && p.count > 0)
          .map((p) => (
            <div
              key={p.id}
              className="phase-stat"
              style={{ borderLeft: `3px solid ${p.color}` }}
            >
              <span className="phase-stat-name">{p.shortName}</span>
              <span className="phase-stat-count">
                {p.done}/{p.count}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

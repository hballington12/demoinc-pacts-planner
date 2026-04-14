import { TIERS } from '../data/tasks';
import type { Task } from '../data/tasks';
import { PHASES } from '../data/phases';

interface Props {
  task: Task;
  completed: boolean;
  phase: number;
  onToggleComplete: (id: number) => void;
  onSetPhase: (id: number, phase: number) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
}

export function TaskRow({
  task,
  completed,
  phase,
  onToggleComplete,
  onSetPhase,
  dragHandleProps,
}: Props) {
  const points = TIERS[task.tier];
  const phaseInfo = PHASES[phase] || PHASES[0];

  return (
    <tr className={`task-row ${completed ? 'completed' : ''}`}>
      <td className="task-drag" {...dragHandleProps}>
        <span className="drag-handle">&#x2630;</span>
      </td>
      <td className="task-check">
        <input
          type="checkbox"
          checked={completed}
          onChange={() => onToggleComplete(task.id)}
        />
      </td>
      <td className="task-name" title={task.description}>
        {task.name}
      </td>
      <td>
        <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>
      </td>
      <td className="task-region">{task.region}</td>
      <td className="task-points">{points}</td>
      <td className="task-phase">
        <select
          value={phase}
          onChange={(e) => onSetPhase(task.id, Number(e.target.value))}
          style={{ borderLeft: `3px solid ${phaseInfo.color}` }}
        >
          {PHASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.shortName}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

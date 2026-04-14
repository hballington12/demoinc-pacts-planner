import { TIERS } from '../data/tasks';
import type { Task } from '../data/tasks';
import { PHASES } from '../data/phases';

interface Props {
  task: Task;
  completed: boolean;
  phase: number;
  onToggleComplete: (id: number) => void;
  onSetPhase: (id: number, phase: number) => void;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}

export function TaskRow({
  task,
  completed,
  phase,
  onToggleComplete,
  onSetPhase,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: Props) {
  const points = TIERS[task.tier];
  const phaseInfo = PHASES[phase] || PHASES[0];

  return (
    <tr
      className={`task-row ${completed ? 'completed' : ''} ${isDragOver ? 'drag-over' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDragEnd(); }}
    >
      <td className="task-drag">
        <span
          className="drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          &#x2630;
        </span>
      </td>
      <td className="task-check">
        <input
          type="checkbox"
          checked={completed}
          onChange={() => onToggleComplete(task.id)}
        />
      </td>
      <td className="task-name" title={task.description}>
        {task.pact && <span className="pact-badge" title="Grants a Demonic Pact point">P</span>}
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

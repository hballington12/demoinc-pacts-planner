import { useState, useMemo, useRef, useCallback } from 'react';
import { TIERS } from '../data/tasks';
import type { Task } from '../data/tasks';
import { PHASES } from '../data/phases';
import { TaskRow } from './TaskRow';

type SortField = 'name' | 'tier' | 'region' | 'phase' | 'custom';
type SortDir = 'asc' | 'desc';

interface Props {
  tasks: Task[];
  completedTasks: number[];
  taskPhases: Record<number, number>;
  taskOrder: number[];
  onToggleComplete: (id: number) => void;
  onSetPhase: (id: number, phase: number) => void;
  onReorder: (draggedId: number, targetId: number) => void;
  selectedRegions: string[];
}

const TIER_ORDER = { easy: 0, medium: 1, hard: 2, elite: 3, master: 4 };

export function TaskList({
  tasks,
  completedTasks,
  taskPhases,
  taskOrder,
  onToggleComplete,
  onSetPhase,
  onReorder,
  selectedRegions,
}: Props) {
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPact, setFilterPact] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('custom');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const availableRegions = useMemo(() => {
    const available = new Set(['General', 'Varlamore', 'Karamja']);
    selectedRegions.forEach((r) => available.add(r));
    return available;
  }, [selectedRegions]);

  const filteredTasks = useMemo(() => {
    let result = tasks.filter((t) => availableRegions.has(t.region));

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(lower) ||
          t.description.toLowerCase().includes(lower)
      );
    }
    if (filterTier !== 'all') {
      result = result.filter((t) => t.tier === filterTier);
    }
    if (filterRegion !== 'all') {
      result = result.filter((t) => t.region === filterRegion);
    }
    if (filterPhase !== 'all') {
      const phaseId = Number(filterPhase);
      result = result.filter((t) => (taskPhases[t.id] || 0) === phaseId);
    }
    if (filterStatus === 'done') {
      result = result.filter((t) => completedTasks.includes(t.id));
    } else if (filterStatus === 'todo') {
      result = result.filter((t) => !completedTasks.includes(t.id));
    }
    if (filterPact === 'pact') {
      result = result.filter((t) => t.pact);
    } else if (filterPact === 'no-pact') {
      result = result.filter((t) => !t.pact);
    }

    if (sortField === 'custom') {
      const orderMap = new Map(taskOrder.map((id, i) => [id, i]));
      result.sort((a, b) => {
        const oa = orderMap.get(a.id) ?? a.id;
        const ob = orderMap.get(b.id) ?? b.id;
        return sortDir === 'asc' ? oa - ob : ob - oa;
      });
    } else if (sortField === 'tier') {
      result.sort((a, b) => {
        const diff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
        return sortDir === 'asc' ? diff : -diff;
      });
    } else if (sortField === 'phase') {
      result.sort((a, b) => {
        const diff = (taskPhases[a.id] || 0) - (taskPhases[b.id] || 0);
        return sortDir === 'asc' ? diff : -diff;
      });
    } else if (sortField === 'name') {
      result.sort((a, b) => {
        const diff = a.name.localeCompare(b.name);
        return sortDir === 'asc' ? diff : -diff;
      });
    } else if (sortField === 'region') {
      result.sort((a, b) => {
        const diff = a.region.localeCompare(b.region);
        return sortDir === 'asc' ? diff : -diff;
      });
    }

    return result;
  }, [
    tasks,
    search,
    filterTier,
    filterRegion,
    filterPhase,
    filterStatus,
    filterPact,
    sortField,
    sortDir,
    taskPhases,
    taskOrder,
    completedTasks,
    availableRegions,
  ]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField]
  );

  const handleDragStart = useCallback((taskId: number) => {
    dragItem.current = taskId;
  }, []);

  const handleDragEnter = useCallback((taskId: number) => {
    dragOverItem.current = taskId;
    setDragOverId(taskId);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      onReorder(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverId(null);
  }, [onReorder]);

  const handleBulkPhase = useCallback(
    (phase: number) => {
      filteredTasks.forEach((t) => onSetPhase(t.id, phase));
    },
    [filteredTasks, onSetPhase]
  );

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const uniqueFilterRegions = [...availableRegions].sort();

  return (
    <div className="task-list">
      <div className="task-filters">
        <input
          type="text"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
          <option value="all">All Tiers</option>
          {Object.keys(TIERS).map((t) => (
            <option key={t} value={t}>
              {t} ({TIERS[t as keyof typeof TIERS]}pts)
            </option>
          ))}
        </select>
        <select
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
        >
          <option value="all">All Regions</option>
          {uniqueFilterRegions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={filterPhase}
          onChange={(e) => setFilterPhase(e.target.value)}
        >
          <option value="all">All Phases</option>
          {PHASES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="todo">To Do</option>
          <option value="done">Done</option>
        </select>
        <select
          value={filterPact}
          onChange={(e) => setFilterPact(e.target.value)}
        >
          <option value="all">All Tasks</option>
          <option value="pact">Pact Tasks Only</option>
          <option value="no-pact">Non-Pact Only</option>
        </select>
      </div>

      <div className="task-bulk-actions">
        <span>{filteredTasks.length} tasks shown</span>
        <span className="bulk-label">Bulk assign phase:</span>
        {PHASES.filter((p) => p.id > 0).map((p) => (
          <button
            key={p.id}
            className="bulk-phase-btn"
            style={{ borderColor: p.color }}
            onClick={() => handleBulkPhase(p.id)}
            title={p.name}
          >
            {p.shortName}
          </button>
        ))}
      </div>

      <div className="task-table-wrap">
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th style={{ width: 30 }}></th>
              <th
                className="sortable"
                onClick={() => handleSort('name')}
              >
                Task{sortIndicator('name')}
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('tier')}
                style={{ width: 80 }}
              >
                Tier{sortIndicator('tier')}
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('region')}
                style={{ width: 100 }}
              >
                Region{sortIndicator('region')}
              </th>
              <th style={{ width: 60 }}>Pts</th>
              <th
                className="sortable"
                onClick={() => handleSort('phase')}
                style={{ width: 120 }}
              >
                Phase{sortIndicator('phase')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                completed={completedTasks.includes(task.id)}
                phase={taskPhases[task.id] || 0}
                onToggleComplete={onToggleComplete}
                onSetPhase={onSetPhase}
                isDragOver={dragOverId === task.id}
                onDragStart={() => handleDragStart(task.id)}
                onDragEnter={() => handleDragEnter(task.id)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

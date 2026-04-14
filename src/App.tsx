import { useState, useEffect, useCallback } from 'react';
import { tasks } from './data/tasks';
import { RegionSelector } from './components/RegionSelector';
import { TaskList } from './components/TaskList';
import { StatsBar } from './components/StatsBar';
import { SharePanel } from './components/SharePanel';
import { loadState, saveState } from './utils/storage';
import type { PlannerState } from './utils/storage';
import { getStateFromUrl } from './utils/sharing';
import './App.css';

function App() {
  const [state, setState] = useState<PlannerState>(() => {
    const urlState = getStateFromUrl();
    if (urlState) {
      const base = loadState();
      const merged = { ...base, ...urlState, version: 1 };
      window.history.replaceState({}, '', window.location.pathname);
      return merged;
    }
    return loadState();
  });

  useEffect(() => {
    saveState(state);
  }, [state]);

  const handleToggleRegion = useCallback((region: string) => {
    setState((prev) => {
      const selected = prev.selectedRegions.includes(region)
        ? prev.selectedRegions.filter((r) => r !== region)
        : [...prev.selectedRegions, region];
      return { ...prev, selectedRegions: selected };
    });
  }, []);

  const handleToggleComplete = useCallback((id: number) => {
    setState((prev) => {
      const completed = prev.completedTasks.includes(id)
        ? prev.completedTasks.filter((t) => t !== id)
        : [...prev.completedTasks, id];
      return { ...prev, completedTasks: completed };
    });
  }, []);

  const handleSetPhase = useCallback((id: number, phase: number) => {
    setState((prev) => ({
      ...prev,
      taskPhases: { ...prev.taskPhases, [id]: phase },
    }));
  }, []);

  const handleReorder = useCallback(
    (taskId: number, newIndex: number) => {
      setState((prev) => {
        const order = prev.taskOrder.length > 0
          ? [...prev.taskOrder]
          : tasks.map((t) => t.id);
        const currentIndex = order.indexOf(taskId);
        if (currentIndex === -1) return prev;
        order.splice(currentIndex, 1);
        order.splice(newIndex, 0, taskId);
        return { ...prev, taskOrder: order };
      });
    },
    []
  );

  const handleImport = useCallback((partial: Partial<PlannerState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleReset = useCallback(() => {
    if (window.confirm('Reset all progress? This cannot be undone.')) {
      setState({
        selectedRegions: [],
        completedTasks: [],
        taskPhases: {},
        taskOrder: [],
        version: 1,
      });
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Demonic Pacts Planner</h1>
        <p className="subtitle">OSRS Leagues VI Task Planner</p>
        <div className="header-actions">
          <SharePanel state={state} onImport={handleImport} />
          <button className="reset-btn" onClick={handleReset}>
            Reset
          </button>
        </div>
      </header>

      <RegionSelector
        selectedRegions={state.selectedRegions}
        onToggleRegion={handleToggleRegion}
      />

      <StatsBar
        tasks={tasks}
        completedTasks={state.completedTasks}
        taskPhases={state.taskPhases}
      />

      <TaskList
        tasks={tasks}
        completedTasks={state.completedTasks}
        taskPhases={state.taskPhases}
        taskOrder={state.taskOrder}
        onToggleComplete={handleToggleComplete}
        onSetPhase={handleSetPhase}
        onReorder={handleReorder}
        selectedRegions={state.selectedRegions}
      />
    </div>
  );
}

export default App;

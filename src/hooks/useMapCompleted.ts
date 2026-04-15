import { useState, useCallback } from 'react';

const STORAGE_KEY = 'map-viewer-completed';

function loadCompleted(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveCompleted(ids: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function useMapCompleted() {
  const [completed, setCompleted] = useState<Set<number>>(loadCompleted);

  const isCompleted = useCallback((id: number) => completed.has(id), [completed]);

  const toggleCompleted = useCallback((id: number) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveCompleted(next);
      return next;
    });
  }, []);

  return { completed, isCompleted, toggleCompleted, completedCount: completed.size };
}

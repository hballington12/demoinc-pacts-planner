import { useState, useCallback, useRef } from 'react';

interface MapTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4.0;

export function useMapInteraction(initialScale = 0.3) {
  const [transform, setTransform] = useState<MapTransform>({
    offsetX: 0,
    offsetY: 0,
    scale: initialScale,
  });

  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: transform.offsetX,
      oy: transform.offsetY,
    };
  }, [transform.offsetX, transform.offsetY]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setTransform((t) => ({
      ...t,
      offsetX: dragRef.current!.ox + (e.clientX - dragRef.current!.startX),
      offsetY: dragRef.current!.oy + (e.clientY - dragRef.current!.startY),
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;

    setTransform((t) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
      const ratio = newScale / t.scale;
      return {
        scale: newScale,
        offsetX: cx - ratio * (cx - t.offsetX),
        offsetY: cy - ratio * (cy - t.offsetY),
      };
    });
  }, []);

  const isDragging = useCallback(() => dragRef.current !== null, []);

  return { transform, onMouseDown, onMouseMove, onMouseUp, onWheel, isDragging };
}

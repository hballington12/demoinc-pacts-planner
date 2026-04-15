import { useState, useCallback, useRef, useEffect } from 'react';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const drag = dragRef.current;
    if (!drag) return;
    setTransform((t) => ({
      ...t,
      offsetX: drag.ox + (e.clientX - drag.startX),
      offsetY: drag.oy + (e.clientY - drag.startY),
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Use native wheel listener with {passive: false} to allow preventDefault
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
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
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const isDragging = useCallback(() => dragRef.current !== null, []);

  return { transform, canvasRef, onMouseDown, onMouseMove, onMouseUp, isDragging };
}

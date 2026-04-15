import { useRef, useEffect, useCallback } from 'react';
import { useMapInteraction } from '../../hooks/useMapInteraction';

interface MapMarker {
  id: number;
  x: number;
  y: number;
  color: number;
  text: string;
  completed: boolean;
}

interface PhaseRoute {
  visitOrder: number[];
  segments: number[][][];
}

interface Props {
  markers: MapMarker[];
  routes: Record<string, PhaseRoute>;
  visiblePhases: Set<number>;
  colors: string[];
  isCompleted: (id: number) => boolean;
  onToggleComplete: (id: number) => void;
  onHoverMarker: (marker: MapMarker | null, screenX: number, screenY: number) => void;
  mapImageUrl: string;
}

const MARKER_RADIUS = 8;

export function MapCanvas({
  markers,
  routes,
  visiblePhases,
  colors,
  isCompleted,
  onToggleComplete,
  onHoverMarker,
  mapImageUrl,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { transform, onMouseDown, onMouseMove, onMouseUp, onWheel, isDragging } =
    useMapInteraction(0.25);
  const clickStartRef = useRef<{ x: number; y: number } | null>(null);

  // Load map image
  useEffect(() => {
    const img = new Image();
    img.src = mapImageUrl;
    img.onload = () => {
      imgRef.current = img;
    };
  }, [mapImageUrl]);

  // Screen <-> map coordinate transforms
  const screenToMap = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - transform.offsetX) / transform.scale,
      y: (sy - transform.offsetY) / transform.scale,
    }),
    [transform]
  );

  // Hit test: find marker near screen position
  const hitTest = useCallback(
    (sx: number, sy: number): MapMarker | null => {
      const { x: mx, y: my } = screenToMap(sx, sy);
      const hitRadius = MARKER_RADIUS / transform.scale + 4;
      for (const m of markers) {
        if (Math.abs(mx - m.x) < hitRadius && Math.abs(my - m.y) < hitRadius) {
          return m;
        }
      }
      return null;
    },
    [markers, screenToMap, transform.scale]
  );

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Clear
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, w, h);

    // Draw map image
    if (img && img.complete) {
      ctx.save();
      ctx.translate(transform.offsetX, transform.offsetY);
      ctx.scale(transform.scale, transform.scale);
      // Dim the map
      ctx.globalAlpha = 0.55;
      ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = 1.0;
      ctx.restore();
    }

    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    // Draw route lines
    for (const [phaseStr, route] of Object.entries(routes)) {
      const phaseIdx = parseInt(phaseStr);
      if (!visiblePhases.has(phaseIdx)) continue;
      const color = colors[phaseIdx] || '#fff';

      for (const segment of route.segments) {
        if (segment.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(segment[0][0], segment[0][1]);
        for (let i = 1; i < segment.length; i++) {
          ctx.lineTo(segment[i][0], segment[i][1]);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / transform.scale;
        ctx.stroke();
      }

      // Number the stops
      const phaseMarkers = markers.filter(
        (m) => m.color === phaseIdx && !isCompleted(m.id)
      );
      ctx.font = `bold ${Math.max(8, 10 / transform.scale)}px Arial`;
      ctx.textAlign = 'center';
      for (let i = 0; i < route.visitOrder.length; i++) {
        const idx = route.visitOrder[i];
        if (idx < phaseMarkers.length) {
          const m = phaseMarkers[idx];
          ctx.fillStyle = color;
          ctx.fillText(String(i + 1), m.x, m.y - MARKER_RADIUS - 4 / transform.scale);
        }
      }
    }

    // Draw markers
    const r = MARKER_RADIUS;
    for (const m of markers) {
      const done = isCompleted(m.id);
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      if (done) {
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#555';
      } else {
        ctx.fillStyle = colors[m.color] || '#fff';
        ctx.strokeStyle = '#fff';
      }
      ctx.fill();
      ctx.lineWidth = 2 / transform.scale;
      ctx.stroke();

      if (done) {
        ctx.fillStyle = '#888';
        ctx.font = `bold ${9 / transform.scale}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2713', m.x, m.y);
      }
    }

    ctx.restore();
  }, [transform, markers, routes, visiblePhases, colors, isCompleted]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        // Trigger re-render by forcing state update
        canvas.dispatchEvent(new Event('resize'));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      clickStartRef.current = { x: e.clientX, y: e.clientY };
      onMouseDown(e);
    },
    [onMouseDown]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      onMouseMove(e);
      if (!isDragging()) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const hit = hitTest(sx, sy);
          onHoverMarker(hit, e.clientX, e.clientY);
        }
      }
    },
    [onMouseMove, isDragging, hitTest, onHoverMarker]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      onMouseUp();
      // Click (not drag) to toggle completion
      if (clickStartRef.current) {
        const dx = e.clientX - clickStartRef.current.x;
        const dy = e.clientY - clickStartRef.current.y;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const hit = hitTest(sx, sy);
            if (hit) onToggleComplete(hit.id);
          }
        }
      }
      clickStartRef.current = null;
    },
    [onMouseUp, hitTest, onToggleComplete]
  );

  return (
    <canvas
      ref={canvasRef}
      className="map-canvas"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { onMouseUp(); onHoverMarker(null, 0, 0); }}
      onWheel={onWheel}
      style={{ cursor: isDragging() ? 'grabbing' : 'grab' }}
    />
  );
}

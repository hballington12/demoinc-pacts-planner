import { useState, useCallback, useRef, useEffect } from 'react';
import { useMapInteraction } from '../hooks/useMapInteraction';
import mapData from '../data/map-data.json';
import './MapEditor.css';

const MARKER_COLORS = mapData.colors;
const MARKER_NAMES = mapData.colorNames;
const MARKER_RADIUS = 10;
const STORAGE_KEY = 'map-editor-markers';
const BASE_URL = import.meta.env.BASE_URL;

interface EditorMarker {
  id: number;
  x: number;
  y: number;
  color: number;
  text: string;
}

interface PendingMarker {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

function loadMarkers(): EditorMarker[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return mapData.markers.map((m) => ({
    id: m.id,
    x: m.x,
    y: m.y,
    color: m.color,
    text: m.text,
  }));
}

function saveMarkers(markers: EditorMarker[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
}

let nextId = 1000;

export function MapEditor() {
  const [markers, setMarkers] = useState<EditorMarker[]>(loadMarkers);
  const [selectedColor, setSelectedColor] = useState(0);
  const [hover, setHover] = useState<{ text: string; color: string; x: number; y: number } | null>(null);
  const [pending, setPending] = useState<PendingMarker | null>(null);
  const [inputText, setInputText] = useState('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { transform, canvasRef, onMouseDown, onMouseMove, onMouseUp, isDragging } =
    useMapInteraction(0.25);
  const clickStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { saveMarkers(markers); }, [markers]);

  useEffect(() => {
    const img = new Image();
    img.src = `${BASE_URL}map-cropped.jpg`;
    img.onload = () => { imgRef.current = img; };
  }, []);

  // Focus input when pending marker appears
  useEffect(() => {
    if (pending && inputRef.current) {
      inputRef.current.focus();
    }
  }, [pending]);

  const screenToMap = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - transform.offsetX) / transform.scale,
      y: (sy - transform.offsetY) / transform.scale,
    }),
    [transform]
  );

  const hitTest = useCallback(
    (sx: number, sy: number): EditorMarker | null => {
      const { x: mx, y: my } = screenToMap(sx, sy);
      const r = MARKER_RADIUS / transform.scale + 4;
      for (let i = markers.length - 1; i >= 0; i--) {
        const m = markers[i];
        if (Math.abs(mx - m.x) < r && Math.abs(my - m.y) < r) return m;
      }
      return null;
    },
    [markers, screenToMap, transform.scale]
  );

  const confirmMarker = useCallback(() => {
    if (!pending || !inputText.trim()) return;
    const id = nextId++;
    setMarkers((prev) => [...prev, { id, x: pending.x, y: pending.y, color: selectedColor, text: inputText.trim() }]);
    setPending(null);
    setInputText('');
  }, [pending, inputText, selectedColor]);

  const cancelMarker = useCallback(() => {
    setPending(null);
    setInputText('');
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (pending) return; // Don't pan while input is open
    clickStartRef.current = { x: e.clientX, y: e.clientY };
    onMouseDown(e);
  }, [onMouseDown, pending]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (pending) return;
    onMouseMove(e);
    if (!isDragging()) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const hit = hitTest(sx, sy);
        setHover(hit ? {
          text: hit.text,
          color: MARKER_COLORS[hit.color] || '#fff',
          x: e.clientX,
          y: e.clientY,
        } : null);
      }
    }
  }, [onMouseMove, isDragging, hitTest, canvasRef, pending]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (pending) return;
    onMouseUp();
    if (e.button !== 0) return;
    if (!clickStartRef.current) return;
    const dx = e.clientX - clickStartRef.current.x;
    const dy = e.clientY - clickStartRef.current.y;
    clickStartRef.current = null;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: mx, y: my } = screenToMap(sx, sy);

    setPending({ x: mx, y: my, screenX: e.clientX, screenY: e.clientY });
    setInputText('');
  }, [onMouseUp, canvasRef, screenToMap, pending]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (pending) { cancelMarker(); return; }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTest(sx, sy);
    if (hit) {
      setMarkers((prev) => prev.filter((m) => m.id !== hit.id));
    }
  }, [canvasRef, hitTest, pending, cancelMarker]);

  const handleClearAll = useCallback(() => {
    setMarkers([]);
    setShowConfirmClear(false);
  }, []);

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

    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, w, h);

    if (img && img.complete) {
      ctx.save();
      ctx.translate(transform.offsetX, transform.offsetY);
      ctx.scale(transform.scale, transform.scale);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = 1.0;
      ctx.restore();
    }

    for (const m of markers) {
      const sx = m.x * transform.scale + transform.offsetX;
      const sy = m.y * transform.scale + transform.offsetY;
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

      ctx.beginPath();
      ctx.arc(sx, sy, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLORS[m.color] || '#fff';
      ctx.strokeStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw pending marker preview
    if (pending) {
      const sx = pending.x * transform.scale + transform.offsetX;
      const sy = pending.y * transform.scale + transform.offsetY;
      ctx.beginPath();
      ctx.arc(sx, sy, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLORS[selectedColor] || '#fff';
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }, [transform, markers, canvasRef, pending, selectedColor]);

  const exportMarkers = useCallback(() => {
    const blob = new Blob([JSON.stringify(markers, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markers.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [markers]);

  const importMarkers = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (Array.isArray(data)) setMarkers(data);
        } catch { /* ignore */ }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  return (
    <div className="map-editor">
      <div className="editor-toolbar">
        <span className="editor-title">Map Labeller</span>
        <div className="color-picker">
          {MARKER_COLORS.map((color, i) => (
            <button
              key={i}
              className={`color-btn ${selectedColor === i ? 'active' : ''}`}
              style={{ background: color }}
              onClick={() => setSelectedColor(i)}
              title={MARKER_NAMES[i]}
            />
          ))}
        </div>
        <div className="editor-actions">
          <button onClick={exportMarkers}>Export</button>
          <button onClick={importMarkers}>Import</button>
          <button
            className="clear-btn"
            onClick={() => setShowConfirmClear(true)}
          >
            Clear All
          </button>
          <span className="marker-count">{markers.length} markers</span>
          <a href="#/map">Map Viewer</a>
          <a href="#/">Planner</a>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="editor-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { onMouseUp(); setHover(null); }}
        onContextMenu={handleRightClick}
        style={{ cursor: pending ? 'default' : isDragging() ? 'grabbing' : 'crosshair' }}
      />

      {/* Inline text input popup */}
      {pending && (
        <div
          className="marker-input-popup"
          style={{ left: pending.screenX + 16, top: pending.screenY - 16 }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmMarker();
              if (e.key === 'Escape') cancelMarker();
            }}
            placeholder="What needs to be done here?"
          />
          <button className="input-ok" onClick={confirmMarker}>OK</button>
          <button className="input-cancel" onClick={cancelMarker}>X</button>
        </div>
      )}

      {/* Confirm clear dialog */}
      {showConfirmClear && (
        <div className="confirm-overlay" onClick={() => setShowConfirmClear(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Clear all {markers.length} markers?</p>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={handleClearAll}>Clear All</button>
              <button onClick={() => setShowConfirmClear(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {hover && !pending && (
        <div
          className="editor-tooltip"
          style={{ left: hover.x + 16, top: hover.y - 12, borderColor: hover.color }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}

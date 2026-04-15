interface MapMarker {
  id: number;
  color: number;
  text: string;
}

interface Props {
  markers: MapMarker[];
  colors: string[];
  colorNames: string[];
  visiblePhases: Set<number>;
  onTogglePhase: (phase: number) => void;
  isCompleted: (id: number) => boolean;
  onResetPhase: (colorIdx: number) => void;
}

const PHASES = [
  { idx: 0, label: 'Phase 1' },
  { idx: 2, label: 'Phase 2' },
  { idx: 3, label: 'Phase 3' },
];

export function MapSidebar({
  markers,
  colors,
  colorNames,
  visiblePhases,
  onTogglePhase,
  isCompleted,
  onResetPhase,
}: Props) {
  return (
    <div className="map-sidebar">
      <h2>Demonic Pacts Map</h2>
      <p className="map-subtitle">Click markers to toggle completion</p>

      <div className="phase-toggles">
        <h3>Routes</h3>
        {PHASES.map(({ idx, label }) => {
          const phaseMarkers = markers.filter((m) => m.color === idx);
          const done = phaseMarkers.filter((m) => isCompleted(m.id)).length;
          const total = phaseMarkers.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <label key={idx} className="phase-toggle" style={{ borderColor: colors[idx] }}>
              <input
                type="checkbox"
                checked={visiblePhases.has(idx)}
                onChange={() => onTogglePhase(idx)}
              />
              <span style={{ color: colors[idx] }}>{label} ({colorNames[idx]})</span>
              <span className="phase-progress">
                {done}/{total} ({pct}%)
              </span>
              <div className="phase-bar">
                <div
                  className="phase-bar-fill"
                  style={{ width: `${pct}%`, background: colors[idx] }}
                />
              </div>
              {done > 0 && (
                <button
                  className="phase-reset-btn"
                  onClick={(e) => { e.preventDefault(); onResetPhase(idx); }}
                >
                  Reset ({done})
                </button>
              )}
            </label>
          );
        })}
      </div>

      <div className="map-stats">
        <h3>All Markers</h3>
        {[0, 2, 3, 8].map((cidx) => {
          const cm = markers.filter((m) => m.color === cidx);
          const done = cm.filter((m) => isCompleted(m.id)).length;
          if (cm.length === 0) return null;
          return (
            <div key={cidx} className="stat-row">
              <span className="stat-dot" style={{ background: colors[cidx] }} />
              <span>{colorNames[cidx]}: {done}/{cm.length}</span>
            </div>
          );
        })}
      </div>

      <div className="map-nav">
        <a href="#/">Back to Task Planner</a>
      </div>
    </div>
  );
}

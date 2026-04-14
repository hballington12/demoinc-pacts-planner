import { REGION_INFO } from '../data/tasks';

interface Props {
  selectedRegions: string[];
  onToggleRegion: (region: string) => void;
}

export function RegionSelector({ selectedRegions, onToggleRegion }: Props) {
  const allRegions = Object.values(REGION_INFO);
  const selectableRegions = allRegions.filter((r) => r.type === 'selectable');
  const fixedRegions = allRegions.filter(
    (r) => r.type === 'starting' || r.type === 'first_unlock'
  );
  const selectedCount = selectedRegions.filter((r) =>
    selectableRegions.some((sr) => sr.name === r)
  ).length;

  return (
    <div className="region-selector">
      <h3>Regions</h3>
      <div className="region-fixed">
        {fixedRegions.map((r) => (
          <span key={r.name} className="region-badge region-fixed-badge">
            {r.name}{' '}
            {r.type === 'starting' ? '(Start)' : '(Auto @ 80 tasks)'}
          </span>
        ))}
        <span className="region-badge region-fixed-badge">
          General (Always)
        </span>
      </div>
      <p className="region-pick-label">
        Pick up to 3 regions ({selectedCount}/3):
      </p>
      <div className="region-grid">
        {selectableRegions.map((r) => {
          const isSelected = selectedRegions.includes(r.name);
          const isDisabled = !isSelected && selectedCount >= 3;
          return (
            <button
              key={r.name}
              className={`region-btn ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => !isDisabled && onToggleRegion(r.name)}
              disabled={isDisabled}
            >
              {r.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

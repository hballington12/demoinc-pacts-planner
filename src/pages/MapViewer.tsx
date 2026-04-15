import { useState, useCallback } from 'react';
import { MapCanvas } from '../components/map/MapCanvas';
import { MapSidebar } from '../components/map/MapSidebar';
import { MapTooltip } from '../components/map/MapTooltip';
import { useMapCompleted } from '../hooks/useMapCompleted';
import mapData from '../data/map-data.json';
import './MapViewer.css';

interface HoverState {
  text: string;
  color: string;
  x: number;
  y: number;
}

const BASE_URL = import.meta.env.BASE_URL;

export function MapViewer() {
  const { isCompleted, toggleCompleted, resetIds } = useMapCompleted();
  const [visiblePhases, setVisiblePhases] = useState<Set<number>>(new Set([0, 2, 3]));
  const [hover, setHover] = useState<HoverState | null>(null);

  const togglePhase = useCallback((phase: number) => {
    setVisiblePhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  const onHoverMarker = useCallback(
    (marker: (typeof mapData.markers)[0] | null, screenX: number, screenY: number) => {
      if (marker) {
        setHover({
          text: marker.text,
          color: mapData.colors[marker.color] || '#fff',
          x: screenX,
          y: screenY,
        });
      } else {
        setHover(null);
      }
    },
    []
  );

  return (
    <div className="map-viewer">
      <MapSidebar
        markers={mapData.markers}
        colors={mapData.colors}
        colorNames={mapData.colorNames}
        visiblePhases={visiblePhases}
        onTogglePhase={togglePhase}
        isCompleted={isCompleted}
        onResetPhase={(colorIdx) => {
          const ids = mapData.markers.filter((m) => m.color === colorIdx).map((m) => m.id);
          resetIds(ids);
        }}
      />
      <div className="map-container">
        <MapCanvas
          markers={mapData.markers}
          routes={mapData.routes}
          visiblePhases={visiblePhases}
          colors={mapData.colors}
          isCompleted={isCompleted}
          onToggleComplete={toggleCompleted}
          onHoverMarker={onHoverMarker}
          mapImageUrl={`${BASE_URL}map-cropped.jpg`}
        />
      </div>
      {hover && <MapTooltip {...hover} />}
    </div>
  );
}

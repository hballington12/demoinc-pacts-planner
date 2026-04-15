interface Props {
  text: string;
  color: string;
  x: number;
  y: number;
}

export function MapTooltip({ text, color, x, y }: Props) {
  return (
    <div
      className="map-tooltip"
      style={{
        left: x + 16,
        top: y - 12,
        borderColor: color,
      }}
    >
      {text}
    </div>
  );
}

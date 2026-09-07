import React from 'react';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** Big figure in the middle — the total the segments add up to. */
  centerValue: number;
  centerLabel: string;
  size?: number;
  thickness?: number;
}

/**
 * Part-to-whole ring with the total as the hero figure in the middle.
 *
 * Colours are the app's status palette rather than a categorical one, because
 * the slices mean pass / fail / not answered. Those three are checked to stay
 * apart under protanopia and deuteranopia, but colour never carries the
 * meaning on its own here: every slice is named, counted and given a percentage
 * in the legend beside the ring, and each arc carries a tooltip of its own.
 *
 * Slices are separated by a 2px gap in the surface colour rather than by an
 * outline, so nothing draws a border around the data.
 */
export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  centerValue,
  centerLabel,
  size = 132,
  thickness = 16,
}) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const drawn = segments.filter((s) => s.value > 0);
  // A lone full ring has nothing to be separated from, so it takes no gap
  const gap = drawn.length > 1 ? 2 : 0;

  let cursor = 0;
  const arcs = drawn.map((segment) => {
    const fraction = total > 0 ? segment.value / total : 0;
    const length = Math.max(fraction * circumference - gap, 0.5);
    const arc = {
      ...segment,
      length,
      // Negative offset winds the arc forward from 12 o'clock
      offset: -cursor * circumference,
      percent: total > 0 ? Math.round(fraction * 100) : 0,
    };
    cursor += fraction;
    return arc;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${centerValue} ${centerLabel}: ${segments
        .map((s) => `${s.value} ${s.label}`)
        .join(', ')}`}
      className="shrink-0"
    >
      {/* Recessive track, so an empty or part-drawn ring still reads as a ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#EDEAE0"
        strokeWidth={thickness}
      />

      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={arc.offset}
            strokeLinecap="butt"
          >
            <title>{`${arc.label}: ${arc.value} of ${total} (${arc.percent}%)`}</title>
          </circle>
        ))}
      </g>

      <text
        x={size / 2}
        y={size / 2 - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-[#242217] font-bold"
        style={{ fontSize: 30 }}
      >
        {centerValue}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 20}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-[#635E4F] font-semibold uppercase"
        style={{ fontSize: 9, letterSpacing: '0.08em' }}
      >
        {centerLabel}
      </text>
    </svg>
  );
};

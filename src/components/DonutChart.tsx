'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** The figure in the middle. Give this the number that varies between records. */
  centerValue: number;
  /** Rendered straight after the value, e.g. "%". */
  centerSuffix?: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
}

/** How long the ring takes to draw itself, in milliseconds. */
const SWEEP_MS = 900;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * True when the reader has asked for less motion.
 *
 * Read synchronously on the first render rather than in an effect: starting
 * from "motion is fine" and correcting afterwards showed a frame of the
 * zero-length ring to exactly the people who asked not to see it move. The
 * signed-in chrome only renders after mount, so there is no server render of
 * this component to disagree with.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * Counts from 0 up to `target`, easing out, over `duration`. Returns `target`
 * straight away when motion is not wanted, and always lands exactly on it.
 */
function useCountUp(target: number, duration: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic — quick to begin with, settling at the end
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, enabled]);

  return value;
}

/**
 * Part-to-whole ring with the record's headline figure in the middle.
 *
 * The middle deliberately carries the number that *differs* between records —
 * the score — rather than the item count, which is the same on every
 * inspection of the same checklist and made every chart look alike.
 *
 * Colours are the app's status palette rather than a categorical one, because
 * the slices mean pass / fail / not answered. Those are checked to stay apart
 * under protanopia and deuteranopia, but colour never carries the meaning
 * alone: every slice is named, counted and given a percentage in the legend,
 * and each arc has a tooltip of its own.
 *
 * Slices are separated by a 2px gap in the surface colour rather than by an
 * outline, so nothing draws a border around the data.
 */
export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  centerValue,
  centerSuffix = '',
  centerLabel,
  size = 132,
  thickness = 16,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const animate = !reducedMotion;

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
      // Each slice starts drawing as the one before it finishes, so the ring
      // sweeps round once rather than every slice growing at the same time
      delay: Math.round(cursor * SWEEP_MS),
      duration: Math.max(Math.round(fraction * SWEEP_MS), 120),
      percent: total > 0 ? Math.round(fraction * 100) : 0,
    };
    cursor += fraction;
    return arc;
  });

  // Held back one frame so the browser has a zero-length ring to animate from.
  // Keyed on the data, so switching between records replays the sweep.
  const dataKey = `${centerValue}|${segments.map((s) => `${s.key}:${s.value}`).join(',')}`;
  const [drawnIn, setDrawnIn] = useState(!animate);
  useEffect(() => {
    if (!animate) {
      setDrawnIn(true);
      return;
    }
    setDrawnIn(false);
    const frame = requestAnimationFrame(() => setDrawnIn(true));
    return () => cancelAnimationFrame(frame);
  }, [dataKey, animate]);

  const shownValue = useCountUp(centerValue, SWEEP_MS, animate);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${centerValue}${centerSuffix} ${centerLabel}. ${segments
        .map((s) => `${s.value} ${s.label}`)
        .join(', ')}.`}
      className="shrink-0"
    >
      {/* Recessive track, so a part-drawn ring still reads as a ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#EFEFF2"
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
            strokeDasharray={`${drawnIn ? arc.length : 0} ${circumference}`}
            strokeDashoffset={arc.offset}
            strokeLinecap="butt"
            style={
              animate
                ? {
                    transition: `stroke-dasharray ${arc.duration}ms ease-out ${arc.delay}ms`,
                  }
                : undefined
            }
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
        className="fill-[#17181D] font-bold tabular-nums"
        style={{ fontSize: 30 }}
      >
        {shownValue}
        {centerSuffix}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 20}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-[#6B6F76] font-semibold uppercase"
        style={{ fontSize: 9, letterSpacing: '0.08em' }}
      >
        {centerLabel}
      </text>
    </svg>
  );
};

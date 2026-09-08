'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * A score as a ring with the figure in the middle.
 *
 * Small enough to sit in a table row, so there are no axes or legend — the
 * number in the centre is the reading, and the ring is there to make a row of
 * branches comparable at a glance. Colour repeats what the number already
 * says rather than carrying meaning on its own.
 */

const TRACK = '#EFEFF2';

/** The same three steps `ScorePill` uses, so a score never changes verdict between them. */
export function scoreColor(score: number): string {
  if (score >= 90) return '#157F4B';
  if (score >= 75) return '#B4740A';
  return '#C8202D';
}

const SWEEP_MS = 800;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * True when the reader has asked for less motion. Read synchronously on the
 * first render: starting from "motion is fine" and correcting in an effect
 * shows one frame of the empty ring to exactly the people who asked not to
 * see it move.
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

/** Sweeps 0 → `target`, easing out, and always lands exactly on it. */
function useSweep(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / SWEEP_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [target, enabled]);

  return value;
}

interface ScoreRingProps {
  score: number;
  size?: number;
  thickness?: number;
  /** Overrides the score-based colour, for rings that are not a pass/fail score. */
  color?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 46,
  thickness = 4,
  color,
}) => {
  const reduced = usePrefersReducedMotion();
  const swept = useSweep(score, !reduced);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const stroke = color ?? scoreColor(score);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${score} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TRACK}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(swept, 0) / 100)}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums"
        style={{ color: stroke, fontSize: Math.max(size * 0.26, 10) }}
      >
        {score}%
      </span>
    </div>
  );
};

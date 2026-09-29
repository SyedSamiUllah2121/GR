'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE_OUT, useSeenOnce, t } from './motion';

/**
 * The dashboard's charts, drawn by hand rather than through a library so every
 * one follows the same few rules:
 *
 *  - Colour does one job per chart. A single measure (a score, a count) wears
 *    one blue; an ordered scale (severity) is one hue light→dark; a status is
 *    the status colour, never a series colour. Checked with a colour-vision
 *    validator — see CHART_COLORS.
 *  - Thin marks: 2px lines, bars capped well under their row, 4px rounded
 *    data-ends square at the baseline, 2px surface gaps between touching fills.
 *  - Text never wears the data colour. Values and labels are ink; identity
 *    comes from the swatch beside them.
 *  - Every mark answers a hover, and every chart has a text alternative.
 *  - Motion only on arrival, from the baseline, and none at all when the
 *    device asks for reduced motion.
 */

export const CHART_COLORS = {
  /** The single data hue: scores and counts. 3.9:1 on white. */
  data: '#2a78d6',
  dataWash: 'rgba(42, 120, 214, 0.10)',
  /**
   * Severity, as one red ramp dark→light: critical, high, medium, low.
   * Validated as an ordinal ramp (monotone lightness, visible steps, the light
   * end clearing 2:1 on white). Always shipped with a legend and counts.
   */
  severity: {
    critical: '#7E121A',
    high: '#C01F2B',
    medium: '#E2555F',
    low: '#EC9299',
  },
  /**
   * Repair status. Adjacent-pair colour-vision separation passes; the amber
   * and green sit under 3:1 on white, so they always come with labels.
   */
  status: {
    notStarted: '#C8202D',
    inProgress: '#EDA100',
    completed: '#1BAF7A',
  },
  grid: '#EEF0F3',
  axis: '#9CA1A9',
} as const;

// ---------------------------------------------------------------------------
// Shared hover card
// ---------------------------------------------------------------------------

const Tip: React.FC<{ x: number; y: number; children: React.ReactNode; align?: 'center' | 'left' }> = ({
  x,
  y,
  children,
  align = 'center',
}) => (
  <div
    role="presentation"
    className="pointer-events-none absolute z-20 -translate-y-full rounded-lg bg-[#17181D] px-3 py-2 text-[11px] leading-snug text-white shadow-lg ring-1 ring-black/5 whitespace-nowrap"
    style={{
      left: x,
      top: y - 10,
      transform: `translate(${align === 'center' ? '-50%' : '0'}, -100%)`,
    }}
  >
    {children}
  </div>
);

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// ---------------------------------------------------------------------------
// Trend: one measure over time, as a line over a faint wash
// ---------------------------------------------------------------------------

export interface TrendPoint {
  /** What the x-axis and the tooltip call this point. */
  label: string;
  /** Short form for the axis, when the label is long. */
  shortLabel?: string;
  value: number;
  /** A second line in the tooltip. */
  detail?: string;
}

export const TrendChart: React.FC<{
  points: TrendPoint[];
  /** Names the line, for the tooltip and the text alternative. */
  seriesLabel: string;
  height?: number;
  min?: number;
  max?: number;
  suffix?: string;
}> = ({ points, seriesLabel, height = 200, min = 0, max = 100, suffix = '' }) => {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [seenRef, seen] = useSeenOnce<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const pad = { top: 12, right: 12, bottom: 26, left: 34 };
  const innerW = Math.max(width - pad.left - pad.right, 0);
  const innerH = height - pad.top - pad.bottom;

  const x = (i: number) =>
    pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area =
    points.length > 1
      ? `${line} L${x(points.length - 1)},${pad.top + innerH} L${x(0)},${pad.top + innerH} Z`
      : '';

  const ticks = [min, min + (max - min) * 0.25, min + (max - min) * 0.5, min + (max - min) * 0.75, max];

  // Three axis labels at most — first, middle, last — so they never collide
  const labelled = useMemo(() => {
    if (points.length <= 3) return points.map((_, i) => i);
    return [0, Math.floor((points.length - 1) / 2), points.length - 1];
  }, [points.length]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (points.length === 0) return;
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const step = points.length <= 1 ? innerW : innerW / (points.length - 1);
    const i = Math.round(px / (step || 1));
    setHover(Math.min(Math.max(i, 0), points.length - 1));
  };

  const summary =
    points.length === 0
      ? `${seriesLabel}: no data yet`
      : `${seriesLabel}: ${points.map((p) => `${p.label} ${p.value}${suffix}`).join(', ')}`;

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        seenRef.current = el;
      }}
      className="relative w-full select-none"
      style={{ height }}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary} className="overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.data} stopOpacity={0.16} />
              <stop offset="100%" stopColor={CHART_COLORS.data} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          {/* Recessive grid: hairline, solid, one step off the surface */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={pad.left + innerW}
                y1={y(t)}
                y2={y(t)}
                stroke={CHART_COLORS.grid}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={pad.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[#9CA1A9] text-[10px] tabular-nums"
              >
                {Math.round(t)}
              </text>
            </g>
          ))}

          {labelled.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}
              className="fill-[#9CA1A9] text-[10px]"
            >
              {points[i].shortLabel ?? points[i].label}
            </text>
          ))}

          {area && (
            <motion.path
              d={area}
              fill={`url(#${gradientId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: seen || reduced ? 1 : 0 }}
              transition={{ duration: t(0.6), delay: t(t(0.35)) }}
            />
          )}

          {points.length > 1 && (
            <motion.path
              d={line}
              fill="none"
              stroke={CHART_COLORS.data}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: seen || reduced ? 1 : 0 }}
              transition={{ duration: t(0.9), ease: EASE_OUT }}
            />
          )}

          {hover !== null && points[hover] && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="#C9CCD2"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}

          {/* Dots carry a 2px surface ring so they read where they cross the line */}
          {points.map((p, i) => (
            <motion.circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 5.5 : 4}
              fill={CHART_COLORS.data}
              stroke="#FFFFFF"
              strokeWidth={2}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: seen || reduced ? 1 : 0 }}
              transition={{ duration: t(0.3), delay: t(t(reduced ? 0 : 0.5 + i * 0.03)) }}
            />
          ))}

          {/* Hit area larger than the marks: the whole plot answers the pointer */}
          <rect
            x={pad.left}
            y={pad.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}

      {hover !== null && points[hover] && (
        <Tip x={x(hover)} y={y(points[hover].value)}>
          <span className="block text-white/60">{points[hover].label}</span>
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS.data }} />
            {seriesLabel} {points[hover].value}
            {suffix}
          </span>
          {points[hover].detail && <span className="block text-white/60">{points[hover].detail}</span>}
        </Tip>
      )}

      {/*
        The same numbers as a table, for screen readers. `sr-only` sits on a
        wrapper: a table will not shrink to its 1px box, and on a phone it
        pushed the page wider than the screen.
      */}
      <div className="sr-only">
      <table>
        <caption>{seriesLabel}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th scope="row">{p.label}</th>
              <td>
                {p.value}
                {suffix}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Bar list: one measure across a handful of things, longest first
// ---------------------------------------------------------------------------

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** What the value reads as, when it is not the bare number ("92%"). */
  display?: string;
  /** Beneath the label. */
  sub?: string;
  /** Drawn as an empty track with this text in place of a value. */
  empty?: string;
  href?: string;
  color?: string;
  /** The tooltip's second line. */
  detail?: string;
}

export const BarList: React.FC<{
  rows: BarRow[];
  /** The scale's end. Defaults to the largest value. */
  max?: number;
  label: string;
  renderLink?: (row: BarRow, children: React.ReactNode) => React.ReactNode;
}> = ({ rows, max, label, renderLink }) => {
  const [ref, seen] = useSeenOnce<HTMLUListElement>();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul ref={ref} className="space-y-3.5" aria-label={label}>
      {rows.map((row, i) => {
        const share = row.empty ? 0 : Math.min(row.value / top, 1);
        const body = (
          <div
            className="group relative"
            onPointerEnter={() => setHover(row.key)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[#17181D] truncate group-hover:text-black">
                  {row.label}
                </span>
                {row.sub && <span className="block text-[11px] text-[#6B6F76] truncate">{row.sub}</span>}
              </span>
              <span
                className={`shrink-0 text-[13px] tabular-nums ${
                  row.empty ? 'text-[11px] font-semibold text-[#9CA1A9]' : 'font-semibold text-[#17181D]'
                }`}
              >
                {row.empty ?? row.display ?? row.value.toLocaleString()}
              </span>
            </div>
            {/* Track then bar: rounded at the data end, square at the baseline */}
            <div className="mt-1.5 h-2 rounded-r-[4px] bg-[#F1F2F5] overflow-hidden">
              <motion.div
                className="h-full rounded-r-[4px]"
                style={{ background: row.color ?? CHART_COLORS.data, transformOrigin: 'left' }}
                initial={{ scaleX: reduced ? share : 0 }}
                animate={{ scaleX: seen || reduced ? share : 0 }}
                transition={{ duration: t(0.7), ease: EASE_OUT, delay: t(t(reduced ? 0 : 0.05 * i)) }}
              />
            </div>
            {hover === row.key && row.detail && (
              <Tip x={0} y={0} align="left">
                <span className="block font-semibold">{row.label}</span>
                <span className="block text-white/70">{row.detail}</span>
              </Tip>
            )}
          </div>
        );
        return (
          <li key={row.key}>
            {row.href && renderLink ? renderLink(row, body) : body}
          </li>
        );
      })}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// Stacked meter: one whole, split into named parts
// ---------------------------------------------------------------------------

export interface MeterPart {
  key: string;
  label: string;
  value: number;
  color: string;
}

export const StackedMeter: React.FC<{
  parts: MeterPart[];
  label: string;
  /** What a unit is called in the legend, "finding" / "job". */
  unit: string;
  height?: number;
}> = ({ parts, label, unit, height = 12 }) => {
  const [ref, seen] = useSeenOnce<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  const plural = (n: number) => `${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`;

  return (
    <div ref={ref}>
      <div
        className="relative flex w-full gap-[2px] overflow-hidden rounded-[4px] bg-[#F1F2F5]"
        style={{ height }}
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}
      >
        {total > 0 &&
          shown.map((part, i) => (
            <motion.div
              key={part.key}
              className="h-full first:rounded-l-[4px] last:rounded-r-[4px] cursor-default"
              style={{ background: part.color, flexBasis: 0, opacity: hover && hover !== part.key ? 0.45 : 1 }}
              initial={{ flexGrow: reduced ? part.value : 0 }}
              animate={{ flexGrow: seen || reduced ? part.value : 0 }}
              transition={{ duration: t(0.8), ease: EASE_OUT, delay: t(t(reduced ? 0 : 0.08 * i)) }}
              onPointerEnter={() => setHover(part.key)}
              onPointerLeave={() => setHover(null)}
              title={`${part.label}: ${plural(part.value)} (${Math.round((part.value / total) * 100)}%)`}
            />
          ))}
      </div>

      {/* The legend is the identity channel: swatch, name, count, share */}
      <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {parts.map((part) => (
          <li
            key={part.key}
            className={`flex items-center gap-2 min-w-0 transition-opacity ${
              hover && hover !== part.key ? 'opacity-50' : ''
            }`}
            onPointerEnter={() => setHover(part.key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: part.color }} />
            <span className="text-xs text-[#6B6F76] truncate">{part.label}</span>
            <span className="ml-auto text-xs font-semibold text-[#17181D] tabular-nums">
              {part.value.toLocaleString()}
            </span>
            <span className="w-9 text-right text-[11px] text-[#9CA1A9] tabular-nums">
              {total > 0 ? `${Math.round((part.value / total) * 100)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Score dial: one percentage as a ring, for a card that leads with a number
// ---------------------------------------------------------------------------

export const ScoreDial: React.FC<{ value: number | null; size?: number; stroke?: number }> = ({
  value,
  size = 132,
  stroke = 10,
}) => {
  const [ref, seen] = useSeenOnce<HTMLDivElement>();
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = value === null ? 0 : Math.min(Math.max(value, 0), 100) / 100;
  const tone = value === null ? '#C9CCD2' : value >= 90 ? '#157F4B' : value >= 75 ? '#B4740A' : '#C8202D';

  return (
    <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F2F5" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduced ? c * (1 - share) : c }}
          animate={{ strokeDashoffset: seen || reduced ? c * (1 - share) : c }}
          transition={{ duration: t(1.1), ease: EASE_OUT }}
        />
      </svg>
    </div>
  );
};

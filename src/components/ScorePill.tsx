import React from 'react';

interface ScorePillProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

/**
 * A score as a soft chip: the figure, and optionally the verdict it earns.
 *
 * The same three steps as `ScoreRing`, so a score never changes verdict
 * between the two. The dot and the word carry the verdict alongside the
 * tint, since the amber and the green are hard to tell apart for a protanope.
 */
export const ScorePill: React.FC<ScorePillProps> = ({ score, size = 'md', showLabel = false }) => {
  let colorClasses = '';
  let dotColor = '';
  let statusText = '';

  if (score >= 90) {
    colorClasses = 'bg-[#E6F4EC] text-[#12643C] ring-[#157F4B]/15';
    dotColor = 'bg-[#157F4B]';
    statusText = 'Pass';
  } else if (score >= 75) {
    colorClasses = 'bg-[#FDF3E2] text-[#8A5A08] ring-[#B4740A]/20';
    dotColor = 'bg-[#B4740A]';
    statusText = 'Warning';
  } else {
    colorClasses = 'bg-[#FDECEE] text-[#A81823] ring-[#C8202D]/15';
    dotColor = 'bg-[#C8202D]';
    statusText = 'Fail';
  }

  const sizeClasses =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5 gap-1'
      : size === 'lg'
      ? 'text-sm px-3.5 py-1.5 gap-2'
      : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span
      id={`score-pill-${score}`}
      className={`inline-flex items-center rounded-full font-bold tabular-nums ring-1 ring-inset ${colorClasses} ${sizeClasses} whitespace-nowrap`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden />
      <span>{score}%</span>
      {showLabel && <span className="font-semibold opacity-90">({statusText})</span>}
    </span>
  );
};

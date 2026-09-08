import React from 'react';

interface ScorePillProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const ScorePill: React.FC<ScorePillProps> = ({ score, size = 'md', showLabel = false }) => {
  let colorClasses = '';
  let statusText = '';

  if (score >= 90) {
    colorClasses = 'bg-[#E6F4EC] text-[#157F4B]';
    statusText = 'Pass';
  } else if (score >= 75) {
    colorClasses = 'bg-[#FDF3E2] text-[#B4740A]';
    statusText = 'Warning';
  } else {
    colorClasses = 'bg-[#FDECEE] text-[#C8202D]';
    statusText = 'Fail';
  }

  const sizeClasses =
    size === 'sm'
      ? 'text-xs px-2.5 py-0.5 font-bold'
      : size === 'lg'
      ? 'text-sm px-4 py-1.5 font-bold'
      : 'text-xs px-3 py-1 font-bold';

  return (
    <span
      id={`score-pill-${score}`}
      className={`inline-block rounded-full ${colorClasses} ${sizeClasses} whitespace-nowrap`}
    >
      <span>{score}%</span>
      {showLabel && <span className="ml-1 font-medium opacity-90">({statusText})</span>}
    </span>
  );
};

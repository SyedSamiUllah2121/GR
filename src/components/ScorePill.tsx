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
    colorClasses = 'bg-[#E7EEE4] text-[#2F5233]';
    statusText = 'Pass';
  } else if (score >= 75) {
    colorClasses = 'bg-[#F3ECD8] text-[#8A6318]';
    statusText = 'Warning';
  } else {
    colorClasses = 'bg-[#F4E4DF] text-[#9C3B2E]';
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

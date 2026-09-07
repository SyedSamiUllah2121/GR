import React from 'react';
import { AlertOctagon, AlertTriangle, Info, Minus } from 'lucide-react';
import { Severity } from '../types';
import { SEVERITY_LABEL } from '../services/priority';

const STYLES: Record<Severity, { classes: string; Icon: typeof AlertOctagon }> = {
  critical: { classes: 'bg-[#9C3B2E] text-white border-[#9C3B2E]', Icon: AlertOctagon },
  high: { classes: 'bg-[#F4E4DF] text-[#9C3B2E] border-[#9C3B2E]/35', Icon: AlertTriangle },
  medium: { classes: 'bg-[#F3ECD8] text-[#8A6318] border-[#8A6318]/35', Icon: Info },
  low: { classes: 'bg-[#F5F3EC] text-[#635E4F] border-[#DEDACB]', Icon: Minus },
};

interface PriorityBadgeProps {
  severity: Severity;
  size?: 'sm' | 'md';
  /** Marks the badge as raised above the item's own risk by reason or history. */
  escalated?: boolean;
  title?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  severity,
  size = 'md',
  escalated = false,
  title,
}) => {
  const { classes, Icon } = STYLES[severity];
  const sizeClasses =
    size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wider whitespace-nowrap ${classes} ${sizeClasses}`}
    >
      <Icon className={`${iconSize} shrink-0`} />
      <span>{SEVERITY_LABEL[severity]}</span>
      {escalated && <span className="font-black leading-none">↑</span>}
    </span>
  );
};

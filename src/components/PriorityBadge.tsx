import React from 'react';
import { AlertOctagon, AlertTriangle, Info, Minus } from 'lucide-react';
import { Severity } from '../types';
import { SEVERITY_LABEL } from '../services/priority';

/**
 * Critical is the only step drawn solid. It is the one that stops an
 * inspection being signed off, so it is allowed to shout; the rest are tinted
 * so a row with four findings does not read as four alarms.
 */
const STYLES: Record<Severity, { classes: string; Icon: typeof AlertOctagon }> = {
  critical: { classes: 'bg-[#C8202D] text-white border-[#C8202D]', Icon: AlertOctagon },
  high: { classes: 'bg-[#FDECEE] text-[#C8202D] border-[#C8202D]/25', Icon: AlertTriangle },
  medium: { classes: 'bg-[#FDF3E2] text-[#B4740A] border-[#B4740A]/25', Icon: Info },
  low: { classes: 'bg-[#F1F1F4] text-[#6B6F76] border-[#E6E7EB]', Icon: Minus },
};

/** The count sits in a chip of its own, so the number reads apart from the label. */
const COUNT_STYLES: Record<Severity, string> = {
  critical: 'bg-white/25 text-white',
  high: 'bg-[#C8202D]/10 text-[#C8202D]',
  medium: 'bg-[#B4740A]/10 text-[#B4740A]',
  low: 'bg-[#6B6F76]/10 text-[#6B6F76]',
};

interface PriorityBadgeProps {
  severity: Severity;
  size?: 'sm' | 'md';
  /** Marks the badge as raised above the item's own risk by reason or history. */
  escalated?: boolean;
  /** How many findings sit at this priority. Omitted when the badge labels one issue. */
  count?: number;
  title?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  severity,
  size = 'md',
  escalated = false,
  count,
  title,
}) => {
  const { classes, Icon } = STYLES[severity];
  const sizeClasses =
    size === 'sm' ? 'text-[10px] pl-1.5 pr-1.5 py-0.5 gap-1' : 'text-xs pl-2 pr-2 py-1 gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wider whitespace-nowrap ${classes} ${sizeClasses}`}
    >
      <Icon className={`${iconSize} shrink-0`} />
      <span>{SEVERITY_LABEL[severity]}</span>
      {escalated && <span className="font-black leading-none">↑</span>}
      {count !== undefined && (
        <span
          className={`ml-0.5 rounded-full px-1.5 tabular-nums leading-[1.35] ${COUNT_STYLES[severity]}`}
        >
          {count}
        </span>
      )}
    </span>
  );
};

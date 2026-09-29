import React from 'react';
import { CheckCircle2, Timer, Wrench } from 'lucide-react';
import { MAINTENANCE_STATUS_LABEL, MaintenanceStatus } from '../types';

/*
 * A tint and a text one step darker than the status colour, so the label
 * clears 4.5:1 on its own wash — the amber and green at full strength do not.
 * The word carries the state; the tint only repeats it.
 */
const STYLES: Record<MaintenanceStatus, string> = {
  reported: 'bg-[#FDECEE] text-[#A81823] ring-[#C8202D]/15',
  'in-progress': 'bg-[#FDF3E2] text-[#8A5A08] ring-[#B4740A]/20',
  completed: 'bg-[#E6F4EC] text-[#12643C] ring-[#157F4B]/15',
};

const ICONS: Record<MaintenanceStatus, typeof Wrench> = {
  reported: Wrench,
  'in-progress': Timer,
  completed: CheckCircle2,
};

export const StatusPill: React.FC<{ status: MaintenanceStatus }> = ({ status }) => {
  const Icon = ICONS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ring-inset text-[10px] font-bold uppercase tracking-[0.08em] leading-4 whitespace-nowrap ${STYLES[status]}`}
    >
      <Icon className="w-3 h-3" />
      {MAINTENANCE_STATUS_LABEL[status]}
    </span>
  );
};

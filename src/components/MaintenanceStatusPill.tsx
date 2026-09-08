import React from 'react';
import { CheckCircle2, Timer, Wrench } from 'lucide-react';
import { MAINTENANCE_STATUS_LABEL, MaintenanceStatus } from '../types';

const STYLES: Record<MaintenanceStatus, string> = {
  reported: 'bg-[#FDECEE] text-[#C8202D] border-[#C8202D]/25',
  'in-progress': 'bg-[#FDF3E2] text-[#B4740A] border-[#B4740A]/25',
  completed: 'bg-[#E6F4EC] text-[#157F4B] border-[#157F4B]/25',
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
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${STYLES[status]}`}
    >
      <Icon className="w-3 h-3" />
      {MAINTENANCE_STATUS_LABEL[status]}
    </span>
  );
};

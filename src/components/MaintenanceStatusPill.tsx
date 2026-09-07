import React from 'react';
import { CheckCircle2, Timer, Wrench } from 'lucide-react';
import { MAINTENANCE_STATUS_LABEL, MaintenanceStatus } from '../types';

const STYLES: Record<MaintenanceStatus, string> = {
  reported: 'bg-[#F4E4DF] text-[#9C3B2E] border-[#9C3B2E]/25',
  'in-progress': 'bg-[#F3ECD8] text-[#8A6318] border-[#8A6318]/25',
  completed: 'bg-[#E7EEE4] text-[#2F5233] border-[#2F5233]/25',
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

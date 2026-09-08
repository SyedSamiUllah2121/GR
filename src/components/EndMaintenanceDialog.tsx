'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { MaintenanceJob } from '../types';
import { completeJob, getLastPerson, rememberPerson } from '../services/maintenanceStore';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

/**
 * Closes a job off.
 *
 * Only "what was done" is required — that is the line the month-end report
 * actually reads back. Who attended is remembered from last time so it is
 * usually already filled in, and cost is left blank whenever it is not known.
 */
export const EndMaintenanceDialog: React.FC<{
  job: MaintenanceJob;
  onClose: () => void;
  onDone: (job: MaintenanceJob) => void;
}> = ({ job, onClose, onDone }) => {
  const [attendedBy, setAttendedBy] = useState(() => getLastPerson());
  const [resolutionNote, setResolutionNote] = useState('');
  const [cost, setCost] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const next: Record<string, string> = {};
    if (!resolutionNote.trim()) next.resolutionNote = 'A line on what was done is enough';

    const trimmedCost = cost.trim();
    let costValue: number | null = null;
    if (trimmedCost) {
      const parsed = Number(trimmedCost);
      if (!Number.isFinite(parsed) || parsed < 0) {
        next.cost = 'Enter a number, or leave it blank';
      } else {
        costValue = parsed;
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (attendedBy.trim()) rememberPerson(attendedBy);

    const saved = completeJob(job, { attendedBy, resolutionNote, cost: costValue });
    if (saved) onDone(saved);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 className="text-base font-bold text-[#17181D]">End maintenance</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5 truncate">{job.title}</p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label htmlFor="mnt-resolution" className={labelClass}>
              What was done
            </label>
            <textarea
              id="mnt-resolution"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Gas recharged and leaking joint resealed."
              className={`${inputClass} resize-y`}
            />
            {errors.resolutionNote && (
              <p className="text-xs font-semibold text-[#C8202D] mt-1">
                {errors.resolutionNote}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mnt-attended" className={labelClass}>
                Attended by (optional)
              </label>
              <input
                id="mnt-attended"
                type="text"
                value={attendedBy}
                onChange={(e) => setAttendedBy(e.target.value)}
                placeholder="Engineer or contractor"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="mnt-cost" className={labelClass}>
                Cost (optional)
              </label>
              <input
                id="mnt-cost"
                type="text"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Leave blank if unknown"
                className={inputClass}
              />
              {errors.cost && (
                <p className="text-xs font-semibold text-[#C8202D] mt-1">{errors.cost}</p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E6E7EB] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="mnt-complete-btn"
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Mark done</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

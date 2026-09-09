'use client';

import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { MaintenanceJob } from '../types';
import { setJobTimes } from '../services/maintenanceStore';
import { fromLocalInputValue, toLocalInputValue } from '../services/localDateTime';
import { formatDateTime } from '../services/reportModel';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

/**
 * Sets the start and finish times by hand.
 *
 * Both default to whatever the job already holds, and an unstarted job opens
 * with the start box set to now — so the common case is "press save", while
 * work that began earlier can still be recorded at the time it really began.
 */
export const JobTimesDialog: React.FC<{
  job: MaintenanceJob;
  onClose: () => void;
  onSaved: (job: MaintenanceJob) => void;
}> = ({ job, onClose, onSaved }) => {
  const [startedAt, setStartedAt] = useState(() =>
    job.startedAt ? toLocalInputValue(job.startedAt) : toLocalInputValue(new Date().toISOString())
  );
  const [completedAt, setCompletedAt] = useState(() => toLocalInputValue(job.completedAt));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = setJobTimes(job, {
      startedAt: fromLocalInputValue(startedAt),
      completedAt: fromLocalInputValue(completedAt),
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.job) onSaved(result.job);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-md my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 className="text-base font-bold text-[#17181D]">
            {job.startedAt ? 'Adjust the times' : 'Start maintenance'}
          </h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Problem reported {formatDateTime(job.reportedAt)}
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label htmlFor="job-started-at" className={labelClass}>
              Maintenance started
            </label>
            <input
              id="job-started-at"
              type="datetime-local"
              value={startedAt}
              onChange={(e) => {
                setStartedAt(e.target.value);
                setError(null);
              }}
              className={inputClass}
            />
            <p className="text-[11px] text-[#6B6F76] mt-1">
              Defaults to now. Change it if the work began earlier.
            </p>
          </div>

          {/* Only offered once there is a start to measure the finish against */}
          {job.startedAt && (
            <div>
              <label htmlFor="job-completed-at" className={labelClass}>
                Maintenance ended (optional)
              </label>
              <input
                id="job-completed-at"
                type="datetime-local"
                value={completedAt}
                onChange={(e) => {
                  setCompletedAt(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
              <p className="text-[11px] text-[#6B6F76] mt-1">
                Leave blank while the job is still running.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/25 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="pt-3 border-t border-[#E6E7EB] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="job-times-save-btn"
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              <span>{job.startedAt ? 'Save times' : 'Start maintenance'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

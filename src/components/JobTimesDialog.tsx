'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Clock, X } from 'lucide-react';
import { MaintenanceJob } from '../types';
import { setJobTimes } from '../services/maintenanceStore';
import { fromLocalInputValue, toLocalInputValue } from '../services/localDateTime';
import { formatDateTime } from '../services/reportModel';
import { useDialog } from '../hooks/useDialog';
import { EASE_OUT, t } from './motion';
import { BUTTON } from './ui';

const inputClass =
  'w-full h-11 px-3 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] shadow-xs focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow]';

const labelClass =
  'block text-xs font-semibold text-[#17181D] mb-1.5';

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

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    /*
     * The scrim only fades; the panel inside rises and scales. Nothing above a
     * `position: fixed` element may carry a transform, or it stops being fixed
     * to the window — so the movement is kept to the panel.
     */
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="jobtimesdialog-dialog-1-title"
      className="fixed inset-0 z-50 bg-[#17181D]/45 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: t(0.2) }}
    >
      <motion.div
        className="bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)] relative w-full max-w-md my-8 overflow-hidden"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: t(0.3), ease: EASE_OUT }}
      >
        <div className="pl-6 pr-14 py-4 border-b border-[#F0F1F4] flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
            <Clock className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="jobtimesdialog-dialog-1-title" className="text-[15px] font-bold text-[#17181D]">
              {job.startedAt ? 'Adjust the times' : 'Start maintenance'}
            </h3>
            <p className="text-xs text-[#6B6F76] mt-0.5">
              Problem reported {formatDateTime(job.reportedAt)}
            </p>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="p-6 space-y-5">
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
              <p className="text-[11px] text-[#9CA1A9] mt-1.5">
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
                <p className="text-[11px] text-[#9CA1A9] mt-1.5">
                  Leave blank while the job is still running.
                </p>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 text-xs font-semibold text-[#A81823] bg-[#FDECEE] border border-[#C8202D]/20 rounded-xl px-3 py-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC] flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={BUTTON.secondary}>
              Cancel
            </button>
            <button id="job-times-save-btn" type="submit" className={BUTTON.primary}>
              <Clock className="w-4 h-4" />
              <span>{job.startedAt ? 'Save times' : 'Start maintenance'}</span>
            </button>
          </div>
        </form>

        {/*
          Last in the panel so it is last in the tab order: the dialog opens
          with focus on its first field, and a close button placed first would
          take that instead. Drawn at the top corner all the same.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-[18px] right-4 w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </motion.div>
  );
};

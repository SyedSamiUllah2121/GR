'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Play,
  Plus,
  Square,
} from 'lucide-react';
import {
  BRANCHES,
  MAINTENANCE_CATEGORY_KEYS,
  MAINTENANCE_CATEGORY_LABEL,
  MaintenanceCategory,
  MaintenanceJob,
  MaintenanceStatus,
  SEVERITY_KEYS,
  Severity,
} from '../types';
import { SEVERITY_LABEL } from '../services/priority';
import {
  daysOpen,
  elapsedMinutes,
  getJobs,
  getLastPerson,
  rememberPerson,
  saveJob,
  statusOf,
  subscribeToMaintenance,
} from '../services/maintenanceStore';
import { buildBoard, formatMinutes } from '../services/maintenanceReport';
import { formatDateTime } from '../services/reportModel';
import { PriorityBadge } from './PriorityBadge';
import { StatusPill } from './MaintenanceStatusPill';
import { EndMaintenanceDialog } from './EndMaintenanceDialog';
import { JobTimesDialog } from './JobTimesDialog';
import { useToast } from './ToastProvider';

type Filter = 'open' | MaintenanceStatus | 'all';

export const MaintenanceScreen: React.FC = () => {
  const router = useRouter();
  const showToast = useToast();
  const [jobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());
  const [filter, setFilter] = useState<Filter>('open');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [logging, setLogging] = useState(false);
  const [ending, setEnding] = useState<MaintenanceJob | null>(null);
  const [starting, setStarting] = useState<MaintenanceJob | null>(null);

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  const board = useMemo(() => buildBoard(jobs), [jobs]);

  const visible = useMemo(() => {
    const byStatus = jobs.filter((job) => {
      const status = statusOf(job);
      if (filter === 'all') return true;
      if (filter === 'open') return status !== 'completed';
      return status === filter;
    });
    const byBranch =
      branchFilter === 'all'
        ? byStatus
        : byStatus.filter((job) => job.branchName === branchFilter);

    return byBranch.sort((a, b) => {
      const aDone = !!a.completedAt;
      const bDone = !!b.completedAt;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (aDone && bDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
      const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return a.reportedAt.localeCompare(b.reportedAt);
    });
  }, [jobs, filter, branchFilter]);



  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'open', label: 'Open', count: board.openCount },
    { key: 'reported', label: 'Not started', count: board.counts.reported },
    { key: 'in-progress', label: 'In progress', count: board.counts['in-progress'] },
    { key: 'completed', label: 'Done', count: board.counts.completed },
    { key: 'all', label: 'All', count: jobs.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#DEDACB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#242217]">Maintenance</h2>
          <p className="text-[#635E4F] text-xs mt-0.5">
            {board.openCount === 0
              ? 'Nothing outstanding'
              : `${board.openCount} job${board.openCount === 1 ? '' : 's'} outstanding${
                  board.urgentCount > 0 ? ` • ${board.urgentCount} urgent` : ''
                }`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href="/maintenance/report"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F5F3EC] border border-[#DEDACB] text-xs font-semibold text-[#242217] rounded-md transition-colors shadow-xs"
          >
            <FileText className="w-3.5 h-3.5 text-[#2F5233]" />
            <span>Month-end report</span>
          </Link>
          <button
            id="log-problem-btn"
            type="button"
            onClick={() => setLogging(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Report a problem</span>
          </button>
        </div>
      </header>

      <div className="p-6 md:p-10 flex-1 space-y-6">
        {board.urgentCount > 0 && (
          <div className="bg-[#F4E4DF] border border-[#9C3B2E]/30 rounded-lg px-5 py-3.5 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-[#9C3B2E] shrink-0" />
            <p className="text-xs font-semibold text-[#242217]">
              {board.urgentCount} outstanding job{board.urgentCount === 1 ? '' : 's'} at critical
              or high priority
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 border-b border-[#DEDACB] -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  filter === tab.key
                    ? 'border-[#2F5233] text-[#2F5233]'
                    : 'border-transparent text-[#635E4F] hover:text-[#242217]'
                }`}
              >
                {tab.label} <span className="tabular-nums">({tab.count})</span>
              </button>
            ))}
          </div>

          {board.branches.length > 1 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Filter by branch"
              className="px-3 py-2 bg-white border border-[#DEDACB] rounded-md text-xs text-[#242217] focus:outline-none focus:ring-1 focus:ring-[#2F5233]"
            >
              <option value="all">All branches</option>
              {board.branches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="bg-white border border-[#DEDACB] rounded-lg p-10 text-center shadow-xs">
            <CheckCircle2 className="w-8 h-8 text-[#2F5233] mx-auto mb-2.5" />
            <p className="text-sm font-bold text-[#242217]">Nothing here</p>
            <p className="text-xs text-[#635E4F] mt-1">
              {filter === 'open'
                ? 'No maintenance is outstanding.'
                : 'No jobs match this filter.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#DEDACB] rounded-lg shadow-xs divide-y divide-[#DEDACB] overflow-hidden">
            {visible.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onOpen={() => router.push(`/maintenance/${job.id}`)}
                onStart={() => setStarting(job)}
                onEnd={() => setEnding(job)}
              />
            ))}
          </div>
        )}
      </div>

      {logging && (
        <ReportProblemDialog
          onClose={() => setLogging(false)}
          onSaved={(job, started) => {
            setLogging(false);
            showToast(started ? `Started — ${job.title}` : 'Problem reported');
          }}
        />
      )}

      {starting && (
        <JobTimesDialog
          job={starting}
          onClose={() => setStarting(null)}
          onSaved={(job) => {
            setStarting(null);
            showToast(`Started — ${job.title}`);
          }}
        />
      )}

      {ending && (
        <EndMaintenanceDialog
          job={ending}
          onClose={() => setEnding(null)}
          onDone={() => {
            setEnding(null);
            showToast('Job marked done');
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Job row — the whole job can be moved along from here, without opening it
// ---------------------------------------------------------------------------

const JobRow: React.FC<{
  job: MaintenanceJob;
  onOpen: () => void;
  onStart: () => void;
  onEnd: () => void;
}> = ({ job, onOpen, onStart, onEnd }) => {
  const status = statusOf(job);
  const waiting = daysOpen(job);

  return (
    <div className="px-5 py-4 flex flex-wrap items-start gap-x-5 gap-y-3 hover:bg-[#F9F8F4] transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-[14rem] text-left cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#242217]">{job.title}</span>
          <PriorityBadge severity={job.priority} size="sm" />
          <StatusPill status={status} />
        </div>
        <p className="text-xs text-[#635E4F] mt-1">
          {job.branchName}
          {job.equipment ? ` • ${job.equipment}` : ''} •{' '}
          {MAINTENANCE_CATEGORY_LABEL[job.category]}
        </p>
        <p className="text-[11px] text-[#635E4F] mt-0.5">
          Reported {formatDateTime(job.reportedAt)} by {job.reportedBy}
          {status === 'reported' && waiting > 0 && (
            <span className="text-[#8A6318] font-semibold">
              {' '}
              • waiting {waiting} day{waiting === 1 ? '' : 's'}
            </span>
          )}
        </p>
        {job.startedAt && (
          <p className="text-[11px] font-semibold text-[#8A6318] mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3 shrink-0" />
            Started {formatDateTime(job.startedAt)}
            {status === 'in-progress' && (
              <span className="font-normal text-[#635E4F]">
                • running {formatMinutes(elapsedMinutes(job))}
              </span>
            )}
          </p>
        )}
      </button>

      {/* The next step, right here on the row */}
      <div className="flex items-center gap-2 shrink-0">
        {status === 'reported' && (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
            title="Record that work has started"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Start</span>
          </button>
        )}
        {status === 'in-progress' && (
          <button
            type="button"
            onClick={onEnd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
            title="Record that work has finished"
          >
            <Square className="w-3.5 h-3.5" />
            <span>End</span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open job"
          className="p-1.5 text-[#635E4F] hover:text-[#242217] rounded-md transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Report a problem
// ---------------------------------------------------------------------------

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#DEDACB] rounded-md text-sm text-[#242217] placeholder:text-[#635E4F]/50 focus:outline-none focus:border-[#2F5233] focus:ring-1 focus:ring-[#2F5233]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5';

/**
 * Three fields to raise a problem: where, what, how urgent. Everything else is
 * useful but not worth blocking on, so it sits behind "Add more detail".
 *
 * "Start now" saves and stamps the start time in one action, for the common
 * case where the problem is being written up as the work begins.
 */
const ReportProblemDialog: React.FC<{
  onClose: () => void;
  onSaved: (job: MaintenanceJob, started: boolean) => void;
}> = ({ onClose, onSaved }) => {
  const [branchName, setBranchName] = useState(BRANCHES[0].name);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Severity>('medium');
  const [reportedBy, setReportedBy] = useState(() => getLastPerson());

  const [showMore, setShowMore] = useState(false);
  const [equipment, setEquipment] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('OTHER');

  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = (startNow: boolean) => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Say what the problem is';
    if (!reportedBy.trim()) next.reportedBy = 'Your name';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    rememberPerson(reportedBy);

    const now = new Date().toISOString();
    const job: MaintenanceJob = {
      id: `mnt-${Date.now()}`,
      branchName,
      title: title.trim(),
      details: details.trim(),
      equipment: equipment.trim(),
      category,
      priority,
      reportedBy: reportedBy.trim(),
      reportedAt: now,
      // Start now stamps the same moment, so the job opens already running
      startedAt: startNow ? now : null,
      completedAt: null,
      attendedBy: null,
      resolutionNote: null,
      cost: null,
      photo: null,
    };
    saveJob(job);
    onSaved(job, startNow);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#242217]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#DEDACB] rounded-lg shadow-lg w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b border-[#DEDACB]">
          <h3 className="text-base font-bold text-[#242217]">Report a problem</h3>
          <p className="text-xs text-[#635E4F] mt-0.5">
            Three things is enough. Add the rest later if you need to.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
          className="p-6 space-y-5"
        >
          <div>
            <label htmlFor="mnt-title" className={labelClass}>
              What is wrong?
            </label>
            <input
              id="mnt-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="e.g. Dining area AC not cooling"
              className={inputClass}
            />
            {errors.title && (
              <p className="text-xs font-semibold text-[#9C3B2E] mt-1">{errors.title}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mnt-branch" className={labelClass}>
                Branch
              </label>
              <select
                id="mnt-branch"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className={inputClass}
              >
                {BRANCHES.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mnt-reporter" className={labelClass}>
                Your name
              </label>
              <input
                id="mnt-reporter"
                type="text"
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                placeholder="Remembered next time"
                className={inputClass}
              />
              {errors.reportedBy && (
                <p className="text-xs font-semibold text-[#9C3B2E] mt-1">{errors.reportedBy}</p>
              )}
            </div>
          </div>

          <div>
            <span className={labelClass}>How urgent?</span>
            <div className="flex flex-wrap gap-1.5">
              {[...SEVERITY_KEYS].reverse().map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPriority(s)}
                  aria-pressed={priority === s}
                  className={`px-3 py-2 rounded-md border text-[11px] font-bold transition-colors cursor-pointer ${
                    priority === s
                      ? 'border-[#2F5233] bg-[#E7EEE4] text-[#2F5233]'
                      : 'border-[#DEDACB] bg-white text-[#635E4F] hover:bg-[#F5F3EC]'
                  }`}
                >
                  {SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Optional extras stay out of the way until wanted */}
          <div className="border-t border-[#EDEAE0] pt-4">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2F5233] hover:underline cursor-pointer"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showMore ? '' : '-rotate-90'}`}
              />
              {showMore ? 'Hide extra detail' : 'Add more detail (optional)'}
            </button>

            {showMore && (
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="mnt-equipment" className={labelClass}>
                    Which unit or area
                  </label>
                  <input
                    id="mnt-equipment"
                    type="text"
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    placeholder="e.g. Split AC 2 — dining area"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="mnt-category" className={labelClass}>
                    Category
                  </label>
                  <select
                    id="mnt-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
                    className={inputClass}
                  >
                    {MAINTENANCE_CATEGORY_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {MAINTENANCE_CATEGORY_LABEL[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="mnt-details" className={labelClass}>
                    Details
                  </label>
                  <textarea
                    id="mnt-details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    placeholder="Anything that helps whoever picks this up."
                    className={`${inputClass} resize-y`}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#DEDACB] flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#DEDACB] rounded-md text-xs font-semibold text-[#635E4F] hover:text-[#242217] hover:bg-[#F5F3EC] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="mnt-save-btn"
              type="submit"
              className="px-4 py-2.5 bg-white hover:bg-[#F5F3EC] border border-[#DEDACB] text-xs font-semibold text-[#242217] rounded-md transition-colors cursor-pointer"
            >
              Report it
            </button>
            <button
              id="mnt-save-start-btn"
              type="button"
              onClick={() => save(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
            >
              <Play className="w-4 h-4" />
              <span>Report &amp; start now</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Play,
  Repeat,
  Plus,
  Search,
  Square,
  X,
} from 'lucide-react';
import {
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
import { RepeatGroup, buildBoard, buildRepeats, formatMinutes } from '../services/maintenanceReport';
import { formatDateTime } from '../services/reportModel';
import { PriorityBadge } from './PriorityBadge';
import { StatusPill } from './MaintenanceStatusPill';
import { EndMaintenanceDialog } from './EndMaintenanceDialog';
import { JobTimesDialog } from './JobTimesDialog';
import { useToast } from './ToastProvider';
import { useBranches } from '../hooks/useBranches';
import { activeBranches } from '../services/branchStore';

/** 'repeats' is a different shape of list, not another status slice. */
type Filter = 'open' | MaintenanceStatus | 'all' | 'repeats';

export const MaintenanceScreen: React.FC = () => {
  const router = useRouter();
  const showToast = useToast();
  const [jobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());
  const [filter, setFilter] = useState<Filter>('open');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [logging, setLogging] = useState(false);
  const [ending, setEnding] = useState<MaintenanceJob | null>(null);
  const [starting, setStarting] = useState<MaintenanceJob | null>(null);

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  const board = useMemo(() => buildBoard(jobs), [jobs]);

  /** Free text against everything worth searching on one job. */
  const matchesQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return () => true;
    return (job: MaintenanceJob) =>
      [
        job.title,
        job.equipment,
        job.branchName,
        job.details,
        job.reportedBy,
        job.attendedBy ?? '',
        MAINTENANCE_CATEGORY_LABEL[job.category],
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
  }, [query]);

  const repeats = useMemo(() => {
    const scoped = jobs.filter(
      (job) => branchFilter === 'all' || job.branchName === branchFilter
    );
    // Group first, then match: a unit stays findable by any of its occurrences
    return buildRepeats(scoped).filter(
      (group) => group.jobs.some(matchesQuery) || group.label.toLowerCase().includes(query.trim().toLowerCase())
    );
  }, [jobs, branchFilter, matchesQuery, query]);

  /** How many units are repeating, ignoring the search box. */
  const repeatCount = useMemo(
    () => buildRepeats(jobs).length,
    [jobs]
  );

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

    return byBranch.filter(matchesQuery).sort((a, b) => {
      const aDone = !!a.completedAt;
      const bDone = !!b.completedAt;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (aDone && bDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
      const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return a.reportedAt.localeCompare(b.reportedAt);
    });
  }, [jobs, filter, branchFilter, matchesQuery]);



  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'open', label: 'Open', count: board.openCount },
    { key: 'reported', label: 'Not started', count: board.counts.reported },
    { key: 'in-progress', label: 'In progress', count: board.counts['in-progress'] },
    { key: 'completed', label: 'Done', count: board.counts.completed },
    { key: 'all', label: 'All', count: jobs.length },
    { key: 'repeats', label: 'Repeated', count: repeatCount },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#17181D]">Maintenance</h2>
          <p className="text-[#6B6F76] text-xs mt-0.5">
            {board.openCount === 0
              ? 'Nothing outstanding'
              : `${board.openCount} job${board.openCount === 1 ? '' : 's'} outstanding${
                  board.urgentCount > 0 ? ` • ${board.urgentCount} urgent` : ''
                }`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            id="log-problem-btn"
            type="button"
            onClick={() => setLogging(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Report a problem</span>
          </button>
        </div>
      </header>

      <div className="p-6 md:p-10 flex-1 space-y-6">
        {board.urgentCount > 0 && (
          <div className="bg-[#FDECEE] border border-[#C8202D]/30 rounded-lg px-5 py-3.5 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-[#C8202D] shrink-0" />
            <p className="text-xs font-semibold text-[#17181D]">
              {board.urgentCount} outstanding job{board.urgentCount === 1 ? '' : 's'} at critical
              or high priority
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 border-b border-[#E6E7EB] -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  filter === tab.key
                    ? 'border-[#C8202D] text-[#C8202D]'
                    : 'border-transparent text-[#6B6F76] hover:text-[#17181D]'
                }`}
              >
                {tab.label} <span className="tabular-nums">({tab.count})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#9CA1A9] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="maintenance-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jobs, units, branches…"
                aria-label="Search maintenance"
                className="w-52 sm:w-64 pl-9 pr-8 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D] transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA1A9] hover:text-[#17181D] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          {board.branches.length > 1 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Filter by branch"
              className="px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
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
        </div>

        {filter === 'repeats' ? (
          repeats.length === 0 ? (
            <div className="bg-white border border-[#E6E7EB] rounded-lg p-10 text-center shadow-xs">
              <CheckCircle2 className="w-8 h-8 text-[#157F4B] mx-auto mb-2.5" />
              <p className="text-sm font-bold text-[#17181D]">
                {query.trim() ? 'Nothing matches that search' : 'Nothing is repeating'}
              </p>
              <p className="text-xs text-[#6B6F76] mt-1">
                {query.trim()
                  ? 'No repeat offender matches what you typed.'
                  : 'No unit has been reported more than once.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {repeats.map((group) => (
                <RepeatCard
                  key={group.key}
                  group={group}
                  onOpen={(id: string) => router.push(`/maintenance/${id}`)}
                />
              ))}
            </div>
          )
        ) : visible.length === 0 ? (
          <div className="bg-white border border-[#E6E7EB] rounded-lg p-10 text-center shadow-xs">
            <CheckCircle2 className="w-8 h-8 text-[#157F4B] mx-auto mb-2.5" />
            <p className="text-sm font-bold text-[#17181D]">Nothing here</p>
            <p className="text-xs text-[#6B6F76] mt-1">
              {filter === 'open'
                ? 'No maintenance is outstanding.'
                : 'No jobs match this filter.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs divide-y divide-[#E6E7EB] overflow-hidden">
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

/**
 * One unit that keeps breaking.
 *
 * The headline is the count and the span — "4 times over 62 days" is what
 * makes a repeat worth acting on, and neither number means much alone. The
 * occurrences are listed underneath so you can see what happened and when.
 */
const RepeatCard: React.FC<{
  group: RepeatGroup;
  onOpen: (id: string) => void;
}> = ({ group, onOpen }) => {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="w-10 h-10 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
          <Repeat className="w-5 h-5" />
        </span>

        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-bold text-[#17181D]">{group.label}</p>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            {group.branchName}
            {group.totalCost !== null && (
              <> • {group.totalCost.toLocaleString()} spent so far</>
            )}
          </p>
        </div>

        {/* How bad the pattern is, in the two numbers that say it */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-center">
            <p className="text-xl font-bold text-[#C8202D] tabular-nums leading-none">
              {group.times}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mt-1">
              times
            </p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-[#17181D] tabular-nums leading-none">
              {group.spanDays}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mt-1">
              days apart
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PriorityBadge severity={group.worstPriority} size="sm" />
          {group.openCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDF3E2] text-[#B4740A]">
              {group.openCount} open
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer shrink-0"
        >
          {open ? 'Hide' : 'History'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {!open && (
        <p className="px-5 pb-4 -mt-1 text-xs text-[#6B6F76]">
          First reported {formatDateTime(group.firstReportedAt)} • most recently{' '}
          {formatDateTime(group.lastReportedAt)}
        </p>
      )}

      {open && (
        <ul className="border-t border-[#EFEFF2] divide-y divide-[#EFEFF2]">
          {group.jobs.map((job, index) => (
            <li key={job.id}>
              <button
                type="button"
                onClick={() => onOpen(job.id)}
                className="w-full px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
              >
                {/* Newest is #1, so the numbering matches the order read */}
                <span className="w-6 h-6 rounded-full bg-[#F1F1F4] text-[10px] font-bold text-[#6B6F76] flex items-center justify-center shrink-0 tabular-nums">
                  {group.jobs.length - index}
                </span>
                <span className="flex-1 min-w-[12rem]">
                  <span className="block text-xs font-semibold text-[#17181D]">{job.title}</span>
                  <span className="block text-[11px] text-[#6B6F76] mt-0.5">
                    Reported {formatDateTime(job.reportedAt)} by {job.reportedBy}
                  </span>
                </span>
                <StatusPill status={statusOf(job)} />
                <ChevronRight className="w-4 h-4 text-[#9CA1A9] shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const JobRow: React.FC<{
  job: MaintenanceJob;
  onOpen: () => void;
  onStart: () => void;
  onEnd: () => void;
}> = ({ job, onOpen, onStart, onEnd }) => {
  const status = statusOf(job);
  const waiting = daysOpen(job);

  return (
    <div className="px-5 py-4 flex flex-wrap items-start gap-x-5 gap-y-3 hover:bg-[#FAFAFA] transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-[14rem] text-left cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#17181D]">{job.title}</span>
          <PriorityBadge severity={job.priority} size="sm" />
          <StatusPill status={status} />
        </div>
        <p className="text-xs text-[#6B6F76] mt-1">
          {job.branchName}
          {job.equipment ? ` • ${job.equipment}` : ''} •{' '}
          {MAINTENANCE_CATEGORY_LABEL[job.category]}
        </p>
        <p className="text-[11px] text-[#6B6F76] mt-0.5">
          Reported {formatDateTime(job.reportedAt)} by {job.reportedBy}
          {status === 'reported' && waiting > 0 && (
            <span className="text-[#B4740A] font-semibold">
              {' '}
              • waiting {waiting} day{waiting === 1 ? '' : 's'}
            </span>
          )}
        </p>
        {job.startedAt && (
          <p className="text-[11px] font-semibold text-[#B4740A] mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3 shrink-0" />
            Started {formatDateTime(job.startedAt)}
            {status === 'in-progress' && (
              <span className="font-normal text-[#6B6F76]">
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
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
          className="p-1.5 text-[#6B6F76] hover:text-[#17181D] rounded-md transition-colors cursor-pointer"
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
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

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
  const branches = activeBranches(useBranches());
  const [branchName, setBranchName] = useState(() => branches[0]?.name ?? '');
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
    <div className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 className="text-base font-bold text-[#17181D]">Report a problem</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
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
              <p className="text-xs font-semibold text-[#C8202D] mt-1">{errors.title}</p>
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
                {branches.map((b) => (
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
                <p className="text-xs font-semibold text-[#C8202D] mt-1">{errors.reportedBy}</p>
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
                      ? 'border-[#C8202D] bg-[#FDECEE] text-[#C8202D]'
                      : 'border-[#E6E7EB] bg-white text-[#6B6F76] hover:bg-[#F6F6F8]'
                  }`}
                >
                  {SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Optional extras stay out of the way until wanted */}
          <div className="border-t border-[#EFEFF2] pt-4">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C8202D] hover:underline cursor-pointer"
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

          <div className="pt-3 border-t border-[#E6E7EB] flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="mnt-save-btn"
              type="submit"
              className="px-4 py-2.5 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer"
            >
              Report it
            </button>
            <button
              id="mnt-save-start-btn"
              type="button"
              onClick={() => save(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
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

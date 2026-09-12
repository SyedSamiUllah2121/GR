'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock,
  Play,
  Repeat,
  Plus,
  Search,
  Square,
  Store,
  X,
} from 'lucide-react';
import {
  MaintenanceCategory,
  MaintenanceJob,
  MaintenanceJobKind,
  MaintenanceStatus,
  SEVERITY_KEYS,
  Severity,
  jobKindOf,
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
import { useCategories } from '../hooks/useCategories';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { activeBranches } from '../services/branchStore';
import { activeCategories, categoryLabel, defaultCategory } from '../services/categoryStore';
import {
  can,
  canManageEquipment,
  canManageJobs,
  fixedBranchFor,
  visibleJobs,
} from '../services/permissions';
import {
  MaintenanceSchedulePanel,
  PlanBeingEdited,
  useMaintenanceSchedule,
} from './MaintenanceSchedulePanel';

/**
 * 'repeats' and 'schedule' are different shapes of list, not further status
 * slices — what recurs and what is coming, either of which is read against
 * the board rather than away from it.
 */
type Filter = 'open' | MaintenanceStatus | 'all' | 'repeats' | 'schedule';

export const MaintenanceScreen: React.FC = () => {
  const router = useRouter();
  const showToast = useToast();
  const user = useCurrentUser();
  // Held here rather than read where it is needed, so a category renamed in
  // another tab repaints the board's search and its rows together
  const categories = useCategories();
  const [allJobs, setAllJobs] = useState<MaintenanceJob[]>(() => getJobs());
  const [filter, setFilter] = useState<Filter>('open');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  /*
   * Breakdowns and planned servicing share a board because they share a
   * queue — the same person does both, out of the same day. They are split
   * by a filter rather than into two screens for the same reason.
   */
  const [kindFilter, setKindFilter] = useState<'all' | MaintenanceJobKind>('all');
  const [query, setQuery] = useState('');
  const [logging, setLogging] = useState(false);
  const [ending, setEnding] = useState<MaintenanceJob | null>(null);
  const [starting, setStarting] = useState<MaintenanceJob | null>(null);
  /*
   * The plan editor belongs to the board rather than to the schedule panel
   * because the button that opens it is the header's, and the header is the
   * board's. The panel opens it too, from a plan's pencil.
   */
  const [editingPlan, setEditingPlan] = useState<PlanBeingEdited>(null);

  useEffect(() => {
    const refresh = () => setAllJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  /*
   * Narrowed to the account before anything else looks at it. The tabs, the
   * counts, the search and the repeat list all read `jobs`, so scoping once
   * here is what holds a branch manager's board to their own branch — rather
   * than asking each of those to remember, which is how a branch leaks.
   */
  const jobs = useMemo(() => visibleJobs(user, allJobs), [user, allJobs]);

  /*
   * Starting, ending and re-timing work belong to the people who run the
   * board. A branch manager raises a repair and watches it; recording that it
   * was carried out is not theirs to do, so the buttons that would are not
   * shown rather than shown and refused.
   */
  const mayManage = canManageJobs(user);

  /*
   * The one branch this board covers, when it covers one. Asked of the same
   * capability the report form asks, rather than of `mayManage`, so the
   * heading and the branch field can never disagree about whose board this
   * is — they are one fact, not two that happen to line up.
   */
  const scopedTo = can(user, 'maintenance.view') ? null : fixedBranchFor(user);

  /*
   * Setting the intervals is estate-wide configuration — what every branch's
   * chillers are serviced on — so unlike the board itself it is not a
   * branch's to open, and the tab is simply absent for them.
   */
  const mayPlan = canManageEquipment(user);

  const board = useMemo(() => buildBoard(jobs), [jobs]);

  /*
   * Handed the unnarrowed list deliberately: the schedule covers the estate,
   * and it is only ever shown to the people who hold the estate.
   */
  const schedule = useMaintenanceSchedule(allJobs);

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
        categoryLabel(job.category, categories),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
  }, [query, categories]);

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

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'open', label: 'Open', count: board.openCount },
    { key: 'reported', label: 'Not started', count: board.counts.reported },
    { key: 'in-progress', label: 'In progress', count: board.counts['in-progress'] },
    { key: 'completed', label: 'Done', count: board.counts.completed },
    { key: 'all', label: 'All', count: jobs.length },
    { key: 'repeats', label: 'Repeated', count: repeatCount },
    ...(mayPlan
      ? [{ key: 'schedule' as Filter, label: 'Schedule', count: schedule.activeCount }]
      : []),
  ];

  /*
   * A tab that is not on offer is not a view. Asked of the list itself rather
   * than of each right in turn, so a tab withheld from someone can never be
   * what their board is showing — whatever the reason it was withheld.
   */
  const view: Filter = tabs.some((tab) => tab.key === filter) ? filter : 'open';

  const visible = useMemo(() => {
    const byStatus = jobs.filter((job) => {
      const status = statusOf(job);
      if (view === 'all') return true;
      if (view === 'open') return status !== 'completed';
      return status === view;
    });
    const byBranch =
      branchFilter === 'all'
        ? byStatus
        : byStatus.filter((job) => job.branchName === branchFilter);

    const byKind =
      kindFilter === 'all'
        ? byBranch
        : byBranch.filter((job) => jobKindOf(job) === kindFilter);

    return byKind.filter(matchesQuery).sort((a, b) => {
      const aDone = !!a.completedAt;
      const bDone = !!b.completedAt;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (aDone && bDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
      const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return a.reportedAt.localeCompare(b.reportedAt);
    });
  }, [jobs, view, branchFilter, kindFilter, matchesQuery]);

  /** Only the job lists are searched and narrowed; the schedule is neither. */
  const filtersApply = view !== 'schedule';

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#17181D]">Maintenance</h2>
          <p className="text-[#6B6F76] text-xs mt-0.5">
            {/* Named, so a board covering one branch never reads as the estate */}
            {scopedTo && <span className="font-semibold text-[#17181D]">{scopedTo} • </span>}
            {view === 'schedule' ? (
              <>
                {schedule.activeCount} plan{schedule.activeCount === 1 ? '' : 's'} running
                {schedule.overdue.length > 0 && (
                  <span className="text-[#C8202D] font-semibold">
                    {' '}
                    • {schedule.overdue.length} due now
                  </span>
                )}
              </>
            ) : board.openCount === 0 ? (
              'Nothing outstanding'
            ) : (
              `${board.openCount} job${board.openCount === 1 ? '' : 's'} outstanding${
                board.urgentCount > 0 ? ` • ${board.urgentCount} urgent` : ''
              }`
            )}
          </p>
        </div>

        {/*
          One primary action, belonging to whichever tab is open — two red
          buttons offering different things is how somebody reporting a
          breakdown ends up writing a servicing plan.
        */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {view === 'schedule' ? (
            <button
              id="add-plan-btn"
              type="button"
              onClick={() => setEditingPlan('new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add a plan</span>
            </button>
          ) : (
            <button
              id="log-problem-btn"
              type="button"
              onClick={() => setLogging(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Report a problem</span>
            </button>
          )}
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
                  view === tab.key
                    ? 'border-[#C8202D] text-[#C8202D]'
                    : 'border-transparent text-[#6B6F76] hover:text-[#17181D]'
                }`}
              >
                {tab.label} <span className="tabular-nums">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Nothing to search or narrow on the schedule — so nothing offered */}
          {filtersApply && (
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
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as 'all' | MaintenanceJobKind)}
              aria-label="Filter by kind"
              className="px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
            >
              <option value="all">Problems &amp; services</option>
              <option value="problem">Problems only</option>
              <option value="scheduled">Scheduled only</option>
            </select>
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
          )}
        </div>

        {view === 'schedule' ? (
          <MaintenanceSchedulePanel
            schedule={schedule}
            jobs={allJobs}
            editing={editingPlan}
            onEditing={setEditingPlan}
          />
        ) : view === 'repeats' ? (
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
              {view === 'open'
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
                mayManage={mayManage}
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
  /** Whether this account may move the job along from the row. */
  mayManage: boolean;
}> = ({ job, onOpen, onStart, onEnd, mayManage }) => {
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
          {/* Only the planned ones are marked: a breakdown is the ordinary case */}
          {jobKindOf(job) === 'scheduled' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#EEF2FB] text-[#33499B]">
              <CalendarClock className="w-3 h-3" />
              Scheduled
            </span>
          )}
        </div>
        <p className="text-xs text-[#6B6F76] mt-1">
          {job.branchName}
          {job.equipment ? ` • ${job.equipment}` : ''} •{' '}
          {categoryLabel(job.category)}
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

      {/* The next step, right here on the row — for whoever takes it */}
      <div className="flex items-center gap-2 shrink-0">
        {mayManage && status === 'reported' && (
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
        {mayManage && status === 'in-progress' && (
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
 * case where the problem is being written up as the work begins. Offered only
 * to the people who run the board — a branch manager reports the fault and
 * stops there, because they are not the ones who will be doing the work.
 */
const ReportProblemDialog: React.FC<{
  onClose: () => void;
  onSaved: (job: MaintenanceJob, started: boolean) => void;
}> = ({ onClose, onSaved }) => {
  const user = useCurrentUser();
  const branches = activeBranches(useBranches());
  const mayManage = canManageJobs(user);

  /*
   * Who may file against a branch other than their own. Asked for by name
   * rather than read off `fixedBranchFor` returning nothing — that function
   * also returns nothing for a maintenance manager, who may choose, and for an
   * inspector, who may not, so the two questions only look alike. The
   * inspection form asks its version of this the same way, and for the same
   * reason: a rule enforced by coincidence is one that quietly stops being
   * enforced.
   */
  const mayPickBranch = can(user, 'maintenance.view');

  /*
   * A branch manager reports against their own branch and no other. Read from
   * the account rather than held in state, so it stays right even if their
   * branch is changed while the form is open.
   */
  const ownBranch = fixedBranchFor(user);
  const [selectedBranch, setSelectedBranch] = useState(() => branches[0]?.name ?? '');
  const branchName = mayPickBranch ? selectedBranch : ownBranch ?? '';

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Severity>('medium');
  /*
   * Who is reporting. Someone filing against their own branch is the person
   * the job belongs to, so their account name is the truthful attribution —
   * the name remembered from last time could be whoever used this browser
   * before them. Where the account is a shared desk rather than a person, the
   * remembered name is the better guess. Editable either way.
   */
  const [reportedBy, setReportedBy] = useState(
    () => (mayPickBranch ? getLastPerson() || user?.name : user?.name || getLastPerson()) ?? ''
  );

  const [showMore, setShowMore] = useState(false);
  const [equipment, setEquipment] = useState('');
  const [details, setDetails] = useState('');
  const categories = useCategories();
  const [category, setCategory] = useState<MaintenanceCategory>(() => defaultCategory());

  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = (startNow: boolean) => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Say what the problem is';
    if (!reportedBy.trim()) next.reportedBy = 'Your name';
    /*
     * A job with no branch belongs to nobody and would show on no board.
     * Accounts are not meant to reach this — a branch manager without a
     * branch is refused at the point of creation — but a job filed into
     * nowhere is worse than a message saying so.
     */
    if (!branchName) {
      next.branch = 'No branch is set on your account — ask the admin to set one';
    }
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
              {/*
                A branch manager has no choice to make here, so they get the
                name and a padlock rather than a dropdown holding one option —
                which would imply there was an alternative.
              */}
              {mayPickBranch ? (
                <>
                  <label htmlFor="mnt-branch" className={labelClass}>
                    Branch
                  </label>
                  <select
                    id="mnt-branch"
                    value={branchName}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className={inputClass}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <span className={labelClass}>Branch</span>
                  <p
                    id="mnt-fixed-branch"
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#F6F6F8] border border-[#E6E7EB] rounded-md text-sm font-semibold text-[#17181D]"
                  >
                    <Store className="w-4 h-4 text-[#6B6F76] shrink-0" />
                    <span className="truncate">{ownBranch ?? 'No branch set'}</span>
                    <Lock className="w-3.5 h-3.5 text-[#9CA1A9] ml-auto shrink-0" />
                  </p>
                  <p className="mt-1.5 text-[11px] text-[#6B6F76]">
                    You report for your own branch — this cannot be changed.
                  </p>
                  {errors.branch && (
                    <p className="text-xs font-semibold text-[#C8202D] mt-1">{errors.branch}</p>
                  )}
                </>
              )}
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
                    {activeCategories(categories).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
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
              className={
                mayManage
                  ? 'px-4 py-2.5 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer'
                  : 'inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs'
              }
            >
              Report it
            </button>
            {mayManage && (
              <button
                id="mnt-save-start-btn"
                type="button"
                onClick={() => save(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
              >
                <Play className="w-4 h-4" />
                <span>Report &amp; start now</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

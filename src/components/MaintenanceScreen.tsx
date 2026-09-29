'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock,
  MapPin,
  Play,
  Repeat,
  Plus,
  Search,
  Square,
  Store,
  Timer,
  Wrench,
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
import { motion } from 'motion/react';
import { EASE_OUT, Reveal, t } from './motion';
import { BUTTON, CARD, PageHeader } from './ui';
import { EndMaintenanceDialog } from './EndMaintenanceDialog';
import { JobTimesDialog } from './JobTimesDialog';
import { useToast } from './ToastProvider';
import { useBranches } from '../hooks/useBranches';
import { useDialog } from '../hooks/useDialog';
import { useCategories } from '../hooks/useCategories';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { activeBranches } from '../services/branchStore';
import { activeCategories, categoryLabel, defaultCategory } from '../services/categoryStore';
import { activeEquipment, getEquipmentById } from '../services/equipmentStore';
import { describeAsset } from './UnitPicker';
import {
  can,
  canManageEquipment,
  canManageJobs,
  maintenanceBranchesFor,
  soleMaintenanceBranch,
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
  const scoped = useMemo(() => visibleJobs(user, allJobs), [user, allJobs]);

  /*
   * One appliance's jobs, when the board was opened from its History button.
   *
   * Read from the URL rather than held in state so the link is a real link —
   * it survives a reload, it can be sent to somebody, and the back button
   * returns to the whole board. Applied after `visibleJobs`, never instead of
   * it: a URL is typed by anyone, and it must not become a way to read another
   * branch's work.
   */
  const equipmentFilter = useSearchParams().get('equipment');
  const filteredAsset = useMemo(
    () => (equipmentFilter ? getEquipmentById(equipmentFilter) : null),
    [equipmentFilter]
  );

  const jobs = useMemo(
    () =>
      equipmentFilter
        ? scoped.filter((job) => job.equipmentId === equipmentFilter)
        : scoped,
    [scoped, equipmentFilter]
  );

  /*
   * Starting, ending and re-timing work belong to the people who run the
   * board. A branch manager raises a repair and watches it; recording that it
   * was carried out is not theirs to do, so the buttons that would are not
   * shown rather than shown and refused.
   */
  const mayManage = canManageJobs(user);

  /*
   * The one branch this board covers, when it covers one. Asked of the same
   * helper the report form asks, rather than of `mayManage`, so the heading
   * and the branch field can never disagree about whose board this is — they
   * are one fact, not two that happen to line up. Null for an inspector sent
   * to more than one branch, whose board is genuinely several.
   */
  const scopedTo = useMemo(() => soleMaintenanceBranch(user), [user]);

  /*
   * Setting the intervals is estate-wide configuration — what every branch's
   * chillers are serviced on — so unlike the board itself it is not a
   * branch's to open, and the tab is simply absent for them.
   */
  const mayPlan = canManageEquipment(user);

  const board = useMemo(() => buildBoard(jobs), [jobs]);

  /*
   * Which tab to land on when following an appliance's history. Its open work
   * is the interesting part when it has any, and "nothing open" reads as an
   * empty board rather than as an answer — so with none, the whole history is
   * shown instead.
   */
  useEffect(() => {
    if (!equipmentFilter) return;
    setFilter(board.openCount > 0 ? 'open' : 'all');
    // Only when the appliance changes: re-running on every board rebuild would
    // drag the reader back off whichever tab they went on to choose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentFilter]);

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

    /*
     * Newest first, by the clock.
     *
     * Work that is finished goes below work that is not, and each half is
     * ordered by when it last mattered: a completed job by when it was
     * completed, an open one by when it was reported. So the thing that just
     * happened is the thing at the top, which is what somebody opening the
     * board is looking for.
     *
     * Priority no longer decides position. It used to lead, with the longest
     * waiting first inside each band — which reads as a triage queue, and left
     * a fault reported this morning below one from last week. The badge is
     * still on every row and the count of urgent work still sits above the
     * list, so how bad a job is has not stopped being visible; it has stopped
     * deciding what you see first.
     */
    return byKind.filter(matchesQuery).sort((a, b) => {
      const aDone = !!a.completedAt;
      const bDone = !!b.completedAt;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (aDone && bDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
      /*
       * Ties broken by id rather than left to the sort's own hand: two jobs
       * raised in the same minute would otherwise swap places between renders,
       * and a list that reorders itself while being read is worse than either
       * order.
       */
      return b.reportedAt.localeCompare(a.reportedAt) || a.id.localeCompare(b.id);
    });
  }, [jobs, view, branchFilter, kindFilter, matchesQuery]);

  /** Only the job lists are searched and narrowed; the schedule is neither. */
  const filtersApply = view !== 'schedule';

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
        <Reveal>
          <PageHeader
            /*
              Arrived from an appliance's History button, the board is that
              appliance's history — so it says so, and says how to get back to
              the whole of it. A filtered list that looks like the unfiltered
              one is how somebody concludes there is no other work on the board.
            */
            eyebrow={equipmentFilter ? 'History' : 'Job board'}
            title={
              filteredAsset
                ? [filteredAsset.assetNo, filteredAsset.name].filter(Boolean).join(' — ')
                : 'Maintenance'
            }
            subtitle={
              <>
                {/* Named, so a board covering one branch never reads as the estate */}
                {scopedTo && <span className="font-semibold text-[#17181D]">{scopedTo} • </span>}
                {equipmentFilter && (
                  <>
                    {filteredAsset?.location ? `${filteredAsset.location} • ` : ''}
                    {jobs.length} job{jobs.length === 1 ? '' : 's'} ever raised •{' '}
                    <button
                      type="button"
                      onClick={() => router.push('/maintenance/jobs')}
                      className="font-semibold text-[#C8202D] hover:underline cursor-pointer"
                    >
                      Show the whole board
                    </button>
                    {' • '}
                  </>
                )}
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
              </>
            }
            /*
              One primary action, belonging to whichever tab is open — two red
              buttons offering different things is how somebody reporting a
              breakdown ends up writing a servicing plan.
            */
            actions={
              view === 'schedule' ? (
                <button
                  id="add-plan-btn"
                  type="button"
                  onClick={() => setEditingPlan('new')}
                  className={BUTTON.primary}
                >
                  <Plus className="w-4 h-4" />
                  <span>Add a plan</span>
                </button>
              ) : (
                <button
                  id="log-problem-btn"
                  type="button"
                  onClick={() => setLogging(true)}
                  className={BUTTON.primary}
                >
                  <Plus className="w-4 h-4" />
                  <span>Report a problem</span>
                </button>
              )
            }
          />
        </Reveal>

        {/*
          A link to an appliance that has since been deleted: the board would
          otherwise be silently empty, which reads as "no work here" rather
          than "that is not a thing any more".
        */}
        {equipmentFilter && !filteredAsset && (
          <p
            role="alert"
            className="text-xs font-semibold text-[#8A5A08] bg-[#FDF3E2] border border-[#B4740A]/25 rounded-xl px-4 py-3"
          >
            That appliance is no longer on the register. Its jobs are still on the board —
            clear the filter above to see everything.
          </p>
        )}

        {board.urgentCount > 0 && (
          <Reveal delay={0.05}>
            <div className={`${CARD} px-5 py-3.5 flex items-center gap-3`}>
              <span className="w-8 h-8 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <p className="text-[13px] font-semibold text-[#17181D]">
                {board.urgentCount} outstanding job{board.urgentCount === 1 ? '' : 's'} at critical
                or high priority
              </p>
            </div>
          </Reveal>
        )}

        <Reveal delay={0.08} className="flex flex-wrap items-center justify-between gap-3">
          {/*
            The views as one segmented control. Scrolls sideways on a phone
            rather than wrapping, so the tabs stay one row and read as one set.
          */}
          <div className="max-w-full overflow-x-auto">
            <div className="inline-flex gap-1 p-1 rounded-xl bg-[#EEF0F3]">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={view === tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    view === tab.key
                      ? 'bg-white text-[#17181D] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_1px_4px_-1px_rgba(16,24,40,0.08)]'
                      : 'text-[#6B6F76] hover:text-[#17181D]'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`min-w-[1.25rem] px-1.5 rounded-full text-[10px] font-bold leading-[1.125rem] text-center tabular-nums ${
                      view === tab.key ? 'bg-[#FDECEE] text-[#A81823]' : 'bg-white/70 text-[#6B6F76]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Nothing to search or narrow on the schedule — so nothing offered */}
          {filtersApply && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative basis-full sm:basis-auto sm:flex-none">
                <Search className="w-4 h-4 text-[#9CA1A9] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="maintenance-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search jobs, units, branches…"
                  aria-label="Search maintenance"
                  className="w-full sm:w-64 h-10 pl-9 pr-8 bg-white border border-[#E4E6EB] rounded-xl text-xs text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs focus:outline-none focus:border-[#C8202D] focus:ring-2 focus:ring-[#C8202D]/15 transition-colors"
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
                className={FILTER_SELECT}
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
                  className={FILTER_SELECT}
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
        </Reveal>

        {/*
          The schedule is never inside a Reveal: it renders its own plan editor,
          a `position: fixed` dialog, and the rising transform would become that
          dialog's containing block while it plays.
        */}
        {view === 'schedule' ? (
          <MaintenanceSchedulePanel
            schedule={schedule}
            jobs={allJobs}
            editing={editingPlan}
            onEditing={setEditingPlan}
          />
        ) : view === 'repeats' ? (
          repeats.length === 0 ? (
            <EmptyBoard
              title={query.trim() ? 'Nothing matches that search' : 'Nothing is repeating'}
              text={
                query.trim()
                  ? 'No repeat offender matches what you typed.'
                  : 'No unit has been reported more than once.'
              }
            />
          ) : (
            <Reveal delay={0.1} className="space-y-3">
              {repeats.map((group) => (
                <RepeatCard
                  key={group.key}
                  group={group}
                  onOpen={(id: string) => router.push(`/maintenance/${id}`)}
                />
              ))}
            </Reveal>
          )
        ) : visible.length === 0 ? (
          <EmptyBoard
            title="Nothing here"
            text={view === 'open' ? 'No maintenance is outstanding.' : 'No jobs match this filter.'}
          />
        ) : (
          /*
            Revealed as one block rather than staggered row by row: a board can
            run to hundreds of jobs, and a stagger that long is a wait.
          */
          <Reveal delay={0.1}>
            <div className={`${CARD} divide-y divide-[#F0F1F4] overflow-hidden`}>
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
          </Reveal>
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
          onDone={(_job, warning) => {
            setEnding(null);
            if (warning) showToast(warning, 'error');
            else showToast('Job marked done');
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Job row — the whole job can be moved along from here, without opening it
// ---------------------------------------------------------------------------

const FILTER_SELECT =
  'flex-1 sm:flex-none min-w-0 h-10 pl-3 pr-8 bg-white border border-[#E4E6EB] rounded-xl text-xs font-semibold text-[#17181D] shadow-xs cursor-pointer focus:outline-none focus:border-[#C8202D] focus:ring-2 focus:ring-[#C8202D]/15';

/** An empty list, said as an answer rather than left as a blank card. */
const EmptyBoard: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <Reveal delay={0.1}>
    <div className={`${CARD} px-6 py-14 text-center`}>
      <span className="mx-auto w-12 h-12 rounded-2xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center">
        <CheckCircle2 className="w-6 h-6" />
      </span>
      <p className="mt-4 text-sm font-bold text-[#17181D]">{title}</p>
      <p className="text-xs text-[#6B6F76] mt-1">{text}</p>
    </div>
  </Reveal>
);

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
    <section
      className={`${CARD} overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DADCE2] hover:shadow-[0_12px_24px_-12px_rgba(16,24,40,0.18)]`}
    >
      <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="w-10 h-10 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
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
            <p className="text-2xl font-bold tracking-tight text-[#17181D] leading-none">
              {group.times}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] mt-1">
              times
            </p>
          </div>
          <span className="w-px h-8 bg-[#F0F1F4]" />
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight text-[#17181D] leading-none">
              {group.spanDays}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] mt-1">
              days apart
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PriorityBadge severity={group.worstPriority} size="sm" />
          {group.openCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDF3E2] text-[#8A5A08]">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {group.openCount} open
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-bold text-[#17181D] bg-[#F4F5F7] hover:bg-[#EBEDF0] transition-colors cursor-pointer shrink-0"
        >
          {open ? 'Hide' : 'History'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {!open && (
        <p className="px-5 sm:px-6 pb-4 -mt-1 text-xs text-[#6B6F76]">
          First reported {formatDateTime(group.firstReportedAt)} • most recently{' '}
          {formatDateTime(group.lastReportedAt)}
        </p>
      )}

      {open && (
        <ul className="border-t border-[#F0F1F4] divide-y divide-[#F0F1F4] bg-[#FCFCFD]">
          {group.jobs.map((job, index) => (
            <li key={job.id}>
              <button
                type="button"
                onClick={() => onOpen(job.id)}
                className="w-full px-5 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-left hover:bg-[#F7F8FA] transition-colors cursor-pointer group"
              >
                {/* Newest is #1, so the numbering matches the order read */}
                <span className="w-6 h-6 rounded-full bg-[#EEF0F3] text-[10px] font-bold text-[#6B6F76] flex items-center justify-center shrink-0 tabular-nums">
                  {group.jobs.length - index}
                </span>
                <span className="flex-1 min-w-[12rem]">
                  <span className="block text-xs font-semibold text-[#17181D]">{job.title}</span>
                  <span className="block text-[11px] text-[#6B6F76] mt-0.5">
                    Reported {formatDateTime(job.reportedAt)} by {job.reportedBy}
                  </span>
                </span>
                <StatusPill status={statusOf(job)} />
                <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * The tile at the head of a row: where the job stands, as a mark. The status
 * pill beside the title says the same thing in words, so this is read at a
 * glance down the list and never has to carry the meaning alone.
 */
const STATUS_TILE: Record<MaintenanceStatus, { classes: string; Icon: typeof Wrench }> = {
  reported: { classes: 'bg-[#FDECEE] text-[#C8202D]', Icon: Wrench },
  'in-progress': { classes: 'bg-[#FDF3E2] text-[#B4740A]', Icon: Timer },
  completed: { classes: 'bg-[#E6F4EC] text-[#157F4B]', Icon: CheckCircle2 },
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
  const tile = STATUS_TILE[status];

  return (
    <div className="px-5 sm:px-6 py-4 flex flex-wrap items-start gap-x-4 gap-y-3 hover:bg-[#FAFBFC] transition-colors group">
      <span
        className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 ${tile.classes}`}
        aria-hidden
      >
        <tile.Icon className="w-[18px] h-[18px]" />
      </span>

      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-[14rem] text-left cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#17181D] group-hover:text-black">{job.title}</span>
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
        <p className="text-[11px] text-[#9CA1A9] mt-0.5">
          Reported {formatDateTime(job.reportedAt)} by {job.reportedBy}
          {status === 'reported' && waiting > 0 && (
            <span className="text-[#8A5A08] font-semibold">
              {' '}
              • waiting {waiting} day{waiting === 1 ? '' : 's'}
            </span>
          )}
        </p>
        {job.startedAt && (
          <p className="text-[11px] font-semibold text-[#8A5A08] mt-0.5 flex items-center gap-1.5">
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
      <div className="flex items-center gap-2 shrink-0 self-center">
        {mayManage && status === 'reported' && (
          <button
            type="button"
            onClick={onStart}
            className={`${BUTTON.primary} h-9! px-3.5!`}
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
            className={`${BUTTON.dark} h-9! px-3.5!`}
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
          className="w-9 h-9 flex items-center justify-center text-[#C9CCD2] hover:text-[#17181D] hover:bg-[#F4F5F7] rounded-lg transition-all cursor-pointer group-hover:text-[#17181D]"
        >
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Report a problem
// ---------------------------------------------------------------------------

const inputClass =
  'w-full px-3.5 py-2.5 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs transition-colors focus:outline-none focus:border-[#C8202D] focus:ring-2 focus:ring-[#C8202D]/15';

const labelClass =
  'block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B6F76] mb-1.5';

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
  const allBranches = activeBranches(useBranches());
  const mayManage = canManageJobs(user);

  /*
   * The branches this account may file against. Whoever holds the estate gets
   * the open branches; everyone else gets theirs, which for a branch manager
   * is one and for an inspector is wherever they have been sent. Derived from
   * the account rather than held in state, so it stays right even if their
   * branch changes while the form is open.
   */
  const mine = useMemo(() => maintenanceBranchesFor(user), [user]);
  const choices = useMemo(
    () =>
      allBranches
        .map((b) => b.name)
        .filter((name) => mine === null || mine.includes(name)),
    [mine, allBranches]
  );

  /*
   * A choice is only a choice where there is more than one to make. Someone
   * with a single branch to their name gets it and a padlock rather than a
   * dropdown holding one option, which would imply there was an alternative.
   */
  const mayPickBranch = choices.length > 1;
  const [selectedBranch, setSelectedBranch] = useState(() => choices[0] ?? '');
  const branchName = mayPickBranch ? selectedBranch : choices[0] ?? '';

  /*
   * Whether they are filing on a branch's behalf rather than as it, which is
   * a different question from whether they may choose one — a maintenance
   * manager on an estate of one branch still files on its behalf. Asked for by
   * name rather than read off the size of `choices`: a rule enforced by
   * coincidence is one that quietly stops being enforced.
   */
  const filingForOthers = can(user, 'maintenance.view');

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
    () => (filingForOthers ? getLastPerson() || user?.name : user?.name || getLastPerson()) ?? ''
  );

  const [showMore, setShowMore] = useState(false);
  const [details, setDetails] = useState('');
  const categories = useCategories();
  const [category, setCategory] = useState<MaintenanceCategory>(() => defaultCategory());

  /*
   * The register, read once when the dialog opens. It does not subscribe: an
   * appliance added in another tab while this form is half filled in is not
   * worth repainting a list somebody is choosing from.
   */
  const [register] = useState(() => activeEquipment());

  /** The branch's register, whatever trade it falls under. */
  const atBranch = useMemo(
    () => register.filter((asset) => asset.branchName === branchName),
    [register, branchName]
  );

  /**
   * How many appliances each trade has at this branch.
   *
   * Shown in the category dropdown, and the reason picking a category can no
   * longer be a dead end: "Other (0)" says before you choose it that there
   * will be nothing to pick, so the empty unit list underneath is the answer
   * you asked for rather than the form appearing to be broken.
   */
  const countByCategory = useMemo(() => {
    const counts = new Map<MaintenanceCategory, number>();
    atBranch.forEach((asset) => {
      counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
    });
    return counts;
  }, [atBranch]);

  /**
   * The appliances this report could be about: the chosen trade's, at the
   * chosen branch, in asset-number order.
   *
   * The numbers run in the order the register walks the building — juice area,
   * then bakery, then kitchen — so a numeric sort puts the machines in roughly
   * the order somebody standing in it would come across them.
   */
  const units = useMemo(
    () =>
      atBranch
        .filter((asset) => asset.category === category)
        .sort((a, b) => (a.assetNo ?? a.name).localeCompare(b.assetNo ?? b.name)),
    [atBranch, category]
  );

  const [unitId, setUnitId] = useState('');
  /** Where no unit is named: a room, a run of pipework, the car park. */
  const [area, setArea] = useState('');

  /*
   * A unit belongs to one branch and one trade, so changing either can leave
   * the chosen one off the list in front of the reporter. Left selected it
   * would file the job against an appliance that is not at that branch — which
   * is worse than asking the question again.
   */
  useEffect(() => {
    if (unitId && !units.some((asset) => asset.id === unitId)) setUnitId('');
  }, [units, unitId]);

  const unit = units.find((asset) => asset.id === unitId) ?? null;

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
      next.branch =
        user?.role === 'inspector'
          ? 'You report at the branches you have been sent to, and you have not been sent to one yet'
          : 'No branch is set on your account — ask the admin to set one';
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
      /*
       * The unit as the register words it, and its id beside it. The id is
       * what lets the board tell that this fault is one it already has
       * somebody working on, and what puts the job into that appliance's own
       * history — neither of which a typed "AC 2" could ever do.
       */
      equipment: unit ? describeAsset(unit) : area.trim(),
      ...(unit ? { equipmentId: unit.id } : {}),
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
    if (!saveJob(job)) {
      setErrors({ form: 'Could not save the report — this browser’s storage is full' });
      return;
    }
    onSaved(job, startNow);
  };

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenancescreen-dialog-1-title"
      className="fixed inset-0 z-50 bg-[#17181D]/45 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    >
      {/*
        Wider than a dialog usually wants to be, because this one is a form and
        every field on it was sitting on a line of its own: the whole report
        could not be seen at once, which is when somebody files a fault against
        the wrong branch. Paired up below, it fits without scrolling.
      */}
      {/*
        The panel settles in; the fixed backdrop around it does not move, so
        nothing positioned inside it is re-parented by the transform.
      */}
      <motion.div
        className="bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_24px_48px_-12px_rgba(16,24,40,0.28)] w-full max-w-3xl my-8"
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: t(0.25), ease: EASE_OUT }}
      >
        <div className="px-6 py-5 border-b border-[#F0F1F4]">
          <h3 id="maintenancescreen-dialog-1-title" className="text-base font-bold text-[#17181D]">Report a problem</h3>
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
          {/*
            The trade, then the unit, then the fault. Somebody reporting a
            problem is standing in front of the thing — naming it is the easier
            half and the half that decides who the job goes to, so it is asked
            before they have to put the fault into words.

            The trade comes first because it is what narrows the list beside it
            from the branch's whole register to the handful this report could
            be about. One branch runs to seventy-odd assets, and somebody
            looking for a fridge should not scroll past forty fans and ovens to
            reach it.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr] gap-4 items-start">
            <div>
              <label htmlFor="mnt-category" className={labelClass}>
                Appliance category
              </label>
              <select
                id="mnt-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
                autoFocus
                className={inputClass}
              >
                {activeCategories(categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({countByCategory.get(c.id) ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="mnt-unit" className={labelClass}>
                Which unit{' '}
                <span className="text-[#6B6F76]/70 font-normal">(optional)</span>
              </label>
              <select
                id="mnt-unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                disabled={units.length === 0}
                className={`${inputClass} disabled:bg-[#F4F5F7] disabled:text-[#6B6F76]`}
              >
                <option value="">
                  {units.length === 0
                    ? `Nothing under ${categoryLabel(category, categories)} here`
                    : 'Not a particular unit'}
                </option>
                {units.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {describeAsset(asset)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-[#6B6F76]">
                {units.length === 0
                  ? 'Nothing on the register under this category at this branch — say where the problem is below.'
                  : `${units.length} on the register here. Change the category to see another trade’s.`}
              </p>
            </div>
          </div>

          {/*
            What the register knows about the unit, spelled out rather than
            left inside an <option> the reporter can no longer see once the
            list closes. It is also the check that they picked the right one of
            nine Refrigerators.
          */}
          {unit ? (
            <div className="rounded-xl border border-[#E8E9EE] bg-[#FAFBFC] px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {unit.assetNo && (
                  <span className="font-mono text-[11px] font-bold tracking-wide text-[#A81823] bg-[#FDECEE] px-1.5 py-0.5 rounded-md">
                    {unit.assetNo}
                  </span>
                )}
                <span className="text-sm font-bold text-[#17181D]">{unit.name}</span>
                {unit.capacity && (
                  <span className="text-[11px] font-semibold text-[#6B6F76]">
                    {unit.capacity}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[#6B6F76] flex flex-wrap items-center gap-x-3 gap-y-1">
                {unit.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {unit.location}
                  </span>
                )}
                {[unit.make, unit.model].filter(Boolean).length > 0 && (
                  <span>{[unit.make, unit.model].filter(Boolean).join(' ')}</span>
                )}
                {unit.serialNumber && <span>Serial {unit.serialNumber}</span>}
              </p>
              <p className="mt-1.5 text-[11px] text-[#6B6F76]">
                Carried onto the job, so whoever goes out knows which one — and so this
                appliance&rsquo;s own history has the fault on it.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="mnt-area" className={labelClass}>
                Where is it{' '}
                <span className="text-[#6B6F76]/70 font-normal">(optional)</span>
              </label>
              <input
                id="mnt-area"
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Dining area — ceiling by the window"
                className={inputClass}
              />
              <p className="mt-1.5 text-[11px] text-[#6B6F76]">
                For anything that is not one of the appliances above — a room, a drain, a
                stretch of wall.
              </p>
            </div>
          )}

          {/* The fault, and how badly it is wanted — one line, read together */}
          <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-4 items-start">
            <div>
              <label htmlFor="mnt-title" className={labelClass}>
                What is wrong?
              </label>
              <input
                id="mnt-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Dining area AC not cooling"
                className={inputClass}
              />
              {errors.title && (
                <p className="text-xs font-semibold text-[#C8202D] mt-1">{errors.title}</p>
              )}
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
                    className={`h-9 px-3 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                      priority === s
                        ? 'border-[#C8202D] bg-[#FDECEE] text-[#A81823] shadow-[0_0_0_3px_rgba(200,32,45,0.10)]'
                        : 'border-[#E4E6EB] bg-white text-[#6B6F76] hover:text-[#17181D] hover:border-[#D5D8DE]'
                    }`}
                  >
                    {SEVERITY_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {/*
                Someone with one branch to their name has no choice to make
                here, so they get the name and a padlock rather than a
                dropdown holding one option — which would imply there was an
                alternative.
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
                    {choices.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {!filingForOthers && (
                    <p className="mt-1.5 text-[11px] text-[#6B6F76]">
                      The branches you have been sent to.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <span className={labelClass}>Branch</span>
                  <p
                    id="mnt-fixed-branch"
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#F4F5F7] border border-[#E8E9EE] rounded-xl text-sm font-semibold text-[#17181D]"
                  >
                    <Store className="w-4 h-4 text-[#6B6F76] shrink-0" />
                    <span className="truncate">{branchName || 'No branch set'}</span>
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

          {/*
            Said again beside the buttons. On a phone the fields stack, and the
            one that is missing can be a screen above where Report it was
            pressed — which read as the button doing nothing.
          */}
          {Object.keys(errors).length > 0 && (
            <p
              role="alert"
              id="mnt-form-error"
              className="px-3.5 py-2.5 rounded-xl bg-[#FDECEE] border border-[#C8202D]/20 text-[#A81823] text-xs font-semibold"
            >
              {errors.form ??
                (Object.keys(errors).length === 1
                  ? Object.values(errors)[0]
                  : 'A few things are missing — they are marked above')}
            </p>
          )}

          <div className="pt-3 border-t border-[#F0F1F4] flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className={BUTTON.secondary}
            >
              Cancel
            </button>
            <button
              id="mnt-save-btn"
              type="submit"
              className={
                mayManage
                  ? BUTTON.secondary
                  : BUTTON.primary
              }
            >
              Report it
            </button>
            {mayManage && (
              <button
                id="mnt-save-start-btn"
                type="button"
                onClick={() => save(true)}
                className={BUTTON.primary}
              >
                <Play className="w-4 h-4" />
                <span>Report &amp; start now</span>
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
};

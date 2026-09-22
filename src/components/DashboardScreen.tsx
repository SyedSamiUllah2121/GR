'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Hammer,
  History,
  MapPin,
  Package,
  PenLine,
  ShieldAlert,
  Sparkles,
  Thermometer,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Wrench,
} from 'lucide-react';
import { Inspection, MaintenanceJob, ReasonGroup, Severity } from '../types';
import { useChecklist } from '../hooks/useChecklist';
import { useBranches } from '../hooks/useBranches';
import { useCurrentUser } from '../hooks/useCurrentUser';
import {
  can,
  canOpenJobBoard,
  visibleInspections,
  visibleJobs,
} from '../services/permissions';
import { mondayStatusFor } from '../services/mondaySchedule';
import { getInspections, subscribeToStorage } from '../services/storage';
import { daysOpen, getJobs, statusOf, subscribeToMaintenance } from '../services/maintenanceStore';
import { SEVERITY_LABEL } from '../services/priority';
import { formatDate } from '../services/reportModel';
import { BranchSnapshot, buildDashboardModel } from '../services/dashboardModel';
import { PriorityBadge } from './PriorityBadge';
import { StatusPill } from './MaintenanceStatusPill';
import { ScoreRing } from './ScoreRing';

/** Status palette, the same steps the report and the rings use. */
const GOOD = '#157F4B';
const WARN = '#B4740A';
const BAD = '#C8202D';

/**
 * A friendly name and a mark for each reason group. The stored keys are
 * shouty enum values; nobody reading a dashboard wants to see "PEST".
 */
const CATEGORY_META: Record<
  ReasonGroup,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  MAINTENANCE: { label: 'Maintenance', icon: Hammer },
  FOOD: { label: 'Food safety', icon: UtensilsCrossed },
  CLEANING: { label: 'Cleaning', icon: Sparkles },
  TEMPERATURE: { label: 'Temperature', icon: Thermometer },
  EQUIPMENT: { label: 'Equipment', icon: Wrench },
  SUPPLY: { label: 'Supply', icon: Package },
  STAFF: { label: 'Staff', icon: Users },
  PEST: { label: 'Pest control', icon: Bug },
  RECORDS: { label: 'Records', icon: FileText },
  SAFETY: { label: 'Safety', icon: ShieldAlert },
};

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export const DashboardScreen: React.FC = () => {
  const checklist = useChecklist();
  const user = useCurrentUser();
  const allBranches = useBranches();
  const [allInspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [allJobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());

  useEffect(() => {
    const refresh = () => setInspections(getInspections());
    refresh();
    return subscribeToStorage(refresh);
  }, []);

  /*
   * The repairs are their own store with its own subscription — a job started
   * on the board should show as started here without a reload, and nothing
   * about an inspection changes when it is.
   */
  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  /*
   * Narrowed to what this account may see before the model is built, rather
   * than after: the model averages scores, ranks branches and counts overdue
   * visits, and a branch manager's dashboard has to be *their* averages, not
   * the estate's with the other rows hidden.
   *
   * `buildDashboardModel` takes its data as arguments precisely so this
   * works — nothing inside it reads the store.
   */
  const everyBranch = can(user, 'inspections.viewAll');

  const inspections = useMemo(
    () => visibleInspections(user, allInspections),
    [user, allInspections]
  );

  const branches = useMemo(
    () => (everyBranch ? allBranches : allBranches.filter((b) => b.name === user?.branchName)),
    [everyBranch, allBranches, user]
  );

  const model = useMemo(
    () => buildDashboardModel(inspections, checklist, branches),
    [inspections, checklist, branches]
  );

  /*
   * The repairs still outstanding, newest first.
   *
   * Narrowed by `visibleJobs` for the same reason the inspections are: a
   * branch manager's dashboard is their branch's, and a repair raised at
   * another one is not theirs to be told about. Newest first rather than
   * worst first, which is what the maintenance overview ranks by — this panel
   * answers "what has come in", and the board itself is one click away for
   * anyone who wants it ordered by how bad it is.
   */
  const openJobs = useMemo(
    () =>
      visibleJobs(user, allJobs)
        .filter((job) => statusOf(job) !== 'completed')
        .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
    [user, allJobs]
  );

  /*
   * The board in three figures, over the same branches. Counted from the whole
   * of `visibleJobs` rather than from `openJobs` above, because one of the
   * three is the work that is no longer open — which that list, by
   * definition, does not hold.
   */
  const jobCounts = useMemo(() => {
    const mine = visibleJobs(user, allJobs);
    const completed = mine.filter((job) => statusOf(job) === 'completed').length;
    return {
      total: mine.length,
      open: mine.length - completed,
      notStarted: mine.filter((job) => statusOf(job) === 'reported').length,
      completed,
    };
  }, [user, allJobs]);

  /** This week's round, for the manager whose branch this dashboard is. */
  const monday = useMemo(
    () =>
      user?.role === 'branch-manager' && user.branchName
        ? mondayStatusFor(user.branchName, inspections)
        : null,
    [user, inspections]
  );
  const needsAction = model.severityTotals.critical + model.severityTotals.high;
  const inspectedCount = model.branches.filter((b) => !b.neverInspected).length;
  const averageScore = model.averageScore ?? 0;

  return (
    <div className="p-5 sm:p-6 md:p-8 flex-1 space-y-5">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[26px] font-bold tracking-tight text-[#17181D]">
            {/*
              A branch manager's dashboard covers one branch, so it says
              which. Calling it "Dashboard" while showing a single branch's
              averages would read as the whole estate doing badly.
            */}
            {everyBranch ? 'Dashboard' : user?.branchName ?? 'Dashboard'}
          </h1>
          <p className="text-xs text-[#6B6F76] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {model.empty ? (
              'No inspections submitted yet'
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#C8202D] shrink-0" />
                <span>
                  {everyBranch ? (
                    <>
                      {model.totalInspections} inspection
                      {model.totalInspections === 1 ? '' : 's'} across {inspectedCount} branch
                      {inspectedCount === 1 ? '' : 'es'}
                    </>
                  ) : (
                    <>
                      {model.totalInspections} inspection
                      {model.totalInspections === 1 ? '' : 's'} on record
                    </>
                  )}
                </span>
                <span className="text-[#C9CCD2]">•</span>
                <span>Latest {formatDate(model.latestVisitDate)}</span>
              </>
            )}
          </p>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2">
          {/*
            The one thing a branch manager has to do this week, on the screen
            they land on. A link rather than the full card the inspections page
            carries — this page reports, and the doing belongs over there.
          */}
          {monday && (
            <Link
              id="dashboard-monday-link"
              href="/inspections"
              className={`shrink-0 inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-bold transition-colors ${
                monday.done
                  ? 'bg-[#EAF6EF] border-[#157F4B]/25 text-[#12643C] hover:bg-[#DFF1E7]'
                  : monday.overdue
                    ? 'bg-[#C8202D] border-[#C8202D] text-white hover:bg-[#A81823]'
                    : 'bg-[#FDF3E2] border-[#B4740A]/30 text-[#8A5A08] hover:bg-[#FBEBD2]'
              }`}
            >
              <CalendarClock className="w-4 h-4 shrink-0" />
              <span>
                {monday.done
                  ? 'Monday inspection done this week'
                  : monday.inProgress
                    ? 'Monday inspection unfinished'
                    : monday.overdue
                      ? `Monday inspection ${monday.daysLate} day${
                          monday.daysLate === 1 ? '' : 's'
                        } late`
                      : 'Monday inspection due today'}
              </span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          )}

          {/*
            Equipment does not wait for Monday. A manager who finds a fault on
            the Tuesday gets to the board from the screen they land on, rather
            than carrying it in their head until the round comes round again.
            Offered to the role that reports into maintenance without running
            it — the admin and the maintenance manager live on that board already.
          */}
          {can(user, 'maintenance.report') && (
            <Link
              id="dashboard-report-repair-link"
              href="/maintenance/jobs"
              className="shrink-0 inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-[#E6E7EB] bg-white text-xs font-bold text-[#17181D] hover:bg-[#F6F6F8] transition-colors"
            >
              <Wrench className="w-4 h-4 shrink-0" />
              <span>Report a repair</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          )}
        </div>
      </div>

      {model.empty ? (
        <div className="bg-white border border-[#E6E7EB] rounded-xl p-12 text-center shadow-sm">
          <ClipboardList className="w-9 h-9 text-[#9CA1A9] mx-auto mb-3" />
          <p className="text-sm font-bold text-[#17181D]">Nothing to summarise yet</p>
          <p className="text-xs text-[#6B6F76] mt-1">
            Run the first inspection and this page will fill in.
          </p>
          <Link
            href="/inspections"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-lg transition-colors"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Go to inspections
          </Link>
        </div>
      ) : (
        <>
          {/* The figures a manager acts on — the round, then the repairs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <Kpi
              icon={ClipboardCheck}
              label="Needs Action"
              value={needsAction}
              tone={needsAction > 0 ? 'bad' : 'good'}
              href="/inspections"
              caption={
                needsAction === 0 ? (
                  'No critical or high findings'
                ) : (
                  <>
                    <span className="font-bold text-[#C8202D]">
                      {model.severityTotals.critical} critical
                    </span>
                    {' · '}
                    <span>{model.severityTotals.high} high</span>
                  </>
                )
              }
              // Share of the estate's findings that are serious enough to act on now
              fill={model.findingsTotal > 0 ? needsAction / model.findingsTotal : 0}
              fillTitle={`${needsAction} of ${model.findingsTotal} findings are critical or high`}
            />
            <Kpi
              icon={TrendingUp}
              label="Average Score"
              value={averageScore}
              suffix="%"
              tone={averageScore >= 90 ? 'good' : averageScore >= 75 ? 'warn' : 'bad'}
              caption="Mean of each branch's latest visit"
              fill={averageScore / 100}
              fillTitle={`${averageScore}% average across ${inspectedCount} branches`}
            />
            <Kpi
              icon={Clock}
              label="Overdue"
              value={model.overdue.length}
              tone={model.overdue.length > 0 ? 'bad' : 'good'}
              href={model.overdue.length > 0 ? '/inspections' : undefined}
              caption={
                model.overdue.length === 0
                  ? 'Every branch is within schedule'
                  : `Longest ${model.overdue[0].daysOverdue} days past due`
              }
              fill={
                model.branches.length > 0 ? model.overdue.length / model.branches.length : 0
              }
              fillTitle={`${model.overdue.length} of ${model.branches.length} branches are past due`}
            />
            <Kpi
              icon={History}
              label="Repeat Issues"
              value={model.repeatIssues.length}
              tone={model.repeatIssues.length > 0 ? 'warn' : 'good'}
              caption={
                model.repeatIssues.length === 0
                  ? 'Nothing recurring'
                  : 'Flagged on more than one visit'
              }
              fill={
                model.findingsTotal > 0
                  ? Math.min(model.repeatIssues.length / model.findingsTotal, 1)
                  : 0
              }
              fillTitle={`${model.repeatIssues.length} checks have been flagged more than once`}
            />

            {/*
              The repairs, in the row of figures rather than only in the list
              further down: what is outstanding on the board is a number a
              manager acts on the same way they act on overdue visits, and a
              list of five rows does not answer "how many".

              Three readings in one card because they are one subject, and
              because three cards of one number each would have made the row
              about maintenance rather than about the branch.
            */}
            {canOpenJobBoard(user) && (
              <MaintenanceKpi
                open={jobCounts.open}
                notStarted={jobCounts.notStarted}
                completed={jobCounts.completed}
                total={jobCounts.total}
              />
            )}
          </div>

          {/* Things that need doing. Absent entirely when there are none. */}
          <AttentionStrip model={model} />

          {/* The core panel: where every branch stands */}
          <section className="@container bg-white border border-[#E6E7EB] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
                  <MapPin className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-[#17181D]">Branches</h2>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    Latest visit at each branch, most in need of attention first
                  </p>
                </div>
              </div>
              <Link
                href="/inspections"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline shrink-0"
              >
                All records
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Column headings. Hidden where the rows stack and the labels would lie. */}
            <div className="hidden @min-[48rem]:grid grid-cols-[minmax(12.5rem,1.6fr)_minmax(6rem,9.5rem)_minmax(4.5rem,8rem)_minmax(8rem,1.1fr)_minmax(6rem,9rem)_1.25rem] gap-x-5 px-5 py-2 border-y border-[#EFEFF2] bg-[#FBFBFC] text-[9px] font-bold uppercase tracking-[0.14em] text-[#9CA1A9]">
              <span>Branch</span>
              <span>Last visit</span>
              <span>Overall score</span>
              <span>Issues</span>
              <span>Priority</span>
              <span />
            </div>

            <div className="divide-y divide-[#EFEFF2] border-t border-[#EFEFF2] @min-[48rem]:border-t-0">
              {model.branches.map((branch) => (
                <BranchRow key={branch.name} branch={branch} />
              ))}
            </div>
          </section>

          {/*
            What is broken right now, next to what the inspections found.
            Absent entirely when nothing is outstanding — the header already
            carries a way onto the board, so an empty panel would be a row of
            furniture saying "nothing here".
          */}
          {openJobs.length > 0 && (
            <Panel
              icon={Wrench}
              title="Open maintenance jobs"
              caption={`${openJobs.length} still open, most recently reported first`}
              action={{ href: '/maintenance/jobs', label: 'Job board' }}
            >
              <ul className="divide-y divide-[#EFEFF2] -my-1">
                {openJobs.slice(0, 5).map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/maintenance/${job.id}`}
                      className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 group"
                    >
                      <span className="flex-1 min-w-[12rem]">
                        <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                          {job.title}
                        </span>
                        <span className="block text-[11px] text-[#6B6F76] truncate">
                          {/* The branch only where this dashboard covers more than one */}
                          {everyBranch && `${job.branchName} • `}
                          {job.equipment && `${job.equipment} • `}
                          waiting {daysOpen(job)} day{daysOpen(job) === 1 ? '' : 's'}
                        </span>
                      </span>
                      <PriorityBadge severity={job.priority} size="sm" />
                      <StatusPill status={statusOf(job)} />
                      <ChevronRight className="w-4 h-4 text-[#9CA1A9] group-hover:text-[#17181D] shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/*
            No `items-start` here: letting the two panels stretch to the taller
            of the pair keeps the row squared off, rather than leaving one card
            short because it happens to have fewer rows in it.
          */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* What kind of problem dominates right now */}
            {model.byCategory.length > 0 && (
              <Panel
                icon={AlertTriangle}
                title="Where failures are coming from"
                caption="Findings on the latest visit to each branch"
              >
                <div className="flex flex-wrap gap-x-6 gap-y-4">
                  {model.byCategory.slice(0, 6).map((cat) => {
                    const meta = CATEGORY_META[cat.key];
                    return (
                      <div
                        key={cat.key}
                        className="flex items-center gap-2.5 min-w-[8.5rem]"
                        title={`${cat.failures} finding${
                          cat.failures === 1 ? '' : 's'
                        } across ${cat.branches} branch${cat.branches === 1 ? '' : 'es'}`}
                      >
                        <span className="w-9 h-9 rounded-full bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
                          <meta.icon className="w-[18px] h-[18px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-[#17181D] leading-tight">
                            {meta.label}
                          </span>
                          <span className="block text-[11px] text-[#6B6F76] tabular-nums">
                            <span className="font-bold text-[#17181D]">{cat.failures}</span> at{' '}
                            {cat.branches} branch{cat.branches === 1 ? '' : 'es'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {/* Which checklist areas are weakest across the estate */}
            {model.weakestSections.length > 0 && (
              <Panel
                icon={ClipboardCheck}
                title="Weakest checklist areas"
                caption="Pass rate pooled across the latest visits"
              >
                <div className="flex flex-wrap gap-x-6 gap-y-4">
                  {model.weakestSections.slice(0, 4).map((section) => (
                    <div
                      key={section.key}
                      className="flex items-center gap-3 min-w-[10rem]"
                      title={`${section.passed} of ${section.total} checks passed`}
                    >
                      <ScoreRing score={section.rate} size={44} thickness={4} />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[#17181D] leading-tight">
                          {section.title}
                        </span>
                        <span className="block text-[11px] text-[#6B6F76] tabular-nums mt-0.5">
                          {section.passed}/{section.total} passed
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {/* Things that did not get fixed between visits */}
          {model.repeatIssues.length > 0 && (
            <Panel
              icon={History}
              title="Repeat issues"
              caption="Flagged on more than one visit to the same branch"
            >
              <ul className="divide-y divide-[#EFEFF2] -my-1">
                {model.repeatIssues.slice(0, 8).map((repeat) => (
                  <li
                    key={`${repeat.branchName}-${repeat.item.id}`}
                    className="py-2.5 flex items-start gap-3"
                  >
                    <span className="w-7 h-7 rounded-lg bg-[#FDF3E2] text-[#B4740A] flex items-center justify-center shrink-0 mt-0.5">
                      <History className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#17181D]">
                        {repeat.item.text}
                      </p>
                      <p className="text-xs text-[#6B6F76] mt-0.5">
                        {repeat.branchName} • flagged on {repeat.visits} visits
                      </p>
                    </div>
                    <PriorityBadge severity={repeat.severity} size="sm" />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* Quick way back into the records */}
          <Panel icon={ClipboardList} title="Recent inspections">
            <ul className="divide-y divide-[#EFEFF2] -my-1">
              {model.recent.slice(0, 5).map((report) => (
                <li key={report.inspection.id}>
                  <Link
                    href={`/inspections/${report.inspection.id}`}
                    className="py-2.5 flex items-center gap-4 group"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#F1F1F4] text-[#6B6F76] text-[11px] font-bold flex items-center justify-center shrink-0">
                      {initials(report.inspection.branchName)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#17181D] truncate">
                        {report.inspection.branchName}
                      </p>
                      <p className="text-xs text-[#6B6F76]">
                        {formatDate(report.inspection.date)}
                        {report.inspection.inspectorName
                          ? ` • ${report.inspection.inspectorName}`
                          : ''}
                      </p>
                    </div>
                    <span className="hidden sm:block text-xs text-[#6B6F76] tabular-nums shrink-0">
                      {report.issues.length === 0
                        ? 'No findings'
                        : `${report.issues.length} finding${
                            report.issues.length === 1 ? '' : 's'
                          }`}
                    </span>
                    <ScoreRing score={report.inspection.score} size={38} thickness={3.5} />
                    <ChevronRight className="w-4 h-4 text-[#9CA1A9] group-hover:text-[#17181D] shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** Up to two initials, for the tile that stands in for a branch photo. */
function initials(name: string): string {
  return name
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/**
 * Only rendered when something actually needs doing — an empty version of this
 * strip would be noise on every visit to the page.
 */
const AttentionStrip: React.FC<{
  model: ReturnType<typeof buildDashboardModel>;
}> = ({ model }) => {
  const items: {
    icon: React.ComponentType<{ className?: string }>;
    lead: string;
    detail: string;
    href: string;
  }[] = [];

  if (model.draft) {
    items.push({
      icon: PenLine,
      lead: 'Unfinished inspection',
      detail: model.draft.branchName,
      href: `/inspections/${model.draft.id}/checklist`,
    });
  }
  model.neverInspected.forEach((b) =>
    items.push({
      icon: AlertTriangle,
      lead: `${b.name}`,
      detail: 'has never been inspected',
      href: '/inspections',
    })
  );
  if (model.overdue.length > 0) {
    items.push({
      icon: CalendarClock,
      lead: `${model.overdue.length} branch${model.overdue.length === 1 ? '' : 'es'} overdue`,
      detail: model.overdue.map((b) => b.name).join(', '),
      href: '/inspections',
    });
  }
  if (model.unsignedCount > 0) {
    items.push({
      icon: PenLine,
      lead: `${model.unsignedCount} record${model.unsignedCount === 1 ? '' : 's'} unsigned`,
      detail: 'no manager signature',
      href: '/inspections',
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="bg-[#FDECEE] border border-[#C8202D]/20 rounded-xl overflow-hidden">
      <ul className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#C8202D]/15">
        {items.map((item, i) => (
          <li key={i} className={i >= 2 ? 'md:border-t md:border-[#C8202D]/15' : undefined}>
            <Link
              href={item.href}
              className="h-full px-5 py-3.5 flex items-center gap-3 hover:bg-[#C8202D]/5 transition-colors group"
            >
              <item.icon className="w-[18px] h-[18px] text-[#C8202D] shrink-0" />
              <span className="flex-1 min-w-0 text-xs leading-snug">
                <span className="font-bold text-[#17181D]">{item.lead}</span>
                <span className="text-[#6B6F76]"> — {item.detail}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-[#C8202D]/50 group-hover:text-[#C8202D] shrink-0 transition-colors" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

const TONE_TEXT = { good: GOOD, warn: WARN, bad: BAD } as const;

/**
 * One figure, and what it is doing.
 *
 * Colour is the quietest thing on this card, deliberately. Checked against a
 * colour-vision model, the amber and the green of this palette separate by
 * only ΔE 5.7 under protanopia — so a row of cards told apart by the colour of
 * their numbers is a row several readers cannot tell apart at all. Every card
 * says its state in words in the caption instead, and hue is left to two small
 * marks that repeat what the words already said.
 *
 * Which is also why it reads better: five differently coloured display numbers
 * is a rainbow, and the eye goes to the biggest thing first whatever its hue.
 * The figure is the information, so the figure is the only loud thing.
 */
const Kpi: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  caption: React.ReactNode;
  tone: 'good' | 'bad' | 'warn';
  /** 0–1. The bar is a reading in its own right, so every card says what it measures. */
  fill: number;
  fillTitle: string;
  href?: string;
}> = ({ icon: Icon, label, value, suffix = '', caption, tone, fill, fillTitle, href }) => {
  const accent = TONE_TEXT[tone];

  const body = (
    <>
      <div className="flex items-center gap-2">
        {/* The colour rides a wrapper: lucide icons paint from currentColor */}
        <span className="shrink-0 flex items-center" style={{ color: accent }}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6F76] truncate">
          {label}
        </span>
        {href && (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#D8DAE0] group-hover:text-[#6B6F76] transition-colors" />
        )}
      </div>

      {/*
        Proportional figures, not tabular: `tabular-nums` gives every digit the
        width of a zero, which at display size leaves a number like 121 looking
        gappy. Tabular belongs in the branch table below, where figures have to
        line up down a column.
      */}
      <p className="mt-3 text-[30px] leading-none font-semibold text-[#17181D]">
        {value.toLocaleString()}
        {suffix && <span className="text-[17px] font-semibold text-[#9CA1A9]">{suffix}</span>}
      </p>

      <p className="mt-1.5 text-[11px] leading-snug text-[#6B6F76]">{caption}</p>

      {/*
        The unfilled part of the meter is a wash of the fill's own colour
        rather than a neutral grey, so the state reads across the whole bar
        instead of only across the part that happens to be filled.
      */}
      <div
        className="mt-3.5 h-1 rounded-full overflow-hidden"
        style={{ backgroundColor: `${accent}1F` }}
        title={fillTitle}
        role="img"
        aria-label={fillTitle}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.round(Math.min(Math.max(fill, 0), 1) * 100)}%`,
            backgroundColor: accent,
          }}
        />
      </div>
    </>
  );

  const shell =
    'bg-white border border-[#E6E7EB] rounded-xl p-4 shadow-sm block transition-[border-color,box-shadow]';

  return href ? (
    <Link href={href} className={`${shell} group hover:border-[#C9CCD2] hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
};

/**
 * The maintenance board, as three counts on one card.
 *
 * Deliberately not three cards. They are one subject read three ways, and the
 * reader's question is the relationship between them — how much of the board
 * is untouched, how much of it is behind us — which is a comparison you can
 * only make when the figures sit together.
 *
 * The counts are in ink, not in status colours. Five differently coloured
 * numbers in a row is a rainbow, and — checked against a colour-vision model —
 * the amber and green of this palette are barely separable to a protanope, so
 * the names beside the figures are what tell them apart.
 */
const MaintenanceKpi: React.FC<{
  open: number;
  notStarted: number;
  completed: number;
  total: number;
}> = ({ open, notStarted, completed, total }) => {
  const share = total > 0 ? completed / total : 0;
  const tone = open === 0 ? GOOD : notStarted > 0 ? BAD : WARN;

  return (
    <Link
      href="/maintenance/jobs"
      className="bg-white border border-[#E6E7EB] rounded-xl p-4 shadow-sm block transition-[border-color,box-shadow] group hover:border-[#C9CCD2] hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        {/* The colour rides a wrapper: lucide icons paint from currentColor */}
        <span className="shrink-0 flex items-center" style={{ color: tone }}>
          <Wrench className="w-3.5 h-3.5" />
        </span>
        <span className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B6F76] truncate">
          Maintenance
        </span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#D8DAE0] group-hover:text-[#6B6F76] transition-colors" />
      </div>

      {/*
        Name over figure, so the three read left to right as a sentence rather
        than as three numbers you then have to match to three labels.

        The names are sentence case at a plain weight, not the tracked capitals
        the card's own label wears. Two levels of shouting inside one card is
        one too many, and — the reason it was changed — "NOT STARTED" in tracked
        capitals does not fit a third of this card, so it truncated to "NOT
        STA…", which is not a label at all.
      */}
      <dl className="mt-3.5 grid grid-cols-3 gap-2">
        {[
          { name: 'Open', value: open },
          { name: 'Not started', value: notStarted },
          { name: 'Completed', value: completed },
        ].map((figure) => (
          <div key={figure.name} className="min-w-0">
            <dt className="text-[10px] leading-tight text-[#6B6F76]">{figure.name}</dt>
            <dd className="mt-1 text-[24px] leading-none font-semibold text-[#17181D]">
              {figure.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <div
        className="mt-3.5 h-1 rounded-full overflow-hidden"
        style={{ backgroundColor: `${tone}1F` }}
        title={`${completed} of ${total} job${total === 1 ? '' : 's'} completed`}
        role="img"
        aria-label={`${completed} of ${total} job${total === 1 ? '' : 's'} completed`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.round(share * 100)}%`, backgroundColor: tone }}
        />
      </div>
    </Link>
  );
};

const Panel: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  caption?: string;
  /** Where the whole of this panel's subject lives, when it lives elsewhere. */
  action?: { href: string; label: string };
  children: React.ReactNode;
}> = ({ icon: Icon, title, caption, action, children }) => (
  <section className="bg-white border border-[#E6E7EB] rounded-xl shadow-sm">
    <div className="px-5 py-4 border-b border-[#EFEFF2] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <span className="w-8 h-8 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
            <Icon className="w-[18px] h-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-[#17181D]">{title}</h2>
          {caption && <p className="text-xs text-[#6B6F76] mt-0.5">{caption}</p>}
        </div>
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline shrink-0"
        >
          {action.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

/**
 * One branch, on the same column grid as the headings above it. Below the
 * panel's 48rem the grid collapses and each cell carries its own label,
 * because a bare date or a bare percentage means nothing once the heading row
 * is gone. Measured against the panel and not the window, so the rail being
 * open or shut moves the switch with it.
 */
const BranchRow: React.FC<{ branch: BranchSnapshot }> = ({ branch }) => {
  const rowClasses =
    'px-5 py-4 grid grid-cols-1 @min-[48rem]:grid-cols-[minmax(12.5rem,1.6fr)_minmax(6rem,9.5rem)_minmax(4.5rem,8rem)_minmax(8rem,1.1fr)_minmax(6rem,9rem)_1.25rem] gap-x-5 gap-y-3 @min-[48rem]:items-center hover:bg-[#FAFAFA] transition-colors group';

  const identity = (
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-11 h-11 rounded-lg bg-[#FDECEE] text-[#C8202D] text-sm font-bold flex items-center justify-center shrink-0">
        {initials(branch.name)}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-[#17181D] truncate">{branch.name}</p>
        {branch.location && (
          <p className="text-[11px] text-[#6B6F76] flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {branch.location}
          </p>
        )}
      </div>
    </div>
  );

  if (branch.neverInspected) {
    return (
      <Link href="/inspections" className={rowClasses}>
        {identity}
        <div className="@min-[48rem]:col-span-4">
          <p className="text-xs font-bold text-[#C8202D]">Never inspected</p>
          <p className="text-[11px] text-[#6B6F76] mt-0.5">Start the first visit</p>
        </div>
        <ChevronRight className="hidden @min-[48rem]:block w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D]" />
      </Link>
    );
  }

  const report = branch.latest!;
  const counts = report.severityCounts;
  const worst = SEVERITY_ORDER.find((s) => counts[s] > 0);

  return (
    <Link href={`/inspections/${report.inspection.id}`} className={rowClasses}>
      {identity}

      {/* When it was last seen, and whether that is late */}
      <div>
        <p className="text-xs font-semibold text-[#17181D] tabular-nums">
          {formatDate(report.inspection.date)}
        </p>
        {branch.daysOverdue > 0 ? (
          <p className="text-[11px] font-semibold text-[#C8202D] flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C8202D] shrink-0" />
            {branch.daysOverdue} day{branch.daysOverdue === 1 ? '' : 's'} overdue
          </p>
        ) : (
          <p className="text-[11px] text-[#6B6F76] mt-0.5">
            Next {formatDate(branch.nextDueDate)}
          </p>
        )}
      </div>

      {/* Score, and which way it moved since the visit before */}
      <div className="flex items-center gap-2">
        <ScoreRing score={report.inspection.score} size={46} thickness={4} />
        {branch.delta !== null && branch.delta !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
              branch.delta > 0 ? 'text-[#157F4B]' : 'text-[#C8202D]'
            }`}
            title={`${branch.delta > 0 ? 'Up' : 'Down'} ${Math.abs(
              branch.delta
            )} points on the previous visit`}
          >
            {branch.delta > 0 ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {branch.delta > 0 ? '+' : ''}
            {branch.delta}
          </span>
        )}
      </div>

      {/* What was found, worst first */}
      <div className="flex flex-wrap items-center gap-1.5">
        {report.issues.length === 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#E6F4EC] text-[#157F4B]">
            No findings
          </span>
        ) : (
          SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <PriorityBadge
              key={s}
              severity={s}
              size="sm"
              count={counts[s]}
              title={`${counts[s]} ${SEVERITY_LABEL[s]}`}
            />
          ))
        )}
      </div>

      {/* The single number that says how hard to push, and how much there is */}
      <div className="flex items-center gap-2">
        {worst ? (
          <>
            <PriorityBadge severity={worst} size="sm" />
            <span
              className="w-5 h-5 rounded-full border border-[#E6E7EB] text-[10px] font-bold text-[#6B6F76] flex items-center justify-center tabular-nums shrink-0"
              title={`${report.issues.length} finding${
                report.issues.length === 1 ? '' : 's'
              } in total`}
            >
              {report.issues.length}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-[#6B6F76]">Clear</span>
        )}
      </div>

      <ChevronRight className="hidden @min-[48rem]:block w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D]" />
    </Link>
  );
};

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bug,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Gauge,
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
import { Inspection, MaintenanceJob, ReasonGroup, Severity, branchesOf } from '../types';
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
import { CountUp, Reveal, Stagger, StaggerItem } from './motion';
import { Card, Panel, PanelHeader } from './ui';
import { BarList, CHART_COLORS, ScoreDial, StackedMeter, TrendChart, TrendPoint } from './charts';

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

  const ownBranches = useMemo(() => branchesOf(user), [user]);

  const branches = useMemo(
    () => (everyBranch ? allBranches : allBranches.filter((b) => ownBranches.includes(b.name))),
    [everyBranch, allBranches, ownBranches]
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

  /** This week's round at each branch the manager whose dashboard this is runs. */
  const mondays = useMemo(
    () =>
      ownBranches.map((branch) => ({ branch, monday: mondayStatusFor(branch, inspections) })),
    [ownBranches, inspections]
  );
  const needsAction = model.severityTotals.critical + model.severityTotals.high;
  const inspectedCount = model.branches.filter((b) => !b.neverInspected).length;
  const averageScore = model.averageScore ?? 0;

  /*
   * The trend: every submitted visit in date order, the last twelve. One
   * point per visit rather than a weekly mean, so a single bad visit shows as
   * the dip it was instead of being averaged into a neighbour.
   */
  const trend: TrendPoint[] = useMemo(
    () =>
      [...model.recent]
        .reverse()
        .slice(-12)
        .map((report) => ({
          label: `${formatDate(report.inspection.date)}`,
          shortLabel: shortDate(report.inspection.date),
          value: report.inspection.score,
          detail: report.inspection.branchName,
        })),
    [model.recent]
  );
  const trendDelta =
    trend.length > 1 ? trend[trend.length - 1].value - trend[0].value : null;

  const statusParts = [
    { key: 'reported', label: 'Not started', value: jobCounts.notStarted, color: CHART_COLORS.status.notStarted },
    {
      key: 'progress',
      label: 'In progress',
      value: jobCounts.open - jobCounts.notStarted,
      color: CHART_COLORS.status.inProgress,
    },
    { key: 'done', label: 'Completed', value: jobCounts.completed, color: CHART_COLORS.status.completed },
  ];

  const title = everyBranch
    ? 'Dashboard'
    : ownBranches.length === 1
      ? ownBranches[0]
      : ownBranches.length > 1
        ? 'Your branches'
        : 'Dashboard';

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
      {/* Page heading */}
      <Reveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA1A9]">
            {longToday()}
          </p>
          <h1 className="mt-1.5 text-[26px] md:text-[30px] leading-tight font-bold tracking-tight text-[#17181D]">
            {/*
              A branch manager's dashboard covers their own branches, so it
              says which — or "Your branches" for a manager who runs two.
              Calling it "Dashboard" while showing one branch's averages
              would read as the whole estate doing badly.
            */}
            {title}
          </h1>
          <p className="mt-1.5 text-[13px] text-[#6B6F76]">
            {model.empty
              ? 'No inspections submitted yet'
              : everyBranch
                ? `${model.totalInspections} inspection${model.totalInspections === 1 ? '' : 's'} across ${inspectedCount} of ${model.branches.length} branches · latest ${formatDate(model.latestVisitDate)}`
                : `${model.totalInspections} inspection${model.totalInspections === 1 ? '' : 's'} on record · latest ${formatDate(model.latestVisitDate)}`}
          </p>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2">
          {/*
            The one thing a branch manager has to do this week, on the screen
            they land on. A link rather than the full card the inspections page
            carries — this page reports, and the doing belongs over there.
          */}
          {mondays.map(({ branch, monday }, index) => (
            <Link
              key={branch}
              id={index === 0 ? 'dashboard-monday-link' : `dashboard-monday-link-${index + 1}`}
              href="/inspections"
              className={`shrink-0 inline-flex items-center gap-2.5 h-10 px-4 rounded-xl border text-xs font-bold transition-all hover:-translate-y-px hover:shadow-md ${
                monday.done
                  ? 'bg-[#EAF6EF] border-[#157F4B]/20 text-[#12643C]'
                  : monday.overdue
                    ? 'bg-[#C8202D] border-[#C8202D] text-white shadow-[0_6px_16px_-6px_rgba(200,32,45,0.55)]'
                    : 'bg-[#FDF3E2] border-[#B4740A]/25 text-[#8A5A08]'
              }`}
            >
              <CalendarClock className="w-4 h-4 shrink-0" />
              <span>
                {/* Named only when there is more than one round to tell apart */}
                {mondays.length > 1 && `${branch}: `}
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
          ))}

          {/*
            Equipment does not wait for Monday. A manager who finds a fault on
            the Tuesday gets to the board from the screen they land on.
            Offered to the role that reports into maintenance without running
            it — the admin and the maintenance manager live on that board already.
          */}
          {can(user, 'maintenance.report') && (
            <Link
              id="dashboard-report-repair-link"
              href="/maintenance/jobs"
              className="shrink-0 inline-flex items-center gap-2.5 h-10 px-4 rounded-xl border border-[#E4E6EB] bg-white text-xs font-bold text-[#17181D] shadow-xs transition-all hover:-translate-y-px hover:shadow-md"
            >
              <Wrench className="w-4 h-4 shrink-0 text-[#6B6F76]" />
              <span>Report a repair</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          )}

          {everyBranch && (
            <Link
              href="/inspections/new"
              className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#17181D] text-white text-xs font-bold shadow-[0_6px_16px_-8px_rgba(23,24,29,0.6)] transition-all hover:-translate-y-px hover:bg-black"
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              New inspection
            </Link>
          )}
        </div>
      </Reveal>

      {model.empty ? (
        <Reveal delay={0.08}>
          <Card className="px-6 py-16 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
              <ClipboardList className="w-7 h-7" />
            </span>
            <p className="mt-5 text-base font-bold text-[#17181D]">Nothing to summarise yet</p>
            <p className="mt-1.5 text-[13px] text-[#6B6F76] max-w-sm mx-auto">
              Once the first inspection is submitted, scores, trends and findings appear here.
            </p>
            <Link
              href="/inspections"
              className="inline-flex items-center gap-2 mt-6 h-10 px-5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-xl shadow-[0_8px_20px_-8px_rgba(200,32,45,0.6)] transition-all hover:-translate-y-px"
            >
              <ClipboardList className="w-4 h-4" />
              Go to inspections
            </Link>
          </Card>
        </Reveal>
      ) : (
        <>
          {/* The headline: where the estate stands, and which way it is going */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <Reveal delay={0.05} className="xl:col-span-7">
              <Card className="h-full p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex sm:flex-col items-center sm:items-start gap-5 sm:w-[11.5rem] shrink-0">
                    <div className="relative">
                      <ScoreDial value={model.averageScore} size={128} stroke={11} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[34px] leading-none font-bold tracking-tight text-[#17181D]">
                          <CountUp value={averageScore} />
                          <span className="text-lg font-semibold text-[#9CA1A9]">%</span>
                        </span>
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9]">
                          Average
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[#17181D]">Average score</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#6B6F76]">
                        Mean of each branch&rsquo;s latest visit, across {inspectedCount}{' '}
                        branch{inspectedCount === 1 ? '' : 'es'}.
                      </p>
                      <ScoreVerdict score={model.averageScore} />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-[#17181D]">Visit scores</p>
                        <p className="mt-0.5 text-xs text-[#6B6F76]">
                          {trend.length === 1
                            ? 'One visit so far — the line appears from the second'
                            : `The last ${trend.length} submitted visits, oldest to newest`}
                        </p>
                      </div>
                      {trendDelta !== null && trendDelta !== 0 && (
                        <span
                          className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums ${
                            trendDelta > 0 ? 'bg-[#E6F4EC] text-[#12643C]' : 'bg-[#FDECEE] text-[#A81823]'
                          }`}
                          title={`${trendDelta > 0 ? 'Up' : 'Down'} ${Math.abs(trendDelta)} points from the first visit shown`}
                        >
                          {trendDelta > 0 ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {trendDelta > 0 ? '+' : ''}
                          {trendDelta} pts
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <TrendChart
                        points={trend}
                        seriesLabel="Score"
                        suffix="%"
                        height={236}
                        /*
                         * Scaled to the scores rather than pinned at zero: a
                         * line is read by its slope, and ten points of change
                         * between 90 and 100 is invisible on a 0–100 axis.
                         */
                        min={trendFloor(trend)}
                        max={100}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </Reveal>

            {/* The four figures a manager acts on */}
            <Stagger className="xl:col-span-5 grid grid-cols-2 gap-3 sm:gap-5">
              <StaggerItem>
                <Kpi
                  icon={ShieldAlert}
                  label="Needs action"
                  value={needsAction}
                  tone={needsAction > 0 ? 'bad' : 'good'}
                  href="/inspections"
                  caption={
                    needsAction === 0
                      ? 'No critical or high findings'
                      : `${model.severityTotals.critical} critical · ${model.severityTotals.high} high`
                  }
                />
              </StaggerItem>
              <StaggerItem>
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
                />
              </StaggerItem>
              <StaggerItem>
                <Kpi
                  icon={History}
                  label="Repeat issues"
                  value={model.repeatIssues.length}
                  tone={model.repeatIssues.length > 0 ? 'warn' : 'good'}
                  caption={
                    model.repeatIssues.length === 0
                      ? 'Nothing recurring'
                      : 'Flagged on more than one visit'
                  }
                />
              </StaggerItem>
              <StaggerItem>
                {canOpenJobBoard(user) ? (
                  <Kpi
                    icon={Wrench}
                    label="Open repairs"
                    value={jobCounts.open}
                    tone={jobCounts.open === 0 ? 'good' : jobCounts.notStarted > 0 ? 'bad' : 'warn'}
                    href="/maintenance/jobs"
                    caption={
                      jobCounts.open === 0
                        ? 'The board is clear'
                        : `${jobCounts.notStarted} not started · ${jobCounts.completed} done`
                    }
                  />
                ) : (
                  <Kpi
                    icon={Activity}
                    label="Findings"
                    value={model.findingsTotal}
                    tone={model.findingsTotal > 0 ? 'warn' : 'good'}
                    caption="On the latest visit to each branch"
                  />
                )}
              </StaggerItem>
            </Stagger>
          </div>

          {/* Things that need doing. Absent entirely when there are none. */}
          <AttentionList model={model} />

          {/* Where it stands, broken down three ways */}
          <Stagger className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
            <StaggerItem>
              <Panel
                icon={Gauge}
                title="Branch scores"
                caption="Latest visit at each branch, lowest first"
                action={{ href: '/inspections', label: 'Records' }}
              >
                <BarList
                  label="Latest score by branch"
                  max={100}
                  rows={[...model.branches]
                    .sort((a, b) => {
                      if (a.neverInspected !== b.neverInspected) return a.neverInspected ? 1 : -1;
                      return (a.latest?.inspection.score ?? 0) - (b.latest?.inspection.score ?? 0);
                    })
                    .slice(0, 9)
                    .map((b) => ({
                      key: b.name,
                      label: b.name,
                      value: b.latest?.inspection.score ?? 0,
                      display: b.latest ? `${b.latest.inspection.score}%` : undefined,
                      empty: b.neverInspected ? 'Not inspected yet' : undefined,
                      detail: b.latest
                        ? `${formatDate(b.latest.inspection.date)} · ${b.latest.issues.length} finding${
                            b.latest.issues.length === 1 ? '' : 's'
                          }`
                        : 'No visit on record',
                    }))}
                />
              </Panel>
            </StaggerItem>

            <StaggerItem>
              <Panel
                icon={AlertTriangle}
                title="Findings"
                caption={`${model.findingsTotal} on the latest visit to each branch`}
              >
                {model.findingsTotal === 0 ? (
                  <EmptyNote icon={ClipboardCheck} text="No findings on the latest visits." />
                ) : (
                  <>
                    <StackedMeter
                      label="Findings by severity"
                      unit="finding"
                      parts={SEVERITY_ORDER.map((s) => ({
                        key: s,
                        label: SEVERITY_LABEL[s],
                        value: model.severityTotals[s],
                        color: CHART_COLORS.severity[s],
                      }))}
                    />
                    {model.byCategory.length > 0 && (
                      <div className="mt-6 pt-5 border-t border-[#F0F1F4]">
                        <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
                          Where they come from
                        </p>
                        <BarList
                          label="Findings by category"
                          rows={model.byCategory.slice(0, 5).map((cat) => ({
                            key: cat.key,
                            label: CATEGORY_META[cat.key].label,
                            value: cat.failures,
                            detail: `${cat.failures} finding${cat.failures === 1 ? '' : 's'} at ${
                              cat.branches
                            } branch${cat.branches === 1 ? '' : 'es'}`,
                          }))}
                        />
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </StaggerItem>

            {canOpenJobBoard(user) && (
              <StaggerItem className="lg:col-span-2 2xl:col-span-1">
                <Panel
                  icon={Wrench}
                  title="Maintenance"
                  caption={`${jobCounts.total} job${jobCounts.total === 1 ? '' : 's'} on the board`}
                  action={{ href: '/maintenance/jobs', label: 'Job board' }}
                >
                  {jobCounts.total === 0 ? (
                    <EmptyNote icon={Wrench} text="Nothing has been reported yet." />
                  ) : (
                    <StackedMeter label="Jobs by status" unit="job" parts={statusParts} />
                  )}
                  {openJobs.length > 0 && (
                    <ul className="mt-5 pt-4 border-t border-[#F0F1F4] -mx-2">
                      {openJobs.slice(0, 4).map((job) => (
                        <li key={job.id}>
                          <Link
                            href={`/maintenance/${job.id}`}
                            className="px-2 py-2 rounded-lg flex items-center gap-3 group hover:bg-[#F7F8FA] transition-colors"
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                                {job.title}
                              </span>
                              <span className="block text-[11px] text-[#6B6F76] truncate">
                                {/* The branch only where this dashboard covers more than one */}
                                {everyBranch && `${job.branchName} · `}
                                waiting {daysOpen(job)} day{daysOpen(job) === 1 ? '' : 's'}
                              </span>
                            </span>
                            <StatusPill status={statusOf(job)} />
                            <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all shrink-0" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </StaggerItem>
            )}
          </Stagger>

          {/* The core panel: where every branch stands */}
          <Reveal delay={0.1}>
            <section className="@container bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] overflow-hidden">
              <PanelHeader
                icon={MapPin}
                title="Branches"
                caption="Latest visit at each branch, most in need of attention first"
                action={{ href: '/inspections', label: 'All records' }}
              />

              {/* Column headings. Hidden where the rows stack and the labels would lie. */}
              <div className="hidden @min-[48rem]:grid grid-cols-[minmax(12.5rem,1.6fr)_minmax(6rem,9.5rem)_minmax(4.5rem,8rem)_minmax(8rem,1.1fr)_minmax(6rem,9rem)_1.25rem] gap-x-5 px-6 py-2.5 border-y border-[#F0F1F4] bg-[#FAFBFC] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
                <span>Branch</span>
                <span>Last visit</span>
                <span>Score</span>
                <span>Issues</span>
                <span>Priority</span>
                <span />
              </div>

              <div className="divide-y divide-[#F0F1F4] border-t border-[#F0F1F4] @min-[48rem]:border-t-0">
                {model.branches.map((branch) => (
                  <BranchRow key={branch.name} branch={branch} />
                ))}
              </div>
            </section>
          </Reveal>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Which checklist areas are weakest across the estate */}
            {model.weakestSections.length > 0 && (
              <Reveal delay={0.12}>
                <Panel
                  icon={ClipboardCheck}
                  title="Weakest checklist areas"
                  caption="Pass rate pooled across the latest visits"
                >
                  <BarList
                    label="Pass rate by checklist area"
                    max={100}
                    rows={model.weakestSections.slice(0, 6).map((section) => ({
                      key: section.key,
                      label: section.title,
                      sub: section.listLabel,
                      value: section.rate,
                      display: `${section.rate}%`,
                      detail: `${section.passed} of ${section.total} checks passed`,
                    }))}
                  />
                </Panel>
              </Reveal>
            )}

            {/* Quick way back into the records */}
            <Reveal delay={0.14}>
              <Panel
                icon={ClipboardList}
                title="Recent inspections"
                action={{ href: '/inspections', label: 'All records' }}
              >
                <ul className="-mx-2 -my-1">
                  {model.recent.slice(0, 5).map((report) => (
                    <li key={report.inspection.id}>
                      <Link
                        href={`/inspections/${report.inspection.id}`}
                        className="px-2 py-2.5 rounded-xl flex items-center gap-3.5 group hover:bg-[#F7F8FA] transition-colors"
                      >
                        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F4F5F7] to-[#E9EBEF] text-[#6B6F76] text-[11px] font-bold flex items-center justify-center shrink-0">
                          {initials(report.inspection.branchName)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#17181D] truncate">
                            {report.inspection.branchName}
                          </p>
                          <p className="text-xs text-[#6B6F76] truncate">
                            {formatDate(report.inspection.date)}
                            {report.inspection.inspectorName ? ` · ${report.inspection.inspectorName}` : ''}
                            {' · '}
                            {report.issues.length === 0
                              ? 'no findings'
                              : `${report.issues.length} finding${report.issues.length === 1 ? '' : 's'}`}
                          </p>
                        </div>
                        <ScoreRing score={report.inspection.score} size={40} thickness={3.5} />
                        <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            </Reveal>
          </div>

          {/* Things that did not get fixed between visits */}
          {model.repeatIssues.length > 0 && (
            <Reveal delay={0.16}>
              <Panel
                icon={History}
                title="Repeat issues"
                caption="Flagged on more than one visit to the same branch"
              >
                <ul className="divide-y divide-[#F0F1F4] -my-1">
                  {model.repeatIssues.slice(0, 8).map((repeat) => (
                    <li
                      key={`${repeat.branchName}-${repeat.item.id}`}
                      className="py-3 flex items-start gap-3"
                    >
                      <span className="w-8 h-8 rounded-xl bg-[#FDF3E2] text-[#B4740A] flex items-center justify-center shrink-0">
                        <History className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#17181D]">{repeat.item.text}</p>
                        <p className="text-xs text-[#6B6F76] mt-0.5">
                          {repeat.branchName} · flagged on {repeat.visits} visits
                        </p>
                      </div>
                      <PriorityBadge severity={repeat.severity} size="sm" />
                    </li>
                  ))}
                </ul>
              </Panel>
            </Reveal>
          )}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** "Wednesday 29 September", for the line above the heading. */
function longToday(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** The trend axis floor: ten below the lowest score, to the nearest ten. */
function trendFloor(points: TrendPoint[]): number {
  if (points.length === 0) return 0;
  const low = Math.min(...points.map((p) => p.value));
  return Math.max(0, Math.min(80, Math.floor((low - 10) / 10) * 10));
}

/** "23 Sep", for a chart axis where the full date will not fit. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

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

/** A word on the score, with the icon and text doing the work the colour cannot alone. */
const ScoreVerdict: React.FC<{ score: number | null }> = ({ score }) => {
  if (score === null) return null;
  const [text, classes] =
    score >= 90
      ? ['On standard', 'bg-[#E6F4EC] text-[#12643C]']
      : score >= 75
        ? ['Needs attention', 'bg-[#FDF3E2] text-[#8A5A08]']
        : ['Below standard', 'bg-[#FDECEE] text-[#A81823]'];
  return (
    <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${classes}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
};

const EmptyNote: React.FC<{ icon: React.ComponentType<{ className?: string }>; text: string }> = ({
  icon: Icon,
  text,
}) => (
  <div className="py-6 flex flex-col items-center text-center">
    <span className="w-10 h-10 rounded-xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center">
      <Icon className="w-5 h-5" />
    </span>
    <p className="mt-3 text-xs text-[#6B6F76]">{text}</p>
  </div>
);

/**
 * Only rendered when something actually needs doing — an empty version of this
 * list would be noise on every visit to the page.
 */
const AttentionList: React.FC<{
  model: ReturnType<typeof buildDashboardModel>;
}> = ({ model }) => {
  const items: {
    icon: React.ComponentType<{ className?: string }>;
    lead: string;
    detail: string;
    href: string;
    tone: 'bad' | 'warn';
  }[] = [];

  if (model.draft) {
    items.push({
      icon: PenLine,
      lead: 'Unfinished inspection',
      detail: model.draft.branchName,
      href: `/inspections/${model.draft.id}/checklist`,
      tone: 'warn',
    });
  }
  model.neverInspected.forEach((b) =>
    items.push({
      icon: AlertTriangle,
      lead: b.name,
      detail: 'Never inspected — start the first visit',
      href: '/inspections',
      tone: 'bad',
    })
  );
  if (model.overdue.length > 0) {
    items.push({
      icon: CalendarClock,
      lead: `${model.overdue.length} branch${model.overdue.length === 1 ? '' : 'es'} overdue`,
      detail: model.overdue.map((b) => b.name).join(', '),
      href: '/inspections',
      tone: 'bad',
    });
  }
  if (model.unsignedCount > 0) {
    items.push({
      icon: PenLine,
      lead: `${model.unsignedCount} record${model.unsignedCount === 1 ? '' : 's'} unsigned`,
      detail: 'No manager signature',
      href: '/inspections',
      tone: 'warn',
    });
  }

  if (items.length === 0) return null;

  return (
    <Reveal delay={0.1}>
      <Card className="overflow-hidden">
        <div className="px-5 sm:px-6 py-4 flex items-center gap-3 border-b border-[#F0F1F4]">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#C8202D] opacity-60 animate-ping motion-reduce:hidden" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#C8202D]" />
          </span>
          <h2 className="text-[15px] font-bold text-[#17181D]">Needs attention</h2>
          <span className="ml-1 rounded-full bg-[#FDECEE] px-2 py-0.5 text-[11px] font-bold text-[#A81823] tabular-nums">
            {items.length}
          </span>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2">
          {items.map((item, i) => (
            <li
              key={i}
              className="border-b border-[#F0F1F4] md:odd:border-r last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
            >
              <Link
                href={item.href}
                className="h-full px-5 sm:px-6 py-3.5 flex items-center gap-3.5 hover:bg-[#FAFBFC] transition-colors group"
              >
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    item.tone === 'bad' ? 'bg-[#FDECEE] text-[#C8202D]' : 'bg-[#FDF3E2] text-[#B4740A]'
                  }`}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-[#17181D] truncate">{item.lead}</span>
                  <span className="block text-xs text-[#6B6F76] truncate">{item.detail}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Reveal>
  );
};

const TONE = {
  good: { dot: GOOD, soft: 'bg-[#E6F4EC] text-[#157F4B]' },
  warn: { dot: WARN, soft: 'bg-[#FDF3E2] text-[#B4740A]' },
  bad: { dot: BAD, soft: 'bg-[#FDECEE] text-[#C8202D]' },
} as const;

/**
 * One figure, and what it is doing.
 *
 * Colour is the quietest thing on this card, deliberately: the amber and green
 * of the status palette are barely separable to a protanope, so every card
 * says its state in words, and hue only repeats it in the icon tile and dot.
 * The figure is the information, so the figure is the loud thing.
 */
const Kpi: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  caption: React.ReactNode;
  tone: 'good' | 'bad' | 'warn';
  href?: string;
}> = ({ icon: Icon, label, value, caption, tone, href }) => {
  const t = TONE[tone];

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.soft}`}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
        {href && (
          <ArrowRight className="w-4 h-4 text-[#D5D8DE] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
      <p className="mt-4 text-[12px] font-semibold text-[#6B6F76]">{label}</p>
      {/*
        Proportional figures, not tabular: `tabular-nums` gives every digit the
        width of a zero, which at display size leaves a number looking gappy.
      */}
      <p className="mt-1 text-[32px] leading-none font-bold tracking-tight text-[#17181D]">
        <CountUp value={value} />
      </p>
      <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-[#6B6F76]">
        <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.dot }} />
        <span className="line-clamp-2">{caption}</span>
      </p>
    </>
  );

  const shell =
    'h-full bg-white border border-[#E8E9EE] rounded-2xl p-4 sm:p-5 block shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] transition-all duration-200';

  return href ? (
    <Link
      href={href}
      className={`${shell} group hover:-translate-y-0.5 hover:border-[#DADCE2] hover:shadow-[0_12px_24px_-12px_rgba(16,24,40,0.18)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
};

/**
 * One branch, on the same column grid as the headings above it. Below the
 * panel's 48rem the grid collapses and each cell carries its own label,
 * because a bare date or a bare percentage means nothing once the heading row
 * is gone. Measured against the panel and not the window, so the rail being
 * open or shut moves the switch with it.
 */
const BranchRow: React.FC<{ branch: BranchSnapshot }> = ({ branch }) => {
  const rowClasses =
    'px-6 py-4 grid grid-cols-1 @min-[48rem]:grid-cols-[minmax(12.5rem,1.6fr)_minmax(6rem,9.5rem)_minmax(4.5rem,8rem)_minmax(8rem,1.1fr)_minmax(6rem,9rem)_1.25rem] gap-x-5 gap-y-3 @min-[48rem]:items-center hover:bg-[#FAFBFC] transition-colors group';

  const identity = (
    <div className="flex items-center gap-3 min-w-0">
      <span
        className={`w-11 h-11 rounded-xl text-sm font-bold flex items-center justify-center shrink-0 ${
          branch.neverInspected
            ? 'bg-[#F4F5F7] text-[#9CA1A9]'
            : 'bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D]'
        }`}
      >
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
        <div className="@min-[48rem]:col-span-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F5F7] px-2.5 py-1 text-[11px] font-semibold text-[#6B6F76]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C8202D]" />
            Never inspected
          </span>
          <span className="text-[11px] text-[#9CA1A9]">Start the first visit</span>
        </div>
        <ChevronRight className="hidden @min-[48rem]:block w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all" />
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
          <p className="text-[11px] text-[#6B6F76] mt-0.5">Next {formatDate(branch.nextDueDate)}</p>
        )}
      </div>

      {/* Score, and which way it moved since the visit before */}
      <div className="flex items-center gap-2">
        <ScoreRing score={report.inspection.score} size={44} thickness={4} />
        {branch.delta !== null && branch.delta !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
              branch.delta > 0 ? 'text-[#157F4B]' : 'text-[#C8202D]'
            }`}
            title={`${branch.delta > 0 ? 'Up' : 'Down'} ${Math.abs(branch.delta)} points on the previous visit`}
          >
            {branch.delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {branch.delta > 0 ? '+' : ''}
            {branch.delta}
          </span>
        )}
      </div>

      {/* What was found, worst first */}
      <div className="flex flex-wrap items-center gap-1.5">
        {report.issues.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#E6F4EC] text-[#12643C]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#157F4B]" />
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
              title={`${report.issues.length} finding${report.issues.length === 1 ? '' : 's'} in total`}
            >
              {report.issues.length}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-[#6B6F76]">Clear</span>
        )}
      </div>

      <ChevronRight className="hidden @min-[48rem]:block w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
};

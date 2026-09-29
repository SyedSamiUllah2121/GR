'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducedMotion, motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileText,
  Hourglass,
  Inbox,
  MapPin,
  Repeat,
  Wallet,
  Wrench,
} from 'lucide-react';
import { MaintenanceJob, Severity } from '../types';
import { getJobs, statusOf, daysOpen, subscribeToMaintenance } from '../services/maintenanceStore';
import {
  AGEING_DAYS,
  TrendPoint as MonthPoint,
  buildMaintenanceOverview,
  formatTurnaround,
} from '../services/maintenanceReport';
import { SEVERITY_LABEL } from '../services/priority';
import { formatDateTime } from '../services/reportModel';
import { visibleJobs } from '../services/permissions';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { PriorityBadge } from './PriorityBadge';
import { StatusPill } from './MaintenanceStatusPill';
import { CountUp, EASE_OUT, Reveal, Stagger, StaggerItem, useSeenOnce, t } from './motion';
import { BUTTON, Card, PageHeader, Panel } from './ui';
import { BarList, CHART_COLORS, StackedMeter } from './charts';

/** Status palette, the same steps the dashboard and the rings use. */
const GOOD = '#157F4B';
const WARN = '#B4740A';
const BAD = '#C8202D';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/**
 * The maintenance dashboard: what is happening, and what keeps causing it.
 *
 * Answers a different question from the month-end report, which closes a
 * period and counts the work done in it. This is the state of the estate
 * today — a job open for three months does not appear in any single month's
 * report, and is exactly the kind of thing worth seeing here.
 */
export const MaintenanceOverviewScreen: React.FC = () => {
  const router = useRouter();
  const user = useCurrentUser();
  const [allJobs, setAllJobs] = useState<MaintenanceJob[]>(() => getJobs());

  useEffect(() => {
    const refresh = () => setAllJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  /*
   * Narrowed to the account before a single figure is counted, the same way
   * the board narrows its rows. Every number on this screen is a sum over
   * `jobs`, so scoping once here is what keeps a branch manager's overview
   * about their own branch — rather than asking each panel to remember, which
   * is how an estate-wide total appears on a screen that should not have one.
   */
  const jobs = useMemo(() => visibleJobs(user, allJobs), [user, allJobs]);

  const model = useMemo(() => buildMaintenanceOverview(jobs), [jobs]);

  if (model.empty) {
    return (
      <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
        <Reveal>
          <Heading />
        </Reveal>
        <Reveal delay={0.08}>
          <Card className="px-6 py-16 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
              <Wrench className="w-7 h-7" />
            </span>
            <p className="mt-5 text-base font-bold text-[#17181D]">No maintenance recorded yet</p>
            <p className="mt-1.5 text-[13px] text-[#6B6F76] max-w-sm mx-auto">
              Report a problem, or fail a maintenance check on an inspection, and it will show
              up here.
            </p>
            <Link href="/maintenance/jobs" className={`${BUTTON.primary} mt-6`}>
              <Wrench className="w-4 h-4" />
              Go to the board
            </Link>
          </Card>
        </Reveal>
      </div>
    );
  }

  /*
   * The board's three states as one whole. Counted from the model rather than
   * again from `jobs`, so the meter and the cards above it cannot disagree.
   */
  const statusParts = [
    { key: 'reported', label: 'Not started', value: model.notStarted, color: CHART_COLORS.status.notStarted },
    { key: 'progress', label: 'In progress', value: model.inProgress, color: CHART_COLORS.status.inProgress },
    { key: 'done', label: 'Completed', value: model.completed, color: CHART_COLORS.status.completed },
  ];

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
      <Reveal>
        <Heading
          caption={`${model.total} job${model.total === 1 ? '' : 's'} on record • ${
            model.open
          } still open`}
        />
      </Reveal>

      {/*
        The five figures worth acting on, read left to right as the life of a
        job: what is open, what nobody has picked up, what is finished — then
        the two that say how well that is going.
      */}
      <Stagger className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-5">
        <StaggerItem>
          <Kpi
            icon={Wrench}
            label="Open jobs"
            value={model.open}
            tone={model.urgentOpen > 0 ? 'bad' : model.open > 0 ? 'warn' : 'good'}
            href="/maintenance/jobs"
            caption={
              model.open === 0
                ? 'Nothing outstanding'
                : `${model.urgentOpen} urgent · ${model.inProgress} in progress`
            }
          />
        </StaggerItem>
        <StaggerItem>
          <Kpi
            icon={Inbox}
            label="Jobs not started"
            value={model.notStarted}
            /*
             * Amber while some of the open work is still untouched, red once
             * none of it has been picked up at all — an estate with jobs waiting
             * and nobody on any of them is the state worth seeing from across
             * the room.
             */
            tone={model.notStarted === 0 ? 'good' : model.inProgress > 0 ? 'warn' : 'bad'}
            href="/maintenance/jobs"
            caption={model.open === 0 ? 'Nothing waiting' : `${model.inProgress} underway`}
          />
        </StaggerItem>
        <StaggerItem>
          <Kpi
            icon={CheckCircle2}
            label="Completed jobs"
            value={model.completed}
            /*
             * Green whatever the number. This is a tally of work finished, not a
             * state to worry about — an estate with nothing completed yet is a
             * new estate, and the Open and Not Started cards beside it already
             * say whether anything is going wrong.
             */
            tone="good"
            href="/maintenance/jobs"
            caption={
              model.total === 0
                ? 'Nothing on record yet'
                : `${model.completionRate}% of all jobs finished`
            }
          />
        </StaggerItem>
        <StaggerItem>
          <Kpi
            icon={Hourglass}
            label="Waiting longest"
            value={model.oldestOpenDays}
            suffix="d"
            tone={model.oldestOpenDays >= AGEING_DAYS ? 'bad' : 'good'}
            caption={
              model.oldestOpen ? `${model.ageing.length} past ${AGEING_DAYS} days` : 'Nothing waiting'
            }
          />
        </StaggerItem>
        <StaggerItem className="col-span-2 lg:col-span-1">
          <Kpi
            icon={Wallet}
            label="Spent"
            value={model.totalCost ?? 0}
            // Money is a tally, not a state, so it wears no status colour
            tone="neutral"
            caption={
              model.totalCost === null
                ? 'No costs recorded yet'
                : `Across ${model.completed} completed job${model.completed === 1 ? '' : 's'}`
            }
          />
        </StaggerItem>
      </Stagger>

      {/* Things that need chasing. Absent entirely when there are none. */}
      {(model.ageing.length > 0 || model.urgentOpen > 0) && (
        <Reveal delay={0.1}>
          <Card className="overflow-hidden">
            <div className="px-5 sm:px-6 py-4 flex items-center gap-3 border-b border-[#F0F1F4]">
              <span className="relative flex w-2.5 h-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#C8202D] opacity-60 animate-ping motion-reduce:hidden" />
                <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#C8202D]" />
              </span>
              <h2 className="text-[15px] font-bold text-[#17181D]">Needs chasing</h2>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2">
              {model.urgentOpen > 0 && (
                <li className="border-b border-[#F0F1F4] last:border-b-0 md:border-b-0 md:[&:not(:last-child)]:border-r">
                  <Link
                    href="/maintenance/jobs"
                    className="h-full px-5 sm:px-6 py-3.5 flex items-center gap-3.5 hover:bg-[#FAFBFC] transition-colors group"
                  >
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#FDECEE] text-[#C8202D]">
                      <AlertTriangle className="w-[18px] h-[18px]" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                        {model.urgentOpen} urgent job{model.urgentOpen === 1 ? '' : 's'} open
                      </span>
                      <span className="block text-xs text-[#6B6F76] truncate">
                        Critical or high priority
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                </li>
              )}
              {model.ageing.length > 0 && (
                <li>
                  <Link
                    href="/maintenance/jobs"
                    className="h-full px-5 sm:px-6 py-3.5 flex items-center gap-3.5 hover:bg-[#FAFBFC] transition-colors group"
                  >
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#FDF3E2] text-[#B4740A]">
                      <Hourglass className="w-[18px] h-[18px]" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                        {model.ageing.length} job{model.ageing.length === 1 ? '' : 's'} over{' '}
                        {AGEING_DAYS} days old
                      </span>
                      <span className="block text-xs text-[#6B6F76] truncate">
                        Longest {model.oldestOpenDays} days
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        </Reveal>
      )}

      {/* The headline: whether the work is keeping up, and where it stands */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Raised against completed, so a growing backlog is visible */}
        <Reveal delay={0.08} className="xl:col-span-7">
          <Panel
            icon={BarChart3}
            title="Raised vs completed"
            caption="The last six months: breakdowns reported against jobs finished"
          >
            <RaisedCompletedChart trend={model.trend} />
          </Panel>
        </Reveal>

        {/* How the work splits by state, then by seriousness */}
        <Reveal delay={0.12} className="xl:col-span-5">
          <Panel
            icon={Activity}
            title="Where the work stands"
            caption={`${model.total} job${model.total === 1 ? '' : 's'} on record`}
            action={{ href: '/maintenance/jobs', label: 'Job board' }}
          >
            <StackedMeter label="Jobs by status" unit="job" parts={statusParts} />
            <div className="mt-6 pt-5 border-t border-[#F0F1F4]">
              <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
                Priority mix
              </p>
              <StackedMeter
                label="Jobs by priority"
                unit="job"
                parts={SEVERITY_ORDER.map((s) => ({
                  key: s,
                  label: SEVERITY_LABEL[s],
                  value: model.bySeverity[s],
                  color: CHART_COLORS.severity[s],
                }))}
              />
            </div>
          </Panel>
        </Reveal>
      </div>

      {/* Where the load falls, two ways */}
      <Stagger className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Which branches carry the load */}
        <StaggerItem>
          <Panel
            icon={MapPin}
            title="Where the problems are"
            caption="Open jobs by branch, the most outstanding first"
          >
            <BarList
              label="Open jobs by branch"
              rows={model.byBranch.map((branch) => ({
                key: branch.branchName,
                label: branch.branchName,
                value: branch.open,
                display: branch.open === 0 ? 'all done' : `${branch.open} open`,
                sub: [
                  `${branch.total} on record`,
                  branch.urgentOpen > 0 ? `${branch.urgentOpen} urgent` : null,
                  branch.repeatUnits > 0
                    ? `${branch.repeatUnits} repeat unit${branch.repeatUnits === 1 ? '' : 's'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                detail: `Avg turnaround ${formatTurnaround(branch.averageTurnaroundHours)} · spent ${
                  branch.cost === null ? '—' : branch.cost.toLocaleString()
                }`,
              }))}
            />
          </Panel>
        </StaggerItem>

        {/* Which trades the work falls to */}
        <StaggerItem>
          <Panel icon={Wrench} title="What kind of work" caption="Every job on record, by trade">
            <BarList
              label="Jobs by category"
              rows={model.byCategory.slice(0, 7).map((cat) => ({
                key: cat.key,
                label: cat.label,
                value: cat.total,
                sub: cat.open > 0 ? `${cat.open} open` : 'all done',
                detail: `${cat.total} job${cat.total === 1 ? '' : 's'}, ${cat.open} open · avg turnaround ${formatTurnaround(
                  cat.averageTurnaroundHours
                )}`,
              }))}
            />
          </Panel>
        </StaggerItem>
      </Stagger>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* The specific jobs to pick up next */}
        {model.attention.length > 0 && (
          <Reveal delay={0.1} className="xl:col-span-7">
            <Panel
              icon={AlertTriangle}
              title="Deal with these next"
              caption="Still open, worst priority and longest waiting first"
              action={{ href: '/maintenance/jobs', label: 'Full board' }}
            >
              <ul className="-mx-2 -my-1">
                {model.attention.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/maintenance/${job.id}`)}
                      className="w-full px-2 py-2.5 rounded-xl flex flex-wrap items-center gap-x-3.5 gap-y-2 text-left group cursor-pointer hover:bg-[#F7F8FA] transition-colors"
                    >
                      <span className="flex-1 min-w-[12rem]">
                        <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                          {job.title}
                        </span>
                        <span className="block text-[11px] text-[#6B6F76] truncate">
                          {job.branchName} • {job.equipment} • waiting {daysOpen(job)} day
                          {daysOpen(job) === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <PriorityBadge severity={job.priority} size="sm" />
                        <StatusPill status={statusOf(job)} />
                        <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </Reveal>
        )}

        {/* What keeps breaking */}
        <Reveal
          delay={0.14}
          className={model.attention.length > 0 ? 'xl:col-span-5' : 'xl:col-span-12'}
        >
          <Panel
            icon={Repeat}
            title="What keeps breaking"
            caption={
              model.repeats.length === 0
                ? 'No unit has failed more than once'
                : `${model.repeatShare}% of all jobs are on kit that has failed before`
            }
            action={
              model.repeats.length > 0
                ? { href: '/maintenance/jobs', label: 'See all repeats' }
                : undefined
            }
          >
            {model.repeats.length === 0 ? (
              <div className="py-6 flex flex-col items-center text-center">
                <span className="w-10 h-10 rounded-xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
                <p className="mt-3 text-xs text-[#6B6F76] max-w-xs">
                  Every job so far has been a one-off. Anything reported twice will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#F0F1F4] -my-1">
                {model.repeats.slice(0, 5).map((group) => (
                  <li key={group.key} className="py-3 flex flex-wrap items-center gap-x-3.5 gap-y-2">
                    <span className="w-9 h-9 rounded-xl bg-[#FDECEE] text-[#C8202D] text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {group.times}×
                    </span>
                    <span className="flex-1 min-w-[10rem]">
                      <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                        {group.label}
                      </span>
                      <span className="block text-[11px] text-[#6B6F76]">
                        {group.branchName} • {group.spanDays} days apart • last{' '}
                        {formatDateTime(group.lastReportedAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {group.openCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDF3E2] text-[#8A5A08]">
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {group.openCount} open
                        </span>
                      )}
                      <PriorityBadge severity={group.worstPriority} size="sm" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Reveal>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const Heading: React.FC<{ caption?: string }> = ({ caption }) => (
  <PageHeader
    eyebrow="Maintenance"
    title="Maintenance overview"
    subtitle={caption ?? 'What is outstanding, and what keeps causing it'}
    actions={
      <>
        <Link href="/maintenance/report" className={BUTTON.secondary}>
          <FileText className="w-4 h-4 text-[#6B6F76]" />
          Month-end report
        </Link>
        <Link href="/maintenance/jobs" className={BUTTON.primary}>
          <Wrench className="w-4 h-4" />
          Job board
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </>
    }
  />
);

const TONE = {
  good: { dot: GOOD, soft: 'bg-[#E6F4EC] text-[#157F4B]' },
  warn: { dot: WARN, soft: 'bg-[#FDF3E2] text-[#B4740A]' },
  bad: { dot: BAD, soft: 'bg-[#FDECEE] text-[#C8202D]' },
  neutral: { dot: '#9CA1A9', soft: 'bg-[#F4F5F7] text-[#17181D]' },
} as const;

/**
 * One figure, and what it is doing.
 *
 * Colour is the quietest thing on this card, deliberately. Run against a
 * colour-vision check, the amber and the green of the status palette separate
 * by only ΔE 5.7 under protanopia — so a row of five cards distinguished by
 * the colour of their numbers is a row that several readers cannot tell apart
 * at all. Every card therefore says its state in words in the caption, and
 * hue is left to two small marks — the icon tile and the dot — that repeat
 * what the words already said.
 *
 * Which is also why it looks better: five differently coloured display numbers
 * is a rainbow, and the eye reads the biggest thing first whatever its hue.
 * The figure is the information, so the figure is the only loud thing.
 */
const Kpi: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  caption: React.ReactNode;
  tone: keyof typeof TONE;
  href?: string;
}> = ({ icon: Icon, label, value, suffix = '', caption, tone, href }) => {
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
        width of a zero, which at display size leaves a number like 121 looking
        gappy. Tabular belongs in the lists further down the page, where
        figures have to line up vertically.
      */}
      <p className="mt-1 text-[32px] leading-none font-bold tracking-tight text-[#17181D]">
        <CountUp value={value} />
        {suffix && <span className="text-lg font-semibold text-[#9CA1A9]">{suffix}</span>}
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] leading-snug text-[#6B6F76]">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.dot }} />
        <span className="truncate">{caption}</span>
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
 * Raised against completed, month by month.
 *
 * Paired bars rather than a line: the useful reading is the gap between the
 * two in a single month — more raised than closed is a backlog forming — and
 * that comparison is easier side by side than as two lines crossing. One axis
 * for both, counted in jobs, so the two bars in a month can be compared
 * directly. The pair wear the status colours of where each job stands — a
 * breakdown raised is work not started, a job finished is completed — and a
 * legend names them, because red and green alone are not enough to go on.
 */
const RaisedCompletedChart: React.FC<{ trend: MonthPoint[] }> = ({ trend }) => {
  const [ref, seen] = useSeenOnce<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);

  const highest = Math.max(0, ...trend.map((t) => Math.max(t.raised, t.completed)));
  // A top that divides into four whole jobs, so every gridline is a count
  const top = Math.max(4, Math.ceil(highest / 4) * 4);
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top];
  const empty = highest === 0;

  const series = [
    { key: 'raised' as const, label: 'Raised', color: CHART_COLORS.status.notStarted },
    { key: 'completed' as const, label: 'Completed', color: CHART_COLORS.status.completed },
  ];

  return (
    // Positioned, so the screen-reader table below stays inside the chart
    <div ref={ref} className="relative">
      <div className="relative h-56 select-none">
        {/* Recessive grid: hairline, solid, one step off the surface */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute left-7 right-0 border-t"
            style={{ bottom: `${(t / top) * 100}%`, borderColor: CHART_COLORS.grid }}
          >
            <span className="absolute -left-7 w-5 -translate-y-1/2 text-right text-[10px] tabular-nums text-[#9CA1A9]">
              {t}
            </span>
          </div>
        ))}

        <div className="absolute inset-y-0 left-7 right-0 flex items-end gap-1 sm:gap-2">
          {trend.map((point, i) => (
            <div
              key={point.month}
              className="relative flex-1 h-full flex items-end justify-center gap-[3px] rounded-t-md transition-colors"
              style={{ background: hover === point.month ? 'rgba(23,24,29,0.03)' : undefined }}
              onPointerEnter={() => setHover(point.month)}
              onPointerLeave={() => setHover(null)}
            >
              {series.map((s, j) => {
                const share = point[s.key] / top;
                return (
                  <motion.span
                    key={s.key}
                    className="block w-[36%] max-w-[18px] rounded-t-[4px]"
                    style={{
                      height: `${share * 100}%`,
                      background: s.color,
                      transformOrigin: 'bottom',
                    }}
                    initial={{ scaleY: reduced ? 1 : 0 }}
                    animate={{ scaleY: seen || reduced ? 1 : 0 }}
                    transition={{
                      duration: t(0.7),
                      ease: EASE_OUT,
                      delay: t(reduced ? 0 : 0.05 * i + 0.04 * j),
                    }}
                  />
                );
              })}

              {hover === point.month && (
                <div
                  role="presentation"
                  className={`pointer-events-none absolute top-0 z-20 -translate-y-full rounded-lg bg-[#17181D] px-3 py-2 text-[11px] leading-snug text-white shadow-lg ring-1 ring-black/5 whitespace-nowrap ${
                    i === 0 ? 'left-0' : i === trend.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <span className="block text-white/60">{point.label}</span>
                  {series.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5 font-semibold">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      {s.label} {point[s.key]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {empty && (
          <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-max max-w-[80%] rounded-lg bg-white px-3 py-1.5 text-center text-xs text-[#6B6F76]">
            No breakdowns raised and nothing completed in the last six months
          </p>
        )}
      </div>

      <div className="mt-2 pl-7 flex gap-1 sm:gap-2">
        {trend.map((point) => (
          <span
            key={point.month}
            className="flex-1 min-w-0 truncate text-center text-[10px] text-[#9CA1A9]"
          >
            {point.label.slice(0, 3)}
          </span>
        ))}
      </div>

      {/* The legend is the identity channel: swatch, then name, in ink */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#F0F1F4]">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-xs text-[#6B6F76]">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
            <span className="font-semibold text-[#17181D] tabular-nums">
              {trend.reduce((n, p) => n + p[s.key], 0)}
            </span>
          </span>
        ))}
      </div>

      {/*
        The same numbers as a table, for screen readers. The hiding sits on a
        wrapper: a table will not shrink below its content, and left to hide
        itself it widens the page on a phone.
      */}
      <div className="sr-only">
      <table>
        <caption>Breakdowns raised and jobs completed, by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Raised</th>
            <th scope="col">Completed</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.month}>
              <th scope="row">{p.label}</th>
              <td>{p.raised}</td>
              <td>{p.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

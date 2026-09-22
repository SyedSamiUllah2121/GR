'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
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
  buildMaintenanceOverview,
  formatTurnaround,
} from '../services/maintenanceReport';
import { formatDateTime } from '../services/reportModel';
import { visibleJobs } from '../services/permissions';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { PriorityBadge } from './PriorityBadge';
import { StatusPill } from './MaintenanceStatusPill';

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
      <div className="p-5 sm:p-6 md:p-8 flex-1">
        <Heading />
        <div className="bg-white border border-[#E6E7EB] rounded-xl p-12 text-center shadow-sm mt-5">
          <Wrench className="w-9 h-9 text-[#9CA1A9] mx-auto mb-3" />
          <p className="text-sm font-bold text-[#17181D]">No maintenance recorded yet</p>
          <p className="text-xs text-[#6B6F76] mt-1">
            Report a problem, or fail a maintenance check on an inspection, and it will show
            up here.
          </p>
          <Link
            href="/maintenance/jobs"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-lg transition-colors"
          >
            Go to the board
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 md:p-8 flex-1 space-y-5">
      <Heading
        caption={`${model.total} job${model.total === 1 ? '' : 's'} on record • ${
          model.open
        } still open`}
      />

      {/*
        The five figures worth acting on, read left to right as the life of a
        job: what is open, what nobody has picked up, what is finished — then
        the two that say how well that is going.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Kpi
          icon={Wrench}
          label="Open jobs"
          value={model.open}
          tone={model.urgentOpen > 0 ? 'bad' : model.open > 0 ? 'warn' : 'good'}
          href="/maintenance/jobs"
          caption={
            model.open === 0 ? (
              'Nothing outstanding'
            ) : (
              <>
                <span className="font-bold text-[#C8202D]">{model.urgentOpen} urgent</span>
                {` · ${model.inProgress} in progress`}
              </>
            )
          }
          fill={model.total > 0 ? model.open / model.total : 0}
          fillTitle={`${model.open} of ${model.total} jobs are still open`}
        />
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
          tone={
            model.notStarted === 0 ? 'good' : model.inProgress > 0 ? 'warn' : 'bad'
          }
          href="/maintenance/jobs"
          caption={
            model.open === 0 ? 'Nothing waiting' : `${model.inProgress} underway`
          }
          fill={model.open > 0 ? model.notStarted / model.open : 0}
          fillTitle={`${model.notStarted} of ${model.open} open jobs have not been started`}
        />
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
          fill={model.completionRate / 100}
          fillTitle={`${model.completed} of ${model.total} jobs have been completed`}
        />
        <Kpi
          icon={Hourglass}
          label="Waiting longest"
          value={model.oldestOpenDays}
          suffix="d"
          tone={model.oldestOpenDays >= AGEING_DAYS ? 'bad' : 'good'}
          caption={
            model.oldestOpen
              ? `${model.ageing.length} past ${AGEING_DAYS} days`
              : 'Nothing waiting'
          }
          // Against a month, which is when a waiting job stops being a delay
          fill={Math.min(model.oldestOpenDays / 30, 1)}
          fillTitle={`Oldest open job has waited ${model.oldestOpenDays} days`}
        />
        <Kpi
          icon={Wallet}
          label="Spent"
          value={model.totalCost ?? 0}
          tone="warn"
          caption={
            model.totalCost === null
              ? 'No costs recorded yet'
              : `Across ${model.completed} completed job${model.completed === 1 ? '' : 's'}`
          }
          fill={model.totalCost === null ? 0 : 1}
          fillTitle="Total of every cost recorded against a job"
        />
      </div>

      {/* Things that need chasing */}
      {(model.ageing.length > 0 || model.urgentOpen > 0) && (
        <section className="bg-[#FDECEE] border border-[#C8202D]/20 rounded-xl overflow-hidden">
          <ul className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#C8202D]/15">
            {model.urgentOpen > 0 && (
              <li>
                <Link
                  href="/maintenance/jobs"
                  className="h-full px-5 py-3.5 flex items-center gap-3 hover:bg-[#C8202D]/5 transition-colors group"
                >
                  <AlertTriangle className="w-[18px] h-[18px] text-[#C8202D] shrink-0" />
                  <span className="flex-1 min-w-0 text-xs leading-snug">
                    <span className="font-bold text-[#17181D]">
                      {model.urgentOpen} urgent job{model.urgentOpen === 1 ? '' : 's'} open
                    </span>
                    <span className="text-[#6B6F76]"> — critical or high priority</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#C8202D]/50 group-hover:text-[#C8202D] shrink-0" />
                </Link>
              </li>
            )}
            {model.ageing.length > 0 && (
              <li>
                <Link
                  href="/maintenance/jobs"
                  className="h-full px-5 py-3.5 flex items-center gap-3 hover:bg-[#C8202D]/5 transition-colors group"
                >
                  <Hourglass className="w-[18px] h-[18px] text-[#C8202D] shrink-0" />
                  <span className="flex-1 min-w-0 text-xs leading-snug">
                    <span className="font-bold text-[#17181D]">
                      {model.ageing.length} job{model.ageing.length === 1 ? '' : 's'} over{' '}
                      {AGEING_DAYS} days old
                    </span>
                    <span className="text-[#6B6F76]">
                      {' '}
                      — longest {model.oldestOpenDays} days
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#C8202D]/50 group-hover:text-[#C8202D] shrink-0" />
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* What keeps breaking */}
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
          <p className="text-xs text-[#6B6F76]">
            Every job so far has been a one-off. Anything reported twice will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-[#EFEFF2] -my-1">
            {model.repeats.slice(0, 5).map((group) => (
              <li key={group.key} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-8 h-8 rounded-lg bg-[#FDECEE] text-[#C8202D] text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
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
                {group.openCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDF3E2] text-[#B4740A] shrink-0">
                    {group.openCount} open
                  </span>
                )}
                <PriorityBadge severity={group.worstPriority} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Which trades the work falls to */}
        <Panel icon={Wrench} title="What kind of work" caption="Every job on record, by trade">
          <ul className="space-y-2.5">
            {model.byCategory.slice(0, 7).map((cat) => (
              <li key={cat.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-[11px] font-semibold text-[#17181D] truncate">
                  {cat.label}
                </span>
                <span className="flex-1 min-w-0 h-2.5 bg-[#EFEFF2] rounded-full overflow-hidden">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(cat.total / model.byCategory[0].total) * 100}%`,
                      backgroundColor: cat.open > 0 ? BAD : GOOD,
                    }}
                    title={`${cat.total} job${cat.total === 1 ? '' : 's'}, ${cat.open} open`}
                  />
                </span>
                <span className="text-xs font-bold text-[#17181D] tabular-nums w-6 text-right shrink-0">
                  {cat.total}
                </span>
                <span className="text-[11px] text-[#6B6F76] tabular-nums w-16 text-right shrink-0">
                  {cat.open > 0 ? `${cat.open} open` : 'all done'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Raised against completed, so a growing backlog is visible */}
        <Panel
          icon={FileText}
          title="Raised vs completed"
          caption="The last six months. Bars above the line are new problems."
        >
          <TrendChart trend={model.trend} />
        </Panel>
      </div>

      {/* Which branches carry the load */}
      <Panel
        icon={MapPin}
        title="Where the problems are"
        caption="Branches with the most outstanding work first"
      >
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full min-w-[36rem] text-left">
            <thead>
              <tr className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9CA1A9]">
                <th className="pb-2 font-bold">Branch</th>
                <th className="pb-2 font-bold text-right">Open</th>
                <th className="pb-2 font-bold text-right">Urgent</th>
                <th className="pb-2 font-bold text-right">Repeat units</th>
                <th className="pb-2 font-bold text-right">Avg turnaround</th>
                <th className="pb-2 font-bold text-right">Spent</th>
                <th className="pb-2 font-bold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFF2]">
              {model.byBranch.map((branch) => (
                <tr key={branch.branchName} className="text-sm">
                  <td className="py-2.5 font-semibold text-[#17181D]">{branch.branchName}</td>
                  <td className="py-2.5 text-right tabular-nums font-bold text-[#17181D]">
                    {branch.open}
                  </td>
                  <td
                    className={`py-2.5 text-right tabular-nums font-bold ${
                      branch.urgentOpen > 0 ? 'text-[#C8202D]' : 'text-[#9CA1A9]'
                    }`}
                  >
                    {branch.urgentOpen}
                  </td>
                  <td
                    className={`py-2.5 text-right tabular-nums font-bold ${
                      branch.repeatUnits > 0 ? 'text-[#B4740A]' : 'text-[#9CA1A9]'
                    }`}
                  >
                    {branch.repeatUnits}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-[#6B6F76]">
                    {formatTurnaround(branch.averageTurnaroundHours)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-[#6B6F76]">
                    {branch.cost === null ? '—' : branch.cost.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-[#6B6F76]">
                    {branch.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* The specific jobs to pick up next */}
      {model.attention.length > 0 && (
        <Panel
          icon={AlertTriangle}
          title="Deal with these next"
          caption="Still open, worst priority and longest waiting first"
          action={{ href: '/maintenance/jobs', label: 'Full board' }}
        >
          <ul className="divide-y divide-[#EFEFF2] -my-1">
            {model.attention.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/maintenance/${job.id}`)}
                  className="w-full py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-left group cursor-pointer"
                >
                  <span className="flex-1 min-w-[12rem]">
                    <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                      {job.title}
                    </span>
                    <span className="block text-[11px] text-[#6B6F76]">
                      {job.branchName} • {job.equipment} • waiting {daysOpen(job)} day
                      {daysOpen(job) === 1 ? '' : 's'}
                    </span>
                  </span>
                  <PriorityBadge severity={job.priority} size="sm" />
                  <StatusPill status={statusOf(job)} />
                  <ChevronRight className="w-4 h-4 text-[#9CA1A9] group-hover:text-[#17181D] shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* How the open work splits by seriousness */}
      <Panel icon={AlertTriangle} title="Priority mix" caption="Every job on record">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          {SEVERITY_ORDER.map((severity) => (
            <div key={severity} className="flex items-center gap-2.5">
              <PriorityBadge severity={severity} size="sm" />
              <span className="text-xl font-bold text-[#17181D] tabular-nums">
                {model.bySeverity[severity]}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const Heading: React.FC<{ caption?: string }> = ({ caption }) => (
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
    <div>
      <h1 className="text-2xl md:text-[26px] font-bold tracking-tight text-[#17181D]">
        Maintenance overview
      </h1>
      <p className="text-xs text-[#6B6F76] mt-1.5">
        {caption ?? 'What is outstanding, and what keeps causing it'}
      </p>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <Link
        href="/maintenance/report"
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E6E7EB] rounded-lg text-xs font-semibold text-[#17181D] hover:bg-[#FAFAFA] transition-colors"
      >
        <FileText className="w-3.5 h-3.5 text-[#C8202D]" />
        Month-end report
      </Link>
      <Link
        href="/maintenance/jobs"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-[13px] font-bold rounded-lg transition-colors shadow-sm"
      >
        <Wrench className="w-4 h-4" />
        Job board
      </Link>
    </div>
  </div>
);

const TONE_TEXT = { good: GOOD, warn: WARN, bad: BAD } as const;

/**
 * One figure, and what it is doing.
 *
 * Colour is the quietest thing on this card, deliberately. Run against a
 * colour-vision check, the amber and the green of the status palette separate
 * by only ΔE 5.7 under protanopia — so a row of five cards distinguished by
 * the colour of their numbers is a row that several readers cannot tell apart
 * at all. Every card therefore says its state in words in the caption, and
 * hue is left to two small marks that repeat what the words already said.
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
  tone: 'good' | 'bad' | 'warn';
  /** 0–1. Every card says what its bar measures. */
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
        gappy. Tabular belongs in the columns further down the page, where
        figures have to line up vertically.
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

  /*
   * The same border and lift as the panels below — the page sits on #F6F6F8,
   * and a card a shade lighter than everything around it reads as switched
   * off rather than as restrained.
   */
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

const Panel: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  caption?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}> = ({ icon: Icon, title, caption, action, children }) => (
  <section className="bg-white border border-[#E6E7EB] rounded-xl shadow-sm">
    <div className="px-5 py-4 border-b border-[#EFEFF2] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
          <Icon className="w-[18px] h-[18px]" />
        </span>
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
 * Raised against completed, month by month.
 *
 * Paired bars rather than a line: the useful reading is the gap between the
 * two in a single month — more raised than closed is a backlog forming — and
 * that comparison is easier side by side than as two lines crossing.
 */
const TrendChart: React.FC<{ trend: { month: string; label: string; raised: number; completed: number }[] }> = ({
  trend,
}) => {
  const peak = Math.max(1, ...trend.map((t) => Math.max(t.raised, t.completed)));

  return (
    <div>
      <div className="flex items-end justify-between gap-2 h-36">
        {trend.map((point) => (
          <div key={point.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="w-full flex items-end justify-center gap-1 h-28">
              <span
                className="w-1/2 max-w-[1.25rem] rounded-t bg-[#C8202D] transition-[height] duration-500"
                style={{ height: `${(point.raised / peak) * 100}%` }}
                title={`${point.raised} raised in ${point.label}`}
              />
              <span
                className="w-1/2 max-w-[1.25rem] rounded-t bg-[#157F4B] transition-[height] duration-500"
                style={{ height: `${(point.completed / peak) * 100}%` }}
                title={`${point.completed} completed in ${point.label}`}
              />
            </div>
            <span className="text-[10px] font-semibold text-[#6B6F76] truncate w-full text-center">
              {point.label.slice(0, 3)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#EFEFF2]">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6B6F76]">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#C8202D]" />
          Raised
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6B6F76]">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#157F4B]" />
          Completed
        </span>
      </div>
    </div>
  );
};

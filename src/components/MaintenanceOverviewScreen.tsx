'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  FileText,
  Hourglass,
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
  const [jobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

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

      {/* The four figures worth acting on */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          icon={Wrench}
          label="Open Jobs"
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
          icon={Hourglass}
          label="Waiting Longest"
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
          icon={Clock}
          label="Avg Turnaround"
          value={model.averageTurnaroundHours ?? 0}
          suffix="h"
          tone={
            model.averageTurnaroundHours === null
              ? 'good'
              : model.averageTurnaroundHours <= 24
                ? 'good'
                : model.averageTurnaroundHours <= 72
                  ? 'warn'
                  : 'bad'
          }
          caption={`${model.completionRate}% of all jobs finished`}
          fill={model.completionRate / 100}
          fillTitle={`${model.completed} of ${model.total} jobs completed`}
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
const TONE_TILE = {
  good: 'bg-[#E6F4EC] text-[#157F4B]',
  warn: 'bg-[#FDF3E2] text-[#B4740A]',
  bad: 'bg-[#FDECEE] text-[#C8202D]',
} as const;

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
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${TONE_TILE[tone]}`}
        >
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <span className="text-[13px] font-bold text-[#17181D] flex-1 min-w-0">{label}</span>
        {href && (
          <ChevronRight className="w-4 h-4 text-[#C9CCD2] group-hover:text-[#17181D] shrink-0 transition-colors" />
        )}
      </div>
      <p
        className="text-[34px] leading-none font-bold tabular-nums mt-4"
        style={{ color: TONE_TEXT[tone] }}
      >
        {value.toLocaleString()}
        {suffix}
      </p>
      <p className="text-[11px] text-[#6B6F76] mt-2 leading-snug">{caption}</p>
      <div
        className="mt-4 h-1 rounded-full bg-[#EFEFF2] overflow-hidden"
        title={fillTitle}
        role="img"
        aria-label={fillTitle}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.round(Math.min(Math.max(fill, 0), 1) * 100)}%`,
            backgroundColor: TONE_TEXT[tone],
          }}
        />
      </div>
    </>
  );

  const shell = 'bg-white border border-[#E6E7EB] rounded-xl p-4 shadow-sm block transition-shadow';
  return href ? (
    <Link href={href} className={`${shell} group hover:shadow-md`}>
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

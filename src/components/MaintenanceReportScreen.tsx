'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Hourglass,
  MapPin,
  Printer,
  Tag,
  Timer,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  MaintenanceJob,
  Severity,
} from '../types';
import { categoryLabel } from '../services/categoryStore';

import { getJobs, subscribeToMaintenance, workMinutes } from '../services/maintenanceStore';
import {
  availableMonths,
  buildMonthlyReport,
  formatMinutes,
  formatTurnaround,
  monthKeyOf,
  monthLabel,
} from '../services/maintenanceReport';
import { SEVERITY_LABEL } from '../services/priority';
import { formatDate, formatDateTime } from '../services/reportModel';
import { visibleJobs } from '../services/permissions';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { PriorityBadge } from './PriorityBadge';
import { CountUp, Reveal, Stagger, StaggerItem } from './motion';
import { BUTTON, Card, PageHeader, Panel, PanelHeader } from './ui';
import { BarList, CHART_COLORS, StackedMeter } from './charts';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/** This month, as a "2026-09" key. */
function currentMonth(): string {
  return monthKeyOf(new Date().toISOString());
}

export const MaintenanceReportScreen: React.FC = () => {
  const user = useCurrentUser();
  const [allJobs, setAllJobs] = useState<MaintenanceJob[]>(() => getJobs());
  const [month, setMonth] = useState<string>(() => currentMonth());

  useEffect(() => {
    const refresh = () => setAllJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  /*
   * Narrowed to the account before the month is built, so a branch reading
   * the month-end report reads their own month. The months on offer come from
   * the narrowed list too — a month with nothing of theirs in it is not a
   * month they have a report for.
   */
  const jobs = useMemo(() => visibleJobs(user, allJobs), [user, allJobs]);

  const months = useMemo(() => {
    const found = availableMonths(jobs);
    const now = currentMonth();
    // The current month is always offerable, even before anything happens in it
    return found.includes(now) ? found : [now, ...found];
  }, [jobs]);

  // Keep the picker on a month that exists in the list
  useEffect(() => {
    if (months.length > 0 && !months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  const report = useMemo(() => buildMonthlyReport(jobs, month), [jobs, month]);
  const showCost = report.totalCost !== null;

  /*
   * Where the month's work ended up: what was finished in it, against what
   * was still open when it closed — split, as the carried-forward list below
   * splits it, by whether anybody had started.
   */
  const backlogStarted = report.backlog.filter((job) => !!job.startedAt).length;
  const statusParts = [
    {
      key: 'reported',
      label: 'Not started',
      value: report.backlog.length - backlogStarted,
      color: CHART_COLORS.status.notStarted,
    },
    { key: 'progress', label: 'In progress', value: backlogStarted, color: CHART_COLORS.status.inProgress },
    { key: 'done', label: 'Completed', value: report.completed, color: CHART_COLORS.status.completed },
  ];

  const openBranches = report.branches.filter((b) => b.openAtMonthEnd > 0);
  const costBranches = report.branches.filter((b) => b.totalCost !== null);

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
      <Reveal className="space-y-3">
        <nav className="no-print text-xs text-[#6B6F76] flex items-center gap-1.5">
          <Link href="/maintenance/jobs" className="hover:text-[#17181D] transition-colors">
            Maintenance
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#17181D] font-semibold">Month-end report</span>
        </nav>

        <PageHeader
          eyebrow="Maintenance carried out"
          title={report.monthLabel}
          subtitle={`${report.completed} job${report.completed === 1 ? '' : 's'} completed · ${
            report.openAtMonthEnd
          } still open at month end`}
          actions={
            <div className="no-print flex flex-wrap items-center gap-2">
              <label htmlFor="month-select" className="sr-only">
                Month
              </label>
              <select
                id="month-select"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-10 pl-3.5 pr-8 bg-white border border-[#E4E6EB] rounded-xl text-xs font-bold text-[#17181D] shadow-xs cursor-pointer focus:outline-none focus:border-[#C8202D] focus:ring-2 focus:ring-[#C8202D]/15"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => window.print()} className={BUTTON.primary}>
                <Printer className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
              <Link href="/maintenance/jobs" className={BUTTON.secondary}>
                <ArrowLeft className="w-4 h-4 text-[#6B6F76]" />
                <span>Back</span>
              </Link>
            </div>
          }
        />
      </Reveal>

      <div className="print-container space-y-6">
        {/* Headline figures for the month */}
        <Stagger className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-5">
          <StaggerItem>
            <Stat
              icon={CheckCircle2}
              label="Jobs completed"
              value={report.completed}
              tone="good"
              caption="Finished this month"
            />
          </StaggerItem>
          {/*
            Breakdowns and planned work stand side by side rather than added
            together. A month with twelve services and one breakdown is a good
            month, and a single "13 raised" would read as a bad one.
          */}
          <StaggerItem>
            <Stat
              icon={AlertTriangle}
              label="Problems raised"
              value={report.raised}
              caption="Breakdowns reported"
            />
          </StaggerItem>
          <StaggerItem>
            <Stat
              icon={CalendarClock}
              label="Services due"
              value={report.scheduled}
              caption="Planned work falling due"
            />
          </StaggerItem>
          <StaggerItem>
            <Stat
              icon={Timer}
              label="Average report to fix"
              value={formatTurnaround(report.averageTurnaroundHours)}
              caption="Across the jobs completed"
            />
          </StaggerItem>
          <StaggerItem className="col-span-2 lg:col-span-1">
            {showCost ? (
              <Stat
                icon={Wallet}
                label="Recorded cost"
                value={report.totalCost as number}
                caption="Against the jobs completed"
              />
            ) : (
              <Stat
                icon={Hourglass}
                label="Still open"
                value={report.openAtMonthEnd}
                tone={report.openAtMonthEnd > 0 ? 'warn' : 'good'}
                caption={report.openAtMonthEnd > 0 ? 'Carried into next month' : 'Nothing carried over'}
              />
            )}
          </StaggerItem>
        </Stagger>

        {report.completed === 0 && report.raised === 0 && report.scheduled === 0 ? (
          <Reveal delay={0.08}>
            <Card className="px-6 py-14 text-center">
              <span className="mx-auto w-12 h-12 rounded-2xl bg-[#F4F5F7] text-[#6B6F76] flex items-center justify-center">
                <ClipboardList className="w-6 h-6" />
              </span>
              <p className="mt-4 text-sm font-bold text-[#17181D]">
                No maintenance activity in {report.monthLabel}
              </p>
              <p className="text-xs text-[#6B6F76] mt-1">
                Nothing was raised and nothing was completed in this month.
              </p>
            </Card>
          </Reveal>
        ) : (
          <>
            {/*
              The month as charts, for the screen only. Each chart draws itself
              the first time it scrolls into view, and a print never scrolls —
              so a chart below the fold would print as an empty track. The
              printed report carries every one of these figures anyway: the
              branch table below holds the per-branch numbers, and the
              category and priority counts are repeated in the print-only
              summary under it.
            */}
            <Stagger className="no-print grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
              <StaggerItem>
                <Panel
                  icon={MapPin}
                  title="Work done by branch"
                  caption="Jobs completed this month, most first"
                >
                  {report.completed === 0 ? (
                    <EmptyNote text={`Nothing was completed in ${report.monthLabel}.`} />
                  ) : (
                    <BarList
                      label="Jobs completed by branch"
                      rows={report.branches
                        .filter((b) => b.completed > 0)
                        .map((b) => ({
                          key: b.branchName,
                          label: b.branchName,
                          value: b.completed,
                          sub: `${formatMinutes(b.totalWorkMinutes)} on jobs · ${formatTurnaround(
                            b.averageTurnaroundHours
                          )} report to fix`,
                          detail: `${b.raised} problem${b.raised === 1 ? '' : 's'} · ${b.scheduled} service${
                            b.scheduled === 1 ? '' : 's'
                          } raised this month`,
                        }))}
                    />
                  )}

                  {openBranches.length > 0 && (
                    <div className="mt-6 pt-5 border-t border-[#F0F1F4]">
                      <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
                        Still open at month end
                      </p>
                      <BarList
                        label="Jobs open at month end by branch"
                        rows={[...openBranches]
                          .sort((a, b) => b.openAtMonthEnd - a.openAtMonthEnd)
                          .map((b) => ({
                            key: b.branchName,
                            label: b.branchName,
                            value: b.openAtMonthEnd,
                            detail: `${b.openAtMonthEnd} job${b.openAtMonthEnd === 1 ? '' : 's'} carried into the next month`,
                          }))}
                      />
                    </div>
                  )}

                  {costBranches.length > 0 && (
                    <div className="mt-6 pt-5 border-t border-[#F0F1F4]">
                      <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
                        Recorded cost
                      </p>
                      <BarList
                        label="Recorded cost by branch"
                        rows={[...costBranches]
                          .sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0))
                          .map((b) => ({
                            key: b.branchName,
                            label: b.branchName,
                            value: b.totalCost ?? 0,
                            detail: `Across ${b.completed} completed job${b.completed === 1 ? '' : 's'}`,
                          }))}
                      />
                    </div>
                  )}
                </Panel>
              </StaggerItem>

              <StaggerItem>
                <Panel
                  icon={Activity}
                  title="Where the month ended"
                  caption="Finished in the month, against what was still open at its end"
                >
                  <StackedMeter label="Jobs by status at month end" unit="job" parts={statusParts} />
                  <div className="mt-6 pt-5 border-t border-[#F0F1F4]">
                    <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
                      Completed by priority
                    </p>
                    {report.completed === 0 ? (
                      <p className="text-xs text-[#6B6F76]">Nothing completed to break down.</p>
                    ) : (
                      <StackedMeter
                        label="Jobs completed by priority"
                        unit="job"
                        parts={SEVERITY_ORDER.map((s) => ({
                          key: s,
                          label: SEVERITY_LABEL[s],
                          value: report.bySeverity[s],
                          color: CHART_COLORS.severity[s],
                        }))}
                      />
                    )}
                  </div>
                </Panel>
              </StaggerItem>

              <StaggerItem className="lg:col-span-2 2xl:col-span-1">
                <Panel icon={Tag} title="Work by category" caption="Jobs completed this month, by trade">
                  {report.byCategory.length === 0 ? (
                    <EmptyNote text="No completed work to sort by trade." />
                  ) : (
                    <BarList
                      label="Jobs completed by category"
                      rows={report.byCategory.map((cat) => ({
                        key: cat.key,
                        label: categoryLabel(cat.key),
                        value: cat.count,
                        detail: `${cat.count} job${cat.count === 1 ? '' : 's'} completed`,
                      }))}
                    />
                  )}
                </Panel>
              </StaggerItem>
            </Stagger>

            {/* Per branch — the answer to "how much did we do at this restaurant" */}
            <Reveal delay={0.1}>
              <section className="bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] overflow-hidden page-break-inside-avoid">
                <PanelHeader
                  icon={ClipboardList}
                  title="By branch"
                  caption="A job counts towards the month its work was finished in"
                />

                <div className="overflow-x-auto border-t border-[#F0F1F4]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#FAFBFC]">
                      <tr>
                        <Th>Branch</Th>
                        <Th align="right">Completed</Th>
                        <Th align="right">Problems</Th>
                        <Th align="right">Services</Th>
                        <Th align="right">Open at month end</Th>
                        <Th align="right">Avg report to fix</Th>
                        <Th align="right">Time on jobs</Th>
                        {showCost && <Th align="right">Cost</Th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F1F4]">
                      {report.branches.map((branch) => (
                        <tr key={branch.branchName} className="hover:bg-[#FAFBFC] transition-colors">
                          <td className="px-5 sm:px-6 py-3.5 text-[13px] font-semibold text-[#17181D] whitespace-nowrap">
                            {branch.branchName}
                          </td>
                          <Td align="right" strong>
                            {branch.completed}
                          </Td>
                          <Td align="right">{branch.raised}</Td>
                          <Td align="right">{branch.scheduled}</Td>
                          <Td
                            align="right"
                            className={
                              branch.openAtMonthEnd > 0 ? 'font-semibold text-[#8A5A08]!' : undefined
                            }
                          >
                            {branch.openAtMonthEnd}
                          </Td>
                          <Td align="right">
                            {formatTurnaround(branch.averageTurnaroundHours)}
                          </Td>
                          <Td align="right">{formatMinutes(branch.totalWorkMinutes)}</Td>
                          {showCost && (
                            <Td align="right">
                              {branch.totalCost === null
                                ? '—'
                                : branch.totalCost.toLocaleString()}
                            </Td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#FAFBFC] border-t border-[#E8E9EE]">
                      <tr>
                        <td className="px-5 sm:px-6 py-3.5 text-[13px] font-bold text-[#17181D]">Total</td>
                        <Td align="right" strong>
                          {report.completed}
                        </Td>
                        <Td align="right" strong>
                          {report.raised}
                        </Td>
                        <Td align="right" strong>
                          {report.scheduled}
                        </Td>
                        <Td align="right" strong>
                          {report.openAtMonthEnd}
                        </Td>
                        <Td align="right" strong>
                          {formatTurnaround(report.averageTurnaroundHours)}
                        </Td>
                        <Td align="right" strong>
                          {formatMinutes(report.totalWorkMinutes)}
                        </Td>
                        {showCost && (
                          <Td align="right" strong>
                            {(report.totalCost as number).toLocaleString()}
                          </Td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </Reveal>

            {/*
              What kind of work it was, for the printed copy only — on screen
              the charts above say the same thing. Plain counts, because paper
              is read by the number rather than by the length of a bar.
            */}
            {report.byCategory.length > 0 && (
              <section className="hidden print:block page-break-inside-avoid">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <h2 className="text-sm font-bold text-[#17181D] mb-2">Work by category</h2>
                    <ul className="space-y-1">
                      {report.byCategory.map((cat) => (
                        <li key={cat.key} className="flex justify-between text-xs text-[#17181D]">
                          <span>{categoryLabel(cat.key)}</span>
                          <span className="font-bold tabular-nums">{cat.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#17181D] mb-2">Completed by priority</h2>
                    <ul className="space-y-1">
                      {SEVERITY_ORDER.map((s) => (
                        <li key={s} className="flex justify-between text-xs text-[#17181D]">
                          <span>{SEVERITY_LABEL[s]}</span>
                          <span className="font-bold tabular-nums">{report.bySeverity[s]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {/* The itemised log, so the summary can be checked */}
            {report.branches.some((b) => b.jobs.length > 0) && (
              <Reveal delay={0.12}>
                <Card className="overflow-hidden">
                  <PanelHeader
                    icon={CheckCircle2}
                    title={`Jobs completed in ${report.monthLabel}`}
                  />
                  <div className="divide-y divide-[#F0F1F4] border-t border-[#F0F1F4]">
                    {report.branches.flatMap((branch) =>
                      branch.jobs.map((job) => (
                        <article
                          key={job.id}
                          className="px-5 sm:px-6 py-4 flex flex-wrap items-start gap-x-4 gap-y-2 hover:bg-[#FAFBFC] transition-colors page-break-inside-avoid"
                        >
                          <span className="w-8 h-8 rounded-xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                          <div className="flex-1 min-w-[14rem]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[13px] font-semibold text-[#17181D]">
                                {job.title}
                              </span>
                              <PriorityBadge severity={job.priority} size="sm" />
                            </div>
                            <p className="text-xs text-[#6B6F76] mt-0.5">
                              {job.branchName}
                              {job.equipment ? ` • ${job.equipment}` : ''} •{' '}
                              {categoryLabel(job.category)}
                            </p>
                            {job.resolutionNote && (
                              <p className="text-xs text-[#6B6F76] mt-1.5 leading-relaxed">
                                {job.resolutionNote}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-[11px] text-[#6B6F76] shrink-0 space-y-0.5">
                            <p className="font-semibold text-[#17181D]">
                              {formatDate((job.completedAt ?? '').split('T')[0])}
                            </p>
                            <p>{job.attendedBy || 'Attended by not recorded'}</p>
                            <p className="tabular-nums">{formatMinutes(workMinutes(job))} on site</p>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </Card>
              </Reveal>
            )}

            {/* Carried forward, so the month's figures cannot be read as complete */}
            {report.backlog.length > 0 && (
              <Reveal delay={0.14}>
                <Card className="overflow-hidden page-break-inside-avoid">
                  <div className="px-5 sm:px-6 py-4 flex items-center gap-3 border-b border-[#F0F1F4]">
                    <span className="w-9 h-9 rounded-xl bg-[#FDF3E2] text-[#B4740A] flex items-center justify-center shrink-0">
                      <Wrench className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-bold text-[#17181D]">
                        Still open at the end of {report.monthLabel}
                      </h2>
                      <p className="text-xs text-[#6B6F76] mt-0.5">
                        Carried into the following month, and not counted as work done
                      </p>
                    </div>
                    <span className="ml-auto rounded-full bg-[#FDF3E2] px-2 py-0.5 text-[11px] font-bold text-[#8A5A08] tabular-nums shrink-0">
                      {report.backlog.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-[#F0F1F4]">
                    {report.backlog.map((job) => (
                      <li
                        key={job.id}
                        className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 hover:bg-[#FAFBFC] transition-colors"
                      >
                        <div className="flex-1 min-w-[12rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-[#17181D]">
                              {job.title}
                            </span>
                            <PriorityBadge severity={job.priority} size="sm" />
                          </div>
                          <p className="text-xs text-[#6B6F76] mt-0.5">
                            {job.branchName} • reported {formatDateTime(job.reportedAt)}
                          </p>
                        </div>
                        {/* The state in words, the dot only repeating it */}
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#17181D] shrink-0">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              background: job.startedAt
                                ? CHART_COLORS.status.inProgress
                                : CHART_COLORS.status.notStarted,
                            }}
                          />
                          {job.startedAt ? 'In progress' : 'Not started'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            )}
          </>
        )}

        <p className="text-[11px] text-[#9CA1A9] text-center pt-2">
          {report.monthLabel} • {report.completed} job
          {report.completed === 1 ? '' : 's'} completed across {report.branches.length} branch
          {report.branches.length === 1 ? '' : 'es'}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Table and stat pieces
// ---------------------------------------------------------------------------

const TONE = {
  good: { dot: '#157F4B', soft: 'bg-[#E6F4EC] text-[#157F4B]' },
  warn: { dot: '#B4740A', soft: 'bg-[#FDF3E2] text-[#B4740A]' },
  neutral: { dot: '#9CA1A9', soft: 'bg-[#F4F5F7] text-[#17181D]' },
} as const;

/**
 * One headline figure for the month, on the dashboard's card: an icon tile,
 * the label, the figure, and a line saying what it counts. The state is in the
 * words; the tile and the dot only repeat it. A figure that is not a count
 * (the turnaround, "3.5d") is shown as it is rather than counted up to.
 */
const Stat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  caption: string;
  tone?: keyof typeof TONE;
}> = ({ icon: Icon, label, value, caption, tone = 'neutral' }) => {
  const t = TONE[tone];
  return (
    <div className="h-full bg-white border border-[#E8E9EE] rounded-2xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)]">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.soft}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <p className="mt-4 text-[12px] font-semibold text-[#6B6F76]">{label}</p>
      <p className="mt-1 text-[30px] leading-none font-bold tracking-tight text-[#17181D]">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] leading-snug text-[#6B6F76]">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.dot }} />
        <span className="truncate">{caption}</span>
      </p>
    </div>
  );
};

const EmptyNote: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-6 flex flex-col items-center text-center">
    <span className="w-10 h-10 rounded-xl bg-[#F4F5F7] text-[#9CA1A9] flex items-center justify-center">
      <ClipboardList className="w-5 h-5" />
    </span>
    <p className="mt-3 text-xs text-[#6B6F76]">{text}</p>
  </div>
);

const Th: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' }> = ({
  children,
  align = 'left',
}) => (
  <th
    className={`px-5 sm:px-6 py-2.5 text-[10px] uppercase tracking-[0.12em] text-[#9CA1A9] font-semibold border-b border-[#F0F1F4] whitespace-nowrap ${
      align === 'right' ? 'text-right' : ''
    }`}
  >
    {children}
  </th>
);

const Td: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right';
  strong?: boolean;
  className?: string;
}> = ({ children, align = 'left', strong = false, className = '' }) => (
  <td
    className={`px-5 sm:px-6 py-3.5 text-[13px] tabular-nums whitespace-nowrap ${
      align === 'right' ? 'text-right' : ''
    } ${strong ? 'font-bold text-[#17181D]' : 'text-[#6B6F76]'} ${className}`}
  >
    {children}
  </td>
);

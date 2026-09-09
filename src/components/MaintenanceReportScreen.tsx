'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Printer,
  Wrench,
} from 'lucide-react';
import {
  MAINTENANCE_CATEGORY_LABEL,
  MaintenanceJob,
  Severity,
} from '../types';

import { getJobs, subscribeToMaintenance, workMinutes } from '../services/maintenanceStore';
import {
  availableMonths,
  buildMonthlyReport,
  formatMinutes,
  formatTurnaround,
  monthKeyOf,
  monthLabel,
} from '../services/maintenanceReport';
import { formatDate, formatDateTime } from '../services/reportModel';
import { PriorityBadge } from './PriorityBadge';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/** This month, as a "2026-09" key. */
function currentMonth(): string {
  return monthKeyOf(new Date().toISOString());
}

export const MaintenanceReportScreen: React.FC = () => {
  const [jobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());
  const [month, setMonth] = useState<string>(() => currentMonth());

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

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

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <nav className="no-print text-xs text-[#6B6F76] mb-3 flex items-center gap-1.5">
        <Link href="/maintenance/jobs" className="hover:text-[#17181D] transition-colors">
          Maintenance
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#17181D] font-semibold">Month-end report</span>
      </nav>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6F76]">
            Maintenance carried out
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#17181D] mt-1">
            {report.monthLabel}
          </h1>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <label htmlFor="month-select" className="sr-only">
            Month
          </label>
          <select
            id="month-select"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <Link
            href="/maintenance/jobs"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </Link>
        </div>
      </div>

      <div className="print-container space-y-5">
        {/* Headline figures for the month */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Jobs completed" value={String(report.completed)} tone="good" />
          <Stat label="Problems raised" value={String(report.raised)} />
          <Stat
            label="Average report to fix"
            value={formatTurnaround(report.averageTurnaroundHours)}
          />
          <Stat
            label={showCost ? 'Recorded cost' : 'Still open'}
            value={
              showCost
                ? (report.totalCost as number).toLocaleString()
                : String(report.openAtMonthEnd)
            }
            tone={showCost ? undefined : report.openAtMonthEnd > 0 ? 'warn' : 'good'}
          />
        </div>

        {report.completed === 0 && report.raised === 0 ? (
          <div className="bg-white border border-[#E6E7EB] rounded-lg p-10 text-center shadow-xs">
            <p className="text-sm font-bold text-[#17181D]">
              No maintenance activity in {report.monthLabel}
            </p>
            <p className="text-xs text-[#6B6F76] mt-1">
              Nothing was raised and nothing was completed in this month.
            </p>
          </div>
        ) : (
          <>
            {/* Per branch — the answer to "how much did we do at this restaurant" */}
            <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden page-break-inside-avoid">
              <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
                <h2 className="text-sm font-bold text-[#17181D]">By branch</h2>
                <p className="text-xs text-[#6B6F76] mt-0.5">
                  A job counts towards the month its work was finished in
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#FAFAFA]">
                    <tr>
                      <Th>Branch</Th>
                      <Th align="right">Completed</Th>
                      <Th align="right">Raised</Th>
                      <Th align="right">Open at month end</Th>
                      <Th align="right">Avg report to fix</Th>
                      <Th align="right">Time on jobs</Th>
                      {showCost && <Th align="right">Cost</Th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E7EB]">
                    {report.branches.map((branch) => (
                      <tr key={branch.branchName}>
                        <td className="px-4 py-3 text-sm font-semibold text-[#17181D]">
                          {branch.branchName}
                        </td>
                        <Td align="right" strong>
                          {branch.completed}
                        </Td>
                        <Td align="right">{branch.raised}</Td>
                        <Td
                          align="right"
                          className={branch.openAtMonthEnd > 0 ? 'text-[#B4740A]' : undefined}
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
                  <tfoot className="bg-[#FAFAFA] border-t-2 border-[#E6E7EB]">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-[#17181D]">Total</td>
                      <Td align="right" strong>
                        {report.completed}
                      </Td>
                      <Td align="right" strong>
                        {report.raised}
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

            {/* What kind of work it was */}
            {report.byCategory.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs page-break-inside-avoid">
                  <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
                    <h2 className="text-sm font-bold text-[#17181D]">Work by category</h2>
                  </div>
                  <ul className="p-5 space-y-2.5">
                    {report.byCategory.map((cat) => (
                      <li key={cat.key} className="flex items-center gap-3">
                        <span className="flex-1 min-w-0 text-xs font-semibold text-[#17181D] truncate">
                          {MAINTENANCE_CATEGORY_LABEL[cat.key]}
                        </span>
                        <div className="w-24 sm:w-40 h-2.5 bg-[#F6F6F8] rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(cat.count / report.byCategory[0].count) * 100}%`,
                              backgroundColor: '#C8202D',
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold text-[#17181D] tabular-nums w-6 text-right shrink-0">
                          {cat.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs page-break-inside-avoid">
                  <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
                    <h2 className="text-sm font-bold text-[#17181D]">Completed by priority</h2>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-2.5">
                    {SEVERITY_ORDER.map((s) => (
                      <div
                        key={s}
                        className={`border rounded-md p-3 ${
                          report.bySeverity[s] > 0
                            ? 'border-[#E6E7EB] bg-white'
                            : 'border-[#EFEFF2] bg-[#FAFAFA]'
                        }`}
                      >
                        <PriorityBadge severity={s} size="sm" />
                        <p
                          className={`text-xl font-bold tabular-nums mt-1.5 ${
                            report.bySeverity[s] > 0 ? 'text-[#17181D]' : 'text-[#6B6F76]/45'
                          }`}
                        >
                          {report.bySeverity[s]}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* The itemised log, so the summary can be checked */}
            {report.branches.some((b) => b.jobs.length > 0) && (
              <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
                  <h2 className="text-sm font-bold text-[#17181D]">
                    Jobs completed in {report.monthLabel}
                  </h2>
                </div>
                <div className="divide-y divide-[#E6E7EB]">
                  {report.branches.flatMap((branch) =>
                    branch.jobs.map((job) => (
                      <article
                        key={job.id}
                        className="px-5 py-4 flex flex-wrap items-start gap-x-5 gap-y-2 page-break-inside-avoid"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#157F4B] shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-[14rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[#17181D]">
                              {job.title}
                            </span>
                            <PriorityBadge severity={job.priority} size="sm" />
                          </div>
                          <p className="text-xs text-[#6B6F76] mt-0.5">
                            {job.branchName}
                            {job.equipment ? ` • ${job.equipment}` : ''} •{' '}
                            {MAINTENANCE_CATEGORY_LABEL[job.category]}
                          </p>
                          {job.resolutionNote && (
                            <p className="text-xs text-[#6B6F76] mt-1">{job.resolutionNote}</p>
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
              </section>
            )}

            {/* Carried forward, so the month's figures cannot be read as complete */}
            {report.backlog.length > 0 && (
              <section className="bg-[#FDF3E2] border border-[#B4740A]/30 rounded-lg overflow-hidden page-break-inside-avoid">
                <div className="px-5 py-3.5 border-b border-[#B4740A]/20">
                  <h2 className="text-sm font-bold text-[#17181D] flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#B4740A]" />
                    Still open at the end of {report.monthLabel}
                  </h2>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    Carried into the following month, and not counted as work done
                  </p>
                </div>
                <ul className="divide-y divide-[#B4740A]/15">
                  {report.backlog.map((job) => (
                    <li key={job.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <div className="flex-1 min-w-[12rem]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#17181D]">
                            {job.title}
                          </span>
                          <PriorityBadge severity={job.priority} size="sm" />
                        </div>
                        <p className="text-xs text-[#6B6F76] mt-0.5">
                          {job.branchName} • reported {formatDateTime(job.reportedAt)}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-[#B4740A] shrink-0">
                        {job.startedAt ? 'In progress' : 'Not started'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="text-[11px] text-[#6B6F76] text-center pt-2">
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

const Stat: React.FC<{
  label: string;
  value: string;
  tone?: 'good' | 'warn';
}> = ({ label, value, tone }) => {
  const color =
    tone === 'good' ? 'text-[#157F4B]' : tone === 'warn' ? 'text-[#B4740A]' : 'text-[#17181D]';
  return (
    <div className="bg-white border border-[#E6E7EB] rounded-lg p-4 shadow-xs">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
};

const Th: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' }> = ({
  children,
  align = 'left',
}) => (
  <th
    className={`px-4 py-3 text-[10px] uppercase tracking-wider text-[#6B6F76] font-bold border-b border-[#E6E7EB] whitespace-nowrap ${
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
    className={`px-4 py-3 text-sm tabular-nums whitespace-nowrap ${
      align === 'right' ? 'text-right' : ''
    } ${strong ? 'font-bold text-[#17181D]' : 'text-[#6B6F76]'} ${className}`}
  >
    {children}
  </td>
);

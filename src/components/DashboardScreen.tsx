'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  History,
  PenLine,
  Plus,
  TrendingDown,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { Inspection } from '../types';
import { useChecklist } from '../hooks/useChecklist';
import { getInspections, subscribeToStorage } from '../services/storage';
import { getJobs, subscribeToMaintenance } from '../services/maintenanceStore';
import { buildBoard } from '../services/maintenanceReport';
import { SEVERITY_LABEL } from '../services/priority';
import { formatDate } from '../services/reportModel';
import { MaintenanceJob } from '../types';
import { BranchSnapshot, buildDashboardModel } from '../services/dashboardModel';
import { PriorityBadge } from './PriorityBadge';
import { ScorePill } from './ScorePill';

/** Status palette, the same steps the report uses. */
const GOOD = '#2F5233';
const BAD = '#C25A33';
const TRACK = '#EDEAE0';

export const DashboardScreen: React.FC = () => {
  const router = useRouter();
  const checklist = useChecklist();
  const [inspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [jobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());

  useEffect(() => {
    const refresh = () => setInspections(getInspections());
    refresh();
    return subscribeToStorage(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  const model = useMemo(
    () => buildDashboardModel(inspections, checklist),
    [inspections, checklist]
  );
  // Real maintenance jobs, rather than what the findings imply about repairs
  const board = useMemo(() => buildBoard(jobs), [jobs]);

  const needsAction = model.severityTotals.critical + model.severityTotals.high;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#DEDACB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#242217]">Dashboard</h2>
          <p className="text-[#635E4F] text-xs mt-0.5">
            {model.empty
              ? 'No inspections submitted yet'
              : `${model.totalInspections} inspection${
                  model.totalInspections === 1 ? '' : 's'
                } across ${model.branches.filter((b) => !b.neverInspected).length} branch${
                  model.branches.filter((b) => !b.neverInspected).length === 1 ? '' : 'es'
                } • latest ${formatDate(model.latestVisitDate)}`}
          </p>
        </div>
        <Link
          href="/inspections/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New inspection</span>
        </Link>
      </header>

      <div className="p-6 md:p-10 flex-1 space-y-6">
        {model.empty ? (
          <div className="bg-white border border-[#DEDACB] rounded-lg p-10 text-center shadow-xs">
            <p className="text-sm font-bold text-[#242217]">Nothing to summarise yet</p>
            <p className="text-xs text-[#635E4F] mt-1">
              Run the first inspection and this page will fill in.
            </p>
            <Link
              href="/inspections/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Start an inspection
            </Link>
          </div>
        ) : (
          <>
            {/* Four figures a manager acts on */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                label="Needs action"
                value={needsAction}
                caption={
                  needsAction === 0
                    ? 'No critical or high findings'
                    : `${model.severityTotals.critical} critical · ${model.severityTotals.high} high`
                }
                tone={needsAction > 0 ? 'bad' : 'good'}
              />
              <Kpi
                label="Average score"
                value={model.averageScore ?? 0}
                suffix="%"
                caption="Mean of each branch's latest visit"
                tone={
                  (model.averageScore ?? 0) >= 90
                    ? 'good'
                    : (model.averageScore ?? 0) >= 75
                      ? 'warn'
                      : 'bad'
                }
              />
              <Kpi
                label="Overdue"
                value={model.overdue.length}
                caption={
                  model.overdue.length === 0
                    ? 'Every branch is within schedule'
                    : `Longest ${model.overdue[0].daysOverdue} days past due`
                }
                tone={model.overdue.length > 0 ? 'warn' : 'good'}
              />
              <Kpi
                label="Repeat issues"
                value={model.repeatIssues.length}
                caption={
                  model.repeatIssues.length === 0
                    ? 'Nothing recurring'
                    : 'Flagged on more than one visit'
                }
                tone={model.repeatIssues.length > 0 ? 'warn' : 'good'}
              />
            </div>

            {/* Things that need doing. Absent entirely when there are none. */}
            <AttentionStrip model={model} board={board} />

            {/* The core panel: where every branch stands */}
            <section className="bg-white border border-[#DEDACB] rounded-lg shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#DEDACB] flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#242217]">Branches</h3>
                  <p className="text-xs text-[#635E4F] mt-0.5">
                    Latest visit at each branch, most in need of attention first
                  </p>
                </div>
                <Link
                  href="/inspections"
                  className="text-[11px] font-bold text-[#2F5233] hover:underline shrink-0"
                >
                  All records
                </Link>
              </div>

              <div className="divide-y divide-[#DEDACB]">
                {model.branches.map((branch) => (
                  <BranchRow
                    key={branch.name}
                    branch={branch}
                    onOpen={(id) => router.push(`/inspections/${id}`)}
                  />
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {/* What kind of problem dominates right now */}
              {model.byCategory.length > 0 && (
                <Panel
                  title="Where failures are coming from"
                  caption="Findings on the latest visit to each branch"
                >
                  <ul className="space-y-2.5">
                    {model.byCategory.map((cat) => (
                      <li key={cat.key} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#635E4F]">
                          {cat.key}
                        </span>
                        <div className="flex-1 min-w-0 h-2.5 bg-[#F5F3EC] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(cat.failures / model.byCategory[0].failures) * 100}%`,
                              backgroundColor: BAD,
                            }}
                            title={`${cat.failures} finding${
                              cat.failures === 1 ? '' : 's'
                            } across ${cat.branches} branch${cat.branches === 1 ? '' : 'es'}`}
                          />
                        </div>
                        <span className="text-xs font-bold text-[#242217] tabular-nums w-6 text-right shrink-0">
                          {cat.failures}
                        </span>
                        <span className="text-[11px] text-[#635E4F] tabular-nums w-20 text-right shrink-0">
                          {cat.branches} branch{cat.branches === 1 ? '' : 'es'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {/* Which checklist areas are weakest across the estate */}
              {model.weakestSections.length > 0 && (
                <Panel
                  title="Weakest checklist areas"
                  caption="Pass rate pooled across the latest visits"
                >
                  <ul className="space-y-2.5">
                    {model.weakestSections.slice(0, 6).map((section) => (
                      <li key={section.key} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#242217] truncate">
                            {section.title}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#635E4F]">
                            {section.listLabel}
                          </p>
                        </div>
                        <div className="w-20 sm:w-28 h-2.5 bg-[#F5F3EC] rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(section.rate, 3)}%`,
                              backgroundColor: section.rate >= 75 ? GOOD : BAD,
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold text-[#242217] tabular-nums w-16 text-right shrink-0">
                          {section.passed}/{section.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>

            {/* Things that did not get fixed between visits */}
            {model.repeatIssues.length > 0 && (
              <Panel
                title="Repeat issues"
                caption="Flagged on more than one visit to the same branch"
              >
                <ul className="divide-y divide-[#EDEAE0] -my-1">
                  {model.repeatIssues.slice(0, 8).map((repeat) => (
                    <li
                      key={`${repeat.branchName}-${repeat.item.id}`}
                      className="py-2.5 flex items-start gap-3"
                    >
                      <History className="w-4 h-4 text-[#8A6318] shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#242217]">
                          {repeat.item.text}
                        </p>
                        <p className="text-xs text-[#635E4F] mt-0.5">
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
            <Panel title="Recent inspections">
              <ul className="divide-y divide-[#EDEAE0] -my-1">
                {model.recent.slice(0, 5).map((report) => (
                  <li key={report.inspection.id}>
                    <Link
                      href={`/inspections/${report.inspection.id}`}
                      className="py-2.5 flex items-center gap-4 group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#242217] truncate">
                          {report.inspection.branchName}
                        </p>
                        <p className="text-xs text-[#635E4F]">
                          {formatDate(report.inspection.date)}
                          {report.inspection.inspectorName
                            ? ` • ${report.inspection.inspectorName}`
                            : ''}
                        </p>
                      </div>
                      <span className="text-xs text-[#635E4F] tabular-nums shrink-0">
                        {report.issues.length === 0
                          ? 'No findings'
                          : `${report.issues.length} finding${
                              report.issues.length === 1 ? '' : 's'
                            }`}
                      </span>
                      <ScorePill score={report.inspection.score} />
                      <ChevronRight className="w-4 h-4 text-[#635E4F] group-hover:text-[#242217] shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Only rendered when something actually needs doing — an empty version of this
 * strip would be noise on every visit to the page.
 */
const AttentionStrip: React.FC<{
  model: ReturnType<typeof buildDashboardModel>;
  board: ReturnType<typeof buildBoard>;
}> = ({ model, board }) => {
  const items: { icon: React.ComponentType<{ className?: string }>; text: string; href: string }[] =
    [];

  if (model.draft) {
    items.push({
      icon: PenLine,
      text: `Unfinished inspection at ${model.draft.branchName}`,
      href: `/inspections/${model.draft.id}/checklist`,
    });
  }
  model.neverInspected.forEach((b) =>
    items.push({
      icon: AlertTriangle,
      text: `${b.name} has never been inspected`,
      href: '/inspections/new',
    })
  );
  if (model.overdue.length > 0) {
    items.push({
      icon: CalendarClock,
      text: `${model.overdue.length} branch${
        model.overdue.length === 1 ? '' : 'es'
      } overdue — ${model.overdue.map((b) => b.name).join(', ')}`,
      href: '/inspections/new',
    });
  }
  if (board.openCount > 0) {
    items.push({
      icon: Wrench,
      text: `${board.openCount} maintenance job${board.openCount === 1 ? '' : 's'} outstanding${
        board.urgentCount > 0 ? ` — ${board.urgentCount} urgent` : ''
      }`,
      href: '/maintenance',
    });
  }
  if (model.unsignedCount > 0) {
    items.push({
      icon: PenLine,
      text: `${model.unsignedCount} submitted record${
        model.unsignedCount === 1 ? '' : 's'
      } with no manager signature`,
      href: '/inspections',
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="bg-[#F3ECD8] border border-[#8A6318]/30 rounded-lg overflow-hidden">
      <ul className="divide-y divide-[#8A6318]/15">
        {items.map((item, i) => (
          <li key={i}>
            <Link
              href={item.href}
              className="px-5 py-3 flex items-center gap-3 hover:bg-[#8A6318]/5 transition-colors group"
            >
              <item.icon className="w-4 h-4 text-[#8A6318] shrink-0" />
              <span className="text-xs font-semibold text-[#242217] flex-1 min-w-0">
                {item.text}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#8A6318] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

const Kpi: React.FC<{
  label: string;
  value: number;
  suffix?: string;
  caption: string;
  tone: 'good' | 'bad' | 'warn';
}> = ({ label, value, suffix = '', caption, tone }) => {
  const color =
    tone === 'good' ? 'text-[#2F5233]' : tone === 'bad' ? 'text-[#9C3B2E]' : 'text-[#8A6318]';
  return (
    <div className="bg-white border border-[#DEDACB] rounded-lg p-4 shadow-xs">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#635E4F]">{label}</p>
      <p className={`text-3xl font-bold tabular-nums mt-1 ${color}`}>
        {value}
        {suffix}
      </p>
      <p className="text-[11px] text-[#635E4F] mt-1 leading-snug">{caption}</p>
    </div>
  );
};

const Panel: React.FC<{
  title: string;
  caption?: string;
  children: React.ReactNode;
}> = ({ title, caption, children }) => (
  <section className="bg-white border border-[#DEDACB] rounded-lg shadow-xs">
    <div className="px-5 py-3.5 border-b border-[#DEDACB]">
      <h3 className="text-sm font-bold text-[#242217]">{title}</h3>
      {caption && <p className="text-xs text-[#635E4F] mt-0.5">{caption}</p>}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const BranchRow: React.FC<{
  branch: BranchSnapshot;
  onOpen: (id: string) => void;
}> = ({ branch, onOpen }) => {
  if (branch.neverInspected) {
    return (
      <div className="px-5 py-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[10rem]">
          <p className="text-sm font-bold text-[#242217]">{branch.name}</p>
          <p className="text-xs text-[#8A6318] font-semibold mt-0.5">Never inspected</p>
        </div>
        <Link
          href="/inspections/new"
          className="text-[11px] font-bold text-[#2F5233] hover:underline shrink-0"
        >
          Inspect now
        </Link>
      </div>
    );
  }

  const report = branch.latest!;
  const counts = report.severityCounts;

  return (
    <button
      type="button"
      onClick={() => onOpen(report.inspection.id)}
      className="w-full px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-left hover:bg-[#F9F8F4] transition-colors cursor-pointer"
    >
      {/* Branch and when it was last seen */}
      <div className="flex-1 min-w-[11rem]">
        <p className="text-sm font-bold text-[#242217]">{branch.name}</p>
        <p className="text-xs text-[#635E4F] mt-0.5">
          {formatDate(report.inspection.date)}
          {branch.daysOverdue > 0 ? (
            <span className="text-[#8A6318] font-semibold">
              {' '}
              • {branch.daysOverdue} days overdue
            </span>
          ) : (
            <span> • next {formatDate(branch.nextDueDate)}</span>
          )}
        </p>
      </div>

      {/* Score, its direction, and the shape of the last few visits */}
      <div className="flex items-center gap-3 shrink-0">
        <Sparkline points={branch.scoreHistory.map((h) => h.score)} />
        <div className="w-14 text-right">
          <ScorePill score={report.inspection.score} />
        </div>
        <div className="w-14 shrink-0">
          {branch.delta === null ? (
            <span className="text-[11px] text-[#635E4F]">first visit</span>
          ) : branch.delta === 0 ? (
            <span className="text-[11px] text-[#635E4F]">no change</span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                branch.delta > 0 ? 'text-[#2F5233]' : 'text-[#9C3B2E]'
              }`}
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
      </div>

      {/* What was found, worst first */}
      <div className="flex flex-wrap items-center gap-1.5 min-w-[9rem] justify-end">
        {report.issues.length === 0 ? (
          <span className="text-xs font-semibold text-[#2F5233]">No findings</span>
        ) : (
          (['critical', 'high', 'medium', 'low'] as const)
            .filter((s) => counts[s] > 0)
            .map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1"
                title={`${counts[s]} ${SEVERITY_LABEL[s]}`}
              >
                <PriorityBadge severity={s} size="sm" />
                <span className="text-xs font-bold text-[#242217] tabular-nums">{counts[s]}</span>
              </span>
            ))
        )}
      </div>
    </button>
  );
};

/**
 * Score across the visits on record. One hue, 2px line, no axes — it is there
 * to show direction beside the number, not to be read off precisely.
 *
 * Needs three visits before it draws anything. Two points are a
 * before-and-after, which the delta beside it states exactly; drawing them as
 * a line would imply a trend that two readings cannot support.
 */
const Sparkline: React.FC<{ points: number[] }> = ({ points }) => {
  const width = 56;
  const height = 22;

  if (points.length < 3) {
    return <div className="w-14 h-[22px] shrink-0" aria-hidden />;
  }

  // Fixed 0-100 scale, so two branches' sparklines are comparable
  const step = width / (points.length - 1);
  const y = (score: number) => height - 2 - (score / 100) * (height - 4);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${y(p)}`).join(' ');
  const last = points[points.length - 1];
  const rising = last >= points[points.length - 2];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label={`Score across ${points.length} visits: ${points.join(', ')} percent`}
    >
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke={TRACK} strokeWidth="1" />
      <path
        d={path}
        fill="none"
        stroke={rising ? GOOD : BAD}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={(points.length - 1) * step} cy={y(last)} r="2.5" fill={rising ? GOOD : BAD} />
    </svg>
  );
};

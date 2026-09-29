'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle,
  Clock,
  Edit3,
  FileText,
  History,
  LayoutList,
  ListChecks,
  PenLine,
  TrendingUp,
} from 'lucide-react';
import { Inspection } from '../types';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { useChecklist } from '../hooks/useChecklist';
import { getInspectionById, getInspections, subscribeToStorage } from '../services/storage';
import { SEVERITY_LABEL } from '../services/priority';
import {
  ReportModel,
  SEVERITY_ORDER,
  buildReportModel,
  formatDate,
  reasonText,
} from '../services/reportModel';
import { PriorityBadge } from './PriorityBadge';
import { ScorePill } from './ScorePill';
import { canEditInspection, canViewInspection } from '../services/permissions';
import { AccessNotice, NOT_YOURS } from './AccessNotice';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useRouter } from 'next/navigation';
import { BUTTON, CARD, PageHeader, Panel, PanelHeader } from './ui';
import { CountUp, Reveal, Stagger, StaggerItem } from './motion';
import {
  BarList,
  CHART_COLORS,
  ScoreDial,
  StackedMeter,
  TrendChart,
  TrendPoint,
} from './charts';

interface SummaryScreenProps {
  inspectionId: string;
}

/**
 * The sectioned read of one inspection.
 *
 * Every figure comes from the same `buildReportModel` the full report uses, so
 * the two screens cannot disagree about what was covered, what failed or what
 * it scored — they are two presentations of one derivation.
 */
export const SummaryScreen: React.FC<SummaryScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const checklist = useChecklist();
  const user = useCurrentUser();

  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );
  const [allInspections, setAllInspections] = useState<Inspection[]>(() => getInspections());

  useEffect(() => {
    const refresh = () => {
      setInspection(getInspectionById(inspectionId));
      setAllInspections(getInspections());
    };
    refresh();
    return subscribeToStorage(refresh);
  }, [inspectionId]);

  const model: ReportModel | null = useMemo(
    () => (inspection ? buildReportModel(inspection, checklist, allInspections) : null),
    [inspection, checklist, allInspections]
  );

  if (!inspection || !model) {
    return (
      <div className="p-5 sm:p-8 max-w-xl mx-auto w-full">
        <div className={`${CARD} px-6 py-14 text-center`}>
          <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
            <FileText className="w-7 h-7" />
          </span>
          <h2 className="mt-5 text-base font-bold text-[#17181D]">Summary not found</h2>
          <p className="text-[13px] text-[#6B6F76] mt-1.5">
            The requested inspection does not exist or has been removed.
          </p>
          <button onClick={() => router.push('/inspections')} className={`${BUTTON.primary} mt-6`}>
            Back to records
          </button>
        </div>
      </div>
    );
  }

  // Another branch's record, or another inspector's visit — the same rule the
  // full report applies, since this screen reads the same findings.
  if (!canViewInspection(user, inspection)) {
    return <AccessNotice {...NOT_YOURS} />;
  }

  const unanswered = model.rows.filter((row) => row.outcome === 'unanswered');
  // Weakest categories first — where the branch needs attention
  const byCategory = [...model.sections].sort((a, b) => a.rate - b.rate);

  /*
   * The branch's submitted visits, oldest to newest, for the trend. The model
   * keeps them newest first because that is how the history reads as a list;
   * a line has to run the other way to read as time.
   */
  const history: TrendPoint[] = [...model.branchHistory].reverse().map((visit) => ({
    label: formatDate(visit.date),
    shortLabel: shortDate(visit.date),
    value: visit.score,
    detail: visit.isThis
      ? 'This visit'
      : `${visit.failed} flagged`,
  }));

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 max-w-6xl mx-auto w-full space-y-6">
      <Reveal>
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] transition-colors cursor-pointer mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to records</span>
        </button>

        <PageHeader
          eyebrow="Inspection summary"
          title={inspection.branchName}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#9CA1A9]" />
                {formatDate(inspection.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#9CA1A9]" />
                {inspection.time}
              </span>
              <span className="inline-flex items-center gap-1.5 capitalize font-semibold text-[#12643C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#157F4B]" />
                {inspection.status}
              </span>
              <span>{FULL_CHECKLIST_LABEL}</span>
              {inspection.inspectorName && <span>Inspector: {inspection.inspectorName}</span>}
            </span>
          }
          actions={
            <>
              {/*
                A submitted record is locked, and only the main admin may reopen
                it. Hidden rather than disabled, for the same reason as on the
                records table: a button that refuses is worse than no button.
              */}
              {canEditInspection(user, inspection) && (
                <button
                  type="button"
                  onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
                  className={BUTTON.secondary}
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#C8202D]" />
                  <span>{inspection.status === 'submitted' ? 'Reopen answers' : 'Edit answers'}</span>
                </button>
              )}
              <button
                id="summary-full-report-btn"
                type="button"
                onClick={() => router.push(`/inspections/${inspection.id}`)}
                className={BUTTON.primary}
              >
                <FileText className="w-4 h-4" />
                <span>Full report / print</span>
              </button>
            </>
          }
        />
      </Reveal>

      {/* Same drift warning the full report carries, so the two never disagree */}
      {(model.missingCount > 0 || model.scoreMismatch) && (
        <div className="p-4 rounded-2xl bg-[#FDF3E2] border border-[#B4740A]/30 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[#B4740A] shrink-0 mt-0.5" />
          <div className="text-xs text-[#17181D] space-y-1">
            <p className="font-bold">This record does not line up with the current checklist</p>
            {model.missingCount > 0 && (
              <p>
                It was taken against {model.frozenTotal} items, but {model.missingCount} of them
                are no longer defined in the checklist and cannot be shown. Everything below is
                the remaining {model.total}.
              </p>
            )}
            {model.scoreMismatch && (
              <p>
                It was signed off at {inspection.score}%. The {model.total} items shown here come
                to {model.liveScore}%. The signed figure is the one on record.
              </p>
            )}
          </div>
        </div>
      )}

      {/* The headline: what it scored, what was counted, and how bad the findings are */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Reveal delay={0.05} className="lg:col-span-7">
          <section id="summary-at-a-glance" className={`${CARD} h-full p-5 sm:p-6`}>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex sm:flex-col items-center sm:items-start gap-5 sm:w-[10.5rem] shrink-0">
                <div className="relative">
                  <ScoreDial value={model.score} size={124} stroke={11} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[32px] leading-none font-bold tracking-tight text-[#17181D]">
                      <CountUp value={model.score} />
                      <span className="text-lg font-semibold text-[#9CA1A9]">%</span>
                    </span>
                    <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9]">
                      Score
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <ScorePill score={model.score} size="sm" showLabel />
                  <p className="mt-2 text-xs leading-relaxed text-[#6B6F76]">
                    {model.passed} of {model.total} checks passed on this visit.
                  </p>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9] mb-3">
                  At a glance
                </h2>
                <Stagger className="grid grid-cols-2 gap-3">
                  <StaggerItem>
                    <Stat label="Checked" value={model.total} />
                  </StaggerItem>
                  <StaggerItem>
                    <Stat label="Passed" value={model.passed} tone="good" />
                  </StaggerItem>
                  <StaggerItem>
                    <Stat
                      label="Flagged"
                      value={model.issues.length}
                      tone={model.issues.length ? 'bad' : 'muted'}
                    />
                  </StaggerItem>
                  <StaggerItem>
                    <Stat
                      label="Repeat issues"
                      value={model.repeats.length}
                      tone={model.repeats.length ? 'warn' : 'muted'}
                    />
                  </StaggerItem>
                </Stagger>
                {unanswered.length > 0 && (
                  <p className="mt-3 text-xs font-semibold text-[#8A5A08] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                      {unanswered.length} item{unanswered.length === 1 ? '' : 's'} left unanswered:{' '}
                      {unanswered.map((row) => row.number).join(', ')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>
        </Reveal>

        {/* Priority breakdown */}
        <Reveal delay={0.1} className="lg:col-span-5">
          <section id="summary-priorities" className="h-full">
            <Panel
              icon={AlertTriangle}
              title="Priorities"
              caption={
                model.issues.length === 0
                  ? 'Nothing was flagged on this visit'
                  : `${model.issues.length} finding${model.issues.length === 1 ? '' : 's'} by severity`
              }
            >
              {model.issues.length === 0 ? (
                <div className="py-4 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center shrink-0">
                    <CheckCircle className="w-5 h-5" />
                  </span>
                  <p className="text-xs text-[#6B6F76]">Every check passed, so there is nothing to rank.</p>
                </div>
              ) : (
                <StackedMeter
                  label="Findings by severity"
                  unit="finding"
                  parts={SEVERITY_ORDER.map((severity) => ({
                    key: severity,
                    label: SEVERITY_LABEL[severity],
                    value: model.severityCounts[severity],
                    color: CHART_COLORS.severity[severity],
                  }))}
                />
              )}
            </Panel>
          </section>
        </Reveal>
      </div>

      {/* Issues, one block per priority */}
      <Reveal delay={0.12}>
      <section id="summary-issues" className={`${CARD} overflow-hidden`}>
        <PanelHeader
          icon={ListChecks}
          title="Issues"
          caption={
            model.issues.length === 0
              ? 'Nothing was flagged on this visit'
              : 'Grouped by priority, most serious first'
          }
        />

        {model.issues.length === 0 ? (
          <div className="px-6 pb-10 pt-4 text-center">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </span>
            <p className="mt-3 text-sm font-bold text-[#17181D]">Every item passed</p>
            <p className="text-xs text-[#6B6F76] mt-1">Nothing was flagged on this visit.</p>
          </div>
        ) : (
          <div className="border-t border-[#F0F1F4]">
            {SEVERITY_ORDER.filter((s) => model.severityCounts[s] > 0).map((severity) => (
              <div key={severity} className="border-b border-[#F0F1F4] last:border-b-0">
                <div className="px-5 sm:px-6 py-2.5 bg-[#FAFBFC] flex items-center gap-2.5 border-b border-[#F0F1F4]">
                  <span
                    className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                    style={{ background: CHART_COLORS.severity[severity] }}
                    aria-hidden
                  />
                  <PriorityBadge severity={severity} size="sm" />
                  <span className="text-[11px] font-semibold text-[#6B6F76] tabular-nums">
                    {model.severityCounts[severity]} issue
                    {model.severityCounts[severity] === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="divide-y divide-[#F0F1F4]">
                  {model.issues
                    .filter((issue) => issue.priority.severity === severity)
                    .map(({ item, answer, priority }) => {
                      const row = model.rows.find((r) => r.item.id === item.id);
                      const section = model.sections.find((s) =>
                        s.rows.some((r) => r.item.id === item.id)
                      );
                      return (
                        <div
                          key={item.id}
                          id={`summary-issue-${item.id}`}
                          className={`px-5 sm:px-6 py-4 flex items-start gap-3.5 hover:bg-[#FAFBFC] transition-colors ${
                            severity === 'critical' ? 'bg-[#FDECEE]/25' : ''
                          }`}
                        >
                          <span className="text-[11px] font-bold text-[#6B6F76] bg-[#F4F5F7] min-w-8 h-7 px-1.5 rounded-lg flex items-center justify-center shrink-0 tabular-nums">
                            {row?.number}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#17181D]">{item.text}</p>
                            {section && (
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] mt-0.5">
                                {section.listLabel} • {section.title}
                              </p>
                            )}
                            <p className="text-xs text-[#6B6F76] mt-1.5">
                              <span className="font-semibold text-[#A81823]">Reason: </span>
                              {reasonText(answer)}
                            </p>
                            {answer.note && (
                              <p className="text-xs text-[#6B6F76] mt-0.5">
                                <span className="font-semibold text-[#17181D]">Note: </span>
                                {answer.note}
                              </p>
                            )}
                            {priority.repeatCount > 0 && (
                              <p className="text-xs font-semibold text-[#8A5A08] mt-1 flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5 shrink-0" />
                                Repeat — flagged in {priority.repeatCount} of the last{' '}
                                {priority.historyVisits} visit
                                {priority.historyVisits === 1 ? '' : 's'}
                              </p>
                            )}
                            {priority.overridden && (
                              <p className="text-xs text-[#6B6F76] mt-1 italic">
                                Priority set by hand — rules said{' '}
                                {SEVERITY_LABEL[priority.computed]}
                              </p>
                            )}
                          </div>
                          {answer.photo && (
                            <img
                              src={answer.photo}
                              alt={`Evidence for item ${row?.number}`}
                              className="w-16 h-16 object-cover rounded-xl border border-[#E8E9EE] bg-white shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </Reveal>

      {/* Where the branch is weak, and which way it has been going */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category pass rates */}
        <Reveal delay={0.14}>
          <section id="summary-categories" className="h-full">
            <Panel
              icon={LayoutList}
              title="By category — weakest first"
              caption="Share of each section's checks that passed"
            >
              <CategoryBars sections={byCategory} />
            </Panel>
          </section>
        </Reveal>

        <Reveal delay={0.16}>
          <section id="summary-history" className="h-full">
            <Panel
              icon={TrendingUp}
              title="Score history"
              caption={
                history.length <= 1
                  ? `The first submitted visit at ${inspection.branchName}`
                  : `Every submitted visit at this branch, oldest to newest`
              }
            >
              {history.length === 0 ? (
                <p className="py-6 text-xs text-[#6B6F76] text-center">
                  No submitted visits at this branch yet.
                </p>
              ) : (
                <>
                  <TrendChart
                    points={history}
                    seriesLabel="Score"
                    suffix="%"
                    height={220}
                    min={trendFloor(history)}
                    max={100}
                  />
                  {history.length === 1 && (
                    <p className="mt-2 text-[11px] text-[#9CA1A9] text-center">
                      The line appears from the second visit.
                    </p>
                  )}
                </>
              )}
            </Panel>
          </section>
        </Reveal>
      </div>

      {/* Repeat offenders */}
      {model.repeats.length > 0 && (
        <section id="summary-repeats">
          <div className="bg-[#FDF3E2] border border-[#B4740A]/30 rounded-2xl p-5">
            <div className="flex items-start gap-3.5">
              <span className="w-9 h-9 rounded-xl bg-white/70 text-[#B4740A] flex items-center justify-center shrink-0">
                <History className="w-[18px] h-[18px]" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-bold text-[#17181D]">Repeat issues at this branch</h2>
                <ul className="mt-2 space-y-1.5">
                  {model.repeats.map(({ item, priority }) => {
                    const row = model.rows.find((r) => r.item.id === item.id);
                    return (
                      <li key={item.id} className="text-xs text-[#17181D]">
                        <span className="font-semibold">
                          {row?.number} {item.text}
                        </span>
                        <span className="text-[#6B6F76]">
                          {' '}
                          — flagged in {priority.repeatCount} of the last {priority.historyVisits}{' '}
                          visit{priority.historyVisits === 1 ? '' : 's'}, raised to{' '}
                          {SEVERITY_LABEL[priority.severity]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Evidence */}
      {model.photos.length > 0 && (
        <section id="summary-evidence" className={`${CARD} overflow-hidden`}>
          <PanelHeader
            icon={Camera}
            title={`Photo evidence (${model.photos.length})`}
            caption="Attached on the day, against the check it shows"
          />
          <div className="px-5 sm:px-6 pb-6 pt-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {model.photos.map((row) => (
              <figure
                key={row.item.id}
                className="group bg-white border border-[#E8E9EE] rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_rgba(16,24,40,0.2)]"
              >
                <img
                  src={row.answer!.photo as string}
                  alt={`Evidence for item ${row.number}`}
                  className="w-full h-28 object-cover bg-[#F4F5F7]"
                  referrerPolicy="no-referrer"
                />
                <figcaption className="p-2.5">
                  {row.priority ? (
                    <PriorityBadge severity={row.priority.severity} size="sm" />
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#157F4B]">
                      Passed
                    </span>
                  )}
                  <p className="text-xs text-[#17181D] mt-1.5 leading-snug">
                    {row.number} {row.item.text}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Sign-off */}
      <section id="summary-signoff" className={`${CARD} overflow-hidden`}>
        <PanelHeader icon={PenLine} title="Sign-off" caption="Who confirmed this record on site" />
        <div className="px-5 sm:px-6 pb-6 pt-1 flex flex-wrap items-center gap-6">
          {inspection.signature ? (
            <div className="w-56 h-20 border border-[#E8E9EE] bg-[#FAFBFC] rounded-xl flex items-center justify-center p-2">
              <img
                src={inspection.signature}
                alt="Branch manager signature"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="w-56 h-20 border border-dashed border-[#E4E6EB] bg-[#FAFBFC] rounded-xl flex items-center justify-center text-xs text-[#6B6F76] italic">
              Not signed yet
            </div>
          )}
          <div className="text-xs text-[#6B6F76] space-y-1">
            {inspection.signatoryName && (
              <p>
                Signed by:{' '}
                <strong className="text-[#17181D]">{inspection.signatoryName}</strong>
                {inspection.signatoryRole && <> — {inspection.signatoryRole}</>}
              </p>
            )}
            <p>
              Branch: <strong className="text-[#17181D]">{inspection.branchName}</strong>
            </p>
            <p>
              Inspected:{' '}
              <strong className="text-[#17181D]">
                {formatDate(inspection.date)} {inspection.time}
              </strong>
            </p>
            <p>
              Report ID: <span className="font-mono">{inspection.id}</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

/**
 * Section pass rates as bars, weakest first. The weakest six to begin with —
 * a round covers fifteen sections and most of them pass outright, so the full
 * list buries the ones that need attention under a column of full bars. The
 * rest are one click away, and the button says how many there are.
 */
const SHOWN_AT_FIRST = 6;

const CategoryBars: React.FC<{ sections: ReportModel['sections'] }> = ({ sections }) => {
  const [all, setAll] = useState(false);
  const shown = all ? sections : sections.slice(0, SHOWN_AT_FIRST);
  const hidden = sections.length - SHOWN_AT_FIRST;
  return (
    <>
      <BarList
        label="Pass rate by category"
        max={100}
        rows={shown.map((cat) => ({
          key: `${cat.listKey}::${cat.key}`,
          label: cat.title,
          sub: cat.listLabel,
          value: cat.rate,
          display: `${cat.passed}/${cat.total} • ${cat.rate}%`,
          detail: `${cat.passed} of ${cat.total} checks passed`,
        }))}
      />
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="mt-4 inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-bold text-[#17181D] bg-[#F4F5F7] hover:bg-[#EBEDF0] transition-colors cursor-pointer"
        >
          {all ? 'Show the weakest only' : `Show all ${sections.length} sections (${hidden} more)`}
        </button>
      )}
    </>
  );
};

/** Status palette, the same steps the rings and the report use. */
const TONE_DOT = {
  good: '#157F4B',
  bad: '#C8202D',
  warn: '#B4740A',
  muted: '#C9CCD2',
} as const;

/**
 * One count, in ink. The tone rides on a dot beside the label rather than on
 * the figure, so the number stays legible and the colour is never the only
 * thing saying which way it went.
 */
const Stat: React.FC<{
  label: string;
  value: number;
  tone?: 'good' | 'bad' | 'warn' | 'muted';
}> = ({ label, value, tone = 'muted' }) => (
  <div className="h-full rounded-xl border border-[#F0F1F4] bg-[#FAFBFC] p-3.5">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6B6F76]">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONE_DOT[tone] }} />
      {label}
    </p>
    <p className="text-[26px] leading-none font-bold tracking-tight text-[#17181D] mt-2">
      <CountUp value={value} />
    </p>
  </div>
);

/** "23 Sep", for a chart axis where the full date will not fit. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * The trend axis floor: ten below the lowest score, to the nearest ten. A
 * line is read by its slope, and a few points of change near the top are
 * invisible on an axis pinned at zero.
 */
function trendFloor(points: TrendPoint[]): number {
  if (points.length === 0) return 0;
  const low = Math.min(...points.map((p) => p.value));
  return Math.max(0, Math.min(80, Math.floor((low - 10) / 10) * 10));
}

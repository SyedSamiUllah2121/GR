'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit3,
  FileSpreadsheet,
  FileText,
  Hash,
  History,
  Lock,
  Minus,
  MessageSquare,
  PenLine,
  PieChart,
  Printer,
  ShieldCheck,
  StickyNote,
  Timer,
  TrendingUp,
  User,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  INSPECTION_KIND_LABEL,
  INSPECTION_KIND_SHORT,
  INSPECTION_TYPE_LABEL,
  Inspection,
  MaintenanceJob,
  Severity,
  effectiveReasonGroup,
  inspectionKindOf,
} from '../types';
import { categoryLabel } from '../services/categoryStore';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { useChecklist } from '../hooks/useChecklist';
import { getInspectionById, getInspections, subscribeToStorage } from '../services/storage';
import { SEVERITY_LABEL } from '../services/priority';
import {
  Outcome,
  ReportModel,
  ReportRow,
  SEVERITY_ORDER,
  buildReportModel,
  formatDate,
  formatDateTime,
  formatDuration,
  reasonText,
} from '../services/reportModel';
import { jobIdFor, needsMaintenance, suggestCategory } from '../services/maintenanceIntake';
import { getJobById, statusOf } from '../services/maintenanceStore';
import { PriorityBadge } from './PriorityBadge';
import { StatusPill } from './MaintenanceStatusPill';
import { ScorePill } from './ScorePill';
import { DonutChart } from './DonutChart';
import { BUTTON, CARD } from './ui';
import { CountUp, Reveal, Stagger, StaggerItem } from './motion';
import {
  BarList,
  CHART_COLORS,
  ScoreDial,
  StackedMeter,
  TrendChart,
  TrendPoint,
} from './charts';
import { canEditInspection, canViewInspection } from '../services/permissions';
import { AccessNotice, NOT_YOURS } from './AccessNotice';
import { getUserById } from '../services/userStore';
import { useCurrentUser } from '../hooks/useCurrentUser';

interface ReportScreenProps {
  inspectionId: string;
}

/**
 * Status palette for the outcome breakdown. Checked with the palette validator
 * against the white card these sit on: pass/fail separate by ΔE 11.4 under
 * protanopia and 25.6 in normal vision, and every use is paired with an icon
 * and a written label so the colour never carries the meaning by itself.
 */
const OUTCOME_COLOR: Record<Outcome, string> = {
  passed: '#157F4B',
  failed: '#D9542B',
  unanswered: '#7A8288',
  // The amber the board uses for work in hand, since that is what this is
  held: '#B4740A',
};

type TabKey = 'checklist' | 'findings' | 'maintenance' | 'notes' | 'history';

export const ReportScreen: React.FC<ReportScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const checklist = useChecklist();
  const user = useCurrentUser();

  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );
  const [allInspections, setAllInspections] = useState<Inspection[]>(() => getInspections());
  const [tab, setTab] = useState<TabKey>('checklist');
  const [openSections, setOpenSections] = useState<Set<string> | null>(null);
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set());

  // Records live in localStorage, so re-read whenever anything writes to it
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

  // Sections that need attention open on arrival; clean ones stay folded away.
  // Null means "not chosen yet", so the default is only applied once.
  const sectionKeys = model?.sections.map((s) => `${s.listKey}::${s.key}`).join('|');
  useEffect(() => {
    if (!model) return;
    setOpenSections((current) => {
      if (current) return current;
      return new Set(
        model.sections
          .filter((section) => section.failed > 0 || section.unanswered > 0)
          .map((section) => `${section.listKey}::${section.key}`)
      );
    });
    // Recomputed only when the set of sections itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKeys]);

  if (!inspection || !model) {
    return (
      <div className="p-5 sm:p-8 max-w-xl mx-auto w-full">
        <div className={`${CARD} px-6 py-14 text-center`}>
          <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
            <FileText className="w-7 h-7" />
          </span>
          <h2 className="mt-5 text-base font-bold text-[#17181D]">Report not found</h2>
          <p className="text-[13px] text-[#6B6F76] mt-1.5">
            The requested inspection report does not exist or has been removed.
          </p>
          <button onClick={() => router.push('/inspections')} className={`${BUTTON.primary} mt-6`}>
            Back to records
          </button>
        </div>
      </div>
    );
  }

  /*
   * A record from another branch, or another inspector's visit. Refused here
   * rather than only having its buttons hidden: this screen is the whole
   * report — every finding, note and photograph — so leaving it readable
   * would have made the scoping on the records list cosmetic.
   */
  if (!canViewInspection(user, inspection)) {
    return <AccessNotice {...NOT_YOURS} />;
  }

  const open = openSections ?? new Set<string>();
  const isLocked = inspection.status === 'submitted';
  const allOpen = open.size === model.sections.length;
  const kind = inspectionKindOf(inspection);
  const mayEdit = canEditInspection(user, inspection);
  const assignedBy = getUserById(inspection.assignedByUserId);
  const submittedBy = getUserById(inspection.submittedByUserId);
  /*
   * Admin overrides of this locked result. A lock only one person can open
   * has to leave a trail, otherwise the word means nothing — so the report
   * prints every reopening rather than only the current answers.
   */
  const overrides = inspection.edits ?? [];

  const toggleSection = (key: string) =>
    setOpenSections(() => {
      const next = new Set(open);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAllSections = () =>
    setOpenSections(
      allOpen
        ? new Set<string>()
        : new Set(model.sections.map((s) => `${s.listKey}::${s.key}`))
    );

  const toggleRow = (id: number) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleExportCsv = () => downloadCsv(model);

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'checklist', label: 'Inspection checklist' },
    { key: 'findings', label: 'Findings', count: model.issues.length },
    { key: 'maintenance', label: 'Maintenance', count: model.maintenance.length },
    { key: 'notes', label: 'Notes', count: model.notes.length },
    { key: 'history', label: 'History', count: model.branchHistory.length },
  ];

  /*
   * The branch's submitted visits oldest to newest, for the trend in the rail.
   * The model keeps them newest first, which is how the History tab lists them.
   */
  const history: TrendPoint[] = [...model.branchHistory].reverse().map((visit) => ({
    label: formatDate(visit.date),
    shortLabel: shortDate(visit.date),
    value: visit.score,
    detail: visit.isThis ? 'This visit' : `${visit.failed} flagged`,
  }));

  // Weakest sections first — where the branch needs attention
  const weakest = [...model.sections].sort((a, b) => a.rate - b.rate).slice(0, 6);

  const outcomeSegments = [
    { key: 'passed', label: 'Passed', value: model.passed, color: OUTCOME_COLOR.passed },
    { key: 'failed', label: 'Failed', value: model.failed, color: OUTCOME_COLOR.failed },
    {
      key: 'unanswered',
      label: 'Not answered',
      value: model.unanswered,
      color: OUTCOME_COLOR.unanswered,
    },
    // Only on a visit that had checks held back — otherwise it is a row of zeros
    ...(model.held > 0
      ? [{ key: 'held', label: 'With maintenance', value: model.held, color: OUTCOME_COLOR.held }]
      : []),
  ];

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 w-full max-w-[1440px] mx-auto">
      {/* Breadcrumb */}
      <nav className="no-print text-xs text-[#6B6F76] mb-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="font-semibold hover:text-[#17181D] transition-colors cursor-pointer"
        >
          Inspections
        </button>
        <ChevronRight className="w-3 h-3 text-[#C9CCD2]" />
        <span className="text-[#17181D] font-semibold">Inspection details</span>
      </nav>

      {/* Title row */}
      <Reveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA1A9]">
            Inspection report · {inspection.branchName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] md:text-[28px] leading-tight font-bold tracking-tight text-[#17181D]">
              Inspection <span className="font-mono text-[0.8em] text-[#6B6F76]">#{inspection.id}</span>
            </h1>
            {isLocked ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#E6F4EC] text-[#12643C] ring-1 ring-inset ring-[#157F4B]/20">
                <Lock className="w-3 h-3" />
                Locked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDF3E2] text-[#8A5A08] ring-1 ring-inset ring-[#B4740A]/25">
                <PenLine className="w-3 h-3" />
                Draft
              </span>
            )}

            {/* Which kind of visit this was — it decides who could edit it */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${
                kind === 'surprise'
                  ? 'bg-[#FFF6E5] text-[#8A5A08] ring-[#B4740A]/25'
                  : 'bg-[#F4F5F7] text-[#6B6F76] ring-[#E4E6EB]'
              }`}
            >
              {kind === 'surprise' ? <Zap className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
              {INSPECTION_KIND_SHORT[kind]}
            </span>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
          {/*
            "Only the Main Admin can edit the submitted results if necessary"
            — so for everyone else on a submitted record this button is not
            here at all. A draft is still editable by whoever is carrying the
            visit out.
          */}
          {mayEdit && (
            <button
              type="button"
              onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
              className={BUTTON.secondary}
            >
              <Edit3 className="w-3.5 h-3.5 text-[#C8202D]" />
              <span>{isLocked ? 'Reopen answers' : 'Edit answers'}</span>
            </button>
          )}
          <button type="button" onClick={handleExportCsv} className={BUTTON.secondary}>
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#157F4B]" />
            <span>Export CSV</span>
          </button>
          <button
            id="download-pdf-btn"
            type="button"
            onClick={() => window.print()}
            className={BUTTON.primary}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={() => router.push('/inspections')}
            className={BUTTON.secondary}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to list</span>
          </button>
        </div>
      </Reveal>

      {(model.missingCount > 0 || model.scoreMismatch) && (
        <div className="mb-5 p-4 rounded-2xl bg-[#FDF3E2] border border-[#B4740A]/30 flex items-start gap-3 page-break-inside-avoid">
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
                It was signed off at {model.inspection.score}%. The {model.total} items shown here
                come to {model.liveScore}%. The signed figure is the one on record.
              </p>
            )}
          </div>
        </div>
      )}

      {/*
        The two columns. Nothing around this grid moves: the rail inside it
        sticks on a wide screen, and a transform on any ancestor of a sticky
        element is what un-sticks it. The cards inside rise in on their own.
      */}
      <div className="print-container grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* ---------------------------------------------------------------- */}
        {/* Main column                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="min-w-0 space-y-5">
          {/*
            The result, first: the score, what the checks came to, and how
            serious the findings are. At the top of the page on purpose — the
            dial and the meter draw themselves once they are seen, and this is
            the part of the page that is on screen when Export PDF is pressed.
          */}
          <Reveal delay={0.05}>
            <section className={`${CARD} p-5 sm:p-6 page-break-inside-avoid`}>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex items-center gap-5 md:w-[16rem] shrink-0">
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
                    <p className="text-[13px] font-bold text-[#17181D]">Inspection score</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B6F76]">
                      {model.passed} of {model.total} checks passed
                      {model.held > 0 ? `, ${model.held} held by maintenance` : ''}.
                    </p>
                    <div className="mt-2.5">
                      <ScorePill score={model.score} size="sm" showLabel />
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0 md:pl-6 md:border-l border-[#F0F1F4]">
                  <div className="grid grid-cols-3 gap-3">
                    <Figure label="Passed" value={model.passed} dot={OUTCOME_COLOR.passed} />
                    <Figure label="Failed" value={model.failed} dot={OUTCOME_COLOR.failed} />
                    <Figure
                      label="Not answered"
                      value={model.unanswered}
                      dot={OUTCOME_COLOR.unanswered}
                    />
                  </div>

                  <div className="mt-5">
                    <p className="text-[13px] font-bold text-[#17181D]">Findings by severity</p>
                    <p className="text-xs text-[#6B6F76] mt-0.5 mb-3.5">
                      {model.issues.length === 0
                        ? 'Nothing was flagged on this visit.'
                        : `${model.issues.length} finding${model.issues.length === 1 ? '' : 's'}, ranked by the priority rules`}
                    </p>
                    {model.issues.length > 0 && (
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
                    {model.repeats.length > 0 && (
                      <p className="mt-3.5 text-[11px] font-semibold text-[#8A5A08] flex items-start gap-1.5">
                        <History className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>
                          {model.repeats.length} repeat issue
                          {model.repeats.length === 1 ? '' : 's'} carried over from earlier visits
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </Reveal>

          {/* Header card */}
          <Reveal delay={0.08}>
          <section className={`${CARD} overflow-hidden page-break-inside-avoid`}>
            <div className="p-5 sm:p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-5">
              <MetaField icon={Building2} label="Branch" prominent>
                {inspection.branchName}
              </MetaField>
              <MetaField icon={Calendar} label="Inspection date">
                {formatDate(inspection.date)}
                <span className="block text-[11px] font-normal text-[#6B6F76] mt-0.5">
                  {inspection.time}
                </span>
              </MetaField>
              <MetaField icon={User} label="Inspector">
                {inspection.inspectorName || 'Not recorded'}
              </MetaField>
              <MetaField icon={kind === 'surprise' ? Zap : CalendarCheck} label="Visit">
                {INSPECTION_KIND_LABEL[kind]}
                {/*
                  Who sent them. Only a surprise visit has an answer — a
                  Monday round is the branch's own standing obligation and
                  nobody hands it out.
                */}
                {kind === 'surprise' && (
                  <span className="block text-[11px] font-normal text-[#6B6F76] mt-0.5">
                    {inspection.autoRaised
                      ? 'Raised automatically by the rotation'
                      : assignedBy
                        ? `Assigned by ${assignedBy.name}`
                        : 'Assigned by the admin'}
                  </span>
                )}
              </MetaField>
              <MetaField icon={ClipboardList} label="Inspection type">
                {inspection.inspectionType
                  ? INSPECTION_TYPE_LABEL[inspection.inspectionType]
                  : 'Not recorded'}
              </MetaField>
              <MetaField icon={Timer} label="Duration">
                {formatDuration(model.durationMinutes)}
              </MetaField>
            </div>

            <div className="border-t border-[#F0F1F4] bg-[#FAFBFC] p-5 sm:p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-5">
              <MetaField icon={ClipboardList} label="Checklist">
                {FULL_CHECKLIST_LABEL}
                <span className="block text-[11px] font-normal text-[#6B6F76] mt-0.5">
                  {model.missingCount > 0
                    ? `${model.frozenTotal} covered, ${model.total} shown`
                    : `${model.total} items covered`}
                </span>
              </MetaField>
              <MetaField icon={ShieldCheck} label="Status">
                <span className={isLocked ? 'text-[#12643C]' : 'text-[#8A5A08]'}>
                  {isLocked ? 'Submitted & locked' : 'Draft — in progress'}
                </span>
              </MetaField>
              <MetaField icon={Clock} label="Submitted at">
                {inspection.submittedAt
                  ? formatDateTime(inspection.submittedAt)
                  : isLocked
                    ? `${formatDate(inspection.date)}, ${inspection.time}`
                    : 'Not submitted'}
              </MetaField>
              <MetaField icon={Hash} label="Score">
                <ScorePill score={model.score} showLabel />
              </MetaField>
              <MetaField icon={CalendarClock} label="Next due">
                {formatDate(model.nextDueDate)}
              </MetaField>
            </div>
          </section>
          </Reveal>

          {/* Tabs */}
          <div className="no-print flex gap-1 overflow-x-auto p-1 rounded-xl bg-[#EEF0F3]/70 border border-[#E8E9EE]">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  tab === key
                    ? 'bg-white text-[#17181D] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_2px_6px_-2px_rgba(16,24,40,0.1)]'
                    : 'text-[#6B6F76] hover:text-[#17181D] hover:bg-white/60'
                }`}
              >
                {label}
                {count !== undefined && (
                  <span
                    className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums flex items-center justify-center transition-colors ${
                      tab === key ? 'bg-[#FDECEE] text-[#A81823]' : 'bg-[#E4E6EB] text-[#6B6F76]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Every panel stays in the DOM so printing lays out the whole report,
              not just whichever tab happened to be open. */}
          <Panel active={tab === 'checklist'} title="Inspection checklist">
            <section className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-[#F0F1F4] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-[#17181D]">Inspection checklist</h2>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    Sections with a failure or a gap open on arrival
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <OutcomeLegend model={model} />
                  <button
                    type="button"
                    onClick={toggleAllSections}
                    className="no-print h-8 px-3 text-[11px] font-bold text-[#17181D] bg-[#F4F5F7] rounded-lg hover:bg-[#EBEDF0] transition-colors cursor-pointer"
                  >
                    {allOpen ? 'Collapse all' : 'Expand all'}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#F0F1F4]">
                {model.sections.map((section) => {
                  const key = `${section.listKey}::${section.key}`;
                  const isOpen = open.has(key);
                  return (
                    <div key={key} className="page-break-inside-avoid">
                      <button
                        type="button"
                        onClick={() => toggleSection(key)}
                        className="print-keep w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-[#FAFBFC] transition-colors cursor-pointer"
                      >
                        <ChevronDown
                          className={`no-print w-4 h-4 text-[#9CA1A9] shrink-0 transition-transform duration-200 ${
                            isOpen ? '' : '-rotate-90'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-[#17181D]">
                            {section.index}. {section.title}
                          </span>
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] mt-0.5">
                            {section.listLabel}
                          </span>
                        </div>
                        {/* The section's pass share, as a short bar beside the count */}
                        <span className="hidden sm:block w-20 h-1.5 rounded-full bg-[#EEF0F3] overflow-hidden shrink-0" aria-hidden>
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${section.rate}%`,
                              background:
                                section.failed > 0
                                  ? OUTCOME_COLOR.failed
                                  : section.unanswered > 0
                                    ? OUTCOME_COLOR.held
                                    : OUTCOME_COLOR.passed,
                            }}
                          />
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-bold tabular-nums shrink-0 ${
                            section.failed > 0 || section.unanswered > 0
                              ? 'text-[#17181D]'
                              : 'text-[#12643C]'
                          }`}
                        >
                          {section.failed > 0 ? (
                            <X className="w-3.5 h-3.5 text-[#D9542B]" />
                          ) : section.unanswered > 0 ? (
                            <Minus className="w-3.5 h-3.5 text-[#B4740A]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-[#157F4B]" />
                          )}
                          {section.passed} / {section.total} passed
                        </span>
                      </button>

                      <div className={`collapsible ${isOpen ? '' : 'hidden'}`}>
                        <div className="divide-y divide-[#F0F1F4] border-t border-[#F0F1F4]">
                          {section.rows.map((row) => (
                            <ChecklistRow
                              key={row.item.id}
                              row={row}
                              expanded={openRows.has(row.item.id)}
                              onToggle={() => toggleRow(row.item.id)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </Panel>

          <Panel active={tab === 'findings'} title="Findings">
            <FindingsPanel model={model} />
          </Panel>

          <Panel active={tab === 'maintenance'} title="Maintenance">
            <MaintenancePanel model={model} />
          </Panel>

          <Panel active={tab === 'notes'} title="Notes">
            <NotesPanel model={model} />
          </Panel>

          <Panel active={tab === 'history'} title="Branch history">
            <HistoryPanel model={model} onOpen={(id) => router.push(`/inspections/${id}`)} />
          </Panel>

          {/* Sign-off closes the printed document */}
          <SignOffCard model={model} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right rail                                                        */}
        {/* ---------------------------------------------------------------- */}
        <aside className="space-y-5 xl:sticky xl:top-[5.5rem]">
          <Stagger className="space-y-5">
          <StaggerItem>
          <RailCard title="Inspection summary" icon={PieChart}>
            <div className="flex items-center gap-4">
              {/* The middle carries the passed count, because the score is
                  already the headline above and is not worth saying twice; the
                  count still differs from one visit to the next. */}
              <DonutChart
                centerValue={model.passed}
                centerLabel={`of ${model.total} passed`}
                size={124}
                segments={outcomeSegments}
              />
              <ul className="flex-1 min-w-0 space-y-2.5">
                {outcomeSegments.map((segment) => (
                  <LegendRow
                    key={segment.key}
                    color={segment.color}
                    label={segment.label}
                    value={segment.value}
                    total={model.total}
                  />
                ))}
              </ul>
            </div>
          </RailCard>
          </StaggerItem>

          {/*
            Two charts for the screen only. Each draws itself once it is
            scrolled into view, so a print taken before then would show empty
            axes — and both say again what the printed page already carries in
            full: the History tab lists every visit, and every section heading
            in the checklist gives its passed count.
          */}
          {history.length > 0 && (
            <StaggerItem className="print:hidden">
            <RailCard title="Score history" icon={TrendingUp}>
              <p className="text-xs text-[#6B6F76] -mt-1 mb-3">
                {history.length === 1
                  ? 'The first submitted visit at this branch'
                  : `${history.length} submitted visits at this branch, oldest to newest`}
              </p>
              <TrendChart
                points={history}
                seriesLabel="Score"
                suffix="%"
                height={180}
                min={trendFloor(history)}
                max={100}
              />
            </RailCard>
            </StaggerItem>
          )}

          <StaggerItem className="print:hidden">
          <RailCard
            title="Section pass rates"
            icon={BarChart3}
            action={
              model.sections.length > weakest.length ? (
                <button
                  type="button"
                  onClick={() => setTab('checklist')}
                  className="no-print text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
                >
                  All {model.sections.length}
                </button>
              ) : undefined
            }
          >
            <p className="text-xs text-[#6B6F76] -mt-1 mb-3.5">Weakest first</p>
            <BarList
              label="Pass rate by section"
              max={100}
              rows={weakest.map((section) => ({
                key: `${section.listKey}::${section.key}`,
                label: section.title,
                sub: section.listLabel,
                value: section.rate,
                display: `${section.rate}%`,
                detail: `${section.passed} of ${section.total} checks passed`,
              }))}
            />
          </RailCard>
          </StaggerItem>

          <StaggerItem>
          <RailCard
            title="Top findings"
            icon={AlertTriangle}
            action={
              model.issues.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setTab('findings')}
                  className="no-print text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
                >
                  View all ({model.issues.length})
                </button>
              ) : undefined
            }
          >
            {model.issues.length === 0 ? (
              <p className="text-xs text-[#6B6F76]">No findings — every item passed.</p>
            ) : (
              <ul className="space-y-3.5">
                {model.issues.slice(0, 3).map(({ item, answer, priority }) => (
                  <li key={item.id} className="flex gap-3">
                    {answer.photo ? (
                      <img
                        src={answer.photo}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover border border-[#E8E9EE] bg-[#F4F5F7] shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl border border-[#E8E9EE] bg-[#F4F5F7] shrink-0 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-[#9CA1A9]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <PriorityBadge
                        severity={priority.severity}
                        size="sm"
                        escalated={priority.severity !== priority.base}
                      />
                      <p className="text-xs font-semibold text-[#17181D] mt-1 leading-snug">
                        {item.text}
                      </p>
                      <p className="text-[11px] text-[#6B6F76] mt-0.5 leading-snug">
                        {reasonText(answer)}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] mt-1">
                        {effectiveReasonGroup(item, answer)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RailCard>
          </StaggerItem>

          <StaggerItem>
          <RailCard title={`Photos (${model.photos.length})`} icon={Camera}>
            {model.photos.length === 0 ? (
              <p className="text-xs text-[#6B6F76]">No photo evidence was attached.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {model.photos.map((row) => (
                  <img
                    key={row.item.id}
                    src={row.answer!.photo as string}
                    alt={`Evidence for item ${row.number}: ${row.item.text}`}
                    title={`${row.number} ${row.item.text}`}
                    className="w-full aspect-square rounded-lg object-cover border border-[#E8E9EE] bg-[#F4F5F7] transition-transform duration-200 hover:scale-[1.04]"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
            )}
          </RailCard>
          </StaggerItem>

          <StaggerItem>
          <RailCard title="Inspection information" icon={FileText}>
            <dl className="space-y-2.5">
              <InfoRow label="Inspection ID" mono>
                {inspection.id}
              </InfoRow>
              <InfoRow label="Branch">{inspection.branchName}</InfoRow>
              <InfoRow label="Checklist">{FULL_CHECKLIST_LABEL}</InfoRow>
              <InfoRow label="Items covered">
                {model.missingCount > 0
                  ? `${model.frozenTotal} (${model.total} still in checklist)`
                  : String(model.total)}
              </InfoRow>
              <InfoRow label="Record type">
                {inspection.itemIds && inspection.itemIds.length > 0
                  ? 'Frozen at submission'
                  : 'Follows live checklist'}
              </InfoRow>
              <InfoRow label="Signed by">
                {inspection.signature
                  ? inspection.signatoryName
                    ? `${inspection.signatoryName}${
                        inspection.signatoryRole ? ` — ${inspection.signatoryRole}` : ''
                      }`
                    : 'Signed'
                  : 'Not signed'}
              </InfoRow>
              <InfoRow label="Visit">{INSPECTION_KIND_LABEL[kind]}</InfoRow>
              {submittedBy && (
                <InfoRow label="Submitted by">{submittedBy.name}</InfoRow>
              )}
              {inspection.lockedAt && (
                <InfoRow label="Locked">{formatDateTime(inspection.lockedAt)}</InfoRow>
              )}
              <InfoRow label="Visits on record">
                {String(model.branchHistory.length)} at this branch
              </InfoRow>
            </dl>
          </RailCard>
          </StaggerItem>

          {/*
            The override trail. Absent on the overwhelming majority of
            records, which is the point — when it is there, it is the most
            important thing on the page: a signed-off result was changed
            afterwards, and this says by whom and what the score had been.
          */}
          {overrides.length > 0 && (
            <StaggerItem>
            <RailCard title="Reopened after sign-off" icon={History}>
              <ol className="space-y-2.5">
                {overrides
                  .slice()
                  .reverse()
                  .map((edit, index) => (
                    <li
                      key={`${edit.at}-${index}`}
                      className="pl-3 border-l-2 border-[#B4740A]/40"
                    >
                      <p className="text-xs font-bold text-[#17181D]">{edit.byName}</p>
                      <p className="text-[11px] text-[#6B6F76]">
                        {formatDateTime(edit.at)} — score was {edit.previousScore}%
                      </p>
                    </li>
                  ))}
              </ol>
              <p className="mt-3 text-[11px] text-[#6B6F76] leading-relaxed">
                Only the Main Admin can change a submitted result. Every change is recorded
                here.
              </p>
            </RailCard>
            </StaggerItem>
          )}
          </Stagger>
        </aside>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** One count in the headline card, in ink, with its outcome's swatch. */
const Figure: React.FC<{ label: string; value: number; dot: string }> = ({ label, value, dot }) => (
  <div className="rounded-xl border border-[#F0F1F4] bg-[#FAFBFC] px-3.5 py-3">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6B6F76] truncate">
      <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: dot }} aria-hidden />
      {label}
    </p>
    <p className="mt-1.5 text-[24px] leading-none font-bold tracking-tight text-[#17181D]">
      <CountUp value={value} />
    </p>
  </div>
);

const MetaField: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prominent?: boolean;
  children: React.ReactNode;
}> = ({ icon: Icon, label, prominent = false, children }) => (
  <div className="min-w-0">
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
    <div
      className={`mt-1.5 font-semibold text-[#17181D] ${prominent ? 'text-base' : 'text-sm'}`}
    >
      {children}
    </div>
  </div>
);

/*
 * The outcomes in words, each beside its icon. Ink text rather than the
 * outcome colour: the icon carries the colour, so the label stays readable.
 */
const OutcomeLegend: React.FC<{ model: ReportModel }> = ({ model }) => (
  <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[#17181D]">
    <span className="inline-flex items-center gap-1.5">
      <Check className="w-3.5 h-3.5 text-[#157F4B]" />
      Passed ({model.passed})
    </span>
    <span className="inline-flex items-center gap-1.5">
      <X className="w-3.5 h-3.5 text-[#D9542B]" />
      Failed ({model.failed})
    </span>
    <span className="inline-flex items-center gap-1.5 text-[#6B6F76]">
      <Minus className="w-3.5 h-3.5" />
      Not answered ({model.unanswered})
    </span>
  </div>
);

const LegendRow: React.FC<{
  color: string;
  label: string;
  value: number;
  total: number;
}> = ({ color, label, value, total }) => (
  <li className="flex items-center gap-2">
    <span
      className="w-2.5 h-2.5 rounded-[3px] shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden
    />
    <span className="text-xs text-[#6B6F76] flex-1 min-w-0 truncate">{label}</span>
    <span className="text-xs font-semibold text-[#17181D] tabular-nums">{value}</span>
    <span className="text-[11px] text-[#9CA1A9] tabular-nums w-8 text-right">
      {total > 0 ? Math.round((value / total) * 100) : 0}%
    </span>
  </li>
);

const ChecklistRow: React.FC<{
  row: ReportRow;
  expanded: boolean;
  onToggle: () => void;
}> = ({ row, expanded, onToggle }) => {
  const { item, answer, outcome, number, priority } = row;
  const hasDetail = outcome === 'failed' || !!answer?.note || !!answer?.photo;

  return (
    <div className={outcome === 'failed' ? 'bg-[#FDECEE]/25' : ''}>
      <div className="px-5 py-3 flex items-start gap-3">
        <span className="text-xs font-semibold text-[#9CA1A9] tabular-nums shrink-0 w-8 pt-0.5">
          {number}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#17181D] leading-snug">{item.text}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6F76] bg-[#F4F5F7] px-1.5 py-0.5 rounded-md">
              {effectiveReasonGroup(item, answer)}
            </span>
            {priority && (
              <PriorityBadge
                severity={priority.severity}
                size="sm"
                escalated={priority.severity !== priority.base}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <OutcomePill outcome={outcome} />
          {answer?.note && (
            <MessageSquare
              className="w-4 h-4 text-[#9CA1A9]"
              aria-label="Has a note"
            />
          )}
          {answer?.photo && (
            <Camera className="w-4 h-4 text-[#9CA1A9]" aria-label="Has photo evidence" />
          )}
          {hasDetail && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide detail' : 'Show detail'}
              className="no-print w-7 h-7 rounded-lg flex items-center justify-center text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7] transition-colors cursor-pointer"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
              />
            </button>
          )}
        </div>
      </div>

      {hasDetail && (
        <div className={`collapsible ${expanded ? '' : 'hidden'}`}>
          <div className="px-5 pb-4 pl-16">
            <div className="rounded-xl border border-[#F0D9DC] bg-white p-3.5 space-y-2.5">
              {outcome === 'failed' && (
                <p className="text-xs">
                  <span className="font-bold text-[#A81823]">Reason: </span>
                  <span className="text-[#17181D] font-semibold">{reasonText(answer)}</span>
                </p>
              )}
              {answer?.note && (
                <p className="text-xs text-[#6B6F76]">
                  <span className="font-bold text-[#17181D]">Note: </span>
                  {answer.note}
                </p>
              )}
              {priority && priority.factors.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] mb-1">
                    How this priority was reached
                  </p>
                  <ul className="text-[11px] text-[#6B6F76] space-y-0.5 list-disc list-inside">
                    {priority.factors.map((factor, i) => (
                      <li key={i}>{factor}</li>
                    ))}
                  </ul>
                </div>
              )}
              {answer?.photo && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] mb-1">
                    Attached evidence
                  </p>
                  <img
                    src={answer.photo}
                    alt={`Evidence for item ${number}`}
                    className="w-28 h-28 object-cover rounded-lg border border-[#E8E9EE] bg-white"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OutcomePill: React.FC<{ outcome: Outcome }> = ({ outcome }) => {
  if (outcome === 'passed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E6F4EC] text-[#12643C]">
        <Check className="w-3.5 h-3.5" />
        Yes
      </span>
    );
  }
  if (outcome === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FDECEE] text-[#A81823]">
        <X className="w-3.5 h-3.5" />
        No
      </span>
    );
  }
  /*
   * Not a gap in the round. The fault was already booked in, so there was
   * nothing for the inspector to judge — and the report has to say that rather
   * than leave a blank that reads as a check nobody bothered with.
   */
  if (outcome === 'held') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FDF3E2] text-[#8A5A08]">
        <Wrench className="w-3.5 h-3.5" />
        With maintenance
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F4F5F7] text-[#6B6F76] ring-1 ring-inset ring-[#E4E6EB]">
      <Minus className="w-3.5 h-3.5" />
      Not answered
    </span>
  );
};

const Panel: React.FC<{ active: boolean; title: string; children: React.ReactNode }> = ({
  active,
  title,
  children,
}) => (
  <div className={`report-panel ${active ? '' : 'hidden'}`}>
    {/* Only printing shows this — on screen the tab itself is the heading */}
    <h2 className="print-only-heading hidden text-base font-bold text-[#17181D] mb-3">
      {title}
    </h2>
    {children}
  </div>
);

const RailCard: React.FC<{
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon: Icon, action, children }) => (
  <section className={`${CARD} page-break-inside-avoid`}>
    <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <span className="w-8 h-8 rounded-lg bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </span>
        )}
        <h2 className="text-sm font-bold text-[#17181D] truncate">{title}</h2>
      </div>
      {action}
    </div>
    <div className="px-5 pb-5 pt-1">{children}</div>
  </section>
);

const InfoRow: React.FC<{ label: string; mono?: boolean; children: React.ReactNode }> = ({
  label,
  mono = false,
  children,
}) => (
  <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-[#F0F1F4] last:border-b-0 last:pb-0">
    <dt className="text-[11px] text-[#6B6F76] shrink-0">{label}</dt>
    <dd
      className={`text-[11px] font-semibold text-[#17181D] text-right min-w-0 truncate ${
        mono ? 'font-mono' : ''
      }`}
    >
      {children}
    </dd>
  </div>
);

const EmptyState: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, children }) => (
  <div className={`${CARD} px-8 py-12 text-center`}>
    <span className="mx-auto w-12 h-12 rounded-2xl bg-[#F4F5F7] text-[#9CA1A9] flex items-center justify-center">
      <Icon className="w-6 h-6" />
    </span>
    <p className="mt-3 text-sm font-bold text-[#17181D]">{title}</p>
    <p className="text-xs text-[#6B6F76] mt-1">{children}</p>
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
 * line is read by its slope, and a few points near the top are invisible on
 * an axis pinned at zero.
 */
function trendFloor(points: TrendPoint[]): number {
  if (points.length === 0) return 0;
  const low = Math.min(...points.map((p) => p.value));
  return Math.max(0, Math.min(80, Math.floor((low - 10) / 10) * 10));
}

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------

const FindingsPanel: React.FC<{ model: ReportModel }> = ({ model }) => {
  if (model.issues.length === 0) {
    return (
      <EmptyState icon={Check} title="No findings">
        Every item on this inspection passed.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {SEVERITY_ORDER.filter((s) => model.severityCounts[s] > 0).map((severity) => (
        <section key={severity} className="page-break-inside-avoid">
          <div className="flex items-center gap-2 mb-2">
            <PriorityBadge severity={severity} />
            <span className="text-xs font-bold text-[#6B6F76] tabular-nums">
              {model.severityCounts[severity]} finding
              {model.severityCounts[severity] === 1 ? '' : 's'}
            </span>
          </div>
          <div className={`${CARD} divide-y divide-[#F0F1F4] overflow-hidden`}>
            {model.issues
              .filter((issue) => issue.priority.severity === severity)
              .map(({ item, answer, priority }) => {
                const row = model.rows.find((r) => r.item.id === item.id);
                return (
                  <article key={item.id} className="px-5 py-4 flex items-start gap-4 hover:bg-[#FAFBFC] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-[#6B6F76] tabular-nums">
                          {row?.number}
                        </span>
                        <h3 className="text-sm font-semibold text-[#17181D]">{item.text}</h3>
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mt-1">
                        {effectiveReasonGroup(item, answer)} • {model.sections.find((s) =>
                          s.rows.some((r) => r.item.id === item.id)
                        )?.title}
                      </p>
                      <p className="text-xs text-[#6B6F76] mt-2">
                        <span className="font-semibold text-[#C8202D]">Reason: </span>
                        {reasonText(answer)}
                      </p>
                      {answer.note && (
                        <p className="text-xs text-[#6B6F76] mt-1">
                          <span className="font-semibold text-[#17181D]">Note: </span>
                          {answer.note}
                        </p>
                      )}
                      {priority.repeatCount > 0 && (
                        <p className="text-xs font-semibold text-[#B4740A] mt-1.5 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 shrink-0" />
                          Repeat — flagged in {priority.repeatCount} of the last{' '}
                          {priority.historyVisits} visit
                          {priority.historyVisits === 1 ? '' : 's'}
                        </p>
                      )}
                      {priority.overridden && (
                        <p className="text-xs text-[#6B6F76] mt-1 italic">
                          Priority set by hand — the rules said{' '}
                          {SEVERITY_LABEL[priority.computed]}
                        </p>
                      )}
                    </div>
                    {answer.photo && (
                      <img
                        src={answer.photo}
                        alt={`Evidence for item ${row?.number}`}
                        className="w-20 h-20 rounded-xl object-cover border border-[#E8E9EE] bg-[#F6F6F8] shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
};

const MaintenancePanel: React.FC<{ model: ReportModel }> = ({ model }) => {
  const inspectionId = model.inspection.id;

  /*
   * The job each finding actually raised, when it raised one. Looked up rather
   * than assumed: jobs are only put on the board when a record is submitted,
   * so a draft has none yet, and a job someone has since deleted should not be
   * linked to as though it were still open.
   */
  const jobs = useMemo(() => {
    const found = new Map<number, MaintenanceJob>();
    model.maintenance.forEach(({ item }) => {
      const job = getJobById(jobIdFor(inspectionId, item.id));
      if (job) found.set(item.id, job);
    });
    return found;
  }, [model.maintenance, inspectionId]);

  if (model.maintenance.length === 0) {
    return (
      <EmptyState icon={Wrench} title="No maintenance work raised">
        Nothing flagged on this visit points to a repair or a service call.
      </EmptyState>
    );
  }

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-[#F0F1F4]">
        <h2 className="text-[15px] font-bold text-[#17181D]">Repair &amp; service actions</h2>
        <p className="text-xs text-[#6B6F76] mt-0.5">
          Findings whose cause is a broken, damaged or unserviced item — the work the
          branch has to raise with maintenance. The ones marked as needing repair carry
          the job they opened on the board.
        </p>
      </div>
      <div className="divide-y divide-[#F0F1F4]">
        {model.maintenance.map(({ item, answer, priority }) => {
          const row = model.rows.find((r) => r.item.id === item.id);
          const marked = needsMaintenance(item, answer);
          const job = jobs.get(item.id);
          return (
            <div key={item.id} className="p-4 flex items-start gap-3">
              <Wrench
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  marked ? 'text-[#B4740A]' : 'text-[#6B6F76]'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[#6B6F76] tabular-nums">
                    {row?.number}
                  </span>
                  <span className="text-sm font-semibold text-[#17181D]">{item.text}</span>
                  <PriorityBadge severity={priority.severity} size="sm" />
                </div>
                <p className="text-xs text-[#6B6F76] mt-1">{reasonText(answer)}</p>
                {answer.note && (
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    <span className="font-semibold text-[#17181D]">Note: </span>
                    {answer.note}
                  </p>
                )}

                {/* Where the work went, and how far it has got */}
                {marked && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#B4740A]">
                      Maintenance · {categoryLabel(suggestCategory(item, answer))}
                    </span>
                    {job ? (
                      <>
                        <StatusPill status={statusOf(job)} />
                        <Link
                          href={`/maintenance/${job.id}`}
                          className="text-xs font-bold text-[#C8202D] hover:underline print:hidden"
                        >
                          Open job
                        </Link>
                      </>
                    ) : (
                      <span className="text-xs text-[#6B6F76]">
                        Job opens on the board when this inspection is submitted
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6F76] bg-[#F4F5F7] px-1.5 py-0.5 rounded-md shrink-0">
                {effectiveReasonGroup(item, answer)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const NotesPanel: React.FC<{ model: ReportModel }> = ({ model }) => {
  if (model.notes.length === 0) {
    return (
      <EmptyState icon={StickyNote} title="No notes">
        The inspector did not write a note against any item on this visit.
      </EmptyState>
    );
  }

  return (
    <section className={`${CARD} divide-y divide-[#F0F1F4] overflow-hidden`}>
      {model.notes.map((row) => (
        <div key={row.item.id} className="p-4 flex items-start gap-3">
          <StickyNote className="w-4 h-4 text-[#6B6F76] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#6B6F76] tabular-nums">
                {row.number}
              </span>
              <span className="text-sm font-semibold text-[#17181D]">{row.item.text}</span>
              <OutcomePill outcome={row.outcome} />
            </div>
            <p className="text-xs text-[#17181D] mt-1.5 whitespace-pre-wrap">
              {row.answer?.note}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
};

const HistoryPanel: React.FC<{
  model: ReportModel;
  onOpen: (id: string) => void;
}> = ({ model, onOpen }) => {
  const { branchHistory } = model;

  if (branchHistory.length === 0) {
    return (
      <EmptyState icon={History} title="No submitted visits yet">
        This is the first inspection on record for {model.inspection.branchName}.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <section className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-[#F0F1F4]">
          <h2 className="text-[15px] font-bold text-[#17181D]">
            Score history — {model.inspection.branchName}
          </h2>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Every submitted visit at this branch, newest first.
          </p>
        </div>
        <div className="divide-y divide-[#F0F1F4]">
          {branchHistory.map((visit) => (
            <div
              key={visit.id}
              className={`px-4 py-3 flex items-center gap-4 ${
                visit.isThis ? 'bg-[#FDECEE]/50' : ''
              }`}
            >
              <div className="w-32 shrink-0">
                <p className="text-sm font-semibold text-[#17181D]">{formatDate(visit.date)}</p>
                <p className="text-[11px] text-[#6B6F76]">{visit.time}</p>
              </div>

              {/*
                * One hue for every bar, so scores compare by length. The visit
                * being read is emphasised and the rest recede — the colour
                * tracks which record this is, never how it ranks.
                */}
              <div className="flex-1 min-w-0 h-2 bg-[#F1F2F5] rounded-r-[4px] overflow-hidden">
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${Math.max(visit.score, 2)}%`,
                    backgroundColor: visit.isThis ? CHART_COLORS.data : '#A8C6EC',
                  }}
                />
              </div>

              <span className="text-sm font-bold text-[#17181D] tabular-nums w-12 text-right shrink-0">
                {visit.score}%
              </span>
              <span className="text-[11px] text-[#6B6F76] tabular-nums w-20 text-right shrink-0">
                {visit.failed} flagged
              </span>

              {visit.isThis ? (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C8202D] w-20 text-right shrink-0">
                  This visit
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen(visit.id)}
                  className="no-print text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer w-20 text-right shrink-0"
                >
                  Open
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {model.repeats.length > 0 && (
        <section className="bg-[#FDF3E2] border border-[#B4740A]/30 rounded-2xl p-5 page-break-inside-avoid">
          <h2 className="text-sm font-bold text-[#17181D] flex items-center gap-2">
            <History className="w-4 h-4 text-[#B4740A]" />
            Repeat issues at this branch
          </h2>
          <ul className="mt-2.5 space-y-1.5">
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
        </section>
      )}
    </div>
  );
};

const SignOffCard: React.FC<{ model: ReportModel }> = ({ model }) => {
  const { inspection } = model;
  return (
    <section className={`${CARD} p-5 sm:p-6 page-break-inside-avoid`}>
      <h2 className="text-[15px] font-bold text-[#17181D]">
        Manager verification &amp; acknowledgment
      </h2>
      <p className="text-xs text-[#6B6F76] mt-0.5">
        The manager certifies that this inspection accurately reflects the branch condition.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <span className="text-xs font-semibold text-[#17181D] block mb-1.5">
            Signed by
          </span>
          {inspection.signature ? (
            <div className="w-60 h-24 border border-[#E8E9EE] bg-[#FAFBFC] rounded-xl flex items-center justify-center p-2">
              <img
                src={inspection.signature}
                alt="Branch manager signature"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="w-60 h-24 border border-dashed border-[#E4E6EB] bg-[#FAFBFC] rounded-xl flex items-center justify-center text-xs text-[#6B6F76] italic">
              Not signed yet
            </div>
          )}

          {/* A signature says nothing without a name against it */}
          {inspection.signatoryName && (
            <p className="mt-2 text-xs text-[#17181D] w-60">
              <strong>{inspection.signatoryName}</strong>
              {inspection.signatoryRole && (
                <span className="text-[#6B6F76]"> — {inspection.signatoryRole}</span>
              )}
            </p>
          )}
        </div>

        <dl className="text-xs text-[#6B6F76] space-y-1 sm:text-right">
          <div>
            Branch: <strong className="text-[#17181D]">{inspection.branchName}</strong>
          </div>
          <div>
            Inspected:{' '}
            <strong className="text-[#17181D]">
              {formatDate(inspection.date)}, {inspection.time}
            </strong>
          </div>
          {inspection.inspectorName && (
            <div>
              Inspector: <strong className="text-[#17181D]">{inspection.inspectorName}</strong>
            </div>
          )}
          <div>
            Report ID: <span className="font-mono text-[#17181D]">{inspection.id}</span>
          </div>
        </dl>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/** Wraps a field for CSV, doubling any quotes inside it. */
function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * The report as a spreadsheet: a metadata block, then one row per checklist
 * item. Opens directly in Excel, Numbers or Sheets.
 */
function downloadCsv(model: ReportModel): void {
  const { inspection } = model;
  const lines: string[] = [];

  const meta: [string, string | number][] = [
    ['Inspection ID', inspection.id],
    ['Branch', inspection.branchName],
    ['Date', formatDate(inspection.date)],
    ['Time', inspection.time],
    ['Inspector', inspection.inspectorName || 'Not recorded'],
    ['Visit', INSPECTION_KIND_LABEL[inspectionKindOf(inspection)]],
    [
      'Inspection type',
      inspection.inspectionType
        ? INSPECTION_TYPE_LABEL[inspection.inspectionType]
        : 'Not recorded',
    ],
    ['Status', inspection.status === 'submitted' ? 'Submitted & locked' : 'Draft'],
    ['Submitted at', inspection.submittedAt ? formatDateTime(inspection.submittedAt) : ''],
    [
      'Submitted by',
      getUserById(inspection.submittedByUserId)?.name ?? inspection.inspectorName ?? '',
    ],
    // Blank on every record that has never been reopened, which is most
    ['Reopened after sign-off', (inspection.edits ?? []).length || ''],
    ['Duration', formatDuration(model.durationMinutes)],
    ['Score', `${model.score}%`],
    ['Items covered', model.total],
    ['Passed', model.passed],
    ['Failed', model.failed],
    ['Not answered', model.unanswered],
    ['Next inspection due', formatDate(model.nextDueDate)],
  ];
  meta.forEach(([label, value]) => lines.push(`${csvCell(label)},${csvCell(value)}`));
  lines.push('');

  lines.push(
    [
      'No.',
      'Checklist',
      'Section',
      'Item',
      'Category',
      'Result',
      'Priority',
      'Base risk',
      'Repeat count',
      'Reason',
      'Note',
      'Photo attached',
    ]
      .map(csvCell)
      .join(',')
  );

  model.sections.forEach((section) => {
    section.rows.forEach((row) => {
      lines.push(
        [
          row.number,
          section.listLabel,
          section.title,
          row.item.text,
          effectiveReasonGroup(row.item, row.answer),
          row.outcome === 'passed'
            ? 'Yes'
            : row.outcome === 'failed'
              ? 'No'
              : row.outcome === 'held'
                ? 'With maintenance'
                : 'Not answered',
          row.priority ? SEVERITY_LABEL[row.priority.severity] : '',
          SEVERITY_LABEL[row.item.severity as Severity],
          row.priority ? row.priority.repeatCount : '',
          row.outcome === 'failed' ? reasonText(row.answer) : '',
          row.answer?.note || '',
          row.answer?.photo ? 'Yes' : 'No',
        ]
          .map(csvCell)
          .join(',')
      );
    });
  });

  // BOM so Excel reads the accented text as UTF-8
  const blob = new Blob([`﻿${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inspection-${inspection.branchName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${inspection.date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

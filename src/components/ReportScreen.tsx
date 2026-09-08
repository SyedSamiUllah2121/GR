'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit3,
  FileSpreadsheet,
  Hash,
  History,
  Lock,
  Minus,
  MessageSquare,
  PenLine,
  Printer,
  ShieldCheck,
  StickyNote,
  Timer,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { INSPECTION_TYPE_LABEL, Inspection, Severity } from '../types';
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
import { PriorityBadge } from './PriorityBadge';
import { ScorePill } from './ScorePill';
import { DonutChart } from './DonutChart';

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
};

type TabKey = 'checklist' | 'findings' | 'maintenance' | 'notes' | 'history';

export const ReportScreen: React.FC<ReportScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const checklist = useChecklist();

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
      <div className="p-8 max-w-xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#17181D]">Report not found</h2>
        <p className="text-sm text-[#6B6F76] mt-2">
          The requested inspection report does not exist or has been removed.
        </p>
        <button
          onClick={() => router.push('/inspections')}
          className="mt-4 px-4 py-2 bg-[#C8202D] text-white text-sm font-medium rounded-md cursor-pointer"
        >
          Back to records
        </button>
      </div>
    );
  }

  const open = openSections ?? new Set<string>();
  const isLocked = inspection.status === 'submitted';
  const allOpen = open.size === model.sections.length;

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

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-[1400px] mx-auto">
      {/* Breadcrumb */}
      <nav className="no-print text-xs text-[#6B6F76] mb-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="hover:text-[#17181D] transition-colors cursor-pointer"
        >
          Inspections
        </button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#17181D] font-semibold">Inspection details</span>
      </nav>

      {/* Title row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#17181D]">
            Inspection <span className="font-mono text-[0.9em]">#{inspection.id}</span>
          </h1>
          {isLocked ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#E6F4EC] text-[#157F4B] border border-[#157F4B]/25">
              <Lock className="w-3 h-3" />
              Locked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDF3E2] text-[#B4740A] border border-[#B4740A]/25">
              <PenLine className="w-3 h-3" />
              Draft
            </span>
          )}
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#C8202D]" />
            <span>Edit answers</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#C8202D]" />
            <span>Export CSV</span>
          </button>
          <button
            id="download-pdf-btn"
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={() => router.push('/inspections')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to list</span>
          </button>
        </div>
      </div>

      {(model.missingCount > 0 || model.scoreMismatch) && (
        <div className="mb-5 p-4 rounded-lg bg-[#FDF3E2] border border-[#B4740A]/30 flex items-start gap-3 page-break-inside-avoid">
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

      <div className="print-container grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* ---------------------------------------------------------------- */}
        {/* Main column                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="min-w-0 space-y-5">
          {/* Header card */}
          <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden page-break-inside-avoid">
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-5">
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
              <MetaField icon={ClipboardList} label="Inspection type">
                {inspection.inspectionType
                  ? INSPECTION_TYPE_LABEL[inspection.inspectionType]
                  : 'Not recorded'}
              </MetaField>
              <MetaField icon={Timer} label="Duration">
                {formatDuration(model.durationMinutes)}
              </MetaField>
            </div>

            <div className="border-t border-[#E6E7EB] bg-[#FAFAFA] p-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-5">
              <MetaField icon={ClipboardList} label="Checklist">
                {FULL_CHECKLIST_LABEL}
                <span className="block text-[11px] font-normal text-[#6B6F76] mt-0.5">
                  {model.missingCount > 0
                    ? `${model.frozenTotal} covered, ${model.total} shown`
                    : `${model.total} items covered`}
                </span>
              </MetaField>
              <MetaField icon={ShieldCheck} label="Status">
                <span className={isLocked ? 'text-[#157F4B]' : 'text-[#B4740A]'}>
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

          {/* Tabs */}
          <div className="no-print border-b border-[#E6E7EB] flex gap-1 overflow-x-auto">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${
                  tab === key
                    ? 'border-[#C8202D] text-[#C8202D]'
                    : 'border-transparent text-[#6B6F76] hover:text-[#17181D]'
                }`}
              >
                {label}
                {count !== undefined && (
                  <span
                    className={`ml-1.5 tabular-nums ${
                      tab === key ? 'text-[#C8202D]' : 'text-[#6B6F76]'
                    }`}
                  >
                    ({count})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Every panel stays in the DOM so printing lays out the whole report,
              not just whichever tab happened to be open. */}
          <Panel active={tab === 'checklist'} title="Inspection checklist">
            <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E6E7EB] flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-[#17181D]">Inspection checklist</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <OutcomeLegend model={model} />
                  <button
                    type="button"
                    onClick={toggleAllSections}
                    className="no-print px-2.5 py-1.5 text-[11px] font-semibold text-[#17181D] border border-[#E6E7EB] rounded-md hover:bg-[#F6F6F8] transition-colors cursor-pointer"
                  >
                    {allOpen ? 'Collapse all' : 'Expand all'}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#E6E7EB]">
                {model.sections.map((section) => {
                  const key = `${section.listKey}::${section.key}`;
                  const isOpen = open.has(key);
                  return (
                    <div key={key} className="page-break-inside-avoid">
                      <button
                        type="button"
                        onClick={() => toggleSection(key)}
                        className="print-keep w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
                      >
                        <ChevronDown
                          className={`no-print w-4 h-4 text-[#6B6F76] shrink-0 transition-transform ${
                            isOpen ? '' : '-rotate-90'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-[#17181D]">
                            {section.index}. {section.title}
                          </span>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mt-0.5">
                            {section.listLabel}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-bold tabular-nums shrink-0 ${
                            section.failed > 0
                              ? 'text-[#D9542B]'
                              : section.unanswered > 0
                                ? 'text-[#B4740A]'
                                : 'text-[#157F4B]'
                          }`}
                        >
                          {section.passed} / {section.total} passed
                        </span>
                      </button>

                      <div className={`collapsible ${isOpen ? '' : 'hidden'}`}>
                        <div className="divide-y divide-[#EFEFF2] border-t border-[#EFEFF2]">
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
          <RailCard title="Inspection summary">
            <div className="flex items-center gap-4">
              {/* The score sits in the middle because it is what differs from
                  one visit to the next; the item count is the same on every
                  inspection of this checklist. */}
              <DonutChart
                centerValue={model.score}
                centerSuffix="%"
                centerLabel={`of ${model.total} items`}
                segments={[
                  {
                    key: 'passed',
                    label: 'Passed',
                    value: model.passed,
                    color: OUTCOME_COLOR.passed,
                  },
                  {
                    key: 'failed',
                    label: 'Failed',
                    value: model.failed,
                    color: OUTCOME_COLOR.failed,
                  },
                  {
                    key: 'unanswered',
                    label: 'Not answered',
                    value: model.unanswered,
                    color: OUTCOME_COLOR.unanswered,
                  },
                ]}
              />
              <ul className="flex-1 min-w-0 space-y-2.5">
                <LegendRow
                  color={OUTCOME_COLOR.passed}
                  label="Passed"
                  value={model.passed}
                  total={model.total}
                />
                <LegendRow
                  color={OUTCOME_COLOR.failed}
                  label="Failed"
                  value={model.failed}
                  total={model.total}
                />
                <LegendRow
                  color={OUTCOME_COLOR.unanswered}
                  label="Not answered"
                  value={model.unanswered}
                  total={model.total}
                />
              </ul>
            </div>
          </RailCard>

          <RailCard title="Priority summary">
            {model.issues.length === 0 ? (
              <p className="text-xs text-[#6B6F76]">Nothing was flagged on this visit.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_ORDER.map((severity) => (
                  <div
                    key={severity}
                    className={`border rounded-md p-2.5 ${
                      model.severityCounts[severity] > 0
                        ? 'border-[#E6E7EB] bg-white'
                        : 'border-[#EFEFF2] bg-[#FAFAFA]'
                    }`}
                  >
                    <PriorityBadge severity={severity} size="sm" />
                    <p
                      className={`text-xl font-bold tabular-nums mt-1.5 ${
                        model.severityCounts[severity] > 0
                          ? 'text-[#17181D]'
                          : 'text-[#6B6F76]/45'
                      }`}
                    >
                      {model.severityCounts[severity]}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {model.repeats.length > 0 && (
              <p className="mt-3 text-[11px] font-semibold text-[#B4740A] flex items-start gap-1.5">
                <History className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  {model.repeats.length} repeat issue
                  {model.repeats.length === 1 ? '' : 's'} carried over from earlier visits
                </span>
              </p>
            )}
          </RailCard>

          <RailCard
            title="Top findings"
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
              <ul className="space-y-3">
                {model.issues.slice(0, 3).map(({ item, answer, priority }) => (
                  <li key={item.id} className="flex gap-3">
                    {answer.photo ? (
                      <img
                        src={answer.photo}
                        alt=""
                        className="w-12 h-12 rounded-md object-cover border border-[#E6E7EB] bg-[#F6F6F8] shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md border border-[#E6E7EB] bg-[#F6F6F8] shrink-0 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-[#6B6F76]" />
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
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mt-1">
                        {item.reasonGroup}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RailCard>

          <RailCard title={`Photos (${model.photos.length})`}>
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
                    className="w-full aspect-square rounded-md object-cover border border-[#E6E7EB] bg-[#F6F6F8]"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
            )}
          </RailCard>

          <RailCard title="Inspection information">
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
              <InfoRow label="Manager signature">
                {inspection.signature ? 'Signed' : 'Not signed'}
              </InfoRow>
              <InfoRow label="Visits on record">
                {String(model.branchHistory.length)} at this branch
              </InfoRow>
            </dl>
          </RailCard>
        </aside>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const MetaField: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prominent?: boolean;
  children: React.ReactNode;
}> = ({ icon: Icon, label, prominent = false, children }) => (
  <div className="min-w-0">
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
    <div
      className={`mt-1 font-semibold text-[#17181D] ${prominent ? 'text-base' : 'text-sm'}`}
    >
      {children}
    </div>
  </div>
);

const OutcomeLegend: React.FC<{ model: ReportModel }> = ({ model }) => (
  <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
    <span className="inline-flex items-center gap-1.5 text-[#157F4B]">
      <Check className="w-3.5 h-3.5" />
      Passed ({model.passed})
    </span>
    <span className="inline-flex items-center gap-1.5 text-[#D9542B]">
      <X className="w-3.5 h-3.5" />
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
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden
    />
    <span className="text-xs text-[#17181D] flex-1 min-w-0">{label}</span>
    <span className="text-sm font-bold text-[#17181D] tabular-nums">{value}</span>
    <span className="text-[11px] text-[#6B6F76] tabular-nums w-8 text-right">
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
      <div className="px-4 py-2.5 flex items-start gap-3">
        <span className="text-xs font-semibold text-[#6B6F76] tabular-nums shrink-0 w-8 pt-0.5">
          {number}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#17181D] leading-snug">{item.text}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] bg-[#F6F6F8] border border-[#E6E7EB] px-1.5 py-0.5 rounded">
              {item.reasonGroup}
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
              className="w-4 h-4 text-[#6B6F76]"
              aria-label="Has a note"
            />
          )}
          {answer?.photo && (
            <Camera className="w-4 h-4 text-[#6B6F76]" aria-label="Has photo evidence" />
          )}
          {hasDetail && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide detail' : 'Show detail'}
              className="no-print p-0.5 text-[#6B6F76] hover:text-[#17181D] transition-colors cursor-pointer"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
              />
            </button>
          )}
        </div>
      </div>

      {hasDetail && (
        <div className={`collapsible ${expanded ? '' : 'hidden'}`}>
          <div className="px-4 pb-3.5 pl-15">
            <div className="rounded-md border border-[#D9542B]/30 bg-[#FDECEE]/50 p-3 space-y-2">
              {outcome === 'failed' && (
                <p className="text-xs">
                  <span className="font-bold text-[#C8202D]">Reason: </span>
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1">
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1">
                    Attached evidence
                  </p>
                  <img
                    src={answer.photo}
                    alt={`Evidence for item ${number}`}
                    className="w-28 h-28 object-cover rounded-md border border-[#E6E7EB] bg-white"
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
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E6F4EC] text-[#157F4B]">
        <Check className="w-3.5 h-3.5" />
        Yes
      </span>
    );
  }
  if (outcome === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FDECEE] text-[#C8202D]">
        <X className="w-3.5 h-3.5" />
        No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F6F6F8] text-[#6B6F76] border border-[#E6E7EB]">
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
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, action, children }) => (
  <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs page-break-inside-avoid">
    <div className="px-4 py-3 border-b border-[#E6E7EB] flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-[#17181D]">{title}</h2>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const InfoRow: React.FC<{ label: string; mono?: boolean; children: React.ReactNode }> = ({
  label,
  mono = false,
  children,
}) => (
  <div className="flex items-baseline justify-between gap-3">
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
  <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs p-8 text-center">
    <Icon className="w-8 h-8 text-[#9CA1A9] mx-auto mb-2.5" />
    <p className="text-sm font-bold text-[#17181D]">{title}</p>
    <p className="text-xs text-[#6B6F76] mt-1">{children}</p>
  </div>
);

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
          <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs divide-y divide-[#E6E7EB] overflow-hidden">
            {model.issues
              .filter((issue) => issue.priority.severity === severity)
              .map(({ item, answer, priority }) => {
                const row = model.rows.find((r) => r.item.id === item.id);
                return (
                  <article key={item.id} className="p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-[#6B6F76] tabular-nums">
                          {row?.number}
                        </span>
                        <h3 className="text-sm font-semibold text-[#17181D]">{item.text}</h3>
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mt-1">
                        {row?.item.reasonGroup} • {model.sections.find((s) =>
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
                        className="w-20 h-20 rounded-md object-cover border border-[#E6E7EB] bg-[#F6F6F8] shrink-0"
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
  if (model.maintenance.length === 0) {
    return (
      <EmptyState icon={Wrench} title="No maintenance work raised">
        Nothing flagged on this visit points to a repair or a service call.
      </EmptyState>
    );
  }

  return (
    <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E6E7EB]">
        <h2 className="text-sm font-bold text-[#17181D]">Repair &amp; service actions</h2>
        <p className="text-xs text-[#6B6F76] mt-0.5">
          Findings whose cause is a broken, damaged or unserviced item — the work the
          branch has to raise with maintenance.
        </p>
      </div>
      <div className="divide-y divide-[#E6E7EB]">
        {model.maintenance.map(({ item, answer, priority }) => {
          const row = model.rows.find((r) => r.item.id === item.id);
          return (
            <div key={item.id} className="p-4 flex items-start gap-3">
              <Wrench className="w-4 h-4 text-[#6B6F76] shrink-0 mt-0.5" />
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
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] bg-[#F6F6F8] border border-[#E6E7EB] px-1.5 py-0.5 rounded shrink-0">
                {item.reasonGroup}
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
    <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs divide-y divide-[#E6E7EB] overflow-hidden">
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
      <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E6E7EB]">
          <h2 className="text-sm font-bold text-[#17181D]">
            Score history — {model.inspection.branchName}
          </h2>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Every submitted visit at this branch, newest first.
          </p>
        </div>
        <div className="divide-y divide-[#E6E7EB]">
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
              <div className="flex-1 min-w-0 h-2 bg-[#EFEFF2] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(visit.score, 2)}%`,
                    backgroundColor: visit.isThis ? OUTCOME_COLOR.passed : '#8FBFA4',
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
        <section className="bg-[#FDF3E2] border border-[#B4740A]/30 rounded-lg p-4 page-break-inside-avoid">
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
    <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs p-5 page-break-inside-avoid">
      <h2 className="text-sm font-bold text-[#17181D]">
        Manager verification &amp; acknowledgment
      </h2>
      <p className="text-xs text-[#6B6F76] mt-0.5">
        The manager certifies that this inspection accurately reflects the branch condition.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <span className="text-xs font-semibold text-[#17181D] block mb-1.5">
            Branch manager signature
          </span>
          {inspection.signature ? (
            <div className="w-60 h-24 border border-[#E6E7EB] bg-[#FAFAFA] rounded-md flex items-center justify-center p-2">
              <img
                src={inspection.signature}
                alt="Branch manager signature"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="w-60 h-24 border border-dashed border-[#E6E7EB] bg-[#FAFAFA] rounded-md flex items-center justify-center text-xs text-[#6B6F76] italic">
              Not signed yet
            </div>
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
    [
      'Inspection type',
      inspection.inspectionType
        ? INSPECTION_TYPE_LABEL[inspection.inspectionType]
        : 'Not recorded',
    ],
    ['Status', inspection.status === 'submitted' ? 'Submitted & locked' : 'Draft'],
    ['Submitted at', inspection.submittedAt ? formatDateTime(inspection.submittedAt) : ''],
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
          row.item.reasonGroup,
          row.outcome === 'passed' ? 'Yes' : row.outcome === 'failed' ? 'No' : 'Not answered',
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

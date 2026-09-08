'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  Edit3,
  FileText,
  History,
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
import { useRouter } from 'next/navigation';

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
      <div className="p-8 max-w-xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#17181D]">Summary not found</h2>
        <p className="text-sm text-[#6B6F76] mt-2">
          The requested inspection does not exist or has been removed.
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

  const unanswered = model.rows.filter((row) => row.outcome === 'unanswered');
  // Weakest categories first — where the branch needs attention
  const byCategory = [...model.sections].sort((a, b) => a.rate - b.rate);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to records</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#C8202D]" />
            <span>Edit answers</span>
          </button>
          <button
            id="summary-full-report-btn"
            type="button"
            onClick={() => router.push(`/inspections/${inspection.id}`)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <FileText className="w-4 h-4" />
            <span>Full report / print</span>
          </button>
        </div>
      </div>

      {/* Heading */}
      <div className="mb-6 pb-4 border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6F76]">
            Inspection summary
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#17181D] mt-1">
            {inspection.branchName}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-[#6B6F76]">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(inspection.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {inspection.time}
            </span>
            <span className="capitalize font-semibold text-[#157F4B]">{inspection.status}</span>
            <span>{FULL_CHECKLIST_LABEL}</span>
            {inspection.inspectorName && <span>Inspector: {inspection.inspectorName}</span>}
          </div>
        </div>
        <ScorePill score={model.score} size="lg" showLabel />
      </div>

      {/* Same drift warning the full report carries, so the two never disagree */}
      {(model.missingCount > 0 || model.scoreMismatch) && (
        <div className="mb-6 p-4 rounded-md bg-[#FDF3E2] border border-[#B4740A]/30 flex items-start gap-3">
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

      {/* At a glance */}
      <section id="summary-at-a-glance" className="mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
          At a glance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Checked" value={model.total} />
          <Stat label="Passed" value={model.passed} tone="good" />
          <Stat
            label="Flagged"
            value={model.issues.length}
            tone={model.issues.length ? 'bad' : 'muted'}
          />
          <Stat
            label="Repeat issues"
            value={model.repeats.length}
            tone={model.repeats.length ? 'warn' : 'muted'}
          />
        </div>
        {unanswered.length > 0 && (
          <p className="mt-2.5 text-xs font-semibold text-[#B4740A]">
            {unanswered.length} item{unanswered.length === 1 ? '' : 's'} left unanswered:{' '}
            {unanswered.map((row) => row.number).join(', ')}
          </p>
        )}
      </section>

      {/* Priority breakdown */}
      <section id="summary-priorities" className="mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
          Priorities
        </h2>
        <div className="bg-white border border-[#E6E7EB] rounded-md p-4 shadow-xs flex flex-wrap gap-2">
          {SEVERITY_ORDER.map((severity) => (
            <span
              key={severity}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold ${
                model.severityCounts[severity] === 0
                  ? 'border-[#E6E7EB] bg-[#FAFAFA] text-[#6B6F76]/60'
                  : 'border-[#E6E7EB] bg-white text-[#17181D]'
              }`}
            >
              <PriorityBadge severity={severity} size="sm" />
              <span className="tabular-nums">{model.severityCounts[severity]}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Issues, one block per priority */}
      <section id="summary-issues" className="mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
          Issues
        </h2>

        {model.issues.length === 0 ? (
          <div className="p-6 bg-[#E6F4EC]/60 border border-[#157F4B]/20 rounded-md text-center">
            <CheckCircle className="w-8 h-8 text-[#157F4B] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#157F4B]">Every item passed</p>
            <p className="text-xs text-[#157F4B]/80 mt-1">Nothing was flagged on this visit.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {SEVERITY_ORDER.filter((s) => model.severityCounts[s] > 0).map((severity) => (
              <div key={severity}>
                <div className="flex items-center gap-2 mb-2">
                  <PriorityBadge severity={severity} />
                  <span className="text-xs font-bold text-[#6B6F76] tabular-nums">
                    {model.severityCounts[severity]} issue
                    {model.severityCounts[severity] === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="border border-[#E6E7EB] rounded-md divide-y divide-[#E6E7EB] overflow-hidden bg-white">
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
                          className={`p-3.5 flex items-start gap-3 ${
                            severity === 'critical' ? 'bg-[#FDECEE]/40' : ''
                          }`}
                        >
                          <span className="text-xs font-bold text-[#6B6F76] w-8 shrink-0 pt-0.5 tabular-nums">
                            {row?.number}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#17181D]">{item.text}</p>
                            {section && (
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mt-0.5">
                                {section.listLabel} • {section.title}
                              </p>
                            )}
                            <p className="text-xs text-[#6B6F76] mt-1.5">
                              <span className="font-semibold text-[#C8202D]">Reason: </span>
                              {reasonText(answer)}
                            </p>
                            {answer.note && (
                              <p className="text-xs text-[#6B6F76] mt-0.5">
                                <span className="font-semibold text-[#17181D]">Note: </span>
                                {answer.note}
                              </p>
                            )}
                            {priority.repeatCount > 0 && (
                              <p className="text-xs font-semibold text-[#B4740A] mt-1">
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
                              className="w-14 h-14 object-cover rounded-md border border-[#E6E7EB] bg-white shrink-0"
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

      {/* Repeat offenders */}
      {model.repeats.length > 0 && (
        <section id="summary-repeats" className="mb-6">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
            Repeat issues at this branch
          </h2>
          <div className="bg-[#FDF3E2] border border-[#B4740A]/30 rounded-md p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <History className="w-5 h-5 text-[#B4740A] shrink-0 mt-0.5" />
              <ul className="space-y-1.5 flex-1">
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
        </section>
      )}

      {/* Category pass rates */}
      <section id="summary-categories" className="mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
          By category — weakest first
        </h2>
        <div className="bg-white border border-[#E6E7EB] rounded-md divide-y divide-[#E6E7EB] overflow-hidden shadow-xs">
          {byCategory.map((cat) => (
            <div key={`${cat.listKey}::${cat.key}`} className="px-4 py-2.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#17181D] truncate">{cat.title}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
                  {cat.listLabel}
                </p>
              </div>
              <div className="w-24 sm:w-40 h-1.5 bg-[#E6E7EB] rounded-full overflow-hidden shrink-0">
                <div
                  className={`h-full ${
                    cat.rate === 100
                      ? 'bg-[#157F4B]'
                      : cat.rate >= 75
                        ? 'bg-[#B4740A]'
                        : 'bg-[#C8202D]'
                  }`}
                  style={{ width: `${cat.rate}%` }}
                />
              </div>
              <span className="text-xs font-bold text-[#17181D] tabular-nums w-20 text-right shrink-0">
                {cat.passed}/{cat.total} • {cat.rate}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence */}
      {model.photos.length > 0 && (
        <section id="summary-evidence" className="mb-6">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
            Photo evidence ({model.photos.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {model.photos.map((row) => (
              <figure
                key={row.item.id}
                className="bg-white border border-[#E6E7EB] rounded-md overflow-hidden shadow-xs"
              >
                <img
                  src={row.answer!.photo as string}
                  alt={`Evidence for item ${row.number}`}
                  className="w-full h-28 object-cover bg-[#F6F6F8]"
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
      <section id="summary-signoff">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
          Manager sign-off
        </h2>
        <div className="bg-white border border-[#E6E7EB] rounded-md p-4 shadow-xs flex flex-wrap items-center gap-6">
          {inspection.signature ? (
            <div className="w-56 h-20 border border-[#E6E7EB] bg-[#FAFAFA] rounded-md flex items-center justify-center p-2">
              <img
                src={inspection.signature}
                alt="Branch manager signature"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="w-56 h-20 border border-dashed border-[#E6E7EB] bg-[#FAFAFA] rounded-md flex items-center justify-center text-xs text-[#6B6F76] italic">
              Not signed yet
            </div>
          )}
          <div className="text-xs text-[#6B6F76] space-y-1">
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

const Stat: React.FC<{
  label: string;
  value: number;
  tone?: 'good' | 'bad' | 'warn' | 'muted';
}> = ({ label, value, tone = 'muted' }) => {
  const color =
    tone === 'good'
      ? 'text-[#157F4B]'
      : tone === 'bad'
        ? 'text-[#C8202D]'
        : tone === 'warn'
          ? 'text-[#B4740A]'
          : 'text-[#17181D]';
  return (
    <div className="bg-white border border-[#E6E7EB] rounded-md p-3.5 shadow-xs">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
    </div>
  );
};

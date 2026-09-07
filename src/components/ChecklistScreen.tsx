'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  X,
  Trash2,
  CheckCircle2,
  FileCheck,
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import { Answer, Inspection, Item, REASON_GROUPS, SEVERITY_KEYS, Severity } from '../types';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { buildSections, numberingFor } from '../services/checklistStore';
import { useChecklist } from '../hooks/useChecklist';
import {
  getInspectionById,
  getInspections,
  saveActiveDraft,
  saveInspection,
} from '../services/storage';
import {
  EMPTY_HISTORY,
  buildFailureHistory,
  computePriority,
  requiresPhoto,
  SEVERITY_LABEL,
} from '../services/priority';
import { PriorityBadge } from './PriorityBadge';
import { useRouter } from 'next/navigation';

interface ChecklistScreenProps {
  inspectionId: string;
}

export const ChecklistScreen: React.FC<ChecklistScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const checklist = useChecklist();
  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidItemIds, setInvalidItemIds] = useState<Set<number>>(new Set());

  // Ref map for scrolling to the first invalid row
  const itemRowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!inspection) {
      const found = getInspectionById(inspectionId);
      if (found) setInspection(found);
    }
  }, [inspectionId, inspection]);

  // Past failures at this branch, so repeat issues get escalated. Depends only
  // on which inspection this is, not on the answers being edited right now.
  const branchName = inspection?.branchName;
  const inspectionDate = inspection?.date;
  const failureHistory = useMemo(
    () =>
      branchName && inspectionDate
        ? buildFailureHistory(getInspections(), branchName, {
            id: inspectionId,
            date: inspectionDate,
          })
        : EMPTY_HISTORY,
    [inspectionId, branchName, inspectionDate]
  );

  if (!inspection) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#242217]">Inspection not found</h2>
        <p className="text-sm text-[#635E4F] mt-2">
          The requested inspection checklist could not be loaded.
        </p>
        <button
          onClick={() => router.push('/inspections')}
          className="mt-4 px-4 py-2 bg-[#2F5233] text-white text-sm font-medium rounded-[6px]"
        >
          Return to records
        </button>
      </div>
    );
  }

  // A submitted record walks the items it actually covered, so re-opening an
  // old inspection shows what was inspected then rather than the current list.
  const frozenIds = inspection.itemIds;
  const sections =
    frozenIds && frozenIds.length > 0
      ? buildSections(checklist.doc, true)
          .map((s) => ({ ...s, items: s.items.filter((i) => frozenIds.includes(i.id)) }))
          .filter((s) => s.items.length > 0)
      : checklist.sections;

  const totalSections = sections.length;

  if (totalSections === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#242217]">The checklist is empty</h2>
        <p className="text-sm text-[#635E4F] mt-2">
          Add at least one category with a question before running an inspection.
        </p>
        <button
          onClick={() => router.push('/checklist')}
          className="mt-4 px-4 py-2 bg-[#2F5233] text-white text-sm font-medium rounded-md cursor-pointer"
        >
          Edit checklist
        </button>
      </div>
    );
  }

  const allItems = sections.flatMap((s) => s.items);
  const numberOf = numberingFor(allItems.map((i) => i.id));
  const totalItems = allItems.length;

  const isAnswered = (id: number) => {
    const status = inspection.answers[id]?.status;
    return status === 'yes' || status === 'no';
  };

  const answeredInSection = (idx: number) =>
    sections[idx].items.filter((item) => isAnswered(item.id)).length;

  const answeredTotal = allItems.filter((item) => isAnswered(item.id)).length;

  // Immediate save on change helper
  const updateAnswers = (newAnswers: Record<number, Answer>) => {
    const updatedInspection: Inspection = {
      ...inspection,
      answers: newAnswers,
    };
    setInspection(updatedInspection);
    // Only a draft belongs in the draft slot. Writing a submitted record there
    // left a stale copy that getInspectionById would then prefer over the real
    // one, and made a finished inspection look like work in progress.
    if (updatedInspection.status === 'draft') {
      saveActiveDraft(updatedInspection);
    }
    saveInspection(updatedInspection);
  };

  // Drop an item's error highlight once its answer satisfies every rule the
  // submit gate checks — reason, "Other" text, and a photo when critical.
  const clearInvalidIfResolved = (itemId: number, answer: Answer) => {
    if (!invalidItemIds.has(itemId)) return;

    if (answer.status === 'no') {
      if (!answer.reason || answer.reason.trim() === '') return;
      if (answer.reason === 'Other' && (!answer.otherReason || answer.otherReason.trim() === '')) {
        return;
      }
      const item = checklist.getItem(itemId);
      if (
        item &&
        requiresPhoto(computePriority(item, answer, failureHistory).severity) &&
        !answer.photo
      ) {
        return;
      }
    }

    const nextInvalid = new Set(invalidItemIds);
    nextInvalid.delete(itemId);
    setInvalidItemIds(nextInvalid);
    if (nextInvalid.size === 0) setValidationError(null);
  };

  // Toggle Yes handler - clicking Yes marks as Yes; clicking Yes a second time converts to No with reason and photo options
  const handleSelectYes = (itemId: number) => {
    const current = inspection.answers[itemId];

    // If ALREADY marked 'yes', clicking Yes a second time converts it to 'no' with reason and upload photo option!
    if (current?.status === 'yes') {
      handleSelectNo(itemId);
      return;
    }

    // Otherwise mark as 'yes' and clear non-compliance details
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: {
        status: 'yes',
        reason: null,
        otherReason: null,
        note: null,
        photo: null,
      },
    };

    // Remove from invalid items if present
    if (invalidItemIds.has(itemId)) {
      const nextInvalid = new Set(invalidItemIds);
      nextInvalid.delete(itemId);
      setInvalidItemIds(nextInvalid);
      if (nextInvalid.size === 0) setValidationError(null);
    }

    updateAnswers(updatedAnswers);
  };

  // Toggle No handler - converts to No and reveals reason + photo upload options; clicking No when already No toggles back to Yes
  const handleSelectNo = (itemId: number) => {
    const existing = inspection.answers[itemId];

    // If already marked 'no', clicking No again toggles back to 'yes'
    if (existing?.status === 'no') {
      const updatedAnswers: Record<number, Answer> = {
        ...inspection.answers,
        [itemId]: {
          status: 'yes',
          reason: null,
          otherReason: null,
          note: null,
          photo: null,
        },
      };

      if (invalidItemIds.has(itemId)) {
        const nextInvalid = new Set(invalidItemIds);
        nextInvalid.delete(itemId);
        setInvalidItemIds(nextInvalid);
        if (nextInvalid.size === 0) setValidationError(null);
      }

      updateAnswers(updatedAnswers);
      return;
    }

    // Set to 'no' with required reason dropdown and photo upload option
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: {
        status: 'no',
        reason: existing?.reason || null,
        otherReason: existing?.otherReason || null,
        note: existing?.note || null,
        photo: existing?.photo || null,
      },
    };

    updateAnswers(updatedAnswers);
  };

  // Helper to attach a sample evidence photo for quick verification
  const handleUseSamplePhoto = (itemId: number) => {
    const sampleSvg =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23F4E4DF"/><rect x="12" y="12" width="276" height="176" rx="6" fill="%23FFFFFF" stroke="%239C3B2E" stroke-width="2" stroke-dasharray="4,4"/><circle cx="150" cy="70" r="22" fill="%23F4E4DF" stroke="%239C3B2E" stroke-width="2"/><path d="M142 70l16 0M150 62l0 16" stroke="%239C3B2E" stroke-width="2" stroke-linecap="round"/><text x="150" y="125" fill="%239C3B2E" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Photo Evidence Attached</text><text x="150" y="148" fill="%23635E4F" font-family="sans-serif" font-size="11" text-anchor="middle">Item ' +
      numberOf(itemId) +
      ' non-compliance capture</text></svg>';

    const current = inspection.answers[itemId] || {
      status: 'no',
      reason: null,
      otherReason: null,
      note: null,
      photo: null,
    };
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: {
        ...current,
        photo: sampleSvg,
      },
    };
    clearInvalidIfResolved(itemId, updatedAnswers[itemId]);
    updateAnswers(updatedAnswers);
  };

  // Update reason for No
  const handleReasonChange = (itemId: number, reason: string) => {
    const current = inspection.answers[itemId] || { status: 'no', reason: null, otherReason: null, note: null, photo: null };
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: {
        ...current,
        status: 'no',
        reason: reason || null,
        // Reset otherReason if changed away from Other
        otherReason: reason === 'Other' ? current.otherReason : null,
      },
    };

    clearInvalidIfResolved(itemId, updatedAnswers[itemId]);

    updateAnswers(updatedAnswers);
  };

  // Update specify / otherReason
  const handleOtherReasonChange = (itemId: number, otherText: string) => {
    const current = inspection.answers[itemId] || { status: 'no', reason: 'Other', otherReason: null, note: null, photo: null };
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: {
        ...current,
        otherReason: otherText,
      },
    };

    clearInvalidIfResolved(itemId, updatedAnswers[itemId]);

    updateAnswers(updatedAnswers);
  };

  // Set or clear a hand-picked priority for one issue. Clearing hands the
  // decision back to the rules.
  const handlePriorityOverride = (itemId: number, severity: Severity | null) => {
    const current = inspection.answers[itemId];
    if (!current) return;
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: { ...current, priorityOverride: severity },
    };
    clearInvalidIfResolved(itemId, updatedAnswers[itemId]);
    updateAnswers(updatedAnswers);
  };

  // Update additional note
  const handleNoteChange = (itemId: number, noteText: string) => {
    const current = inspection.answers[itemId] || { status: 'no', reason: null, otherReason: null, note: null, photo: null };
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: {
        ...current,
        note: noteText || null,
      },
    };
    updateAnswers(updatedAnswers);
  };

  // Upload photo
  const handlePhotoUpload = (itemId: number, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const current = inspection.answers[itemId] || { status: 'no', reason: null, otherReason: null, note: null, photo: null };
      const updatedAnswers: Record<number, Answer> = {
        ...inspection.answers,
        [itemId]: {
          ...current,
          photo: dataUrl,
        },
      };
      clearInvalidIfResolved(itemId, updatedAnswers[itemId]);
      updateAnswers(updatedAnswers);
    };
    reader.readAsDataURL(file);
  };

  // Remove photo
  const handleRemovePhoto = (itemId: number) => {
    const current = inspection.answers[itemId];
    if (!current) return;
    const updatedAnswers: Record<number, Answer> = {
      ...inspection.answers,
      [itemId]: {
        ...current,
        photo: null,
      },
    };
    updateAnswers(updatedAnswers);
  };

  // Validation function for current section
  const validateAll = (): {
    isValid: boolean;
    offendingIds: number[];
    message: string;
  } => {
    const offendingIds: number[] = [];
    let needsAnswerOrReason = false;
    let needsCriticalPhoto = false;

    allItems.forEach((item) => {
      const answer = inspection.answers[item.id];
      // Untouched / unanswered item
      if (!answer || (answer.status !== 'yes' && answer.status !== 'no')) {
        offendingIds.push(item.id);
        needsAnswerOrReason = true;
        return;
      }
      // Marked No but missing required reason
      if (answer.status === 'no') {
        if (!answer.reason || answer.reason.trim() === '') {
          offendingIds.push(item.id);
          needsAnswerOrReason = true;
          return;
        }
        // Selected Other but empty specify field
        if (answer.reason === 'Other' && (!answer.otherReason || answer.otherReason.trim() === '')) {
          offendingIds.push(item.id);
          needsAnswerOrReason = true;
          return;
        }
        // Critical issues have to carry photo evidence
        const { severity } = computePriority(item, answer, failureHistory);
        if (requiresPhoto(severity) && !answer.photo) {
          offendingIds.push(item.id);
          needsCriticalPhoto = true;
          return;
        }
      }
    });

    const parts: string[] = [];
    if (needsAnswerOrReason) parts.push('Answer every item, and give a reason for anything marked No');
    if (needsCriticalPhoto) parts.push('attach a photo to every critical issue');

    return {
      isValid: offendingIds.length === 0,
      offendingIds,
      message: parts.join(' — '),
    };
  };

  // One list, one gate: everything is checked when Review is pressed, and the
  // first thing still needing attention is scrolled to.
  const handleReview = () => {
    const { isValid, offendingIds, message } = validateAll();

    if (!isValid) {
      setValidationError(message);
      setInvalidItemIds(new Set(offendingIds));

      const el = itemRowRefs.current[offendingIds[0]];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setValidationError(null);
    setInvalidItemIds(new Set());
    router.push(`/inspections/${inspectionId}/review`);
  };

  const progressPercentage = Math.round((answeredTotal / totalItems) * 100);
  const remaining = totalItems - answeredTotal;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      {/* Top Breadcrumb & Metadata Line */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#635E4F] hover:text-[#242217] transition cursor-pointer mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit inspection (draft saved automatically)</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 border-b border-[#DEDACB] pb-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#242217]">
              {inspection.branchName}
            </h1>
            <p className="text-xs text-[#635E4F] mt-0.5 font-medium">
              {FULL_CHECKLIST_LABEL} • {inspection.date} ({inspection.time})
            </p>
          </div>
          <span className="text-xs text-[#635E4F] self-start sm:self-auto whitespace-nowrap">
            {totalItems} items
          </span>
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div
          id="checklist-validation-banner"
          className="mb-4 p-4 rounded-md bg-[#F4E4DF] border border-[#9C3B2E]/40 text-[#9C3B2E] flex items-center gap-3 shadow-xs"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">{validationError}</span>
        </div>
      )}

      {/* Quick guide hint */}
      <div className="mb-5 px-3.5 py-2 bg-[#F9F8F4] border border-[#DEDACB] rounded-md text-xs text-[#635E4F]">
        Tap <strong className="text-[#242217]">Yes</strong> or <strong className="text-[#242217]">No</strong> on
        every line. Marking <strong className="text-[#242217]">No</strong> opens a reason box. Your
        answers save as you go.
      </div>

      {/* One scrolling list, headed by category. Padded at the foot so the
          sticky bar below never covers the last row. */}
      <div className="space-y-6 pb-28">
        {sections.map((section, sectionIdx) => {
          const answered = answeredInSection(sectionIdx);
          const total = section.items.length;
          const done = answered === total;
          const startsNewList =
            sectionIdx === 0 || sections[sectionIdx - 1].listKey !== section.listKey;

          return (
            <section key={`${section.listKey}-${section.key}`} id={`section-${section.key}`}>
              {startsNewList && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#635E4F] mb-2">
                  {section.listLabel}
                </p>
              )}

              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-base font-bold text-[#242217]">{section.title}</h2>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold tabular-nums shrink-0 ${
                    done ? 'text-[#2F5233]' : 'text-[#635E4F]'
                  }`}
                >
                  {done && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {answered}/{total}
                </span>
              </div>

              <div className="bg-white border border-[#DEDACB] rounded-md divide-y divide-[#DEDACB] overflow-hidden shadow-xs">
                {section.items.map((item: Item) => {
          const answer = inspection.answers[item.id];
          const status = answer?.status;
          const isInvalid = invalidItemIds.has(item.id);
          const isYes = status === 'yes';
          const isNo = status === 'no';
          const reasonGroup = item.reasonGroup;
          const reasonsList = REASON_GROUPS[reasonGroup] || [];
          const priority = isNo ? computePriority(item, answer, failureHistory) : null;
          const needsPhoto = !!priority && requiresPhoto(priority.severity) && !answer?.photo;

          return (
            <div
              key={item.id}
              ref={(el) => {
                itemRowRefs.current[item.id] = el;
              }}
              id={`checklist-item-${item.id}`}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('button, input, select, textarea, label, a')) return;
                if (!status) {
                  handleSelectYes(item.id);
                }
              }}
              className={`p-4 md:p-5 transition-colors ${
                !status ? 'cursor-pointer hover:bg-[#F9F8F4]' : ''
              } ${
                isInvalid ? 'border-l-4 border-l-[#9C3B2E] bg-[#F4E4DF]/15' : ''
              }`}
            >
              {/* Row: Item number, text, and toggle buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-xs font-bold text-[#635E4F] bg-[#F5F3EC] min-w-6 h-6 px-1 rounded flex items-center justify-center shrink-0 mt-0.5 border border-[#DEDACB] tabular-nums">
                    {numberOf(item.id)}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm md:text-base font-semibold text-[#242217] leading-snug">
                      {item.text}
                    </p>
                    {priority && (
                      <div className="mt-1">
                        <PriorityBadge
                          severity={priority.severity}
                          size="sm"
                          escalated={priority.severity !== priority.base}
                          title={priority.factors.join(' • ')}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Yes / No Toggle Button Pair */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {/* YES Button */}
                  <button
                    type="button"
                    id={`item-${item.id}-yes-btn`}
                    onClick={() => handleSelectYes(item.id)}
                    title={isYes ? 'Click again to convert to No with reason and photo options' : 'Mark compliant (Yes)'}
                    className={`min-w-[80px] h-10 px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                      isYes
                        ? 'bg-[#2F5233] text-white shadow-xs'
                        : 'bg-white text-[#242217] border border-[#DEDACB] hover:bg-[#F5F3EC]'
                    }`}
                    aria-pressed={isYes}
                  >
                    <Check className={`w-3.5 h-3.5 ${isYes ? 'text-white' : 'text-[#2F5233]'}`} />
                    <span>Yes</span>
                  </button>

                  {/* NO Button */}
                  <button
                    type="button"
                    id={`item-${item.id}-no-btn`}
                    onClick={() => handleSelectNo(item.id)}
                    title={isNo ? 'Click to toggle back to Yes' : 'Mark non-compliant (No)'}
                    className={`min-w-[80px] h-10 px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                      isNo
                        ? 'bg-[#9C3B2E] text-white shadow-xs'
                        : 'bg-white text-[#242217] border border-[#DEDACB] hover:bg-[#F5F3EC]'
                    }`}
                    aria-pressed={isNo}
                  >
                    <X className={`w-3.5 h-3.5 ${isNo ? 'text-white' : 'text-[#9C3B2E]'}`} />
                    <span>No</span>
                  </button>
                </div>
              </div>

              {/* Expandable panel when marked NO */}
              {isNo && (
                <div
                  id={`item-${item.id}-reason-panel`}
                  className="mt-4 pt-4 border-t border-[#DEDACB] bg-[#F9F8F4] p-4 rounded-md border border-[#DEDACB] space-y-4"
                >
                  {/* 0. Priority, and how it was reached */}
                  {priority && (
                    <div
                      id={`item-${item.id}-priority`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-3.5 border-b border-[#DEDACB]"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#242217]">
                        Priority
                      </span>
                      <PriorityBadge
                        severity={priority.severity}
                        escalated={priority.severity !== priority.base}
                      />
                      {/* Rules decide by default; an inspector can overrule */}
                      <select
                        id={`item-${item.id}-priority-select`}
                        aria-label="Override the priority for this issue"
                        value={answer?.priorityOverride ?? ''}
                        onChange={(e) =>
                          handlePriorityOverride(
                            item.id,
                            e.target.value ? (e.target.value as Severity) : null
                          )
                        }
                        className="px-2 py-1 bg-white border border-[#DEDACB] rounded-md text-xs text-[#242217] focus:outline-none focus:ring-1 focus:ring-[#2F5233] cursor-pointer"
                      >
                        <option value="">Auto ({SEVERITY_LABEL[priority.computed]})</option>
                        {SEVERITY_KEYS.map((s) => (
                          <option key={s} value={s}>
                            {SEVERITY_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-[#635E4F] basis-full sm:basis-auto">
                        {priority.factors.join(' · ')}
                      </span>
                    </div>
                  )}

                  {/* 1. Required Reason dropdown */}
                  <div>
                    <label
                      htmlFor={`item-${item.id}-reason-select`}
                      className="block text-[10px] font-bold uppercase tracking-wider text-[#242217] mb-1.5"
                    >
                      Reason <span className="text-[#9C3B2E]">*</span>
                    </label>
                    <select
                      id={`item-${item.id}-reason-select`}
                      value={answer?.reason || ''}
                      onChange={(e) => handleReasonChange(item.id, e.target.value)}
                      className={`w-full px-3 py-2 bg-white border rounded-md text-sm text-[#242217] focus:outline-none focus:ring-1 ${
                        isInvalid && (!answer?.reason || answer.reason.trim() === '')
                          ? 'border-[#9C3B2E] focus:border-[#9C3B2E] focus:ring-[#9C3B2E]'
                          : 'border-[#DEDACB] focus:border-[#2F5233] focus:ring-[#2F5233]'
                      }`}
                      required
                    >
                      <option value="">Select a reason</option>
                      {reasonsList.map((r, idx) => (
                        <option key={idx} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Required free-text field when reason is 'Other' */}
                  {answer?.reason === 'Other' && (
                    <div>
                      <label
                        htmlFor={`item-${item.id}-other-input`}
                        className="block text-[10px] font-bold uppercase tracking-wider text-[#242217] mb-1.5"
                      >
                        Please specify <span className="text-[#9C3B2E]">*</span>
                      </label>
                      <input
                        id={`item-${item.id}-other-input`}
                        type="text"
                        value={answer?.otherReason || ''}
                        onChange={(e) => handleOtherReasonChange(item.id, e.target.value)}
                        placeholder="Detail the specific reason..."
                        className={`w-full px-3 py-2 bg-white border rounded-md text-sm text-[#242217] placeholder:text-[#635E4F]/50 focus:outline-none focus:ring-1 ${
                          isInvalid && (!answer?.otherReason || answer.otherReason.trim() === '')
                            ? 'border-[#9C3B2E] focus:border-[#9C3B2E] focus:ring-[#9C3B2E]'
                            : 'border-[#DEDACB] focus:border-[#2F5233] focus:ring-[#2F5233]'
                        }`}
                        required
                      />
                    </div>
                  )}

                  {/* 3. Optional textarea labeled "Additional notes" */}
                  <div>
                    <label
                      htmlFor={`item-${item.id}-notes-input`}
                      className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5"
                    >
                      Additional notes <span className="text-[#635E4F]/70 font-normal">(optional)</span>
                    </label>
                    <textarea
                      id={`item-${item.id}-notes-input`}
                      rows={2}
                      value={answer?.note || ''}
                      onChange={(e) => handleNoteChange(item.id, e.target.value)}
                      placeholder="Add any context or instructions..."
                      className="w-full px-3 py-2 bg-white border border-[#DEDACB] rounded-md text-sm text-[#242217] placeholder:text-[#635E4F]/50 focus:outline-none focus:border-[#2F5233] focus:ring-1 focus:ring-[#2F5233]"
                    />
                  </div>

                  {/* 4. Optional "Add photo" button with thumbnail */}
                  <div>
                    <label
                      className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                        needsPhoto ? 'text-[#9C3B2E]' : 'text-[#635E4F]'
                      }`}
                    >
                      Photo evidence{' '}
                      {priority && requiresPhoto(priority.severity) ? (
                        <span className="text-[#9C3B2E]">* required for critical issues</span>
                      ) : (
                        <span className="text-[#635E4F]/70 font-normal">(optional)</span>
                      )}
                    </label>

                    {answer?.photo ? (
                      <div className="flex items-center gap-4 bg-white p-2.5 rounded-md border border-[#DEDACB] max-w-sm">
                        <img
                          src={answer.photo}
                          alt={`Evidence for item ${item.id}`}
                          className="w-16 h-16 object-cover rounded border border-[#DEDACB]"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-[#242217]">Photo attached</p>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(item.id)}
                            className="mt-1 text-xs text-[#9C3B2E] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove photo</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <label
                          htmlFor={`item-${item.id}-photo-upload`}
                          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#F5F3EC] border border-[#DEDACB] text-xs font-semibold text-[#242217] rounded-md cursor-pointer transition-colors"
                        >
                          <Camera className="w-4 h-4 text-[#635E4F]" />
                          <span>Upload photo</span>
                          <input
                            id={`item-${item.id}-photo-upload`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onClick={(e) => {
                              (e.target as HTMLInputElement).value = '';
                            }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoUpload(item.id, file);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleUseSamplePhoto(item.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F9F8F4] hover:bg-[#F0EEE6] border border-[#DEDACB] text-xs font-semibold text-[#635E4F] rounded-md transition-colors cursor-pointer"
                          title="Attach sample evidence image for quick verification"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-[#635E4F]" />
                          <span>Use sample photo</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Progress and submit, always in reach while scrolling */}
      <div
        id="checklist-action-bar"
        className="sticky bottom-0 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-[#F5F3EC]/95 backdrop-blur border-t border-[#DEDACB]"
      >
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline text-xs mb-1.5">
              <span className="font-semibold text-[#242217]">
                {answeredTotal} of {totalItems} answered
              </span>
              <span className="text-[#635E4F]">
                {remaining === 0 ? 'All done' : `${remaining} left`}
              </span>
            </div>
            <div className="w-full bg-[#DEDACB] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#2F5233] h-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            id="checklist-review-btn"
            onClick={handleReview}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-xs font-semibold bg-[#2F5233] text-white hover:bg-[#3d6a42] transition-colors shadow-xs cursor-pointer select-none shrink-0"
          >
            <span>Review and submit</span>
            <FileCheck className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

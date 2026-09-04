'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  X,
  Trash2,
  CheckCircle2,
  FileCheck,
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import { Answer, Inspection, Item, ReasonGroup, REASON_GROUPS } from '../types';
import { TEMPLATES } from '../data/templates';
import { getInspectionById, saveActiveDraft, saveInspection } from '../services/storage';
import { useRouter } from 'next/navigation';

interface ChecklistScreenProps {
  inspectionId: string;
}

export const ChecklistScreen: React.FC<ChecklistScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );
  const [sectionIndex, setSectionIndex] = useState<number>(() => {
    const existing = getInspectionById(inspectionId);
    return existing?.currentSectionIndex ?? 0;
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidItemIds, setInvalidItemIds] = useState<Set<number>>(new Set());

  // Ref map for scrolling to the first invalid row
  const itemRowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!inspection) {
      const found = getInspectionById(inspectionId);
      if (found) {
        setInspection(found);
        if (typeof found.currentSectionIndex === 'number') {
          setSectionIndex(found.currentSectionIndex);
        }
      }
    }
  }, [inspectionId, inspection]);

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

  const template = TEMPLATES[inspection.templateKey];
  const sections = template?.sections || [];
  const currentSection = sections[sectionIndex];
  const totalSections = sections.length;

  // Immediate save on change helper
  const updateAnswers = (newAnswers: Record<number, Answer>) => {
    const updatedInspection: Inspection = {
      ...inspection,
      answers: newAnswers,
      currentSectionIndex: sectionIndex,
    };
    setInspection(updatedInspection);
    saveActiveDraft(updatedInspection);
    saveInspection(updatedInspection);
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
      itemId +
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

    // Check if this item is now valid
    if (invalidItemIds.has(itemId)) {
      if (reason && (reason !== 'Other' || (current.otherReason && current.otherReason.trim().length > 0))) {
        const nextInvalid = new Set(invalidItemIds);
        nextInvalid.delete(itemId);
        setInvalidItemIds(nextInvalid);
        if (nextInvalid.size === 0) setValidationError(null);
      }
    }

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

    if (invalidItemIds.has(itemId) && otherText.trim().length > 0 && current.reason === 'Other') {
      const nextInvalid = new Set(invalidItemIds);
      nextInvalid.delete(itemId);
      setInvalidItemIds(nextInvalid);
      if (nextInvalid.size === 0) setValidationError(null);
    }

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
  const validateCurrentSection = (): { isValid: boolean; offendingIds: number[] } => {
    const offendingIds: number[] = [];

    currentSection.items.forEach((item) => {
      const answer = inspection.answers[item.id];
      // Untouched / unanswered item
      if (!answer || (answer.status !== 'yes' && answer.status !== 'no')) {
        offendingIds.push(item.id);
        return;
      }
      // Marked No but missing required reason
      if (answer.status === 'no') {
        if (!answer.reason || answer.reason.trim() === '') {
          offendingIds.push(item.id);
          return;
        }
        // Selected Other but empty specify field
        if (answer.reason === 'Other' && (!answer.otherReason || answer.otherReason.trim() === '')) {
          offendingIds.push(item.id);
          return;
        }
      }
    });

    return {
      isValid: offendingIds.length === 0,
      offendingIds,
    };
  };

  const handleNextSection = () => {
    const { isValid, offendingIds } = validateCurrentSection();

    if (!isValid) {
      setValidationError('Answer every item, and give a reason for anything marked No');
      setInvalidItemIds(new Set(offendingIds));

      // Scroll to the first offending row
      if (offendingIds.length > 0) {
        const firstId = offendingIds[0];
        const el = itemRowRefs.current[firstId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    // Clear validation
    setValidationError(null);
    setInvalidItemIds(new Set());

    if (sectionIndex < totalSections - 1) {
      const nextIdx = sectionIndex + 1;
      setSectionIndex(nextIdx);
      const updated = { ...inspection, currentSectionIndex: nextIdx };
      setInspection(updated);
      saveActiveDraft(updated);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Last section -> navigate to review screen
      router.push(`/inspections/${inspectionId}/review`);
    }
  };

  const handleBackSection = () => {
    if (sectionIndex > 0) {
      setValidationError(null);
      setInvalidItemIds(new Set());
      const prevIdx = sectionIndex - 1;
      setSectionIndex(prevIdx);
      const updated = { ...inspection, currentSectionIndex: prevIdx };
      setInspection(updated);
      saveActiveDraft(updated);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const progressPercentage = Math.round(((sectionIndex + 1) / totalSections) * 100);

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
              {template.label} • {inspection.date} ({inspection.time})
            </p>
          </div>
          <div className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#E7EEE4] text-[#2F5233] self-start sm:self-auto">
            Section {sectionIndex + 1} of {totalSections}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="w-full bg-[#DEDACB] h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-[#2F5233] h-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-xs text-[#635E4F] mt-1.5">
          <span className="font-semibold text-[#242217]">{currentSection?.title}</span>
          <span>
            Step {sectionIndex + 1} of {totalSections} ({progressPercentage}%)
          </span>
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div
          id="checklist-validation-banner"
          className="mb-6 p-4 rounded-md bg-[#F4E4DF] border border-[#9C3B2E]/40 text-[#9C3B2E] flex items-center gap-3 shadow-xs"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">{validationError}</span>
        </div>
      )}

      {/* Quick guide hint */}
      <div className="mb-3 px-3.5 py-2 bg-[#F9F8F4] border border-[#DEDACB] rounded-md flex items-center justify-between text-xs text-[#635E4F]">
        <span>
          💡 <strong className="text-[#242217]">Quick mark:</strong> Click <strong>Yes</strong> to mark compliant. Click <strong>Yes a 2nd time</strong> to convert to <strong>No</strong> with non-compliance reason &amp; photo options.
        </span>
      </div>

      {/* Checklist Items Container */}
      <div className="bg-white border border-[#DEDACB] rounded-md divide-y divide-[#DEDACB] overflow-hidden mb-6 shadow-xs">
        {currentSection?.items.map((item: Item) => {
          const answer = inspection.answers[item.id];
          const status = answer?.status;
          const isInvalid = invalidItemIds.has(item.id);
          const isYes = status === 'yes';
          const isNo = status === 'no';
          const reasonGroup = item.reasonGroup;
          const reasonsList = REASON_GROUPS[reasonGroup] || [];

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
                  <span className="text-xs font-bold text-[#635E4F] bg-[#F5F3EC] w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 border border-[#DEDACB]">
                    {item.id}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm md:text-base font-semibold text-[#242217] leading-snug">
                      {item.text}
                    </p>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] bg-[#F5F3EC] px-2 py-0.5 rounded-full mt-1 border border-[#DEDACB]">
                      {item.reasonGroup}
                    </span>
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
                  {/* 1. Required Reason dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor={`item-${item.id}-reason-select`}
                        className="block text-[10px] font-bold uppercase tracking-wider text-[#242217]"
                      >
                        Reason <span className="text-[#9C3B2E]">*</span>
                      </label>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#635E4F]">
                        Group: {item.reasonGroup}
                      </span>
                    </div>
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
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5">
                      Photo evidence <span className="text-[#635E4F]/70 font-normal">(optional)</span>
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

      {/* Navigation Footer Controls */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          type="button"
          id="checklist-back-btn"
          onClick={handleBackSection}
          disabled={sectionIndex === 0}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-xs font-semibold border transition-colors select-none ${
            sectionIndex === 0
              ? 'border-[#DEDACB] text-[#635E4F]/50 bg-[#F5F3EC] cursor-not-allowed'
              : 'border-[#DEDACB] text-[#242217] bg-white hover:bg-[#F5F3EC] cursor-pointer'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          type="button"
          id="checklist-next-btn"
          onClick={handleNextSection}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-xs font-semibold bg-[#2F5233] text-white hover:bg-[#3d6a42] transition-colors shadow-xs cursor-pointer select-none"
        >
          <span>{sectionIndex === totalSections - 1 ? 'Review and submit' : 'Next section'}</span>
          {sectionIndex === totalSections - 1 ? (
            <FileCheck className="w-4 h-4" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};

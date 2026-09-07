'use client';

import React, { useState } from 'react';
import { PlayCircle, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import {
  BRANCHES,
  INSPECTION_TYPE_KEYS,
  INSPECTION_TYPE_LABEL,
  Inspection,
  InspectionType,
} from '../types';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { useChecklist } from '../hooks/useChecklist';
import {
  clearActiveDraft,
  deleteInspection,
  getActiveDraft,
  saveActiveDraft,
} from '../services/storage';
import { useRouter } from 'next/navigation';
import { formatDate } from '../services/reportModel';

export const NewInspectionScreen: React.FC = () => {
  const router = useRouter();
  const checklist = useChecklist();
  const [existingDraft, setExistingDraft] = useState<Inspection | null>(() => getActiveDraft());
  const [selectedBranch, setSelectedBranch] = useState(BRANCHES[0].name);
  const [inspectorName, setInspectorName] = useState('');
  const [inspectionType, setInspectionType] = useState<InspectionType>('routine');
  const [nameError, setNameError] = useState<string | null>(null);

  // Formatted current date and time
  const now = new Date();
  // Local calendar date, not the UTC one — toISOString() would file a visit
  // started just after midnight under the previous day.
  const currentDateISO = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const currentTimeStr = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const handleStartInspection = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = inspectorName.trim();
    if (!trimmedName) {
      setNameError('Enter the name of the inspector carrying out this visit');
      return;
    }
    setNameError(null);

    if (existingDraft && existingDraft.status === 'draft') {
      const confirmDiscard = window.confirm(
        `Starting a new inspection will replace the existing draft for ${existingDraft.branchName}. Do you want to proceed?`
      );
      if (!confirmDiscard) {
        return;
      }
      deleteInspection(existingDraft.id);
      clearActiveDraft();
    }

    const newId = `insp-${Date.now()}`;
    const newInspection: Inspection = {
      id: newId,
      branchName: selectedBranch,
      date: currentDateISO,
      time: currentTimeStr,
      status: 'draft',
      score: 0,
      signature: null,
      answers: {},
      currentSectionIndex: 0,
      inspectorName: trimmedName,
      inspectionType,
      // The report measures how long the visit took from here
      startedAt: new Date().toISOString(),
    };

    saveActiveDraft(newInspection);
    router.push(`/inspections/${newId}/checklist`);
  };

  const handleResumeDraft = () => {
    if (existingDraft) {
      router.push(`/inspections/${existingDraft.id}/checklist`);
    }
  };

  const handleDiscardDraft = () => {
    if (!existingDraft) return;
    if (window.confirm('Are you sure you want to discard this unfinished draft?')) {
      // Also drop the row the draft left in the records store as it was answered
      deleteInspection(existingDraft.id);
      clearActiveDraft();
      setExistingDraft(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/inspections')}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#635E4F] hover:text-[#242217] mb-6 transition cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to inspection records</span>
      </button>

      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-[#242217]">New inspection</h1>
        <p className="text-xs text-[#635E4F] mt-0.5">
          Pick the branch to begin. Every branch runs the same full checklist.
        </p>
      </div>

      {/* Existing draft warning banner */}
      {existingDraft && existingDraft.status === 'draft' && (
        <div
          id="existing-draft-notice"
          className="mb-6 p-4 rounded-md bg-[#F3ECD8] border border-[#8A6318]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-[#8A6318]/15 text-[#8A6318] rounded-md mt-0.5">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#242217]">
                Unfinished draft exists: {existingDraft.branchName}
              </p>
              <p className="text-xs text-[#635E4F] mt-0.5">
                {FULL_CHECKLIST_LABEL} • Started {formatDate(existingDraft.date)} at{' '}
                {existingDraft.time}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              id="existing-draft-resume-btn"
              type="button"
              onClick={handleResumeDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2F5233] hover:bg-[#3d6a42] text-white rounded-md transition-colors cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
            <button
              id="existing-draft-discard-btn"
              type="button"
              onClick={handleDiscardDraft}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#9C3B2E] border border-[#9C3B2E]/30 rounded-md hover:bg-[#F4E4DF] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          </div>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-white border border-[#DEDACB] rounded-md p-6 md:p-8 shadow-xs">
        <form onSubmit={handleStartInspection} className="space-y-5">
          {/* Branch Dropdown */}
          <div>
            <label
              htmlFor="branch-select"
              className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5"
            >
              Branch
            </label>
            <select
              id="branch-select"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-[#DEDACB] rounded-md text-sm text-[#242217] focus:outline-none focus:ring-1 focus:ring-[#2F5233]"
            >
              {BRANCHES.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Who is carrying out the visit, and why */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="inspector-name-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5"
              >
                Inspector
              </label>
              <input
                id="inspector-name-input"
                type="text"
                value={inspectorName}
                onChange={(e) => {
                  setInspectorName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Name of the inspector"
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'inspector-name-error' : undefined}
                className={`w-full px-3 py-2.5 bg-white border rounded-md text-sm text-[#242217] focus:outline-none focus:ring-1 focus:ring-[#2F5233] ${
                  nameError ? 'border-[#9C3B2E]' : 'border-[#DEDACB]'
                }`}
              />
              {nameError && (
                <p id="inspector-name-error" className="text-xs font-semibold text-[#9C3B2E] mt-1">
                  {nameError}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="inspection-type-select"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5"
              >
                Inspection type
              </label>
              <select
                id="inspection-type-select"
                value={inspectionType}
                onChange={(e) => setInspectionType(e.target.value as InspectionType)}
                className="w-full px-3 py-2.5 bg-white border border-[#DEDACB] rounded-md text-sm text-[#242217] focus:outline-none focus:ring-1 focus:ring-[#2F5233]"
              >
                {INSPECTION_TYPE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {INSPECTION_TYPE_LABEL[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Checklist coverage — every branch runs every list, so there is nothing to pick */}
          <div id="checklist-coverage">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5">
              Checklist
            </span>
            <div className="border border-[#DEDACB] rounded-md bg-[#F9F8F4] px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-[#242217]">{FULL_CHECKLIST_LABEL}</p>
                <p className="text-xs text-[#635E4F] shrink-0">
                  {checklist.sections.length} sections • {checklist.total} items
                </p>
              </div>
              <ul className="mt-2.5 space-y-1">
                {checklist.listGroups.map((group) => {
                  const itemCount = group.sectionIndexes.reduce(
                    (n, idx) => n + checklist.sections[idx].items.length,
                    0
                  );
                  return (
                    <li
                      key={group.key}
                      className="flex items-baseline justify-between gap-3 text-xs text-[#635E4F]"
                    >
                      <span className="font-medium text-[#242217]">{group.label}</span>
                      <span className="shrink-0">{itemCount} items</span>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => router.push('/checklist')}
                className="mt-3 text-xs font-bold text-[#2F5233] hover:underline cursor-pointer"
              >
                Edit checklist
              </button>
            </div>
          </div>

          {/* Read-only Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5">
                Date (read-only)
              </label>
              <input
                id="inspection-date-input"
                type="text"
                value={currentDateISO}
                readOnly
                disabled
                className="w-full px-3 py-2 bg-[#F5F3EC] border border-[#DEDACB] rounded-md text-sm text-[#635E4F] cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5">
                Time (read-only)
              </label>
              <input
                id="inspection-time-input"
                type="text"
                value={currentTimeStr}
                readOnly
                disabled
                className="w-full px-3 py-2 bg-[#F5F3EC] border border-[#DEDACB] rounded-md text-sm text-[#635E4F] cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#DEDACB] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/inspections')}
              className="px-4 py-2 border border-[#DEDACB] rounded-md text-xs font-semibold text-[#635E4F] hover:text-[#242217] hover:bg-[#F5F3EC] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="start-inspection-submit-btn"
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <span>Start inspection</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

'use client';

import React, { useState } from 'react';
import { PlayCircle, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { BRANCHES, Inspection, TemplateKey } from '../types';
import { TEMPLATES } from '../data/templates';
import { getActiveDraft, saveActiveDraft, clearActiveDraft } from '../services/storage';
import { useRouter } from 'next/navigation';

export const NewInspectionScreen: React.FC = () => {
  const router = useRouter();
  const [existingDraft, setExistingDraft] = useState<Inspection | null>(() => getActiveDraft());
  const [selectedBranch, setSelectedBranch] = useState(BRANCHES[0].name);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('kitchen');

  // Formatted current date and time
  const now = new Date();
  const currentDateISO = now.toISOString().split('T')[0];
  const currentTimeStr = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const handleStartInspection = (e: React.FormEvent) => {
    e.preventDefault();

    if (existingDraft && existingDraft.status === 'draft') {
      const confirmDiscard = window.confirm(
        `Starting a new inspection will replace the existing draft for ${existingDraft.branchName}. Do you want to proceed?`
      );
      if (!confirmDiscard) {
        return;
      }
      clearActiveDraft();
    }

    const newId = `insp-${Date.now()}`;
    const newInspection: Inspection = {
      id: newId,
      branchName: selectedBranch,
      templateKey: selectedTemplate,
      date: currentDateISO,
      time: currentTimeStr,
      status: 'draft',
      score: 0,
      signature: null,
      answers: {},
      currentSectionIndex: 0,
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
    if (window.confirm('Are you sure you want to discard this unfinished draft?')) {
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
          Select branch and checklist to begin the weekly inspection.
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
                {TEMPLATES[existingDraft.templateKey]?.label} • Started {existingDraft.date} at{' '}
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

          {/* Checklist Dropdown */}
          <div>
            <label
              htmlFor="template-select"
              className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5"
            >
              Checklist template
            </label>
            <select
              id="template-select"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value as TemplateKey)}
              className="w-full px-3 py-2.5 bg-white border border-[#DEDACB] rounded-md text-sm text-[#242217] focus:outline-none focus:ring-1 focus:ring-[#2F5233]"
            >
              <option value="kitchen">Kitchen hygiene checklist</option>
              <option value="frontofhouse">Front of house checklist</option>
            </select>
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

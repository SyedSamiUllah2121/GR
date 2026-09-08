'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  PlayCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Branch,
  INSPECTION_TYPE_KEYS,
  INSPECTION_TYPE_LABEL,
  INSPECTORS,
  Inspection,
  InspectionType,
} from '../types';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { useChecklist } from '../hooks/useChecklist';
import { useBranches } from '../hooks/useBranches';
import { activeBranches, addBranch, branchUsage, removeBranch } from '../services/branchStore';
import {
  clearActiveDraft,
  deleteInspection,
  getActiveDraft,
  saveActiveDraft,
} from '../services/storage';
import { useRouter } from 'next/navigation';
import { formatDate } from '../services/reportModel';

/** Sentinel for the "not on the list" option. */
const OTHER_INSPECTOR = '__other__';

export const NewInspectionScreen: React.FC = () => {
  const router = useRouter();
  const checklist = useChecklist();
  const branches = activeBranches(useBranches());
  const [existingDraft, setExistingDraft] = useState<Inspection | null>(() => getActiveDraft());
  const [selectedBranch, setSelectedBranch] = useState(() => branches[0]?.name ?? '');

  // Adding a branch without leaving the form you came here to fill in
  const [addingBranch, setAddingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchLocation, setNewBranchLocation] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{
    branch: Branch;
    usage: { inspections: number; jobs: number };
  } | null>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  // Clicking away or pressing Escape closes the branch list
  useEffect(() => {
    if (!branchMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target as Node)) {
        setBranchMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBranchMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [branchMenuOpen]);

  /*
   * Removing asks first, in a dialog rather than a browser confirm, because
   * the two outcomes are not the same thing: a branch nothing refers to is
   * deleted, one with history is closed and its records stay readable. The
   * dialog has to say which of those is about to happen.
   */
  const askToRemove = (branch: Branch) => {
    setBranchMenuOpen(false);
    setPendingRemoval({ branch, usage: branchUsage(branch.name) });
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    const { branch } = pendingRemoval;
    const result = removeBranch(branch.id);
    setPendingRemoval(null);

    if (!result.ok) {
      setBranchError(result.error ?? 'Could not remove the branch');
      return;
    }
    // Only move the selection if what was removed was selected
    if (branch.name === selectedBranch) {
      const left = branches.filter((b) => b.id !== branch.id);
      setSelectedBranch(left[0]?.name ?? '');
    }
    setBranchError(null);
  };

  const handleAddBranch = () => {
    const result = addBranch(newBranchName, newBranchLocation);
    if (!result.ok) {
      setBranchError(result.error ?? 'Could not add the branch');
      return;
    }
    // Select what was just added — it is almost certainly what you wanted
    setSelectedBranch(result.branch!.name);
    setNewBranchName('');
    setNewBranchLocation('');
    setAddingBranch(false);
    setBranchError(null);
  };
  // '' means nothing picked yet; OTHER_INSPECTOR reveals the free-text box
  const [inspectorChoice, setInspectorChoice] = useState('');
  const [otherInspector, setOtherInspector] = useState('');
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

    const trimmedName =
      inspectorChoice === OTHER_INSPECTOR ? otherInspector.trim() : inspectorChoice.trim();
    if (!trimmedName) {
      setNameError(
        inspectorChoice === OTHER_INSPECTOR
          ? 'Enter the name of the inspector carrying out this visit'
          : 'Choose who is carrying out this visit'
      );
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
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B6F76] hover:text-[#17181D] mb-6 transition cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to inspection records</span>
      </button>

      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-[#17181D]">New inspection</h1>
        <p className="text-xs text-[#6B6F76] mt-0.5">
          Pick the branch to begin. Every branch runs the same full checklist.
        </p>
      </div>

      {/* Existing draft warning banner */}
      {existingDraft && existingDraft.status === 'draft' && (
        <div
          id="existing-draft-notice"
          className="mb-6 p-4 rounded-md bg-[#FDF3E2] border border-[#B4740A]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-[#B4740A]/15 text-[#B4740A] rounded-md mt-0.5">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#17181D]">
                Unfinished draft exists: {existingDraft.branchName}
              </p>
              <p className="text-xs text-[#6B6F76] mt-0.5">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#C8202D] hover:bg-[#A81823] text-white rounded-md transition-colors cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
            <button
              id="existing-draft-discard-btn"
              type="button"
              onClick={handleDiscardDraft}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#C8202D] border border-[#C8202D]/30 rounded-md hover:bg-[#FDECEE] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          </div>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-white border border-[#E6E7EB] rounded-md p-6 md:p-8 shadow-xs">
        <form onSubmit={handleStartInspection} className="space-y-5">
          {/* Branch picker. Custom rather than a <select> because each branch
              carries its own remove button, which an <option> cannot hold. */}
          <div ref={branchMenuRef}>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5">
              Branch
            </span>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <button
                  type="button"
                  id="branch-select"
                  onClick={() => setBranchMenuOpen((v) => !v)}
                  aria-expanded={branchMenuOpen}
                  aria-haspopup="listbox"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] text-left hover:border-[#C9CCD2] focus:outline-none focus:ring-1 focus:ring-[#C8202D] focus:border-[#C8202D] transition-colors cursor-pointer"
                >
                  <span className="truncate">{selectedBranch || 'Select a branch'}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#6B6F76] shrink-0 transition-transform ${
                      branchMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {branchMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Branch"
                    className="absolute z-30 top-[calc(100%+0.25rem)] left-0 right-0 bg-white border border-[#E6E7EB] rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto"
                  >
                    {branches.map((b) => {
                      const selected = b.name === selectedBranch;
                      return (
                        <div
                          key={b.id}
                          className={`flex items-stretch border-b border-[#EFEFF2] last:border-b-0 ${
                            selected ? 'bg-[#FDECEE]' : 'hover:bg-[#FAFAFA]'
                          }`}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setSelectedBranch(b.name);
                              setBranchMenuOpen(false);
                            }}
                            className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer"
                          >
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block text-sm truncate ${
                                  selected
                                    ? 'font-bold text-[#C8202D]'
                                    : 'font-medium text-[#17181D]'
                                }`}
                              >
                                {b.name}
                              </span>
                              {b.location && (
                                <span className="block text-[11px] text-[#6B6F76] truncate">
                                  {b.location}
                                </span>
                              )}
                            </span>
                            {selected && <Check className="w-4 h-4 text-[#C8202D] shrink-0" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => askToRemove(b)}
                            disabled={branches.length <= 1}
                            title={
                              branches.length <= 1
                                ? 'Keep at least one branch'
                                : `Remove ${b.name}`
                            }
                            aria-label={`Remove ${b.name}`}
                            className="px-3 flex items-center text-[#C9CCD2] hover:text-[#C8202D] hover:bg-[#FDECEE] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#C9CCD2] transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                id="add-branch-btn"
                onClick={() => {
                  setAddingBranch((v) => !v);
                  setBranchMenuOpen(false);
                  setBranchError(null);
                }}
                aria-expanded={addingBranch}
                title="Add a branch"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-[#C8202D] bg-white border border-[#C8202D]/30 rounded-md hover:bg-[#FDECEE] transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New branch</span>
              </button>
            </div>

            {addingBranch && (
              <div className="mt-2 p-3 rounded-md border border-[#E6E7EB] bg-[#FBFBFC] space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    aria-label="New branch name"
                    placeholder="Branch name"
                    value={newBranchName}
                    onChange={(e) => {
                      setNewBranchName(e.target.value);
                      setBranchError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBranch();
                      }
                      if (e.key === 'Escape') setAddingBranch(false);
                    }}
                    className="flex-1 px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]"
                  />
                  <input
                    aria-label="New branch location"
                    placeholder="Location, e.g. Mafraq, Gujrat"
                    value={newBranchLocation}
                    onChange={(e) => setNewBranchLocation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBranch();
                      }
                      if (e.key === 'Escape') setAddingBranch(false);
                    }}
                    className="flex-1 px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleAddBranch}
                      disabled={!newBranchName.trim()}
                      className="px-3.5 py-2 bg-[#C8202D] hover:bg-[#A81823] disabled:bg-[#E6E7EB] disabled:text-[#6B6F76] disabled:cursor-not-allowed text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingBranch(false)}
                      className="px-3 py-2 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] rounded-md hover:bg-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                {branchError ? (
                  <p className="text-xs font-semibold text-[#C8202D]">{branchError}</p>
                ) : (
                  <p className="text-[11px] text-[#6B6F76]">
                    Added branches are available to every inspection and appear on the dashboard.
                  </p>
                )}
              </div>
            )}

            {!addingBranch && branchError && (
              <p className="mt-2 text-xs font-semibold text-[#C8202D]">{branchError}</p>
            )}
          </div>

          {/* Who is carrying out the visit, and why */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="inspector-name-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5"
              >
                Inspector
              </label>
              <select
                id="inspector-name-input"
                value={inspectorChoice}
                onChange={(e) => {
                  setInspectorChoice(e.target.value);
                  if (nameError) setNameError(null);
                }}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'inspector-name-error' : undefined}
                className={`w-full px-3 py-2.5 bg-white border rounded-md text-sm text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D] ${
                  nameError ? 'border-[#C8202D]' : 'border-[#E6E7EB]'
                }`}
              >
                <option value="">Select inspector…</option>
                {INSPECTORS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={OTHER_INSPECTOR}>Someone else…</option>
              </select>

              {inspectorChoice === OTHER_INSPECTOR && (
                <input
                  id="inspector-other-input"
                  type="text"
                  value={otherInspector}
                  onChange={(e) => {
                    setOtherInspector(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  autoFocus
                  placeholder="Name of the inspector"
                  className={`mt-2 w-full px-3 py-2.5 bg-white border rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:ring-1 focus:ring-[#C8202D] ${
                    nameError ? 'border-[#C8202D]' : 'border-[#E6E7EB]'
                  }`}
                />
              )}
              {nameError && (
                <p id="inspector-name-error" className="text-xs font-semibold text-[#C8202D] mt-1">
                  {nameError}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="inspection-type-select"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5"
              >
                Inspection type
              </label>
              <select
                id="inspection-type-select"
                value={inspectionType}
                onChange={(e) => setInspectionType(e.target.value as InspectionType)}
                className="w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
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
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5">
              Checklist
            </span>
            <div className="border border-[#E6E7EB] rounded-md bg-[#FAFAFA] px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-[#17181D]">{FULL_CHECKLIST_LABEL}</p>
                <p className="text-xs text-[#6B6F76] shrink-0">
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
                      className="flex items-baseline justify-between gap-3 text-xs text-[#6B6F76]"
                    >
                      <span className="font-medium text-[#17181D]">{group.label}</span>
                      <span className="shrink-0">{itemCount} items</span>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => router.push('/checklist')}
                className="mt-3 text-xs font-bold text-[#C8202D] hover:underline cursor-pointer"
              >
                Edit checklist
              </button>
            </div>
          </div>

          {/* Read-only Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5">
                Date (read-only)
              </label>
              <input
                id="inspection-date-input"
                type="text"
                value={currentDateISO}
                readOnly
                disabled
                className="w-full px-3 py-2 bg-[#F6F6F8] border border-[#E6E7EB] rounded-md text-sm text-[#6B6F76] cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5">
                Time (read-only)
              </label>
              <input
                id="inspection-time-input"
                type="text"
                value={currentTimeStr}
                readOnly
                disabled
                className="w-full px-3 py-2 bg-[#F6F6F8] border border-[#E6E7EB] rounded-md text-sm text-[#6B6F76] cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#E6E7EB] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/inspections')}
              className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="start-inspection-submit-btn"
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <span>Start inspection</span>
            </button>
          </div>
        </form>
      </div>

      {pendingRemoval && (
        <RemoveBranchDialog
          branch={pendingRemoval.branch}
          usage={pendingRemoval.usage}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={confirmRemoval}
        />
      )}
    </div>
  );
};

/**
 * Confirms removing a branch, and says which of the two outcomes applies.
 *
 * A branch nothing refers to is deleted; one with inspections or jobs against
 * it is closed, because records name their branch as text and would otherwise
 * be left pointing at nothing.
 */
const RemoveBranchDialog: React.FC<{
  branch: Branch;
  usage: { inspections: number; jobs: number };
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ branch, usage, onCancel, onConfirm }) => {
  const history = [
    usage.inspections > 0
      ? `${usage.inspections} inspection${usage.inspections === 1 ? '' : 's'}`
      : null,
    usage.jobs > 0 ? `${usage.jobs} maintenance job${usage.jobs === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const willClose = history.length > 0;

  // Escape cancels, the same as clicking away from any other dialog here
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-branch-title"
        className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-md my-8"
      >
        <div className="px-6 py-4 border-b border-[#E6E7EB] flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 id="remove-branch-title" className="text-base font-bold text-[#17181D]">
              {willClose ? 'Close this branch?' : 'Delete this branch?'}
            </h3>
            <p className="text-xs text-[#6B6F76] mt-0.5 truncate">{branch.name}</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          {willClose ? (
            <>
              <p className="text-sm text-[#17181D] leading-relaxed">
                It has <span className="font-bold">{history}</span> recorded against it. Those
                stay exactly as they are and remain readable.
              </p>
              <p className="text-sm text-[#6B6F76] leading-relaxed">
                The branch stops being offered for new inspections and drops off the dashboard.
                Adding it again by the same name reopens it.
              </p>
            </>
          ) : (
            <p className="text-sm text-[#17181D] leading-relaxed">
              Nothing has been recorded against it, so it is removed for good.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#E6E7EB] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            id="confirm-remove-branch-btn"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {willClose ? 'Close branch' : 'Delete branch'}
          </button>
        </div>
      </div>
    </div>
  );
};

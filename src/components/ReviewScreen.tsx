'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Eraser,
  Image as ImageIcon,
  PenTool,
} from 'lucide-react';
import { Answer, Inspection, Item } from '../types';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { numberingFor } from '../services/checklistStore';
import { useChecklist } from '../hooks/useChecklist';
import { ScorePill } from './ScorePill';
import { PriorityBadge } from './PriorityBadge';
import {
  getInspectionById,
  getInspections,
  saveInspection,
  clearActiveDraft,
} from '../services/storage';
import {
  EMPTY_HISTORY,
  RankedIssue,
  SEVERITY_LABEL,
  buildFailureHistory,
  computePriority,
  countBySeverity,
  missingPhotoEvidence,
  sortByPriority,
} from '../services/priority';
import { useRouter } from 'next/navigation';
import { useToast } from './ToastProvider';
import { raiseMaintenanceJobs } from '../services/maintenanceIntake';

interface ReviewScreenProps {
  inspectionId: string;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const showToast = useToast();
  const checklist = useChecklist();
  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!inspection) {
      const found = getInspectionById(inspectionId);
      if (found) setInspection(found);
    }
  }, [inspectionId, inspection]);

  // Set up signature canvas touch and mouse listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas scaling for sharp display on Retina/mobile screens
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#17181D';

    const getCanvasPos = (clientX: number, clientY: number) => {
      const b = canvas.getBoundingClientRect();
      return {
        x: clientX - b.left,
        y: clientY - b.top,
      };
    };

    const startDrawing = (x: number, y: number) => {
      isDrawingRef.current = true;
      lastPosRef.current = { x, y };
      ctx.beginPath();
      ctx.moveTo(x, y);
      setSignError(null);
    };

    const draw = (x: number, y: number) => {
      if (!isDrawingRef.current || !lastPosRef.current) return;
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPosRef.current = { x, y };
      setHasDrawn(true);
    };

    const stopDrawing = () => {
      if (isDrawingRef.current) {
        ctx.closePath();
        isDrawingRef.current = false;
        lastPosRef.current = null;
      }
    };

    // Mouse handlers
    const handleMouseDown = (e: MouseEvent) => {
      const pos = getCanvasPos(e.clientX, e.clientY);
      startDrawing(pos.x, pos.y);
    };
    const handleMouseMove = (e: MouseEvent) => {
      const pos = getCanvasPos(e.clientX, e.clientY);
      draw(pos.x, pos.y);
    };
    const handleMouseUp = () => stopDrawing();
    const handleMouseLeave = () => stopDrawing();

    // Touch handlers with preventDefault to prevent scrolling while drawing
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = getCanvasPos(touch.clientX, touch.clientY);
        startDrawing(pos.x, pos.y);
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = getCanvasPos(touch.clientX, touch.clientY);
        draw(pos.x, pos.y);
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      stopDrawing();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);

      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setSignError(null);
  };

  // Past failures at this branch, so repeat issues get escalated
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
        <h2 className="text-xl font-bold text-[#17181D]">Inspection not found</h2>
        <button
          onClick={() => router.push('/inspections')}
          className="mt-4 px-4 py-2 bg-[#C8202D] text-white text-sm font-medium rounded-[6px]"
        >
          Return to records
        </button>
      </div>
    );
  }

  // A record being re-reviewed keeps the items it originally covered
  const frozenIds = inspection.itemIds;
  const allItems: Item[] =
    frozenIds && frozenIds.length > 0
      ? frozenIds.map((id) => checklist.getItem(id)).filter((i): i is Item => !!i)
      : checklist.items;
  const totalItemsCount = allItems.length;
  const displayNumber = numberingFor(allItems.map((i) => i.id));

  // Gather flagged (No) items, and anything still unanswered
  const unrankedIssues: RankedIssue[] = [];
  const unansweredItems: Item[] = [];
  let yesCount = 0;

  allItems.forEach((item) => {
    const ans = inspection.answers[item.id];
    if (ans?.status === 'yes') {
      yesCount++;
    } else if (ans?.status === 'no') {
      unrankedIssues.push({
        item,
        answer: ans,
        priority: computePriority(item, ans, failureHistory),
      });
    } else {
      unansweredItems.push(item);
    }
  });

  // Most serious first — that is the order the manager should read them in
  const flaggedItems = sortByPriority(unrankedIssues);
  const severityCounts = countBySeverity(flaggedItems);
  const needEvidence = missingPhotoEvidence(flaggedItems);

  const calculatedScore =
    totalItemsCount > 0 ? Math.round((yesCount / totalItemsCount) * 100) : 0;

  // Items this record covered that the checklist no longer defines. Re-submitting
  // would drop them from itemIds for good, so the manager is asked first.
  const droppedItemCount = frozenIds
    ? frozenIds.filter((id) => !checklist.getItem(id)).length
    : 0;

  const handleSubmitInspection = () => {
    // Sections can be jumped from the checklist, so re-check completeness here
    if (unansweredItems.length > 0) {
      showToast(
        `${unansweredItems.length} item${unansweredItems.length === 1 ? ' is' : 's are'} still unanswered`
      );
      return;
    }

    // Critical issues have to carry photo evidence
    if (needEvidence.length > 0) {
      showToast(
        `${needEvidence.length} critical issue${
          needEvidence.length === 1 ? ' needs' : 's need'
        } photo evidence`
      );
      return;
    }

    if (!hasDrawn) {
      setSignError('Please sign before submitting');
      return;
    }

    // Re-submitting rewrites itemIds from what is on screen. When the checklist
    // has moved on, that quietly narrows what the record says it covered.
    if (
      droppedItemCount > 0 &&
      !window.confirm(
        `${droppedItemCount} item${droppedItemCount === 1 ? '' : 's'} this inspection ` +
          `originally covered ${droppedItemCount === 1 ? 'is' : 'are'} no longer in the checklist. ` +
          `Submitting now records it as covering ${totalItemsCount} items instead of ` +
          `${frozenIds ? frozenIds.length : totalItemsCount}, and rescores it out of ${totalItemsCount}. Continue?`
      )
    ) {
      return;
    }

    const canvas = canvasRef.current;
    const signatureDataUrl = canvas ? canvas.toDataURL('image/png') : null;

    const submittedInspection: Inspection = {
      ...inspection,
      status: 'submitted',
      score: calculatedScore,
      signature: signatureDataUrl,
      // Freeze what was inspected, so later checklist edits cannot rewrite
      // this record's contents, numbering or score
      itemIds: allItems.map((item) => item.id),
      // Closes the duration the report shows against startedAt
      submittedAt: new Date().toISOString(),
    };

    saveInspection(submittedInspection);
    clearActiveDraft();

    /*
     * Failures in the maintenance group describe something that needs
     * repairing, so they go on the maintenance board as unstarted jobs. Done
     * here rather than when "No" was tapped, because a draft answer can be
     * changed any number of times and each flip would raise another job.
     */
    const { raised } = raiseMaintenanceJobs(submittedInspection, flaggedItems, checklist);

    showToast(
      raised.length > 0
        ? `Inspection saved — ${raised.length} maintenance job${
            raised.length === 1 ? '' : 's'
          } raised`
        : 'Inspection saved'
    );
    router.push(`/inspections/${inspection.id}/summary`);
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto w-full">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B6F76] hover:text-[#17181D] transition cursor-pointer mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Return to checklist</span>
      </button>

      {/* Header */}
      <div className="mb-6 border-b border-[#E6E7EB] pb-4">
        <h1 className="text-xl font-bold tracking-tight text-[#17181D]">
          Review before submitting
        </h1>
        <p className="text-xs font-medium text-[#6B6F76] mt-1">
          {flaggedItems.length === 0
            ? 'Every item passed'
            : `${flaggedItems.length} item${flaggedItems.length === 1 ? '' : 's'} flagged` +
              (severityCounts.critical > 0
                ? `, ${severityCounts.critical} critical`
                : severityCounts.high > 0
                  ? `, ${severityCounts.high} high priority`
                  : '')}
          {' '}• {inspection.branchName} ({FULL_CHECKLIST_LABEL})
        </p>
      </div>

      {/* Score Preview Banner */}
      <div className="mb-6 p-4 rounded-md bg-white border border-[#E6E7EB] flex items-center justify-between shadow-xs">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
            Calculated score
          </p>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            {yesCount} of {totalItemsCount} items passed standards
          </p>
        </div>
        <div className="text-right">
          <ScorePill score={calculatedScore} />
        </div>
      </div>

      {/* Priority breakdown of everything flagged */}
      {flaggedItems.length > 0 && (
        <div
          id="review-priority-summary"
          className="mb-6 p-4 rounded-md bg-white border border-[#E6E7EB] shadow-xs"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-2.5">
            Priority breakdown
          </p>
          <div className="flex flex-wrap gap-2">
            {(['critical', 'high', 'medium', 'low'] as const).map((severity) => (
              <span
                key={severity}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold ${
                  severityCounts[severity] === 0
                    ? 'border-[#E6E7EB] bg-[#FAFAFA] text-[#6B6F76]/60'
                    : 'border-[#E6E7EB] bg-white text-[#17181D]'
                }`}
              >
                <PriorityBadge severity={severity} size="sm" />
                <span className="tabular-nums">{severityCounts[severity]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Critical issues lacking photo evidence — blocks submit */}
      {needEvidence.length > 0 && (
        <div
          id="review-evidence-banner"
          className="mb-6 p-4 rounded-md bg-[#FDECEE] border border-[#C8202D]/40 shadow-xs"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#C8202D] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#17181D]">
                {needEvidence.length} critical issue{needEvidence.length === 1 ? '' : 's'} need
                {needEvidence.length === 1 ? 's' : ''} photo evidence
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {needEvidence.map(({ item }) => (
                  <li key={item.id} className="text-xs text-[#6B6F76]">
                    {displayNumber(item.id)}. {item.text}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
                className="mt-2 text-xs font-bold text-[#C8202D] hover:underline cursor-pointer"
              >
                Return to checklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unanswered items — blocks submit until every item is marked */}
      {unansweredItems.length > 0 && (
        <div
          id="review-unanswered-banner"
          className="mb-6 p-4 rounded-md bg-[#FDF3E2] border border-[#B4740A]/30 shadow-xs"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#B4740A] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#17181D]">
                {unansweredItems.length} item{unansweredItems.length === 1 ? '' : 's'} still
                unanswered
              </p>
              <p className="text-xs text-[#6B6F76] mt-0.5">
                Mark item{unansweredItems.length === 1 ? '' : 's'}{' '}
                {unansweredItems.map((item) => displayNumber(item.id)).join(', ')} before submitting.
              </p>
              <button
                type="button"
                onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
                className="mt-2 text-xs font-bold text-[#C8202D] hover:underline cursor-pointer"
              >
                Return to checklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flagged items list */}
      <div className="mb-8">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-3">
          Non-compliant items ({flaggedItems.length}) — most serious first
        </h2>

        {flaggedItems.length === 0 ? (
          <div className="p-6 bg-[#E6F4EC]/60 border border-[#157F4B]/20 rounded-md text-center">
            <CheckCircle className="w-8 h-8 text-[#157F4B] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#157F4B]">Every item passed</p>
            <p className="text-xs text-[#157F4B]/80 mt-1">
              All checklist points conform to inspection guidelines.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {flaggedItems.map(({ item, answer, priority }) => {
              const displayReason =
                answer.reason === 'Other'
                  ? `Other: ${answer.otherReason || 'Unspecified'}`
                  : answer.reason || 'No reason provided';

              return (
                <div
                  key={item.id}
                  id={`review-flagged-item-${item.id}`}
                  className={`bg-[#FDECEE]/40 border rounded-md p-4 text-[#17181D] ${
                    priority.severity === 'critical'
                      ? 'border-[#C8202D] border-l-4'
                      : 'border-[#C8202D]/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xs font-bold text-[#C8202D] bg-white border border-[#C8202D]/30 min-w-5 h-5 px-1 rounded flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                        {displayNumber(item.id)}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#17181D]">{item.text}</p>
                          <PriorityBadge
                            severity={priority.severity}
                            size="sm"
                            escalated={priority.severity !== priority.base}
                          />
                        </div>
                        <div className="mt-1.5 text-xs">
                          <span className="font-semibold text-[#C8202D]">Reason: </span>
                          <span className="text-[#17181D]">{displayReason}</span>
                        </div>
                        {answer.note && (
                          <div className="mt-1 text-xs text-[#6B6F76]">
                            <span className="font-semibold">Note: </span>
                            <span>{answer.note}</span>
                          </div>
                        )}
                        {priority.repeatCount > 0 && (
                          <div className="mt-1 text-xs font-semibold text-[#B4740A]">
                            Repeat issue — flagged in {priority.repeatCount} of the last{' '}
                            {priority.historyVisits} visit
                            {priority.historyVisits === 1 ? '' : 's'} to this branch
                          </div>
                        )}
                      </div>
                    </div>

                    {answer.photo && (
                      <div className="shrink-0">
                        <img
                          src={answer.photo}
                          alt={`Evidence item ${item.id}`}
                          className="w-14 h-14 object-cover rounded-md border border-[#E6E7EB] bg-white"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Signature Pad Section */}
      <div className="bg-white border border-[#E6E7EB] rounded-md p-6 mb-8 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <label
              htmlFor="signature-canvas"
              className="block text-sm font-bold text-[#17181D]"
            >
              Branch manager sign-off <span className="text-[#C8202D]">*</span>
            </label>
            <p className="text-xs text-[#6B6F76] mt-0.5">
              Draw manager signature with touch or mouse to acknowledge this inspection.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClearSignature}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#6B6F76] hover:text-[#C8202D] border border-[#E6E7EB] rounded-md hover:bg-[#F6F6F8] transition-colors cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>

        {signError && (
          <div
            id="signature-error-msg"
            className="mb-3 p-2.5 rounded-md bg-[#FDECEE] border border-[#C8202D]/30 text-[#C8202D] text-xs font-semibold flex items-center gap-1.5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{signError}</span>
          </div>
        )}

        <div className="relative border-2 border-dashed border-[#E6E7EB] rounded-md bg-[#FAFAFA] overflow-hidden touch-none">
          <canvas
            id="signature-canvas"
            ref={canvasRef}
            className="w-full h-36 md:h-44 cursor-crosshair block"
          />
          {!hasDrawn && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-[#6B6F76]/50">
              <PenTool className="w-4 h-4 mr-1.5 opacity-60" />
              Sign here using mouse or finger
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
          className="px-4 py-2.5 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] bg-white hover:bg-[#F6F6F8] transition-colors cursor-pointer"
        >
          Edit checklist
        </button>

        <button
          id="submit-inspection-btn"
          type="button"
          onClick={handleSubmitInspection}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md text-xs font-semibold bg-[#C8202D] text-white hover:bg-[#A81823] transition-colors shadow-xs cursor-pointer"
        >
          <FileCheck className="w-4 h-4" />
          <span>Submit inspection</span>
        </button>
      </div>
    </div>
  );
};

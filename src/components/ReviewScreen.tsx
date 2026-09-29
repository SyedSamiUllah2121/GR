'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  AlertTriangle,
  FileCheck,
  Eraser,
  ListChecks,
  PenTool,
  Wrench,
} from 'lucide-react';
import { Inspection, Item } from '../types';
import { categoryLabel } from '../services/categoryStore';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { numberingFor } from '../services/checklistStore';
import { useChecklist } from '../hooks/useChecklist';
import { ScorePill } from './ScorePill';
import { PriorityBadge } from './PriorityBadge';
import { BUTTON, CARD, PageHeader } from './ui';
import { CountUp, Reveal, Stagger, StaggerItem } from './motion';
import { CHART_COLORS, ScoreDial, StackedMeter } from './charts';
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
import { useConfirm } from './ConfirmProvider';
import {
  heldChecks,
  maintenanceIssues,
  raiseMaintenanceJobs,
  suggestCategory,
} from '../services/maintenanceIntake';
import { getJobs } from '../services/maintenanceStore';
import { activeEquipment } from '../services/equipmentStore';
import { currentUser } from '../services/session';
import { canEditInspection, canViewInspection } from '../services/permissions';
import { AccessNotice, NOT_YOURS } from './AccessNotice';
import { useCurrentUser } from '../hooks/useCurrentUser';

interface ReviewScreenProps {
  inspectionId: string;
}

/**
 * Titles offered under the designation box. Only suggestions — a branch can
 * call the person on duty whatever it likes, so the field stays free text.
 */
const SIGNATORY_ROLES = [
  'Branch manager',
  'Assistant manager',
  'Shift supervisor',
  'Head chef',
  'Duty manager',
  'Owner',
];

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const checklist = useChecklist();
  const user = useCurrentUser();
  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  /*
   * Who is signing. The manager is often not the person on site, so this is
   * asked rather than assumed — but a branch manager signing off their own
   * round is the common case, so their name and title start in the boxes.
   * Both stay editable: it is a statement of who was actually there.
   */
  const [signatoryName, setSignatoryName] = useState(
    () =>
      getInspectionById(inspectionId)?.signatoryName ??
      (currentUser()?.role === 'branch-manager' ? currentUser()?.name ?? '' : '')
  );
  const [signatoryRole, setSignatoryRole] = useState(
    () =>
      getInspectionById(inspectionId)?.signatoryRole ??
      (currentUser()?.role === 'branch-manager' ? 'Branch manager' : '')
  );

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
      <div className="p-5 sm:p-8 max-w-xl mx-auto w-full">
        <div className={`${CARD} px-6 py-14 text-center`}>
          <h2 className="text-base font-bold text-[#17181D]">Inspection not found</h2>
          <button onClick={() => router.push('/inspections')} className={`${BUTTON.primary} mt-5`}>
            Return to records
          </button>
        </div>
      </div>
    );
  }

  /*
   * Signing off is the act that produces the locked result, so the same rule
   * that governs the answers governs this screen. Without it a locked record
   * could be re-signed straight from its URL, which would make the padlock on
   * the checklist decorative.
   */
  if (!canEditInspection(user, inspection)) {
    const mayRead = canViewInspection(user, inspection);
    return (
      <AccessNotice
        title={mayRead ? 'Already signed off' : NOT_YOURS.title}
        detail={
          mayRead
            ? 'This inspection has been submitted and locked. Only the Main Admin can reopen and re-sign it.'
            : NOT_YOURS.detail
        }
        reportHref={mayRead ? `/inspections/${inspection.id}` : undefined}
      />
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

  /*
   * The checks maintenance already holds.
   *
   * Asked here as well as on the checklist screen, and deliberately of the
   * same function: that screen locks their buttons, so a check it holds is one
   * this screen can never be given an answer for. Without this, every such
   * check was counted as unanswered, submit refused, and the checklist offered
   * nothing to fix — an inspection that could be filled in completely and then
   * never handed in.
   */
  const held = heldChecks(
    inspection.branchName,
    allItems,
    inspection.answers,
    getJobs(),
    activeEquipment(),
    inspection.id
  );

  // Gather flagged (No) items, anything still unanswered, and what was held
  const unrankedIssues: RankedIssue[] = [];
  const unansweredItems: Item[] = [];
  const heldItems: Item[] = [];
  let yesCount = 0;

  allItems.forEach((item) => {
    if (held.has(item.id)) {
      heldItems.push(item);
      return;
    }
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
  // What submitting will put on the maintenance board, so the inspector can
  // see it here rather than find out from the toast afterwards
  const repairItems = maintenanceIssues(flaggedItems);
  // Read off the same list the banner counts, so a chip and the count above it
  // can never disagree
  const repairIds = new Set(repairItems.map(({ item }) => item.id));

  /*
   * Scored out of what this visit could actually judge. A held check is not a
   * failure — the fault is already booked in, and counting it as one would
   * mark the branch down twice for a single fault, every round, until the
   * repair was done.
   */
  const scoredItemsCount = totalItemsCount - heldItems.length;
  const calculatedScore =
    scoredItemsCount > 0 ? Math.round((yesCount / scoredItemsCount) * 100) : 0;

  // Items this record covered that the checklist no longer defines. Re-submitting
  // would drop them from itemIds for good, so the manager is asked first.
  const droppedItemCount = frozenIds
    ? frozenIds.filter((id) => !checklist.getItem(id)).length
    : 0;

  const handleSubmitInspection = async () => {
    // Sections can be jumped from the checklist, so re-check completeness here
    if (unansweredItems.length > 0) {
      showToast(
        `${unansweredItems.length} item${unansweredItems.length === 1 ? ' is' : 's are'} still unanswered`,
        'error'
      );
      return;
    }

    // Critical issues have to carry photo evidence
    if (needEvidence.length > 0) {
      showToast(
        `${needEvidence.length} critical issue${
          needEvidence.length === 1 ? ' needs' : 's need'
        } photo evidence`,
        'error'
      );
      return;
    }

    if (!signatoryName.trim()) {
      setSignError('Enter the name of the person signing');
      return;
    }

    if (!signatoryRole.trim()) {
      setSignError('Enter their designation — the record has to say in what capacity they signed');
      return;
    }

    if (!hasDrawn) {
      setSignError('Please sign before submitting');
      return;
    }

    // Re-submitting rewrites itemIds from what is on screen. When the checklist
    // has moved on, that quietly narrows what the record says it covered.
    if (droppedItemCount > 0) {
      const proceed = await confirm({
        title: `Submit against ${totalItemsCount} items rather than ${
          frozenIds ? frozenIds.length : totalItemsCount
        }?`,
        body:
          `${droppedItemCount} item${droppedItemCount === 1 ? '' : 's'} this inspection ` +
          `originally covered ${droppedItemCount === 1 ? 'is' : 'are'} no longer in the ` +
          `checklist. Submitting now records it as covering ${totalItemsCount} items, and ` +
          `rescores it out of ${totalItemsCount}.`,
        confirmLabel: 'Submit anyway',
        destructive: false,
      });
      if (!proceed) return;
    }

    const canvas = canvasRef.current;
    const signatureDataUrl = canvas ? canvas.toDataURL('image/png') : null;

    const now = new Date().toISOString();

    /*
     * Re-submitting a record that was already signed off is the main admin
     * overriding a locked result, and the report has to be able to say so —
     * a lock only one person can open is worth nothing if opening it leaves
     * no trace. Appended rather than replaced, so a second override does not
     * erase the first.
     */
    const wasLocked = inspection.status === 'submitted';
    const edits = wasLocked
      ? [
          ...(inspection.edits ?? []),
          {
            at: now,
            byUserId: user?.id ?? 'unknown',
            byName: user?.name ?? 'Unknown',
            previousScore: inspection.score,
          },
        ]
      : inspection.edits;

    const submittedInspection: Inspection = {
      ...inspection,
      status: 'submitted',
      score: calculatedScore,
      signature: signatureDataUrl,
      signatoryName: signatoryName.trim(),
      signatoryRole: signatoryRole.trim(),
      // Freeze what was inspected, so later checklist edits cannot rewrite
      // this record's contents, numbering or score
      itemIds: allItems.map((item) => item.id),
      /*
       * Kept on the record because the board moves on: these jobs will be
       * finished, and a report opened next year has to say what was held on
       * the day rather than what is outstanding when it is read.
       */
      heldItemIds: heldItems.map((item) => item.id),
      // Closes the duration the report shows against startedAt
      submittedAt: now,
      submittedByUserId: user?.id,
      /*
       * When the answers were first sealed. Kept separate from `submittedAt`
       * even though they start as the same instant: this one is the
       * permission — only the main admin may reopen a record that carries it
       * — and it holds the *original* seal, because each override already
       * stamps its own time in `edits`.
       */
      lockedAt: inspection.lockedAt ?? now,
      edits,
    };

    /*
     * The one place a failed write must never be passed over. Below this line
     * the draft is cleared, jobs are raised against the record and the screen
     * says "Inspection saved" — so if the store refused it, all of that is said
     * about a record that does not exist, and the visit is gone with a success
     * message on top of it.
     *
     * Nothing is cleared and nothing is raised: the draft stays exactly where
     * it is, so making room and pressing submit again finishes the job.
     */
    if (!saveInspection(submittedInspection)) {
      showToast(
        'Could not save — this browser\u2019s storage is full. Free some space and submit again; your answers are still here.',
        'error'
      );
      return;
    }
    clearActiveDraft();

    /*
     * Failures marked as repair work go on the maintenance board as unstarted
     * jobs. Done here rather than when "No" was tapped, because a draft answer
     * can be changed any number of times and each flip would raise another job.
     */
    const { raised, withdrawn } = raiseMaintenanceJobs(
      submittedInspection,
      flaggedItems,
      checklist
    );

    // Amending a record can take work off the board as well as put it on, and
    // either way the person submitting should be told which happened
    const boardNotes = [
      raised.length > 0
        ? `${raised.length} maintenance job${raised.length === 1 ? '' : 's'} raised`
        : null,
      withdrawn > 0 ? `${withdrawn} withdrawn` : null,
    ].filter(Boolean);

    showToast(
      boardNotes.length > 0 ? `Inspection saved — ${boardNotes.join(', ')}` : 'Inspection saved'
    );
    router.push(`/inspections/${inspection.id}/summary`);
  };

  /*
   * What still stands between this record and submitting, for the bar at the
   * foot. Read off the same conditions `handleSubmitInspection` checks, in the
   * same order, so the bar can never call a record ready that submit refuses.
   */
  const readiness = [
    { key: 'answers', label: 'Every check answered', done: unansweredItems.length === 0 },
    { key: 'evidence', label: 'Critical photos attached', done: needEvidence.length === 0 },
    {
      key: 'signatory',
      label: 'Name and designation',
      done: !!signatoryName.trim() && !!signatoryRole.trim(),
    },
    { key: 'signature', label: 'Signed', done: hasDrawn },
  ];
  const readyCount = readiness.filter((r) => r.done).length;

  return (
    <div className="p-5 sm:p-6 md:p-8 max-w-4xl mx-auto w-full">
      <Reveal className="mb-6">
        {/* Back button */}
        <button
          type="button"
          onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] transition-colors cursor-pointer mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Return to checklist</span>
        </button>

        {/* Header */}
        <PageHeader
          eyebrow="Final step · sign-off"
          title="Review before submitting"
          subtitle={
            <>
              {flaggedItems.length === 0
                ? 'Every item passed'
                : `${flaggedItems.length} item${flaggedItems.length === 1 ? '' : 's'} flagged` +
                  (severityCounts.critical > 0
                    ? `, ${severityCounts.critical} critical`
                    : severityCounts.high > 0
                      ? `, ${severityCounts.high} high priority`
                      : '')}
              {' '}• {inspection.branchName} ({FULL_CHECKLIST_LABEL})
            </>
          }
        />
      </Reveal>

      {/* Score Preview, with the priority breakdown of everything flagged beside it */}
      <Reveal delay={0.05} className="mb-5">
        <div className={`${CARD} p-5 sm:p-6 flex flex-col sm:flex-row gap-6`}>
          <div className="flex items-center gap-5 sm:w-[15rem] shrink-0">
            <div className="relative">
              <ScoreDial value={calculatedScore} size={112} stroke={10} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[28px] leading-none font-bold tracking-tight text-[#17181D]">
                  <CountUp value={calculatedScore} />
                  <span className="text-base font-semibold text-[#9CA1A9]">%</span>
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9]">
                Calculated score
              </p>
              <p className="text-xs text-[#6B6F76] mt-1 leading-relaxed">
                {yesCount} of {totalItemsCount} items passed standards
              </p>
              <div className="mt-2.5">
                <ScorePill score={calculatedScore} size="sm" showLabel />
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 sm:pl-6 sm:border-l border-[#F0F1F4]">
            {flaggedItems.length > 0 ? (
              <div id="review-priority-summary">
                <p className="text-[13px] font-bold text-[#17181D]">Priority breakdown</p>
                <p className="text-xs text-[#6B6F76] mt-0.5 mb-4">
                  {flaggedItems.length} finding{flaggedItems.length === 1 ? '' : 's'}, most serious
                  first below
                </p>
                <StackedMeter
                  label="Findings by priority"
                  unit="finding"
                  parts={(['critical', 'high', 'medium', 'low'] as const).map((severity) => ({
                    key: severity,
                    label: SEVERITY_LABEL[severity],
                    value: severityCounts[severity],
                    color: CHART_COLORS.severity[severity],
                  }))}
                />
              </div>
            ) : (
              <div className="h-full flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[13px] font-bold text-[#17181D]">Nothing flagged</p>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    Every check on this visit passed.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      <Stagger className="space-y-4 mb-8">
      {/* What goes to maintenance, said before signing rather than after */}
      {repairItems.length > 0 && (
        <StaggerItem>
        <div
          id="review-maintenance-summary"
          className={`${CARD} p-4 sm:p-5 flex items-start gap-3.5`}
        >
          <span className="w-10 h-10 rounded-xl bg-[#FDF3E2] text-[#B4740A] flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#17181D]">
              {repairItems.length} repair job{repairItems.length === 1 ? '' : 's'} raised on submit
            </p>
            <p className="text-xs text-[#6B6F76] mt-0.5 leading-relaxed">
              Each opens on the maintenance board as Reported, waiting to be picked up. The
              findings below are marked with the trade they go to.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
              className={LINK_BUTTON}
            >
              Change on the checklist
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        </StaggerItem>
      )}

      {/* Critical issues lacking photo evidence — blocks submit */}
      {needEvidence.length > 0 && (
        <StaggerItem>
        <div
          id="review-evidence-banner"
          className="p-4 sm:p-5 rounded-2xl bg-[#FDECEE] border border-[#C8202D]/30"
          role="alert"
        >
          <div className="flex items-start gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-white/70 text-[#C8202D] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-[#17181D]">
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
                className={LINK_BUTTON}
              >
                Return to checklist
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        </StaggerItem>
      )}

      {/* Unanswered items — blocks submit until every item is marked */}
      {unansweredItems.length > 0 && (
        <StaggerItem>
        <div
          id="review-unanswered-banner"
          className="p-4 sm:p-5 rounded-2xl bg-[#FDF3E2] border border-[#B4740A]/30"
          role="alert"
        >
          <div className="flex items-start gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-white/70 text-[#B4740A] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-[#17181D]">
                {unansweredItems.length} item{unansweredItems.length === 1 ? '' : 's'} still
                unanswered
              </p>
              <p className="text-xs text-[#6B6F76] mt-0.5 leading-relaxed">
                Mark item{unansweredItems.length === 1 ? '' : 's'}{' '}
                {unansweredItems.map((item) => displayNumber(item.id)).join(', ')} before submitting.
              </p>
              <button
                type="button"
                onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
                className={LINK_BUTTON}
              >
                Return to checklist
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        </StaggerItem>
      )}

      {/*
        Checks that were with maintenance. Not a warning — nothing is wrong and
        nothing is blocked — but the score is out of fewer items than the
        checklist has, and a number that quietly disagrees with the one above
        it is how a report stops being trusted.
      */}
      {heldItems.length > 0 && (
        <StaggerItem>
        <div
          id="review-held-banner"
          className={`${CARD} p-4 sm:p-5`}
        >
          <div className="flex items-start gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-[#FDF3E2] text-[#B4740A] flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-[#17181D]">
                {heldItems.length} check{heldItems.length === 1 ? '' : 's'} already with
                maintenance
              </p>
              <p className="text-xs text-[#6B6F76] mt-0.5 leading-relaxed">
                Item{heldItems.length === 1 ? '' : 's'}{' '}
                {heldItems.map((item) => displayNumber(item.id)).join(', ')} could not be
                answered, because the fault is already on the board. They are scored out — this
                visit is marked out of {scoredItemsCount} rather than {totalItemsCount} — and the
                report says so.
              </p>
            </div>
          </div>
        </div>
        </StaggerItem>
      )}

      {/* Flagged items list */}
      <StaggerItem>
      <section className={`${CARD} overflow-hidden`}>
        <div className="px-5 sm:px-6 py-4 flex items-center gap-3 border-b border-[#F0F1F4]">
          <span className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
            <ListChecks className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-[#17181D]">
              Non-compliant items ({flaggedItems.length}) — most serious first
            </h2>
            <p className="text-xs text-[#6B6F76] mt-0.5">
              What the manager is signing for, with the reason given for each
            </p>
          </div>
        </div>

        {flaggedItems.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </span>
            <p className="mt-3 text-sm font-bold text-[#17181D]">Every item passed</p>
            <p className="text-xs text-[#6B6F76] mt-1">
              All checklist points conform to inspection guidelines.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F0F1F4]">
            {flaggedItems.map(({ item, answer, priority }) => {
              const displayReason =
                answer.reason === 'Other'
                  ? `Other: ${answer.otherReason || 'Unspecified'}`
                  : answer.reason || 'No reason provided';
              const toMaintenance = repairIds.has(item.id);

              return (
                <div
                  key={item.id}
                  id={`review-flagged-item-${item.id}`}
                  className={`relative px-5 sm:px-6 py-4 text-[#17181D] ${
                    priority.severity === 'critical' ? 'bg-[#FDECEE]/30' : ''
                  }`}
                >
                  {/* The priority down the leading edge, in the severity ramp */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ background: CHART_COLORS.severity[priority.severity] }}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-[11px] font-bold text-[#C8202D] bg-[#FDECEE] min-w-7 h-7 px-1.5 rounded-lg flex items-center justify-center shrink-0 tabular-nums">
                        {displayNumber(item.id)}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#17181D]">{item.text}</p>
                          <PriorityBadge
                            severity={priority.severity}
                            size="sm"
                            escalated={priority.severity !== priority.base}
                          />
                        </div>
                        <div className="mt-1.5 text-xs">
                          <span className="font-semibold text-[#A81823]">Reason: </span>
                          <span className="text-[#17181D]">{displayReason}</span>
                        </div>
                        {/* The trade this one lands on, when it is repair work */}
                        {toMaintenance && (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FDF3E2] text-[11px] font-semibold text-[#8A5A08]">
                            <Wrench className="w-3 h-3 shrink-0" />
                            <span>
                              Repair job — {categoryLabel(suggestCategory(item, answer))}
                            </span>
                          </div>
                        )}
                        {answer.note && (
                          <div className="mt-1 text-xs text-[#6B6F76]">
                            <span className="font-semibold">Note: </span>
                            <span>{answer.note}</span>
                          </div>
                        )}
                        {priority.repeatCount > 0 && (
                          <div className="mt-1 text-xs font-semibold text-[#8A5A08]">
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
                          className="w-16 h-16 object-cover rounded-xl border border-[#E8E9EE] bg-white"
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
      </section>
      </StaggerItem>
      </Stagger>

      {/*
        Signature Pad Section. Left out of the animated wrappers above: the
        pad sizes its drawing surface from where it sits on the first frame,
        and it should be measured standing still.
      */}
      <div className={`${CARD} p-5 sm:p-6 mb-5`}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
              <PenTool className="w-[18px] h-[18px]" />
            </span>
            <div>
              <label
                htmlFor="signature-canvas"
                className="block text-[15px] font-bold text-[#17181D]"
              >
                Sign-off <span className="text-[#C8202D]">*</span>
              </label>
              <p className="text-xs text-[#6B6F76] mt-0.5">
                Whoever is on site signs. Record their name and designation, then sign below.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClearSignature}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-semibold text-[#6B6F76] hover:text-[#C8202D] border border-[#E4E6EB] bg-white rounded-lg hover:bg-[#FDECEE] hover:border-[#C8202D]/25 transition-colors cursor-pointer shrink-0"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>

        {/*
          Who is actually signing. A signature on its own does not say whose
          it is, and the branch manager is often not the person on site.
        */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="signatory-name-input" className={LABEL}>
              Name of person signing <span className="text-[#C8202D]">*</span>
            </label>
            <input
              id="signatory-name-input"
              type="text"
              value={signatoryName}
              onChange={(e) => {
                setSignatoryName(e.target.value);
                setSignError(null);
              }}
              placeholder="e.g. A. Rahman"
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="signatory-role-input" className={LABEL}>
              Designation <span className="text-[#C8202D]">*</span>
            </label>
            <input
              id="signatory-role-input"
              type="text"
              list="signatory-role-options"
              value={signatoryRole}
              onChange={(e) => {
                setSignatoryRole(e.target.value);
                setSignError(null);
              }}
              placeholder="e.g. Shift supervisor"
              className={FIELD}
            />
            {/* Suggestions, not a fixed list — a branch can title people anything */}
            <datalist id="signatory-role-options">
              {SIGNATORY_ROLES.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </div>
        </div>

        <div
          className={`relative border-2 border-dashed rounded-xl overflow-hidden touch-none transition-colors ${
            hasDrawn ? 'border-[#C9CCD2] bg-white' : 'border-[#E4E6EB] bg-[#FAFBFC]'
          }`}
        >
          <canvas
            id="signature-canvas"
            ref={canvasRef}
            className="w-full h-36 md:h-44 cursor-crosshair block"
          />
          {!hasDrawn && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-[#9CA1A9]">
              <PenTool className="w-4 h-4 mr-1.5 opacity-60" />
              Sign here using mouse or finger
            </div>
          )}
          {/* A baseline to sign along, as on a paper form */}
          <div
            aria-hidden
            className="absolute left-6 right-6 bottom-8 border-b border-[#E4E6EB] pointer-events-none"
          />
        </div>
      </div>

      {/* Action Buttons, with what is still outstanding before submit will go through */}
      <div className={`${CARD} p-4 sm:p-5`}>
        {/*
          Beside the button that raised it. At the top of the sign-off card it
          sat above the fields and the pad, off screen on a phone, and pressing
          Submit looked like it did nothing.
        */}
        {signError && (
          <div
            id="signature-error-msg"
            role="alert"
            className="mb-4 px-3.5 py-2.5 rounded-xl bg-[#FDECEE] border border-[#C8202D]/30 text-[#A81823] text-xs font-semibold flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{signError}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-xs mb-2">
              <span className="font-semibold text-[#17181D]">
                {readyCount === readiness.length
                  ? 'Ready to submit'
                  : `${readyCount} of ${readiness.length} ready`}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5" aria-hidden>
              {readiness.map((r) => (
                <span
                  key={r.key}
                  className={`h-1.5 rounded-full transition-colors duration-300 ${
                    r.done ? 'bg-[#157F4B]' : 'bg-[#EEF0F3]'
                  }`}
                />
              ))}
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              {readiness.map((r) => (
                <li
                  key={r.key}
                  className={`inline-flex items-center gap-1.5 text-[11px] ${
                    r.done ? 'text-[#12643C] font-semibold' : 'text-[#6B6F76]'
                  }`}
                >
                  {r.done ? (
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-[#C9CCD2] shrink-0" />
                  )}
                  {r.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
              className={BUTTON.secondary}
            >
              Edit checklist
            </button>

            <button
              id="submit-inspection-btn"
              type="button"
              onClick={handleSubmitInspection}
              className={`${BUTTON.primary} h-11 px-5`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Submit inspection</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/* The same field look as the checklist and the new-inspection form. */
const FIELD =
  'w-full h-11 px-3.5 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs transition-all hover:border-[#C9CCD2] focus:outline-none focus:border-[#C8202D]/60 focus:ring-4 focus:ring-[#C8202D]/10';
const LABEL = 'block text-xs font-semibold text-[#17181D] mb-1.5';
const LINK_BUTTON =
  'mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-[#C8202D] hover:text-[#A81823] cursor-pointer';

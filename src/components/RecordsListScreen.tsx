'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit3,
  FileText,
  LayoutList,
  Lock,
  MapPin,
  PlayCircle,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { INSPECTION_KIND_SHORT, Inspection, Item, branchesOf, inspectionKindOf } from '../types';
import {
  clearActiveDraft,
  deleteInspection,
  getActiveDraft,
  getInspections,
  subscribeToStorage,
} from '../services/storage';
import {
  can,
  canDiscardDraft,
  canEditInspection,
  canPerformInspection,
  visibleInspections,
} from '../services/permissions';
import {
  assignmentsFor,
  cancelAssignment,
  isOverdueAssignment,
  openAssignments,
  resumeAssignment,
  scheduleLabel,
  startAssignment,
} from '../services/assignments';
import { mondayStatusFor } from '../services/mondaySchedule';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { useChecklist } from '../hooks/useChecklist';
import {
  buildFailureHistory,
  computePriority,
  countBySeverity,
} from '../services/priority';
import { PriorityBadge } from './PriorityBadge';
import { useRouter } from 'next/navigation';
import { ScoreRing } from './ScoreRing';
import { BUTTON, CARD, PageHeader } from './ui';
import { EASE_OUT, Reveal, Stagger, StaggerItem, t } from './motion';
import { formatDate, formatDateTime, formatTimeOnly } from '../services/reportModel';
import { useConfirm } from './ConfirmProvider';
import { useToast } from './ToastProvider';

export const RecordsListScreen: React.FC = () => {
  const router = useRouter();
  const confirm = useConfirm();
  const checklist = useChecklist();
  const user = useCurrentUser();
  const [allInspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [activeDraft, setActiveDraft] = useState<Inspection | null>(() => getActiveDraft());
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [actionError, setActionErrorBanner] = useState<string | null>(null);
  const showToast = useToast();
  /*
   * The banner sits at the top of the page, and the Start and Withdraw buttons
   * that raise it can be well down a long list — so a refusal is also shown
   * as a toast, which is on screen wherever the button was.
   */
  const setActionError = (message: string | null) => {
    setActionErrorBanner(message);
    if (message) showToast(message, 'error');
  };
  const pageSize = 10;

  useEffect(() => {
    const update = () => {
      setInspections(getInspections());
      setActiveDraft(getActiveDraft());
    };
    return subscribeToStorage(update);
  }, []);

  /*
   * Scoped before anything else touches it: the admin sees every record, a
   * branch manager only their branch, an inspector only the visits handed to
   * them. Everything below — the table, the counts, the priority history —
   * reads this rather than the store, so none of them can widen it back.
   */
  const inspections = visibleInspections(user, allInspections);

  const mayStartVisits = can(user, 'monday.perform');

  /**
   * The surprise visits not yet submitted, from where you sit — waiting to
   * be started, and started but put down to finish later.
   */
  const assignments = user
    ? user.role === 'inspector'
      ? assignmentsFor(user.id, inspections)
      : can(user, 'surprise.create')
        ? openAssignments(inspections)
        : []
    : [];

  const inProgressCount = assignments.filter((visit) => visit.status === 'draft').length;
  const waitingCount = assignments.length - inProgressCount;

  /** A branch manager's own weekly round at each branch, and whether it is outstanding. */
  const ownBranches = branchesOf(user);
  const mondays = ownBranches.map((branch) => ({
    branch,
    monday: mondayStatusFor(branch, inspections),
  }));

  // Submitted records only, newest visit first. The store keeps insertion
  // order, which drifts from date order as soon as a record is edited.
  const submittedInspections = inspections
    .filter((i) => i.status === 'submitted')
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));

  const filteredInspections = submittedInspections.filter((item) =>
    item.branchName.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // The items a record covered — frozen on submit, so a checklist edit does
  // not change what a past record counts
  const itemsFor = (inspection: Inspection) =>
    inspection.itemIds && inspection.itemIds.length > 0
      ? inspection.itemIds.map((id) => checklist.getItem(id)).filter((i): i is Item => !!i)
      : checklist.items;

  /*
   * Priority mix for one record, scored against that branch's earlier visits.
   *
   * Deliberately scored against every visit rather than the ones the viewer
   * may open: whether a failure is a repeat is a fact about the branch, and
   * scoring it from a narrowed list would show an inspector a lower priority
   * than the admin sees on the very same record.
   */
  const prioritiesFor = (inspection: Inspection) => {
    const history = buildFailureHistory(allInspections, inspection.branchName, inspection);
    return countBySeverity(
      itemsFor(inspection).flatMap((item) => {
        const answer = inspection.answers[item.id];
        if (answer?.status !== 'no') return [];
        return [{ item, answer, priority: computePriority(item, answer, history) }];
      })
    );
  };

  const totalPages = Math.max(1, Math.ceil(filteredInspections.length / pageSize));
  // Deleting a draft or narrowing a search can leave currentPage past the end,
  // which rendered an empty table reading "no records found"
  const page = Math.min(currentPage, totalPages);
  const paginatedInspections = filteredInspections.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const handleDiscardDraft = async () => {
    if (!activeDraft) return;
    /*
     * Asked again here, not only where the button is offered. This one deletes
     * a record outright, and the button can sit on screen while the answer
     * changes underneath it — an admin's assignment arriving, a role edited in
     * another tab.
     */
    if (!canDiscardDraft(user, activeDraft)) return;
    const ok = await confirm({
      title: 'Discard the unfinished draft?',
      body: 'The answers recorded on it so far are deleted.',
      confirmLabel: 'Discard draft',
    });
    if (!ok) return;
    // A draft is written to the records store as it is answered, so clearing
    // the draft slot alone would leave the half-finished row behind
    deleteInspection(activeDraft.id);
    clearActiveDraft();
    setActiveDraft(null);
  };

  /**
   * Puts a started visit down without throwing it away.
   *
   * What an inspector gets instead of Discard. There is one draft slot, so a
   * half-finished visit in it blocks the next assignment from being started —
   * and if they may not discard it either, they are stuck. This clears the
   * slot and leaves the record alone: the visit stays in their list at the
   * point they left it, and the admin's instruction still stands.
   */
  const handleSetAsideDraft = async () => {
    if (!activeDraft) return;
    const ok = await confirm({
      title: 'Leave this visit for later?',
      body: `The answers so far are kept. ${activeDraft.branchName} stays in your list, and you can pick it up where you left off.`,
      confirmLabel: 'Leave it for now',
      destructive: false,
    });
    if (!ok) return;
    clearActiveDraft();
    setActiveDraft(null);
  };

  /**
   * Begins an assigned surprise visit.
   *
   * There is one draft slot, so a half-finished visit already in it would be
   * overwritten. Rather than discard someone's work silently, this refuses
   * and says what is in the way.
   */
  const handleStartAssignment = (assignment: Inspection) => {
    const inTheWay = getActiveDraft();
    if (inTheWay && inTheWay.id !== assignment.id && inTheWay.status === 'draft') {
      setActionError(
        `Finish or discard the unfinished inspection at ${inTheWay.branchName} first`
      );
      return;
    }
    setActionError(null);

    // Already started and put down: pick it up as it was, answers and all
    if (assignment.status === 'draft') {
      if (!resumeAssignment(assignment)) {
        setActionError('Could not open the visit — this browser’s storage is full');
        return;
      }
      router.push(`/inspections/${assignment.id}/checklist`);
      return;
    }

    const started = startAssignment(assignment);
    if (!started) {
      setActionError('Could not start the visit — this browser’s storage is full');
      return;
    }
    router.push(`/inspections/${started.id}/checklist`);
  };

  /**
   * Throws away a started visit, answers and all, which frees its branch and
   * its inspector for a new booking. The admin's — the same right as
   * discarding the draft from its banner, offered where the admin can
   * actually find the visit. Asked twice, because the answers go with it.
   */
  const handleDiscardVisit = async (visit: Inspection) => {
    if (!canDiscardDraft(user, visit)) return;
    const ok = await confirm({
      title: `Discard the visit to ${visit.branchName}?`,
      body: `${visit.inspectorName ?? 'The inspector'} has started it. The answers recorded so far are deleted, and the branch is free for a new surprise visit.`,
      confirmLabel: 'Discard visit',
    });
    if (!ok) return;
    deleteInspection(visit.id);
    if (getActiveDraft()?.id === visit.id) {
      clearActiveDraft();
      setActiveDraft(null);
    }
    setActionError(null);
  };

  const handleCancelAssignment = (assignment: Inspection) => {
    const result = cancelAssignment(assignment.id);
    setActionError(result.ok ? null : result.error ?? 'Could not withdraw that visit');
  };

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 flex flex-col gap-6 max-w-[1440px] w-full mx-auto min-w-0">
      <Reveal>
        <PageHeader
          eyebrow={user?.role === 'inspector' ? 'Your visits' : 'Inspections'}
          title={user?.role === 'inspector' ? 'My inspections' : 'Inspection Records'}
          subtitle={
            /*
              What the count is *of* differs by role, so saying "records"
              flatly would be wrong for two of the three: an inspector is
              looking at their own visits, a manager at one branch's.
            */
            ownBranches.length > 0
              ? `${ownBranches.join(' & ')} — ${filteredInspections.length} submitted record${
                  filteredInspections.length === 1 ? '' : 's'
                }`
              : user?.role === 'inspector'
                ? `${filteredInspections.length} visit${
                    filteredInspections.length === 1 ? '' : 's'
                  } you have completed`
                : `Showing ${filteredInspections.length} recent submission${
                    filteredInspections.length === 1 ? '' : 's'
                  }`
          }
          /*
            No "New inspection" here: the header offers it on every screen,
            at every width, to the same roles, and a second copy on this page
            was the same button twice. A manager's round has its own start
            button in the card below.
          */
        />
      </Reveal>

      {actionError && (
        <div
          id="records-action-error"
          role="alert"
          className="px-4 py-3 rounded-xl bg-[#FDECEE] border border-[#C8202D]/25 text-[#A81823] text-xs font-semibold flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss"
            className="p-1 rounded-lg hover:bg-[#C8202D]/10 cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/*
        This week's round, for the manager whose job it is.

        First thing on the screen, because it is the one thing they are
        here to do — the history below it is reference, and putting the
        task after the archive got the priority backwards.
      */}
      {mondays.length > 0 && (
        <Stagger className={`grid grid-cols-1 gap-4 ${mondays.length > 1 ? 'xl:grid-cols-2' : ''}`}>
          {mondays.map(({ branch, monday }, index) => {
            const tone = monday.done ? 'good' : monday.overdue ? 'bad' : 'warn';
            return (
              <StaggerItem key={branch}>
                <div
                  id={index === 0 ? 'monday-round-card' : `monday-round-card-${index + 1}`}
                  className={`${CARD} relative overflow-hidden p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
                >
                  {/* The state, as a strip down the leading edge */}
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-1 ${TONE[tone].bar}`}
                  />
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${TONE[tone].tile}`}
                    >
                      <CalendarCheck className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9]">
                        Monday round · Week of {formatDate(monday.weekOf)}
                      </p>
                      <p className="mt-1 text-[15px] font-bold text-[#17181D]">
                        {/* Named only when there is more than one round to tell apart */}
                        {mondays.length > 1 && `${branch}: `}
                        {monday.done
                          ? 'This week’s Monday inspection is done'
                          : monday.inProgress
                            ? 'This week’s Monday inspection is unfinished'
                            : monday.overdue
                              ? `Monday inspection is ${monday.daysLate} day${
                                  monday.daysLate === 1 ? '' : 's'
                                } late`
                              : 'Monday inspection is due today'}
                      </p>
                      <p className="text-xs text-[#6B6F76] mt-1 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE[tone].dot}`}
                          aria-hidden
                        />
                        {monday.done && monday.inspection
                          ? `Submitted at ${monday.inspection.score}%`
                          : monday.previous
                            ? `Last done ${formatDate(monday.previous.date)}`
                            : 'No round on record yet'}
                      </p>
                    </div>
                  </div>

                  {!monday.done ? (
                    <div className="self-stretch sm:self-auto flex justify-end">
                      {monday.inProgress && monday.inspection ? (
                        <button
                          type="button"
                          id={index === 0 ? 'monday-resume-btn' : `monday-resume-btn-${index + 1}`}
                          onClick={() =>
                            router.push(`/inspections/${monday.inspection!.id}/checklist`)
                          }
                          className={`${BUTTON.primary} whitespace-nowrap`}
                        >
                          <PlayCircle className="w-4 h-4" />
                          Carry on
                        </button>
                      ) : (
                        <Link
                          id={index === 0 ? 'monday-start-btn' : `monday-start-btn-${index + 1}`}
                          href={`/inspections/new?branch=${encodeURIComponent(branch)}`}
                          className={`${BUTTON.primary} whitespace-nowrap`}
                        >
                          <PlayCircle className="w-4 h-4" />
                          Start it now
                        </Link>
                      )}
                    </div>
                  ) : (
                    monday.inspection && (
                      <Link
                        href={`/inspections/${monday.inspection.id}/summary`}
                        className="self-end sm:self-auto inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-bold text-[#17181D] bg-[#F4F5F7] hover:bg-[#EBEDF0] transition-colors shrink-0"
                      >
                        View summary
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    )
                  )}
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      {/*
        Surprise visits waiting to be carried out. An inspector sees the
        ones handed to them and can start each; the admin sees every
        outstanding one and can withdraw it.
      */}
      {assignments.length > 0 && (
        <Reveal delay={0.05}>
          <section id="assignments" className={`${CARD} overflow-hidden`}>
            <div className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3 border-b border-[#F0F1F4]">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
                  <Zap className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-[#17181D] truncate">
                    {user?.role === 'inspector'
                      ? 'Surprise visits assigned to you'
                      : 'Surprise visits outstanding'}
                  </h3>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    {[
                      waitingCount > 0 && `${waitingCount} waiting to be started`,
                      inProgressCount > 0 && `${inProgressCount} in progress`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#FDECEE] px-2.5 py-0.5 text-[11px] font-bold text-[#A81823] tabular-nums shrink-0">
                {assignments.length}
              </span>
            </div>

            <ul className="divide-y divide-[#F0F1F4]">
              {assignments.map((visit) => {
                const late = isOverdueAssignment(visit);
                const inProgress = visit.status === 'draft';
                const answered = Object.keys(visit.answers).length;
                return (
                  <li
                    key={visit.id}
                    id={`assignment-${visit.id}`}
                    className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5 hover:bg-[#FAFBFC] transition-colors"
                  >
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] text-[11px] font-bold flex items-center justify-center shrink-0">
                      {initials(visit.branchName) || <MapPin className="w-4 h-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[#17181D] truncate">
                        {visit.branchName}
                      </p>
                      {/*
                        A booked visit says when it is due; one with no time
                        named says when it was handed over, which is all there
                        is to say about it.
                      */}
                      {inProgress ? (
                        <p className="text-[11px] truncate flex items-center gap-1.5 mt-0.5 text-[#8A5A08] font-semibold">
                          <PlayCircle className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {user?.role !== 'inspector' && `${visit.inspectorName} • `}
                            In progress • started {formatDate(visit.date)} at {visit.time} •{' '}
                            {answered} of {checklist.total} answered
                          </span>
                        </p>
                      ) : (
                      <p
                        className={`text-[11px] truncate flex items-center gap-1.5 mt-0.5 ${
                          late ? 'text-[#C8202D] font-semibold' : 'text-[#6B6F76]'
                        }`}
                      >
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {user?.role !== 'inspector' && `${visit.inspectorName} • `}
                          {scheduleLabel(visit, formatDateTime, formatTimeOnly)
                            ? `${late ? 'Was due' : 'Due'} ${scheduleLabel(
                                visit,
                                formatDateTime,
                                formatTimeOnly
                              )}`
                            : `assigned ${formatDate(visit.date)}`}
                          {user?.role === 'inspector' && ` • ${FULL_CHECKLIST_LABEL}`}
                        </span>
                      </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {canPerformInspection(user, visit) && (
                        <button
                          type="button"
                          id={
                            inProgress
                              ? `assignment-resume-${visit.id}`
                              : `assignment-start-${visit.id}`
                          }
                          onClick={() => handleStartAssignment(visit)}
                          className={`${BUTTON.primary} h-9 px-3.5 whitespace-nowrap`}
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          {inProgress ? 'Resume' : 'Start visit'}
                        </button>
                      )}

                      {/*
                        Withdrawing is for a visit nobody has started. Once it
                        is under way the admin may still discard it — the
                        answers go with it, so it asks first.
                      */}
                      {inProgress && canDiscardDraft(user, visit) && (
                        <button
                          type="button"
                          id={`assignment-discard-${visit.id}`}
                          onClick={() => handleDiscardVisit(visit)}
                          title={`Discard the started visit to ${visit.branchName}`}
                          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-[#C8202D] hover:bg-[#FDECEE] border border-[#C8202D]/30 bg-white rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Discard
                        </button>
                      )}

                      {!inProgress && can(user, 'surprise.create') && (
                        <button
                          type="button"
                          id={`assignment-cancel-${visit.id}`}
                          onClick={() => handleCancelAssignment(visit)}
                          title={`Withdraw the visit to ${visit.branchName}`}
                          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-[#6B6F76] hover:text-[#C8202D] hover:bg-[#FDECEE] hover:border-[#C8202D]/25 border border-[#E4E6EB] bg-white rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Withdraw
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </Reveal>
      )}

      {/*
        The unfinished draft — unless it is the very round the card above
        is already offering to carry on, in which case two banners would be
        telling one person the same thing twice.
      */}
      {activeDraft &&
        activeDraft.status === 'draft' &&
        canPerformInspection(user, activeDraft) &&
        !mondays.some(({ monday }) => monday.inspection?.id === activeDraft.id) &&
        // A started surprise visit already has its row, with Resume, above
        !assignments.some((visit) => visit.id === activeDraft.id) && (
        <Reveal delay={0.05}>
          <div
            id="active-draft-banner"
            className={`${CARD} relative overflow-hidden p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[#B4740A]" />
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="w-11 h-11 rounded-xl bg-[#FDF3E2] text-[#B4740A] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#17181D]">
                  Unfinished draft in progress for{' '}
                  <span className="font-bold text-[#8A5A08]">{activeDraft.branchName}</span>
                </p>
                <p className="text-xs text-[#6B6F76] mt-0.5">
                  {FULL_CHECKLIST_LABEL} • Started {formatDate(activeDraft.date)} at{' '}
                  {activeDraft.time}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                id="resume-draft-btn"
                onClick={() => router.push(`/inspections/${activeDraft.id}/checklist`)}
                className={`${BUTTON.primary} h-9 px-3.5`}
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
              {/*
                Throwing the visit away, or just putting it down. Which one is
                offered is not a matter of taste: a surprise visit is an
                instruction somebody else raised, and this record IS that
                instruction — starting it turned the assignment into this draft
                in place. Deleting it would delete what the inspector was asked
                to do.
              */}
              {canDiscardDraft(user, activeDraft) ? (
                <button
                  id="discard-draft-btn"
                  onClick={handleDiscardDraft}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-[#C8202D] bg-white hover:bg-[#FDECEE] border border-[#C8202D]/30 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>
              ) : (
                <button
                  id="set-aside-draft-btn"
                  onClick={handleSetAsideDraft}
                  title="Keeps your answers and leaves the visit in your list"
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-[#6B6F76] hover:text-[#17181D] bg-white hover:bg-[#F4F5F7] border border-[#E4E6EB] rounded-xl transition-colors cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Later</span>
                </button>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/*
        The records themselves. Faded in rather than raised into place like
        the cards above: the column headings stick under the top bar on a wide
        screen, and a transform on anything around a sticky element is what
        un-sticks it. Clipped rather than hidden at the corners for the same
        reason — `overflow: hidden` would make the card the thing the heading
        sticks inside, and it would never move.
      */}
      <FadeIn className={`${CARD} flex flex-col overflow-clip`}>
        <div className="px-5 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#F0F1F4]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
              <FileText className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-[#17181D] truncate">Submitted records</h2>
              <p className="text-xs text-[#6B6F76] mt-0.5 truncate">
                {FULL_CHECKLIST_LABEL} • {checklist.total} items · newest visit first
              </p>
            </div>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA1A9] pointer-events-none" />
            <input
              id="records-search-input"
              type="text"
              placeholder="Search branch..."
              aria-label="Search by branch"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-[#F7F8FA] border border-[#E4E6EB] text-sm text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:bg-white focus:border-[#C8202D]/50 focus:ring-4 focus:ring-[#C8202D]/10 transition-all"
            />
          </div>
        </div>

        {/*
          Scrolls sideways below `xl`, where the columns no longer fit. From
          `xl` up it lets go of that, so the heading row can stick to the
          window as the list is read.
        */}
        <div className="overflow-x-auto xl:overflow-x-visible flex-1">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="xl:sticky xl:top-[6.5rem] z-10">
              <tr>
                {(
                  [
                    ['Branch Name', ''],
                    ['Flagged Items', ''],
                    ['Date & Time', ''],
                    ['Score', 'text-right'],
                    ['Actions', 'text-right'],
                  ] as const
                ).map(([label, align]) => (
                  <th
                    key={label}
                    className={`px-6 py-3 bg-[#FAFBFC] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9] shadow-[inset_0_-1px_0_#EEF0F3] whitespace-nowrap ${align}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:border-t-0">
              {paginatedInspections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 px-6 text-center">
                    {/*
                      Pinned to the visible part of the card. The header
                      keeps the table wider than a phone, and centred across
                      the whole of it this message ran off the right edge.
                    */}
                    <div className="sticky left-6 max-w-[calc(100vw-6.5rem)] sm:max-w-none flex flex-col items-center">
                      <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
                        {searchQuery ? <Search className="w-6 h-6" /> : <ClipboardList className="w-6 h-6" />}
                      </span>
                      <p className="mt-4 text-sm font-bold text-[#17181D]">No inspection records found</p>
                      <p className="text-xs text-[#6B6F76] mt-1.5 max-w-xs">
                        {searchQuery
                          ? 'Try adjusting your search query.'
                          : 'Start a new weekly inspection to begin logging records.'}
                      </p>
                      {searchQuery ? (
                        <button
                          onClick={() => setSearchQuery('')}
                          className={`${BUTTON.secondary} mt-5`}
                        >
                          <X className="w-3.5 h-3.5" />
                          Clear search
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedInspections.map((item) => {
                  const counts = prioritiesFor(item);
                  const flagged =
                    counts.critical + counts.high + counts.medium + counts.low;
                  return (
                    <tr
                      key={item.id}
                      id={`record-row-${item.id}`}
                      onClick={() => {
                        if (item.status === 'draft') {
                          router.push(`/inspections/${item.id}/checklist`);
                        } else {
                          router.push(`/inspections/${item.id}/summary`);
                        }
                      }}
                      className="group cursor-pointer [&>td]:border-t [&>td]:border-[#F0F1F4] [&>td]:transition-colors hover:[&>td]:bg-[#FAFBFC]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 min-w-[14rem]">
                          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F4F5F7] to-[#E9EBEF] text-[#6B6F76] text-[11px] font-bold flex items-center justify-center shrink-0 transition-colors group-hover:from-[#FDECEE] group-hover:to-[#FBDCDF] group-hover:text-[#C8202D]">
                            {initials(item.branchName)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-[#17181D] flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span>{item.branchName}</span>
                              {item.status === 'draft' && (
                                <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#FDECEE] text-[#C8202D]">
                                  Draft
                                </span>
                              )}
                              {/*
                                Which kind of visit produced the record. It
                                decides who could have carried it out and who may
                                change it, so it belongs on the row rather than
                                only inside the report.
                              */}
                              {inspectionKindOf(item) === 'surprise' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#FFF6E5] text-[#8A5A08]">
                                  <Zap className="w-2.5 h-2.5" />
                                  {INSPECTION_KIND_SHORT.surprise}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[#6B6F76] truncate">
                              {item.inspectorName ?? '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {flagged === 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#E6F4EC] text-[#12643C] whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#157F4B]" />
                            None
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 min-w-[9rem]">
                            {(['critical', 'high', 'medium', 'low'] as const)
                              .filter((severity) => counts[severity] > 0)
                              .map((severity) => (
                                <PriorityBadge
                                  key={severity}
                                  severity={severity}
                                  size="sm"
                                  count={counts[severity]}
                                  title={`${counts[severity]} ${severity}`}
                                />
                              ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-xs font-semibold text-[#17181D] tabular-nums">
                          {formatDate(item.date)}
                        </p>
                        <p className="text-[11px] text-[#6B6F76] mt-0.5">{item.time}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <ScoreRing score={item.score} size={42} thickness={3.5} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/*
                            A submitted record is locked. Only the main
                            admin can reopen it, so for everyone else the
                            padlock replaces the button — an Edit that
                            refused on click would be worse than no Edit.
                          */}
                          {canEditInspection(user, item) ? (
                            <button
                              type="button"
                              id={`edit-btn-${item.id}`}
                              onClick={() => router.push(`/inspections/${item.id}/checklist`)}
                              className={`${ROW_ACTION} text-[#C8202D] bg-[#FDECEE] hover:bg-[#FBDCDF]`}
                              title="Edit and mark checklist items"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          ) : (
                            <span
                              id={`locked-btn-${item.id}`}
                              title="Submitted and locked — only the Main Admin can change the answers"
                              className={`${ROW_ACTION} text-[#9CA1A9] cursor-default`}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Locked</span>
                            </span>
                          )}
                          <button
                            type="button"
                            id={`view-summary-btn-${item.id}`}
                            onClick={() => router.push(`/inspections/${item.id}/summary`)}
                            className={`${ROW_ACTION} text-[#17181D] hover:bg-[#F0F1F4]`}
                            title="View the sectioned inspection summary"
                          >
                            <LayoutList className="w-3.5 h-3.5 text-[#6B6F76]" />
                            <span>Summary</span>
                          </button>
                          <button
                            type="button"
                            id={`view-report-btn-${item.id}`}
                            onClick={() => router.push(`/inspections/${item.id}`)}
                            className={`${ROW_ACTION} text-[#17181D] hover:bg-[#F0F1F4]`}
                            title="View the full printable report"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#6B6F76]" />
                            <span>Report</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-[#F0F1F4] bg-[#FAFBFC] flex justify-between items-center gap-3 shrink-0">
          <span className="text-xs text-[#6B6F76]">
            Showing {paginatedInspections.length} of {filteredInspections.length} records
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-[#9CA1A9] tabular-nums mr-1">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className={`${PAGER} ${
                page <= 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#F4F5F7] hover:text-[#17181D] cursor-pointer'
              }`}
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className={`${PAGER} ${
                page >= totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#F4F5F7] hover:text-[#17181D] cursor-pointer'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </FadeIn>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** One look for the three actions on a row, so they line up as a set. */
const ROW_ACTION =
  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap';

const PAGER =
  'h-8 px-3 border border-[#E4E6EB] rounded-lg bg-white text-xs font-semibold text-[#6B6F76] transition-colors';

/**
 * The state of a Monday round, carried three ways at once — the strip, the
 * icon tile and the dot — and always said in words beside them, because the
 * amber and the green are close for a protanope.
 */
const TONE = {
  good: { bar: 'bg-[#157F4B]', tile: 'bg-[#E6F4EC] text-[#157F4B]', dot: 'bg-[#157F4B]' },
  warn: { bar: 'bg-[#B4740A]', tile: 'bg-[#FDF3E2] text-[#B4740A]', dot: 'bg-[#B4740A]' },
  bad: { bar: 'bg-[#C8202D]', tile: 'bg-[#FDECEE] text-[#C8202D]', dot: 'bg-[#C8202D]' },
} as const;

/**
 * Fades a block in without moving it. For the records card only: it holds
 * a sticky heading row, and the rise `Reveal` gives would put a transform
 * around it. Switches off with the rest of the app's motion.
 */
const FadeIn: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <motion.div
    className={className}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: t(0.4), ease: EASE_OUT, delay: t(0.08) }}
  >
    {children}
  </motion.div>
);

/** Up to two initials, for the tile that stands in for a branch photo. */
function initials(name: string): string {
  return name
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

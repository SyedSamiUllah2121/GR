'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarCheck,
  Edit3,
  FileText,
  LayoutList,
  Lock,
  MapPin,
  PlayCircle,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { INSPECTION_KIND_SHORT, Inspection, Item, inspectionKindOf } from '../types';
import {
  clearActiveDraft,
  deleteInspection,
  getActiveDraft,
  getInspections,
  subscribeToStorage,
} from '../services/storage';
import {
  can,
  canEditInspection,
  canPerformInspection,
  visibleInspections,
} from '../services/permissions';
import { assignmentsFor, cancelAssignment, openAssignments, startAssignment } from '../services/assignments';
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
import { ScorePill } from './ScorePill';
import { formatDate } from '../services/reportModel';

export const RecordsListScreen: React.FC = () => {
  const router = useRouter();
  const checklist = useChecklist();
  const user = useCurrentUser();
  const [allInspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [activeDraft, setActiveDraft] = useState<Inspection | null>(() => getActiveDraft());
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
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

  /** The surprise visits waiting to be carried out, from where you sit. */
  const assignments = user
    ? user.role === 'inspector'
      ? assignmentsFor(user.id, inspections)
      : can(user, 'surprise.create')
        ? openAssignments(inspections)
        : []
    : [];

  /** A branch manager's own weekly round, and whether it is outstanding. */
  const monday =
    user?.role === 'branch-manager' && user.branchName
      ? mondayStatusFor(user.branchName, inspections)
      : null;

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

  const handleDiscardDraft = () => {
    if (!activeDraft || !window.confirm('Discard the unfinished draft?')) return;
    // A draft is written to the records store as it is answered, so clearing
    // the draft slot alone would leave the half-finished row behind
    deleteInspection(activeDraft.id);
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
    const started = startAssignment(assignment);
    router.push(`/inspections/${started.id}/checklist`);
  };

  const handleCancelAssignment = (assignment: Inspection) => {
    const result = cancelAssignment(assignment.id);
    setActionError(result.ok ? null : result.error ?? 'Could not withdraw that visit');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Header matching Clean Minimalism theme */}
      <header className="min-h-[5rem] bg-white border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#17181D]">
            {user?.role === 'inspector' ? 'My inspections' : 'Inspection Records'}
          </h2>
          <p className="text-[#6B6F76] text-xs mt-0.5">
            {/*
              What the count is *of* differs by role, so saying "records"
              flatly would be wrong for two of the three: an inspector is
              looking at their own visits, a manager at one branch's.
            */}
            {user?.role === 'branch-manager' && user.branchName
              ? `${user.branchName} — ${filteredInspections.length} submitted record${
                  filteredInspections.length === 1 ? '' : 's'
                }`
              : user?.role === 'inspector'
                ? `${filteredInspections.length} visit${
                    filteredInspections.length === 1 ? '' : 's'
                  } you have completed`
                : `Showing ${filteredInspections.length} recent submission${
                    filteredInspections.length === 1 ? '' : 's'
                  }`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 sm:flex-none">
            <input
              id="records-search-input"
              type="text"
              placeholder="Search branch..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#F6F6F8] border border-[#E6E7EB] rounded-md px-4 py-2 text-sm w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-[#C8202D] text-[#17181D] placeholder:text-[#6B6F76]/50"
            />
          </div>

          <span className="text-xs text-[#6B6F76] font-medium whitespace-nowrap">
            {FULL_CHECKLIST_LABEL} • {checklist.total} items
          </span>

          {/*
            Starting a visit belongs on the screen that lists visits, rather
            than on the dashboard, which reports rather than acts. Not offered
            to an inspector: their visits are assigned to them, and the button
            would lead to a screen that turns them away.
          */}
          {mayStartVisits && (
            <Link
              id="records-new-inspection-btn"
              href="/inspections/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-md transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>New inspection</span>
            </Link>
          )}
        </div>
      </header>

      {/* Main Body */}
      <div className="p-6 md:p-10 flex-1 flex flex-col">
        {actionError && (
          <div
            id="records-action-error"
            role="alert"
            className="mb-6 p-3 rounded-md bg-[#FDECEE] border border-[#C8202D]/25 text-[#C8202D] text-xs font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Dismiss"
              className="p-0.5 rounded hover:bg-[#C8202D]/10 cursor-pointer"
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
        {monday && (
          <div
            id="monday-round-card"
            className={`mb-6 p-4 rounded-md border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
              monday.done
                ? 'bg-[#EAF6EF] border-[#157F4B]/25'
                : monday.overdue
                  ? 'bg-[#FDECEE] border-[#C8202D]/25'
                  : 'bg-[#FDF3E2] border-[#B4740A]/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-md shrink-0 ${
                  monday.done
                    ? 'bg-[#157F4B]/10 text-[#157F4B]'
                    : monday.overdue
                      ? 'bg-[#C8202D]/10 text-[#C8202D]'
                      : 'bg-[#B4740A]/10 text-[#B4740A]'
                }`}
              >
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#17181D]">
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
                <p className="text-xs text-[#6B6F76] mt-0.5">
                  Week of {formatDate(monday.weekOf)}
                  {monday.done && monday.inspection
                    ? ` • Submitted at ${monday.inspection.score}%`
                    : monday.previous
                      ? ` • Last done ${formatDate(monday.previous.date)}`
                      : ' • No round on record yet'}
                </p>
              </div>
            </div>

            {!monday.done && (
              <div className="self-end sm:self-auto">
                {monday.inProgress && monday.inspection ? (
                  <button
                    type="button"
                    id="monday-resume-btn"
                    onClick={() =>
                      router.push(`/inspections/${monday.inspection!.id}/checklist`)
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[#C8202D] hover:bg-[#A81823] text-white rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    Carry on
                  </button>
                ) : (
                  <Link
                    id="monday-start-btn"
                    href="/inspections/new"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[#C8202D] hover:bg-[#A81823] text-white rounded-md transition-colors whitespace-nowrap"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    Start it now
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/*
          Surprise visits waiting to be carried out. An inspector sees the
          ones handed to them and can start each; the admin sees every
          outstanding one and can withdraw it.
        */}
        {assignments.length > 0 && (
          <section id="assignments" className="mb-6">
            <div className="flex items-baseline justify-between gap-3 mb-2.5">
              <h3 className="text-sm font-bold text-[#17181D] flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#C8202D]" />
                {user?.role === 'inspector'
                  ? 'Surprise visits assigned to you'
                  : 'Surprise visits outstanding'}
              </h3>
              <span className="text-xs text-[#6B6F76] shrink-0">
                {assignments.length} waiting to be started
              </span>
            </div>

            <ul className="space-y-2">
              {assignments.map((visit) => (
                <li
                  key={visit.id}
                  id={`assignment-${visit.id}`}
                  className="bg-white border border-[#E6E7EB] rounded-md p-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-xs"
                >
                  <span className="w-9 h-9 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#17181D] truncate">
                      {visit.branchName}
                    </p>
                    <p className="text-[11px] text-[#6B6F76] truncate">
                      {user?.role === 'inspector'
                        ? `Assigned ${formatDate(visit.date)} • ${FULL_CHECKLIST_LABEL}`
                        : `${visit.inspectorName} • assigned ${formatDate(visit.date)}`}
                    </p>
                  </div>

                  {canPerformInspection(user, visit) && (
                    <button
                      type="button"
                      id={`assignment-start-${visit.id}`}
                      onClick={() => handleStartAssignment(visit)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[#C8202D] hover:bg-[#A81823] text-white rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Start visit
                    </button>
                  )}

                  {can(user, 'surprise.create') && (
                    <button
                      type="button"
                      id={`assignment-cancel-${visit.id}`}
                      onClick={() => handleCancelAssignment(visit)}
                      title={`Withdraw the visit to ${visit.branchName}`}
                      className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-[#6B6F76] hover:text-[#C8202D] hover:bg-[#FDECEE] border border-[#E6E7EB] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Withdraw
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          The unfinished draft — unless it is the very round the card above
          is already offering to carry on, in which case two banners would be
          telling one person the same thing twice.
        */}
        {activeDraft &&
          activeDraft.status === 'draft' &&
          canPerformInspection(user, activeDraft) &&
          monday?.inspection?.id !== activeDraft.id && (
          <div
            id="active-draft-banner"
            className="mb-6 p-4 rounded-md bg-[#FDF3E2] border border-[#B4740A]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#B4740A]/10 rounded-md text-[#B4740A]">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#17181D]">
                  Unfinished draft in progress for{' '}
                  <span className="font-bold text-[#B4740A]">{activeDraft.branchName}</span>
                </p>
                <p className="text-xs text-[#6B6F76]">
                  {FULL_CHECKLIST_LABEL} • Started {formatDate(activeDraft.date)} at{' '}
                  {activeDraft.time}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                id="resume-draft-btn"
                onClick={() => router.push(`/inspections/${activeDraft.id}/checklist`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#C8202D] hover:bg-[#A81823] text-white rounded-md transition-colors cursor-pointer"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
              <button
                id="discard-draft-btn"
                onClick={handleDiscardDraft}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#C8202D] hover:bg-[#FDECEE] border border-[#C8202D]/30 rounded-md transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
            </div>
          </div>
        )}

        {/* Table Container Card */}
        <div className="bg-white border border-[#E6E7EB] rounded-md flex flex-col shadow-xs overflow-hidden">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#FAFAFA] z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#6B6F76] font-bold border-b border-[#E6E7EB]">
                    Branch Name
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#6B6F76] font-bold border-b border-[#E6E7EB]">
                    Flagged Items
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#6B6F76] font-bold border-b border-[#E6E7EB]">
                    Date &amp; Time
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#6B6F76] font-bold border-b border-[#E6E7EB] text-right">
                    Score
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#6B6F76] font-bold border-b border-[#E6E7EB] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E7EB]">
                {paginatedInspections.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-6 text-center text-sm text-[#6B6F76]">
                      <p className="font-medium text-[#17181D]">No inspection records found</p>
                      <p className="text-xs text-[#6B6F76] mt-1">
                        {searchQuery
                          ? 'Try adjusting your search query.'
                          : 'Start a new weekly inspection to begin logging records.'}
                      </p>
                      {searchQuery ? (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="mt-3 text-xs text-[#C8202D] font-semibold hover:underline cursor-pointer"
                        >
                          Clear search
                        </button>
                      ) : null}
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
                        className="hover:bg-[#FAFAFA] transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-5 text-sm font-semibold text-[#17181D]">
                          {item.branchName}
                          {item.status === 'draft' && (
                            <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-[#FDECEE] text-[#C8202D]">
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
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-[#FFF6E5] text-[#8A5A08]">
                              <Zap className="w-2.5 h-2.5" />
                              {INSPECTION_KIND_SHORT.surprise}
                            </span>
                          )}
                          <span className="block mt-1 text-[11px] font-normal text-[#6B6F76] truncate">
                            {item.inspectorName ?? '—'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-sm text-[#6B6F76]">
                          {flagged === 0 ? (
                            <span className="text-[#157F4B] font-semibold">None</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(['critical', 'high', 'medium', 'low'] as const)
                                .filter((severity) => counts[severity] > 0)
                                .map((severity) => (
                                  <span
                                    key={severity}
                                    className="inline-flex items-center gap-1"
                                    title={`${counts[severity]} ${severity}`}
                                  >
                                    <PriorityBadge severity={severity} size="sm" />
                                    <span className="text-xs font-bold text-[#17181D] tabular-nums">
                                      {counts[severity]}
                                    </span>
                                  </span>
                                ))}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-sm text-[#6B6F76]">
                          {formatDate(item.date)} · {item.time}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <ScorePill score={item.score} />
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#C8202D] bg-[#FDECEE] hover:bg-[#FBDCDF] rounded-md transition-colors cursor-pointer"
                                title="Edit and mark checklist items"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            ) : (
                              <span
                                id={`locked-btn-${item.id}`}
                                title="Submitted and locked — only the Main Admin can change the answers"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#9CA1A9] rounded-md"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                <span>Locked</span>
                              </span>
                            )}
                            <button
                              type="button"
                              id={`view-summary-btn-${item.id}`}
                              onClick={() => router.push(`/inspections/${item.id}/summary`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#6B6F76] hover:bg-[#E6E7EB]/40 rounded-md transition-colors cursor-pointer"
                              title="View the sectioned inspection summary"
                            >
                              <LayoutList className="w-3.5 h-3.5" />
                              <span>Summary</span>
                            </button>
                            <button
                              type="button"
                              id={`view-report-btn-${item.id}`}
                              onClick={() => router.push(`/inspections/${item.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#6B6F76] hover:bg-[#E6E7EB]/40 rounded-md transition-colors cursor-pointer"
                              title="View the full printable report"
                            >
                              <FileText className="w-3.5 h-3.5" />
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
          <div className="p-4 border-t border-[#E6E7EB] bg-[#FAFAFA] flex justify-between items-center shrink-0">
            <span className="text-xs text-[#6B6F76]">
              Showing {paginatedInspections.length} of {filteredInspections.length} records
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className={`px-3 py-1 border border-[#E6E7EB] rounded-md bg-white text-xs text-[#6B6F76] transition-colors ${
                  page <= 1
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-[#F6F6F8] cursor-pointer'
                }`}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className={`px-3 py-1 border border-[#E6E7EB] rounded-md bg-white text-xs text-[#6B6F76] transition-colors ${
                  page >= totalPages
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-[#F6F6F8] cursor-pointer'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

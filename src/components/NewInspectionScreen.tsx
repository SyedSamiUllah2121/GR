'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Lock,
  PlayCircle,
  Plus,
  Shuffle,
  Store,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  Branch,
  INSPECTION_KIND_LABEL,
  INSPECTION_TYPE_KEYS,
  INSPECTION_TYPE_LABEL,
  INSPECTORS,
  Inspection,
  InspectionKind,
  InspectionType,
} from '../types';
import { FULL_CHECKLIST_LABEL } from '../data/defaultChecklist';
import { useChecklist } from '../hooks/useChecklist';
import { useDialog } from '../hooks/useDialog';
import { useConfirm } from './ConfirmProvider';
import { useBranches } from '../hooks/useBranches';
import { useUsers } from '../hooks/useUsers';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useSettings } from '../hooks/useSettings';
import {
  MAX_AUTO_SURPRISE_DAYS,
  isRandomAssignmentOn,
  saveSetting,
} from '../services/settings';
import { fromLocalInputValue, toLocalInputValue } from '../services/localDateTime';
import { activeBranches, addBranch, branchUsage, removeBranch } from '../services/branchStore';
import { inspectors as inspectorAccounts } from '../services/userStore';
import { can, canDiscardDraft, filingBranchesFor, fixedBranchFor } from '../services/permissions';
import {
  createSurpriseVisit,
  nextAutoSurpriseDue,
  outstandingVisitAt,
  outstandingVisitFor,
  randomBranch,
  randomInspector,
  scheduleLabel,
} from '../services/assignments';
import {
  clearActiveDraft,
  deleteInspection,
  getActiveDraft,
  saveActiveDraft,
} from '../services/storage';
import { useRouter } from 'next/navigation';
import { formatDate, formatDateTime, formatTimeOnly } from '../services/reportModel';
import { BUTTON, CARD, PageHeader } from './ui';
import { Reveal, Stagger, StaggerItem } from './motion';

/** Sentinel for the "not on the list" option. */
const OTHER_INSPECTOR = '__other__';

/** Sentinels for "let the system pick", on the surprise-visit form. */
const RANDOM = '__random__';

export const NewInspectionScreen: React.FC = () => {
  const router = useRouter();
  const confirm = useConfirm();
  const checklist = useChecklist();
  const branches = activeBranches(useBranches());
  const user = useCurrentUser();
  const availableInspectors = inspectorAccounts(useUsers());

  /*
   * What this screen offers depends entirely on who is looking at it.
   *
   *   admin           either kind of visit, at any branch — and a surprise
   *                   visit is *assigned* rather than started, since the
   *                   admin is not the one going
   *   branch manager  their own branch's Monday round, and only that: the
   *                   branch is not a choice, and neither is who does it
   *
   * An inspector never reaches here at all — AppShell turns them away, and
   * their visits arrive already created.
   */
  const mayAssignSurprise = can(user, 'surprise.create');
  const mayPickBranch = can(user, 'inspections.viewAll');
  /*
   * Adding and closing branches is a separate right from choosing between
   * them. Asked for by name rather than inferred from who can see the
   * picker: the two happen to coincide today, and a permission that is only
   * enforced by coincidence is one that quietly stops being enforced.
   */
  const mayManageBranches = can(user, 'branches.manage');
  const fixedBranch = fixedBranchFor(user);

  const [kind, setKind] = useState<InspectionKind>('monday');
  const [existingDraft, setExistingDraft] = useState<Inspection | null>(() => getActiveDraft());
  const [selectedBranch, setSelectedBranch] = useState(() => branches[0]?.name ?? '');

  /*
   * A manager who runs more than one branch picks between their own, and
   * only their own. Held apart from `selectedBranch`, which ranges over the
   * whole estate for the admin.
   */
  const ownBranches = filingBranchesFor(user);
  const choosesOwnBranch = ownBranches !== null && ownBranches.length > 1;
  const [ownPick, setOwnPick] = useState<string | null>(null);

  /*
   * The inspections page links here naming the branch whose round was
   * started, so a manager with two lands on the right one. Read once on
   * arrival, and only ever honoured for a branch that is theirs.
   */
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('branch');
    if (asked) setOwnPick(asked);
  }, []);

  /*
   * A branch manager's branch is not up for choosing beyond their own, so the
   * selection is overridden rather than merely defaulted — that way it stays
   * right even if the account's branches are changed while this form is open.
   */
  const branchName =
    fixedBranch ??
    (choosesOwnBranch
      ? ownPick && ownBranches.includes(ownPick)
        ? ownPick
        : ownBranches[0]
      : selectedBranch);

  /**
   * Whether the system is allowed to place a surprise visit itself. The
   * admin's switch, below — everyone raising a visit is bound by it.
   */
  const settings = useSettings();
  const randomOn = settings.randomAssignment;
  /** 0 while the system raises nothing of its own accord. */
  const autoDays = settings.autoSurpriseDays;


  /** Who a surprise visit goes to; RANDOM lets the system draw one. */
  const [assignTo, setAssignTo] = useState<string>(RANDOM);
  /** Where it goes; RANDOM draws from the branches left in the current round. */
  const [surpriseBranch, setSurpriseBranch] = useState<string>(RANDOM);

  /*
   * Both fields default to letting the system choose, which is no longer an
   * answer once the switch is off — a select holding a value its own list
   * does not offer renders blank. Cleared rather than pinned to the first
   * branch, so turning the switch off asks the question rather than quietly
   * answering it.
   */
  useEffect(() => {
    if (randomOn) return;
    setSurpriseBranch((v) => (v === RANDOM ? '' : v));
    setAssignTo((v) => (v === RANDOM ? '' : v));
  }, [randomOn]);
  /**
   * When the visit is due, as a `datetime-local` value. Empty means as soon
   * as the inspector can get there — which is what every assignment was
   * before a time could be named, so it stays the default.
   */
  const [scheduledAt, setScheduledAt] = useState<string>('');
  /**
   * The far end of the window, when the visit is to happen within one rather
   * than at a moment. Meaningless without a start, and cleared with it.
   */
  const [scheduledUntil, setScheduledUntil] = useState<string>('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignDone, setAssignDone] = useState<string | null>(null);

  /*
   * Who and where is already spoken for. One unfinished surprise visit per
   * branch and per inspector, so the two lists below say which of each are not
   * available rather than letting somebody choose one and be refused — the
   * point of the rule is that nobody sets a second one up by mistake, and an
   * error after the fact is a mistake that has already been made.
   *
   * Re-read when a visit is raised from this form, which is the one thing that
   * changes it without leaving the screen.
   */
  const busyBranches = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((b) => {
      const visit = outstandingVisitAt(b.name);
      if (visit) map.set(b.name, visit.status === 'assigned' ? 'visit waiting' : 'visit under way');
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, assignDone]);

  const busyInspectors = useMemo(() => {
    const map = new Map<string, string>();
    availableInspectors.forEach((account) => {
      const visit = outstandingVisitFor(account.id);
      if (visit) map.set(account.id, visit.branchName);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableInspectors, assignDone]);
  /*
   * When the next automatic visit falls due, for the line under the field.
   * Re-read whenever the interval changes or a visit is raised from this
   * form, both of which move it — an interval the admin cannot see the
   * consequence of is a number they have to take on trust.
   */
  const autoDue = useMemo(
    () => nextAutoSurpriseDue(randomOn ? autoDays : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [randomOn, autoDays, assignDone]
  );

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
    if (branch.name === branchName) {
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
  /** Why a Monday round could not be opened, when the store refused it. */
  const [startError, setStartError] = useState<string | null>(null);

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

  /**
   * Raises a surprise visit and hands it over. It is *not* started here — the
   * admin is not the one going, so what this produces is an assignment
   * waiting in an inspector's list.
   */
  const handleAssignSurprise = () => {
    if (!user) return;

    /*
     * Read again here rather than trusted from the render above: this form
     * can sit open while the switch is thrown in another tab, and a draw
     * carried out after it was turned off would be exactly what the switch
     * exists to prevent.
     */
    const mayDraw = isRandomAssignmentOn();
    if (!mayDraw && (surpriseBranch === RANDOM || assignTo === RANDOM)) {
      setAssignError(
        'Automatic assignment has been turned off — choose the branch and the inspector'
      );
      return;
    }

    const branch =
      surpriseBranch === RANDOM ? randomBranch(branches)?.name ?? '' : surpriseBranch;
    const inspector =
      assignTo === RANDOM ? randomInspector(availableInspectors)?.id ?? '' : assignTo;

    if (!inspector) {
      // Two different problems, and telling them apart is the difference
      // between "pick someone" and "there is nobody to pick"
      setAssignError(
        availableInspectors.length === 0
          ? 'There are no inspector accounts to assign this to'
          : 'Choose the inspector to send'
      );
      return;
    }

    const result = createSurpriseVisit({
      branchName: branch,
      inspectorId: inspector,
      raisedBy: user,
      // The browser gives this back in the admin's own timezone; the service
      // is handed a real instant and does the checking
      scheduledFor: fromLocalInputValue(scheduledAt),
      scheduledUntil: fromLocalInputValue(scheduledUntil),
    });

    if (!result.ok || !result.inspection) {
      setAssignError(result.error ?? 'Could not create the surprise visit');
      return;
    }

    setAssignError(null);
    // Reads back the booked time so the admin can see the draw landed where
    // they meant it to, rather than trusting the form they just cleared
    setAssignDone(
      `${result.inspection.inspectorName} has been assigned a surprise visit to ${
        result.inspection.branchName
      }${
        scheduleLabel(result.inspection, formatDateTime, formatTimeOnly)
          ? `, due ${scheduleLabel(result.inspection, formatDateTime, formatTimeOnly)}`
          : ''
      }`
    );
    setScheduledAt('');
    setScheduledUntil('');
    // Reset the draw so a second visit is not silently the same one again
    setAssignTo(RANDOM);
    setSurpriseBranch(RANDOM);
  };

  /**
   * The name that goes on the record.
   *
   * A branch manager carries out their own branch's round, so it is theirs
   * and not a choice. The admin picks, because they may be standing in or
   * recording a round somebody else walked.
   */
  const performerName = mayPickBranch
    ? inspectorChoice === OTHER_INSPECTOR
      ? otherInspector.trim()
      : inspectorChoice.trim()
    : user?.name ?? '';

  const handleStartInspection = async (e: React.FormEvent) => {
    e.preventDefault();

    if (kind === 'surprise') {
      handleAssignSurprise();
      return;
    }

    const trimmedName = performerName;
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
      /*
       * There is one draft slot and it is the browser's, not the account's —
       * so on a shared tablet the draft in the way can belong to somebody
       * else. A surprise visit is an instruction the admin raised, and
       * starting a Monday round is not grounds for deleting it: the slot is
       * freed and the visit is left where it is, still in the inspector's
       * list. Only a draft this account could have discarded outright is.
       */
      const mayDelete = canDiscardDraft(user, existingDraft);
      const proceed = await confirm({
        title: mayDelete ? 'Replace the unfinished draft?' : 'Set the other visit aside?',
        body: mayDelete
          ? `Starting a new inspection discards the draft already open for ${existingDraft.branchName}.`
          : `The unfinished visit to ${existingDraft.branchName} is not yours to discard. It is kept, and stays in the list of whoever it was assigned to.`,
        confirmLabel: mayDelete ? 'Replace draft' : 'Set it aside',
        destructive: mayDelete,
      });
      if (!proceed) return;
      if (mayDelete) deleteInspection(existingDraft.id);
      clearActiveDraft();
    }

    const newId = `insp-${Date.now()}`;
    const newInspection: Inspection = {
      id: newId,
      branchName,
      date: currentDateISO,
      time: currentTimeStr,
      status: 'draft',
      score: 0,
      signature: null,
      answers: {},
      currentSectionIndex: 0,
      inspectorName: trimmedName,
      inspectionType,
      // Started from this form by a manager or the admin, which is the
      // branch's own weekly round. Surprise visits never reach here — they
      // are assigned above and started from the inspector's own list.
      kind: 'monday',
      // The report measures how long the visit took from here
      startedAt: new Date().toISOString(),
    };

    /*
     * Only onto the checklist once the draft is actually stored. Going there
     * regardless opened a checklist for a record that did not exist, and every
     * answer given on it went nowhere.
     */
    if (!saveActiveDraft(newInspection)) {
      setStartError('Could not start the inspection — this browser’s storage is full');
      return;
    }
    setStartError(null);
    router.push(`/inspections/${newId}/checklist`);
  };

  const handleResumeDraft = () => {
    if (existingDraft) {
      router.push(`/inspections/${existingDraft.id}/checklist`);
    }
  };

  /*
   * Throwing the draft away, or just putting it down — decided by whose it is.
   * Asked here as well as where the button is worded, because this one deletes
   * a record and the screen can sit open while the answer changes underneath.
   */
  const handleDiscardDraft = async () => {
    if (!existingDraft) return;
    const mayDelete = canDiscardDraft(user, existingDraft);
    const ok = await confirm({
      title: mayDelete ? 'Discard this unfinished draft?' : 'Set this visit aside?',
      body: mayDelete
        ? 'The answers recorded on it so far are deleted.'
        : `The visit to ${existingDraft.branchName} was assigned by the admin, so it is kept. The answers so far stay on it.`,
      confirmLabel: mayDelete ? 'Discard draft' : 'Set it aside',
      destructive: mayDelete,
    });
    if (!ok) return;
    // Also drop the row the draft left in the records store as it was answered
    if (mayDelete) deleteInspection(existingDraft.id);
    clearActiveDraft();
    setExistingDraft(null);
  };

  /*
   * Wider than the reading column the rest of the app uses, because this is a
   * form rather than something to read: at 42rem every field sat on a line of
   * its own and the whole of a surprise visit could not be seen at once, which
   * is exactly when someone books the wrong branch for the wrong inspector.
   * The fields pair up from `md` and the page stops scrolling.
   */
  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 max-w-5xl mx-auto w-full space-y-6">
      <Reveal>
        {/* Back link */}
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] mb-4 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to inspection records</span>
        </button>

        <PageHeader
          eyebrow={kind === 'surprise' ? 'Surprise visit' : 'Inspections'}
          title="New inspection"
          subtitle={
            kind === 'surprise'
              ? 'Send an inspector to a branch unannounced. Every branch runs the same full checklist.'
              : fixedBranch
                ? `This week's round for ${fixedBranch}. Every branch runs the same full checklist.`
                : choosesOwnBranch
                  ? 'Pick which of your branches this week’s round is for. Every branch runs the same full checklist.'
                  : 'Pick the branch to begin. Every branch runs the same full checklist.'
          }
        />
      </Reveal>

      {/*
        Which kind of visit. Only the admin sees this: a branch manager can
        raise one kind, so a picker with a single option would be furniture.
      */}
      {mayAssignSurprise && (
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StaggerItem>
            <KindCard
              id="visit-kind-monday"
              selected={kind === 'monday'}
              icon={CalendarCheck}
              title={INSPECTION_KIND_LABEL.monday}
              blurb="The branch's own weekly round. Start it now and fill it in."
              onSelect={() => {
                setKind('monday');
                setAssignDone(null);
                setAssignError(null);
              }}
            />
          </StaggerItem>
          <StaggerItem>
            <KindCard
              id="visit-kind-surprise"
              selected={kind === 'surprise'}
              icon={Zap}
              title={INSPECTION_KIND_LABEL.surprise}
              blurb="Assign a branch to an inspector. They carry it out unannounced."
              onSelect={() => {
                setKind('surprise');
                setNameError(null);
              }}
            />
          </StaggerItem>
        </Stagger>
      )}

      {/* Existing draft warning banner */}
      {existingDraft && existingDraft.status === 'draft' && (
        <Reveal delay={0.05}>
          <div
            id="existing-draft-notice"
            className={`${CARD} relative overflow-hidden p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[#B4740A]" />
            <div className="flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-[#FDF3E2] text-[#B4740A] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#17181D]">
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
                className={`${BUTTON.primary} h-9 px-3.5`}
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
              {/* Deleting a record, or freeing the slot — never the same button */}
              {canDiscardDraft(user, existingDraft) ? (
                <button
                  id="existing-draft-discard-btn"
                  type="button"
                  onClick={handleDiscardDraft}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-[#C8202D] bg-white border border-[#C8202D]/30 rounded-xl hover:bg-[#FDECEE] transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>
              ) : (
                <button
                  id="existing-draft-set-aside-btn"
                  type="button"
                  onClick={handleDiscardDraft}
                  title="Keeps the visit and the answers on it"
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-[#6B6F76] bg-white border border-[#E4E6EB] rounded-xl hover:bg-[#F4F5F7] hover:text-[#17181D] transition-colors cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>Set aside</span>
                </button>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/*
        The form. Risen into place like the cards above it — nothing inside
        is fixed or sticky: the branch list is absolutely placed, and the
        remove-branch dialog is rendered outside this, at the foot of the page.
      */}
      <Reveal delay={0.08}>
      <div className={`${CARD}`}>
        <form onSubmit={handleStartInspection}>
          <FormSection
            step={1}
            title={kind === 'surprise' ? 'Where, and who goes' : 'Visit details'}
            caption={
              kind === 'surprise'
                ? 'Both can be left to the system, and the time is optional.'
                : 'The branch, who is carrying it out, and why.'
            }
          >
          {/*
            Branch.

            The admin chooses from a custom picker rather than a <select>,
            because each branch carries its own remove button and an <option>
            cannot hold one. A branch manager has no choice to make here, and
            no business removing branches, so they get the name and a padlock
            — a disabled dropdown would imply there was an alternative.
          */}
          {kind === 'monday' && !mayPickBranch && choosesOwnBranch && (
            <div>
              <label htmlFor="own-branch-select" className={LABEL}>
                Branch
              </label>
              <SelectShell>
                <select
                  id="own-branch-select"
                  value={branchName}
                  onChange={(e) => setOwnPick(e.target.value)}
                  className={`${SELECT} font-semibold`}
                >
                  {ownBranches.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </SelectShell>
              <p className={HINT}>
                You inspect your own branches — one round each, every week.
              </p>
            </div>
          )}

          {kind === 'monday' && !mayPickBranch && !choosesOwnBranch && (
            <div>
              <span className={LABEL}>Branch</span>
              <p id="fixed-branch" className={READONLY}>
                <Store className="w-4 h-4 text-[#6B6F76] shrink-0" />
                <span className="truncate">{fixedBranch}</span>
                <Lock className="w-3.5 h-3.5 text-[#9CA1A9] ml-auto shrink-0" />
              </p>
              <p className={HINT}>
                You inspect your own branch — this cannot be changed.
              </p>
            </div>
          )}

          {kind === 'monday' && mayPickBranch && (
          <div ref={branchMenuRef}>
            <span className={LABEL}>Branch</span>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <button
                  type="button"
                  id="branch-select"
                  onClick={() => setBranchMenuOpen((v) => !v)}
                  aria-expanded={branchMenuOpen}
                  aria-haspopup="listbox"
                  className={`${FIELD} flex items-center justify-between gap-2 text-left cursor-pointer ${
                    branchMenuOpen ? 'border-[#C8202D]/60 ring-4 ring-[#C8202D]/10' : ''
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Store className="w-4 h-4 text-[#9CA1A9] shrink-0" />
                    <span className={`truncate ${selectedBranch ? 'font-semibold' : 'text-[#9CA1A9]'}`}>
                      {selectedBranch || 'Select a branch'}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#9CA1A9] shrink-0 transition-transform duration-200 ${
                      branchMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {branchMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Branch"
                    className="absolute z-30 top-[calc(100%+0.375rem)] left-0 right-0 bg-white border border-[#E8E9EE] rounded-xl shadow-[0_16px_40px_-12px_rgba(16,24,40,0.25)] overflow-hidden max-h-72 overflow-y-auto p-1"
                  >
                    {branches.map((b) => {
                      const selected = b.name === selectedBranch;
                      return (
                        <div
                          key={b.id}
                          className={`flex items-stretch rounded-lg transition-colors ${
                            selected ? 'bg-[#FDECEE]' : 'hover:bg-[#F7F8FA]'
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
                            className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer"
                          >
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block text-sm truncate ${
                                  selected
                                    ? 'font-bold text-[#A81823]'
                                    : 'font-semibold text-[#17181D]'
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

                          {mayManageBranches && (
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
                            className="px-3 my-1 mr-1 rounded-md flex items-center text-[#C9CCD2] hover:text-[#C8202D] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#C9CCD2] transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {mayManageBranches && (
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
                  className={`inline-flex items-center gap-1.5 h-11 px-3.5 text-xs font-bold rounded-xl border transition-all cursor-pointer shrink-0 ${
                    addingBranch
                      ? 'bg-[#FDECEE] border-[#C8202D]/40 text-[#A81823]'
                      : 'bg-white border-[#E4E6EB] text-[#17181D] hover:border-[#C8202D]/40 hover:text-[#C8202D] shadow-xs'
                  }`}
                >
                  <Plus className={`w-4 h-4 transition-transform duration-200 ${addingBranch ? 'rotate-45' : ''}`} />
                  <span className="hidden sm:inline">New branch</span>
                </button>
              )}
            </div>

            {addingBranch && mayManageBranches && (
              <div className="mt-3 p-4 rounded-xl border border-[#E8E9EE] bg-[#FAFBFC] space-y-2.5">
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
                    className={`${FIELD} h-10 flex-1`}
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
                    className={`${FIELD} h-10 flex-1`}
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleAddBranch}
                      disabled={!newBranchName.trim()}
                      className={BUTTON.primary}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingBranch(false)}
                      className="h-10 px-3 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] rounded-xl hover:bg-white transition-colors cursor-pointer"
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
              <p role="alert" className="mt-2 text-xs font-semibold text-[#C8202D]">{branchError}</p>
            )}
          </div>
          )}

          {/*
            A surprise visit is planned rather than filled in, so the form is
            two questions: where, and who goes. Both can be left to the
            system — an admin who picks the branch every time will drift
            towards the ones they already worry about, which is the opposite
            of surprise coverage.
          */}
          {kind === 'surprise' && (
            <>
              {/*
                The admin's switch over the whole scheme. Shown to them only:
                everyone raising a visit is bound by it, and one person
                decides it. Placed here rather than on a settings screen of
                its own because this is the only form its effect is visible
                in — the two fields below change the moment it is thrown.
              */}
              {can(user, 'settings.manage') && (
                <div className="rounded-xl border border-[#E8E9EE] bg-[#FAFBFC] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          randomOn ? 'bg-[#E6F4EC] text-[#157F4B]' : 'bg-[#F0F1F4] text-[#6B6F76]'
                        }`}
                      >
                        <Shuffle className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[#17181D]">Automatic assignment</p>
                        <p className="text-[11px] text-[#6B6F76] mt-0.5 leading-relaxed">
                          {randomOn
                            ? 'On — a visit can be left to the system, which rotates through every branch before repeating one.'
                            : 'Off — you name the branch and the inspector on every surprise visit.'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      id="random-assignment-toggle"
                      role="switch"
                      aria-checked={randomOn}
                      aria-label="Let the system place surprise visits"
                      onClick={() => {
                        setAssignDone(null);
                        setAssignError(
                          saveSetting('randomAssignment', !randomOn)
                            ? null
                            : 'Could not save that setting — try again'
                        );
                      }}
                      className={`shrink-0 relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-[#157F4B]/20 ${
                        randomOn ? 'bg-[#157F4B]' : 'bg-[#C9CCD2]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,0.3)] transition-transform duration-200 ease-out ${
                          randomOn ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {!randomOn && (
                    <p className="text-[11px] text-[#8A5A08] font-semibold mt-3 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      Choosing by hand tends to favour the branches you already worry about,
                      which is what the rotation is for.
                    </p>
                  )}

                  {/*
                    How often the system raises one without being asked.
                    Under the switch rather than beside it because it is the
                    same decision taken further: the switch says the draw may
                    be used, this says it is used on a clock. Hidden with the
                    switch off, when there is no draw for a clock to run.
                  */}
                  {randomOn && (
                    <div className="mt-4 pt-4 border-t border-[#E8E9EE] flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <label
                          htmlFor="auto-surprise-days"
                          className="text-xs font-bold text-[#17181D] flex items-center gap-1.5"
                        >
                          <CalendarClock className="w-3.5 h-3.5 text-[#6B6F76] shrink-0" />
                          Raise one automatically
                        </label>
                        <p className="text-[11px] text-[#6B6F76] mt-1 leading-relaxed">
                          {autoDays > 0 ? (
                            <>
                              Every {autoDays} day{autoDays === 1 ? '' : 's'} a visit is drawn
                              and handed out on its own, to a branch the rotation has not been
                              to this round.
                              {autoDue && (
                                <span className="block mt-0.5 font-semibold text-[#17181D]">
                                  Next one due {formatDate(autoDue)}.
                                </span>
                              )}
                            </>
                          ) : (
                            'Off — surprise visits happen only when someone raises one here. Set a number of days to have the system keep them coming.'
                          )}
                        </p>
                      </div>

                      <span className="shrink-0 flex items-center gap-2">
                        <input
                          id="auto-surprise-days"
                          type="number"
                          min={0}
                          max={MAX_AUTO_SURPRISE_DAYS}
                          step={1}
                          value={autoDays}
                          onChange={(e) => {
                            /*
                             * Empty reads as 0, which is off — clearing the
                             * field to type a new number must not be taken as
                             * a schedule of every zero days.
                             */
                            const days = Math.min(
                              Math.max(Math.round(Number(e.target.value) || 0), 0),
                              MAX_AUTO_SURPRISE_DAYS
                            );
                            if (!saveSetting('autoSurpriseDays', days)) {
                              setAssignError('Could not save that setting — try again');
                            }
                          }}
                          className={`${FIELD} h-10 w-[4.5rem] px-2 font-semibold text-center tabular-nums`}
                        />
                        <span className="text-[11px] font-semibold text-[#6B6F76]">days</span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Where, and who — the two halves of one decision, read together */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="surprise-branch-select" className={LABEL}>
                  Branch to visit
                </label>
                <SelectShell>
                  <select
                    id="surprise-branch-select"
                    value={surpriseBranch}
                    onChange={(e) => {
                      setSurpriseBranch(e.target.value);
                      setAssignError(null);
                      setAssignDone(null);
                    }}
                    className={SELECT}
                  >
                    {randomOn ? (
                      <option value={RANDOM}>Let the system choose</option>
                    ) : (
                      <option value="">Choose a branch</option>
                    )}
                    {branches.map((b) => {
                      const busy = busyBranches.get(b.name);
                      return (
                        <option key={b.id} value={b.name} disabled={!!busy}>
                          {b.name}
                          {b.location ? ` — ${b.location}` : ''}
                          {busy ? ` (${busy})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </SelectShell>
                {surpriseBranch === RANDOM && (
                  <p className={`${HINT} flex items-start gap-1.5`}>
                    <Shuffle className="w-3 h-3 mt-0.5 shrink-0" />
                    Drawn at random from the branches not yet visited this round, so
                    every branch comes up once before any comes up twice.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="surprise-inspector-select" className={LABEL}>
                  Inspector to send
                </label>
                <SelectShell>
                  <select
                    id="surprise-inspector-select"
                    value={assignTo}
                    onChange={(e) => {
                      setAssignTo(e.target.value);
                      setAssignError(null);
                      setAssignDone(null);
                    }}
                    className={SELECT}
                  >
                    {randomOn ? (
                      <option value={RANDOM}>Let the system choose</option>
                    ) : (
                      <option value="">Choose an inspector</option>
                    )}
                    {availableInspectors.map((account) => {
                      const at = busyInspectors.get(account.id);
                      return (
                        <option key={account.id} value={account.id} disabled={!!at}>
                          {account.name}
                          {at ? ` (already at ${at})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </SelectShell>
                {assignTo === RANDOM ? (
                  <p className={`${HINT} flex items-start gap-1.5`}>
                    <Shuffle className="w-3 h-3 mt-0.5 shrink-0" />
                    Drawn from the inspectors carrying the fewest outstanding visits.
                  </p>
                ) : (
                  <p className={HINT}>
                    They will see the branch in their own list, and nothing else.
                  </p>
                )}
                {availableInspectors.length === 0 && (
                  <p className="mt-1.5 text-[11px] font-semibold text-[#C8202D]">
                    No inspector accounts yet — add one under Users first.
                  </p>
                )}
              </div>
              </div>

              {/*
                When it is due. Optional, and empty by default, because an
                unannounced visit usually means "go when you can" — naming a
                time is for the ones that have to land on a particular moment,
                and the inspector's list then reads as a diary rather than a
                pile.
              */}
              <div>
                {/*
                  The two ends of the window on one line, so a booking reads
                  left to right as the sentence it is.
                */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="surprise-when-input" className={LABEL}>
                      When <span className={OPTIONAL}>(optional)</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="surprise-when-input"
                        type="datetime-local"
                        value={scheduledAt}
                        /*
                          Stops the picker offering a time that has already
                          gone. The service checks again, because a `min` on an
                          input is a courtesy rather than a rule.
                        */
                        min={toLocalInputValue(new Date().toISOString())}
                        onChange={(e) => {
                          setScheduledAt(e.target.value);
                          setAssignError(null);
                          setAssignDone(null);
                        }}
                        className={`${FIELD} flex-1 w-auto min-w-[11rem]`}
                      />
                      {scheduledAt && (
                        <button
                          type="button"
                          onClick={() => {
                            // The end goes with the start: an end on its own
                            // is a window with no opening, refused anyway
                            setScheduledAt('');
                            setScheduledUntil('');
                            setAssignError(null);
                            setAssignDone(null);
                          }}
                          className={CLEAR_BUTTON}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/*
                    The far end of the window, offered only once there is a
                    start for it to run from — an end on its own is refused, so
                    showing the field before then only invites the error.
                  */}
                  {scheduledAt && (
                    <div>
                      <label htmlFor="surprise-until-input" className={LABEL}>
                        Until <span className={OPTIONAL}>(optional)</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          id="surprise-until-input"
                          type="datetime-local"
                          value={scheduledUntil}
                          // Never before the start it runs from
                          min={scheduledAt}
                          onChange={(e) => {
                            setScheduledUntil(e.target.value);
                            setAssignError(null);
                            setAssignDone(null);
                          }}
                          className={`${FIELD} flex-1 w-auto min-w-[11rem]`}
                        />
                        {scheduledUntil && (
                          <button
                            type="button"
                            onClick={() => {
                              setScheduledUntil('');
                              setAssignError(null);
                              setAssignDone(null);
                            }}
                            className={CLEAR_BUTTON}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <p className={`${HINT} flex items-start gap-1.5`}>
                  <CalendarClock className="w-3 h-3 mt-0.5 shrink-0" />
                  {!scheduledAt
                    ? 'Left empty, the visit is due as soon as the inspector can get there.'
                    : scheduledUntil
                      ? 'The inspector may go any time in this window, and it is flagged late once the window closes unstarted.'
                      : 'Booked for this exact time. Add an Until to give the inspector a window to arrive in instead.'}
                </p>
              </div>

              {assignDone && (
                <div
                  id="assign-done"
                  role="status"
                  className="px-4 py-3 rounded-xl bg-[#EAF6EF] border border-[#157F4B]/25 text-[#12643C] text-xs font-semibold flex items-start gap-2.5"
                >
                  <span className="w-5 h-5 rounded-full bg-[#157F4B] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="pt-0.5">{assignDone}</span>
                </div>
              )}
            </>
          )}

          {/* Who is carrying out the visit, and why */}
          {kind === 'monday' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {!mayPickBranch ? (
              /*
               * The branch manager carries out their own round, so this is a
               * statement rather than a question. Their name still goes on
               * the record, which is what the field is for.
               */
              <div>
                <span className={LABEL}>Inspector</span>
                <p id="fixed-inspector" className={READONLY}>
                  <span className="truncate">{user?.name}</span>
                  <Lock className="w-3.5 h-3.5 text-[#9CA1A9] ml-auto shrink-0" />
                </p>
              </div>
            ) : (
            <div>
              <label htmlFor="inspector-name-input" className={LABEL}>
                Inspector
              </label>
              <SelectShell>
                <select
                  id="inspector-name-input"
                  value={inspectorChoice}
                  onChange={(e) => {
                    setInspectorChoice(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'inspector-name-error' : undefined}
                  className={`${SELECT} ${nameError ? INVALID : ''}`}
                >
                  <option value="">Select inspector…</option>
                  {INSPECTORS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value={OTHER_INSPECTOR}>Someone else…</option>
                </select>
              </SelectShell>

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
                  className={`${FIELD} mt-2 ${nameError ? INVALID : ''}`}
                />
              )}
              {nameError && (
                <p role="alert" id="inspector-name-error" className="text-xs font-semibold text-[#C8202D] mt-1.5">
                  {nameError}
                </p>
              )}
            </div>
            )}
            <div>
              <label htmlFor="inspection-type-select" className={LABEL}>
                Inspection type
              </label>
              <SelectShell>
                <select
                  id="inspection-type-select"
                  value={inspectionType}
                  onChange={(e) => setInspectionType(e.target.value as InspectionType)}
                  className={SELECT}
                >
                  {INSPECTION_TYPE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {INSPECTION_TYPE_LABEL[key]}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </div>
          </div>
          )}
          </FormSection>

          {/* Checklist coverage — every branch runs every list, so there is nothing to pick */}
          <FormSection
            step={2}
            title="Checklist"
            caption="Every branch runs every list, so there is nothing to choose here."
          >
          <div id="checklist-coverage">
            <div className="border border-[#E8E9EE] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#FAFBFC] border-b border-[#F0F1F4] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-bold text-[#17181D] flex items-center gap-2 min-w-0">
                  <ClipboardList className="w-4 h-4 text-[#6B6F76] shrink-0" />
                  <span>{FULL_CHECKLIST_LABEL}</span>
                </p>
                <p className="text-xs text-[#6B6F76] shrink-0 tabular-nums">
                  {checklist.sections.length} sections • {checklist.total} items
                </p>
              </div>
              <ul className="divide-y divide-[#F0F1F4]">
                {checklist.listGroups.map((group) => {
                  const itemCount = group.sectionIndexes.reduce(
                    (n, idx) => n + checklist.sections[idx].items.length,
                    0
                  );
                  return (
                    <li
                      key={group.key}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C9CCD2] shrink-0" aria-hidden />
                        <span className="font-semibold text-[#17181D] truncate">{group.label}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[#F4F5F7] px-2 py-0.5 text-[11px] font-semibold text-[#6B6F76] tabular-nums">
                        {itemCount} items
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {/* Only the admin may change the checklist */}
            {can(user, 'checklist.manage') && (
              <button
                type="button"
                onClick={() => router.push('/checklist')}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#C8202D] hover:text-[#A81823] cursor-pointer"
              >
                Edit checklist
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          </FormSection>

          {/*
            Read-only date and time — when the visit is being carried out.
            Meaningless on a surprise visit, which is being *planned*: the
            inspector may go tomorrow, and the record is stamped when they do.
          */}
          {kind === 'monday' && (
          <FormSection
            step={3}
            title="Date and time"
            caption="Stamped when the visit starts, so neither can be changed."
          >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={LABEL}>Date (read-only)</label>
              <div className="relative">
                <CalendarCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA1A9] pointer-events-none" />
                <input
                  id="inspection-date-input"
                  type="text"
                  value={currentDateISO}
                  readOnly
                  disabled
                  className={DISABLED_FIELD}
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Time (read-only)</label>
              <div className="relative">
                <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA1A9] pointer-events-none" />
                <input
                  id="inspection-time-input"
                  type="text"
                  value={currentTimeStr}
                  readOnly
                  disabled
                  className={DISABLED_FIELD}
                />
              </div>
            </div>
          </div>
          </FormSection>
          )}

          <div className="px-5 sm:px-6 md:px-8 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC] rounded-b-2xl space-y-3">
          {/*
            Why the button did not go ahead, said beside it. The field it is
            about can be a screen above on a phone, with the checklist and the
            date between — so a refusal shown only there read as nothing
            happening. The field keeps its own marker as well.
          */}
          {(() => {
            const problem =
              kind === 'surprise'
                ? assignError ??
                  (availableInspectors.length === 0
                    ? 'No inspector accounts yet — add one under Users first.'
                    : null)
                : nameError ?? startError;
            return problem ? (
              <p
                role="alert"
                id={kind === 'surprise' ? 'assign-error' : 'start-error'}
                className="px-3.5 py-2.5 rounded-xl bg-[#FDECEE] border border-[#C8202D]/25 text-xs font-semibold text-[#A81823] flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{problem}</span>
              </p>
            ) : null;
          })()}

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => router.push('/inspections')}
              className={BUTTON.secondary}
            >
              {/* Once a visit has been assigned, leaving is not cancelling */}
              {assignDone ? 'Done' : 'Cancel'}
            </button>
            <button
              id="start-inspection-submit-btn"
              type="submit"
              disabled={kind === 'surprise' && availableInspectors.length === 0}
              className={`${BUTTON.primary} px-5 disabled:cursor-not-allowed`}
            >
              {kind === 'surprise' ? (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Assign surprise visit</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>Start inspection</span>
                </>
              )}
            </button>
          </div>
          </div>
        </form>
      </div>
      </Reveal>

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

// ---------------------------------------------------------------------------
// Form furniture
// ---------------------------------------------------------------------------

/*
 * One look for every field on the form. 44px tall so a finger finds them on a
 * tablet, rounded to match the cards, and a soft brand-red halo on focus
 * rather than a hard outline — clear to a keyboard user without shouting.
 */
const FIELD =
  'w-full h-11 px-3.5 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs transition-all hover:border-[#C9CCD2] focus:outline-none focus:border-[#C8202D]/60 focus:ring-4 focus:ring-[#C8202D]/10';
/** A select wears the field's look with the browser arrow swapped for ours. */
const SELECT = `${FIELD} appearance-none pr-10 cursor-pointer`;
const INVALID = 'border-[#C8202D] hover:border-[#C8202D] ring-4 ring-[#C8202D]/10';
const READONLY =
  'w-full h-11 flex items-center gap-2 px-3.5 bg-[#F7F8FA] border border-[#E8E9EE] rounded-xl text-sm font-semibold text-[#17181D]';
const DISABLED_FIELD =
  'w-full h-11 pl-10 pr-3.5 bg-[#F7F8FA] border border-[#E8E9EE] rounded-xl text-sm text-[#6B6F76] tabular-nums cursor-not-allowed';
const LABEL = 'block text-xs font-semibold text-[#17181D] mb-1.5';
const OPTIONAL = 'text-[#9CA1A9] font-normal';
const HINT = 'mt-1.5 text-[11px] leading-relaxed text-[#6B6F76]';
const CLEAR_BUTTON =
  'h-11 px-3.5 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] border border-[#E4E6EB] bg-white rounded-xl hover:bg-[#F7F8FA] transition-colors cursor-pointer whitespace-nowrap';

/** Wraps a `<select>` so it can carry the form's own chevron. */
const SelectShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative">
    {children}
    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA1A9]" />
  </div>
);

/**
 * A numbered part of the form, with a heading that says what it settles. The
 * number is a reading order, not a wizard — every part is on screen at once.
 */
const FormSection: React.FC<{
  step: number;
  title: string;
  caption: string;
  children: React.ReactNode;
}> = ({ step, title, caption, children }) => (
  <section className="px-5 sm:px-6 md:px-8 py-6 border-t border-[#F0F1F4] first:border-t-0">
    <div className="flex items-start gap-3 mb-5">
      <span className="w-6 h-6 rounded-lg bg-[#17181D] text-white text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-[#17181D] leading-6">{title}</h2>
        <p className="text-xs text-[#6B6F76] mt-0.5">{caption}</p>
      </div>
    </div>
    <div className="space-y-5">{children}</div>
  </section>
);

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

  // Escape cancels, Tab stays inside, and whatever opened this gets focus
  // back when it closes — the same as every other dialog here.
  const dialogRef = useDialog<HTMLDivElement>(onCancel);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-[#17181D]/50 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-branch-title"
        className="bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_24px_60px_-16px_rgba(16,24,40,0.35)] w-full max-w-md my-8 overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4 flex items-start gap-3.5">
          <span className="w-10 h-10 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 id="remove-branch-title" className="text-base font-bold text-[#17181D]">
              {willClose ? 'Close this branch?' : 'Delete this branch?'}
            </h3>
            <p className="text-xs text-[#6B6F76] mt-0.5 truncate">{branch.name}</p>
          </div>
        </div>

        <div className="px-6 pb-5 space-y-3">
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

        <div className="px-6 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC] flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className={BUTTON.secondary}>
            Cancel
          </button>
          <button
            type="button"
            id="confirm-remove-branch-btn"
            onClick={onConfirm}
            className={BUTTON.primary}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {willClose ? 'Close branch' : 'Delete branch'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * One of the two kinds of visit, as a card rather than a radio.
 *
 * The difference between them is not a label — one is started now and filled
 * in, the other is handed to somebody else — so each carries the sentence
 * that says which. A pair of radios would have made them look interchangeable.
 */
const KindCard: React.FC<{
  id: string;
  selected: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  onSelect: () => void;
}> = ({ id, selected, icon: Icon, title, blurb, onSelect }) => (
  <button
    type="button"
    id={id}
    onClick={onSelect}
    aria-pressed={selected}
    className={`group relative w-full h-full p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
      selected
        ? 'border-[#C8202D] bg-white ring-4 ring-[#C8202D]/10 shadow-[0_12px_24px_-14px_rgba(200,32,45,0.45)]'
        : 'border-[#E8E9EE] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] hover:-translate-y-0.5 hover:border-[#DADCE2] hover:shadow-[0_12px_24px_-12px_rgba(16,24,40,0.18)]'
    }`}
  >
    <span className="flex items-center justify-between gap-3">
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          selected ? 'bg-[#C8202D] text-white' : 'bg-[#F4F5F7] text-[#6B6F76] group-hover:text-[#17181D]'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      {/* A radio's dot, so the chosen card reads as chosen without the colour */}
      <span
        aria-hidden
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? 'border-[#C8202D]' : 'border-[#D5D8DE]'
        }`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full bg-[#C8202D] transition-transform duration-200 ${
            selected ? 'scale-100' : 'scale-0'
          }`}
        />
      </span>
    </span>
    <span className="block mt-4 text-sm font-bold text-[#17181D]">{title}</span>
    <span className="block mt-1 text-xs text-[#6B6F76] leading-relaxed">{blurb}</span>
  </button>
);

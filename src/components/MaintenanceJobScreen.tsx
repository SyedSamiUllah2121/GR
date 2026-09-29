'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  CalendarClock,
  ClipboardList,
  Clock,
  Lock,
  Play,
  RotateCcw,
  Square,
  Tag,
  Timer,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';
import { MaintenanceJob, MaintenanceStatus, jobKindOf } from '../types';
import { categoryLabel } from '../services/categoryStore';
import { getEquipmentById } from '../services/equipmentStore';
import { getPlanById } from '../services/maintenancePlanStore';

import {
  daysOpen,
  deleteJob,
  elapsedMinutes,
  getJobById,
  reopenJob,
  statusOf,
  subscribeToMaintenance,
  turnaroundHours,
  workMinutes,
} from '../services/maintenanceStore';
import { formatMinutes, formatTurnaround } from '../services/maintenanceReport';
import { formatDateTime } from '../services/reportModel';
import { PriorityBadge } from './PriorityBadge';
import { StatusPill } from './MaintenanceStatusPill';
import { motion } from 'motion/react';
import { EASE_OUT, Reveal, t } from './motion';
import { BUTTON, Card, PanelHeader } from './ui';
import { CHART_COLORS } from './charts';
import { EndMaintenanceDialog } from './EndMaintenanceDialog';
import { JobTimesDialog } from './JobTimesDialog';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmProvider';
import { useCurrentUser } from '../hooks/useCurrentUser';
import {
  canManageJobs,
  canOpenJobBoard,
  canViewInspection,
  canViewJob,
  homePathFor,
} from '../services/permissions';
import { getInspectionById } from '../services/storage';

interface MaintenanceJobScreenProps {
  jobId: string;
}

export const MaintenanceJobScreen: React.FC<MaintenanceJobScreenProps> = ({ jobId }) => {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const user = useCurrentUser();
  const [job, setJob] = useState<MaintenanceJob | null>(() => getJobById(jobId));
  /*
   * The record this job came from, when it came from one. Loaded so the link
   * to it can be offered on what the reader may actually open, and withheld
   * when the record has since been deleted — a link to nothing is worse than
   * no link.
   */
  const sourceInspection = job?.sourceInspectionId
    ? getInspectionById(job.sourceInspectionId)
    : null;
  /*
   * The asset and the plan behind a scheduled job, when there are any. Looked
   * up rather than copied onto the job so a corrected serial number shows here
   * too — the job carries the unit's name as it was, which is the right record
   * of what was sent out, but the register is the truth about the asset.
   */
  const asset = job?.equipmentId ? getEquipmentById(job.equipmentId) : null;
  const plan = job?.planId ? getPlanById(job.planId) : null;

  const [ending, setEnding] = useState(false);
  const [editingTimes, setEditingTimes] = useState(false);

  useEffect(() => {
    const refresh = () => setJob(getJobById(jobId));
    refresh();
    return subscribeToMaintenance(refresh);
  }, [jobId]);

  /*
   * Where "back" leads when there is nothing to show. The board for anyone who
   * has one, and their own home for anyone who does not — handing someone who
   * followed a stale link a second link they cannot open either reads as the
   * app being broken rather than as a boundary.
   */
  const mayOpenBoard = canOpenJobBoard(user);
  const backHref = mayOpenBoard ? '/maintenance/jobs' : homePathFor(user);
  const backLabel = mayOpenBoard ? 'Back to maintenance' : 'Back to your home screen';

  if (!job) {
    return (
      <div className="p-5 sm:p-8 md:p-10 max-w-xl w-full mx-auto">
        <Card className="px-6 py-12 text-center">
        <span className="w-12 h-12 rounded-2xl bg-[#F4F5F7] text-[#6B6F76] flex items-center justify-center mx-auto mb-4">
          <Wrench className="w-6 h-6" />
        </span>
        <h2 className="text-xl font-bold text-[#17181D]">Job not found</h2>
        <p className="text-sm text-[#6B6F76] mt-2">
          This maintenance job does not exist or has been removed.
        </p>
        <Link href={backHref} className={`${BUTTON.primary} mt-6`}>
          {backLabel}
        </Link>
        </Card>
      </div>
    );
  }

  /*
   * Asked of the job rather than of the role, because the answer depends on
   * the job: a branch manager may open the repairs at their own branch and no
   * others. A job's URL carries nothing but its id, so the route table cannot
   * put this question — the screen puts it, exactly as the inspection screens
   * do for a record.
   */
  if (!canViewJob(user, job)) {
    return (
      <div className="p-5 sm:p-8 md:p-10 max-w-lg w-full mx-auto">
        <Card className="px-6 py-12 text-center">
        <span className="w-12 h-12 rounded-2xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </span>
        <h2 className="mt-4 text-xl font-bold text-[#17181D]">
          This job is not yours to open
        </h2>
        <p className="text-sm text-[#6B6F76] mt-2 leading-relaxed">
          {mayOpenBoard
            ? 'It was raised at a branch outside your own. You can see the repairs raised at the branches you cover, and report anything new you find there.'
            : 'Maintenance jobs are not part of what this account covers.'}
        </p>
        <Link href={backHref} className={`${BUTTON.primary} mt-6`}>
          {backLabel}
        </Link>
        </Card>
      </div>
    );
  }

  const status = statusOf(job);
  const waiting = daysOpen(job);

  /*
   * Moving the job along is maintenance's work, not the reporting branch's.
   * A branch manager reads the timeline and sees where the repair has got to;
   * the buttons that would start, end, re-time, reopen or delete it are not
   * shown to them at all.
   */
  const mayManage = canManageJobs(user);

  const handleReopen = async () => {
    const ok = await confirm({
      title: 'Put this job back to reported?',
      body: 'The start and completion times already recorded on it are cleared.',
      confirmLabel: 'Reopen job',
      destructive: false,
    });
    if (!ok) return;
    const reopened = reopenJob(job);
    if (!reopened) {
      showToast('Could not reopen the job — this browser’s storage is full', 'error');
      return;
    }
    setJob(reopened);
    showToast('Job reopened');
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete “${job.title}”?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Delete job',
    });
    if (!ok) return;
    if (!deleteJob(job.id)) {
      showToast('Could not delete the job — try again', 'error');
      return;
    }
    showToast('Job deleted');
    router.push('/maintenance/jobs');
  };

  const tone = STATUS_TONE[status];

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1280px] w-full mx-auto">
      <Reveal className="space-y-3">
        {/* Breadcrumb */}
        <nav className="no-print text-xs text-[#6B6F76] flex items-center gap-1.5">
          <Link href="/maintenance/jobs" className="hover:text-[#17181D] transition-colors">
            Maintenance
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#17181D] font-semibold">Job details</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] md:text-[28px] leading-tight font-bold tracking-tight text-[#17181D]">
              {job.title}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <PriorityBadge severity={job.priority} />
              <StatusPill status={status} />
              {jobKindOf(job) === 'scheduled' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#EEF2FB] text-[#33499B]">
                  <CalendarClock className="w-3 h-3" />
                  Scheduled
                </span>
              )}
              <span className="text-[13px] text-[#6B6F76]">
                {job.branchName} • {categoryLabel(job.category)}
                {job.equipment ? ` • ${job.equipment}` : ''}
              </span>
            </div>
          </div>

          <Link href="/maintenance/jobs" className={`no-print ${BUTTON.secondary} shrink-0 self-start`}>
            <ArrowLeft className="w-4 h-4 text-[#6B6F76]" />
            <span>Back to list</span>
          </Link>
        </div>
      </Reveal>

      {/* The action that moves the job forward, front and centre */}
      <Reveal delay={0.05}>
        <Card className="overflow-hidden">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <span
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tone.soft}`}
              >
                <tone.Icon className="w-6 h-6" />
              </span>

              {status === 'reported' && (
                <div>
                  <p className="text-[15px] font-bold text-[#17181D]">Not started</p>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    Reported {formatDateTime(job.reportedAt)}
                    {waiting > 0 && ` — waiting ${waiting} day${waiting === 1 ? '' : 's'}`}
                  </p>
                </div>
              )}

              {status === 'in-progress' && (
                <div>
                  <p className="text-[15px] font-bold text-[#8A5A08]">Work in progress</p>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    Started {formatDateTime(job.startedAt)} • running{' '}
                    {formatMinutes(elapsedMinutes(job))}
                  </p>
                  {mayManage && (
                    <button
                      id="adjust-times-btn"
                      type="button"
                      onClick={() => setEditingTimes(true)}
                      className="no-print mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
                    >
                      <Clock className="w-3 h-3" />
                      Adjust start time
                    </button>
                  )}
                </div>
              )}

              {status === 'completed' && (
                <div>
                  <p className="text-[15px] font-bold text-[#12643C]">Completed</p>
                  <p className="text-xs text-[#6B6F76] mt-0.5">
                    Started {formatDateTime(job.startedAt)} • finished{' '}
                    {formatDateTime(job.completedAt)}
                  </p>
                  {mayManage && (
                    <button
                      id="adjust-times-btn"
                      type="button"
                      onClick={() => setEditingTimes(true)}
                      className="no-print mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
                    >
                      <Clock className="w-3 h-3" />
                      Adjust times
                    </button>
                  )}
                </div>
              )}
            </div>

            {mayManage && status === 'reported' && (
              <button
                id="start-maintenance-btn"
                type="button"
                onClick={() => setEditingTimes(true)}
                className={`${BUTTON.primary} shrink-0`}
              >
                <Play className="w-4 h-4" />
                <span>Start maintenance</span>
              </button>
            )}

            {mayManage && status === 'in-progress' && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleReopen}
                  className={BUTTON.secondary}
                  title="Undo the start time"
                >
                  <RotateCcw className="w-4 h-4 text-[#6B6F76]" />
                  <span>Undo start</span>
                </button>
                <button
                  id="end-maintenance-btn"
                  type="button"
                  onClick={() => setEnding(true)}
                  className={BUTTON.primary}
                >
                  <Square className="w-4 h-4" />
                  <span>End maintenance</span>
                </button>
              </div>
            )}

            {mayManage && status === 'completed' && (
              <button
                type="button"
                onClick={handleReopen}
                className={`no-print ${BUTTON.secondary} shrink-0`}
              >
                <RotateCcw className="w-4 h-4 text-[#6B6F76]" />
                <span>Reopen</span>
              </button>
            )}
          </div>

          {/*
            How far along the job is, as three steps filled in the colour of
            where it stands. The words above say the same thing; this is what
            reads from across the room.
          */}
          <div className="px-5 sm:px-6 pb-5 grid grid-cols-3 gap-1.5" aria-hidden>
            {[
              { label: 'Reported', done: true },
              { label: 'Started', done: !!job.startedAt },
              { label: 'Completed', done: !!job.completedAt },
            ].map((step, i) => (
              <div key={step.label}>
                <div className="h-1.5 rounded-full bg-[#F1F2F5] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: tone.bar, transformOrigin: 'left' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: step.done ? 1 : 0 }}
                    transition={{ duration: t(0.5), ease: EASE_OUT, delay: t(0.15 + i * 0.12) }}
                  />
                </div>
                <p
                  className={`mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    step.done ? 'text-[#17181D]' : 'text-[#9CA1A9]'
                  }`}
                >
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-5 min-w-0">
          {/* What was reported */}
          <Reveal delay={0.1}>
            <Card>
              <PanelHeader icon={ClipboardList} title="The problem" />
              <div className="px-5 sm:px-6 pb-6 pt-1 space-y-4">
                <p className="text-sm text-[#17181D] whitespace-pre-wrap leading-relaxed">
                  {job.details}
                </p>

                <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-[#F0F1F4]">
                  <Field icon={Building2} label="Branch">
                    {job.branchName}
                  </Field>
                  <Field icon={Wrench} label="Unit or area">
                    {job.equipment || '—'}
                  </Field>
                  <Field icon={Tag} label="Category">
                    {categoryLabel(job.category)}
                  </Field>
                  <Field icon={User} label="Reported by">
                    {job.reportedBy}
                  </Field>
                </dl>

                {/*
                  What this is an occurrence of. Worth saying on the job itself: a
                  technician looking at "Printer service — Counter printer" should
                  not have to go to another screen to learn that it comes round every
                  three months and is not something that has gone wrong.
                */}
                {jobKindOf(job) === 'scheduled' && plan && (
                  <div className="bg-[#F5F7FD] border border-[#33499B]/15 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-[#33499B] flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5" />
                      Planned work, not a breakdown
                    </p>
                    <p className="text-xs text-[#6B6F76] mt-1 leading-relaxed">
                      {plan.task} falls due every {plan.everyMonths} month
                      {plan.everyMonths === 1 ? '' : 's'}
                      {job.dueOn ? `, and this one was due on ${job.dueOn}` : ''}.
                      {asset ? ' The next is counted from the day this one is finished.' : ''}
                    </p>
                  </div>
                )}

                {asset && (
                  <Link
                    href="/maintenance/equipment"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C8202D] hover:underline"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {asset.name}
                    {asset.serialNumber ? ` · serial ${asset.serialNumber}` : ''}
                    {asset.location ? ` · ${asset.location}` : ''}
                  </Link>
                )}

                {/*
                  Offered only to someone who may open the record at the other end,
                  asked of the record itself rather than of the role — a link that
                  bounces the reader to a refusal reads as the app being broken
                  rather than as a boundary. A maintenance manager passes for the record
                  that raised this job, which is the whole point of the link.
                */}
                {/*
                  The fault itself. Carried onto the job when an inspection raised it
                  and, until now, stored and shown nowhere — which left whoever was
                  being sent out with the inspector's words and none of the picture
                  the inspector thought worth taking.
                */}
                {job.photo && <PhotoStrip photos={[job.photo]} alt="The reported fault" />}

                {sourceInspection && canViewInspection(user, sourceInspection) && (
                  <Link
                    href={`/inspections/${sourceInspection.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C8202D] hover:underline"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Raised from an inspection finding
                  </Link>
                )}
              </div>
            </Card>
          </Reveal>

          {/* What was done, once it is done */}
          {status === 'completed' && (
            <Reveal delay={0.14}>
              <Card>
                <PanelHeader icon={CheckCircle2} title="The work done" />
                <div className="px-5 sm:px-6 pb-6 pt-1 space-y-4">
                  {job.resolutionNote ? (
                    <p className="text-sm text-[#17181D] whitespace-pre-wrap leading-relaxed">
                      {job.resolutionNote}
                    </p>
                  ) : (
                    <p className="text-sm text-[#6B6F76] italic">No note was recorded.</p>
                  )}
                  {/*
                    The receipt and the finished work. What turns a typed-in cost
                    into a figure that can be checked, so it sits with the cost
                    rather than in a gallery of its own.
                  */}
                  {(job.completionPhotos?.length ?? 0) > 0 && (
                    <PhotoStrip
                      photos={job.completionPhotos ?? []}
                      alt="Photo of the completed work or its receipt"
                    />
                  )}

                  <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-[#F0F1F4]">
                    <Field icon={User} label="Attended by">
                      {job.attendedBy || '—'}
                    </Field>
                    <Field icon={Timer} label="Time on the job">
                      {formatMinutes(workMinutes(job))}
                    </Field>
                    <Field icon={Tag} label="Cost">
                      {typeof job.cost === 'number' ? job.cost.toLocaleString() : '—'}
                    </Field>
                  </dl>
                </div>
              </Card>
            </Reveal>
          )}
        </div>

        {/* Timeline — the record of what happened when */}
        <Reveal delay={0.12} className="lg:col-span-4 min-w-0">
          <Card>
            <PanelHeader icon={Clock} title="Timeline" />
            <ol className="px-5 sm:px-6 pb-5 pt-1">
              <TimelineStep
                icon={ClipboardList}
                title="Reported"
                when={job.reportedAt}
                by={job.reportedBy}
                done
              />
              <TimelineStep
                icon={Wrench}
                title="Maintenance started"
                when={job.startedAt}
                done={!!job.startedAt}
              />
              <TimelineStep
                icon={CheckCircle2}
                title="Maintenance ended"
                when={job.completedAt}
                by={job.attendedBy ?? undefined}
                done={!!job.completedAt}
                last
              />
            </ol>

            {(workMinutes(job) !== null || turnaroundHours(job) !== null) && (
              <div className="px-5 sm:px-6 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC] rounded-b-2xl grid grid-cols-2 gap-x-6 gap-y-3">
                <Metric icon={Timer} label="Time on the job">
                  {formatMinutes(workMinutes(job))}
                </Metric>
                <Metric icon={Timer} label="Report to fix">
                  {formatTurnaround(turnaroundHours(job))}
                </Metric>
                {typeof job.cost === 'number' && (
                  <Metric icon={Tag} label="Cost">
                    {job.cost.toLocaleString()}
                  </Metric>
                )}
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {mayManage && (
        <div className="no-print flex justify-end">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-bold text-[#C8202D] border border-[#C8202D]/25 bg-white rounded-xl hover:bg-[#FDECEE] transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete job</span>
          </button>
        </div>
      )}

      {/* Outside every Reveal: a transform would re-parent these fixed dialogs */}
      {editingTimes && (
        <JobTimesDialog
          job={job}
          onClose={() => setEditingTimes(false)}
          onSaved={(next) => {
            setEditingTimes(false);
            setJob(next);
            showToast(next.startedAt ? 'Times saved' : 'Times cleared');
          }}
        />
      )}

      {ending && (
        <EndMaintenanceDialog
          job={job}
          onClose={() => setEnding(false)}
          onDone={(next, warning) => {
            setEnding(false);
            setJob(next);
            if (warning) showToast(warning, 'error');
            else showToast('Maintenance completed');
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Where the job stands, as the hero card's tile and the fill of its progress
 * steps — the status colours the board and the dashboard use.
 */
const STATUS_TONE: Record<
  MaintenanceStatus,
  { soft: string; bar: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  reported: { soft: 'bg-[#FDECEE] text-[#C8202D]', bar: CHART_COLORS.status.notStarted, Icon: Wrench },
  'in-progress': { soft: 'bg-[#FDF3E2] text-[#B4740A]', bar: CHART_COLORS.status.inProgress, Icon: Timer },
  completed: { soft: 'bg-[#E6F4EC] text-[#157F4B]', bar: CHART_COLORS.status.completed, Icon: CheckCircle2 },
};

/**
 * A row of photographs, each opening full size in its own tab.
 *
 * A thumbnail is enough to see that a receipt is there; it is nowhere near
 * enough to read the total on it, and there is no lightbox in this app to
 * build one out of. A plain link to the image itself is the whole of what is
 * needed, and it prints — `no-print` is deliberately not set here, because a
 * month-end report someone has printed is exactly where the receipt belongs.
 */
const PhotoStrip: React.FC<{ photos: string[]; alt: string }> = ({ photos, alt }) => (
  <ul className="flex flex-wrap gap-2.5">
    {photos.map((photo, index) => (
      <li key={index}>
        <a
          href={photo}
          target="_blank"
          rel="noreferrer"
          title="Open this photo full size"
          className="block rounded-xl border border-[#E8E9EE] overflow-hidden shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#C8202D] hover:shadow-md"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt={photos.length > 1 ? `${alt} (${index + 1} of ${photos.length})` : alt}
            className="w-24 h-24 object-cover"
          />
        </a>
      </li>
    ))}
  </ul>
);

const TimelineStep: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  when: string | null;
  by?: string;
  done: boolean;
  last?: boolean;
}> = ({ icon: Icon, title, when, by, done, last = false }) => (
  <li className="flex gap-3.5">
    <div className="flex flex-col items-center shrink-0">
      <span
        className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          done ? 'bg-[#E6F4EC] text-[#157F4B]' : 'bg-[#F4F5F7] text-[#C9CCD2]'
        }`}
      >
        <Icon className="w-4 h-4" />
      </span>
      {!last && (
        <span className={`w-0.5 flex-1 min-h-5 my-1 rounded-full ${done ? 'bg-[#157F4B]/25' : 'bg-[#EEF0F3]'}`} />
      )}
    </div>
    <div className={last ? 'pt-1' : 'pt-1 pb-5'}>
      <p className={`text-[13px] font-semibold ${done ? 'text-[#17181D]' : 'text-[#9CA1A9]'}`}>
        {title}
      </p>
      <p className="text-xs text-[#6B6F76] mt-0.5">
        {done && when ? formatDateTime(when) : 'Not yet'}
        {done && by ? ` • ${by}` : ''}
      </p>
    </div>
  </li>
);

const Field: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}> = ({ icon: Icon, label, children }) => (
  <div className="min-w-0 rounded-xl bg-[#FAFBFC] border border-[#F0F1F4] px-3.5 py-3">
    <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </dt>
    <dd className="text-[13px] font-semibold text-[#17181D] mt-1 break-words">{children}</dd>
  </div>
);

const Metric: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}> = ({ icon: Icon, label, children }) => (
  <div>
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </p>
    <p className="text-lg font-bold tracking-tight text-[#17181D] mt-0.5">{children}</p>
  </div>
);

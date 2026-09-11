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
import { MAINTENANCE_CATEGORY_LABEL, MaintenanceJob, jobKindOf } from '../types';
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
import { EndMaintenanceDialog } from './EndMaintenanceDialog';
import { JobTimesDialog } from './JobTimesDialog';
import { useToast } from './ToastProvider';
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
      <div className="p-8 max-w-xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#17181D]">Job not found</h2>
        <p className="text-sm text-[#6B6F76] mt-2">
          This maintenance job does not exist or has been removed.
        </p>
        <Link
          href={backHref}
          className="inline-block mt-4 px-4 py-2 bg-[#C8202D] text-white text-sm font-medium rounded-md"
        >
          {backLabel}
        </Link>
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
      <div className="p-8 max-w-md mx-auto text-center">
        <span className="w-12 h-12 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </span>
        <h2 className="mt-4 text-xl font-bold text-[#17181D]">
          This job is not yours to open
        </h2>
        <p className="text-sm text-[#6B6F76] mt-2 leading-relaxed">
          {mayOpenBoard
            ? 'It was raised at another branch. You can see the repairs raised at your own, and report anything new you find there.'
            : 'Maintenance jobs are not part of what this account covers.'}
        </p>
        <Link
          href={backHref}
          className="inline-block mt-5 px-4 py-2 bg-[#C8202D] text-white text-xs font-bold rounded-md"
        >
          {backLabel}
        </Link>
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

  const handleReopen = () => {
    if (!window.confirm('Clear the start and completion times and put this back to reported?')) {
      return;
    }
    setJob(reopenJob(job));
    showToast('Job reopened');
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
    deleteJob(job.id);
    showToast('Job deleted');
    router.push('/maintenance/jobs');
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      {/* Breadcrumb */}
      <nav className="no-print text-xs text-[#6B6F76] mb-3 flex items-center gap-1.5">
        <Link href="/maintenance/jobs" className="hover:text-[#17181D] transition-colors">
          Maintenance
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#17181D] font-semibold">Job details</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#17181D]">
              {job.title}
            </h1>
            <PriorityBadge severity={job.priority} />
            <StatusPill status={status} />
            {jobKindOf(job) === 'scheduled' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#EEF2FB] text-[#33499B]">
                <CalendarClock className="w-3 h-3" />
                Scheduled
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B6F76] mt-1.5">
            {job.branchName} • {MAINTENANCE_CATEGORY_LABEL[job.category]}
            {job.equipment ? ` • ${job.equipment}` : ''}
          </p>
        </div>

        <Link
          href="/maintenance/jobs"
          className="no-print inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors shadow-xs shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to list</span>
        </Link>
      </div>

      {/* The action that moves the job forward, front and centre */}
      <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs p-5 mb-5">
        {status === 'reported' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#17181D]">Not started</p>
              <p className="text-xs text-[#6B6F76] mt-0.5">
                Reported {formatDateTime(job.reportedAt)}
                {waiting > 0 && ` — waiting ${waiting} day${waiting === 1 ? '' : 's'}`}
              </p>
            </div>
            {mayManage && (
              <button
                id="start-maintenance-btn"
                type="button"
                onClick={() => setEditingTimes(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer shrink-0"
              >
                <Play className="w-4 h-4" />
                <span>Start maintenance</span>
              </button>
            )}
          </div>
        )}

        {status === 'in-progress' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#B4740A]">Work in progress</p>
              <p className="text-xs text-[#6B6F76] mt-0.5">
                Started {formatDateTime(job.startedAt)} • running{' '}
                {formatMinutes(elapsedMinutes(job))}
              </p>
              {mayManage && (
                <button
                  id="adjust-times-btn"
                  type="button"
                  onClick={() => setEditingTimes(true)}
                  className="no-print mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
                >
                  <Clock className="w-3 h-3" />
                  Adjust start time
                </button>
              )}
            </div>
            {mayManage && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleReopen}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#6B6F76] rounded-md transition-colors cursor-pointer"
                  title="Undo the start time"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo start</span>
                </button>
                <button
                  id="end-maintenance-btn"
                  type="button"
                  onClick={() => setEnding(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                  <span>End maintenance</span>
                </button>
              </div>
            )}
          </div>
        )}

        {status === 'completed' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#157F4B] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#157F4B]">Completed</p>
                <p className="text-xs text-[#6B6F76] mt-0.5">
                  Started {formatDateTime(job.startedAt)} • finished{' '}
                  {formatDateTime(job.completedAt)}
                </p>
                {mayManage && (
                  <button
                    id="adjust-times-btn"
                    type="button"
                    onClick={() => setEditingTimes(true)}
                    className="no-print mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
                  >
                    <Clock className="w-3 h-3" />
                    Adjust times
                  </button>
                )}
              </div>
            </div>
            {mayManage && (
              <button
                type="button"
                onClick={handleReopen}
                className="no-print inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#6B6F76] rounded-md transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* Timeline — the record of what happened when */}
      <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs mb-5">
        <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
          <h2 className="text-sm font-bold text-[#17181D]">Timeline</h2>
        </div>
        <ol className="p-5 space-y-4">
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
          <div className="px-5 py-3.5 border-t border-[#E6E7EB] bg-[#FAFAFA] flex flex-wrap gap-x-8 gap-y-3">
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
      </section>

      {/* What was reported */}
      <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs mb-5">
        <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
          <h2 className="text-sm font-bold text-[#17181D]">The problem</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-[#17181D] whitespace-pre-wrap leading-relaxed">
            {job.details}
          </p>

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 pt-4 border-t border-[#EFEFF2]">
            <Field icon={Building2} label="Branch">
              {job.branchName}
            </Field>
            <Field icon={Wrench} label="Unit or area">
              {job.equipment || '—'}
            </Field>
            <Field icon={Tag} label="Category">
              {MAINTENANCE_CATEGORY_LABEL[job.category]}
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
            <div className="bg-[#F7F9FD] border border-[#33499B]/20 rounded-md px-4 py-3">
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
      </section>

      {/* What was done, once it is done */}
      {status === 'completed' && (
        <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs mb-5">
          <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
            <h2 className="text-sm font-bold text-[#17181D]">The work done</h2>
          </div>
          <div className="p-5 space-y-4">
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

            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 pt-4 border-t border-[#EFEFF2]">
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
        </section>
      )}

      {mayManage && (
        <div className="no-print flex justify-end">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#C8202D] border border-[#C8202D]/30 rounded-md hover:bg-[#FDECEE] transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete job</span>
          </button>
        </div>
      )}

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
          onDone={(next) => {
            setEnding(false);
            setJob(next);
            showToast('Maintenance completed');
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
          className="block rounded-md border border-[#E6E7EB] overflow-hidden hover:border-[#C8202D] transition-colors"
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
        className={`w-7 h-7 rounded-full border flex items-center justify-center ${
          done
            ? 'bg-[#E6F4EC] border-[#157F4B]/30 text-[#157F4B]'
            : 'bg-[#FAFAFA] border-[#E6E7EB] text-[#6B6F76]/50'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      {!last && (
        <span className={`w-px flex-1 mt-1 ${done ? 'bg-[#157F4B]/25' : 'bg-[#E6E7EB]'}`} />
      )}
    </div>
    <div className="pb-1">
      <p className={`text-sm font-semibold ${done ? 'text-[#17181D]' : 'text-[#6B6F76]/70'}`}>
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
  <div className="min-w-0">
    <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </dt>
    <dd className="text-sm font-semibold text-[#17181D] mt-1">{children}</dd>
  </div>
);

const Metric: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}> = ({ icon: Icon, label, children }) => (
  <div>
    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </p>
    <p className="text-sm font-bold text-[#17181D] mt-0.5 tabular-nums">{children}</p>
  </div>
);

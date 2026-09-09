'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Play,
  RotateCcw,
  Square,
  Tag,
  Timer,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';
import { MAINTENANCE_CATEGORY_LABEL, MaintenanceJob } from '../types';
import { SEVERITY_LABEL } from '../services/priority';
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
import { canViewInspection } from '../services/permissions';
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
  const [ending, setEnding] = useState(false);
  const [editingTimes, setEditingTimes] = useState(false);

  useEffect(() => {
    const refresh = () => setJob(getJobById(jobId));
    refresh();
    return subscribeToMaintenance(refresh);
  }, [jobId]);

  if (!job) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#17181D]">Job not found</h2>
        <p className="text-sm text-[#6B6F76] mt-2">
          This maintenance job does not exist or has been removed.
        </p>
        <Link
          href="/maintenance/jobs"
          className="inline-block mt-4 px-4 py-2 bg-[#C8202D] text-white text-sm font-medium rounded-md"
        >
          Back to maintenance
        </Link>
      </div>
    );
  }

  const status = statusOf(job);
  const waiting = daysOpen(job);

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
            <button
              id="start-maintenance-btn"
              type="button"
              onClick={() => setEditingTimes(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <Play className="w-4 h-4" />
              <span>Start maintenance</span>
            </button>
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
              <button
                id="adjust-times-btn"
                type="button"
                onClick={() => setEditingTimes(true)}
                className="no-print mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
              >
                <Clock className="w-3 h-3" />
                Adjust start time
              </button>
            </div>
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
                <button
                  id="adjust-times-btn"
                  type="button"
                  onClick={() => setEditingTimes(true)}
                  className="no-print mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer"
                >
                  <Clock className="w-3 h-3" />
                  Adjust times
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReopen}
              className="no-print inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#6B6F76] rounded-md transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reopen</span>
            </button>
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
            Offered only to someone who may open the record at the other end,
            asked of the record itself rather than of the role — a link that
            bounces the reader to a refusal reads as the app being broken
            rather than as a boundary. A job manager passes for the record
            that raised this job, which is the whole point of the link.
          */}
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

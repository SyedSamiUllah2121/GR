'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Camera, Check, CheckCircle2, Loader2, Receipt, Trash2, X } from 'lucide-react';
import { Interval, MaintenanceJob } from '../types';
import { completeJob, getJobs, getLastPerson, rememberPerson } from '../services/maintenanceStore';
import { reconcileServiceStatus } from '../services/equipmentStore';
import { approximateBytes, formatBytes, readImageFile } from '../services/photoFile';
import { getEquipmentById } from '../services/equipmentStore';
import {
  generalMaintenanceState,
  recordGeneralMaintenance,
} from '../services/generalMaintenance';
import {
  addInterval,
  intervalFor,
  intervalOf,
  intervalText,
  toIsoDay,
} from '../services/maintenanceSchedule';
import { IntervalPicker } from './IntervalPicker';
import { useDialog } from '../hooks/useDialog';
import { EASE_OUT, t } from './motion';
import { BUTTON } from './ui';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow]';

const labelClass =
  'block text-xs font-semibold text-[#17181D] mb-1.5';

/**
 * How many photographs one job may carry.
 *
 * A cap rather than no cap because these all sit in localStorage next to the
 * inspection records — a handful is enough to show the repair and the receipt,
 * and past that the store is being used as a photo album.
 */
const MAX_PHOTOS = 6;

/**
 * Closes a job off.
 *
 * Only "what was done" is required — that is the line the month-end report
 * actually reads back. Who attended is remembered from last time so it is
 * usually already filled in, and cost is left blank whenever it is not known.
 *
 * Photographs are optional but are the reason the rest can be trusted: a
 * receipt is what turns a typed-in cost into a figure someone can check, and
 * a picture of the finished work is what turns "replaced the joint" into
 * something a branch can see without going to look.
 */
export const EndMaintenanceDialog: React.FC<{
  job: MaintenanceJob;
  onClose: () => void;
  /**
   * The job, closed. `warning` is set when the repair was recorded but the
   * service done alongside it was not — the job is finished either way, so
   * the dialog closes and the caller says what is still missing.
   */
  onDone: (job: MaintenanceJob, warning?: string) => void;
}> = ({ job, onClose, onDone }) => {
  const [attendedBy, setAttendedBy] = useState(() => getLastPerson());
  const [resolutionNote, setResolutionNote] = useState('');
  const [cost, setCost] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /*
   * A repair is often when the general maintenance gets done too — somebody is
   * already at the unit with it opened up, so they clean and check it while
   * they are there. Without a way to say so, that work goes unrecorded and the
   * board raises the service again a fortnight later, which is how a schedule
   * stops being believed.
   */
  const today = toIsoDay(new Date());
  const asset = job.equipmentId ? getEquipmentById(job.equipmentId) : null;
  const general = asset ? generalMaintenanceState(asset, today, undefined, getJobs()) : null;
  /*
   * Not offered on the general-maintenance job itself. Closing that one already
   * resets the clock, and a tickbox saying "the thing you are closing was also
   * done" would be asking somebody to confirm the same fact twice.
   */
  const offerGeneral = !!asset && !!general && job.planId !== general.plan.id;
  const currentCadence =
    asset && general ? intervalFor(asset, general.plan) ?? intervalOf(general.plan) : null;

  const [alsoGeneral, setAlsoGeneral] = useState(false);
  /*
   * Starts on whatever the asset already keeps, so the ordinary case is to
   * leave it alone: the field states the period rather than asking for it, and
   * the next date falls out of the interval that was already chosen. An
   * override is only written when the number in it actually differs.
   */
  const [cadence, setCadence] = useState<Interval>(
    () => currentCadence ?? { every: 6, unit: 'months' }
  );
  const cadenceChanged =
    !!currentCadence &&
    (cadence.every !== currentCadence.every || cadence.unit !== currentCadence.unit);

  const photoBytes = photos.reduce((sum, p) => sum + approximateBytes(p), 0);

  /*
   * Files are taken one at a time and shrunk before they are held, so what is
   * in state is already what would be stored — the size shown under the
   * thumbnails is the real cost, not the size of the originals.
   */
  const addPhotos = async (files: FileList) => {
    setReading(true);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    const skipped = files.length - picked.length;

    const added: string[] = [];
    const failures: string[] = [];
    for (const file of picked) {
      const { dataUrl, error } = await readImageFile(file);
      if (dataUrl) added.push(dataUrl);
      else if (error) failures.push(error);
    }

    if (added.length > 0) setPhotos((current) => [...current, ...added]);
    setErrors((current) => {
      const next = { ...current };
      delete next.photos;
      if (failures.length > 0) next.photos = failures[0];
      else if (skipped > 0) next.photos = `Only ${MAX_PHOTOS} photos can go on one job`;
      return next;
    });
    setReading(false);
  };

  const removePhoto = (index: number) =>
    setPhotos((current) => current.filter((_, i) => i !== index));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const next: Record<string, string> = {};
    if (!resolutionNote.trim()) next.resolutionNote = 'A line on what was done is enough';

    const trimmedCost = cost.trim();
    let costValue: number | null = null;
    if (trimmedCost) {
      const parsed = Number(trimmedCost);
      if (!Number.isFinite(parsed) || parsed < 0) {
        next.cost = 'Enter a number, or leave it blank';
      } else {
        costValue = parsed;
      }
    }

    /*
     * Also said beside the button, in the form slot. The fields are at the
     * top, and with photos attached the dialog is taller than a phone screen,
     * so a refusal shown only up there read as Mark done doing nothing.
     */
    const problems = Object.values(next);
    if (problems.length > 0) {
      setErrors({
        ...next,
        form: problems.length === 1 ? problems[0] : 'A couple of things need fixing — they are marked above',
      });
      return;
    }
    setErrors({});

    if (attendedBy.trim()) rememberPerson(attendedBy);

    const { job: saved, error } = completeJob(job, {
      attendedBy,
      resolutionNote,
      cost: costValue,
      photos,
    });

    /*
     * A refusal is shown rather than swallowed. The one that will actually
     * happen is the store being full, and telling someone their repair was
     * recorded when nothing was written is the worst outcome available here.
     */
    if (!saved) {
      setErrors({ form: error ?? 'Could not close this job' });
      return;
    }

    /*
     * The asset's own record catches up with the work. Without this the
     * register keeps its "SERVICE DUE" pill for ever on a unit somebody has
     * just serviced, and the status filter — the one place a manager looks to
     * answer "what still needs doing" — keeps counting it.
     *
     * After the job is safely written, never before: a status saying the work
     * is done, sitting beside no record of the work, is the worse of the two
     * ways this can be wrong.
     */
    reconcileServiceStatus(saved.equipmentId, saved.completedAt ?? '', saved.kind ?? 'problem');

    /*
     * After the repair is safely stored, never before. If the store is full the
     * repair is the record that matters, and a reset clock on an asset whose
     * repair was refused would say work happened that nothing can show.
     */
    if (offerGeneral && alsoGeneral && asset) {
      const result = recordGeneralMaintenance(
        asset,
        {
          on: today,
          attendedBy,
          note: resolutionNote.trim()
            ? `General maintenance done alongside the repair. ${resolutionNote.trim()}`
            : 'General maintenance done alongside the repair.',
          // The repair's cost covers the visit; splitting it between the two
          // records would count the same money twice in the month-end report
          cost: null,
          newInterval: cadenceChanged ? cadence : undefined,
        },
        today
      );
      /*
       * The repair is already closed at this point, so the dialog cannot stay
       * open offering to close it again — pressing the button a second time
       * only met "This job is already finished". It closes, and says what did
       * not get recorded.
       */
      if (!result.ok) {
        onDone(
          saved,
          `The repair was closed, but the service was not recorded: ${
            result.error ?? 'record it from the appliance'
          }`
        );
        return;
      }
    }

    onDone(saved);
  };

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    /*
     * The scrim only fades; the panel inside rises and scales. Nothing above a
     * `position: fixed` element may carry a transform, or it stops being fixed
     * to the window — so the movement is kept to the panel.
     */
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="endmaintenancedialog-dialog-1-title"
      className="fixed inset-0 z-50 bg-[#17181D]/45 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: t(0.2) }}
    >
      <motion.div
        className="relative bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)] w-full max-w-lg my-8 overflow-hidden"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: t(0.3), ease: EASE_OUT }}
      >
        <div className="pl-6 pr-14 py-4 border-b border-[#F0F1F4] flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 id="endmaintenancedialog-dialog-1-title" className="text-[15px] font-bold text-[#17181D]">End maintenance</h3>
            <p className="text-xs text-[#6B6F76] mt-0.5 truncate">{job.title}</p>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="p-6 space-y-5">
            <div>
              <label htmlFor="mnt-resolution" className={labelClass}>
                What was done
              </label>
              <textarea
                id="mnt-resolution"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                autoFocus
                placeholder="e.g. Gas recharged and leaking joint resealed."
                className={`${inputClass} resize-y`}
              />
              {errors.resolutionNote && (
                <p className="text-xs font-semibold text-[#C8202D] mt-1.5">
                  {errors.resolutionNote}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="mnt-attended" className={labelClass}>
                  Attended by (optional)
                </label>
                <input
                  id="mnt-attended"
                  type="text"
                  value={attendedBy}
                  onChange={(e) => setAttendedBy(e.target.value)}
                  placeholder="Engineer or contractor"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="mnt-cost" className={labelClass}>
                  Cost (optional)
                </label>
                <input
                  id="mnt-cost"
                  type="text"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Leave blank if unknown"
                  className={inputClass}
                />
                {errors.cost && (
                  <p className="text-xs font-semibold text-[#C8202D] mt-1.5">{errors.cost}</p>
                )}
              </div>
            </div>

            {/* Receipts and the finished work */}
            <div className="border-t border-[#F0F1F4] pt-5">
              <span className={labelClass}>
                Photos <span className="text-[#9CA1A9] font-normal">(optional)</span>
              </span>
              <p className="-mt-0.5 mb-3 text-[11px] text-[#9CA1A9]">
                The receipt, and the work once it is finished. Up to {MAX_PHOTOS}.
              </p>

              {photos.length > 0 && (
                <ul className="flex flex-wrap gap-2.5 mb-3">
                  {photos.map((photo, index) => (
                    <li key={index} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt={`Attached photo ${index + 1}`}
                        className="w-20 h-20 object-cover rounded-xl border border-[#E8E9EE] shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label={`Remove photo ${index + 1}`}
                        title="Remove this photo"
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-[#E6E7EB] shadow-xs flex items-center justify-center text-[#C8202D] hover:bg-[#FDECEE] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <label
                  htmlFor="mnt-photo-upload"
                  aria-disabled={photos.length >= MAX_PHOTOS || reading}
                  className={`inline-flex items-center gap-2 h-10 px-4 border border-dashed text-xs font-bold rounded-xl transition-all ${
                    photos.length >= MAX_PHOTOS || reading
                      ? 'bg-[#F4F5F7] border-[#E4E6EB] text-[#9CA1A9] cursor-not-allowed'
                      : 'bg-white hover:bg-[#FAFBFC] border-[#D0D3D9] hover:border-[#9CA1A9] text-[#17181D] cursor-pointer'
                  }`}
                >
                  {reading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#6B6F76]" />
                  ) : (
                    <Camera className="w-4 h-4 text-[#6B6F76]" />
                  )}
                  <span>{reading ? 'Adding…' : 'Add photos'}</span>
                  <input
                    id="mnt-photo-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={photos.length >= MAX_PHOTOS || reading}
                    className="hidden"
                    // Cleared on open so the same file can be picked twice
                    onClick={(e) => {
                      (e.target as HTMLInputElement).value = '';
                    }}
                    onChange={(e) => {
                      const { files } = e.target;
                      if (files && files.length > 0) void addPhotos(files);
                    }}
                  />
                </label>

                {photos.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6B6F76]">
                    <Receipt className="w-3.5 h-3.5" />
                    {photos.length} of {MAX_PHOTOS} • {formatBytes(photoBytes)}
                  </span>
                )}
              </div>

              {errors.photos && (
                <p className="text-xs font-semibold text-[#C8202D] mt-2">{errors.photos}</p>
              )}
            </div>

            {offerGeneral && currentCadence && (
              <div
                className={`rounded-xl border p-4 space-y-3 transition-colors ${
                  alsoGeneral ? 'border-[#C8202D]/40 bg-[#FFF7F8]' : 'border-[#E4E6EB] bg-[#FAFBFC]'
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoGeneral}
                    onChange={(e) => {
                      setAlsoGeneral(e.target.checked);
                      if (!e.target.checked && currentCadence) setCadence(currentCadence);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={`mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-[#C8202D]/15 ${
                      alsoGeneral ? 'bg-[#C8202D] border-[#C8202D] text-white' : 'bg-white border-[#D0D3D9]'
                    }`}
                  >
                    {alsoGeneral && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-[#17181D]">
                      General maintenance was done too
                    </span>
                    <span className="block text-[11px] text-[#6B6F76] mt-0.5">
                      While the unit was open. Its clock resets from today, so the next one
                      falls due {intervalText(currentCadence)} from now rather than from the
                      date it was already on.
                    </span>
                  </span>
                </label>

                {alsoGeneral && (
                  <div className="pl-[30px] space-y-2.5">
                    {/*
                      The period is on the form rather than behind a second
                      tickbox. It is already filled in with what this unit keeps,
                      so leaving it alone is the ordinary case — but somebody who
                      has just had the thing apart and wants it looked at more
                      often should not have to find a checkbox first.
                    */}
                    <span className="block text-xs font-semibold text-[#17181D]">
                      How often from now on
                    </span>
                    <IntervalPicker
                      id="mnt-general-cadence"
                      value={cadence}
                      onChange={setCadence}
                      label="general maintenance for this unit"
                    />
                    <p className="text-[11px] text-[#6B6F76]">
                      Next general maintenance falls due{' '}
                      <strong>{addInterval(today, cadence) ?? '—'}</strong> —{' '}
                      {intervalText(cadence)}
                      {cadenceChanged
                        ? ', kept for this unit alone from now on.'
                        : ', which is what it was already on.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {errors.form && (
              <p
                role="alert"
                className="flex items-center gap-2 text-xs font-semibold text-[#A81823] bg-[#FDECEE] border border-[#C8202D]/20 rounded-xl px-3 py-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errors.form}
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC] flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={BUTTON.secondary}>
              Cancel
            </button>
            <button
              id="mnt-complete-btn"
              type="submit"
              disabled={reading}
              className={`${BUTTON.primary} disabled:cursor-not-allowed`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Mark done</span>
            </button>
          </div>
        </form>

        {/*
          Last in the panel so it is last in the tab order: the dialog opens
          with focus on "What was done", and a close button placed first would
          take that instead. Drawn at the top corner all the same.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-[18px] right-4 w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </motion.div>
  );
};

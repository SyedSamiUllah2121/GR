'use client';

import React, { useState } from 'react';
import { Camera, CheckCircle2, Loader2, Receipt, Trash2 } from 'lucide-react';
import { Interval, MaintenanceJob } from '../types';
import { completeJob, getJobs, getLastPerson, rememberPerson } from '../services/maintenanceStore';
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

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

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
  onDone: (job: MaintenanceJob) => void;
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

    setErrors(next);
    if (Object.keys(next).length > 0) return;

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
      if (!result.ok) {
        setErrors({ form: result.error ?? 'The repair was closed, but the service was not recorded' });
        return;
      }
    }

    onDone(saved);
  };

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="endmaintenancedialog-dialog-1-title"
      className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 id="endmaintenancedialog-dialog-1-title" className="text-base font-bold text-[#17181D]">End maintenance</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5 truncate">{job.title}</p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
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
              <p className="text-xs font-semibold text-[#C8202D] mt-1">
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
                <p className="text-xs font-semibold text-[#C8202D] mt-1">{errors.cost}</p>
              )}
            </div>
          </div>

          {/* Receipts and the finished work */}
          <div className="border-t border-[#EFEFF2] pt-4">
            <span className={labelClass}>
              Photos <span className="text-[#6B6F76]/70 font-normal">(optional)</span>
            </span>
            <p className="-mt-1 mb-2.5 text-[11px] text-[#6B6F76]">
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
                      className="w-20 h-20 object-cover rounded-md border border-[#E6E7EB]"
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
                className={`inline-flex items-center gap-2 px-3.5 py-2 border text-xs font-semibold rounded-md transition-colors ${
                  photos.length >= MAX_PHOTOS || reading
                    ? 'bg-[#F6F6F8] border-[#E6E7EB] text-[#9CA1A9] cursor-not-allowed'
                    : 'bg-white hover:bg-[#F6F6F8] border-[#E6E7EB] text-[#17181D] cursor-pointer'
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
            <div className="rounded-md border border-[#E6E7EB] bg-[#FAFAFA] p-3.5 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoGeneral}
                  onChange={(e) => {
                    setAlsoGeneral(e.target.checked);
                    if (!e.target.checked && currentCadence) setCadence(currentCadence);
                  }}
                  className="mt-0.5 w-4 h-4 accent-[#C8202D] cursor-pointer"
                />
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
                <div className="pl-7 space-y-2.5">
                  {/*
                    The period is on the form rather than behind a second
                    tickbox. It is already filled in with what this unit keeps,
                    so leaving it alone is the ordinary case — but somebody who
                    has just had the thing apart and wants it looked at more
                    often should not have to find a checkbox first.
                  */}
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
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
            <p role="alert" className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
              {errors.form}
            </p>
          )}

          <div className="pt-3 border-t border-[#E6E7EB] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="mnt-complete-btn"
              type="submit"
              disabled={reading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] disabled:bg-[#E0A0A6] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Mark done</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CalendarClock,
  ChevronRight,
  Hash,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  Equipment,
  MAINTENANCE_CATEGORY_KEYS,
  MAINTENANCE_CATEGORY_LABEL,
  MaintenanceCategory,
} from '../types';
import {
  EquipmentDraft,
  addEquipment,
  getEquipment,
  importEquipment,
  removeEquipment,
  restoreEquipment,
  subscribeToEquipment,
  updateEquipment,
} from '../services/equipmentStore';
import { getJobs, subscribeToMaintenance } from '../services/maintenanceStore';
import { activePlans, subscribeToPlans } from '../services/maintenancePlanStore';
import { toIsoDay, upcomingServices } from '../services/maintenanceSchedule';
import { canManageEquipment, fixedBranchFor, visibleEquipment } from '../services/permissions';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useBranches } from '../hooks/useBranches';
import { activeBranches } from '../services/branchStore';
import { useToast } from './ToastProvider';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

/**
 * The equipment register.
 *
 * One row per asset, because the point of the register is that a chiller is a
 * thing with a history rather than a phrase someone typed on a job. Each row
 * carries what the schedule needs to do its arithmetic — the category it is
 * serviced under and the day it went in — and what an engineer needs to find
 * it: where it stands and what is written on the plate.
 *
 * Scoped like the board: a branch manager sees their own branch's assets and
 * cannot edit them, since an interval is an estate-wide commitment.
 */
export const EquipmentScreen: React.FC = () => {
  const router = useRouter();
  const user = useCurrentUser();
  const showToast = useToast();

  const [all, setAll] = useState<Equipment[]>(() => getEquipment());
  const [jobs, setJobs] = useState(() => getJobs());
  const [plans, setPlans] = useState(() => activePlans());
  const [query, setQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const refresh = () => setAll(getEquipment());
    refresh();
    return subscribeToEquipment(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setPlans(activePlans());
    refresh();
    return subscribeToPlans(refresh);
  }, []);

  /*
   * Narrowed to the account before anything else reads it, the same way the
   * board narrows its jobs — one place, so no list below has to remember.
   */
  const mine = useMemo(() => visibleEquipment(user, all), [user, all]);
  const mayManage = canManageEquipment(user);
  const scopedTo = fixedBranchFor(user);

  /** When each asset is next due anything, keyed by asset id. */
  const nextDue = useMemo(() => {
    const today = toIsoDay(new Date());
    const map = new Map<string, { dueOn: string; task: string; overdue: boolean }>();
    upcomingServices(today, plans, mine, jobs).forEach((service) => {
      const existing = map.get(service.equipment.id);
      if (!existing || service.dueOn < existing.dueOn) {
        map.set(service.equipment.id, {
          dueOn: service.dueOn,
          task: service.plan.task,
          overdue: service.daysOverdue >= 0,
        });
      }
    });
    return map;
  }, [plans, mine, jobs]);

  /** Assets that a job has ever named, so withdrawing archives rather than deletes. */
  const referenced = useMemo(
    () => new Set(jobs.map((j) => j.equipmentId).filter((id): id is string => !!id)),
    [jobs]
  );

  const branches = useMemo(
    () => Array.from(new Set(mine.map((e) => e.branchName))).sort(),
    [mine]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine
      .filter((e) => (showArchived ? !e.active : e.active))
      .filter((e) => branchFilter === 'all' || e.branchName === branchFilter)
      .filter(
        (e) =>
          !q ||
          [e.name, e.serialNumber, e.make, e.model, e.location, e.branchName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
      )
      .sort(
        (a, b) => a.branchName.localeCompare(b.branchName) || a.name.localeCompare(b.name)
      );
  }, [mine, query, branchFilter, showArchived]);

  const archivedCount = mine.filter((e) => !e.active).length;

  const withdraw = (item: Equipment) => {
    if (
      !window.confirm(
        referenced.has(item.id)
          ? `Withdraw “${item.name}”? Jobs already name it, so it will be archived rather than deleted.`
          : `Delete “${item.name}”? Nothing refers to it, so this cannot be undone.`
      )
    ) {
      return;
    }
    const result = removeEquipment(item.id, referenced);
    if (!result.ok) {
      showToast(result.error ?? 'Could not withdraw that asset');
      return;
    }
    showToast(result.archived ? `${item.name} archived` : `${item.name} deleted`);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#17181D]">Equipment</h2>
          <p className="text-[#6B6F76] text-xs mt-0.5">
            {scopedTo && <span className="font-semibold text-[#17181D]">{scopedTo} • </span>}
            {mine.filter((e) => e.active).length} asset
            {mine.filter((e) => e.active).length === 1 ? '' : 's'} on record
          </p>
        </div>

        {mayManage && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              id="import-equipment-btn"
              type="button"
              onClick={() => setImporting(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#6B6F76]" />
              <span>Import a list</span>
            </button>
            <button
              id="add-equipment-btn"
              type="button"
              onClick={() => setEditing('new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add an asset</span>
            </button>
          </div>
        )}
      </header>

      <div className="p-6 md:p-10 flex-1 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 border-b border-[#E6E7EB] -mb-px">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                !showArchived
                  ? 'border-[#C8202D] text-[#C8202D]'
                  : 'border-transparent text-[#6B6F76] hover:text-[#17181D]'
              }`}
            >
              In service{' '}
              <span className="tabular-nums">({mine.filter((e) => e.active).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                showArchived
                  ? 'border-[#C8202D] text-[#C8202D]'
                  : 'border-transparent text-[#6B6F76] hover:text-[#17181D]'
              }`}
            >
              Archived <span className="tabular-nums">({archivedCount})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#9CA1A9] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="equipment-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, serial, make…"
                aria-label="Search equipment"
                className="w-52 sm:w-64 pl-9 pr-8 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D] transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA1A9] hover:text-[#17181D] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {branches.length > 1 && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                aria-label="Filter by branch"
                className="px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
              >
                <option value="all">All branches</option>
                {branches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="bg-white border border-[#E6E7EB] rounded-lg p-10 text-center shadow-xs">
            <Wrench className="w-8 h-8 text-[#9CA1A9] mx-auto mb-2.5" />
            <p className="text-sm font-bold text-[#17181D]">
              {showArchived ? 'Nothing archived' : 'No assets on record'}
            </p>
            <p className="text-xs text-[#6B6F76] mt-1 max-w-sm mx-auto">
              {showArchived
                ? 'Assets withdrawn while jobs still name them appear here.'
                : mayManage
                  ? 'Add them one at a time, or paste the whole appliance list in at once with Import.'
                  : 'Nothing has been recorded for your branch yet.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs divide-y divide-[#E6E7EB] overflow-hidden">
            {visible.map((item) => {
              const due = nextDue.get(item.id);
              return (
                <div
                  key={item.id}
                  className="px-5 py-4 flex flex-wrap items-start gap-x-5 gap-y-3 hover:bg-[#FAFAFA] transition-colors"
                >
                  <div className="flex-1 min-w-[14rem]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#17181D]">{item.name}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F1F1F4] text-[#6B6F76]">
                        {MAINTENANCE_CATEGORY_LABEL[item.category]}
                      </span>
                      {!item.active && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F1F1F4] text-[#6B6F76]">
                          <Archive className="w-3 h-3" />
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6B6F76] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-[#17181D]">{item.branchName}</span>
                      {item.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {item.location}
                        </span>
                      )}
                      {item.serialNumber && (
                        <span className="inline-flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {item.serialNumber}
                        </span>
                      )}
                      {(item.make || item.model) && (
                        <span>{[item.make, item.model].filter(Boolean).join(' ')}</span>
                      )}
                    </p>
                    {due && (
                      <p
                        className={`text-[11px] mt-1 inline-flex items-center gap-1.5 font-semibold ${
                          due.overdue ? 'text-[#C8202D]' : 'text-[#6B6F76]'
                        }`}
                      >
                        <CalendarClock className="w-3 h-3 shrink-0" />
                        {due.task} {due.overdue ? 'was due' : 'due'} {due.dueOn}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => router.push(`/maintenance/jobs?equipment=${item.id}`)}
                      title="Jobs raised against this asset"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F1F1F4] rounded-md transition-colors cursor-pointer"
                    >
                      <span>History</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    {mayManage &&
                      (item.active ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            aria-label={`Edit ${item.name}`}
                            className="p-2 text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F1F1F4] rounded-md transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => withdraw(item)}
                            aria-label={`Withdraw ${item.name}`}
                            className="p-2 text-[#C8202D] hover:bg-[#FDECEE] rounded-md transition-colors cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            restoreEquipment(item.id);
                            showToast(`${item.name} back in service`);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#157F4B] hover:bg-[#E6F4EC] rounded-md transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EquipmentDialog
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            showToast(`${name} saved`);
          }}
        />
      )}

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={(message) => {
            setImporting(false);
            showToast(message);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Adding and correcting one asset
// ---------------------------------------------------------------------------

const EquipmentDialog: React.FC<{
  item: Equipment | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}> = ({ item, onClose, onSaved }) => {
  const user = useCurrentUser();
  const branches = activeBranches(useBranches());
  const ownBranch = fixedBranchFor(user);

  const [draft, setDraft] = useState<EquipmentDraft>(() => ({
    branchName: item?.branchName ?? ownBranch ?? branches[0]?.name ?? '',
    name: item?.name ?? '',
    category: item?.category ?? 'OTHER',
    serialNumber: item?.serialNumber ?? '',
    make: item?.make ?? '',
    model: item?.model ?? '',
    location: item?.location ?? '',
    installedOn: item?.installedOn ?? '',
    notes: item?.notes ?? '',
  }));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof EquipmentDraft>(key: K, value: EquipmentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = item
      ? updateEquipment(item.id, draft)
      : addEquipment(draft, new Date().toISOString());
    if (!result.ok) {
      setError(result.error ?? 'Could not save that asset');
      return;
    }
    onSaved(result.equipment?.name ?? draft.name);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 className="text-base font-bold text-[#17181D]">
            {item ? 'Edit asset' : 'Add an asset'}
          </h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            The name, branch and category are what the schedule needs. The rest is what
            whoever is sent out needs.
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label htmlFor="eq-name" className={labelClass}>
              What it is
            </label>
            <input
              id="eq-name"
              type="text"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus
              placeholder="e.g. Split AC 2 — dining area"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="eq-branch" className={labelClass}>
                Branch
              </label>
              <select
                id="eq-branch"
                value={draft.branchName}
                onChange={(e) => set('branchName', e.target.value)}
                disabled={!!item}
                title={item ? 'An asset cannot be moved between branches' : undefined}
                className={`${inputClass} disabled:bg-[#F6F6F8] disabled:text-[#6B6F76]`}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="eq-category" className={labelClass}>
                Serviced under
              </label>
              <select
                id="eq-category"
                value={draft.category}
                onChange={(e) => set('category', e.target.value as MaintenanceCategory)}
                className={inputClass}
              >
                {MAINTENANCE_CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {MAINTENANCE_CATEGORY_LABEL[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="eq-serial" className={labelClass}>
                Serial number
              </label>
              <input
                id="eq-serial"
                type="text"
                value={draft.serialNumber ?? ''}
                onChange={(e) => set('serialNumber', e.target.value)}
                placeholder="As printed on the unit"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eq-location" className={labelClass}>
                Where it stands
              </label>
              <input
                id="eq-location"
                type="text"
                value={draft.location ?? ''}
                onChange={(e) => set('location', e.target.value)}
                placeholder="e.g. Back kitchen"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="eq-make" className={labelClass}>
                Make
              </label>
              <input
                id="eq-make"
                type="text"
                value={draft.make ?? ''}
                onChange={(e) => set('make', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eq-model" className={labelClass}>
                Model
              </label>
              <input
                id="eq-model"
                type="text"
                value={draft.model ?? ''}
                onChange={(e) => set('model', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eq-installed" className={labelClass}>
                Installed on
              </label>
              <input
                id="eq-installed"
                type="date"
                value={draft.installedOn ?? ''}
                onChange={(e) => set('installedOn', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <p className="-mt-2 text-[11px] text-[#6B6F76]">
            The install date is the clock a service plan counts from until the first
            service is recorded against it. Left blank, it counts from today.
          </p>

          <div>
            <label htmlFor="eq-notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="eq-notes"
              value={draft.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              placeholder="Warranty, contract, anything worth knowing before going out."
              className={`${inputClass} resize-y`}
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
              {error}
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
              id="eq-save-btn"
              type="submit"
              className="px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Save asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The whole appliance list at once
// ---------------------------------------------------------------------------

const COLUMNS = 'Branch, Name, Category, Serial, Make, Model, Location, Installed (YYYY-MM-DD)';

/**
 * Reads a pasted list.
 *
 * Comma separated, one asset per line, because that is what comes out of a
 * spreadsheet without asking anybody to convert anything. Quoted fields are
 * honoured so a location with a comma in it survives.
 */
function parseRow(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(field.trim());
      field = '';
    } else field += ch;
  }
  out.push(field.trim());
  return out;
}

/** Matches a written category to one of the keys, by label or by key. */
function readCategory(text: string): MaintenanceCategory {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return 'OTHER';
  const byKey = MAINTENANCE_CATEGORY_KEYS.find((k) => k.toLowerCase() === wanted);
  if (byKey) return byKey;
  const byLabel = MAINTENANCE_CATEGORY_KEYS.find(
    (k) => MAINTENANCE_CATEGORY_LABEL[k].toLowerCase() === wanted
  );
  return byLabel ?? 'OTHER';
}

const ImportDialog: React.FC<{
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ onClose, onDone }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSkipped([]);

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      // A header row pasted along with the data is dropped rather than imported
      .filter((l, i) => !(i === 0 && /^branch\s*,/i.test(l)));

    if (lines.length === 0) {
      setError('Paste at least one line');
      return;
    }

    const rows: EquipmentDraft[] = lines.map((line) => {
      const [branchName, name, category, serialNumber, make, model, location, installedOn] =
        parseRow(line);
      return {
        branchName: branchName ?? '',
        name: name ?? '',
        category: readCategory(category ?? ''),
        serialNumber,
        make,
        model,
        location,
        installedOn,
      };
    });

    const result = importEquipment(rows, new Date().toISOString());
    if (!result.ok || !result.result) {
      setError(result.error ?? 'Could not import that list');
      return;
    }

    const { added, updated, skipped: bad } = result.result;
    if (bad.length > 0) {
      setSkipped(bad);
      setError(`${bad.length} line${bad.length === 1 ? '' : 's'} could not be read`);
      // The good rows are already in; the dialog stays open to show which failed
      return;
    }
    onDone(`${added} added, ${updated} updated`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-2xl my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 className="text-base font-bold text-[#17181D]">Import an appliance list</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Paste it straight out of a spreadsheet — one asset per line.
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="bg-[#FAFAFA] border border-[#E6E7EB] rounded-md px-3.5 py-3">
            <p className={labelClass}>Columns, in this order</p>
            <code className="text-[11px] text-[#17181D] break-words">{COLUMNS}</code>
            <p className="text-[11px] text-[#6B6F76] mt-2">
              Only Branch and Name are required. An asset already on record is corrected
              rather than added twice, so a corrected spreadsheet can be pasted again.
            </p>
          </div>

          <div>
            <label htmlFor="eq-import" className={labelClass}>
              The list
            </label>
            <textarea
              id="eq-import"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              autoFocus
              spellCheck={false}
              placeholder={
                "Zahra's Kitchen, Counter printer, IT & printers, SN-99812, Epson, TM-T88VI, Front counter, 2025-03-14"
              }
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          </div>

          {error && (
            <div className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
              <p>{error}</p>
              {skipped.length > 0 && (
                <ul className="mt-1.5 font-normal space-y-0.5">
                  {skipped.slice(0, 8).map((s) => (
                    <li key={s.line}>
                      Line {s.line}: {s.reason}
                    </li>
                  ))}
                  {skipped.length > 8 && <li>…and {skipped.length - 8} more</li>}
                </ul>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-[#E6E7EB] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              {skipped.length > 0 ? 'Done' : 'Cancel'}
            </button>
            <button
              id="eq-import-btn"
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Import</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

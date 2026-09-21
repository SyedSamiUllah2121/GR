'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hash,
  MapPin,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  Equipment,
  EquipmentCategory,
  Interval,
  IntervalUnit,
  MaintenanceCategory,
  MaintenancePlan,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_ORDER,
  ServiceStatus,
} from '../types';
import { Combobox } from './Combobox';
import { SEGMENT_CATEGORY } from '../data/assetRegister';
import {
  assetOptionsFor,
  categoryForType,
  readServiceDate,
  readServiceStatus,
  usesCapacity,
} from '../services/assetOptions';
import { useCategories } from '../hooks/useCategories';
import { useDialog } from '../hooks/useDialog';
import {
  activeCategories,
  addCategory,
  categoryLabel,
  defaultCategory,
  isSystemCategory,
  removeCategory,
  renameCategory,
  setCategoryActive,
} from '../services/categoryStore';
import {
  EquipmentDraft,
  addEquipment,
  equipmentSeedProblem,
  getEquipment,
  importEquipment,
  nextAssetNo,
  removeEquipment,
  restoreEquipment,
  subscribeToEquipment,
  updateEquipment,
} from '../services/equipmentStore';
import {
  getJobs,
  getLastPerson,
  rememberPerson,
  subscribeToMaintenance,
} from '../services/maintenanceStore';
import {
  DAY_INTERVAL_CHOICES,
  INTERVAL_CHOICES,
  activePlans,
  ensureGeneralPlans,
  generalPlanIdFor,
  getPlans,
  intervalProblem,
  isGeneralPlan,
  setPlanActive,
  subscribeToPlans,
  updatePlan,
} from '../services/maintenancePlanStore';
import {
  addInterval,
  intervalOf,
  intervalText,
  overrideOf,
  toIsoDay,
  upcomingServices,
} from '../services/maintenanceSchedule';
import {
  GeneralMaintenanceState,
  generalMaintenanceState,
  recordGeneralMaintenance,
} from '../services/generalMaintenance';
import { canManageEquipment, fixedBranchFor, visibleEquipment } from '../services/permissions';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useBranches } from '../hooks/useBranches';
import { activeBranches } from '../services/branchStore';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmProvider';
import { IntervalPicker } from './IntervalPicker';

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
  const confirm = useConfirm();

  const [all, setAll] = useState<Equipment[]>(() => getEquipment());
  const [jobs, setJobs] = useState(() => getJobs());
  const [plans, setPlans] = useState(() => activePlans());
  /*
   * The plans including the turned-off ones, for the category headings alone.
   *  above stays narrowed to what is in force, because feeding a
   * withdrawn rule to the schedule would put work on the board that nobody
   * asked for — but a heading that said nothing about a category whose general
   * maintenance has been switched off would read as one that never had any.
   */
  const [allPlans, setAllPlans] = useState<MaintenancePlan[]>(() => getPlans());
  const [query, setQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  /**
   * Which service state to show, or every one.
   *
   * Worth its own control now that the register holds the real estate: 35 of
   * the 91 air conditioners are due and two do not run at all, and finding
   * those by scrolling 302 assets is not finding them.
   */
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  /*
   * Read after mount rather than during render: the reason is set by
   * `getEquipment`, which the effect below is what actually calls first on the
   * client, and reading it in an initialiser would sample it before the seed
   * had been attempted at all.
   */
  const [seedProblem, setSeedProblem] = useState<string | null>(null);
  /*
   * Either an asset being corrected, or a new one and the category it is being
   * added into — `{ newIn }` rather than a bare 'new', because the register is
   * read category by category and "add" is nearly always reached from inside
   * one of them.
   */
  const [editing, setEditing] = useState<Equipment | { newIn: MaintenanceCategory } | null>(
    null
  );
  const [importing, setImporting] = useState(false);
  /**
   * The category being looked inside, or null for the list of them.
   *
   * The register is read a trade at a time — "show me the air conditioners" —
   * so the top of it is the trades, and an appliance list is what opening one
   * gets you. Eleven categories' worth of rows on one page was the whole
   * estate at once, which is not a question anybody asks.
   */
  const [openCategory, setOpenCategory] = useState<MaintenanceCategory | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  /** The asset whose general maintenance is being recorded, when one is. */
  const [recording, setRecording] = useState<Equipment | null>(null);
  const categories = useCategories();

  useEffect(() => {
    const refresh = () => {
      setAll(getEquipment());
      // Read after the call, because the call is what sets it
      setSeedProblem(equipmentSeedProblem());
    };
    refresh();
    return subscribeToEquipment(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setPlans(activePlans());
      setAllPlans(getPlans());
    };
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

  const today = toIsoDay(new Date());

  /**
   * Where each asset stands on its general maintenance.
   *
   * Kept apart from the named services below rather than folded in with them,
   * because they answer different questions and the row shows both. Collapsed
   * into one "soonest thing" map, a quarterly printer service would hide the
   * general maintenance that is three weeks overdue, or be hidden by it — with
   * no symptom either way, since the line that got shown would look right.
   */
  const general = useMemo(() => {
    const map = new Map<string, GeneralMaintenanceState>();
    mine.forEach((item) => {
      const state = generalMaintenanceState(item, today, plans, jobs);
      if (state) map.set(item.id, state);
    });
    return map;
  }, [mine, today, plans, jobs]);

  /** When each asset is next due one of its category's named services. */
  const nextDue = useMemo(() => {
    const map = new Map<string, { dueOn: string; task: string; overdue: boolean }>();
    upcomingServices(today, plans, mine, jobs).forEach((service) => {
      if (isGeneralPlan(service.plan)) return;
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
  }, [plans, mine, jobs, today]);

  /** Which categories anything still names, so withdrawing archives rather than deletes. */
  const categoriesInUse = useMemo(() => {
    const used = new Set<string>();
    all.forEach((e) => used.add(e.category));
    jobs.forEach((j) => used.add(j.category));
    plans.forEach((p) => used.add(p.category));
    return used;
  }, [all, jobs, plans]);

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
        (e) => statusFilter === 'all' || (e.serviceStatus ?? 'inventory') === statusFilter
      )
      .filter(
        (e) =>
          !q ||
          [
            e.assetNo,
            e.name,
            e.assetType,
            e.capacity,
            e.serialNumber,
            e.make,
            e.model,
            e.location,
            e.branchName,
            e.statusNote,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
      )
      .sort(
        (a, b) => a.branchName.localeCompare(b.branchName) || a.name.localeCompare(b.name)
      );
  }, [mine, query, branchFilter, statusFilter, showArchived]);

  const archivedCount = mine.filter((e) => !e.active).length;

  /**
   * How many assets sit in each service state, on the tab being looked at.
   *
   * Counted before the status filter is applied but after the archived tab is
   * chosen, which is the only way the numbers stay still: counting after the
   * filter would show "Service due (33)" until it was picked and "(33)" of a
   * list of 33 thereafter, and counting across both tabs would promise rows
   * the archived tab does not have.
   */
  const statusCounts = useMemo(() => {
    const counts = new Map<ServiceStatus, number>();
    mine
      .filter((e) => (showArchived ? !e.active : e.active))
      .filter((e) => branchFilter === 'all' || e.branchName === branchFilter)
      .forEach((e) => {
        const status = e.serviceStatus ?? 'inventory';
        counts.set(status, (counts.get(status) ?? 0) + 1);
      });
    return counts;
  }, [mine, showArchived, branchFilter]);

  /**
   * The register, category by category.
   *
   * Grouped rather than one long list because a category is how the operator
   * thinks about the estate — "the fridges", "the extinguishers" — and because
   * it is the thing an appliance is added *into*: an add button sitting under
   * its own heading carries the category with it and saves choosing it again
   * in the form.
   *
   * Empty categories are shown too, on the plain list. They are the ones most
   * in need of an add button, and a category somebody created yesterday that
   * appeared nowhere until it had contents would read as not having saved.
   * Under a search or a branch filter they are dropped, because there the
   * absence of matches is the answer rather than an invitation.
   */
  const grouped = useMemo(() => {
    const narrowed = branchFilter !== 'all' || showArchived;

    const byCategory = new Map<MaintenanceCategory, Equipment[]>();
    visible.forEach((item) => {
      const list = byCategory.get(item.category);
      if (list) list.push(item);
      else byCategory.set(item.category, [item]);
    });

    const listed = activeCategories(categories)
      .filter((c) => byCategory.has(c.id) || !narrowed)
      .map((c) => ({ id: c.id, label: c.label, items: byCategory.get(c.id) ?? [] }));

    /*
     * Anything filed under a category no longer on the list is appended rather
     * than dropped. An asset that renders nowhere is worse than one under a
     * heading that reads oddly — this is the only place it would be noticed.
     */
    const shown = new Set(listed.map((g) => g.id));
    const orphans = Array.from(byCategory.keys())
      .filter((key) => !shown.has(key))
      .map((key) => ({
        id: key,
        label: categoryLabel(key, categories),
        items: byCategory.get(key) ?? [],
      }));

    return [...listed, ...orphans];
  }, [visible, categories, branchFilter, showArchived]);

  const searching = query.trim() !== '';

  /** Every appliance matching the search, whatever category it is filed under. */
  const matches = useMemo(() => (searching ? visible : []), [searching, visible]);

  /**
   * The category being looked inside, once the list has been narrowed.
   *
   * Read back out of `grouped` rather than held as its own object, so a
   * category withdrawn in another tab while it was open closes rather than
   * going on showing a heading for something that is no longer a category.
   */
  const openGroup = openCategory
    ? grouped.find((group) => group.id === openCategory) ?? null
    : null;

  const withdraw = async (item: Equipment) => {
    const inUse = referenced.has(item.id);
    const ok = await confirm({
      title: inUse ? `Withdraw “${item.name}”?` : `Delete “${item.name}”?`,
      body: inUse
        ? 'Jobs already name it, so it is archived rather than deleted and they stay readable.'
        : 'Nothing refers to it, so this cannot be undone.',
      confirmLabel: inUse ? 'Withdraw' : 'Delete',
    });
    if (!ok) return;
    const result = removeEquipment(item.id, referenced);
    if (!result.ok) {
      showToast(result.error ?? 'Could not withdraw that asset');
      return;
    }
    showToast(result.archived ? `${item.name} archived` : `${item.name} deleted`);
  };

  /**
   * One appliance, wherever it is being listed from.
   *
   * A function rather than two copies of the same JSX: the category list and
   * the search results show the same row, and the only difference between them
   * is whether it has to say which category it is in.
   */
  const renderRow = (item: Equipment, showCategory: boolean) => (
    <AssetRow
      key={item.id}
      item={item}
      due={nextDue.get(item.id)}
      gm={general.get(item.id)}
      ownInterval={overrideOf(item, generalPlanIdFor(item.category))}
      categoryLabelText={categoryLabel(item.category, categories)}
      showCategory={showCategory}
      mayManage={mayManage}
      onHistory={() => router.push(`/maintenance/jobs?equipment=${item.id}`)}
      onRecord={() => setRecording(item)}
      onEdit={() => setEditing(item)}
      onWithdraw={() => withdraw(item)}
      onRestore={() => {
        restoreEquipment(item.id);
        showToast(`${item.name} back in service`);
      }}
    />
  );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[#17181D]">Appliances</h2>
          <p className="text-[#6B6F76] text-xs mt-0.5">
            {scopedTo && <span className="font-semibold text-[#17181D]">{scopedTo} • </span>}
            {mine.filter((e) => e.active).length} asset
            {mine.filter((e) => e.active).length === 1 ? '' : 's'} on record
          </p>
        </div>

        {mayManage && (
          <div className="flex flex-wrap items-center gap-2">
            {/*
              In the page header rather than on a category, so it is in the
              same place whether you are looking at the list of trades or
              standing inside one of them. It opens all of them either way —
              there was never a per-category version of this dialog, only a
              per-category place to reach it from.
            */}
            <button
              id="manage-categories-btn"
              type="button"
              onClick={() => setManagingCategories(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Tag className="w-4 h-4 text-[#6B6F76]" />
              <span>Category settings</span>
            </button>
            <button
              id="import-equipment-btn"
              type="button"
              onClick={() => setImporting(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#6B6F76]" />
              <span>Import a list</span>
            </button>
            {/*
              One primary action, and it follows what the screen is showing.
              The list of trades is a list of categories, so the button adds a
              category; a trade you have opened is a list of appliances, so it
              adds one of those — into the category already in front of you,
              which is the only place the trade never has to be picked again.
            */}
            <button
              id="add-category-btn"
              type="button"
              onClick={() =>
                openGroup ? setEditing({ newIn: openGroup.id }) : setAddingCategory(true)
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{openGroup ? `Add to ${openGroup.label}` : 'Add category'}</span>
            </button>
          </div>
        )}
      </header>

      <div className="p-6 md:p-10 flex-1 space-y-5">
        {/*
          Said in the screen rather than the console. A register that silently
          stays on the previous estate is indistinguishable from an app that
          has not been updated, and the person looking at it has no way to tell
          those apart — so when the shipped register could not be written, the
          screen says so and says what frees the room.
        */}
        {seedProblem && (
          <p
            role="alert"
            className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3.5 py-3"
          >
            {seedProblem}
          </p>
        )}
        {/*
          The way back out, and the only thing on the screen saying which
          category is open — the section heading below repeats the name, but a
          heading is not something anybody reads as a control.
        */}
        {openGroup && !searching && (
          <button
            type="button"
            onClick={() => setOpenCategory(null)}
            className="inline-flex items-center gap-1.5 -mb-1 text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>All categories</span>
          </button>
        )}

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

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative basis-full sm:basis-auto sm:flex-none">
              <Search className="w-3.5 h-3.5 text-[#9CA1A9] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="equipment-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search asset no, name, make…"
                aria-label="Search appliances"
                className="w-full sm:w-64 pl-9 pr-8 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D] transition-colors"
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
                className="flex-1 sm:flex-none min-w-0 px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
              >
                <option value="all">All branches</option>
                {branches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {/*
              Only the states actually present are offered, with their counts.
              A filter listing "Not working (0)" invites a click that empties
              the screen, and a register where nothing is broken should say so
              by not offering the option at all.
            */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ServiceStatus | 'all')}
              aria-label="Filter by service status"
              className="flex-1 sm:flex-none min-w-0 px-3 py-2 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
            >
              <option value="all">Any status</option>
              {SERVICE_STATUS_ORDER.filter((status) => statusCounts.get(status)).map(
                (status) => (
                  <option key={status} value={status}>
                    {SERVICE_STATUS_LABELS[status]} ({statusCounts.get(status)})
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {/*
          Searching cuts across the categories rather than through them. Somebody
          typing a serial number is looking for one unit and does not know, or
          care, which trade it is filed under — so a search answers with the
          appliances themselves and says which category each is in.
        */}
        {searching ? (
          matches.length === 0 ? (
            <div className="bg-white border border-[#E6E7EB] rounded-lg p-10 text-center shadow-xs">
              <Wrench className="w-8 h-8 text-[#9CA1A9] mx-auto mb-2.5" />
              <p className="text-sm font-bold text-[#17181D]">Nothing matches</p>
              <p className="text-xs text-[#6B6F76] mt-1 max-w-sm mx-auto">
                No appliance matches “{query.trim()}” by asset number, name, type,
                capacity, serial, make, model or where it stands.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs divide-y divide-[#EFEFF2] overflow-hidden">
              {matches.map((item) => renderRow(item, true))}
            </div>
          )
        ) : grouped.length === 0 ? (
          <div className="bg-white border border-[#E6E7EB] rounded-lg p-10 text-center shadow-xs">
            <Wrench className="w-8 h-8 text-[#9CA1A9] mx-auto mb-2.5" />
            <p className="text-sm font-bold text-[#17181D]">
              {showArchived ? 'Nothing archived' : 'No categories yet'}
            </p>
            <p className="text-xs text-[#6B6F76] mt-1 max-w-sm mx-auto">
              {showArchived
                ? 'Assets withdrawn while jobs still name them appear here.'
                : 'Add a category first — an appliance is filed under the trade that services it.'}
            </p>
          </div>
        ) : openGroup ? (
          <div className="space-y-4">
            {[openGroup].map((group) => {
              const plan = allPlans.find((p) => p.id === generalPlanIdFor(group.id));
              const cadence = plan ? intervalOf(plan) : null;
              return (
                <section
                  key={group.id}
                  className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden"
                >
                  {/*
                    The heading carries the cadence as well as the name, because
                    the two are one fact: what this category IS, as far as the
                    register is concerned, is the thing its appliances are
                    serviced on.
                  */}
                  <div className="px-5 py-3 bg-[#FAFAFA] border-b border-[#E6E7EB] flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="text-sm font-bold text-[#17181D]">{group.label}</h3>
                      <span className="text-[11px] text-[#6B6F76] tabular-nums">
                        {group.items.length} appliance{group.items.length === 1 ? '' : 's'}
                      </span>
                      {cadence ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#6B6F76]">
                          <CalendarClock className="w-3 h-3" />
                          general maintenance {intervalText(cadence)}
                          {plan && !plan.active ? ' — turned off' : ''}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#6B6F76]">
                          no general maintenance set
                        </span>
                      )}
                    </div>

                    {/*
                      Nothing on the right of the heading. Adding an appliance
                      and changing the category are both in the page header
                      above, and a second copy of either here would be two
                      buttons doing one thing.
                    */}
                  </div>

                  {group.items.length === 0 ? (
                    <p className="px-5 py-6 text-xs text-[#6B6F76] text-center">
                      Nothing filed under this yet.
                    </p>
                  ) : (
                  <div className="divide-y divide-[#EFEFF2]">
                    {group.items.map((item) => renderRow(item, false))}
                  </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          /*
            The trades themselves. A card per category rather than a row,
            because the three things worth knowing before opening one — how many
            appliances are in it, what they are serviced on, and how many are
            overdue — do not read as a line of text.
          */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {grouped.map((group) => {
              const plan = allPlans.find((p) => p.id === generalPlanIdFor(group.id));
              const cadence = plan ? intervalOf(plan) : null;
              const overdue = group.items.filter((item) => general.get(item.id)?.due).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setOpenCategory(group.id)}
                  className="text-left bg-white border border-[#E6E7EB] rounded-lg shadow-xs p-5 hover:border-[#C8202D]/40 hover:shadow-sm transition-all cursor-pointer flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-[#17181D]">{group.label}</h3>
                    <ChevronRight className="w-4 h-4 text-[#9CA1A9] shrink-0 mt-0.5" />
                  </div>

                  <p className="text-2xl font-bold text-[#17181D] tabular-nums leading-none">
                    {group.items.length}
                    <span className="ml-1.5 text-xs font-semibold text-[#6B6F76]">
                      appliance{group.items.length === 1 ? '' : 's'}
                    </span>
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {cadence ? (
                      <span className="inline-flex items-center gap-1 text-[#6B6F76]">
                        <CalendarClock className="w-3 h-3" />
                        {intervalText(cadence)}
                        {plan && !plan.active ? ' — turned off' : ''}
                      </span>
                    ) : (
                      <span className="text-[#6B6F76]">no general maintenance set</span>
                    )}
                    {overdue > 0 && (
                      <span className="font-bold text-[#C8202D] tabular-nums">
                        {overdue} due now
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EquipmentDialog
          item={'newIn' in editing ? null : editing}
          presetCategory={'newIn' in editing ? editing.newIn : undefined}
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

      {managingCategories && (
        <CategoryDialog
          inUse={categoriesInUse}
          onClose={() => setManagingCategories(false)}
        />
      )}

      {addingCategory && (
        <AddCategoryDialog
          onClose={() => setAddingCategory(false)}
          onAdded={(label, id) => {
            setAddingCategory(false);
            // Straight into the thing just made, because the only reason to
            // create a category is to start putting appliances in it
            setOpenCategory(id);
            showToast(`${label} added`);
          }}
        />
      )}

      {recording && (
        <MarkGeneralDoneDialog
          item={recording}
          state={general.get(recording.id) ?? null}
          onClose={() => setRecording(null)}
          onDone={(message) => {
            setRecording(null);
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
  /** The category this was opened from, for a new asset added inside one. */
  presetCategory?: MaintenanceCategory;
  onClose: () => void;
  onSaved: (name: string) => void;
}> = ({ item, presetCategory, onClose, onSaved }) => {
  const user = useCurrentUser();
  const branches = activeBranches(useBranches());
  const categories = useCategories();
  const ownBranch = fixedBranchFor(user);
  const [plans, setPlans] = useState<MaintenancePlan[]>(() => getPlans());

  useEffect(() => {
    const refresh = () => setPlans(getPlans());
    refresh();
    return subscribeToPlans(refresh);
  }, []);

  const [draft, setDraft] = useState<EquipmentDraft>(() => ({
    branchName: item?.branchName ?? ownBranch ?? branches[0]?.name ?? '',
    name: item?.name ?? '',
    category: item?.category ?? presetCategory ?? defaultCategory(),
    assetNo: item?.assetNo ?? '',
    assetType: item?.assetType ?? item?.name ?? '',
    capacity: item?.capacity ?? '',
    quantity: item?.quantity ?? 1,
    serviceStatus: item?.serviceStatus ?? 'inventory',
    statusNote: item?.statusNote ?? '',
    lastServicedOn: item?.lastServicedOn ?? '',
    serialNumber: item?.serialNumber ?? '',
    make: item?.make ?? '',
    model: item?.model ?? '',
    location: item?.location ?? '',
    installedOn: item?.installedOn ?? '',
    notes: item?.notes ?? '',
    planOverrides: item?.planOverrides,
  }));
  const [error, setError] = useState<string | null>(null);

  /**
   * Whether the name is still following the type.
   *
   * Most assets are called what they are — a "Kulfi Freezer" is named Kulfi
   * Freezer — so the name tracks the type field until somebody types a name of
   * their own, and then it stops for good. Tracking after that would rewrite
   * "Fryer — left hand" the moment the type was corrected, which is the
   * behaviour every form that does this silently gets wrong.
   *
   * An existing asset starts untracked: its name is already decided.
   */
  const [nameFollowsType, setNameFollowsType] = useState(
    () => !item || (item.assetType ?? '') === item.name
  );

  const set = <K extends keyof EquipmentDraft>(key: K, value: EquipmentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const options = useMemo(
    () => assetOptionsFor(getEquipment(), draft.branchName, draft.category),
    [draft.branchName, draft.category]
  );

  /**
   * Choosing a type fills in the rest of the sentence.
   *
   * The name follows it while untouched, and the category follows it when the
   * register has only ever filed that type under one trade — pick "Kulfi
   * Freezer" and the asset lands under refrigeration without being asked. A
   * type the register has never seen, or has filed under two trades, leaves
   * the category alone rather than guessing at it.
   */
  const setType = (value: string) => {
    setDraft((d) => {
      const inferred = categoryForType(value);
      return {
        ...d,
        assetType: value,
        name: nameFollowsType ? value : d.name,
        category: inferred && !item ? inferred : d.category,
      };
    });
  };

  /**
   * The next free number, offered rather than imposed.
   *
   * A button and not an auto-fill: the number is the estate's own and a unit
   * that already carries a tag has to be recorded under the tag on the unit,
   * not under whatever this app would have handed out next. So the field
   * starts empty on a new asset and the suggestion is one click away.
   */
  const suggestAssetNo = () =>
    set('assetNo', nextAssetNo(draft.branchName, draft.category));

  /**
   * Reading a status note back into a status and a date.
   *
   * The wording is what gets typed, because the wording is what the master
   * document says — so typing "Serviced 25 Aug 2026" sets the status to
   * Serviced and the service date to the 25th, and the operator never has to
   * say the same thing three times. Both stay editable afterwards; this fills
   * blanks and corrects the status, it does not lock anything.
   */
  const setStatusNote = (value: string) => {
    setDraft((d) => {
      const status = readServiceStatus(value);
      const serviced = readServiceDate(value);
      return {
        ...d,
        statusNote: value,
        serviceStatus: status ?? d.serviceStatus,
        lastServicedOn: serviced ?? d.lastServicedOn,
      };
    });
  };

  /*
   * The general plan of whichever category is currently chosen — so changing
   * the category in the form changes what the cadence panel below is talking
   * about, rather than showing the old trade's rule until it is saved.
   */
  const generalPlanId = generalPlanIdFor(draft.category);
  const generalPlan = plans.find((p) => p.id === generalPlanId) ?? null;
  const categoryCadence = generalPlan ? intervalOf(generalPlan) : null;

  /** Three states, and which one the asset is in: inherit, its own, or exempt. */
  const stored = draft.planOverrides?.[generalPlanId];
  const mode: 'inherit' | 'own' | 'exempt' =
    stored === undefined ? 'inherit' : stored === null ? 'exempt' : 'own';
  const ownCadence: Interval =
    (typeof stored === 'object' && stored !== null ? stored : null) ??
    categoryCadence ?? { every: 6, unit: 'months' };

  const setOverride = (value: Interval | null | undefined) => {
    setDraft((d) => {
      const next = { ...(d.planOverrides ?? {}) };
      // Absent and null say different things, so one is a delete and the
      // other is a write. Collapsing them would turn "follow the category"
      // into "never service this again"
      if (value === undefined) delete next[generalPlanId];
      else next[generalPlanId] = value;
      return { ...d, planOverrides: Object.keys(next).length > 0 ? next : undefined };
    });
  };

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

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="equipmentscreen-dialog-1-title"
      className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 id="equipmentscreen-dialog-1-title" className="text-base font-bold text-[#17181D]">
            {item ? 'Edit asset' : 'Add an asset'}
          </h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            The name, branch and category are what the schedule needs. The rest is what
            whoever is sent out needs.
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {/*
            Type first, then name. The type is the field with the answers in
            it, it fills the name in on the way past, and it is what somebody
            adding a fryer actually has in mind — asking for a name first makes
            them invent one before they have said what the thing is.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="eq-type" className={labelClass}>
                What it is
              </label>
              <Combobox
                id="eq-type"
                value={draft.assetType ?? ''}
                onChange={setType}
                options={options.types}
                placeholder="e.g. Split AC, Kulfi Freezer"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eq-name" className={labelClass}>
                Called on the floor
              </label>
              <input
                id="eq-name"
                type="text"
                value={draft.name}
                onChange={(e) => {
                  setNameFollowsType(false);
                  set('name', e.target.value);
                }}
                placeholder={draft.assetType || 'Same as what it is'}
                className={inputClass}
              />
            </div>
          </div>

          {/*
            The asset number sits on its own row and above everything else that
            identifies the unit, because on this estate it *is* the
            identification — nine fridges at one branch are all called
            "Refrigerator" and only the number tells them apart.
          */}
          <div>
            <label htmlFor="eq-asset-no" className={labelClass}>
              Asset number
            </label>
            <div className="flex gap-2">
              <input
                id="eq-asset-no"
                type="text"
                value={draft.assetNo ?? ''}
                onChange={(e) => set('assetNo', e.target.value.toUpperCase())}
                autoFocus={!item}
                placeholder="e.g. RG-ACU-008"
                className={`${inputClass} font-mono tracking-wide`}
              />
              <button
                type="button"
                onClick={suggestAssetNo}
                className="shrink-0 px-3 py-2.5 rounded-md border border-[#E6E7EB] bg-white text-[11px] font-bold text-[#6B6F76] hover:bg-[#F6F6F8] hover:text-[#17181D] transition-colors cursor-pointer"
              >
                Next free
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[#6B6F76]">
              As printed on the unit. <span className="font-mono">Next free</span> offers{' '}
              <span className="font-mono">{nextAssetNo(draft.branchName, draft.category)}</span> —
              the number runs across the whole estate, not per branch, so it is free
              everywhere.
            </p>
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
                {activeCategories(categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/*
            Directly under the category, because a cadence is the second half
            of the sentence "serviced under" starts. Three buttons rather than
            a checkbox and a number, because there are genuinely three answers
            and the middle one is not the absence of the other two: follow the
            estate, keep your own interval, or be on no cadence at all.
          */}
          <div className="rounded-md border border-[#E6E7EB] bg-[#FAFAFA] p-3.5 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={`${labelClass} mb-0`}>General maintenance</span>
              {categoryCadence ? (
                <span className="text-[11px] text-[#6B6F76]">
                  {categoryLabel(draft.category, categories)} is serviced{' '}
                  {intervalText(categoryCadence)}
                </span>
              ) : (
                <span className="text-[11px] text-[#6B6F76]">
                  This category raises no general maintenance
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {([
                ['inherit', 'Follow the category'],
                ['own', 'Its own interval'],
                ['exempt', 'Not on general maintenance'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={mode === key}
                  onClick={() =>
                    setOverride(
                      key === 'inherit' ? undefined : key === 'exempt' ? null : ownCadence
                    )
                  }
                  className={`px-3 py-2 rounded-md border text-[11px] font-bold transition-colors cursor-pointer ${
                    mode === key
                      ? 'border-[#C8202D] bg-[#FDECEE] text-[#C8202D]'
                      : 'border-[#E6E7EB] bg-white text-[#6B6F76] hover:bg-[#F6F6F8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'own' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[#6B6F76]">every</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  list="asset-interval-choices"
                  value={ownCadence.every}
                  onChange={(e) =>
                    setOverride({ ...ownCadence, every: Number(e.target.value) })
                  }
                  aria-label="How often this asset is serviced"
                  className="w-24 px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]"
                />
                <datalist id="asset-interval-choices">
                  {(ownCadence.unit === 'days' ? DAY_INTERVAL_CHOICES : INTERVAL_CHOICES).map(
                    (n) => (
                      <option key={n} value={n} />
                    )
                  )}
                </datalist>
                <select
                  value={ownCadence.unit}
                  onChange={(e) =>
                    setOverride({ ...ownCadence, unit: e.target.value as IntervalUnit })
                  }
                  aria-label="Days or months"
                  className="px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
                >
                  <option value="days">days</option>
                  <option value="months">months</option>
                </select>
              </div>
            )}

            <p className="text-[11px] text-[#6B6F76]">
              {mode === 'exempt'
                ? 'Nothing will be raised for this one — a unit on a contract, or serviced by whoever leases it.'
                : mode === 'own'
                  ? `Falls due ${intervalText(ownCadence)}, counted from the last time the work was recorded as done.`
                  : 'Falls due on whatever its category keeps, so changing the category rule changes this one with it.'}
            </p>
          </div>

          {/*
            Where it stands and what it is: a combobox each, offering this
            branch's own locations first and then everywhere else's, and the
            makes the estate actually buys. Typed answers are kept as typed —
            these are lists of what has been seen, not lists of what is allowed.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="eq-location" className={labelClass}>
                Where it stands
              </label>
              <Combobox
                id="eq-location"
                value={draft.location ?? ''}
                onChange={(value) => set('location', value)}
                options={options.locations}
                placeholder="e.g. Main Kitchen"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eq-make" className={labelClass}>
                Make
              </label>
              <Combobox
                id="eq-make"
                value={draft.make ?? ''}
                onChange={(value) => set('make', value)}
                options={options.makes}
                placeholder="e.g. O General"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/*
              Capacity appears only for the trades that measure in tons. On a
              fryer the field is meaningless, and a form that shows every field
              to everybody is how registers fill up with blanks.
            */}
            {usesCapacity(draft.category) && (
              <div>
                <label htmlFor="eq-capacity" className={labelClass}>
                  Capacity
                </label>
                <Combobox
                  id="eq-capacity"
                  value={draft.capacity ?? ''}
                  onChange={(value) => set('capacity', value)}
                  options={options.capacities}
                  placeholder="e.g. 2.5 Ton"
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label htmlFor="eq-serial" className={labelClass}>
                Serial number
              </label>
              <input
                id="eq-serial"
                type="text"
                value={draft.serialNumber ?? ''}
                onChange={(e) => set('serialNumber', e.target.value)}
                placeholder="Plate number, if any"
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
          </div>

          {/*
            Servicing, all three fields together, because they are three views
            of one fact. Typing the register's own wording into the note sets
            the other two — "Serviced 25 Aug 2026" picks Serviced and dates it
            — so a master document can be copied across a line at a time.
          */}
          <div className="rounded-md border border-[#E6E7EB] bg-[#FAFAFA] p-3.5 space-y-3">
            <span className={`${labelClass} mb-0`}>Service record</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="eq-status" className="sr-only">
                  Service status
                </label>
                <select
                  id="eq-status"
                  value={draft.serviceStatus ?? 'inventory'}
                  onChange={(e) => set('serviceStatus', e.target.value as ServiceStatus)}
                  className={inputClass}
                >
                  {SERVICE_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {SERVICE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="eq-last-serviced" className="sr-only">
                  Last serviced on
                </label>
                <input
                  id="eq-last-serviced"
                  type="date"
                  value={draft.lastServicedOn ?? ''}
                  onChange={(e) => set('lastServicedOn', e.target.value)}
                  aria-label="Last serviced on"
                  className={inputClass}
                />
              </div>
            </div>

            <input
              id="eq-status-note"
              type="text"
              value={draft.statusNote ?? ''}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="The register's own words — “SERVICE DUE”, “Serviced 25 Aug 2026”, “Unit 1 of 2”"
              aria-label="Status note, as the register words it"
              className={inputClass}
            />

            <p className="text-[11px] text-[#6B6F76]">
              The note is kept exactly as written. Type a date into it and the status
              and service date above follow — both stay yours to correct.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div>
              <label htmlFor="eq-quantity" className={labelClass}>
                Units this covers
              </label>
              <input
                id="eq-quantity"
                type="number"
                min={1}
                step={1}
                value={draft.quantity ?? 1}
                onChange={(e) => set('quantity', Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          <p className="-mt-2 text-[11px] text-[#6B6F76]">
            A plan counts from the last service where there is one, and from the install
            date otherwise. With neither, it counts from today.
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
            <p role="alert" className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
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

/**
 * The columns a pasted line is read in, in order.
 *
 * Asset number leads, because it leads on the master documents and because it
 * is what the import matches on — a corrected register pasted again lands on
 * the same records rather than doubling them.
 *
 * Every column after Branch is optional: a line stops being read at the last
 * comma the operator typed, so pasting just the number, the branch and the
 * type works and fills the rest in as blank. That matters more than it reads.
 * It is what lets somebody paste four columns off a phone without first
 * building an eight-column spreadsheet.
 */
const COLUMNS =
  'Asset no, Branch, Type, Capacity, Make, Location, Status, Serial, Model, Installed (YYYY-MM-DD)';

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

/**
 * Matches a written category to one on the list, by its words or by its id.
 *
 * A blank column and a word nobody recognises both land on the fallback
 * category, but they are not the same mistake and the import reports which.
 * Filing an unreadable trade silently under "Other" is how forty assets end up
 * in the wrong place without anybody being told.
 */
function readCategory(
  text: string,
  categories: EquipmentCategory[]
): { category: MaintenanceCategory; unrecognised: boolean } {
  const wanted = text.trim().toLowerCase();
  const fallback = defaultCategory(categories);
  if (!wanted) return { category: fallback, unrecognised: false };

  const hit = activeCategories(categories).find(
    (c) => c.id.toLowerCase() === wanted || c.label.toLowerCase() === wanted
  );
  return hit
    ? { category: hit.id, unrecognised: false }
    : { category: fallback, unrecognised: true };
}

const ImportDialog: React.FC<{
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ onClose, onDone }) => {
  const categories = useCategories();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);
  /** Lines whose trade was not on the list, reported rather than swallowed. */
  const [unrecognised, setUnrecognised] = useState<number[]>([]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSkipped([]);
    setUnrecognised([]);

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      // A header row pasted along with the data is dropped rather than imported
      .filter((l, i) => !(i === 0 && /^(asset\s*no|branch)\b/i.test(l)));

    if (lines.length === 0) {
      setError('Paste at least one line');
      return;
    }

    const unknownAt: number[] = [];
    const rows: EquipmentDraft[] = lines.map((line, index) => {
      const [assetNo, branchName, assetType, capacity, make, location, status, serialNumber, model, installedOn] =
        parseRow(line);

      /*
       * The trade is read from the asset number first — `RG-CHL-094` is a
       * chiller and says so — and only then from a category column, if the
       * operator bothered to include one. That is the whole reason the
       * documents can be pasted as they stand: they have no category column
       * at all, because the number already carries it.
       */
      const segment = (assetNo ?? '').split('-')[1]?.toUpperCase() ?? '';
      const fromNumber = SEGMENT_CATEGORY[segment];
      const fromType = categoryForType(assetType ?? '');
      const trade = fromNumber
        ? { category: fromNumber, unrecognised: false }
        : fromType
          ? { category: fromType, unrecognised: false }
          : readCategory('', categories);
      if (trade.unrecognised) unknownAt.push(index + 1);

      return {
        branchName: branchName ?? '',
        // The name defaults to the type, which is what the documents record
        name: assetType ?? '',
        category: trade.category,
        assetNo,
        assetType,
        capacity,
        /*
         * The status column is the register's own wording, so it is kept as
         * written and read for what it means at the same time — a column of
         * "SERVICE DUE" and "Serviced 25 Aug 2026" arrives as a status, a
         * date and the original words, from one paste.
         */
        statusNote: status,
        serviceStatus: readServiceStatus(status ?? '') ?? 'inventory',
        lastServicedOn: readServiceDate(status ?? ''),
        serialNumber,
        make,
        model,
        location,
        installedOn,
      };
    });
    setUnrecognised(unknownAt);

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
    if (unknownAt.length > 0) {
      // Imported, but under the wrong trade until somebody says otherwise —
      // which is worth stopping for rather than mentioning in a toast
      setError(
        `${unknownAt.length} line${unknownAt.length === 1 ? '' : 's'} named a category that is not on the list, and went to “${categoryLabel(
          defaultCategory(categories),
          categories
        )}”`
      );
      return;
    }
    onDone(`${added} added, ${updated} updated`);
  };

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="equipmentscreen-dialog-2-title"
      className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-2xl my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 id="equipmentscreen-dialog-2-title" className="text-base font-bold text-[#17181D]">Import an appliance list</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Paste it straight out of the master register — one asset per line.
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="bg-[#FAFAFA] border border-[#E6E7EB] rounded-md px-3.5 py-3">
            <p className={labelClass}>Columns, in this order</p>
            <code className="text-[11px] text-[#17181D] break-words">{COLUMNS}</code>
            <p className="text-[11px] text-[#6B6F76] mt-2">
              Only Branch and Type are required, and a line can stop at any comma. The
              trade is read from the asset number —{' '}
              <span className="font-mono">ACU</span>, <span className="font-mono">CHL</span>{' '}
              and <span className="font-mono">ELC</span> — so the master registers paste in
              as they stand. The Status column is kept in the register&rsquo;s own wording and
              read at the same time: “Serviced 25 Aug 2026” sets the status and the date.
            </p>
            <p className="text-[11px] text-[#6B6F76] mt-1.5">
              An asset already on record is corrected rather than added twice, matched on
              its asset number, so a corrected register can be pasted again.
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
                'RG-ACU-008, Royal Gujarat, Split AC, 2.5 Ton, Mitsubishi, Juice & Sweets, SERVICE DUE\n' +
                'RG-CHL-021, Royal Gujarat, Walk-In Chiller, , , Kitchen, Corrected / Final\n' +
                'NHB-ELC-004, Nana House - Shabiya 11, Drinking Water Cooler / Filter, , Milano, Small Kitchen beside Hall'
              }
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          </div>

          {error && (
            <div role="alert" className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
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
              {unrecognised.length > 0 && (
                <p className="mt-1.5 font-normal">
                  Lines {unrecognised.slice(0, 12).join(', ')}
                  {unrecognised.length > 12 ? '…' : ''} — add the category and paste the
                  list again to file them properly.
                </p>
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

// ---------------------------------------------------------------------------
// The trades, and what each of them is serviced on
// ---------------------------------------------------------------------------

/**
 * The category list, with each one's general-maintenance cadence beside it.
 *
 * Creating a category and setting its general maintenance is one gesture,
 * because there is no such thing here as a category without one: the cadence is
 * why a category exists as far as the schedule is concerned, and a list of
 * names that service nothing would be a taxonomy rather than a plan.
 *
 * The cadence writes through to the category's own `MaintenancePlan`, the same
 * record the Schedule tab edits. One record, two doors into it — an operator
 * who sets sixty days here and reads "every 60 days" there is looking at the
 * same fact rather than two that happen to agree.
 */
const CategoryDialog: React.FC<{
  inUse: Set<string>;
  onClose: () => void;
}> = ({ inUse, onClose }) => {
  const showToast = useToast();
  const confirm = useConfirm();
  const categories = useCategories();
  const [allPlans, setAllPlans] = useState<MaintenancePlan[]>(() => getPlans());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setAllPlans(getPlans());
    refresh();
    return subscribeToPlans(refresh);
  }, []);

  /** A category's general plan, on or off — the row has to show either. */
  const generalPlan = (categoryId: string): MaintenancePlan | null =>
    allPlans.find((p) => p.id === generalPlanIdFor(categoryId)) ?? null;

  const setCadence = (categoryId: string, interval: Interval) => {
    const plan = generalPlan(categoryId);
    if (!plan) return;
    const problem = intervalProblem(interval);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const result = updatePlan(plan.id, {
      category: plan.category,
      task: plan.task,
      interval,
      priority: plan.priority,
      instructions: plan.instructions,
    });
    if (!result.ok) setError(result.error ?? 'Could not save that');
  };

  const remove = async (id: string, label: string) => {
    const referenced = inUse.has(id);
    const ok = await confirm({
      title: referenced ? `Withdraw “${label}”?` : `Delete “${label}”?`,
      body: referenced
        ? 'Assets and jobs already name it, so it is archived rather than deleted and they stay readable.'
        : 'Nothing is filed under it, so this cannot be undone.',
      confirmLabel: referenced ? 'Withdraw' : 'Delete',
    });
    if (!ok) return;
    const result = removeCategory(id, referenced);
    if (!result.ok) {
      setError(result.error ?? 'Could not withdraw that category');
      return;
    }
    setError(null);
    showToast(result.archived ? `${label} archived` : `${label} deleted`);
  };

  const live = categories.filter((c) => c.active);
  const archived = categories.filter((c) => !c.active);

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="equipmentscreen-dialog-3-title"
      className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-2xl my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 id="equipmentscreen-dialog-3-title" className="text-base font-bold text-[#17181D]">
            Categories and their general maintenance
          </h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Every asset filed under a category follows its cadence, unless its own record
            says otherwise.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="border border-[#E6E7EB] rounded-md divide-y divide-[#EFEFF2] max-h-[24rem] overflow-y-auto">
            {live.map((category) => {
              const plan = generalPlan(category.id);
              const interval = plan ? intervalOf(plan) : null;
              return (
                <div
                  key={category.id}
                  className={`px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${
                    plan && !plan.active ? 'bg-[#FAFAFA]' : ''
                  }`}
                >
                  <div className="flex-1 min-w-[10rem]">
                    <input
                      type="text"
                      defaultValue={category.label}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (!next || next === category.label) {
                          e.target.value = category.label;
                          return;
                        }
                        const result = renameCategory(category.id, next);
                        if (!result.ok) {
                          e.target.value = category.label;
                          setError(result.error ?? 'Could not rename that');
                        } else setError(null);
                      }}
                      disabled={isSystemCategory(category.id)}
                      aria-label={`Name of ${category.label}`}
                      className="w-full px-2 py-1.5 bg-white border border-transparent hover:border-[#E6E7EB] focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D] rounded-md text-sm font-semibold text-[#17181D] focus:outline-none transition-colors disabled:text-[#6B6F76] disabled:bg-transparent"
                    />
                    {/*
                      Said out loud, because an operator who renames a category
                      and then sees the old word inside a job's id will
                      otherwise assume the rename half-failed.
                    */}
                    <p className="px-2 text-[11px] text-[#6B6F76] mt-0.5">
                      Filed as {category.id} — work already raised keeps this, so it never
                      changes.
                    </p>
                  </div>

                  {interval && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-[#6B6F76]">every</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={interval.every}
                        onChange={(e) =>
                          setCadence(category.id, { ...interval, every: Number(e.target.value) })
                        }
                        aria-label={`How often ${category.label} is serviced`}
                        className="w-16 px-2 py-1.5 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]"
                      />
                      <select
                        value={interval.unit}
                        onChange={(e) =>
                          setCadence(category.id, {
                            ...interval,
                            unit: e.target.value as IntervalUnit,
                          })
                        }
                        aria-label={`Days or months for ${category.label}`}
                        className="px-2 py-1.5 bg-white border border-[#E6E7EB] rounded-md text-xs text-[#17181D] focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
                      >
                        <option value="days">days</option>
                        <option value="months">months</option>
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {plan && (
                      <button
                        type="button"
                        onClick={() => {
                          setPlanActive(plan.id, !plan.active);
                          showToast(
                            plan.active
                              ? `${category.label} no longer raises general maintenance`
                              : `${category.label} back on general maintenance`
                          );
                        }}
                        title={
                          plan.active
                            ? 'Stop raising general maintenance for this category'
                            : 'Start raising it again'
                        }
                        aria-label={`Turn general maintenance ${
                          plan.active ? 'off' : 'on'
                        } for ${category.label}`}
                        className={`p-2 rounded-md transition-colors cursor-pointer ${
                          plan.active
                            ? 'text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F1F1F4]'
                            : 'text-[#157F4B] hover:bg-[#E6F4EC]'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isSystemCategory(category.id) && (
                      <button
                        type="button"
                        onClick={() => remove(category.id, category.label)}
                        aria-label={`Withdraw ${category.label}`}
                        className="p-2 text-[#C8202D] hover:bg-[#FDECEE] rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {archived.length > 0 && (
              <div className="px-4 py-3 bg-[#FAFAFA]">
                <p className={labelClass}>Withdrawn</p>
                <div className="flex flex-wrap gap-1.5">
                  {archived.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setCategoryActive(category.id, true);
                        showToast(`${category.label} back on the list`);
                      }}
                      title="Put this category back on the list"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[#E6E7EB] rounded-md text-[11px] font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
              {error}
            </p>
          )}

          <div className="pt-3 border-t border-[#E6E7EB] flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Where an asset stands, as a coloured word.
 *
 * Red for what does not work, amber for what is owed, grey for the rest.
 * 'inventory' gets no pill at all: it is what two thirds of the register is,
 * it claims nothing, and a badge on 209 of 302 rows would be wallpaper — the
 * eye stops reading a mark it sees everywhere, which would cost the two
 * faulty units their visibility.
 */
const ServiceStatusPill: React.FC<{ status: ServiceStatus }> = ({ status }) => {
  if (status === 'inventory') return null;
  const tone: Record<Exclude<ServiceStatus, 'inventory'>, string> = {
    faulty: 'bg-[#FDECEE] text-[#C8202D]',
    due: 'bg-[#FDF6E7] text-[#B4740A]',
    pending: 'bg-[#FDF6E7] text-[#B4740A]',
    unknown: 'bg-[#F1F1F4] text-[#6B6F76]',
    serviced: 'bg-[#EAF6EE] text-[#1E7F45]',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tone[status]}`}
    >
      {SERVICE_STATUS_LABELS[status]}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Recording that an asset has been looked after
// ---------------------------------------------------------------------------

/**
 * Marking general maintenance done, on the day it was actually done.
 *
 * The date is the point of the dialog rather than a detail on it: work carried
 * out on Tuesday and recorded on Friday has to reset the clock from Tuesday, or
 * every asset drifts a few days later with each service until a six-month
 * cadence has quietly become a seven-month one.
 */
const MarkGeneralDoneDialog: React.FC<{
  item: Equipment;
  state: GeneralMaintenanceState | null;
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ item, state, onClose, onDone }) => {
  const today = toIsoDay(new Date());
  const [on, setOn] = useState(today);
  const [attendedBy, setAttendedBy] = useState(() => getLastPerson());
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState<string | null>(null);

  const current = state
    ? overrideOf(item, generalPlanIdFor(item.category)) ?? intervalOf(state.plan)
    : null;

  /*
   * Changing the interval is offered here rather than required. Recording that
   * a service happened and deciding how often it should happen are two
   * different thoughts, and the second one is rare — the system carries the
   * previously chosen interval forward on its own.
   */
  const [cadence, setCadence] = useState<Interval>(
    () => current ?? { every: 6, unit: 'months' }
  );
  /** Only a real change writes an override — otherwise it keeps inheriting. */
  const cadenceChanged =
    !!current && (cadence.every !== current.every || cadence.unit !== current.unit);

  /** What the operator is committing to, said before they commit to it. */
  const nextDueOn = cadence ? addInterval(on, cadence) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const money = cost.trim() === '' ? null : Number(cost);
    if (money !== null && (Number.isNaN(money) || money < 0)) {
      setError('That cost is not a number');
      return;
    }

    const result = recordGeneralMaintenance(item, {
      on,
      attendedBy,
      note,
      cost: money,
      newInterval: cadenceChanged ? cadence : undefined,
    });
    if (!result.ok) {
      setError(result.error ?? 'Could not record that');
      return;
    }
    if (attendedBy.trim()) rememberPerson(attendedBy.trim());
    /*
     * A refused interval is reported where the form is rather than in a toast
     * that vanishes: the work IS recorded, so closing the dialog would leave
     * somebody believing a cadence they set is in force when it is not.
     */
    if (result.intervalError) {
      setError(result.intervalError);
      return;
    }
    onDone(
      result.closedOpenJob
        ? `Recorded — the job on the board is closed, next due ${result.nextDueOn ?? '—'}`
        : `Recorded — next due ${result.nextDueOn ?? '—'}`
    );
  };

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="equipmentscreen-dialog-4-title"
      className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-md my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 id="equipmentscreen-dialog-4-title" className="text-base font-bold text-[#17181D]">General maintenance done</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            {item.name} · {item.branchName}
            {item.location ? ` · ${item.location}` : ''}
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label htmlFor="gm-date" className={labelClass}>
              The day it was done
            </label>
            <input
              id="gm-date"
              type="date"
              value={on}
              max={today}
              onChange={(e) => setOn(e.target.value)}
              autoFocus
              className={inputClass}
            />
            {nextDueOn && cadence && (
              <p className="mt-1.5 text-[11px] text-[#6B6F76]">
                Next general maintenance falls due <strong>{nextDueOn}</strong> —{' '}
                {intervalText(cadence)}, counted from the day the work was done rather
                than from today.
              </p>
            )}
          </div>

          {current && state && (
            <div className="rounded-md border border-[#E6E7EB] bg-[#FAFAFA] p-3.5 space-y-2.5">
              <span className={labelClass}>How often from now on</span>
              <IntervalPicker
                id="gm-cadence"
                value={cadence}
                onChange={setCadence}
                label={`general maintenance for ${item.name}`}
              />
              <p className="text-[11px] text-[#6B6F76]">
                {cadenceChanged
                  ? `Kept for ${item.name} alone. The rest of ${categoryLabel(item.category)} stays on ${intervalText(intervalOf(state.plan))}.`
                  : 'Already what this one is on — leave it and the next date is worked out from it.'}
              </p>
            </div>
          )}

          {state?.openJob && (
            <p className="text-[11px] text-[#B4740A] bg-[#FDF6E7] border border-[#B4740A]/30 rounded-md px-3 py-2.5">
              There is a job for this on the board. Recording the work here closes it, so
              nobody is sent out to do it again.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="gm-by" className={labelClass}>
                Who did it
              </label>
              <input
                id="gm-by"
                type="text"
                value={attendedBy}
                onChange={(e) => setAttendedBy(e.target.value)}
                placeholder="Engineer, contractor or staff"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="gm-cost" className={labelClass}>
                Cost
              </label>
              <input
                id="gm-cost"
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Leave blank if none"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="gm-note" className={labelClass}>
              What was done
            </label>
            <textarea
              id="gm-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Cleaned, checked, tested. Anything worth knowing next time."
              className={`${inputClass} resize-y`}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
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
              id="gm-save-btn"
              type="submit"
              className="px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Record it
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// One appliance on the register
// ---------------------------------------------------------------------------

/**
 * A row: what it is called, what is written on its plate, where it stands, and
 * when it is next due anything.
 *
 * Its own component because it is rendered from two places — inside a category,
 * and in a flat list of search results that spans all of them — and a row that
 * read differently depending on which list it was in would be two answers to
 * one question.
 */
const AssetRow: React.FC<{
  item: Equipment;
  due: { dueOn: string; task: string; overdue: boolean } | undefined;
  gm: GeneralMaintenanceState | undefined;
  ownInterval: Interval | null | undefined;
  categoryLabelText: string;
  /** Off inside a category's own list, where every row carries the same one. */
  showCategory: boolean;
  mayManage: boolean;
  onHistory: () => void;
  onRecord: () => void;
  onEdit: () => void;
  onWithdraw: () => void;
  onRestore: () => void;
}> = ({
  item,
  due,
  gm,
  ownInterval,
  categoryLabelText,
  showCategory,
  mayManage,
  onHistory,
  onRecord,
  onEdit,
  onWithdraw,
  onRestore,
}) => (
  <div
      className="px-5 py-4 flex flex-wrap items-start gap-x-5 gap-y-3 hover:bg-[#FAFAFA] transition-colors"
    >
      <div className="flex-1 min-w-[14rem]">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            The number leads, in a monospaced face so a column of them lines up
            and a transposed digit is visible. On this estate the name alone is
            often not an identification at all — eleven rows here say "Fan".
          */}
          {item.assetNo && (
            <span className="font-mono text-[11px] font-bold tracking-wide text-[#C8202D] bg-[#FDECEE] px-1.5 py-0.5 rounded">
              {item.assetNo}
            </span>
          )}
          <span className="text-sm font-bold text-[#17181D]">{item.name}</span>
          {item.capacity && (
            <span className="text-[11px] font-semibold text-[#6B6F76]">{item.capacity}</span>
          )}
          <ServiceStatusPill status={item.serviceStatus ?? 'inventory'} />
          {/* Redundant inside a category's own list, where every row is that category */}
              {showCategory && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F1F1F4] text-[#6B6F76]">
                  {categoryLabelText}
                </span>
              )}
          {/*
            An asset that departs from what its category says is
            worth seeing without opening it — a fridge quietly
            exempted two years ago is how something stops being
            serviced and nobody notices.
          */}
          {ownInterval === null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F1F1F4] text-[#6B6F76]">
              Not on general maintenance
            </span>
          )}
          {ownInterval && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDECEE] text-[#C8202D]">
              {intervalText(ownInterval)}
            </span>
          )}
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
          {/*
            Shown only when it says something the pill does not. "SERVICE DUE"
            beside a pill reading Service due is noise; "Unit 1 of 2" and
            "Fresh lassi / shakes" are the only thing distinguishing two
            otherwise identical rows.
          */}
          {item.statusNote &&
            item.statusNote.toLowerCase() !==
              SERVICE_STATUS_LABELS[item.serviceStatus ?? 'inventory'].toLowerCase() && (
              <span className="italic">{item.statusNote}</span>
            )}
        </p>
        <div className="mt-1 space-y-0.5">
          {gm && (
            <p
              className={`text-[11px] flex items-center gap-1.5 font-semibold ${
                gm.due ? 'text-[#C8202D]' : 'text-[#6B6F76]'
              }`}
            >
              <CalendarClock className="w-3 h-3 shrink-0" />
              General maintenance{' '}
              {gm.daysOverdue === 0
                ? 'due today'
                : `${gm.due ? 'was due' : 'due'} ${gm.dueOn}`}
              <span className="font-normal text-[#6B6F76]">
                · {intervalText(ownInterval ?? intervalOf(gm.plan))}
              </span>
            </p>
          )}
          {due && (
            <p
              className={`text-[11px] flex items-center gap-1.5 font-semibold ${
                due.overdue ? 'text-[#C8202D]' : 'text-[#6B6F76]'
              }`}
            >
              <CalendarClock className="w-3 h-3 shrink-0" />
              {due.task} {due.overdue ? 'was due' : 'due'} {due.dueOn}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/*
          Offered whenever the asset is on a general-maintenance
          cadence at all, not only once it has fallen due. The whole
          case for it is the work done in between: somebody servicing
          the fridge in week three because they were there anyway has
          nothing on the board telling them to, and no way to say so.
          Red once it is due, so a row that needs attention reads as
          one from across the screen.
        */}
        {gm && item.active && (
          <button
            type="button"
            onClick={() => onRecord()}
            title={
              gm.openJob
                ? 'Records the work and closes the job standing on the board'
                : `Next due ${gm.dueOn}`
            }
            className={
              gm.due
                ? 'inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer'
                : 'inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer'
            }
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>General maintenance done</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onHistory()}
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
                onClick={() => onEdit()}
                aria-label={`Edit ${item.name}`}
                className="p-2 text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F1F1F4] rounded-md transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onWithdraw()}
                aria-label={`Withdraw ${item.name}`}
                className="p-2 text-[#C8202D] hover:bg-[#FDECEE] rounded-md transition-colors cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onRestore()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#157F4B] hover:bg-[#E6F4EC] rounded-md transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
          ))}
      </div>
    </div>
);

// ---------------------------------------------------------------------------
// A new trade
// ---------------------------------------------------------------------------

/**
 * Adding a category, and setting what its appliances are serviced on.
 *
 * One gesture, because there is no such thing here as a category without a
 * cadence: a category is the thing that decides when its appliances come due,
 * and one that decided nothing would be a label rather than a rule.
 *
 * Its own dialog rather than a row inside the category manager, because this is
 * the register's primary action — the screen lists categories, so the red
 * button at the top of it adds one — and the manager is for changing the ones
 * that already exist.
 */
const AddCategoryDialog: React.FC<{
  onClose: () => void;
  onAdded: (label: string, id: string) => void;
}> = ({ onClose, onAdded }) => {
  const [label, setLabel] = useState('');
  const [interval, setInterval] = useState<Interval>({ every: 6, unit: 'months' });
  const [error, setError] = useState<string | null>(null);

  const choices = interval.unit === 'days' ? DAY_INTERVAL_CHOICES : INTERVAL_CHOICES;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = intervalProblem(interval);
    if (problem) {
      setError(problem);
      return;
    }

    const now = new Date().toISOString();
    const result = addCategory(label, now);
    if (!result.ok || !result.category) {
      setError(result.error ?? 'Could not add that category');
      return;
    }
    /*
     * The plan is written here rather than left to the next app load, so the
     * cadence just typed is the one the category starts with — the bootstrap
     * that runs on mount only knows a default.
     */
    ensureGeneralPlans([result.category], now, interval);
    onAdded(result.category.label, result.category.id);
  };

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="equipmentscreen-dialog-5-title"
      className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-md my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 id="equipmentscreen-dialog-5-title" className="text-base font-bold text-[#17181D]">Add a category</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            A trade to file appliances under, and what they are serviced on.
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label htmlFor="new-category-name" className={labelClass}>
              What they are
            </label>
            <input
              id="new-category-name"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              placeholder="e.g. Air conditioners, Fridges, Fire extinguishers"
              className={inputClass}
            />
          </div>

          <div>
            <span className={labelClass}>General maintenance</span>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-3 items-center">
              <span className="text-xs text-[#6B6F76]">Every</span>
              <input
                type="number"
                min={1}
                step={1}
                list="new-category-choices"
                value={interval.every}
                onChange={(e) => setInterval({ ...interval, every: Number(e.target.value) })}
                aria-label="How often"
                className={inputClass}
              />
              <datalist id="new-category-choices">
                {choices.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <select
                value={interval.unit}
                onChange={(e) =>
                  setInterval({ ...interval, unit: e.target.value as IntervalUnit })
                }
                aria-label="Days or months"
                className={inputClass}
              >
                <option value="days">days</option>
                <option value="months">months</option>
              </select>
            </div>
            <p className="mt-1.5 text-[11px] text-[#6B6F76]">
              Every appliance filed under it falls due {intervalText(interval)}, counted
              from the last time the work was recorded as done. One that differs can keep
              its own interval on its own record.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
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
              id="save-category-btn"
              type="submit"
              className="px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Add category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

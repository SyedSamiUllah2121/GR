'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  Layers,
  MapPin,
  Package,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Snowflake,
  Tag,
  Trash2,
  Upload,
  Wind,
  Wrench,
  X,
  Zap,
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
} from '../services/maintenanceSchedule';
import {
  GeneralMaintenanceState,
  generalMaintenanceState,
  recordGeneralMaintenance,
} from '../services/generalMaintenance';
import {
  canManageEquipment,
  fixedBranchFor,
  soleMaintenanceBranch,
  visibleEquipment,
} from '../services/permissions';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useBranches } from '../hooks/useBranches';
import { activeBranches } from '../services/branchStore';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmProvider';
import { IntervalPicker } from './IntervalPicker';
import { BUTTON, CARD, PageHeader } from './ui';
import { CountUp, EASE_OUT, Reveal, Stagger, StaggerItem, useSeenOnce, t } from './motion';
import { CHART_COLORS } from './charts';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow] disabled:bg-[#F4F5F7] disabled:text-[#6B6F76]';

/** A smaller field, for the numbers and units that sit inline in a sentence. */
const compactFieldClass =
  'h-9 px-2.5 bg-white border border-[#E4E6EB] rounded-lg text-sm text-[#17181D] shadow-xs focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow]';

const labelClass = 'block text-xs font-semibold text-[#17181D] mb-1.5';

/** A tinted panel inside a dialog, for a group of fields that belong together. */
const insetClass = 'rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-4';

/** The red line a refusal is printed on, beside the button that was refused. */
const alertClass =
  'flex items-start gap-2 text-xs font-semibold text-[#A81823] bg-[#FDECEE] border border-[#C8202D]/20 rounded-xl px-3 py-2.5';

/**
 * A dialog's footer, pulled out to the panel's edges from inside a padded form
 * so the actions sit on their own tinted strip.
 */
const dialogFooterClass =
  '-mx-6 -mb-6 px-6 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC] flex flex-wrap items-center justify-end gap-2';

/** A square icon button for the quiet actions at the end of a row. */
const iconButtonClass =
  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer';

/**
 * The frame every dialog on this screen shares: a scrim, and a panel with a
 * header (a mark, the title, a line under it) and a close button.
 *
 * The scrim only fades; the panel rises and scales. Nothing above a
 * `position: fixed` element may carry a transform, or it stops being fixed to
 * the window — so the movement is kept to the panel, inside the overlay.
 *
 * The close button is last in the panel, and drawn at its top corner: the
 * dialog opens with focus on its first field, and a close button placed first
 * in the markup would take that instead.
 */
const DialogFrame: React.FC<{
  dialogRef: React.Ref<HTMLDivElement>;
  titleId: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  width: 'max-w-md' | 'max-w-lg' | 'max-w-2xl';
  onClose: () => void;
  children: React.ReactNode;
}> = ({ dialogRef, titleId, title, subtitle, icon: Icon, width, onClose, children }) => (
  <motion.div
    ref={dialogRef}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    className="fixed inset-0 z-50 bg-[#17181D]/45 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: t(0.2) }}
  >
    <motion.div
      className={`relative bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)] w-full ${width} my-8 overflow-hidden`}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: t(0.3), ease: EASE_OUT }}
    >
      <div className="pl-6 pr-14 py-4 border-b border-[#F0F1F4] flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 id={titleId} className="text-[15px] font-bold text-[#17181D]">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-[#6B6F76] mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {children}

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

/**
 * A mark for a category, guessed from its name. Only there to make a grid of
 * cards scannable — anything unrecognised gets the neutral box rather than a
 * wrong picture.
 */
const CATEGORY_ICONS: [RegExp, React.ComponentType<{ className?: string }>][] = [
  [/\bac\b|air|ventilat|hvac|fan/i, Wind],
  [/refrig|chill|fridge|freez|cold/i, Snowflake],
  [/electric|power|light/i, Zap],
];

function categoryIcon(label: string): React.ComponentType<{ className?: string }> {
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? Package;
}

/**
 * How one category's appliances stand on their general maintenance, as one
 * thin bar: due now, on schedule, and not on any schedule at all.
 *
 * A bar rather than three numbers because the question a card is asked is
 * "how much of this is behind", which is a proportion. The counts are said in
 * words underneath, since the red and green cannot be told apart by everyone.
 */
const ServiceMeter: React.FC<{ due: number; onSchedule: number; unscheduled: number }> = ({
  due,
  onSchedule,
  unscheduled,
}) => {
  const [ref, seen] = useSeenOnce<HTMLDivElement>();
  const reduced = useReducedMotion();
  const parts = [
    { key: 'due', label: 'due now', value: due, color: CHART_COLORS.status.notStarted },
    { key: 'ok', label: 'on schedule', value: onSchedule, color: CHART_COLORS.status.completed },
    { key: 'none', label: 'not scheduled', value: unscheduled, color: '#D5D8DE' },
  ];
  const total = due + onSchedule + unscheduled;

  return (
    <div ref={ref}>
      <div
        className="flex w-full h-1.5 gap-[2px] overflow-hidden rounded-full bg-[#F1F2F5]"
        role="img"
        aria-label={parts.map((part) => `${part.value} ${part.label}`).join(', ')}
      >
        {total > 0 &&
          parts
            .filter((part) => part.value > 0)
            .map((part, i) => (
              <motion.span
                key={part.key}
                className="h-full"
                style={{ background: part.color, flexBasis: 0 }}
                initial={{ flexGrow: reduced ? part.value : 0 }}
                animate={{ flexGrow: seen || reduced ? part.value : 0 }}
                transition={{ duration: t(0.8), ease: EASE_OUT, delay: t(reduced ? 0 : 0.15 + 0.08 * i) }}
              />
            ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B6F76]">
        {parts
          .filter((part) => part.value > 0 || part.key === 'due')
          .map((part) => (
            <span key={part.key} className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: part.color }} />
              <span
                className={`tabular-nums ${
                  part.key === 'due' && part.value > 0 ? 'font-bold text-[#A81823]' : 'font-semibold text-[#17181D]'
                }`}
              >
                {part.value}
              </span>
              {part.label}
            </span>
          ))}
      </p>
    </div>
  );
};

/** One figure for the strip across the top of the register. */
const RegisterStat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  caption: string;
  tone: 'neutral' | 'bad' | 'warn' | 'good';
}> = ({ icon: Icon, label, value, caption, tone }) => {
  const tile = {
    neutral: 'bg-[#F4F5F7] text-[#17181D]',
    bad: 'bg-[#FDECEE] text-[#C8202D]',
    warn: 'bg-[#FDF3E2] text-[#B4740A]',
    good: 'bg-[#E6F4EC] text-[#157F4B]',
  }[tone];
  return (
    <div className={`${CARD} h-full p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-[#6B6F76] truncate">{label}</p>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tile}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <p className="mt-2 text-[28px] leading-none font-bold tracking-tight text-[#17181D]">
        <CountUp value={value} />
      </p>
      <p className="mt-2 text-[11px] text-[#9CA1A9] truncate">{caption}</p>
    </div>
  );
};

/** An empty panel: a mark, a line in bold, and what to do about it. */
const EmptyPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className={`${CARD} px-6 py-14 text-center`}>
    <span className="mx-auto w-12 h-12 rounded-2xl bg-[#F4F5F7] text-[#9CA1A9] flex items-center justify-center">
      <Wrench className="w-6 h-6" />
    </span>
    <p className="mt-4 text-sm font-bold text-[#17181D]">{title}</p>
    <p className="text-xs text-[#6B6F76] mt-1.5 max-w-sm mx-auto leading-relaxed">{children}</p>
  </div>
);

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
  // Named in the heading, so a register covering one branch never reads as the
  // estate. Null where it genuinely covers more than one.
  const scopedTo = useMemo(() => soleMaintenanceBranch(user), [user]);

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
      showToast(result.error ?? 'Could not withdraw that asset', 'error');
      return;
    }
    showToast(result.archived ? `${item.name} archived` : `${item.name} deleted`);
  };

  /**
   * Sets what a whole category is serviced on, from the top of its own list.
   *
   * The same write the category manager makes, and deliberately the same one:
   * two ways to reach a decision is fine, two places that each keep their own
   * version of it is not. Nothing is scheduled here — the sweep reads the plan
   * and works the next date out from it, so changing the number is the whole
   * of the change.
   */
  const saveCadence = (category: MaintenanceCategory, interval: Interval) => {
    const id = generalPlanIdFor(category);
    const plan = allPlans.find((p) => p.id === id);
    if (!plan) {
      showToast('This category has no general maintenance plan to change', 'error');
      return;
    }
    const result = updatePlan(id, {
      category: plan.category,
      task: plan.task,
      interval,
      priority: plan.priority,
      instructions: plan.instructions,
    });
    if (result.ok) showToast(`Serviced ${intervalText(interval)} from now on`);
    else showToast(result.error ?? 'Could not save that', 'error');
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
        const result = restoreEquipment(item.id);
        if (result.ok) showToast(`${item.name} back in service`);
        else showToast(result.error ?? 'Could not bring that asset back', 'error');
      }}
    />
  );

  const inService = mine.filter((e) => e.active).length;
  /*
   * The strip across the top, counted over what the filters leave — so picking
   * a branch turns it into that branch's figures rather than leaving the
   * estate's numbers sitting over one branch's cards.
   */
  const dueNow = visible.filter((item) => general.get(item.id)?.due).length;
  const notWorking = visible.filter((item) => item.serviceStatus === 'faulty').length;

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
      {/*
        Inside a category the heading is that category, with "Appliances"
        above it as the way back. A screen showing one trade's appliances
        under the word "Appliances" says nothing about where you are — and
        where you are is the whole of what a heading is for.
      */}
      <Reveal>
        <PageHeader
          eyebrow={openGroup && !searching ? 'Appliances' : 'Maintenance'}
          title={openGroup && !searching ? openGroup.label : 'Appliances'}
          subtitle={
            <>
              {scopedTo && <span className="font-semibold text-[#17181D]">{scopedTo} • </span>}
              {openGroup && !searching ? (
                <>
                  {openGroup.items.length} appliance
                  {openGroup.items.length === 1 ? '' : 's'} in this category
                </>
              ) : (
                <>
                  {inService} asset
                  {inService === 1 ? '' : 's'} on record
                </>
              )}
            </>
          }
          actions={
            mayManage ? (
              <>
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
                  className={BUTTON.secondary}
                >
                  <Tag className="w-4 h-4 text-[#6B6F76]" />
                  <span>Category settings</span>
                </button>
                <button
                  id="import-equipment-btn"
                  type="button"
                  onClick={() => setImporting(true)}
                  className={BUTTON.secondary}
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
                  className={BUTTON.primary}
                >
                  <Plus className="w-4 h-4" />
                  <span>{openGroup ? `Add to ${openGroup.label}` : 'Add category'}</span>
                </button>
              </>
            ) : undefined
          }
        />
      </Reveal>

      {/*
        Said in the screen rather than the console. A register that silently
        stays on the previous estate is indistinguishable from an app that
        has not been updated, and the person looking at it has no way to tell
        those apart — so when the shipped register could not be written, the
        screen says so and says what frees the room.
      */}
      {seedProblem && (
        <p role="alert" className={alertClass}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{seedProblem}</span>
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
          className="group inline-flex items-center gap-1.5 -mb-2 h-8 pl-2 pr-3 rounded-lg text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-white hover:shadow-xs transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          <span>All categories</span>
        </button>
      )}

      {/* The register in four figures, on the list of trades only */}
      {!openGroup && !searching && (
        <Stagger className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
          <StaggerItem>
            <RegisterStat
              icon={Layers}
              label={showArchived ? 'Archived' : 'Appliances'}
              value={visible.length}
              caption={showArchived ? 'Withdrawn, kept for their jobs' : 'In service, as filtered'}
              tone="neutral"
            />
          </StaggerItem>
          <StaggerItem>
            <RegisterStat
              icon={CalendarClock}
              label="Maintenance due"
              value={dueNow}
              caption={dueNow === 0 ? 'Nothing overdue' : 'General maintenance owed now'}
              tone={dueNow > 0 ? 'warn' : 'good'}
            />
          </StaggerItem>
          <StaggerItem>
            <RegisterStat
              icon={AlertTriangle}
              label={SERVICE_STATUS_LABELS.faulty}
              value={notWorking}
              caption={notWorking === 0 ? 'Every unit is running' : 'Marked faulty on the register'}
              tone={notWorking > 0 ? 'bad' : 'good'}
            />
          </StaggerItem>
          <StaggerItem>
            <RegisterStat
              icon={ClipboardList}
              label="Categories"
              value={grouped.length}
              caption="Trades appliances are filed under"
              tone="neutral"
            />
          </StaggerItem>
        </Stagger>
      )}

      {/* Which tab, and the search and filters, on one bar */}
      <Reveal delay={0.05}>
        <div className={`${CARD} p-2 flex flex-col md:flex-row md:items-center justify-between gap-2`}>
          <div className="flex p-1 rounded-xl bg-[#F4F5F7] self-start" role="group" aria-label="Which appliances">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              aria-pressed={!showArchived}
              className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !showArchived
                  ? 'bg-white text-[#17181D] shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                  : 'text-[#6B6F76] hover:text-[#17181D]'
              }`}
            >
              In service{' '}
              <span className="tabular-nums">({inService})</span>
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              aria-pressed={showArchived}
              className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                showArchived
                  ? 'bg-white text-[#17181D] shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                  : 'text-[#6B6F76] hover:text-[#17181D]'
              }`}
            >
              Archived <span className="tabular-nums">({archivedCount})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div className="relative basis-full sm:basis-auto sm:flex-none">
              <Search className="w-4 h-4 text-[#9CA1A9] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="equipment-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search asset no, name, make…"
                aria-label="Search appliances"
                className="w-full sm:w-72 h-10 pl-9 pr-8 bg-[#FAFBFC] border border-[#E4E6EB] rounded-xl text-xs text-[#17181D] placeholder:text-[#9CA1A9] focus:bg-white focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow,background-color]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-[#9CA1A9] hover:text-[#17181D] hover:bg-[#F4F5F7] cursor-pointer"
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
                className="flex-1 sm:flex-none min-w-0 h-10 pl-3 pr-8 bg-white border border-[#E4E6EB] rounded-xl text-xs font-semibold text-[#17181D] focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 cursor-pointer"
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
              className="flex-1 sm:flex-none min-w-0 h-10 pl-3 pr-8 bg-white border border-[#E4E6EB] rounded-xl text-xs font-semibold text-[#17181D] focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 cursor-pointer"
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
      </Reveal>

      {/*
        Searching cuts across the categories rather than through them. Somebody
        typing a serial number is looking for one unit and does not know, or
        care, which trade it is filed under — so a search answers with the
        appliances themselves and says which category each is in.
      */}
      {searching ? (
        matches.length === 0 ? (
          <EmptyPanel title="Nothing matches">
            No appliance matches “{query.trim()}” by asset number, name, type,
            capacity, serial, make, model or where it stands.
          </EmptyPanel>
        ) : (
          <div className={`@container ${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[#F0F1F4] flex items-center gap-2 text-xs text-[#6B6F76]">
              <Search className="w-3.5 h-3.5 text-[#9CA1A9]" />
              <span>
                <span className="font-bold text-[#17181D] tabular-nums">{matches.length}</span>{' '}
                appliance{matches.length === 1 ? '' : 's'} match “{query.trim()}”
              </span>
            </div>
            <AssetColumns showCategory />
            <div className="divide-y divide-[#F0F1F4]">
              {matches.map((item) => renderRow(item, true))}
            </div>
          </div>
        )
      ) : grouped.length === 0 ? (
        <EmptyPanel title={showArchived ? 'Nothing archived' : 'No categories yet'}>
          {showArchived
            ? 'Assets withdrawn while jobs still name them appear here.'
            : 'Add a category first — an appliance is filed under the trade that services it.'}
        </EmptyPanel>
      ) : openGroup ? (
        <div className="space-y-4">
          {[openGroup].map((group) => {
            const plan = allPlans.find((p) => p.id === generalPlanIdFor(group.id));
            const cadence = plan ? intervalOf(plan) : null;
            return (
              <Reveal key={group.id} delay={0.08}>
                <section className={`@container ${CARD} overflow-hidden`}>
                  {/*
                    The cadence sits at the top of the list it governs, and is
                    set there. It is the one fact that applies to every row
                    below — what this category IS, as far as the register is
                    concerned, is the thing its appliances are serviced on — so
                    burying it in a settings dialog meant opening one screen to
                    understand another.
                  */}
                  <CategoryCadenceBar
                    label={group.label}
                    count={group.items.length}
                    plan={plan ?? null}
                    cadence={cadence}
                    mayManage={mayManage}
                    onSave={(next) => saveCadence(group.id, next)}
                  />

                  {group.items.length === 0 ? (
                    <p className="px-5 py-10 text-xs text-[#6B6F76] text-center">
                      Nothing filed under this yet.
                    </p>
                  ) : (
                    <>
                      <AssetColumns showCategory={false} />
                      <div className="divide-y divide-[#F0F1F4]">
                        {group.items.map((item) => renderRow(item, false))}
                      </div>
                    </>
                  )}
                </section>
              </Reveal>
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
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {grouped.map((group) => {
            const plan = allPlans.find((p) => p.id === generalPlanIdFor(group.id));
            const cadence = plan ? intervalOf(plan) : null;
            const overdue = group.items.filter((item) => general.get(item.id)?.due).length;
            const scheduled = group.items.filter((item) => general.has(item.id)).length;
            const Icon = categoryIcon(`${group.label} ${group.id}`);
            return (
              <StaggerItem key={group.id}>
                <button
                  type="button"
                  onClick={() => setOpenCategory(group.id)}
                  className={`group ${CARD} w-full h-full text-left p-5 flex flex-col gap-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DADCE2] hover:shadow-[0_12px_24px_-12px_rgba(16,24,40,0.18)]`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0 transition-colors group-hover:bg-[#FDECEE] group-hover:text-[#C8202D]">
                      <Icon className="w-5 h-5" />
                    </span>
                    <h3 className="flex-1 min-w-0 text-[14px] font-bold text-[#17181D] truncate">
                      {group.label}
                    </h3>
                    <ChevronRight className="w-4 h-4 text-[#C9CCD2] shrink-0 transition-all group-hover:text-[#17181D] group-hover:translate-x-0.5" />
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <p className="text-[32px] font-bold tracking-tight text-[#17181D] leading-none">
                      <CountUp value={group.items.length} />
                      <span className="ml-1.5 text-xs font-semibold tracking-normal text-[#6B6F76]">
                        appliance{group.items.length === 1 ? '' : 's'}
                      </span>
                    </p>
                    {cadence ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F5F7] px-2.5 py-1 text-[11px] font-semibold text-[#6B6F76] whitespace-nowrap">
                        <CalendarClock className="w-3 h-3" />
                        {intervalText(cadence)}
                        {plan && !plan.active ? ' — turned off' : ''}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#9CA1A9]">no general maintenance set</span>
                    )}
                  </div>

                  {group.items.length > 0 ? (
                    <div className="pt-4 border-t border-[#F0F1F4]">
                      <ServiceMeter
                        due={overdue}
                        onSchedule={scheduled - overdue}
                        unscheduled={group.items.length - scheduled}
                      />
                    </div>
                  ) : (
                    <p className="pt-4 border-t border-[#F0F1F4] text-[11px] text-[#9CA1A9]">
                      Nothing filed under this yet
                    </p>
                  )}
                </button>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

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
    <DialogFrame
      dialogRef={dialogRef}
      titleId="equipmentscreen-dialog-1-title"
      title={<>{item ? 'Edit asset' : 'Add an asset'}</>}
      subtitle={<>The name, branch and category are what the schedule needs. The rest is what whoever is sent out needs.</>}
      icon={Wrench}
      width="max-w-lg"
      onClose={onClose}
    >
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
              className="shrink-0 px-3.5 rounded-xl border border-[#E4E6EB] bg-white text-[11px] font-bold text-[#17181D] shadow-xs hover:bg-[#FAFBFC] hover:border-[#D0D3D9] transition-colors cursor-pointer"
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
              className={`${inputClass} disabled:cursor-not-allowed`}
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
        <div className={`${insetClass} space-y-3`}>
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

          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#EEF0F3]">
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
                className={`flex-1 min-w-[8rem] h-8 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  mode === key
                    ? 'bg-white text-[#C8202D] shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                    : 'text-[#6B6F76] hover:text-[#17181D]'
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
                className={`w-24 ${compactFieldClass}`}
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
                className={`${compactFieldClass} cursor-pointer`}
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
        <div className={`${insetClass} space-y-3`}>
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
          <p role="alert" className={alertClass}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </p>
        )}

        <div className={dialogFooterClass}>
          <button
            type="button"
            onClick={onClose}
            className={BUTTON.secondary}
          >
            Cancel
          </button>
          <button
            id="eq-save-btn"
            type="submit"
            className={BUTTON.primary}
          >
            Save asset
          </button>
        </div>
      </form>
    </DialogFrame>
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
    <DialogFrame
      dialogRef={dialogRef}
      titleId="equipmentscreen-dialog-2-title"
      title={<>Import an appliance list</>}
      subtitle={<>Paste it straight out of the master register — one asset per line.</>}
      icon={Upload}
      width="max-w-2xl"
      onClose={onClose}
    >
      <form onSubmit={submit} className="p-6 space-y-4">
        <div className={insetClass}>
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
          <div role="alert" className="text-xs font-semibold text-[#A81823] bg-[#FDECEE] border border-[#C8202D]/20 rounded-xl px-3 py-2.5">
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

        <div className={dialogFooterClass}>
          <button
            type="button"
            onClick={onClose}
            className={BUTTON.secondary}
          >
            {skipped.length > 0 ? 'Done' : 'Cancel'}
          </button>
          <button
            id="eq-import-btn"
            type="submit"
            className={BUTTON.primary}
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </button>
        </div>
      </form>
    </DialogFrame>
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
    <DialogFrame
      dialogRef={dialogRef}
      titleId="equipmentscreen-dialog-3-title"
      title={<>Categories and their general maintenance</>}
      subtitle={<>Every asset filed under a category follows its cadence, unless its own record says otherwise.</>}
      icon={Tag}
      width="max-w-2xl"
      onClose={onClose}
    >
      <div className="p-6 space-y-4">
        <div className="border border-[#E8E9EE] rounded-xl divide-y divide-[#F0F1F4] max-h-[24rem] overflow-y-auto">
          {live.map((category) => {
            const plan = generalPlan(category.id);
            const interval = plan ? intervalOf(plan) : null;
            return (
              <div
                key={category.id}
                className={`px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 transition-colors ${
                  plan && !plan.active ? 'bg-[#FAFBFC]' : 'hover:bg-[#FAFBFC]'
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
                    className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-[#E4E6EB] hover:bg-white focus:bg-white focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 rounded-lg text-sm font-semibold text-[#17181D] focus:outline-none transition-[border-color,box-shadow,background-color] disabled:text-[#6B6F76] disabled:bg-transparent"
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
                      className={`w-16 ${compactFieldClass} text-xs`}
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
                      className={`${compactFieldClass} text-xs cursor-pointer`}
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
                        const result = setPlanActive(plan.id, !plan.active);
                        if (!result.ok) {
                          showToast(result.error ?? 'Could not save that', 'error');
                          return;
                        }
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
                      className={`${iconButtonClass} ${
                        plan.active
                          ? 'text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7]'
                          : 'text-[#157F4B] bg-[#E6F4EC] hover:bg-[#D6EEDF]'
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
                      className={`${iconButtonClass} text-[#9CA1A9] hover:text-[#C8202D] hover:bg-[#FDECEE]`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {archived.length > 0 && (
            <div className="px-4 py-3 bg-[#FAFBFC]">
              <p className={labelClass}>Withdrawn</p>
              <div className="flex flex-wrap gap-1.5">
                {archived.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      const result = setCategoryActive(category.id, true);
                      if (result.ok) showToast(`${category.label} back on the list`);
                      else showToast(result.error ?? 'Could not save that', 'error');
                    }}
                    title="Put this category back on the list"
                    className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-[#E4E6EB] rounded-lg text-[11px] font-semibold text-[#6B6F76] shadow-xs hover:text-[#17181D] hover:border-[#D0D3D9] transition-colors cursor-pointer"
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
          <p role="alert" className={alertClass}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </p>
        )}

        <div className={dialogFooterClass}>
          <button
            type="button"
            onClick={onClose}
            className={BUTTON.secondary}
          >
            Done
          </button>
        </div>
      </div>
    </DialogFrame>
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
    due: 'bg-[#FDF3E2] text-[#B4740A]',
    pending: 'bg-[#FDF3E2] text-[#B4740A]',
    unknown: 'bg-[#F4F5F7] text-[#6B6F76]',
    serviced: 'bg-[#E6F4EC] text-[#157F4B]',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tone[status]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
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
    <DialogFrame
      dialogRef={dialogRef}
      titleId="equipmentscreen-dialog-4-title"
      title={<>General maintenance done</>}
      subtitle={<>{item.name} · {item.branchName}{item.location ? ` · ${item.location}` : ''}</>}
      icon={CheckCircle2}
      width="max-w-md"
      onClose={onClose}
    >
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
          <div className={`${insetClass} space-y-2.5`}>
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
          <p className="text-[11px] text-[#8A5A08] bg-[#FDF3E2] border border-[#B4740A]/20 rounded-xl px-3 py-2.5">
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
          <p role="alert" className={alertClass}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </p>
        )}

        <div className={dialogFooterClass}>
          <button
            type="button"
            onClick={onClose}
            className={BUTTON.secondary}
          >
            Cancel
          </button>
          <button
            id="gm-save-btn"
            type="submit"
            className={BUTTON.primary}
          >
            Record it
          </button>
        </div>
      </form>
    </DialogFrame>
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
/**
 * What a category is serviced on, at the top of the list it governs.
 *
 * Editable in place rather than behind a dialog, because the number is the
 * heading: somebody looking at ninety-one appliances and wondering why they
 * are all due in November is asking about this field, and sending them to a
 * settings screen to find it is sending them away from the answer.
 *
 * Held in local state until Save, not written on every keystroke — typing
 * "45" passes through 4, and a register that rescheduled the whole estate to
 * every four days on the way to every forty-five would be obeying a number
 * nobody meant.
 */
const CategoryCadenceBar: React.FC<{
  label: string;
  count: number;
  plan: MaintenancePlan | null;
  cadence: Interval | null;
  mayManage: boolean;
  onSave: (interval: Interval) => void;
}> = ({ label, count, plan, cadence, mayManage, onSave }) => {
  const [draft, setDraft] = useState<Interval | null>(cadence);

  // Follows the stored cadence when it changes underneath — another tab, or
  // the category manager — rather than sitting on a number that is no longer so
  useEffect(() => {
    setDraft(cadence);
  }, [cadence?.every, cadence?.unit]);

  const dirty =
    !!draft && !!cadence && (draft.every !== cadence.every || draft.unit !== cadence.unit);
  const problem = draft ? intervalProblem(draft) : null;
  const Icon = categoryIcon(label);

  return (
    <div className="px-5 sm:px-6 py-4 border-b border-[#F0F1F4] flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-[#17181D] truncate">{label}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#6B6F76] tabular-nums">
              {count} appliance{count === 1 ? '' : 's'}
            </span>
            {plan && !plan.active && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F4F5F7] text-[#6B6F76]">
                Turned off
              </span>
            )}
          </p>
        </div>
      </div>

      {!cadence ? (
        <span className="text-[11px] text-[#6B6F76]">No general maintenance set</span>
      ) : mayManage && draft ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#FAFBFC] border border-[#EEF0F3] pl-3 pr-1.5 py-1.5">
          <label
            htmlFor={`cadence-${plan?.id ?? label}`}
            className="text-[11px] font-semibold text-[#6B6F76] inline-flex items-center gap-1.5"
          >
            <CalendarClock className="w-3.5 h-3.5 text-[#C8202D]" />
            General maintenance every
          </label>
          <input
            id={`cadence-${plan?.id ?? label}`}
            type="number"
            min={1}
            step={1}
            value={draft.every}
            onChange={(e) => setDraft({ ...draft, every: Number(e.target.value) })}
            aria-label={`How often ${label} is serviced`}
            className={`w-16 ${compactFieldClass} font-semibold text-center tabular-nums`}
          />
          <select
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value as IntervalUnit })}
            aria-label={`Days or months for ${label}`}
            className={`${compactFieldClass} font-semibold cursor-pointer`}
          >
            <option value="days">days</option>
            <option value="months">months</option>
          </select>
          {/*
            Only once something has actually changed. A Save sitting there
            permanently reads as work outstanding on a screen where there is
            none, and invites a click that does nothing.
          */}
          {dirty && (
            <button
              type="button"
              onClick={() => draft && !problem && onSave(draft)}
              disabled={!!problem}
              title={problem ?? `Every appliance under ${label} follows this`}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-[#C8202D] hover:bg-[#A81823] disabled:bg-[#C9CCD2] disabled:cursor-not-allowed text-white text-[11px] font-bold rounded-lg shadow-[0_6px_16px_-8px_rgba(200,32,45,0.6)] transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Save
            </button>
          )}
          {problem && (
            <span className="text-[11px] font-semibold text-[#C8202D]">{problem}</span>
          )}
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F5F7] px-3 py-1.5 text-[11px] font-semibold text-[#6B6F76]">
          <CalendarClock className="w-3.5 h-3.5" />
          General maintenance {intervalText(cadence)}
        </span>
      )}
    </div>
  );
};

/**
 * The column grid every appliance row and the heading above them share.
 *
 * One string, declared once, because a heading that drifts from its rows is
 * worse than no heading at all — it puts a label over the wrong column and
 * nothing looks broken. Measured against the panel rather than the window, so
 * the rail opening and closing moves the breakpoint with it.
 *
 * Not one column of it is sized by its content, and that is the whole point.
 * The headings are one grid and the rows are another — they only look like a
 * table — so a single `auto` column resolves to one width over "Actions" and
 * another over a Done button and three icons, which leaves every flexible
 * column beside it a different width in the two grids and slides the labels
 * off their columns. Fixed widths and fractions resolve identically whatever
 * is in them. Every cell below also carries `min-w-0`, so a long branch name
 * cannot push its column wider than its share either.
 */
const ASSET_GRID =
  'grid grid-cols-1 @min-[60rem]:grid-cols-[7.5rem_minmax(9.5rem,1.6fr)_minmax(7rem,1fr)_8.5rem_13rem_7.5rem] gap-x-5 gap-y-2 @min-[60rem]:items-center';

/** The heading strip. Hidden where the rows stack and the labels would lie. */
const AssetColumns: React.FC<{ showCategory: boolean }> = ({ showCategory }) => (
  <div
    className={`hidden @min-[60rem]:grid ${ASSET_GRID} px-5 sm:px-6 py-2.5 bg-[#FAFBFC] border-b border-[#F0F1F4] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]`}
  >
    <span className="min-w-0 truncate">Asset no</span>
    <span className="min-w-0 truncate">
      {showCategory ? 'Appliance & category' : 'Appliance'}
    </span>
    <span className="min-w-0 truncate">Where</span>
    <span className="min-w-0 truncate">Status</span>
    <span className="min-w-0 truncate">General maintenance</span>
    <span className="min-w-0 text-center">Actions</span>
  </div>
);

/**
 * One appliance, on the grid its heading declares.
 *
 * A table rather than a paragraph per asset. Ninety-one rows of prose is not
 * a register — nothing lines up, so nothing can be compared, and finding the
 * one unit that is overdue means reading all of them. In columns the same
 * ninety-one answer at a glance.
 *
 * Below the breakpoint the grid collapses and each cell carries its own label,
 * because a bare date under a bare name says nothing once the heading is gone.
 */
const AssetRow: React.FC<{
  item: Equipment;
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
}) => {
  const makeModel = [item.make, item.model].filter(Boolean).join(' ');
  /*
   * Shown only when it says something the pill does not. "SERVICE DUE" beside
   * a pill reading Service due is noise; "Unit 1 of 2" is the only thing
   * telling two otherwise identical rows apart.
   */
  const note =
    item.statusNote &&
    item.statusNote.toLowerCase() !==
      SERVICE_STATUS_LABELS[item.serviceStatus ?? 'inventory'].toLowerCase()
      ? item.statusNote
      : null;

  return (
    <div className={`${ASSET_GRID} px-5 sm:px-6 py-3.5 hover:bg-[#FAFBFC] transition-colors`}>
      {/*
        The number leads, in a monospaced face so a column of them lines up and
        a transposed digit is visible. On this estate the name alone is often
        not an identification at all — eleven rows here say "Fan".
      */}
      <div className="min-w-0">
        {item.assetNo ? (
          <span className="inline-block font-mono text-[11px] font-bold tracking-wide text-[#17181D] bg-[#F4F5F7] border border-[#E8E9EE] px-1.5 py-0.5 rounded-md">
            {item.assetNo}
          </span>
        ) : (
          <span className="text-[11px] text-[#9CA1A9]">—</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-[13px] font-bold text-[#17181D] truncate">
          {item.name}
          {item.capacity && (
            <span className="ml-2 text-[11px] font-semibold text-[#6B6F76]">{item.capacity}</span>
          )}
        </p>
        {/* Absent rather than a dash: a column of em-dashes is furniture */}
        {(makeModel || item.serialNumber) && (
          <p className="text-[11px] text-[#6B6F76] truncate">
            {[makeModel, item.serialNumber].filter(Boolean).join(' · ')}
          </p>
        )}
        {(showCategory || !item.active || ownInterval !== undefined) && (
          <p className="flex flex-wrap items-center gap-1.5 mt-1">
            {showCategory && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F4F5F7] text-[#6B6F76]">
                {categoryLabelText}
              </span>
            )}
            {/*
              An asset that departs from what its category says is worth seeing
              without opening it — a fridge quietly exempted two years ago is
              how something stops being serviced and nobody notices.
            */}
            {ownInterval === null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F4F5F7] text-[#6B6F76]">
                Off general maintenance
              </span>
            )}
            {ownInterval && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDECEE] text-[#C8202D]">
                Own cadence · {intervalText(ownInterval)}
              </span>
            )}
            {!item.active && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F4F5F7] text-[#6B6F76]">
                <Archive className="w-3 h-3" />
                Archived
              </span>
            )}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[#17181D] truncate">{item.branchName}</p>
        {item.location && (
          <p className="text-[11px] text-[#6B6F76] truncate inline-flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {item.location}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <ServiceStatusPill status={item.serviceStatus ?? 'inventory'} />
        {note && <p className="text-[11px] text-[#6B6F76] italic truncate mt-1">{note}</p>}
      </div>

      {/*
        The date and the button that moves it on, in one cell. Recording the
        work IS this column — marking it done is what changes the date beside
        it — so parking the button over in Actions put a stride of white space
        between a figure and the control that sets it.
      */}
      <div className="min-w-0 flex items-center gap-3">
        {gm ? (
          <>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[12px] font-semibold tabular-nums ${
                  gm.due ? 'text-[#C8202D]' : 'text-[#17181D]'
                }`}
              >
                {gm.daysOverdue === 0 ? 'Due today' : gm.dueOn}
              </span>
              <span className="block text-[11px] text-[#6B6F76]">
                {gm.due && gm.daysOverdue > 0
                  ? `${gm.daysOverdue} day${gm.daysOverdue === 1 ? '' : 's'} overdue`
                  : intervalText(ownInterval ?? intervalOf(gm.plan))}
              </span>
            </span>
            {/*
              Offered whenever the asset is on a general-maintenance cadence at
              all, not only once it has fallen due. The whole case for it is the
              work done in between: somebody servicing the fridge in week three
              because they were there anyway has nothing on the board telling
              them to, and no way to say so. Red once it is due, so a row that
              needs attention reads as one from across the screen.
            */}
            {item.active && (
              <button
                type="button"
                onClick={() => onRecord()}
                title={
                  gm.openJob
                    ? 'Records the work and closes the job standing on the board'
                    : `Next due ${gm.dueOn}`
                }
                aria-label={`Record general maintenance on ${item.name}`}
                className={
                  gm.due
                    ? 'shrink-0 inline-flex items-center gap-1.5 h-8 px-3 bg-[#C8202D] hover:bg-[#A81823] text-white text-[11px] font-bold rounded-lg shadow-[0_6px_16px_-8px_rgba(200,32,45,0.6)] transition-all hover:-translate-y-px cursor-pointer whitespace-nowrap'
                    : 'shrink-0 inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-[#E4E6EB] text-[11px] font-semibold text-[#17181D] rounded-lg shadow-xs transition-all hover:-translate-y-px hover:shadow-sm cursor-pointer whitespace-nowrap'
                }
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Done</span>
              </button>
            )}
          </>
        ) : (
          <span className="text-[11px] text-[#9CA1A9]">Not scheduled</span>
        )}
      </div>

      {/* Whatever you do TO the record itself, centred under its heading */}
      <div className="min-w-0 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => onHistory()}
          title="Jobs raised against this asset"
          aria-label={`History for ${item.name}`}
          className={`${iconButtonClass} text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7]`}
        >
          <History className="w-3.5 h-3.5" />
        </button>
        {mayManage &&
          (item.active ? (
            <>
              <button
                type="button"
                onClick={() => onEdit()}
                aria-label={`Edit ${item.name}`}
                title="Edit"
                className={`${iconButtonClass} text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7]`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onWithdraw()}
                aria-label={`Withdraw ${item.name}`}
                title="Withdraw"
                className={`${iconButtonClass} text-[#9CA1A9] hover:text-[#C8202D] hover:bg-[#FDECEE]`}
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onRestore()}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] font-bold text-[#157F4B] bg-[#E6F4EC] hover:bg-[#D6EEDF] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
          ))}
      </div>
    </div>
  );
};

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
    <DialogFrame
      dialogRef={dialogRef}
      titleId="equipmentscreen-dialog-5-title"
      title={<>Add a category</>}
      subtitle={<>A trade to file appliances under, and what they are serviced on.</>}
      icon={Plus}
      width="max-w-md"
      onClose={onClose}
    >
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
            <span className="text-xs font-semibold text-[#6B6F76]">Every</span>
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
          <p role="alert" className={alertClass}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </p>
        )}

        <div className={dialogFooterClass}>
          <button
            type="button"
            onClick={onClose}
            className={BUTTON.secondary}
          >
            Cancel
          </button>
          <button
            id="save-category-btn"
            type="submit"
            className={BUTTON.primary}
          >
            Add category
          </button>
        </div>
      </form>
    </DialogFrame>
  );
};

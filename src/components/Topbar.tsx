'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  LogOut,
  MapPin,
  PenLine,
  Search,
  Store,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
import { Inspection, MaintenanceJob, USER_ROLE_LABEL, branchesOf } from '../types';
import { getInspections, subscribeToStorage } from '../services/storage';
import { getJobs, subscribeToMaintenance } from '../services/maintenanceStore';
import { formatDate, formatDateTime, formatTimeOnly } from '../services/reportModel';
import { signOut, switchBranch, switchableBranches } from '../services/session';
import { can, visibleInspections, visibleJobs } from '../services/permissions';
import { assignmentsFor, isOverdueAssignment, scheduleLabel } from '../services/assignments';
import { mondayStatusFor } from '../services/mondaySchedule';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useBranches } from '../hooks/useBranches';
import { activeBranches } from '../services/branchStore';
import { EASE_OUT, t } from './motion';

/**
 * The bar above every screen: find a record, see what is outstanding, sign out.
 *
 * Everything in it reads the same stores the screens do, so the alert count
 * cannot disagree with what the dashboard says needs doing — and everything
 * is filtered by what the signed-in account may see, so a branch manager is
 * not chased about a branch that is not theirs, and an inspector is not
 * offered records they cannot open.
 */

const MAX_RESULTS = 6;

interface SearchHit {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  group: string;
}

interface Alert {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  tone: 'bad' | 'warn';
}

/** Today as a plain local ISO date, matching how records store their dates. */
function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export const Topbar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const [allInspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [allJobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());
  const allBranches = useBranches();

  useEffect(() => {
    const refresh = () => setInspections(getInspections());
    refresh();
    return subscribeToStorage(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  /*
   * Scoped to the account before anything else looks at it, so neither the
   * search nor the alert list can leak a branch someone has no business
   * seeing. Closed branches drop out too: they are not chased for being
   * overdue.
   */
  const inspections = useMemo(
    () => visibleInspections(user, allInspections),
    [user, allInspections]
  );

  const branches = useMemo(() => {
    const open = activeBranches(allBranches);
    if (can(user, 'inspections.viewAll')) return open;
    if (user?.role === 'branch-manager') {
      const own = branchesOf(user);
      return open.filter((b) => own.includes(b.name));
    }
    // An inspector has no standing at a branch beyond the visit itself
    return [];
  }, [user, allBranches]);

  /*
   * Narrowed exactly as the board is, so the alerts and the search agree with
   * what the screens behind them will show. The admin and the maintenance manager get
   * every job; a branch manager gets their own branch's repairs, both links
   * landing somewhere now open to them; an inspector gets none, having no
   * standing at a branch beyond the visit itself.
   */
  const jobs = useMemo(() => visibleJobs(user, allJobs), [user, allJobs]);

  // Which panel, if any, is showing. Only one may be open at a time.
  const [open, setOpen] = useState<'search' | 'alerts' | 'branch' | 'user' | null>(null);

  /*
   * A phone-width bar holds the search beside the branch, the bell and the
   * avatar, which leaves the box a word wide — the full hint showed as "Sea".
   * Placeholder text cannot be switched by CSS, so the width is watched.
   */
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 639px)');
    const update = () => setCompact(narrow.matches);
    update();
    narrow.addEventListener('change', update);
    return () => narrow.removeEventListener('change', update);
  }, []);
  const [query, setQuery] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  // Clicking away or pressing Escape closes whatever is open
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const submitted = inspections.filter((i) => i.status === 'submitted');
    const out: SearchHit[] = [];

    // A branch resolves to its most recent visit, so the hit lands on a record
    branches.filter(
      (b) => b.name.toLowerCase().includes(q) || b.location.toLowerCase().includes(q)
    ).forEach((b) => {
      const latest = submitted
        .filter((i) => i.branchName === b.name)
        .sort((x, y) => y.date.localeCompare(x.date))[0];
      out.push({
        key: `branch-${b.id}`,
        href: latest ? `/inspections/${latest.id}` : '/inspections/new',
        icon: MapPin,
        title: b.name,
        meta: latest ? `Latest visit ${formatDate(latest.date)}` : 'Never inspected',
        group: 'Branches',
      });
    });

    inspections
      .filter(
        (i) =>
          i.branchName.toLowerCase().includes(q) ||
          (i.inspectorName ?? '').toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q)
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_RESULTS)
      .forEach((i) => {
        out.push({
          key: `insp-${i.id}`,
          href:
            i.status === 'draft' ? `/inspections/${i.id}/checklist` : `/inspections/${i.id}`,
          icon: ClipboardList,
          title: i.branchName,
          meta: `${formatDate(i.date)} • ${
            i.status === 'draft' ? 'Draft' : `${i.score}%`
          }${i.inspectorName ? ` • ${i.inspectorName}` : ''}`,
          group: 'Inspections',
        });
      });

    jobs
      .filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.branchName.toLowerCase().includes(q) ||
          j.equipment.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS)
      .forEach((j) => {
        out.push({
          key: `job-${j.id}`,
          href: `/maintenance/${j.id}`,
          icon: Wrench,
          title: j.title,
          meta: `${j.branchName} • ${j.equipment}`,
          group: 'Maintenance',
        });
      });

    return out.slice(0, 12);
  }, [query, inspections, jobs, branches]);

  const alerts = useMemo<Alert[]>(() => {
    const today = todayIso();
    const submitted = inspections.filter((i) => i.status === 'submitted');
    const out: Alert[] = [];

    const draft = inspections.find((i) => i.status === 'draft');
    if (draft) {
      out.push({
        key: 'draft',
        href: `/inspections/${draft.id}/checklist`,
        icon: PenLine,
        text: `Unfinished inspection at ${draft.branchName}`,
        tone: 'warn',
      });
    }

    /*
     * The one thing an inspector is here for: the visits handed to them.
     * Nothing else in this list applies — they hold no branch, so being
     * overdue is not theirs to answer for.
     */
    if (user?.role === 'inspector') {
      assignmentsFor(user.id, inspections).forEach((visit) => {
        // A visit booked for a time that has passed is a different message
        // from one simply waiting, and a worse one
        const late = isOverdueAssignment(visit);
        const booked = scheduleLabel(visit, formatDateTime, formatTimeOnly);
        out.push({
          key: `assigned-${visit.id}`,
          href: '/inspections',
          icon: CalendarClock,
          text: booked
            ? `Surprise visit to ${visit.branchName} ${late ? 'was due' : 'due'} ${booked}`
            : `Surprise visit to ${visit.branchName} waiting to be started`,
          tone: late ? 'bad' : 'warn',
        });
      });
      return out;
    }

    /*
     * A branch manager is chased about one thing: this week's round. The
     * generic overdue alert below would say the same thing less precisely —
     * it counts seven days from the last visit of any kind, where the round
     * is due on the Monday whether or not an inspector called on Thursday.
     */
    const ownBranches = branchesOf(user);
    ownBranches.forEach((branch) => {
      const monday = mondayStatusFor(branch, inspections);
      if (!monday.done) {
        // Named only when there is more than one round to tell apart
        const where = ownBranches.length > 1 ? `${branch}: ` : '';
        out.push({
          key: `monday-${branch}`,
          href: '/inspections',
          icon: CalendarClock,
          text: where + (monday.overdue
            ? `Monday inspection is ${monday.daysLate} day${
                monday.daysLate === 1 ? '' : 's'
              } late`
            : 'Monday inspection is due today'),
          tone: monday.overdue ? 'bad' : 'warn',
        });
      }
    });

    // Chasing every branch's cadence is the admin's job — the manager above
    // has already been told about their own, more precisely.
    const chased = can(user, 'inspections.viewAll') ? branches : [];

    chased.forEach((b) => {
      const latest = submitted
        .filter((i) => i.branchName === b.name)
        .sort((x, y) => y.date.localeCompare(x.date))[0];
      if (!latest) {
        out.push({
          key: `never-${b.id}`,
          href: '/inspections/new',
          icon: CalendarClock,
          text: `${b.name} has never been inspected`,
          tone: 'bad',
        });
        return;
      }
      // Same weekly cadence the reports use
      const due = new Date(`${latest.date}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + 7);
      const dueIso = due.toISOString().slice(0, 10);
      const over = daysBetween(dueIso, today);
      if (over > 0) {
        out.push({
          key: `overdue-${b.id}`,
          href: '/inspections/new',
          icon: CalendarClock,
          text: `${b.name} is ${over} day${over === 1 ? '' : 's'} overdue`,
          tone: 'bad',
        });
      }
    });

    const openJobs = jobs.filter((j) => j.completedAt === null);
    const urgent = openJobs.filter((j) => j.priority === 'critical' || j.priority === 'high');
    if (openJobs.length > 0) {
      out.push({
        key: 'jobs',
        href: '/maintenance/jobs',
        icon: Wrench,
        text: `${openJobs.length} maintenance job${
          openJobs.length === 1 ? '' : 's'
        } outstanding${urgent.length > 0 ? ` — ${urgent.length} urgent` : ''}`,
        tone: urgent.length > 0 ? 'bad' : 'warn',
      });
    }

    const unsigned = submitted.filter((i) => !i.signature).length;
    if (unsigned > 0) {
      out.push({
        key: 'unsigned',
        href: '/inspections',
        icon: PenLine,
        text: `${unsigned} submitted record${
          unsigned === 1 ? '' : 's'
        } with no manager signature`,
        tone: 'warn',
      });
    }

    return out;
  }, [user, inspections, jobs, branches]);

  const go = (href: string) => {
    setOpen(null);
    setQuery('');
    router.push(href);
  };

  const handleSignOut = () => {
    signOut();
    router.replace('/login');
  };

  /*
   * The branches a manager who runs more than one can move between. Keyed on
   * `user` because switching comes back as a new user holding the new
   * branch, which is also what tells this to read the choice again.
   */
  const switcher = useMemo(() => switchableBranches(), [user]);

  /*
   * A single record belongs to one branch, so one opened at the branch just
   * left is not the manager's to look at any more. They go back to that
   * record's list rather than being shown a locked door.
   */
  const handleSwitchBranch = (name: string) => {
    setOpen(null);
    if (name === switcher.active || !switchBranch(name)) return;
    if (/^\/inspections\/(?!new$)[^/]+/.test(pathname)) router.push('/inspections');
    else if (/^\/maintenance\/(?!(jobs|equipment|report|schedule)$)[^/]+$/.test(pathname)) {
      router.push('/maintenance/jobs');
    }
  };

  /** The branch a manager is working on — theirs, or the one switched to. */
  const activeBranch = branchesOf(user)[0] ?? null;

  /*
   * A branch manager's role is not the whole answer to "who am I signed in
   * as" — which branch they are working on is the part that decides what they
   * see, so it belongs on the same line.
   */
  const roleLine = user
    ? activeBranch
      ? `${USER_ROLE_LABEL[user.role]} · ${activeBranch}`
      : USER_ROLE_LABEL[user.role]
    : '';

  /** How this week's round stands at a branch, for the switcher to show. */
  const mondayLabel = (branch: string) => {
    const monday = mondayStatusFor(branch, allInspections);
    if (monday.done) return { text: 'Monday round done', tone: 'text-[#157F4B]' };
    if (monday.inProgress) return { text: 'Monday round unfinished', tone: 'text-[#B4740A]' };
    if (monday.overdue) {
      return {
        text: `Monday round ${monday.daysLate} day${monday.daysLate === 1 ? '' : 's'} late`,
        tone: 'text-[#C8202D]',
      };
    }
    return { text: 'Monday round due today', tone: 'text-[#B4740A]' };
  };

  return (
    <div
      ref={barRef}
      /*
       * Frosted rather than solid, so the page scrolling under it stays
       * faintly visible and the bar reads as sitting above the page rather
       * than as a band cut out of it. The filter only reaches this bar's own
       * contents — its panels are absolute, and nothing fixed lives in here.
       */
      className="no-print sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-xl backdrop-saturate-150 border-b border-[#E8E9EE] shadow-[0_1px_0_rgba(16,24,40,0.02)] flex items-center gap-3 sm:gap-5 px-4 sm:px-6 md:px-8 shrink-0"
    >
      {/* Search */}
      <div className="relative flex-1 max-w-xl">
        <Search
          className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
            open === 'search' ? 'text-[#17181D]' : 'text-[#9CA1A9]'
          }`}
        />
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen('search');
          }}
          onFocus={() => setOpen('search')}
          placeholder={compact ? 'Search' : 'Search branches, inspections, or jobs…'}
          aria-label="Search branches, inspections and maintenance jobs"
          className={`w-full h-10 pl-10 ${query ? 'pr-9' : 'pr-3'} rounded-xl bg-[#F4F5F7] border border-transparent text-[13px] text-[#17181D] placeholder:text-[#9CA1A9] hover:bg-[#EFF0F3] focus:outline-none focus:bg-white focus:border-[#E0E2E7] focus:shadow-[0_0_0_4px_rgba(200,32,45,0.08)] transition-[background-color,border-color,box-shadow] duration-200 [&::-webkit-search-cancel-button]:appearance-none`}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-[#9CA1A9] hover:text-[#17181D] hover:bg-[#F4F5F7] transition-colors cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {open === 'search' && query.trim().length >= 2 && (
          <Panel origin="top left" className="left-0 right-0">
            {hits.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center text-center">
                <span className="w-10 h-10 rounded-xl bg-[#F4F5F7] text-[#9CA1A9] flex items-center justify-center">
                  <Search className="w-[18px] h-[18px]" />
                </span>
                <p className="mt-3 text-xs text-[#6B6F76]">Nothing matches “{query.trim()}”.</p>
              </div>
            ) : (
              <ul className="p-1.5 max-h-[24rem] overflow-y-auto">
                {hits.map((hit, i) => {
                  const newGroup = i === 0 || hits[i - 1].group !== hit.group;
                  return (
                    <li key={hit.key}>
                      {newGroup && (
                        <p
                          className={`px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9] ${
                            i === 0 ? 'pt-1.5' : 'pt-3'
                          }`}
                        >
                          {hit.group}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => go(hit.href)}
                        className="w-full px-2.5 py-2 rounded-lg flex items-center gap-3 text-left hover:bg-[#F7F8FA] transition-colors cursor-pointer group"
                      >
                        <span className="w-8 h-8 rounded-lg bg-[#F4F5F7] text-[#6B6F76] flex items-center justify-center shrink-0 transition-colors group-hover:bg-white group-hover:text-[#17181D] group-hover:shadow-xs">
                          <hit.icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-[#17181D] truncate">
                            {hit.title}
                          </span>
                          <span className="block text-[11px] text-[#6B6F76] truncate">
                            {hit.meta}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#C9CCD2] shrink-0 transition-all group-hover:text-[#17181D] group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
        {/*
          The branch being worked on, where it can be seen from every screen.
          For a manager with more than one it is also where they switch: it
          opens the list of their branches, each showing where its Monday
          round stands, so the branch not on screen is not forgotten.
        */}
        {activeBranch && (
          <div className="sm:relative min-w-0">
            <button
              type="button"
              id="topbar-branch"
              onClick={() => switcher.branches.length > 0 && setOpen(open === 'branch' ? null : 'branch')}
              aria-expanded={switcher.branches.length > 0 ? open === 'branch' : undefined}
              aria-haspopup={switcher.branches.length > 0 ? 'menu' : undefined}
              title={switcher.branches.length > 0 ? 'Switch branch' : activeBranch}
              className={`inline-flex items-center gap-2 h-9 max-w-[8.5rem] sm:max-w-[16rem] pl-1.5 pr-2.5 sm:pr-3 rounded-xl border bg-white text-xs font-bold text-[#17181D] shadow-xs transition-all duration-200 ${
                open === 'branch' ? 'border-[#D5D8DE] shadow-sm' : 'border-[#E8E9EE]'
              } ${
                switcher.branches.length > 0
                  ? 'hover:border-[#D5D8DE] hover:shadow-sm cursor-pointer'
                  : 'cursor-default'
              }`}
            >
              <span className="w-6 h-6 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
                <Store className="w-3.5 h-3.5" />
              </span>
              <span className="truncate">{activeBranch}</span>
              {switcher.branches.length > 0 && (
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#9CA1A9] shrink-0 transition-transform duration-200 ${
                    open === 'branch' ? 'rotate-180' : ''
                  }`}
                />
              )}
            </button>

            {open === 'branch' && switcher.branches.length > 0 && (
              <Panel className="left-4 right-4 sm:left-auto sm:right-0 sm:w-72">
                <div className="p-1.5" role="group" aria-label="Switch branch">
                  <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9]">
                    Switch branch
                  </p>
                  {switcher.branches.map((branch) => {
                    const selected = branch === switcher.active;
                    const monday = mondayLabel(branch);
                    return (
                      <button
                        key={branch}
                        type="button"
                        onClick={() => handleSwitchBranch(branch)}
                        aria-pressed={selected}
                        className={`w-full px-2.5 py-2 rounded-lg flex items-center gap-3 text-left transition-colors cursor-pointer ${
                          selected ? 'bg-[#FDF3F4]' : 'hover:bg-[#F7F8FA]'
                        }`}
                      >
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            selected ? 'bg-[#FDECEE] text-[#C8202D]' : 'bg-[#F4F5F7] text-[#6B6F76]'
                          }`}
                        >
                          <Store className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] truncate ${
                              selected ? 'font-bold text-[#A81823]' : 'font-semibold text-[#17181D]'
                            }`}
                          >
                            {branch}
                          </span>
                          <span className={`block text-[11px] font-semibold ${monday.tone}`}>
                            {monday.text}
                          </span>
                        </span>
                        {selected && <Check className="w-4 h-4 text-[#C8202D] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* Alerts */}
        <div className="sm:relative">
          <button
            type="button"
            id="topbar-alerts-btn"
            onClick={() => setOpen(open === 'alerts' ? null : 'alerts')}
            aria-expanded={open === 'alerts'}
            aria-label={`Alerts${alerts.length > 0 ? ` — ${alerts.length} outstanding` : ''}`}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200 cursor-pointer ${
              open === 'alerts'
                ? 'bg-[#F4F5F7] text-[#17181D]'
                : 'text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7]'
            }`}
          >
            <Bell className="w-[18px] h-[18px]" />
            {alerts.length > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C8202D] ring-2 ring-white text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            )}
          </button>

          {open === 'alerts' && (
            <Panel className="left-4 right-4 sm:left-auto sm:right-0 sm:w-[23rem]">
              <div className="px-4 py-3 border-b border-[#F0F1F4] flex items-center gap-2">
                <p className="text-[13px] font-bold text-[#17181D]">Needs attention</p>
                {alerts.length > 0 && (
                  <span className="rounded-full bg-[#FDECEE] px-2 py-0.5 text-[11px] font-bold text-[#A81823] tabular-nums">
                    {alerts.length}
                  </span>
                )}
              </div>
              {alerts.length === 0 ? (
                <div className="px-4 py-8 flex flex-col items-center text-center">
                  <span className="w-10 h-10 rounded-xl bg-[#E6F4EC] text-[#157F4B] flex items-center justify-center">
                    <Check className="w-5 h-5" />
                  </span>
                  <p className="mt-3 text-xs text-[#6B6F76]">
                    Nothing outstanding. Every branch is within schedule.
                  </p>
                </div>
              ) : (
                <ul className="p-1.5 max-h-[24rem] overflow-y-auto">
                  {alerts.map((alert) => (
                    <li key={alert.key}>
                      <button
                        type="button"
                        onClick={() => go(alert.href)}
                        className="w-full px-2.5 py-2.5 rounded-lg flex items-start gap-3 text-left hover:bg-[#F7F8FA] transition-colors cursor-pointer group"
                      >
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            alert.tone === 'bad'
                              ? 'bg-[#FDECEE] text-[#C8202D]'
                              : 'bg-[#FDF3E2] text-[#B4740A]'
                          }`}
                        >
                          <alert.icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0 pt-1.5 text-[13px] text-[#17181D] leading-snug">
                          {alert.text}
                        </span>
                        <ChevronRight className="w-4 h-4 mt-2 text-[#C9CCD2] shrink-0 transition-all group-hover:text-[#17181D] group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <span className="hidden sm:block w-px h-6 bg-[#E8E9EE]" />

        {/* User */}
        <div className="relative">
          <button
            type="button"
            id="topbar-user-btn"
            onClick={() => setOpen(open === 'user' ? null : 'user')}
            aria-expanded={open === 'user'}
            className={`flex items-center gap-2.5 p-1 md:pr-2.5 rounded-xl transition-colors duration-200 cursor-pointer ${
              open === 'user' ? 'bg-[#F4F5F7]' : 'hover:bg-[#F4F5F7]'
            }`}
          >
            <Avatar initials={user?.initials ?? '?'} />
            <span className="hidden md:block text-left leading-tight">
              <span className="block text-xs font-bold text-[#17181D]">{user?.name ?? ''}</span>
              <span className="block text-[11px] text-[#6B6F76]">{roleLine}</span>
            </span>
            <ChevronDown
              className={`hidden md:block w-4 h-4 text-[#9CA1A9] transition-transform duration-200 ${
                open === 'user' ? 'rotate-180' : ''
              }`}
            />
          </button>

          {open === 'user' && (
            <Panel className="right-0 w-64">
              <div className="px-4 py-3.5 border-b border-[#F0F1F4] flex items-center gap-3">
                <Avatar initials={user?.initials ?? '?'} size="lg" />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[#17181D] truncate">{user?.name ?? ''}</p>
                  <p className="text-[11px] text-[#6B6F76]">{roleLine}</p>
                  {user && (
                    <p className="mt-0.5 text-[11px] text-[#9CA1A9] break-all">{user.email}</p>
                  )}
                </div>
              </div>
              <div className="p-1.5">
                {/* Only the admin has a checklist to set up */}
                {can(user, 'checklist.manage') && (
                  <Link
                    href="/checklist"
                    onClick={() => setOpen(null)}
                    className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-xs font-semibold text-[#17181D] hover:bg-[#F7F8FA] transition-colors"
                  >
                    <ClipboardList className="w-4 h-4 text-[#6B6F76]" />
                    Checklist setup
                  </Link>
                )}
                {can(user, 'users.manage') && (
                  <Link
                    href="/users"
                    onClick={() => setOpen(null)}
                    className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-xs font-semibold text-[#17181D] hover:bg-[#F7F8FA] transition-colors"
                  >
                    <UserCog className="w-4 h-4 text-[#6B6F76]" />
                    Users &amp; access
                  </Link>
                )}
                {(can(user, 'checklist.manage') || can(user, 'users.manage')) && (
                  <div className="my-1.5 mx-2.5 h-px bg-[#F0F1F4]" aria-hidden />
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-xs font-semibold text-[#C8202D] hover:bg-[#FDF3F4] transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

/** The signed-in account's initials, on the brand red. */
const Avatar: React.FC<{ initials: string; size?: 'md' | 'lg' }> = ({ initials, size = 'md' }) => (
  <span
    className={`rounded-full bg-gradient-to-br from-[#D6303D] to-[#A81823] text-white font-bold flex items-center justify-center shrink-0 shadow-[0_4px_10px_-4px_rgba(200,32,45,0.6)] ring-2 ring-white ${
      size === 'lg' ? 'w-10 h-10 text-[13px]' : 'w-8 h-8 text-[11px]'
    }`}
  >
    {initials}
  </span>
);

/**
 * The dropdown shell. One place for the surface, so all three panels match.
 *
 * Each grows out of the control that opened it — a short fade with a slight
 * drop and scale from that corner. Closing is instant rather than animated:
 * a panel lingering on its way out is still there to be read and clicked,
 * and the next panel opened would briefly sit on top of it. A transform is
 * safe here: the panels are absolute, and nothing inside them is fixed.
 *
 * Below `sm` the branch and alert panels are measured from the bar itself
 * rather than from their button (their wrappers are only `relative` from
 * `sm` up), so on a phone they span the screen with a gutter each side
 * instead of hanging off its left edge.
 */
const Panel: React.FC<{
  className?: string;
  /** The corner it grows from: the side it is pinned to. */
  origin?: 'top right' | 'top left';
  children: React.ReactNode;
}> = ({ className = '', origin = 'top right', children }) => (
  <motion.div
    initial={{ opacity: 0, y: -6, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: t(0.22), ease: EASE_OUT }}
    style={{ transformOrigin: origin }}
    className={`absolute top-[calc(100%+0.5rem)] bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_20px_44px_-16px_rgba(16,24,40,0.28),0_2px_6px_-2px_rgba(16,24,40,0.08)] overflow-hidden z-30 ${className}`}
  >
    {children}
  </motion.div>
);

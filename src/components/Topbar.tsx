'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  LogOut,
  MapPin,
  Search,
  ShieldAlert,
  Store,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
import { USER_ROLE_LABEL, branchesOf } from '../types';
import { formatDate } from '../services/reportModel';
import { signOut, switchBranch, switchableBranches } from '../services/session';
import { can } from '../services/permissions';
import { mondayStatusFor } from '../services/mondaySchedule';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useOutstanding } from '../hooks/useOutstanding';
import { BrandLogo } from './BrandLogo';
import { EASE_OUT, t } from './motion';

/**
 * The bar across the top of every screen, in two rows.
 *
 *   status strip  where you are and what is outstanding there, at a glance:
 *                 the scope, this week's inspections, rounds due and late,
 *                 open repairs and the last inspection. From `md` up only —
 *                 a phone has no width for it, and the bell says the same.
 *   header        the brand, search, starting an inspection, the bell, the
 *                 branch being worked on and the account.
 *
 * Everything in it reads `useOutstanding`, the same source the sidebar's
 * counts use, and that reads the same stores the screens do — so no count up
 * here can disagree with what the dashboard says needs doing. Everything is
 * narrowed to what the signed-in account may see first.
 *
 * The logo lives here rather than at the top of the sidebar, as it does on
 * most business software: the header spans the window, so the brand sits at
 * its left end on every screen, including a phone's.
 */

/*
 * From `md` up the strip and header stand 6.5rem tall together (2.25rem and
 * 4.25rem). The rail and the inspections table's heading row pin themselves
 * under that height, so change all three together.
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

export const Topbar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const {
    allInspections,
    inspections,
    jobs,
    branches,
    alerts,
    openJobs,
    visitsDue,
    visitsLate,
    thisWeek,
    latestDate,
  } = useOutstanding(user);


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

  /*
   * What the strip says about scope: every branch for those who hold them
   * all, the branch being worked on for a manager, and for an inspector the
   * visits they are sent on, which is the whole of their standing.
   */
  const scope = can(user, 'inspections.viewAll')
    ? `All ${branches.length} branches`
    : activeBranch
      ? activeBranch
      : user?.role === 'inspector'
        ? 'Assigned visits'
        : 'All branches';
  const seesInspections = can(user, 'inspections.browse');
  const seesRepairs = can(user, 'maintenance.view') || can(user, 'maintenance.report');
  const mayStartVisits = can(user, 'monday.perform');

  return (
    <header ref={barRef} className="no-print sticky top-0 z-40 shrink-0">
      {/* Status strip */}
      <div className="hidden md:flex h-9 items-center gap-6 px-6 lg:px-8 bg-[#8E1520] text-white text-[12px] font-semibold whitespace-nowrap overflow-hidden">
        <StripItem icon={MapPin}>{scope}</StripItem>
        {seesInspections && (
          <StripItem icon={ClipboardList} href="/inspections">
            {thisWeek} inspection{thisWeek === 1 ? '' : 's'} this week
          </StripItem>
        )}
        <div className="ml-auto flex items-center gap-6">
          {seesInspections && (
            <>
              <StripItem icon={CalendarCheck} href="/inspections">
                {visitsDue} due
              </StripItem>
              <StripItem icon={ShieldAlert} href="/inspections" alert={visitsLate > 0}>
                {visitsLate} overdue
              </StripItem>
            </>
          )}
          {seesRepairs && (
            <StripItem icon={Wrench} href="/maintenance/jobs">
              {openJobs.length} open repair{openJobs.length === 1 ? '' : 's'}
            </StripItem>
          )}
          {seesInspections && (
            <StripItem icon={Clock} className="hidden lg:inline-flex">
              {latestDate ? `Last inspection ${formatDate(latestDate)}` : 'No inspection yet'}
            </StripItem>
          )}
        </div>
      </div>

      {/*
        Solid white rather than frosted: the strip above is solid, and a
        header the page showed through under a solid band read as two bars
        that did not belong together.

        The shadow is what separates it from the page: white on the page's
        pale grey, a hairline alone all but vanished.
      */}
      <div className="relative h-16 md:h-[4.25rem] bg-white border-b border-[#E2E4E9] shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_20px_-8px_rgba(16,24,40,0.16)] flex items-center gap-3 sm:gap-5 px-4 sm:px-6 lg:px-8">
      {/* Brand */}
      <Link
        href="/dashboard"
        id="brand-logo-btn"
        title="Gujrat Group — Dashboard"
        className="shrink-0 flex items-center gap-4 cursor-pointer transition-opacity hover:opacity-85"
      >
        <BrandLogo variant="emblem" bare className="sm:hidden w-10" />
        <BrandLogo variant="lockup" bare className="hidden sm:flex w-[10.5rem] lg:w-[11.5rem]" />
        <span aria-hidden className="hidden xl:block w-px h-8 bg-[#E8E9EE]" />
        <span className="hidden xl:block text-[13px] font-medium text-[#3D4047]">Inspection Log</span>
      </Link>

      {/* Search */}
      <div className="relative flex-1 max-w-xl lg:mx-auto">
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
          Starting an inspection, from every screen — for the roles the route
          table lets through to it, and nobody else.
        */}
        {mayStartVisits && (
          <Link
            id="topbar-new-inspection-btn"
            href="/inspections/new"
            className="hidden md:inline-flex items-center gap-2 h-10 px-3 lg:px-4 rounded-xl bg-[#8E1520] hover:bg-[#76101A] text-white text-[13px] font-semibold shadow-[0_6px_16px_-8px_rgba(142,21,32,0.7)] transition-all duration-200 hover:-translate-y-px mr-1"
            title="New inspection"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">New inspection</span>
          </Link>
        )}
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
    </header>
  );
};

/** One reading on the status strip; a link where there is a page behind it. */
const StripItem: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  /** Marks a count that wants attention. */
  alert?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, href, alert = false, className = '', children }) => {
  const inner = (
    <>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${alert ? 'text-[#FFC2C7]' : 'text-white/75'}`} />
      <span className="tabular-nums">{children}</span>
    </>
  );
  const base = `inline-flex items-center gap-2 ${className}`;
  return href ? (
    <Link href={href} className={`${base} hover:text-white/80 transition-colors`}>
      {inner}
    </Link>
  ) : (
    <span className={base}>{inner}</span>
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

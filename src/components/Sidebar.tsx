'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { EASE_OUT, t, SPRING } from './motion';
import { User } from '../types';
import { Capability, can } from '../services/permissions';
import { useCurrentUser } from '../hooks/useCurrentUser';

/**
 * What a row asks of the signed-in account. A list means any one of them is
 * enough — the same rule the route table applies, so a row is shown exactly
 * when the path behind it opens.
 */
type Needs = Capability | Capability[];

function holds(user: User | null, needs?: Needs): boolean {
  if (!needs) return true;
  return Array.isArray(needs) ? needs.some((c) => can(user, c)) : can(user, needs);
}

/** One page within a section. */
interface NavChild {
  id: string;
  href: string;
  label: string;
  isActive: (p: string) => boolean;
  needs?: Needs;
}

interface NavEntry {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** True when the current path belongs to this section. */
  isActive: (pathname: string) => boolean;
  /**
   * Rows are ruled off where the group changes: recording work above,
   * configuring the system below. A group rather than a flag on the first
   * row of each, because rows are filtered by role — a flag on "Checklist"
   * drew no rule at all for anyone who cannot see that row.
   */
  group: 'work' | 'setup';
  /** What the signed-in account needs to be shown this row. */
  needs?: Needs;
  /** Pages within this section, revealed under it. Filtered the same way. */
  children?: NavChild[];
}

/** A row with its pages narrowed to the account, and led to the first left. */
type ResolvedEntry = Omit<NavEntry, 'children'> & { children: NavChild[] };

const NAV: NavEntry[] = [
  {
    id: 'sidebar-nav-dashboard',
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    isActive: (p) => p === '/' || p === '/dashboard',
    group: 'work',
    needs: 'dashboard.viewOwnBranch',
  },
  {
    id: 'sidebar-nav-records',
    href: '/inspections',
    label: 'Inspections',
    icon: ClipboardList,
    // Every inspection screen lives under here, including a report being read
    isActive: (p) => p.startsWith('/inspections'),
    group: 'work',
    /*
     * The list narrows itself to the records you may see, so for most roles
     * this row needs no rule of its own. It carries one for the role that
     * would otherwise be offered a list narrowed to nothing.
     */
    needs: 'inspections.browse',
  },
  {
    id: 'sidebar-nav-maintenance',
    href: '/maintenance',
    label: 'Maintenance',
    icon: Wrench,
    isActive: (p) => p.startsWith('/maintenance'),
    group: 'work',
    /*
     * Two standings reach this section, and they are not the same size. The
     * admin and the maintenance manager hold all of it, and may act on it. A
     * branch manager and an inspector read all of it and may raise a problem
     * on it, for their own branches — every page here is narrowed to those
     * before it counts a figure or renders a row.
     */
    needs: ['maintenance.view', 'maintenance.report', 'equipment.manage'],
    children: [
      {
        id: 'sidebar-nav-maintenance-overview',
        href: '/maintenance',
        label: 'Overview',
        isActive: (p) => p === '/maintenance',
        needs: ['maintenance.view', 'maintenance.report'],
      },
      {
        id: 'sidebar-nav-maintenance-jobs',
        href: '/maintenance/jobs',
        label: 'Job board',
        /*
         * A job opened from the board still counts as being on it, and so
         * does the old /maintenance/schedule, which now redirects here. The
         * section's other pages are their own rows and must not light this
         * one, hence the two they are excluded by name.
         */
        isActive: (p) =>
          p === '/maintenance/jobs' ||
          /^\/maintenance\/(?!report$|equipment$)[^/]+$/.test(p),
        needs: ['maintenance.view', 'maintenance.report'],
      },
      {
        id: 'sidebar-nav-maintenance-equipment',
        href: '/maintenance/equipment',
        label: 'Appliances',
        isActive: (p) => p === '/maintenance/equipment',
        // A branch sees its own register; changing it is a separate right
        needs: ['maintenance.view', 'maintenance.report'],
      },
      /*
       * No Schedule row. The servicing schedule is what puts half the board
       * there, so it is a tab on the board and read against it rather than
       * being a separate place to go and remember to look at.
       */
      {
        id: 'sidebar-nav-maintenance-report',
        href: '/maintenance/report',
        label: 'Month-end report',
        isActive: (p) => p === '/maintenance/report',
        needs: ['maintenance.view', 'maintenance.report'],
      },
    ],
  },
  {
    // Configures the app rather than recording work, so it sits below a rule.
    // The rule alone says that — a "Setup" heading over two rows was more
    // label than list.
    id: 'sidebar-nav-checklist',
    href: '/checklist',
    label: 'Checklist',
    icon: ListChecks,
    isActive: (p) => p === '/checklist',
    group: 'setup',
    needs: 'checklist.manage',
  },
  {
    id: 'sidebar-nav-users',
    href: '/users',
    label: 'Users',
    icon: Users,
    isActive: (p) => p.startsWith('/users'),
    group: 'setup',
    needs: 'users.manage',
  },
];

/**
 * The left rail: the brand and the four screens.
 *
 * Deliberately nothing else of use. Sign-out lives in the top bar's user menu
 * and starting an inspection is offered by the screens that list them, so a
 * second copy of either here was only ever something more to read past. The
 * one line at its foot only names the product, so the column ends rather
 * than running out.
 *
 * Collapses to an icon-only column. Kept in storage so it survives a reload —
 * a rail someone deliberately narrowed should not spring open again on the
 * next page load. Only applies from `md` up; below that the rail is a top bar
 * and there is nothing to collapse.
 */
const COLLAPSE_KEY = 'inspection_log_sidebar_collapsed';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const user = useCurrentUser();

  /*
   * Rows the signed-in account cannot use are not shown at all, rather than
   * shown and refused. An inspector's rail is one row — their visits — which
   * is the whole of what the system asks of them.
   *
   * A section's pages are narrowed by the same rule, and the row is then
   * pointed at the first one left rather than at a fixed page: a section
   * whose usual landing page is out of reach still has to lead somewhere the
   * account can go. Maintenance no longer needs that — every role that
   * reaches the section reaches its overview — but the Schedule tab and the
   * rows above still turn on what an account holds, and a page put out of
   * reach later should not strand the row pointing at it.
   */
  const entries: ResolvedEntry[] = NAV.filter((entry) => holds(user, entry.needs)).map(
    (entry) => {
      const children = entry.children?.filter((child) => holds(user, child.needs)) ?? [];
      return { ...entry, children, href: children[0]?.href ?? entry.href };
    }
  );

  /*
   * The open section, which below `md` is the only thing that decides what
   * the second row of the top bar shows. On the rail proper a section's pages
   * hang under it and every section can be opened at once; a top bar has one
   * line to give them, so it gives it to the section you are standing in.
   */
  const openSection = entries.find((entry) => entry.isActive(pathname));

  const sectionsRef = useRef<HTMLElement>(null);
  const pagesRef = useRef<HTMLElement>(null);
  useActiveInView(sectionsRef, pathname);
  useActiveInView(pagesRef, pathname);

  /*
   * Read straight in the initialiser rather than in an effect. Safe here
   * because AppShell renders nothing until it has mounted, so this component
   * never server-renders and there is no hydration mismatch to cause.
   */
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((wasCollapsed) => {
      const next = !wasCollapsed;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // Storage unavailable; the rail still collapses for this session
      }
      return next;
    });
  };

  return (
    <aside
      id="main-sidebar"
      data-collapsed={collapsed}
      /*
       * The ground is two layers in one background: a light falling from the
       * top-left corner over a vertical run from the brand red down to its
       * deepest step. Enough that the rail reads as a surface rather than a
       * flat swatch, not so much that it competes with the page for the eye.
       */
      className={`no-print relative w-full text-white flex flex-col md:min-h-screen md:sticky md:top-0 md:h-screen shrink-0 select-none z-30 bg-[radial-gradient(140%_45%_at_0%_0%,rgba(255,255,255,0.13),transparent_70%),linear-gradient(180deg,#B51C28_0%,#A21A24_45%,#8E141D_100%)] md:shadow-[inset_-1px_0_0_rgba(0,0,0,0.14),4px_0_24px_-12px_rgba(60,4,10,0.35)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        collapsed ? 'md:w-[4.75rem]' : 'md:w-[16rem]'
      }`}
    >
      <div
        /*
         * Two rows on desktop, reversed so the toggle takes the top one: laid
         * out side by side, the toggle ate into the width the logo centred
         * itself in, leaving the mark sitting visibly left of the rail's
         * centre line. Given its own row it stops competing for that width,
         * and the logo can centre on the rail itself.
         *
         * Where the toggle lands on that row is the one thing the two states
         * differ on — the corner when there is a corner to speak of, the
         * centre line once the rail is too narrow for a corner to read as
         * placement rather than an accident.
         */
        className={`px-4 pt-4 pb-3 flex items-center gap-2 md:flex-col-reverse ${
          collapsed
            ? 'md:px-2 md:pt-3 md:pb-5 md:gap-3'
            : 'md:px-5 md:pt-3 md:pb-6 md:gap-2'
        }`}
      >
        <Link
          href="/dashboard"
          className="block min-w-0 flex-1 cursor-pointer md:w-full md:flex-none transition-opacity hover:opacity-90"
          id="brand-logo-btn"
          title="Gujrat Group — Dashboard"
        >
          {/*
            Reversed out of the rail rather than boxed on a white plate. The
            wordmark goes when the rail narrows — shrunk to 4.75rem it would
            be an unreadable smudge, so only the mark stays.
          */}
          <BrandLogo
            variant={collapsed ? 'emblem' : 'knockout'}
            className={
              collapsed
                ? 'w-full max-w-[8rem] md:max-w-[2.6rem] md:mx-auto'
                : 'w-full max-w-[8rem] md:max-w-[12rem] md:mx-auto'
            }
          />
        </Link>

        <button
          type="button"
          id="sidebar-collapse-btn"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="main-sidebar"
          title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          className={`hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer shrink-0 ${
            collapsed ? '' : 'md:self-end'
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-[18px] h-[18px]" />
          ) : (
            <PanelLeftClose className="w-[18px] h-[18px]" />
          )}
        </button>
      </div>

      {/*
        `layoutScroll` because below `md` this row scrolls sideways, and the
        active pill has to be measured against that scroll rather than against
        the page, or it would glide in from where the row used to be.
      */}
      <motion.nav
        ref={sectionsRef}
        layoutScroll
        className={`flex-1 pb-3 md:pb-5 flex md:flex-col gap-1 md:gap-0 overflow-x-auto md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          collapsed ? 'px-3 md:px-2.5' : 'px-3 md:px-4'
        }`}
      >
        <div className="flex md:flex-col gap-1 w-full">
          {entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
              {index > 0 && entries[index - 1].group !== entry.group && (
                <span
                  className="hidden md:block h-px my-3.5 mx-1 bg-gradient-to-r from-white/0 via-white/25 to-white/0"
                  aria-hidden
                />
              )}
              <NavItem
                entry={entry}
                active={entry.isActive(pathname)}
                pathname={pathname}
                collapsed={collapsed}
              />
            </React.Fragment>
          ))}
        </div>
      </motion.nav>

      {/*
        A section's pages, on a phone.

        The rail hangs them under the section and hides them below `md`,
        which on a phone left them with no way in at all — the top bar shows
        sections only, so the appliance register, the job board and the
        month-end report could be reached by typing the address and by
        nothing else. They get the row under the sections instead, for the
        one section you are actually in, which is the only one whose pages
        are any use to you.
      */}
      {openSection && openSection.children.length > 1 && (
        <motion.nav
          ref={pagesRef}
          layoutScroll
          aria-label={`${openSection.label} pages`}
          className="md:hidden flex gap-1.5 px-3 pb-3 -mt-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {openSection.children.map((child) => {
            const childActive = child.isActive(pathname);
            return (
              <Link
                key={child.id}
                href={child.href}
                aria-current={childActive ? 'page' : undefined}
                className={`relative shrink-0 px-3.5 h-8 inline-flex items-center rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                  childActive
                    ? 'text-[#A81823]'
                    : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/[0.18]'
                }`}
              >
                {childActive && (
                  <motion.span
                    layoutId="sidebar-active-page-phone"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-white shadow-[0_4px_12px_-4px_rgba(60,4,10,0.45)]"
                    transition={SPRING}
                  />
                )}
                <span className="relative">{child.label}</span>
              </Link>
            );
          })}
        </motion.nav>
      )}

      {/*
        The foot of the rail. Names the product and nothing more — no link,
        no control — so it reads as the end of the column rather than one
        more row to wonder about. Gone when the rail narrows and on a phone,
        where there is no room for a line that does nothing.
      */}
      {!collapsed && (
        <div className="hidden md:flex items-center gap-2.5 mx-4 mb-5 pt-4 border-t border-white/10 text-white/55">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block text-[11px] font-bold text-white/80">Inspection Log</span>
            <span className="block text-[10px] truncate">Food safety &amp; quality</span>
          </span>
        </div>
      )}
    </aside>
  );
};

/**
 * Below `md` both rows of the top bar scroll sideways, and the section you
 * are in could sit past the right-hand edge — on a phone, Maintenance and
 * its pages started off-screen. So whenever the page changes, a row that
 * scrolls brings its current item into view. A row that does not scroll, the
 * rail from `md` up, already shows everything and is left alone.
 */
function useActiveInView(ref: React.RefObject<HTMLElement | null>, pathname: string) {
  useEffect(() => {
    const row = ref.current;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const item = row.querySelector<HTMLElement>('[aria-current="page"]');
    if (!item) return;
    const bounds = row.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.left >= bounds.left && box.right <= bounds.right) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollBy({ left: box.left - bounds.left - 12, behavior: reduced ? 'auto' : 'smooth' });
  }, [ref, pathname]);
}

/**
 * One nav row.
 *
 * The active row sits on a white pill with its icon in a tinted tile, which is
 * what marks it — not a shift in position, so the label sits in the same
 * place whichever screen you are on. The pill is one shared element that
 * glides from the row you left to the row you chose, so the eye follows the
 * move instead of hunting for where the highlight went.
 */
const NavItem: React.FC<{
  entry: ResolvedEntry;
  active: boolean;
  pathname: string;
  collapsed: boolean;
}> = ({ entry, active, pathname, collapsed }) => {
  const { href, id, label, icon: Icon, children } = entry;

  /*
   * A submenu of one is furniture — the row already leads to that page, and
   * the chevron would promise a choice there is none of. So a section only
   * opens where its pages outnumber the row.
   */
  const hasSubmenu = children.length > 1;

  /*
   * A section opens itself when you are inside it, and can be opened from
   * outside to jump straight to one of its pages. State rather than derived
   * from the route, so closing it by hand sticks while you are still in it.
   */
  const [expanded, setExpanded] = useState(active);

  // Arriving in the section from anywhere — a link on another screen, the top
  // bar, the back button — opens it, not just clicking the row itself.
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  return (
    <div className="shrink-0 md:shrink">
      <div className="flex items-center">
        <Link
          id={id}
          href={href}
          aria-current={active ? 'page' : undefined}
          onClick={() => hasSubmenu && setExpanded(true)}
          // Collapsed, the label is gone, so the title carries it on hover
          title={collapsed ? label : undefined}
          className={`group relative flex-1 min-w-0 flex items-center gap-3 h-11 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors duration-200 cursor-pointer pl-1.5 pr-3 ${
            collapsed ? 'md:justify-center md:px-0' : ''
          } ${active ? 'text-[#A81823]' : 'text-white/75 hover:text-white hover:bg-white/[0.08]'}`}
        >
          {active && (
            <motion.span
              layoutId="sidebar-active-row"
              aria-hidden
              className="absolute inset-0 rounded-xl bg-white shadow-[0_8px_20px_-8px_rgba(60,4,10,0.55)]"
              transition={SPRING}
            />
          )}
          <span
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200 ${
              active
                ? 'bg-[#FDECEE] text-[#C8202D]'
                : 'bg-white/10 text-white/85 group-hover:bg-white/15 group-hover:text-white'
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <span className={`relative ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
        </Link>

        {/*
          The submenu chevron goes when the rail narrows: there is no room for
          it, and no room for the pages it would reveal either.
        */}
        {hasSubmenu && !collapsed && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${label} pages`}
            className="hidden md:flex w-8 h-8 ml-1 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer shrink-0"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
      </div>

      {/*
        The pages open and close by height, and not at all on first paint —
        `initial={false}` — so a page load inside the section does not play
        the drawer opening every time.
      */}
      <AnimatePresence initial={false}>
        {hasSubmenu && expanded && !collapsed && (
          <motion.ul
            key="pages"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: t(0.28), ease: EASE_OUT }}
            className="hidden md:block overflow-hidden ml-[1.35rem] pl-3.5 border-l border-white/15"
          >
            <li aria-hidden className="h-1" />
            {children.map((child) => {
              const childActive = child.isActive(pathname);
              return (
                <li key={child.id} className="relative py-px">
                  {childActive && (
                    <motion.span
                      layoutId="sidebar-active-page"
                      aria-hidden
                      className="absolute -left-[calc(0.875rem+1.5px)] top-1.5 bottom-1.5 w-[2px] rounded-full bg-white"
                      transition={SPRING}
                    />
                  )}
                  <Link
                    id={child.id}
                    href={child.href}
                    aria-current={childActive ? 'page' : undefined}
                    className={`block px-2.5 py-1.5 rounded-lg text-[13px] whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                      childActive
                        ? 'bg-white/[0.14] text-white font-semibold'
                        : 'font-medium text-white/65 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
            <li aria-hidden className="h-1" />
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

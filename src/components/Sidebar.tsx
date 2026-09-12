'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  Wrench,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
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
     * admin and the maintenance manager hold all of it. A branch manager holds the
     * job board alone, to raise their branch's repairs on the day they find
     * them and to follow what becomes of them — so for them the section is a
     * single page, and the row leads straight to it.
     */
    needs: ['maintenance.view', 'maintenance.reportOwnBranch', 'equipment.manage'],
    children: [
      {
        id: 'sidebar-nav-maintenance-overview',
        href: '/maintenance',
        label: 'Overview',
        isActive: (p) => p === '/maintenance',
        needs: 'maintenance.view',
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
        needs: ['maintenance.view', 'maintenance.reportOwnBranch'],
      },
      {
        id: 'sidebar-nav-maintenance-equipment',
        href: '/maintenance/equipment',
        label: 'Equipment',
        isActive: (p) => p === '/maintenance/equipment',
        // A branch sees its own register; changing it is a separate right
        needs: ['maintenance.view', 'maintenance.reportOwnBranch'],
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
        needs: 'maintenance.view',
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
 * Deliberately nothing else. Sign-out lives in the top bar's user menu and
 * starting an inspection is offered by the screens that list them, so a
 * second copy of either here was only ever something more to read past.
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
   * account can go. Maintenance is where that earns its keep — the admin
   * lands on the overview, a branch manager on the job board, which is the
   * only page of it that is theirs.
   */
  const entries: ResolvedEntry[] = NAV.filter((entry) => holds(user, entry.needs)).map(
    (entry) => {
      const children = entry.children?.filter((child) => holds(user, child.needs)) ?? [];
      return { ...entry, children, href: children[0]?.href ?? entry.href };
    }
  );

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
      className={`no-print w-full bg-[#A81823] text-white flex flex-col md:min-h-screen md:sticky md:top-0 md:h-screen shrink-0 select-none z-30 transition-[width] duration-200 ${
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
        className={`px-4 py-4 flex items-center gap-2 md:flex-col-reverse ${
          collapsed
            ? 'md:px-2 md:pt-3 md:pb-5 md:gap-3'
            : 'md:px-5 md:pt-3 md:pb-6 md:gap-2'
        }`}
      >
        <Link
          href="/dashboard"
          className="block min-w-0 flex-1 cursor-pointer md:w-full md:flex-none"
          id="brand-logo-btn"
          title="Royal Gujrat — Dashboard"
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
                ? 'w-full max-w-[9rem] md:max-w-[2.6rem] md:mx-auto'
                : 'w-full max-w-[9rem] md:max-w-[12rem] md:mx-auto'
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
          className={`hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-white/70 hover:text-white hover:bg-white/12 transition-colors cursor-pointer shrink-0 ${
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

      <nav
        className={`flex-1 pb-3 md:pb-5 flex md:flex-col gap-1 md:gap-0 overflow-x-auto md:overflow-visible ${
          collapsed ? 'px-3 md:px-2.5' : 'px-3 md:px-4'
        }`}
      >
        <div className="flex md:flex-col gap-1 w-full">
          {entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
              {index > 0 && entries[index - 1].group !== entry.group && (
                <span className="hidden md:block h-px bg-white/15 my-3" aria-hidden />
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
      </nav>
    </aside>
  );
};

/**
 * One nav row.
 *
 * The active row is a filled panel with its icon in a tile of its own, which
 * is what marks it — not a shift in position, so the label sits in the same
 * place whichever screen you are on.
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
    <div>
      <div className="flex items-center">
        <Link
          id={id}
          href={href}
          aria-current={active ? 'page' : undefined}
          onClick={() => hasSubmenu && setExpanded(true)}
          // Collapsed, the label is gone, so the title carries it on hover
          title={collapsed ? label : undefined}
          className={`flex-1 min-w-0 flex items-center gap-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            collapsed ? 'md:justify-center md:px-0' : 'pl-2 pr-3'
          } ${
            active ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <span
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              active ? 'bg-white text-[#A81823]' : 'bg-white/10 text-white/80'
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <span className={collapsed ? 'md:hidden' : undefined}>{label}</span>
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
            className="hidden md:flex p-1.5 ml-0.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {hasSubmenu && expanded && !collapsed && (
        <ul className="hidden md:block mt-1 ml-[1.35rem] pl-3.5 border-l border-white/15 space-y-0.5">
          {children.map((child) => {
            const childActive = child.isActive(pathname);
            return (
              <li key={child.id}>
                <Link
                  id={child.id}
                  href={child.href}
                  aria-current={childActive ? 'page' : undefined}
                  className={`block px-2.5 py-1.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    childActive
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

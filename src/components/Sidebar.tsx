'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ClipboardList, LayoutDashboard, ListChecks, Wrench } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface NavEntry {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** True when the current path belongs to this section. */
  isActive: (pathname: string) => boolean;
  /** Draws a rule above this row, separating configuration from daily work. */
  startsGroup?: boolean;
  /** Pages within this section, revealed under it. */
  children?: { id: string; href: string; label: string; isActive: (p: string) => boolean }[];
}

const NAV: NavEntry[] = [
  {
    id: 'sidebar-nav-dashboard',
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    isActive: (p) => p === '/' || p === '/dashboard',
  },
  {
    id: 'sidebar-nav-records',
    href: '/inspections',
    label: 'Inspections',
    icon: ClipboardList,
    // Every inspection screen lives under here, including a report being read
    isActive: (p) => p.startsWith('/inspections'),
  },
  {
    id: 'sidebar-nav-maintenance',
    href: '/maintenance',
    label: 'Maintenance',
    icon: Wrench,
    isActive: (p) => p.startsWith('/maintenance'),
    children: [
      {
        id: 'sidebar-nav-maintenance-overview',
        href: '/maintenance',
        label: 'Overview',
        isActive: (p) => p === '/maintenance',
      },
      {
        id: 'sidebar-nav-maintenance-jobs',
        href: '/maintenance/jobs',
        label: 'Job board',
        // A job opened from the board still counts as being on it
        isActive: (p) =>
          p === '/maintenance/jobs' || /^\/maintenance\/(?!report$)[^/]+$/.test(p),
      },
      {
        id: 'sidebar-nav-maintenance-report',
        href: '/maintenance/report',
        label: 'Month-end report',
        isActive: (p) => p === '/maintenance/report',
      },
    ],
  },
  {
    // Configures the app rather than recording work, so it sits below a rule.
    // The rule alone says that — a "Setup" heading over a single row was more
    // label than list.
    id: 'sidebar-nav-checklist',
    href: '/checklist',
    label: 'Checklist',
    icon: ListChecks,
    isActive: (p) => p === '/checklist',
    startsGroup: true,
  },
];

/**
 * The left rail: the brand and the four screens.
 *
 * Deliberately nothing else. Sign-out lives in the top bar's user menu and
 * starting an inspection is offered by the screens that list them, so a
 * second copy of either here was only ever something more to read past.
 */
export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside
      id="main-sidebar"
      className="no-print w-full md:w-[16rem] bg-[#A81823] text-white flex flex-col md:min-h-screen md:sticky md:top-0 md:h-screen shrink-0 select-none z-30"
    >
      <div className="px-4 md:px-5 py-4 md:py-6">
        <Link
          href="/dashboard"
          className="block min-w-0 cursor-pointer"
          id="brand-logo-btn"
        >
          {/* Reversed out of the rail rather than boxed on a white plate */}
          <BrandLogo variant="knockout" className="w-full max-w-[9rem] md:max-w-[12rem] md:mx-auto" />
        </Link>
      </div>

      <nav className="flex-1 px-3 md:px-4 pb-3 md:pb-5 flex md:flex-col gap-1 md:gap-0 overflow-x-auto md:overflow-visible">
        <div className="flex md:flex-col gap-1 w-full">
          {NAV.map((entry) => (
            <React.Fragment key={entry.id}>
              {entry.startsGroup && (
                <span className="hidden md:block h-px bg-white/15 my-3" aria-hidden />
              )}
              <NavItem entry={entry} active={entry.isActive(pathname)} pathname={pathname} />
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
const NavItem: React.FC<{ entry: NavEntry; active: boolean; pathname: string }> = ({
  entry,
  active,
  pathname,
}) => {
  const { href, id, label, icon: Icon, children } = entry;

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
          onClick={() => children && setExpanded(true)}
          className={`flex-1 min-w-0 flex items-center gap-3 pl-2 pr-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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
          <span>{label}</span>
        </Link>

        {children && (
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

      {children && expanded && (
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

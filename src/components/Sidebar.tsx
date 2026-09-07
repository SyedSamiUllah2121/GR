'use client';

import React from 'react';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  Wrench,
} from 'lucide-react';
import {setAuthenticated} from '../services/storage';

interface NavEntry {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{className?: string}>;
  /** True when the current path belongs to this section. */
  isActive: (pathname: string) => boolean;
}

/** The day-to-day screens. */
const MAIN: NavEntry[] = [
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
  },
];

/** Screens that configure the app rather than record work. */
const SETUP: NavEntry[] = [
  {
    id: 'sidebar-nav-checklist',
    href: '/checklist',
    label: 'Checklist',
    icon: ListChecks,
    isActive: (p) => p === '/checklist',
  },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = () => {
    setAuthenticated(false);
    router.replace('/login');
  };

  return (
    <aside
      id="main-sidebar"
      className="no-print w-full md:w-64 bg-[#213B26] text-[#F5F3EC] flex flex-col md:min-h-screen shrink-0 shadow-lg select-none z-30"
    >
      {/* Brand */}
      <div className="p-4 md:p-6 border-b border-[#ffffff15] flex items-center justify-between md:block">
        <Link
          href="/dashboard"
          className="block text-left focus:outline-none cursor-pointer"
          id="brand-logo-btn"
        >
          <h1 className="text-xl font-bold tracking-tight text-[#F5F3EC]">Inspection Log</h1>
          <p className="text-[10px] uppercase tracking-widest opacity-60 mt-1">
            Weekly Hygiene &amp; Service
          </p>
        </Link>

        {/* Mobile quick actions, where there is no room for the full column */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            id="mobile-new-btn"
            href="/inspections/new"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[#2F5233] hover:bg-[#3d6a42] text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </Link>
          <button
            id="mobile-signout-btn"
            onClick={handleSignOut}
            className="p-1.5 opacity-60 hover:opacity-100 rounded-md transition-opacity text-[#F5F3EC]"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-3 md:px-4 py-3 md:py-5 flex md:flex-col gap-1 md:gap-0 overflow-x-auto md:overflow-visible">
        {/*
          The one action people come here to take. It is the only route to a new
          inspection in this column — it used to also appear as a nav item just
          below, which read as two different things.
        */}
        <Link
          id="sidebar-new-inspection-btn"
          href="/inspections/new"
          className="hidden md:flex w-full bg-[#2F5233] hover:bg-[#3d6a42] text-white py-2.5 px-4 rounded-md mb-5 font-semibold text-sm items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New inspection</span>
        </Link>

        <div className="flex md:flex-col gap-1 md:gap-0.5 w-full">
          {MAIN.map((entry) => (
            <NavItem key={entry.id} entry={entry} active={entry.isActive(pathname)} />
          ))}
        </div>

        <div className="hidden md:block mt-6 mb-3 border-t border-[#ffffff15] pt-4">
          <p className="px-3.5 text-[10px] font-bold uppercase tracking-widest opacity-40">
            Setup
          </p>
        </div>

        <div className="flex md:flex-col gap-1 md:gap-0.5 w-full">
          {SETUP.map((entry) => (
            <NavItem key={entry.id} entry={entry} active={entry.isActive(pathname)} />
          ))}
        </div>
      </nav>

      <div className="hidden md:block p-6 border-t border-[#ffffff15]">
        <button
          id="sidebar-signout-btn"
          onClick={handleSignOut}
          className="text-sm opacity-60 hover:opacity-100 flex items-center gap-2 transition-opacity text-[#F5F3EC] cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};

/**
 * One nav row.
 *
 * The left rule is drawn on every item and only coloured on the active one, so
 * the label sits in the same place whichever screen you are on — highlighting
 * the active item alone used to shift its text sideways.
 */
const NavItem: React.FC<{entry: NavEntry; active: boolean}> = ({entry, active}) => {
  const {href, id, label, icon: Icon} = entry;
  return (
    <Link
      id={id}
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors cursor-pointer md:border-l-4 ${
        active
          ? 'bg-[#ffffff15] md:border-[#F5F3EC] text-[#F5F3EC]'
          : 'md:border-transparent text-[#F5F3EC]/60 hover:text-[#F5F3EC] hover:bg-[#ffffff0a]'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
};

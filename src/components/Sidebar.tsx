'use client';

import React from 'react';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {ClipboardList, ListChecks, Plus, LogOut} from 'lucide-react';
import {setAuthenticated} from '../services/storage';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const isRecordsActive = pathname === '/' || pathname === '/inspections';
  const isNewActive = pathname === '/inspections/new';
  const isChecklistActive = pathname === '/checklist';

  const handleSignOut = () => {
    setAuthenticated(false);
    router.replace('/login');
  };

  return (
    <aside
      id="main-sidebar"
      className="no-print w-full md:w-64 bg-[#213B26] text-[#F5F3EC] flex flex-col md:min-h-screen shrink-0 shadow-lg select-none z-30"
    >
      {/* Brand Header */}
      <div className="p-4 md:p-6 border-b border-[#ffffff15] flex items-center justify-between md:block">
        <div>
          <Link
            href="/inspections"
            className="block text-left group focus:outline-none cursor-pointer"
            id="brand-logo-btn"
          >
            <h1 className="text-xl font-bold tracking-tight text-[#F5F3EC]">
              Inspection Log
            </h1>
            <p className="text-[10px] uppercase tracking-widest opacity-60 mt-1">
              Weekly Hygiene &amp; Service
            </p>
          </Link>
        </div>

        {/* Mobile quick action bar */}
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

      {/* Nav Area */}
      <nav className="flex-1 px-3 md:px-4 py-3 md:py-0 md:mt-6 flex md:flex-col gap-1 md:gap-0">
        {/* Desktop Main Action Button */}
        <Link
          id="sidebar-new-inspection-btn"
          href="/inspections/new"
          className="hidden md:flex w-full bg-[#2F5233] hover:bg-[#3d6a42] text-white py-3 px-4 rounded-md mb-6 md:mb-8 font-semibold text-sm items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span className="text-lg leading-none">+</span>
          <span>New Inspection</span>
        </Link>

        {/* Navigation Links */}
        <div className="flex md:flex-col gap-1 md:space-y-1 w-full">
          <Link
            id="sidebar-nav-records"
            href="/inspections"
            className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all cursor-pointer text-left ${
              isRecordsActive
                ? 'bg-[#ffffff15] border-l-4 border-[#F5F3EC] text-[#F5F3EC]'
                : 'opacity-60 hover:opacity-100 text-[#F5F3EC] transition-opacity'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span>Records</span>
          </Link>

          <Link
            id="sidebar-nav-new"
            href="/inspections/new"
            className={`hidden md:flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all cursor-pointer text-left ${
              isNewActive
                ? 'bg-[#ffffff15] border-l-4 border-[#F5F3EC] text-[#F5F3EC]'
                : 'opacity-60 hover:opacity-100 text-[#F5F3EC] transition-opacity'
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Inspection</span>
          </Link>
          <Link
            id="sidebar-nav-checklist"
            href="/checklist"
            className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all cursor-pointer text-left ${
              isChecklistActive
                ? 'bg-[#ffffff15] border-l-4 border-[#F5F3EC] text-[#F5F3EC]'
                : 'opacity-60 hover:opacity-100 text-[#F5F3EC] transition-opacity'
            }`}
          >
            <ListChecks className="w-4 h-4 shrink-0" />
            <span>Checklist</span>
          </Link>
        </div>
      </nav>

      {/* Bottom Sign Out */}
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

'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * The surfaces every screen is built from, so they read as one product.
 *
 * One card (white, a hairline border and a soft two-layer shadow, 16px
 * corners), one panel header (a neutral icon tile, a title, a caption and an
 * optional way on), and one page header. Colour is kept out of the furniture:
 * the brand red is for actions and the status colours are for states, so
 * neither is spent on decoration.
 */

export const CARD =
  'bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)]';

/** The surface every panel sits on: white, a hairline, and a soft two-layer shadow. */
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`${CARD} ${className}`}
  >
    {children}
  </div>
);

export const PanelHeader: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  caption?: string;
  action?: { href: string; label: string };
}> = ({ icon: Icon, title, caption, action }) => (
  <div className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      {Icon && (
        <span className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
          <Icon className="w-[18px] h-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-[#17181D] truncate">{title}</h2>
        {caption && <p className="text-xs text-[#6B6F76] mt-0.5 truncate">{caption}</p>}
      </div>
    </div>
    {action && (
      <Link
        href={action.href}
        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-bold text-[#17181D] bg-[#F4F5F7] hover:bg-[#EBEDF0] transition-colors shrink-0"
      >
        {action.label}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    )}
  </div>
);

export const Panel: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  caption?: string;
  /** Where the whole of this panel's subject lives, when it lives elsewhere. */
  action?: { href: string; label: string };
  children: React.ReactNode;
}> = ({ icon, title, caption, action, children }) => (
  <Card className="h-full flex flex-col">
    <PanelHeader icon={icon} title={title} caption={caption} action={action} />
    <div className="px-5 sm:px-6 pb-6 pt-1 flex-1">{children}</div>
  </Card>
);


/**
 * The top of a screen: an eyebrow, the title, a line saying what is on it,
 * and the screen's own actions on the right.
 */
export const PageHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions }) => (
  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA1A9]">{eyebrow}</p>
      )}
      <h1 className="mt-1.5 text-[26px] md:text-[30px] leading-tight font-bold tracking-tight text-[#17181D]">
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 text-[13px] text-[#6B6F76]">{subtitle}</p>}
    </div>
    {actions && <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/** Button looks, as class strings, so links and buttons can share them. */
export const BUTTON = {
  primary:
    'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold shadow-[0_6px_16px_-8px_rgba(200,32,45,0.6)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0 cursor-pointer',
  dark: 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-[#17181D] hover:bg-black text-white text-xs font-bold shadow-[0_6px_16px_-8px_rgba(23,24,29,0.6)] transition-all hover:-translate-y-px cursor-pointer',
  secondary:
    'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-[#E4E6EB] bg-white text-xs font-bold text-[#17181D] shadow-xs transition-all hover:-translate-y-px hover:shadow-md cursor-pointer',
} as const;

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
 * neither is spent on decoration — with one exception, the brand's diagonals
 * in the corner of the page header's banner, which are the brand and say
 * nothing about state.
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
 * The banner's background: a kitchen at work, already faded to white on the
 * left and cut by the brand's red diagonals on the right. A web-sized copy
 * of `docs/brand/page-banner-original.png`; re-export from that if it
 * changes. Set to null and the banner draws its own diagonals instead.
 */
const BANNER_PHOTO: string | null = '/brand/page-banner.jpg';

/**
 * The top of a screen, as a banner: an eyebrow, the title and a line saying
 * what is on it on the left, and a kitchen and the brand's diagonals behind
 * the right-hand side, with the screen's own actions over them.
 *
 * Nothing else is written over the photograph. A "Safe Food. Happy
 * Customers." strapline sat in the middle and could not be read against
 * the kitchen behind it; the buttons have a tray of their own.
 *
 * One component for every screen, so the banner is the same everywhere and
 * changes in one place.
 */
export const PageHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions }) => (
  <div className="relative overflow-hidden rounded-2xl bg-white border border-[#E8E9EE] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)]">
    <BannerArt />

    <div className="relative flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8 px-5 sm:px-7 py-6 lg:py-7">
      <div className="min-w-0 lg:flex-1">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA1A9]">{eyebrow}</p>
        )}
        <h1 className="mt-1.5 text-[26px] md:text-[30px] leading-tight font-bold tracking-tight text-[#17181D]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-[#6B6F76]">{subtitle}</p>}
      </div>

      {/*
        The buttons sit on a white tray over the photograph. On the bare
        picture a red button vanished into the red diagonal behind it, and
        no one button colour reads against both the kitchen and the red.
        Opaque rather than frosted: a backdrop filter would become the
        containing block for any dialog these buttons open.
      */}
      {actions && (
        <div className="shrink-0 self-start lg:self-center flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-white/95 ring-1 ring-black/5 shadow-[0_10px_28px_-12px_rgba(16,24,40,0.35)]">
          {actions}
        </div>
      )}
    </div>
  </div>
);

/**
 * The banner's background. With the photograph, the photograph alone — it
 * carries its own fade and diagonals — pinned to its right edge so the red
 * always shows whatever the banner's width; on a phone it keeps to the right,
 * faded in from the left, so the title stays on white. Without it, a pale fade, a faint emblem and
 * the diagonals drawn here. Left out of print either way: a report printed
 * from a screen wants its heading, not the art.
 */
const BannerArt: React.FC = () =>
  BANNER_PHOTO ? (
    <div
      aria-hidden
      className="no-print pointer-events-none absolute inset-y-0 right-0 w-[42%] sm:w-full [mask-image:linear-gradient(to_right,transparent,black_60%)] sm:[mask-image:none]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a decorative photograph, not content */}
      <img src={BANNER_PHOTO} alt="" className="w-full h-full object-cover object-right" />
    </div>
  ) : (
    <div
      aria-hidden
      className="no-print pointer-events-none absolute inset-y-0 right-0 w-[34%] sm:w-[50%] lg:w-[46%]"
    >
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(255,255,255,0)_0%,#FBF1F2_55%,#F6E2E4_100%)]" />
      {/* eslint-disable-next-line @next/next/no-img-element -- a decorative watermark, not content */}
      <img
        src="/brand/gujrat-group-emblem.png"
        alt=""
        className="hidden sm:block absolute right-[18%] top-1/2 -translate-y-1/2 w-40 opacity-[0.07] grayscale"
      />
      <div className="absolute -right-6 bottom-0 h-full w-40 bg-[#C8202D] [clip-path:polygon(70%_0,100%_0,100%_100%,25%_100%)] opacity-90" />
      <div className="absolute right-24 bottom-0 h-full w-24 bg-[#8E1520] [clip-path:polygon(85%_0,100%_0,30%_100%,15%_100%)] opacity-80" />
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

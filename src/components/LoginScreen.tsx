'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { motion } from 'motion/react';
import { BrandLogo } from './BrandLogo';
import { EASE_OUT, MotionProvider, t } from './motion';
import { ORGANISATION } from '../data/user';
import { USER_ROLE_BLURB, USER_ROLE_KEYS, USER_ROLE_LABEL, User, branchesOf } from '../types';
import { DEMO_SIGN_IN_ENABLED, signIn, signInAs } from '../services/session';
import { homePathFor } from '../services/permissions';
import { activeUsers } from '../services/userStore';
import { useUsers } from '../hooks/useUsers';
import { useMounted } from '../hooks/useMounted';
import { useRouter } from 'next/navigation';

/**
 * Sign-in.
 *
 * Split layout: the brand holds the left half at desktop width, the form the
 * right. Below `lg` the panel is dropped rather than stacked — on a phone it
 * would push the fields below the fold, and signing in is the only reason
 * anyone is here.
 */

/**
 * The photograph behind the sign-in panel, tried in order.
 *
 * Empty while there is no photograph in `public/brand/`, so the panel draws
 * its warm dark ground without asking the server for files that are not
 * there — each of those probes was a 404 in the console on every sign-in.
 * Put a picture of the food at `public/brand/login-bg.jpg` and list it here.
 */
const BACKDROP_SOURCES: string[] = [];

const LoginBackdrop: React.FC = () => {
  const [stage, setStage] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  /*
   * Advancing past a named index rather than incrementing: the mount check
   * below and a late `onError` can both report the same source failing, and a
   * blind increment would skip a candidate.
   */
  const failed = (index: number) => setStage((s) => (s === index ? index + 1 : s));

  /*
   * This screen is server-rendered, so the browser requests the image and
   * gives up on it before React hydrates — `onError` is attached too late to
   * ever hear about it, and a broken image sat in the corner of the panel. A
   * finished request with no intrinsic width is that missed failure.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) failed(stage);
  }, [stage]);

  if (stage >= BACKDROP_SOURCES.length) {
    /*
     * No photograph on disk. A near-black panel reads as a page that failed
     * to load, so the ground is a deep warm gradient instead — deliberate on
     * its own, and completely covered the moment an image is dropped in.
     *
     * Two quiet layers over it give the ground some depth: a fine dot grid
     * that fades out down the panel, and a low warm glow in the far corner.
     * Neither is drawn over a photograph — that already has depth of its own.
     */
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(130% 110% at 18% -5%, #7E2A22 0%, #4A1A1C 38%, #241417 68%, #0E0B0C 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 70%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="absolute -bottom-48 -right-40 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(closest-side, #C8202D, transparent)' }}
        />
      </>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a decorative backdrop, not content */}
      <img
        key={BACKDROP_SOURCES[stage]}
        src={BACKDROP_SOURCES[stage]}
        alt=""
        aria-hidden
        ref={imgRef}
        onError={() => failed(stage)}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/*
        Black fade, and only over the photograph — the gradient ground above
        is already dark enough to read on, and darkening it too crushed it to
        a near-black slab that looked like a page that had failed to load.

        Two layers: a flat veil that guarantees a floor of darkness wherever
        the picture happens to be bright, and a gradient weighted to the left
        where the copy sits. One gradient alone was not enough — a spread of
        food is bright and busy everywhere, not conveniently dark on one side.

        Black rather than a brand tint, which would drain the colour out of
        the very photograph it is meant to be showing.
      */}
      <div aria-hidden className="absolute inset-0 bg-black/45" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(100deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.62) 45%, rgba(0,0,0,0.30) 100%)',
        }}
      />
      {/* Grounds the footer line against a bright patch of photo */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-44"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0) 100%)',
        }}
      />
    </>
  );
};

/** What the product does, said briefly beside the form. */
const HIGHLIGHTS = [
  { icon: ClipboardCheck, text: 'Weekly hygiene and service checks, every branch on the same list' },
  { icon: Wrench, text: 'Failed equipment checks raise a maintenance job on submit' },
  { icon: TrendingUp, text: 'Scores, repeat issues and overdue visits tracked per branch' },
];

export const LoginScreen: React.FC = () => {
  const router = useRouter();
  /*
   * This screen sits outside the app shell, so unlike every other screen it
   * renders on the server as well — which makes the mount flag its own
   * responsibility rather than the shell's.
   */
  const mounted = useMounted();
  const users = activeUsers(useUsers());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /*
   * Where signing in lands depends on who signed in. An admin and a branch
   * manager both get a dashboard; an inspector has none — the visits they
   * have been assigned are their home, and the whole of their job here.
   */
  const enter = (user: User) => {
    setErrorMessage('');
    router.push(homePathFor(user));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = signIn(email, password);
    if (result.ok && result.user) {
      enter(result.user);
    } else {
      setErrorMessage(result.error ?? 'Incorrect username or password');
    }
  };

  const fillDemo = () => {
    setEmail('123');
    setPassword('123');
    setErrorMessage('');
  };

  /*
   * One example account per role, for the switcher below the form. Signing in
   * as each in turn is the only way to see what the roles actually do, and
   * making that require a remembered password per role got in the way of the
   * thing being demonstrated.
   *
   * Taken from the role list rather than named here, so a role added to the
   * system turns up in the switcher instead of being the one nobody can try.
   * Withdrawn accounts are skipped — offering a button that the sign-in it
   * calls will refuse is worse than offering nothing.
   */
  const demoAccounts = DEMO_SIGN_IN_ENABLED
    ? USER_ROLE_KEYS.map((role) => users.find((u) => u.role === role && u.active)).filter(
        (u): u is User => !!u
      )
    : [];

  const enterAs = (userId: string) => {
    const result = signInAs(userId);
    if (result.ok && result.user) {
      enter(result.user);
    } else {
      setErrorMessage(result.error ?? 'Could not sign in as that account');
      // The banner is above the form, and on a phone these buttons are below it
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fieldClass =
    'w-full h-11 pl-11 pr-4 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs hover:border-[#D5D8DE] focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow] duration-200';

  return (
    /*
     * This screen sits outside the app shell, so it brings its own motion
     * settings: the same reduced-motion rule the shell applies, which turns
     * the entrance below into a plain appearance for anyone who asked their
     * device for less movement.
     */
    <MotionProvider>
    <div className="min-h-screen flex bg-white">
      {/* Brand half */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative bg-[#0C0B0C] text-white flex-col justify-between gap-10 p-10 xl:p-14 overflow-hidden">
        <LoginBackdrop />

        {/*
          The entrance here is CSS, not motion. This page is rendered on the
          server, and a motion entrance starts at opacity 0 until the script
          runs — a blank sign-in page on a slow first load. A keyframe runs as
          soon as the stylesheet does, and is off for reduced motion.
        */}
        <div className="relative animate-rise">
          <BrandLogo variant="knockout" className="w-[13rem]" />
        </div>

        <div className="relative max-w-md">
          <p
            style={{ animationDelay: `${t(0.06)}s` }}
            className="animate-rise inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur-sm text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Inspection Log
          </p>

          <h2
            style={{ animationDelay: `${t(0.12)}s` }}
            className="animate-rise mt-6 text-[2.1rem] xl:text-[2.6rem] font-bold leading-[1.12] tracking-tight"
          >
            Every branch.
            <br />
            Every week.
            <br />
            <span className="text-white/60">On record.</span>
          </h2>

          <ul className="mt-10 space-y-3">
            {HIGHLIGHTS.map((item, i) => (
              <li
                key={item.text}
                style={{ animationDelay: `${t(0.18 + i * 0.06)}s` }}
                className="animate-rise flex items-center gap-3.5 rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 backdrop-blur-sm px-4 py-3"
              >
                <span className="w-9 h-9 rounded-xl bg-white/[0.12] ring-1 ring-inset ring-white/15 flex items-center justify-center shrink-0">
                  <item.icon className="w-[18px] h-[18px]" />
                </span>
                <span className="text-[13px] text-white/85 leading-relaxed">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p
          style={{ animationDelay: `${t(0.35)}s` }}
          className="animate-rise relative text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45"
        >
          {ORGANISATION.name} — {ORGANISATION.tagline}
        </p>
      </div>

      {/* Form half */}
      <div className="relative flex-1 min-w-0 flex flex-col justify-center items-center px-5 sm:px-8 py-12 bg-[radial-gradient(90%_60%_at_100%_0%,#FBF3F4_0%,rgba(255,255,255,0)_60%)]">
        <div className="w-full max-w-[24rem] animate-rise" style={{ animationDelay: `${t(0.08)}s` }}>
          {/*
            The brand panel is gone at this width, so the mark comes inline —
            reversed out of the rail's own red, so a phone signs in to the
            same brand it will see across the top of every screen after.
          */}
          <div className="lg:hidden mb-8 inline-flex rounded-2xl px-4 py-3.5 bg-[radial-gradient(140%_80%_at_0%_0%,rgba(255,255,255,0.14),transparent_70%),linear-gradient(160deg,#B51C28_0%,#8E141D_100%)] shadow-[0_12px_28px_-14px_rgba(142,20,29,0.7)]">
            <BrandLogo variant="knockout" className="w-[9.5rem]" />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA1A9]">
            Welcome back
          </p>
          <h1 className="mt-1.5 text-[1.85rem] leading-tight font-bold tracking-tight text-[#17181D]">
            Sign in
          </h1>
          <p className="text-[13px] text-[#6B6F76] mt-1.5">
            Inspection Log — food safety &amp; quality
          </p>

          {errorMessage && (
            <motion.div
              id="login-error-banner"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: t(0.25), ease: EASE_OUT }}
              className="mt-6 px-3.5 py-3 rounded-xl bg-[#FDECEE] border border-[#C8202D]/20 text-[#A81823] text-[13px] font-semibold flex items-center gap-2.5"
            >
              <span className="w-7 h-7 rounded-lg bg-white/70 text-[#C8202D] flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </span>
              <span>{errorMessage}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className="block text-xs font-semibold text-[#17181D] mb-2"
              >
                Email or username
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#9CA1A9] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="email-input"
                  type="text"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Enter your email or username"
                  className={fieldClass}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-semibold text-[#17181D] mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#9CA1A9] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Enter your password"
                  className={`${fieldClass} pr-11`}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA1A9] hover:text-[#17181D] hover:bg-[#F4F5F7] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="group w-full mt-2 h-11 px-4 bg-[#C8202D] hover:bg-[#A81823] text-white text-sm font-bold rounded-xl shadow-[0_8px_20px_-8px_rgba(200,32,45,0.65)] hover:shadow-[0_12px_24px_-10px_rgba(200,32,45,0.7)] hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer inline-flex items-center justify-center gap-2"
            >
              Sign in
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </form>

          {/*
            Demo access. The three roles see genuinely different systems, so
            the way to understand them is to sign in as each — which is what
            these do. Real addresses and passwords work in the form above.
          */}
          {/*
            The whole demo half of this screen, present only in a build that
            asked for it. Hiding the buttons but leaving the heading and the
            "Use 123 / 123" shortcut would advertise a door that is locked, and
            the shortcut itself is one of the two doors.
          */}
          {DEMO_SIGN_IN_ENABLED && (
          <div className="mt-8 pt-6 border-t border-[#F0F1F4]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA1A9]">
                Or sign in as
              </p>
              <button
                type="button"
                onClick={fillDemo}
                className="text-[11px] font-bold text-[#C8202D] hover:text-[#A81823] hover:underline underline-offset-2 cursor-pointer whitespace-nowrap"
              >
                Use 123 / 123
              </button>
            </div>

            {/*
              The accounts come from localStorage, which the server does not
              have — there it falls back to the seed list, and any account the
              operator has since renamed, added or withdrawn makes the two
              disagree. So nothing account-shaped is rendered until the client
              has mounted, and the rows below hold the space until it has.
            */}
            {!mounted && (
              <div className="mt-3 space-y-2">
                {USER_ROLE_KEYS.map((role) => (
                  <div
                    key={role}
                    aria-hidden="true"
                    className="w-full h-[3.75rem] px-3 rounded-xl border border-[#E8E9EE] bg-white flex items-center gap-3"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#F4F5F7] shrink-0 animate-pulse motion-reduce:animate-none" />
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="block h-3 w-24 rounded bg-[#F4F5F7] animate-pulse motion-reduce:animate-none" />
                      <span className="block h-2.5 w-40 rounded bg-[#F4F5F7] animate-pulse motion-reduce:animate-none" />
                    </span>
                  </div>
                ))}
              </div>
            )}

            {mounted && (
              <motion.div
                className="mt-3 space-y-2"
                variants={enterGroup}
                initial="hidden"
                animate="shown"
              >
                {demoAccounts.map((account) => (
                  <motion.button
                    key={account.id}
                    variants={enterItem}
                    type="button"
                    id={`login-as-${account.role}`}
                    onClick={() => enterAs(account.id)}
                    className="w-full h-[3.75rem] px-3 rounded-xl border border-[#E8E9EE] bg-white shadow-xs hover:border-[#E3B7BC] hover:shadow-[0_8px_18px_-10px_rgba(16,24,40,0.2)] hover:-translate-y-px transition-[border-color,box-shadow,translate] duration-200 cursor-pointer flex items-center gap-3 text-left group"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#F4F5F7] text-[#C8202D] text-[11px] font-bold flex items-center justify-center shrink-0 group-hover:bg-[#C8202D] group-hover:text-white transition-colors duration-200">
                      {account.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-[#17181D] truncate">
                        {USER_ROLE_LABEL[account.role]}
                        {branchesOf(account).length > 0 ? ` — ${branchesOf(account).join(' & ')}` : ''}
                      </span>
                      <span className="block text-[11px] text-[#6B6F76] truncate">
                        {USER_ROLE_BLURB[account.role]}
                      </span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#C9CCD2] shrink-0 group-hover:text-[#C8202D] group-hover:translate-x-0.5 transition-all duration-200" />
                  </motion.button>
                ))}
              </motion.div>
            )}
          </div>
          )}

          <p className="mt-8 text-center text-[11px] text-[#9CA1A9]">
            Internal weekly restaurant inspection system
          </p>
        </div>
      </div>
    </div>
    </MotionProvider>
  );
};

/*
 * The entrance: the brand copy and the account list arrive one line after
 * another, quickly, so the page reads top to bottom as it settles rather than
 * landing all at once.
 */
const enterGroup = {
  hidden: {},
  shown: { transition: { staggerChildren: t(0.06), delayChildren: t(0.12) } },
};
const enterItem = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: t(0.4), ease: EASE_OUT } },
};

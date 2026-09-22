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
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ORGANISATION } from '../data/user';
import { USER_ROLE_BLURB, USER_ROLE_KEYS, USER_ROLE_LABEL, User } from '../types';
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
 * Drop a picture of the food at any of these paths and it appears — no code
 * change. With none of them present the panel falls back to a warm dark
 * ground rather than a broken image, and still reads as intentional.
 */
const BACKDROP_SOURCES = [
  '/brand/login-bg.jpg',
  '/brand/login-bg.jpeg',
  '/brand/login-bg.png',
  '/brand/login-bg.webp',
];

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
     */
    return (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 110% at 18% -5%, #7E2A22 0%, #4A1A1C 38%, #241417 68%, #0E0B0C 100%)',
        }}
      />
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
      setErrorMessage(result.error ?? 'Incorrect email or password');
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
    }
  };

  const fieldClass =
    'w-full pl-11 pr-4 py-3 bg-[#F6F6F8] border border-[#E6E7EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:bg-white focus:border-[#C8202D] focus:ring-2 focus:ring-[#C8202D]/15 transition-colors';

  return (
    <div className="min-h-screen flex bg-white">
      {/* Brand half */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative bg-[#0C0B0C] text-white flex-col justify-between gap-10 p-10 xl:p-14 overflow-hidden">
        <LoginBackdrop />

        <div className="relative">
          <BrandLogo variant="knockout" className="w-[13rem]" />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[2.1rem] xl:text-[2.5rem] font-bold leading-[1.15] tracking-tight">
            Every branch.
            <br />
            Every week.
            <br />
            <span className="text-white/70">On record.</span>
          </h2>

          <ul className="mt-9 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-start gap-3.5">
                <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <item.icon className="w-[18px] h-[18px]" />
                </span>
                <span className="text-sm text-white/80 leading-relaxed pt-1.5">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          {ORGANISATION.name} — {ORGANISATION.tagline}
        </p>
      </div>

      {/* Form half */}
      <div className="flex-1 min-w-0 flex flex-col justify-center items-center px-5 sm:px-8 py-12">
        <div className="w-full max-w-[24rem]">
          {/* The brand panel is gone at this width, so the mark comes inline */}
          <div className="lg:hidden mb-8">
            <BrandLogo className="w-[15rem] border border-[#E6E7EB]" />
          </div>

          <h1 className="text-[1.7rem] font-bold tracking-tight text-[#17181D]">Sign in</h1>
          <p className="text-sm text-[#6B6F76] mt-1.5">
            Inspection Log — food safety &amp; quality
          </p>

          {errorMessage && (
            <div
              id="login-error-banner"
              role="alert"
              className="mt-6 p-3 rounded-xl bg-[#FDECEE] border border-[#C8202D]/25 text-[#C8202D] text-sm font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5"
              >
                Email
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
                  placeholder="Enter your email"
                  className={fieldClass}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#9CA1A9] hover:text-[#17181D] hover:bg-[#EFEFF2] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="w-full mt-2 py-3.5 px-4 bg-[#C8202D] hover:bg-[#A81823] active:scale-[0.99] text-white text-sm font-bold rounded-xl transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-sm"
            >
              Sign in
              <ArrowRight className="w-4 h-4" />
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
          <div className="mt-7 pt-6 border-t border-[#EFEFF2]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
                Or sign in as
              </p>
              <button
                type="button"
                onClick={fillDemo}
                className="text-[11px] font-bold text-[#C8202D] hover:underline cursor-pointer whitespace-nowrap"
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
            <div className="mt-3 space-y-2">
              {!mounted &&
                USER_ROLE_KEYS.map((role) => (
                  <div
                    key={role}
                    aria-hidden="true"
                    className="w-full p-3 rounded-xl border border-[#E6E7EB] bg-white flex items-center gap-3"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#F6F6F8] shrink-0" />
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="block h-3 w-24 rounded bg-[#F6F6F8]" />
                      <span className="block h-2.5 w-40 rounded bg-[#F6F6F8]" />
                    </span>
                  </div>
                ))}

              {mounted &&
                demoAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  id={`login-as-${account.role}`}
                  onClick={() => enterAs(account.id)}
                  className="w-full p-3 rounded-xl border border-[#E6E7EB] bg-white hover:border-[#C8202D]/40 hover:bg-[#FDF7F8] transition-colors cursor-pointer flex items-center gap-3 text-left group"
                >
                  <span className="w-9 h-9 rounded-full bg-[#F6F6F8] text-[#C8202D] text-[11px] font-bold flex items-center justify-center shrink-0 group-hover:bg-[#C8202D] group-hover:text-white transition-colors">
                    {account.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-[#17181D] truncate">
                      {USER_ROLE_LABEL[account.role]}
                      {account.branchName ? ` — ${account.branchName}` : ''}
                    </span>
                    <span className="block text-[11px] text-[#6B6F76] truncate">
                      {USER_ROLE_BLURB[account.role]}
                    </span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#9CA1A9] shrink-0 group-hover:text-[#C8202D] transition-colors" />
                </button>
              ))}
            </div>
          </div>
          )}

          <p className="mt-7 text-center text-[11px] text-[#9CA1A9]">
            Internal weekly restaurant inspection system
          </p>
        </div>
      </div>
    </div>
  );
};

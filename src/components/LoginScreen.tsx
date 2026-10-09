'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  Lock,
  LucideIcon,
  Mail,
  ShieldCheck,
  User as UserIcon,
  Users,
  Wrench,
} from 'lucide-react';
import { motion } from 'motion/react';
import { BrandLogo } from './BrandLogo';
import { EASE_OUT, MotionProvider, t } from './motion';
import { USER_ROLE_KEYS, USER_ROLE_LABEL, User, UserRole } from '../types';
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
     * to load, so the ground is a deep maroon gradient instead — deliberate
     * on its own, and completely covered the moment an image is dropped in.
     *
     * The emblem sits over it, very faint and cropped by the corner, to give
     * the ground some depth without competing with the copy. It is not drawn
     * over a photograph, which already has depth of its own.
     */
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 15% 0%, #5C0E18 0%, #3A0910 45%, #22060A 80%, #1A0507 100%)',
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- a decorative watermark, not content */}
        <img
          src="/brand/gujrat-group-emblem.png"
          alt=""
          aria-hidden
          className="absolute -bottom-24 -right-28 w-[34rem] max-w-none opacity-[0.035] brightness-0 invert pointer-events-none select-none"
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
  { icon: CalendarCheck, text: 'Weekly branch inspections' },
  { icon: Wrench, text: 'Failed checks trigger maintenance jobs' },
  { icon: BarChart3, text: 'Scores and repeat issues tracked by branch' },
];

/*
 * The demo buttons describe each role in the words of someone choosing which
 * one to try, which is shorter than the account screen's description of what
 * the role is allowed to do.
 */
const DEMO_ROLE: Record<UserRole, { icon: LucideIcon; blurb: string }> = {
  admin: { icon: UserIcon, blurb: 'Full control across branches and accounts' },
  'branch-manager': { icon: Users, blurb: 'Manage your branch and weekly inspections' },
  'job-manager': { icon: Wrench, blurb: 'Track repairs and maintenance jobs' },
  inspector: { icon: ClipboardCheck, blurb: 'Complete assigned inspections at any branch' },
};

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
    'w-full h-[clamp(2.5rem,6vh,3.5rem)] pl-[3.25rem] pr-4 bg-white border border-[#DAD7D2] rounded-lg text-[15px] text-[#17181D] placeholder:text-[#9CA1A9] hover:border-[#C9C5BF] focus:outline-none focus:border-[#8E1520] focus:ring-4 focus:ring-[#8E1520]/10 autofill:shadow-[inset_0_0_0_100px_#FFFFFF] autofill:[-webkit-text-fill-color:#17181D] transition-[border-color,box-shadow] duration-200';

  return (
    /*
     * This screen sits outside the app shell, so it brings its own motion
     * settings: the same reduced-motion rule the shell applies, which turns
     * the entrance below into a plain appearance for anyone who asked their
     * device for less movement.
     */
    <MotionProvider>
    <div className="relative min-h-screen bg-[#F8F6F2]">
      {/*
        The brand panel's ground is drawn on its own, behind both halves, so
        that the two halves can share one grid row. That row is as tall as the
        taller half, and the brand half spreads its content over it, so the
        logo lines up with "Welcome back" and the last feature with the last
        account button — two columns centred separately never quite met.
      */}
      <div
        aria-hidden
        className="hidden lg:block absolute inset-y-0 left-0 w-[46%] xl:w-1/2 overflow-hidden bg-[#1A0507]"
      >
        <LoginBackdrop />
      </div>

      {/*
        Sized against the window's height as well as its width, so the whole
        page fits on a laptop screen without scrolling.
      */}
      <div className="relative min-h-screen flex flex-col justify-center lg:grid lg:grid-cols-[46%_1fr] xl:grid-cols-2 lg:content-center py-[clamp(0.75rem,3vh,4rem)]">
      {/* Brand half */}
      <div className="hidden lg:flex text-white flex-col justify-between gap-[clamp(1.5rem,5vh,3.5rem)] px-10 xl:px-[4.5rem]">

        {/*
          The entrance here is CSS, not motion. This page is rendered on the
          server, and a motion entrance starts at opacity 0 until the script
          runs — a blank sign-in page on a slow first load. A keyframe runs as
          soon as the stylesheet does, and is off for reduced motion.
        */}
        <div className="relative animate-rise">
          <BrandLogo variant="lockup" large className="w-[clamp(19rem,46vh,29rem)]" />
        </div>

        <div className="relative max-w-[30rem]">
          <p
            style={{ animationDelay: `${t(0.06)}s` }}
            className="animate-rise inline-flex items-center gap-2.5 h-[clamp(2rem,4.4vh,2.5rem)] px-4 rounded-full ring-1 ring-inset ring-white/35 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/90"
          >
            <ShieldCheck className="w-4 h-4" />
            Inspection Log
          </p>

          <h2
            style={{ animationDelay: `${t(0.12)}s` }}
            className="animate-rise mt-[clamp(1rem,3vh,1.75rem)] font-serif text-[clamp(2.25rem,6.2vh,3.6rem)] font-semibold leading-[1.08] tracking-[-0.01em]"
          >
            Every branch.
            <br />
            Every week.
            <br />
            <span className="text-[#C9A6A4]">On record.</span>
          </h2>

          <p
            style={{ animationDelay: `${t(0.16)}s` }}
            className="animate-rise mt-[clamp(0.875rem,2.6vh,1.5rem)] text-[clamp(15px,2.2vh,18px)] leading-relaxed text-white/80"
          >
            A consistent standard for food safety, hygiene and service quality.
          </p>

          <ul className="mt-[clamp(1rem,3.4vh,2.25rem)]">
            {HIGHLIGHTS.map((item, i) => (
              <li
                key={item.text}
                style={{ animationDelay: `${t(0.2 + i * 0.06)}s` }}
                className="animate-rise flex items-center gap-6 py-[clamp(0.5rem,1.5vh,0.875rem)] border-b border-white/15 last:border-b-0 last:pb-0"
              >
                <span className="w-[clamp(2.5rem,6vh,3.25rem)] h-[clamp(2.5rem,6vh,3.25rem)] rounded-xl ring-1 ring-inset ring-white/30 flex items-center justify-center shrink-0">
                  <item.icon className="w-[22px] h-[22px] text-white/90" strokeWidth={1.6} />
                </span>
                <span className="text-[clamp(15px,2vh,17px)] text-white/90">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Form half */}
      <div className="relative min-w-0 flex flex-col justify-center items-center px-5 sm:px-8 xl:px-12">
        <div className="w-full max-w-[34rem] animate-rise" style={{ animationDelay: `${t(0.08)}s` }}>
          {/*
            The brand panel is gone at this width, so the logo comes inline.
            The form sits on white, so the full logo can go in exactly as
            supplied, with no tile.
          */}
          <BrandLogo className="lg:hidden mb-8 w-[6.5rem]" />

          <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#6B6F76]">
            Welcome back
          </p>
          <h1 className="mt-1.5 font-serif text-[clamp(2rem,5.2vh,3rem)] leading-[1.1] font-semibold tracking-[-0.01em] text-[#17181D]">
            Sign in
          </h1>
          <p className="text-[clamp(15px,2.1vh,17px)] text-[#55585E] mt-1.5">
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

          <form onSubmit={handleSubmit} className="mt-[clamp(1rem,3.2vh,2rem)] space-y-[clamp(0.625rem,1.9vh,1.25rem)]">
            <div>
              <label
                htmlFor="email-input"
                className="block text-[14px] font-semibold text-[#17181D] mb-2"
              >
                Email or username
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-[#6B6F76] absolute left-[1.15rem] top-1/2 -translate-y-1/2 pointer-events-none" />
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
                className="block text-[14px] font-semibold text-[#17181D] mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-[#6B6F76] absolute left-[1.15rem] top-1/2 -translate-y-1/2 pointer-events-none" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F2EE] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="group w-full !mt-[clamp(0.75rem,2.6vh,1.5rem)] h-[clamp(2.5rem,6vh,3.5rem)] px-4 bg-[#8E1520] hover:bg-[#76101A] text-white font-serif text-[18px] font-semibold rounded-lg shadow-[0_10px_24px_-12px_rgba(142,21,32,0.7)] hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer inline-flex items-center justify-center gap-3"
            >
              Sign in
              <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-0.5" />
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
          <div className="mt-[clamp(1rem,3.4vh,2.25rem)]">
            <div className="flex items-center gap-4">
              <span aria-hidden className="h-px flex-1 bg-[#DAD7D2]" />
              <p className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.22em] text-[#6B6F76] whitespace-nowrap">
                Quick demo access
              </p>
              <span aria-hidden className="h-px flex-1 bg-[#DAD7D2]" />
              <button
                type="button"
                onClick={fillDemo}
                className="text-[13px] font-medium text-[#55585E] hover:text-[#8E1520] hover:underline underline-offset-2 cursor-pointer whitespace-nowrap"
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
              <div className="mt-[clamp(0.75rem,2vh,1.25rem)] space-y-[clamp(0.375rem,1.1vh,0.75rem)]">
                {USER_ROLE_KEYS.map((role) => (
                  <div
                    key={role}
                    aria-hidden="true"
                    className="w-full h-[clamp(2.875rem,7.2vh,4.25rem)] px-4 rounded-lg border border-[#DAD7D2] bg-white flex items-center gap-4"
                  >
                    <span className="w-[clamp(2rem,5.2vh,3rem)] h-[clamp(2rem,5.2vh,3rem)] rounded-lg bg-[#F1EFEB] shrink-0 animate-pulse motion-reduce:animate-none" />
                    <span className="min-w-0 flex-1 space-y-2">
                      <span className="block h-3 w-28 rounded bg-[#F1EFEB] animate-pulse motion-reduce:animate-none" />
                      <span className="block h-2.5 w-48 rounded bg-[#F1EFEB] animate-pulse motion-reduce:animate-none" />
                    </span>
                  </div>
                ))}
              </div>
            )}

            {mounted && (
              <motion.div
                className="mt-[clamp(0.75rem,2vh,1.25rem)] space-y-[clamp(0.375rem,1.1vh,0.75rem)]"
                variants={enterGroup}
                initial="hidden"
                animate="shown"
              >
                {demoAccounts.map((account) => {
                  const RoleIcon = DEMO_ROLE[account.role].icon;
                  return (
                    <motion.button
                      key={account.id}
                      variants={enterItem}
                      type="button"
                      id={`login-as-${account.role}`}
                      onClick={() => enterAs(account.id)}
                      title={`Sign in as ${account.name}`}
                      className="w-full h-[clamp(2.875rem,7.2vh,4.25rem)] px-4 rounded-lg border border-[#DAD7D2] bg-white hover:border-[#C9A6A4] hover:shadow-[0_10px_22px_-14px_rgba(26,5,7,0.35)] hover:-translate-y-px transition-[border-color,box-shadow,translate] duration-200 cursor-pointer flex items-center gap-4 text-left group"
                    >
                      <span className="w-[clamp(2rem,5.2vh,3rem)] h-[clamp(2rem,5.2vh,3rem)] rounded-lg bg-[#F1EFEB] text-[#55585E] flex items-center justify-center shrink-0 group-hover:bg-[#8E1520] group-hover:text-white transition-colors duration-200">
                        <RoleIcon className="w-5 h-5" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-[#17181D] truncate">
                          {USER_ROLE_LABEL[account.role]}
                        </span>
                        <span className="block mt-0.5 text-[13px] text-[#6B6F76] truncate">
                          {DEMO_ROLE[account.role].blurb}
                        </span>
                      </span>
                      <ChevronRight className="w-5 h-5 text-[#55585E] shrink-0 group-hover:text-[#8E1520] group-hover:translate-x-0.5 transition-all duration-200" />
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </div>
          )}

        </div>
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

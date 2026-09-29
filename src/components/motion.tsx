'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MotionConfig, animate, motion, useInView, useReducedMotion } from 'motion/react';

/**
 * The app's motion, in one place.
 *
 * Motion here is for orientation, never decoration: a page settles into place
 * so the eye knows it has arrived, figures count up so a change reads as a
 * change, a bar grows from its baseline so its length reads as a quantity.
 * Everything eases out or settles on a soft spring, runs at one tempo, and switches off for
 * anyone whose device asks for reduced motion — `MotionConfig` does that for
 * every `motion.*` element below it, and the hand-rolled animations check the
 * same preference themselves.
 */

/**
 * How fast the whole app moves. Every duration and delay in the app goes
 * through `t()`, so this one number retunes all of it — raise it to slow
 * everything down, lower it to speed up. At 1 the timings are the ones
 * written in the code; they felt rushed, so the app runs at 1.7.
 */
export const TEMPO = 1.7;

/** A duration or delay, in seconds, at the app's tempo. */
export const t = (seconds: number) => seconds * TEMPO;

/**
 * The easing curve for everything that fades or fills: an ease-out cubic.
 * Gentler than the quint it replaced, which did nearly all of its moving in
 * the first fifth of the time and then crept — it read as a snap, not a glide.
 */
export const EASE_OUT = [0.33, 1, 0.68, 1] as const;

/**
 * For things that move: a soft spring that settles with the faintest
 * overshoot, the way a real object comes to rest. `visualDuration` is how
 * long it takes to look settled, so it stays on the same tempo.
 */
export const SPRING = { type: 'spring', visualDuration: t(0.5), bounce: 0.12 } as const;

export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="user" transition={{ duration: t(0.45), ease: EASE_OUT }}>
    {children}
  </MotionConfig>
);

/** A block that rises into place when it first appears. */
export const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Seconds to wait, for a hand-placed order. Prefer `Stagger` for lists. */
  delay?: number;
  as?: 'div' | 'section' | 'li';
}> = ({ children, className, delay = 0, as = 'div' }) => {
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: { ...SPRING, delay: t(delay) },
        opacity: { duration: t(0.45), ease: EASE_OUT, delay: t(delay) },
      }}
    >
      {children}
    </Component>
  );
};

const staggerParent = {
  hidden: {},
  shown: { transition: { staggerChildren: t(0.07), delayChildren: t(0.05) } },
};
const staggerChild = {
  hidden: { opacity: 0, y: 12 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { y: SPRING, opacity: { duration: t(0.45), ease: EASE_OUT } },
  },
};

/** A group whose `StaggerItem` children arrive one after another. */
export const Stagger: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'section';
}> = ({ children, className, as = 'div' }) => {
  const Component = motion[as];
  return (
    <Component className={className} variants={staggerParent} initial="hidden" animate="shown">
      {children}
    </Component>
  );
};

export const StaggerItem: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'section';
}> = ({ children, className, as = 'div' }) => {
  const Component = motion[as];
  return (
    <Component className={className} variants={staggerChild}>
      {children}
    </Component>
  );
};

/**
 * A number that counts up to its value the first time it is seen, and eases to
 * each new value after that. Lands exactly on the value, always; with reduced
 * motion it simply shows it.
 */
export const CountUp: React.FC<{
  value: number;
  className?: string;
  /** Seconds. */
  duration?: number;
}> = ({ value, className, duration = t(0.9) }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    if (!inView) return;
    const controls = animate(from.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (latest) => setShown(latest),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduced, duration]);

  return (
    <span ref={ref} className={className}>
      {Math.round(shown).toLocaleString()}
    </span>
  );
};

/** Whether the element has come into view, once — for charts that draw themselves. */
export function useSeenOnce<T extends Element>() {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { once: true, margin: '-40px' });
  return [ref, seen] as const;
}

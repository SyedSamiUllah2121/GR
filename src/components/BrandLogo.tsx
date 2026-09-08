'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ORGANISATION } from '../data/user';

/**
 * The operator's logo.
 *
 * Drawn from a file in `public/brand/` rather than inlined, so the artwork can
 * be replaced without touching code, and sized by the width it is given — a
 * logo has to fill its space, and capping its height instead left the mark
 * floating with the strapline too small to read.
 *
 * Two lockups, because one cannot serve both places:
 *
 *   horizontal  full colour on a white plate, for light backgrounds
 *   knockout    reversed out in white, sitting straight on the red rail
 *
 * The rail used to carry the full-colour mark on a white card, which read as a
 * heavy slab in a 272px column. Reversing it out is both lighter and the
 * conventional way to put a brand on a coloured ground.
 */
type Variant = 'horizontal' | 'knockout';

/**
 * Sources are tried in order: drop the original artwork in as a `.png` beside
 * the vector rebuild and it takes precedence, with no code change.
 */
const SOURCES: Record<Variant, string[]> = {
  horizontal: ['/brand/royal-gujrat.png', '/brand/royal-gujrat.svg'],
  knockout: ['/brand/royal-gujrat-knockout.png', '/brand/royal-gujrat-knockout.svg'],
};

interface BrandLogoProps {
  variant?: Variant;
  /** Sets the mark's width — give it a `w-*` class. The artwork fills it. */
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'horizontal',
  className = '',
}) => {
  const sources = SOURCES[variant];
  const knockout = variant === 'knockout';
  const [stage, setStage] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  /*
   * Both the mount check below and a late `onError` can report the same
   * source failing. Advancing past a named index rather than incrementing
   * makes the second report a no-op — a blind increment skipped the vector
   * file entirely and fell straight through to the text mark.
   */
  const failed = (index: number) => setStage((s) => (s === index ? index + 1 : s));

  /*
   * On a server-rendered screen the browser requests the image and gives up on
   * it before React hydrates, so the `onError` handler is attached too late to
   * ever hear about it — the login screen showed a broken image. A finished
   * request with no intrinsic width is that missed failure, so check for one
   * as soon as the handler is live.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) failed(stage);
  }, [stage]);

  /* No artwork at all: a shield and the name, so the chrome stays intact. */
  if (stage >= sources.length) {
    return (
      <span
        className={`flex items-center justify-center gap-2 ${
          knockout ? 'text-white' : 'bg-white rounded-xl px-3 py-3 text-[#CE2130]'
        } ${className}`}
      >
        <ShieldCheck className="w-5 h-5 shrink-0" />
        <span className="text-[13px] font-bold tracking-tight whitespace-nowrap">
          {ORGANISATION.name}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`flex items-center justify-center ${
        knockout ? '' : 'bg-white rounded-xl px-3 py-2.5'
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static brand asset, not content */}
      <img
        ref={imgRef}
        key={sources[stage]}
        src={sources[stage]}
        alt={`${ORGANISATION.name} — ${ORGANISATION.tagline}`}
        onError={() => failed(stage)}
        className="w-full h-auto"
      />
    </span>
  );
};

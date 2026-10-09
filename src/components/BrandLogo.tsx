'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ORGANISATION } from '../data/user';

/**
 * The operator's logo.
 *
 * Drawn from files in `public/brand/` rather than inlined, so the artwork can
 * be replaced without touching code. They are web-sized copies of the Gujrat
 * Group master artwork, kept at full size in `docs/brand/`. Re-export from
 * that if the logo changes.
 *
 *   full    the whole stacked logo, exactly as supplied, for white grounds
 *   lockup  the horizontal logo — the same emblem with the same lettering
 *           set beside it rather than under it — on a white bar, for the
 *           red rail and the dark sign-in panel
 *   emblem  the emblem alone on a white tile, for the collapsed rail
 *
 * The horizontal file is cut from the master, not redrawn, so the lettering
 * stays the brand's own. The artwork is black and red, so on the rail it
 * needs a white ground. Boxing the whole stacked logo on a white card was
 * tried first and read as a heavy, near-square slab at the top of the rail;
 * setting the name in the app's own type beside the emblem was lighter but
 * lost the logo's lettering. The horizontal bar keeps both.
 */
type Variant = 'full' | 'lockup' | 'emblem';

const FULL_SRC = '/brand/gujrat-group.png';
const EMBLEM_SRC = '/brand/gujrat-group-emblem.png';
const LOCKUP_SRC = '/brand/gujrat-group-horizontal.png';

interface BrandLogoProps {
  variant?: Variant;
  /**
   * For `full` and `lockup`, sets the logo's width — give it a `w-*` class.
   * For `emblem`, positions the tile; its size is fixed.
   */
  className?: string;
  /** More room around the lockup, for the sign-in panel. */
  large?: boolean;
  /**
   * The artwork alone, with no white plate or tile — for a white ground such
   * as the header, where a plate would only be a box drawn round the logo.
   * Sized by `className` like `full`.
   */
  bare?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  className = '',
  large = false,
  bare = false,
}) => {
  const src = variant === 'full' ? FULL_SRC : variant === 'lockup' ? LOCKUP_SRC : EMBLEM_SRC;
  const [broken, setBroken] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  /*
   * On a server-rendered screen the browser requests the image and gives up on
   * it before React hydrates, so the `onError` handler is attached too late to
   * ever hear about it — the login screen showed a broken image. A finished
   * request with no intrinsic width is that missed failure, so check for one
   * as soon as the handler is live.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [src]);

  const label = `${ORGANISATION.name} ${ORGANISATION.tagline}`;

  if (variant === 'full' || bare) {
    if (broken) {
      return (
        <span className={`flex items-center justify-center gap-2 text-[#CE2130] ${className}`}>
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span className="text-[13px] font-bold tracking-tight whitespace-nowrap">
            {ORGANISATION.name}
          </span>
        </span>
      );
    }
    return (
      <span className={`block ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a static brand asset, not content */}
        <img
          ref={imgRef}
          src={src}
          alt={label}
          onError={() => setBroken(true)}
          className="w-full h-auto"
        />
      </span>
    );
  }

  /* No artwork: the shield stands in on the same tile, so the chrome stays intact. */
  if (variant === 'emblem') {
    return (
      <span className={`flex justify-center ${className}`}>
        <span className="shrink-0 w-11 h-11 rounded-xl p-1.5 flex items-center justify-center bg-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)]">
          {broken ? (
            <ShieldCheck className="w-5 h-5 text-[#CE2130]" />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- a static brand asset, not content */
            <img
              ref={imgRef}
              src={src}
              alt={label}
              onError={() => setBroken(true)}
              className="w-full h-auto"
            />
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`flex items-center justify-center bg-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)] ${
        large ? 'rounded-2xl px-6 py-5' : 'rounded-xl px-3.5 py-3'
      } ${className}`}
    >
      {broken ? (
        <span className="flex items-center gap-2 text-[#CE2130]">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span className="text-[13px] font-bold tracking-tight whitespace-nowrap">
            {ORGANISATION.name}
          </span>
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- a static brand asset, not content */
        <img
          ref={imgRef}
          src={src}
          alt={label}
          onError={() => setBroken(true)}
          className="w-full h-auto"
        />
      )}
    </span>
  );
};

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import { BUTTON } from '../components/ui';

/**
 * What the app shows when a screen throws.
 *
 * Without this, an unhandled render error takes the route down to Next's own
 * error page: unbranded, wordless, and with no way back. On a tablet on a
 * counter that reads as the app being gone, and the answer is to close it and
 * lose whatever was on screen.
 *
 * `retry` re-renders the segment. It is worth offering first because most of
 * what can throw here is a read of the browser store, and a second attempt
 * after the bad value has been written over does succeed. Everything else has
 * the way out below it.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The console is the only reporting this app has; a server would ship it
    console.error('Screen failed to render:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F6F6F8] flex items-center justify-center p-6">
      <div className="bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] max-w-md w-full px-6 sm:px-8 py-10 text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
          <AlertTriangle className="w-6 h-6" />
        </span>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-[#17181D]">
          This screen could not be shown
        </h1>
        <p className="mt-2 text-[13px] text-[#6B6F76] leading-relaxed">
          Nothing you have recorded is lost — inspections and jobs are saved as you go.
          Try again, and if it keeps happening, sign out and back in.
        </p>
        {/*
          The digest is what a support conversation can be held about: the
          message itself is minified in a production build and says nothing.
        */}
        {error.digest && (
          <p className="mt-4 inline-block rounded-lg bg-[#F4F5F7] px-2.5 py-1 text-[11px] font-mono text-[#6B6F76]">Reference {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className={BUTTON.primary}
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <Link href="/" className={BUTTON.secondary}>
            <ArrowLeft className="w-4 h-4" />
            Back to the start
          </Link>
        </div>
      </div>
    </div>
  );
}

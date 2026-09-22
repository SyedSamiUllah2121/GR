'use client';

import { useEffect } from 'react';
import Link from 'next/link';

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
      <div className="bg-white border border-[#E6E7EB] rounded-xl shadow-sm max-w-md w-full p-8 text-center">
        <span className="w-12 h-12 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center mx-auto text-2xl font-bold">
          !
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-[#17181D]">
          This screen could not be shown
        </h1>
        <p className="mt-2 text-sm text-[#6B6F76] leading-relaxed">
          Nothing you have recorded is lost — inspections and jobs are saved as you go.
          Try again, and if it keeps happening, sign out and back in.
        </p>
        {/*
          The digest is what a support conversation can be held about: the
          message itself is minified in a production build and says nothing.
        */}
        {error.digest && (
          <p className="mt-3 text-[11px] font-mono text-[#9CA1A9]">Reference {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E6E7EB] hover:bg-[#F6F6F8] text-xs font-bold text-[#17181D] rounded-lg transition-colors"
          >
            Back to the start
          </Link>
        </div>
      </div>
    </div>
  );
}

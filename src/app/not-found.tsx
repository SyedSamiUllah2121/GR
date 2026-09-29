import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';

/*
 * Rendered on the server, so the card and button looks are written out here
 * rather than borrowed from `ui.tsx`: that module is a client one, and a plain
 * string exported from it arrives on the server as a reference, not a string.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F6F6F8] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] px-6 sm:px-8 py-10 text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
          <Compass className="w-6 h-6" />
        </span>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA1A9]">Error 404</p>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-[#17181D]">Page not found</h2>
        <p className="text-[13px] text-[#6B6F76] mt-2 leading-relaxed">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/inspections"
          className="inline-flex items-center justify-center gap-2 mt-6 h-10 px-4 rounded-xl bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold shadow-[0_6px_16px_-8px_rgba(200,32,45,0.6)] transition-all hover:-translate-y-px"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to records
        </Link>
      </div>
    </div>
  );
}

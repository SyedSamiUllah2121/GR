'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * What a screen shows instead of a record you may not have.
 *
 * There are two distinct refusals and they must not be confused, because they
 * tell the reader different things about what to do next:
 *
 *   out of scope  the record belongs to another branch, or to another
 *                 inspector. Nothing will change that, and there is no report
 *                 to go and read either.
 *   locked        the record is yours to see but has been signed off, so the
 *                 answers are sealed. The report is still there.
 *
 * Saying "locked" for the first case was actively misleading — it implied a
 * timing problem where the real answer was that it was never theirs.
 */
export const AccessNotice: React.FC<{
  title: string;
  detail: string;
  /** The report to offer. Omitted when they may not read it either. */
  reportHref?: string;
}> = ({ title, detail, reportHref }) => {
  const router = useRouter();

  return (
    <div className="p-8 max-w-md mx-auto text-center">
      <span className="w-12 h-12 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center mx-auto">
        <Lock className="w-6 h-6" />
      </span>
      <h2 className="mt-4 text-xl font-bold text-[#17181D]">{title}</h2>
      <p className="text-sm text-[#6B6F76] mt-2 leading-relaxed">{detail}</p>
      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        {reportHref && (
          <button
            type="button"
            onClick={() => router.push(reportHref)}
            className="px-4 py-2 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
          >
            View the report
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="px-4 py-2 border border-[#E6E7EB] text-xs font-bold text-[#17181D] rounded-md hover:bg-[#F6F6F8] transition-colors cursor-pointer"
        >
          Back to records
        </button>
      </div>
    </div>
  );
};

/**
 * The wording for a record that is not this person's to open.
 *
 * Shared so the checklist, the review screen, the summary and the report all
 * refuse in the same words — four screens describing one rule differently
 * reads as four different rules.
 */
export const NOT_YOURS = {
  title: 'This inspection is not yours to open',
  detail:
    'A Monday round belongs to the branch’s own manager, and a surprise visit to the inspector it was assigned to. You can only see records for your own branch or visits.',
};

export const LOCKED = {
  title: 'This inspection is locked',
  detail:
    'It was submitted and signed off, so the answers and score can no longer be changed. Only the Main Admin can reopen a submitted record.',
};

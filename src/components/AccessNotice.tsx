'use client';

import React from 'react';
import { ArrowLeft, FileText, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BUTTON, Card } from './ui';
import { Reveal } from './motion';

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
    <div className="p-5 sm:p-8 flex-1 flex items-start sm:items-center justify-center">
      <Reveal className="w-full max-w-md">
        <Card className="px-6 sm:px-8 py-10 text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FDECEE] to-[#FBDCDF] text-[#C8202D] flex items-center justify-center shadow-inner">
            <Lock className="w-6 h-6" />
          </span>
          <h2 className="mt-5 text-lg font-bold tracking-tight text-[#17181D]">{title}</h2>
          <p className="text-[13px] text-[#6B6F76] mt-2 leading-relaxed">{detail}</p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {reportHref && (
              <button type="button" onClick={() => router.push(reportHref)} className={BUTTON.primary}>
                <FileText className="w-4 h-4" />
                View the report
              </button>
            )}
            <button type="button" onClick={() => router.push('/inspections')} className={BUTTON.secondary}>
              <ArrowLeft className="w-4 h-4" />
              Back to records
            </button>
          </div>
        </Card>
      </Reveal>
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

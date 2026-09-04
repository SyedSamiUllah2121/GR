'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Printer,
  Calendar,
  Clock,
  Check,
  X,
  FileCheck2,
  Edit3,
} from 'lucide-react';
import { Answer, Inspection, Item } from '../types';
import { TEMPLATES } from '../data/templates';
import { getInspectionById } from '../services/storage';
import { useRouter } from 'next/navigation';
import { ScorePill } from './ScorePill';

interface ReportScreenProps {
  inspectionId: string;
}

export const ReportScreen: React.FC<ReportScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );

  useEffect(() => {
    if (!inspection) {
      const found = getInspectionById(inspectionId);
      if (found) setInspection(found);
    }
  }, [inspectionId, inspection]);

  const handlePrint = () => {
    window.print();
  };

  if (!inspection) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#242217]">Report not found</h2>
        <p className="text-sm text-[#635E4F] mt-2">
          The requested inspection report does not exist or has been removed.
        </p>
        <button
          onClick={() => router.push('/inspections')}
          className="mt-4 px-4 py-2 bg-[#2F5233] text-white text-sm font-medium rounded-[6px]"
        >
          Back to records
        </button>
      </div>
    );
  }

  const template = TEMPLATES[inspection.templateKey];
  const allItems: Item[] = template?.sections?.flatMap((s) => s.items) || [];
  const totalCount = allItems.length;
  const answersList = Object.values(inspection.answers) as Answer[];
  const yesCount = answersList.filter((a) => a.status === 'yes').length;
  const noCount = answersList.filter((a) => a.status === 'no').length;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      {/* Top Action Bar (Hidden on Print) */}
      <div className="no-print flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={() => router.push('/inspections')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#635E4F] hover:text-[#242217] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to records</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            id="edit-inspection-btn"
            type="button"
            onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-[#F5F3EC] border border-[#DEDACB] text-xs font-semibold text-[#242217] rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#2F5233]" />
            <span>Edit / Mark checklist</span>
          </button>

          <button
            id="download-pdf-btn"
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Download PDF / Print</span>
          </button>
        </div>
      </div>

      {/* Main Printed Form Layout */}
      <div className="print-container bg-white border border-[#DEDACB] rounded-md p-6 md:p-10 text-[#242217] shadow-xs">
        {/* Form Header */}
        <div className="border-b border-[#DEDACB] pb-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#635E4F]">
                Weekly Inspection Report
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#242217] mt-1">
                {inspection.branchName}
              </h1>
              <p className="text-xs font-semibold text-[#635E4F] mt-1">
                {template?.label || inspection.templateKey}
              </p>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1.5">
              <span className="text-[10px] text-[#635E4F] font-bold uppercase tracking-wider">
                Overall score
              </span>
              <ScorePill score={inspection.score} size="lg" showLabel />
            </div>
          </div>

          {/* Meta line */}
          <div className="mt-4 pt-4 border-t border-[#DEDACB] flex flex-wrap items-center gap-4 md:gap-6 text-xs text-[#635E4F]">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#242217]" />
              <span className="font-semibold text-[#242217]">Date:</span>
              <span>{inspection.date}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#242217]" />
              <span className="font-semibold text-[#242217]">Time:</span>
              <span>{inspection.time}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-[#242217]" />
              <span className="font-semibold text-[#242217]">Status:</span>
              <span className="capitalize font-bold text-[#2F5233]">
                {inspection.status}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span>Passed: <strong className="text-[#2F5233]">{yesCount}</strong></span>
              <span>Flagged: <strong className="text-[#9C3B2E]">{noCount}</strong></span>
              <span>Total: <strong>{totalCount}</strong></span>
            </div>
          </div>
        </div>

        {/* Editable Notice Banner */}
        <div className="no-print mb-6 p-3.5 bg-[#F9F8F4] border border-[#DEDACB] rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <span className="text-[#635E4F]">
            Viewing report. Need to mark items, change compliance answers, or upload photo evidence?
          </span>
          <button
            type="button"
            onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
            className="inline-flex items-center gap-1.5 font-bold text-[#2F5233] hover:underline cursor-pointer shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Open checklist editor</span>
          </button>
        </div>

        {/* Form Sections */}
        <div className="space-y-8">
          {template?.sections.map((sec, sIdx) => {
            return (
              <div key={sIdx} className="page-break-inside-avoid">
                <div className="bg-[#F9F8F4] border border-[#DEDACB] px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-[#242217] flex justify-between items-center rounded-t-md">
                  <span>
                    {sIdx + 1}. {sec.title}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-semibold text-[#635E4F] uppercase tracking-wider">
                      {sec.items.length} items
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
                      className="no-print text-[11px] font-bold text-[#2F5233] hover:underline flex items-center gap-1 cursor-pointer"
                      title="Edit this section in checklist"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>

                <div className="border border-t-0 border-[#DEDACB] divide-y divide-[#DEDACB] rounded-b-md overflow-hidden">
                  {sec.items.map((item) => {
                    const ans = inspection.answers[item.id];
                    const isYes = ans?.status === 'yes';
                    const isNo = ans?.status === 'no';
                    const displayReason =
                      ans?.reason === 'Other'
                        ? `Other: ${ans?.otherReason || 'Not specified'}`
                        : ans?.reason;

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 text-xs md:text-sm ${
                          isNo ? 'bg-[#F4E4DF]/25' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-2.5 flex-1">
                            <span className="font-bold text-[#635E4F] w-5 text-right shrink-0">
                              {item.id}.
                            </span>
                            <div>
                              <span className="font-semibold text-[#242217]">{item.text}</span>
                              <span className="ml-2 text-[10px] font-bold text-[#635E4F] uppercase bg-[#F5F3EC] px-1.5 py-0.5 rounded border border-[#DEDACB]">
                                {item.reasonGroup}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isYes && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#E7EEE4] text-[#2F5233]">
                                <Check className="w-3.5 h-3.5" />
                                <span>Yes</span>
                              </span>
                            )}
                            {isNo && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#F4E4DF] text-[#9C3B2E]">
                                <X className="w-3.5 h-3.5" />
                                <span>No</span>
                              </span>
                            )}
                            {!isYes && !isNo && (
                              <span className="text-xs text-[#635E4F] italic">Unanswered</span>
                            )}
                          </div>
                        </div>

                        {/* If marked NO, render red-tinted block showing reason, note, photo */}
                        {isNo && (
                          <div className="mt-2.5 ml-7 p-3 rounded-md bg-[#F4E4DF]/60 border border-[#9C3B2E]/30 space-y-2">
                            <div className="text-xs">
                              <span className="font-bold text-[#9C3B2E]">Reason: </span>
                              <span className="text-[#242217] font-semibold">{displayReason}</span>
                            </div>
                            {ans.note && (
                              <div className="text-xs text-[#635E4F]">
                                <span className="font-bold text-[#242217]">Note: </span>
                                <span>{ans.note}</span>
                              </div>
                            )}
                            {ans.photo && (
                              <div className="pt-1">
                                <span className="block text-[10px] font-bold text-[#635E4F] uppercase tracking-wider mb-1">
                                  Attached evidence
                                </span>
                                <img
                                  src={ans.photo}
                                  alt={`Evidence item ${item.id}`}
                                  className="w-28 h-28 object-cover rounded-md border border-[#DEDACB] bg-white"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Manager Sign-Off Section */}
        <div className="mt-10 pt-6 border-t border-[#DEDACB] page-break-inside-avoid">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#635E4F]">
                Manager verification &amp; acknowledgment
              </p>
              <p className="text-xs text-[#635E4F] mt-0.5">
                The manager certifies that this inspection accurately reflects the branch condition.
              </p>
              <div className="mt-4">
                <span className="text-xs font-semibold text-[#242217] block mb-1">
                  Branch manager signature:
                </span>
                {inspection.signature ? (
                  <div className="w-64 h-24 border border-[#DEDACB] bg-[#F9F8F4] rounded-md flex items-center justify-center p-2">
                    <img
                      src={inspection.signature}
                      alt="Branch manager signature"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-64 h-24 border border-dashed border-[#DEDACB] bg-[#F9F8F4] rounded-md flex items-center justify-center text-xs text-[#635E4F] italic">
                    No signature on file
                  </div>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right text-xs text-[#635E4F]">
              <p>Branch: <strong className="text-[#242217]">{inspection.branchName}</strong></p>
              <p className="mt-1">Date: <strong className="text-[#242217]">{inspection.date} {inspection.time}</strong></p>
              <p className="mt-1">Report ID: <span className="font-mono">{inspection.id}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

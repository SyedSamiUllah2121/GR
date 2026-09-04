'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Calendar, Clock, ChevronRight, AlertCircle, PlayCircle, Trash2, Edit3, FileText } from 'lucide-react';
import { Inspection, TemplateKey } from '../types';
import { getInspections, getActiveDraft, clearActiveDraft, subscribeToStorage } from '../services/storage';
import { TEMPLATES } from '../data/templates';
import { useRouter } from 'next/navigation';
import { ScorePill } from './ScorePill';

export const RecordsListScreen: React.FC = () => {
  const router = useRouter();
  const [inspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [activeDraft, setActiveDraft] = useState<Inspection | null>(() => getActiveDraft());
  const [searchQuery, setSearchQuery] = useState('');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const update = () => {
      setInspections(getInspections());
      setActiveDraft(getActiveDraft());
    };
    return subscribeToStorage(update);
  }, []);

  // Filter submitted inspections
  const submittedInspections = inspections.filter((i) => i.status === 'submitted');

  const filteredInspections = submittedInspections.filter((item) => {
    const matchesSearch = item.branchName.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const matchesTemplate = templateFilter === 'all' || item.templateKey === templateFilter;
    return matchesSearch && matchesTemplate;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInspections.length / pageSize));
  const paginatedInspections = filteredInspections.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleDiscardDraft = () => {
    if (window.confirm('Discard the unfinished draft?')) {
      clearActiveDraft();
      setActiveDraft(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Header matching Clean Minimalism theme */}
      <header className="min-h-[5rem] bg-white border-b border-[#DEDACB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#242217]">Inspection Records</h2>
          <p className="text-[#635E4F] text-xs mt-0.5">
            Showing {filteredInspections.length} recent submission{filteredInspections.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 sm:flex-none">
            <input
              id="records-search-input"
              type="text"
              placeholder="Search branch..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#F5F3EC] border border-[#DEDACB] rounded-md px-4 py-2 text-sm w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-[#2F5233] text-[#242217] placeholder:text-[#635E4F]/50"
            />
          </div>

          <select
            id="records-template-filter"
            value={templateFilter}
            onChange={(e) => {
              setTemplateFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-[#DEDACB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2F5233] text-[#635E4F] font-medium"
          >
            <option value="all">All Templates</option>
            <option value="kitchen">Kitchen</option>
            <option value="frontofhouse">Front of House</option>
          </select>
        </div>
      </header>

      {/* Main Body */}
      <div className="p-6 md:p-10 flex-1 flex flex-col">
        {/* Active Draft Alert Banner if one exists */}
        {activeDraft && activeDraft.status === 'draft' && (
          <div
            id="active-draft-banner"
            className="mb-6 p-4 rounded-md bg-[#F3ECD8] border border-[#8A6318]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#8A6318]/10 rounded-md text-[#8A6318]">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#242217]">
                  Unfinished draft in progress for{' '}
                  <span className="font-bold text-[#8A6318]">{activeDraft.branchName}</span>
                </p>
                <p className="text-xs text-[#635E4F]">
                  {TEMPLATES[activeDraft.templateKey]?.label} • Started {activeDraft.date} at{' '}
                  {activeDraft.time}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                id="resume-draft-btn"
                onClick={() => router.push(`/inspections/${activeDraft.id}/checklist`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2F5233] hover:bg-[#3d6a42] text-white rounded-md transition-colors cursor-pointer"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
              <button
                id="discard-draft-btn"
                onClick={handleDiscardDraft}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#9C3B2E] hover:bg-[#F4E4DF] border border-[#9C3B2E]/30 rounded-md transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
            </div>
          </div>
        )}

        {/* Table Container Card */}
        <div className="bg-white border border-[#DEDACB] rounded-md flex flex-col shadow-xs overflow-hidden">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#F9F8F4] z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#635E4F] font-bold border-b border-[#DEDACB]">
                    Branch Name
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#635E4F] font-bold border-b border-[#DEDACB]">
                    Checklist Template
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#635E4F] font-bold border-b border-[#DEDACB]">
                    Date &amp; Time
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#635E4F] font-bold border-b border-[#DEDACB] text-right">
                    Score
                  </th>
                  <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-[#635E4F] font-bold border-b border-[#DEDACB] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DEDACB]">
                {paginatedInspections.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-6 text-center text-sm text-[#635E4F]">
                      <p className="font-medium text-[#242217]">No inspection records found</p>
                      <p className="text-xs text-[#635E4F] mt-1">
                        {searchQuery || templateFilter !== 'all'
                          ? 'Try adjusting your search query or checklist filter.'
                          : 'Start a new weekly inspection to begin logging records.'}
                      </p>
                      {searchQuery || templateFilter !== 'all' ? (
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            setTemplateFilter('all');
                          }}
                          className="mt-3 text-xs text-[#2F5233] font-semibold hover:underline cursor-pointer"
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ) : (
                  paginatedInspections.map((item) => {
                    const tplLabel = TEMPLATES[item.templateKey]?.label || item.templateKey;
                    return (
                      <tr
                        key={item.id}
                        id={`record-row-${item.id}`}
                        onClick={() => {
                          if (item.status === 'draft') {
                            router.push(`/inspections/${item.id}/checklist`);
                          } else {
                            router.push(`/inspections/${item.id}`);
                          }
                        }}
                        className="hover:bg-[#F9F8F4] transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-5 text-sm font-semibold text-[#242217]">
                          {item.branchName}
                          {item.status === 'draft' && (
                            <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-[#F4E4DF] text-[#9C3B2E]">
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-sm text-[#635E4F]">
                          {tplLabel}
                        </td>
                        <td className="px-6 py-5 text-sm text-[#635E4F]">
                          {item.date} · {item.time}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <ScorePill score={item.score} />
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              id={`edit-btn-${item.id}`}
                              onClick={() => router.push(`/inspections/${item.id}/checklist`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#2F5233] bg-[#E7EEE4] hover:bg-[#d8e3d4] rounded-md transition-colors cursor-pointer"
                              title="Edit and mark checklist items"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              id={`view-report-btn-${item.id}`}
                              onClick={() => router.push(`/inspections/${item.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#635E4F] hover:bg-[#DEDACB]/40 rounded-md transition-colors cursor-pointer"
                              title="View inspection summary report"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Report</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-4 border-t border-[#DEDACB] bg-[#F9F8F4] flex justify-between items-center shrink-0">
            <span className="text-xs text-[#635E4F]">
              Showing {paginatedInspections.length} of {filteredInspections.length} records
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className={`px-3 py-1 border border-[#DEDACB] rounded-md bg-white text-xs text-[#635E4F] transition-colors ${
                  currentPage <= 1
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-[#F5F3EC] cursor-pointer'
                }`}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className={`px-3 py-1 border border-[#DEDACB] rounded-md bg-white text-xs text-[#635E4F] transition-colors ${
                  currentPage >= totalPages
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-[#F5F3EC] cursor-pointer'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

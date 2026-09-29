'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';
import { ItemDetail } from '../types';

/**
 * The kit a question or a finding is about — serial number, make, where it is.
 *
 * Label and value are both free text and both optional while you type, so a
 * half-filled row is never rejected mid-edit; blank rows are dropped when the
 * question is read rather than blocked here.
 *
 * Shared by the checklist editor, where an admin records the kit a question is
 * about once, and the checklist itself, where whoever is marking records the
 * unit actually in front of them. The same control in both places because it
 * is the same information — only who is entering it differs.
 */
export const DetailFields: React.FC<{
  details: ItemDetail[];
  onChange: (next: ItemDetail[]) => void;
  disabled?: boolean;
  /** Wording for the button that appends the first row. */
  addLabel?: string;
}> = ({ details, onChange, disabled, addLabel = 'Add a detail' }) => (
  // Chips that flow across and wrap. Stacked full-width rows pushed the rest
  // of the form down the page once a question carried three or four facts.
  <div className="flex flex-wrap items-stretch gap-2">
    {details.map((detail, index) => (
      // Rows are only ever appended or removed, and the inputs are driven by
      // these props, so positional keys stay correct.
      <div
        key={index}
        className="group/chip relative w-[10.5rem] rounded-xl border border-[#E4E6EB] bg-white pl-3 pr-6 py-2 shadow-xs hover:border-[#D0D3D9] focus-within:border-[#C8202D] focus-within:ring-4 focus-within:ring-[#C8202D]/10 transition-[border-color,box-shadow]"
      >
        {/*
          The chip carries the focus ring for both fields. Left to itself the
          app-wide focus outline drew a second red box inside the chip, one per
          input, which read as a control inside a control.
        */}
        <input
          aria-label={`Detail ${index + 1} label`}
          placeholder="Label"
          value={detail.label}
          disabled={disabled}
          onChange={(e) =>
            onChange(details.map((d, i) => (i === index ? { ...d, label: e.target.value } : d)))
          }
          className="w-full bg-transparent border-0 p-0 text-[10px] font-bold uppercase tracking-wider leading-4 text-[#6B6F76] placeholder:text-[#AEB3BA] focus:outline-none focus-visible:outline-none"
        />
        <input
          aria-label={`Detail ${index + 1} value`}
          placeholder="Value"
          value={detail.value}
          disabled={disabled}
          onChange={(e) =>
            onChange(details.map((d, i) => (i === index ? { ...d, value: e.target.value } : d)))
          }
          className="w-full bg-transparent border-0 border-t border-t-[#F0F1F4] rounded-none mt-1 pt-1 px-0 pb-0 text-[13px] font-semibold leading-5 text-[#17181D] placeholder:text-[#AEB3BA] placeholder:font-normal focus:outline-none focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(details.filter((_, i) => i !== index))}
          disabled={disabled}
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center text-[#C9CCD2] hover:text-[#C8202D] hover:bg-[#FDECEE] focus-visible:text-[#C8202D] transition-colors cursor-pointer"
          title="Remove this detail"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    ))}

    <button
      type="button"
      onClick={() => onChange([...details, { label: '', value: '' }])}
      disabled={disabled}
      className="w-[10.5rem] min-h-[3.25rem] flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#D0D3D9] text-xs font-bold text-[#6B6F76] hover:text-[#C8202D] hover:bg-[#FFF7F8] hover:border-[#C8202D]/50 transition-colors cursor-pointer"
    >
      <Plus className="w-3.5 h-3.5" />
      {details.length === 0 ? addLabel : 'Add another'}
    </button>
  </div>
);

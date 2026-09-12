'use client';

import React from 'react';
import { Interval, IntervalUnit } from '../types';
import { DAY_INTERVAL_CHOICES, INTERVAL_CHOICES } from '../services/maintenancePlanStore';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

/**
 * How often something recurs: a number, and whether it is counted in days or
 * months.
 *
 * A typed number with the common answers offered beside it rather than a list
 * to choose from, because the list is always wrong for somebody — a filter
 * rinsed every ten days and a certificate renewed every five years are both
 * real, and neither belongs in a dropdown built around the other.
 *
 * `id` has to differ between two of these on one screen: the datalist is
 * addressed by it, and two datalists sharing an id leaves the second one
 * offering the first one's suggestions.
 */
export const IntervalPicker: React.FC<{
  id: string;
  value: Interval;
  onChange: (next: Interval) => void;
  /** Named for whatever is being scheduled, since a screen may have two. */
  label: string;
}> = ({ id, value, onChange, label }) => {
  const choices = value.unit === 'days' ? DAY_INTERVAL_CHOICES : INTERVAL_CHOICES;

  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-3 items-center">
      <span className="text-xs text-[#6B6F76]">Every</span>
      <input
        id={id}
        type="number"
        min={1}
        step={1}
        list={`${id}-choices`}
        value={value.every}
        onChange={(e) => onChange({ ...value, every: Number(e.target.value) })}
        aria-label={`How often — ${label}`}
        className={inputClass}
      />
      <datalist id={`${id}-choices`}>
        {choices.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <select
        value={value.unit}
        onChange={(e) => onChange({ ...value, unit: e.target.value as IntervalUnit })}
        aria-label={`Days or months — ${label}`}
        className={inputClass}
      >
        <option value="days">days</option>
        <option value="months">months</option>
      </select>
    </div>
  );
};

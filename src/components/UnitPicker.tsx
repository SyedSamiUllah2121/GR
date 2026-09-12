'use client';

import React from 'react';
import { Equipment, ItemDetail } from '../types';

/**
 * Which unit a finding is about, chosen from the branch's register.
 *
 * A list rather than the free-text chips this used to be, because the answer
 * was always meant to be one of the appliances already on record. Typed by
 * hand it arrived as "AC 2", "Dining AC", "dining area ac2" — three spellings
 * of one chiller, none of which a job could be matched back to. Picked from
 * the register it is exact, which is what lets the board tell that a fault
 * reported today is the fault it already has somebody working on.
 *
 * What gets stored is still plain details — the unit's name, its make and
 * model, and its serial — so a job, a report and a printed record all read the
 * same as they always did. The register is where the words come from, not a
 * new shape of record.
 */

/** The three facts worth carrying onto a job, as this app already stores them. */
export function detailsForAsset(asset: Equipment): ItemDetail[] {
  const model = [asset.make, asset.model].filter(Boolean).join(' ').trim();
  return [
    { label: 'Unit', value: asset.name },
    ...(model ? [{ label: 'Model', value: model }] : []),
    ...(asset.serialNumber ? [{ label: 'Serial', value: asset.serialNumber }] : []),
  ];
}

/** "Walk-in chiller — Carrier CWC-220 — SN-1188", skipping what is not recorded. */
export function describeAsset(asset: Equipment): string {
  const model = [asset.make, asset.model].filter(Boolean).join(' ').trim();
  return [asset.name, model, asset.serialNumber].filter(Boolean).join(' — ');
}

export const UnitPicker: React.FC<{
  id: string;
  /** The branch's register, already narrowed and in the order it reads best. */
  assets: Equipment[];
  /** The asset currently named, when the details name one on the register. */
  selectedId: string | null;
  onChange: (details: ItemDetail[]) => void;
  disabled?: boolean;
}> = ({ id, assets, selectedId, onChange, disabled }) => {
  if (assets.length === 0) {
    return (
      <p className="text-[11px] text-[#6B6F76]">
        Nothing is on the register for this branch yet, so there is no unit to name.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <select
        id={id}
        value={selectedId ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const asset = assets.find((a) => a.id === e.target.value);
          // Clearing the choice clears the details with it, rather than
          // leaving the last unit named on a finding that is no longer about it
          onChange(asset ? detailsForAsset(asset) : []);
        }}
        className="w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D] disabled:bg-[#F6F6F8] disabled:text-[#6B6F76]"
      >
        <option value="">Not about a particular unit</option>
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {describeAsset(asset)}
          </option>
        ))}
      </select>

      {selectedId && (
        <p className="text-[11px] text-[#6B6F76]">
          Carried onto the job, so whoever goes out knows which one — and so this
          check is held while that unit has work outstanding.
        </p>
      )}
    </div>
  );
};

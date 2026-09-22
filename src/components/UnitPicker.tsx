'use client';

import React from 'react';
import { Equipment, ItemDetail } from '../types';
import { categoryLabel } from '../services/categoryStore';

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

/**
 * The facts worth carrying onto a job, as this app already stores them.
 *
 * The asset number leads and is not optional where the unit has one, because
 * it is the only field that identifies the unit. Royal Gujarat has nine
 * assets called "Refrigerator" and ten called "Fan"; a job that says
 * "Unit: Refrigerator" sends a fitter to a branch to look for one of nine,
 * and — worse — cannot be matched back to a record, so the board cannot tell
 * that this fault is the fault it already has somebody working on.
 *
 * Serial is kept for the assets that carry one. The register records none, so
 * in practice this is the asset number's job now.
 */
export function detailsForAsset(asset: Equipment): ItemDetail[] {
  const model = [asset.make, asset.model].filter(Boolean).join(' ').trim();
  return [
    ...(asset.assetNo ? [{ label: 'Asset no', value: asset.assetNo }] : []),
    { label: 'Unit', value: asset.name },
    ...(asset.location ? [{ label: 'Where', value: asset.location }] : []),
    ...(model ? [{ label: 'Model', value: model }] : []),
    ...(asset.serialNumber ? [{ label: 'Serial', value: asset.serialNumber }] : []),
  ];
}

/**
 * "RG-CHL-030 — Refrigerator — Main Kitchen", skipping what is not recorded.
 *
 * Number, then what it is, then where it stands — which is the order somebody
 * scanning a list of seventy-three actually needs. Capacity is included for
 * air conditioning because two Split ACs in the same hall are told apart by
 * their tonnage as often as by anything else.
 */
export function describeAsset(asset: Equipment): string {
  return [asset.assetNo, asset.name, asset.capacity, asset.location]
    .filter(Boolean)
    .join(' — ');
}

/** The branch's assets, in trade order, each trade sorted by asset number. */
function assetsByTrade(assets: Equipment[]): [string, Equipment[]][] {
  const groups = new Map<string, Equipment[]>();
  for (const asset of assets) {
    const label = categoryLabel(asset.category);
    const list = groups.get(label);
    if (list) list.push(asset);
    else groups.set(label, [asset]);
  }
  return [...groups.entries()]
    .map(([label, list]): [string, Equipment[]] => [
      label,
      /*
       * By asset number, not by name. The numbers run in the order the
       * register walks the branch — juice area, then bakery, then kitchen —
       * so a numeric sort puts the machines in roughly the order somebody
       * standing in the building would come across them.
       */
      [...list].sort((a, b) => (a.assetNo ?? a.name).localeCompare(b.assetNo ?? b.name)),
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
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
        {/*
          Grouped by trade. Royal Gujarat alone has seventy-three assets, and
          an inspector looking for a fridge should not be scrolling past forty
          fans and ovens to reach it. The groups are built from whatever the
          assets say rather than from a fixed list, so a trade added later
          appears here without this component knowing about it.
        */}
        {assetsByTrade(assets).map(([trade, inTrade]) => (
          <optgroup key={trade} label={trade}>
            {inTrade.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {describeAsset(asset)}
              </option>
            ))}
          </optgroup>
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

import { Equipment } from '../types';
import { ASSET_REGISTER } from './assetRegister';

/**
 * The estate's assets, as the app holds them.
 *
 * This is no longer a plausible-looking demo. It is the operator's own
 * register — 302 units across nine branches, transcribed from the AC,
 * chiller and electrical master documents of 17 September 2026 — so the
 * register, the schedule and the board show the actual estate on first run.
 *
 * Every field comes from the source document or is left null. Nothing is
 * invented: no serial numbers (the register records none), no install dates
 * (it records none either), no makes for the 200-odd units whose brand column
 * reads "-". An empty field is a true statement that nobody wrote it down,
 * and the form is there to fill it in. A fabricated serial number would be a
 * number on a screen matching nothing on the wall, which is worse than a
 * blank.
 *
 * The id derives from the asset number, not from the branch and the name.
 * That matters here more than it reads: eleven Royal Gujarat assets are
 * called "Fan" and nine Nana House assets are called "Refrigerator", and the
 * old name-derived id would have folded each of those groups into a single
 * record. The asset number is unique across the estate by construction, so
 * the ids are too — and re-importing a corrected master document updates
 * each unit in place instead of doubling the register.
 */

/** `RG-ACU-008` → `eq-rg-acu-008`. Stable, and legible in a debugger. */
export function equipmentIdForAssetNo(assetNo: string): string {
  return `eq-${assetNo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

export const SEED_EQUIPMENT: Equipment[] = ASSET_REGISTER.map((asset) => ({
  id: equipmentIdForAssetNo(asset.assetNo),
  branchName: asset.branchName,
  /*
   * Named after the type, because that is what the register calls it and what
   * is written on the job sheet. The asset number is what tells two of them
   * apart, and it is shown beside the name everywhere the name appears.
   */
  name: asset.assetType,
  category: asset.category,
  assetNo: asset.assetNo,
  assetType: asset.assetType,
  capacity: asset.capacity,
  quantity: 1,
  serviceStatus: asset.status,
  statusNote: asset.statusNote,
  lastServicedOn: asset.lastServicedOn,
  serialNumber: null,
  make: asset.make,
  model: null,
  location: asset.location,
  /*
   * Null, and the schedule is built for it: an asset with no install date and
   * no service date counts from the day it is first seen. Backdating 302
   * assets to a date somebody chose would have every plan in the estate come
   * due on the same morning.
   */
  installedOn: null,
  notes: null,
  active: true,
  createdAt: '2026-09-17',
}));

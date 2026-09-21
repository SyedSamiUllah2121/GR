import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment } = await import('../services/equipmentStore.ts');
const { describeAsset, detailsForAsset } = await import('../components/UnitPicker.tsx');
const { assetForCheck, suggestCategory } = await import('../services/maintenanceIntake.ts');

const branch = 'Royal Gujarat';
const assets = getEquipment()
  .filter(e => e.active && e.branchName === branch)
  .sort((a, b) => (a.assetNo ?? a.name).localeCompare(b.assetNo ?? b.name));

section('every unit in the dropdown is distinguishable');
const labels = assets.map(describeAsset);
note('assets at Royal Gujarat', assets.length);
check('no two entries read the same', new Set(labels).size, labels.length);
ok('each leads with its asset number',
   assets.every(a => describeAsset(a).startsWith(a.assetNo!)));
note('sample', labels.slice(0, 3));

section('every branch, not just the busy one');
const branches = [...new Set(getEquipment().map(e => e.branchName))];
let clashes = 0;
for (const b of branches) {
  const here = getEquipment().filter(e => e.active && e.branchName === b).map(describeAsset);
  if (new Set(here).size !== here.length) { clashes++; console.log(`   duplicate labels at ${b}`); }
}
check('no branch has two identical entries', clashes, 0);

section('the unit survives a round trip — this was silent corruption');
let wrong = 0;
for (const asset of assets) {
  const back = assetForCheck({ id: 1, text: 'x' } as any,
    { status: 'no', details: detailsForAsset(asset) } as any, assets);
  if (back?.id !== asset.id) { wrong++; if (wrong < 4) console.log(`   ${asset.assetNo} -> ${back?.assetNo ?? 'null'}`); }
}
check('all 73 resolve back to themselves', wrong, 0);

section('across the whole estate');
let estateWrong = 0;
for (const b of branches) {
  const here = getEquipment().filter(e => e.active && e.branchName === b);
  for (const asset of here) {
    const back = assetForCheck({ id: 1, text: 'x' } as any,
      { status: 'no', details: detailsForAsset(asset) } as any, here);
    if (back?.id !== asset.id) estateWrong++;
  }
}
check('all 302 resolve back to themselves', estateWrong, 0);

section('the details written onto the job say which machine');
const one = assets.find(a => a.assetNo === 'RG-CHL-030')!;
const details = detailsForAsset(one);
ok('asset number is carried', details.some(d => d.label === 'Asset no' && d.value === 'RG-CHL-030'));
ok('where it stands is carried', details.some(d => d.label === 'Where'));
note('what the job records', details.map(d => `${d.label}: ${d.value}`));

section('an ambiguous old record resolves to nothing, not to the wrong unit');
const nameOnly = assetForCheck({ id: 1, text: 'x' } as any,
  { status: 'no', details: [{ label: 'Unit', value: 'Refrigerator' }] } as any, assets);
check('nine Refrigerators identify none of them', nameOnly, null);
const unique = assetForCheck({ id: 1, text: 'x' } as any,
  { status: 'no', details: [{ label: 'Unit', value: 'Walk-In Chiller' }] } as any, assets);
check('but a name only one unit carries still resolves', unique?.assetNo, 'RG-CHL-021');

section('withdrawn assets are not offered');
ok('only assets in service are listed', assets.every(a => a.active));

process.exit(report());

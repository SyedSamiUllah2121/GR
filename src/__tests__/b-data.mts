import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { ASSET_REGISTER } = await import('../data/assetRegister.ts');
const { getEquipment, nextAssetNo, assetNoProblem, addEquipment, importEquipment } =
  await import('../services/equipmentStore.ts');
const { assetOptionsFor, categoryForType, readServiceStatus, readServiceDate, usesCapacity } =
  await import('../services/assetOptions.ts');

const equipment = getEquipment();

section('fidelity — every register row survived into the store');
const byNo = new Map(equipment.map(e => [e.assetNo!, e]));
let drift = 0;
for (const row of ASSET_REGISTER) {
  const e = byNo.get(row.assetNo);
  if (!e) { drift++; console.log(`  missing ${row.assetNo}`); continue; }
  if (e.branchName !== row.branchName || e.assetType !== row.assetType ||
      e.capacity !== row.capacity || e.make !== row.make ||
      e.location !== row.location || e.serviceStatus !== row.status ||
      e.statusNote !== row.statusNote || e.lastServicedOn !== row.lastServicedOn) {
    drift++; console.log(`  drift on ${row.assetNo}`);
  }
}
check('rows transcribed without drift', drift, 0);

section('spot checks against the printed documents');
const spot = (no: string, f: (e: any) => unknown, want: unknown) => check(`${no} ${String(want)}`, f(byNo.get(no)), want);
spot('NHB-ACU-001', e=>e.make, 'Hitachi');
spot('NHB-ACU-001', e=>e.capacity, '1.5 Ton');
spot('NHB-ACU-001', e=>e.lastServicedOn, '2026-08-12');
spot('GRSB-ACU-042', e=>e.make, 'General indoor + Super General outdoor');
spot('GRSB-ACU-042', e=>e.capacity, 'Approx. 2.35 Ton');
spot('GRSB-ACU-042', e=>e.location, 'Kitchen');
spot('DGR-ACU-031', e=>e.serviceStatus, 'faulty');
spot('MPS-ACU-066', e=>e.serviceStatus, 'faulty');
spot('RG-CHL-021', e=>e.assetType, 'Walk-In Chiller');
spot('GRSB-CHL-051', e=>e.make, 'Marriott');
spot('MPS-CHL-077', e=>e.assetType, 'Room Chiller');
spot('ZG-ELC-118', e=>e.assetType, 'Salad Machine');
spot('RG-ELC-029', e=>e.assetType, 'Fan');
spot('NHB-ELC-004', e=>e.make, 'Milano');
spot('MPS-ACU-067', e=>e.serviceStatus, 'serviced');
spot('MPS-ACU-067', e=>e.lastServicedOn, null);  // "date not specified"
spot('ZG-ACU-090', e=>e.serviceStatus, 'unknown');

section('asset numbering');
check('next AC number', nextAssetNo('Royal Gujarat', 'AC_VENTILATION'), 'RG-ACU-092');
check('next chiller number', nextAssetNo('Royal Gujarat', 'REFRIGERATION'), 'RG-CHL-094');
check('next electrical number', nextAssetNo('Royal Gujarat', 'ELECTRICAL'), 'RG-ELC-119');
check('counter is estate-wide, not per branch',
  nextAssetNo('Mussafah 26 - Zaharat Gujarat', 'AC_VENTILATION'), 'ZG-ACU-092');
check('a trade with no assets still numbers',
  nextAssetNo('Royal Gujarat', 'OTHER'), 'RG-OTH-001');
check('duplicate refused', assetNoProblem('RG-ACU-008', null) !== null, true);
check('blank allowed', assetNoProblem('', null), null);
check('rubbish refused', assetNoProblem('not a number!', null) !== null, true);
check('own number allowed when editing itself',
  assetNoProblem('RG-ACU-008', byNo.get('RG-ACU-008')!.id), null);

section('dropdown options come from the data');
const opts = assetOptionsFor(equipment, 'Royal Gujarat', 'AC_VENTILATION');
ok('AC types offered', opts.types.includes('Split AC') && opts.types.includes('Floor-Standing AC'));
ok('real brands offered', ['O General','Mitsubishi','Midea','Gree','Hitachi','Super General']
  .every(m => opts.makes.includes(m)));
ok('capacities sorted by tonnage', opts.capacities[0] === '1 Ton');
const rgLocs = new Set(ASSET_REGISTER.filter(a=>a.branchName==='Royal Gujarat').map(a=>a.location));
const firstForeign = opts.locations.findIndex(l => !rgLocs.has(l));
ok("branch's own locations all come before other branches'",
   opts.locations.slice(0, firstForeign).every(l => rgLocs.has(l)) && firstForeign > 5);
check('type infers its trade', categoryForType('Kulfi Freezer'), 'REFRIGERATION');
check('AC type infers its trade', categoryForType('Split AC'), 'AC_VENTILATION');
check('unknown type infers nothing', categoryForType('Hydraulic press'), null);
check('capacity shown for AC', usesCapacity('AC_VENTILATION'), true);
check('capacity hidden for electrical', usesCapacity('ELECTRICAL'), false);

section('reading the register wording');
check('SERVICE DUE', readServiceStatus('SERVICE DUE'), 'due');
check('Serviced 25 Aug 2026', readServiceStatus('Serviced 25 Aug 2026'), 'serviced');
check('date read out of it', readServiceDate('Serviced 25 Aug 2026'), '2026-08-25');
check('NOT WORKING / FAULTY', readServiceStatus('NOT WORKING / FAULTY'), 'faulty');
check('SERVICE PENDING', readServiceStatus('SERVICE PENDING'), 'pending');
check('status not stated', readServiceStatus('Service status not stated'), 'unknown');
check('Inventory', readServiceStatus('Inventory'), 'inventory');
check('no date invented', readServiceDate('Serviced - date not specified'), null);
check('impossible date refused', readServiceDate('Serviced 31 Feb 2026'), null);

section('import round-trip — the master register pasted back in');
const rows = ASSET_REGISTER.slice(0, 40).map(a => ({
  branchName: a.branchName, name: a.assetType, category: a.category,
  assetNo: a.assetNo, assetType: a.assetType, capacity: a.capacity,
  statusNote: a.statusNote, serviceStatus: a.status, lastServicedOn: a.lastServicedOn,
  make: a.make, location: a.location, serialNumber: null, model: null, installedOn: null,
}));
const result = importEquipment(rows as any, new Date().toISOString());
check('import accepted', result.ok, true);
check('corrects rather than duplicates', result.result?.added, 0);
check('all 40 matched existing records', result.result?.updated, 40);
check('register still 302 after re-import', getEquipment().length, 302);

section('a duplicate asset number inside one paste');
const dupe = [
  { branchName:'Royal Gujarat', name:'Fan', category:'ELECTRICAL', assetNo:'RG-ELC-500' },
  { branchName:'Royal Gujarat', name:'Fan', category:'ELECTRICAL', assetNo:'RG-ELC-500' },
];
const dresult = importEquipment(dupe as any, new Date().toISOString());
check('second line rejected, not silently overwriting', dresult.result?.skipped.length, 1);
check('first line accepted', dresult.result?.added, 1);

process.exit(report());

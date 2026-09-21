/** A browser-shaped environment so the stores can run under node. */
export function freshBrowser() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  (globalThis as any).window = {
    localStorage: ls, dispatchEvent: () => true,
    addEventListener: () => {}, removeEventListener: () => {},
  };
  (globalThis as any).localStorage = ls;
  return store;
}

let pass = 0, fail = 0;
const failures: string[] = [];

export function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; }
  else { fail += 1; failures.push(`${label}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
}
export function ok(label: string, condition: boolean) { check(label, condition, true); }
export function note(label: string, value: unknown) { console.log(`      ${label}: ${JSON.stringify(value)}`); }
export function section(name: string) { console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`); }
export function report() {
  console.log(`\n${'='.repeat(64)}`);
  if (failures.length) { console.log('FAILURES:\n'); failures.forEach(f => console.log('  • ' + f + '\n')); }
  console.log(`${pass} passed, ${fail} failed`);
  return fail;
}

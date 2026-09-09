/**
 * Converting between a real instant and what an `<input type="datetime-local">`
 * shows.
 *
 * That input has no timezone: it shows and returns wall-clock time as the
 * person in front of it reads it. Everything stored here is an ISO instant,
 * so the two need translating in both directions — and the translation has to
 * happen in one place, or a time typed into one screen and read back on
 * another drifts by the offset.
 *
 * Shared rather than kept beside its first caller: maintenance job times and
 * a scheduled surprise visit are the same problem, and two copies of this
 * would eventually disagree.
 */

/** An instant as the local wall clock reads it, for a datetime-local input. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * A datetime-local value back as an instant, or null when the field is empty
 * or holds something unreadable — an empty field means "not given", which is
 * a meaningful answer rather than an error.
 */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

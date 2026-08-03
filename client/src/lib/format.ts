/** Small, pure display-formatting helpers shared across views. */

/** Format an integer number of paise as Indian-rupee currency, e.g.
 * 123400 -> "₹1,234". Fractional rupees are rounded away for display. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** Format a 0..1 similarity score as a whole-percent string, e.g.
 * 0.925 -> "93%". Values are clamped into range first. */
export function formatPercent(ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  return `${Math.round(clamped * 100)}%`;
}

/** Format an ISO timestamp as a short, readable date, e.g.
 * "2026-08-02T10:00:00Z" -> "2 Aug 2026". Returns the original string
 * unchanged if it isn't a parseable date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Pluralize a noun by count: countLabel(1, 'photo') -> "1 photo",
 * countLabel(3, 'photo') -> "3 photos". Pass an explicit plural for
 * irregular nouns. */
export function countLabel(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

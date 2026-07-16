// ProvisionalPill — the shared "month in progress; figures will change" header chip (UIR-01).
//
// Extracted so Home, Spending and Cost Centers stay in sync (they rendered identical markup).
// Uses the canonical calm-amber token idiom (dark+light safe, mirroring overspend-banner /
// reconcile-chip): `border-[var(--warning)]/25 bg-[var(--warning)]/10 text-[var(--warning)]` —
// NOT the hard-coded amber-50/200 that broke in dark mode (light-amber text on a fixed
// near-white surface, ~1.6:1, illegible).

export function ProvisionalPill() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-[var(--warning)]/25 bg-[var(--warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--warning)]"
      title="Month in progress; figures will change."
    >
      Provisional
    </span>
  );
}

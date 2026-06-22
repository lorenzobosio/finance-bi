# 01-SPIKE — Enable Banking discovery spike (ING-01)

**Status:** ✅ COMPLETE (2026-06-22). Both consents run live (Lorenzo + Fernanda). All
five unknowns resolved (see the runs below): A2 investing NOT exposed · A5 180-day window ·
A6 counterparty IBANs present · A3 only `entry_reference` (no `transaction_id`) · A4 no PEND.
Account-holder names are redacted to role labels here (public repo — no PII); the real
session (with names/IBANs) lives only in the gitignored `.secrets/` file.

## What this spike must resolve

These are the live-only unknowns the downstream plans (01-02 / 01-03 / 01-04) branch on.
They cannot be answered from docs — only from a real SCA run.

| Ref | Question | How the run answers it |
|-----|----------|------------------------|
| **A2** | Is the investing/securities account **exposed over PSD2**? | The `POST /sessions` `accounts[]` enumeration — the script flags any account whose name/type/usage looks like investing/securities/savings. Determines whether `investimento` is detected on the INCOMING leg (exposed) or via a VIRTUAL `is_investment=true` account on the OUTGOING leg (not exposed — the expected case, D-22). |
| **A5** | What is the **real consent window**? | `access.valid_until` from `POST /sessions` + Revolut's `maximum_consent_validity` from `GET /aspsps`. Drives `connections.expires_at` — read, never hardcoded (PSD2 ceiling is 180d since 2023-07-25). |
| **A6** | Are **creditor/debtor IBANs** returned for own-account transfers? | A captured `/accounts/{uid}/transactions` page — whether `creditor_account.iban` / `debtor_account.iban` are present. If absent, the transferência/investimento rules fall back to counterparty-name/description matching. |
| **A3** | Is `transaction_id` (else `entry_reference`) the **stable id**? | Which id field is present on the captured page — informs the `dedupe_hash` primary strategy vs the composite fallback. |
| **A4** | Do **PEND** rows appear? | Whether any `status="PEND"` rows are in the captured window — informs whether the "exclude PEND" policy is sufficient. |

## How to run (the handoff)

1. Wait ~1–2 min for the Vercel deploy of `/eb/callback` (the redirect target).
2. `set -a; . ./.env.local; set +a` then `pnpm eb:connect`.
3. Enter the person (Lorenzo), open the printed auth URL, log into Revolut, approve.
4. Copy the `code` shown on the `/eb/callback` page; paste it into the prompt.
5. The script enumerates the accounts, saves a gitignored session, writes scrubbed
   fixtures, and appends a `## Live run — Lorenzo` section below.
6. Re-run for Fernanda (one consent per Revolut login — D-08).

## Findings

*(Each `pnpm eb:connect` run appends a `## Live run — <person>` section here.)*


---

## Live run — Lorenzo (2026-06-22T08:12:36.939Z)

**ASPSP:** Revolut · **maximum_consent_validity:** 15552000s

### Exposed accounts (resolves A2)

| # | name | type | usage | currency | iban |
|---|------|------|-------|----------|------|
| 1 | Lorenzo — personal | CACC | PRIV | EUR | present |
| 2 | Joint (shared) | CACC | PRIV | EUR | present |

- **Investing/securities account exposed? NO** — investing account NOT exposed over PSD2 (the expected case) — investimento is detected on the OUTGOING leg via a VIRTUAL is_investment=true account row matched by counterparty IBAN/description (D-22).
- **Real consent window (resolves A5): `access.valid_until` = 2026-12-19T08:11:30.035000Z** — this drives `connections.expires_at`; read, never hardcoded.
- **Counterparty IBAN availability (resolves A6):** YES — creditor/debtor IBANs present on at least one tx.
- **Stable transaction id (informs A3):** only entry_reference present.
- **PEND rows (informs A4):** NO — only BOOK in this window.


---

## Live run — Fernanda (2026-06-22T08:57:52.009Z)

**ASPSP:** Revolut · **maximum_consent_validity:** 15552000s

### Exposed accounts (resolves A2)

| # | name | type | usage | currency | iban |
|---|------|------|-------|----------|------|
| 1 | Fernanda — personal | CACC | PRIV | EUR | present |

- **Investing/securities account exposed? NO** — investing account NOT exposed over PSD2 (the expected case) — investimento is detected on the OUTGOING leg via a VIRTUAL is_investment=true account row matched by counterparty IBAN/description (D-22).
- **Real consent window (resolves A5): `access.valid_until` = 2026-12-19T08:54:41.218000Z** — this drives `connections.expires_at`; read, never hardcoded.
- **Counterparty IBAN availability (resolves A6):** YES — creditor/debtor IBANs present on at least one tx.
- **Stable transaction id (informs A3):** only entry_reference present.
- **PEND rows (informs A4):** NO — only BOOK in this window.

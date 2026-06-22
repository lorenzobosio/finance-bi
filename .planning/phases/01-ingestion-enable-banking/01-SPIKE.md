# 01-SPIKE — Enable Banking discovery spike (ING-01)

**Status:** AWAITING LIVE RUN. The connect tooling (`pnpm eb:connect` + the deployed
`/eb/callback` page) is built and pushed. The interactive SCA at Revolut is a human step
(D-07/D-08): run `pnpm eb:connect` ONCE PER PERSON (Lorenzo, then Fernanda). Each run
appends a `## Live run — <person>` section below with the real findings and writes the
PII-scrubbed fixtures. **Do not finalize the plan SUMMARY until the sections below are
populated from a real run.**

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

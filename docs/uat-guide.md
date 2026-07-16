# User Acceptance Test (UAT) guide — Lorenzo & Fernanda

This is the friendly walkthrough the two of you do **together**, one screen at a
time, to decide whether the app feels finished and trustworthy. You are not testing
code — you are answering one simple question on every screen: *"Does this do what it
says, and does it feel good to use?"*

There are no wrong answers. If something confuses you, that is a finding, not a
mistake — write it down and move on. The whole point is to collect the small things
so they can be fixed.

---

## How to run this

- **Together, ~60–90 minutes.** Do it in one sitting if you can, with a coffee. It is
  meant to be relaxed, not a exam.
- **Two devices:** Fernanda drives on **her phone** (that is the real everyday
  device); Lorenzo follows on the **laptop**. Some tasks say "on the phone" or "on the
  laptop" — do those on the device named. When it does not say, either is fine.
- **Two versions of the app:**
  - the **real app** (the one you log into with Google — your actual money), and
  - the **public demo** (the no-login version with Alice & Bob's pretend data).
  - Use the **real app** for most tasks. When a task involves numbers you would rather
    not stare at, or a screen that looks empty because you have not launched yet, open
    the **demo** instead — it is always full of life. Each section says which to use
    when it matters.
- **One screen at a time.** Finish a whole section's table before moving on. Do not
  jump around — the order roughly follows the sidebar top-to-bottom.

## How to record your answers

Every check has a number (like `H1`, `G3`, `T2`) so you can refer to it later.

For each row:
1. Do the **Task** (the action in the left column).
2. Read the **Question** and decide together: is the answer yes?
3. Mark **Pass** if yes, **Fail** if no — and mark **Fail** also if it *sort of*
   works but felt wrong, slow, ugly, or confusing.
4. In **Comment**, write one plain sentence about anything you noticed — good or bad.
   A comment on a Pass is welcome ("liked this a lot").

You can mark answers straight in this file, in a notes app, or on paper. At the very
end there is a **punch-list** — copy every **Fail** (and any strong opinion) into it.
That list is what turns into the actual fixes.

> A note before you start: if a screen looks **empty or says you have not launched
> yet**, that is probably correct — the real app stays in a calm "waiting" state until
> you set your launch date in Config. If in doubt, open the **demo** to see what the
> screen looks like once it is full of data.

---

## H — Home (the dashboard)

*The first screen after you log in. Open the **real app** on the phone; if it looks
sparse, also glance at the **demo**.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| H1 | Open the app and let the Home screen load. | Does the page load in a couple of seconds without a broken or jumpy layout? | | |
| H2 | Find the **goal hero** — the big "how far to €100k" area near the top. | Can you tell at a glance roughly how far along you are, without reading small print? | | |
| H3 | Look at the **AI voice card** (the warm "Claude · date" note). | Does it read like a calm, friendly human sentence — not a robot dump of numbers — and is it dated? | | |
| H4 | Scan the row of **KPI cards** (this month's revenue, invested, costs, margin). | Do the four headline numbers read clearly and make sense together? | | |
| H5 | Find the **health scorecard** (the at-a-glance "is this month healthy" summary). | Is it obvious whether the month is doing well or not, using colour and words, not just a number? | | |
| H6 | On the **phone**, scroll the whole Home top to bottom. | Does everything fit the narrow screen — no sideways scrolling, no text cut off, buttons big enough to tap? | | |

---

## G — Goal (the €100k journey)

*The heart of the app. Open the **real app**; use the **demo** to see the sliders and
charts full of movement if your real numbers are still near zero.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| G1 | Open **Goal** from the sidebar. | Does one clear number/visual tell you how far you are from €100,000 invested? | | |
| G2 | Read the projected **arrival date / ETA** for reaching €100k. | Is there a plain-language "you'll get there around ___" that you understand? | | |
| G3 | Find the **what-if sliders** and drag the **+€/month** slider up to about **500**. | Does the arrival date move **immediately** as you drag, without reloading the page? | | |
| G4 | Drag the same slider back down to 0. | Does the date move back — i.e. the simulation is reversible and never changes your real saved numbers? | | |
| G5 | Find the two goal **buckets — Brazil and Adventures** — and open each one. | Does each bucket clearly show its own target and progress as a separate little goal? | | |
| G6 | Find the **valuation / EUR→BRL** figure (what the invested pot is worth, incl. a Brazil remittance view). | Is it clear this is a live-ish value in euros, with the Brazilian-reais view shown separately and labelled? | | |
| G7 | On the **phone**, try the sliders with your thumb. | Are the sliders easy to grab and drag on a touchscreen without zooming in? | | |

---

## S — Spending

*Where the month's money is going. **Real app**; **demo** if your month is empty.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| S1 | Open **Spending**. | Can you see, at a glance, the biggest categories you spent on this month? | | |
| S2 | Look at the category breakdown chart. | Are the categories labelled in plain words you recognise (not codes), and is the biggest one obvious? | | |
| S3 | Find where a month or period is shown/selected. | Is it clear **which month** you are looking at? | | |
| S4 | On the **phone**, view the same chart. | Does the chart shrink to fit the phone and stay readable (labels not overlapping into a mush)? | | |

---

## C — Cost Centers

*The "run the house like a business" view — Lorenzo / Fernanda / Shared, each with a
budget. **Real app**; **demo** for a fully-populated example.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| C1 | Open **Cost Centers**. | Can you see the three cost centers — Lorenzo, Fernanda, Shared — each as its own clear block? | | |
| C2 | For each person, compare **spent vs budget**. | Is it obvious for each person whether they are under or over their budget this month? | | |
| C3 | Find someone who is over budget (or check the demo, where Bob usually is). | Does going over budget show up clearly but **without feeling like a telling-off** (calm, not alarming red everywhere)? | | |
| C4 | On the **phone**, read all three centers. | Do the three blocks stack nicely on the narrow screen and stay easy to compare? | | |

---

## T — Transactions

*The full list of every transaction — the "power table". **Real app** (this is where
your true data lives).*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| T1 | Open **Transactions**. | Does the list load and show recent transactions with date, description, amount, and category? | | |
| T2 | Use a **filter** (e.g. pick a category, a cost center, or type in the search box). | Does the list update to match what you filtered, quickly and correctly? | | |
| T3 | Clear the filter. | Does the full list come back cleanly (no leftover filtered state, no empty screen)? | | |
| T4 | On the **laptop**, find the **CSV export** button and export. | Does a CSV file download, and does it contain the transactions you expected? | | |
| T5 | On **Fernanda's phone**, look for that same **CSV export**. | Is the export correctly **owner-only** — i.e. Fernanda does *not* see it, or it is clearly not offered on her view? | | |
| T6 | On the **phone**, scroll the transaction list. | Is the list usable on a phone — rows readable, no broken sideways scroll, amounts lined up? | | |

---

## A — Accounts

*Your connected Revolut accounts and balances. **Real app**.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| A1 | Open **Accounts**. | Can you see each connected account with its name and current balance? | | |
| A2 | Look for the **investment / virtual account** (the ETF pot tracked separately). | Is the invested pot shown and clearly labelled as the money working toward €100k? | | |
| A3 | Find the "last updated" / freshness indicator for the data. | Is it clear **when** the bank data was last refreshed, so you'd know if it were stale? | | |
| A4 | On the **phone**, view all accounts. | Do the account cards fit the phone and stay easy to read? | | |

---

## CF — Cashflow

*Money in vs out over time, plus the near-future forecast. **Real app**; **demo** to
see a rich recurring list and a full bills calendar.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| CF1 | Open **Cashflow**. | Can you see money coming in vs going out, and a sense of the trend? | | |
| CF2 | Find the **recurring list** (detected repeating payments like rent, subscriptions). | Are the repeating payments listed with amounts, and does the list look believable? | | |
| CF3 | On one recurring item, use **confirm** and on another use **dismiss**. | Does confirming/dismissing respond immediately and clearly, so you feel in control of the list? | | |
| CF4 | Find the **safe-to-spend** figure. | Is it clear how much you can spend now without touching money already promised to bills/investing? | | |
| CF5 | Open the **bills calendar** and the **projection** for the weeks ahead. | Can you see upcoming bills on a calendar and a plain forecast of where the balance is heading? | | |
| CF6 | On the **phone**, view the calendar and projection. | Do the calendar and forecast stay legible on the small screen? | | |

---

## HL — Health

*The overall "is our money behaving like a healthy business" scorecard. **Real app**;
**demo** for a fully-scored example.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| HL1 | Open **Health**. | Is there a clear overall verdict on how healthy this month is? | | |
| HL2 | Read the individual health checks (e.g. hit €4k contribution, stayed in budget, positive margin). | Does each check tell you in plain words whether it passed, and why it matters? | | |
| HL3 | Notice the colours/wording used for a failed check. | Is a failed check honest but **calm and encouraging** — never shaming? | | |
| HL4 | On the **phone**, read the whole scorecard. | Does it stack and stay readable on the phone? | | |

---

## CO — Config

*Your settings — budgets, health bands, and the all-important launch date. **Real
app** (these are your real settings — you can change them back after testing).*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| CO1 | Open **Config**. | Are the settings grouped sensibly with clear labels, so you know what each one does? | | |
| CO2 | Change a **budget** for one cost center, save, then go look at Cost Centers. | Did your new budget take effect where it should? (Then change it back.) | | |
| CO3 | Find the **launch date** setting. | Is it clear that this date is what "turns on" the streaks, forecasts and alerts — i.e. why it matters? | | |
| CO4 | Find the **health bands** (the thresholds for good/okay/bad). | Can you understand and adjust what counts as healthy, without needing a manual? | | |
| CO5 | Look for the **reconnect bank** area (see also the R section). | Is it clear where you'd go to reconnect the bank when the 90-day consent expires? | | |
| CO6 | On the **phone**, open Config and change one thing. | Are the inputs and buttons comfortable to use on the phone (no tiny tap targets)? | | |

---

## SH — The shell (things on every screen)

*The frame around every page — sidebar, command menu, theme, and banners. Test on
**both** the laptop and the phone.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| SH1 | On the **laptop**, click through every item in the **sidebar**. | Does each link go to the right page, and is the current page clearly highlighted? | | |
| SH2 | On the **phone**, open and close the navigation menu. | Does the menu open/close smoothly and cover the links without hiding content behind it? | | |
| SH3 | On the **laptop**, press **⌘K** (Cmd+K) and search for a page. | Does the command menu open, find pages as you type, and jump you there on Enter? | | |
| SH4 | Toggle **dark / light** mode. | Does the whole app switch cleanly — text stays readable, nothing turns invisible or low-contrast in either theme? | | |
| SH5 | Look at the top of the app for any **banners** (e.g. reconnect-needed, overspend, stale-data). | If a banner shows, is its message clear and does it tell you what to do — and can you dismiss it if appropriate? | | |
| SH6 | Read a few labels and the overall type. | Is the text a **comfortable size** to read on the phone (this was a known complaint — say honestly if it still feels small)? | | |

---

## P — PWA (installing the app on Fernanda's phone)

*Turning the website into a real app icon on the home screen. Do this on **Fernanda's
phone**, on the **real app**.*

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| P1 | On Fernanda's phone browser, use "**Add to Home Screen**" / the install prompt. | Does the app install and get its own icon and name on the home screen? | | |
| P2 | Open the app from the **home-screen icon**. | Does it open like a real app (full screen, no browser address bar cluttering the top)? | | |
| P3 | Turn on **airplane mode**, then open the app. | Does it show a friendly offline screen instead of a scary browser error? | | |
| P4 | Turn airplane mode back off and reopen. | Does the app come back to life and load fresh data normally? | | |
| P5 | If an **"update available"** prompt appears after a new deploy, tap it. | Does the app update smoothly to the newest version? *(Skip if no prompt appears — note that.)* | | |

---

## R — Reconnecting the bank (consent renewal)

*Every ~90 days the bank makes you re-approve access. This section checks that flow is
understandable. Only fully testable when a reconnect is actually due — otherwise just
check that the entry point and messaging make sense.*

> **Heads-up (expected):** the reconnect screen at `/eb/callback` may currently show a
> **command-line style fallback** message instead of the polished screen, until the
> Enable-Banking settings are added to the live deploy. If you see that, it is a
> **known pending item** — note it as such rather than a surprise bug.

| # | Task (do this) | Question (should be true) | Pass/Fail | Comment |
|---|----------------|---------------------------|-----------|---------|
| R1 | Find where the app tells you to **reconnect** (a banner and/or the Config area). | Is it clear, in plain words, that the bank connection needs renewing and roughly when? | | |
| R2 | Start the reconnect flow (tap the reconnect action). | Does it explain what will happen (you'll approve access with the bank again) before sending you off? | | |
| R3 | If you reach the `/eb/callback` screen, read what it says. | Is it either a clear success/finish screen — **or** the known CLI-fallback note that you recognise from the heads-up above? | | |
| R4 | Think about the tone of the whole reconnect ask. | Does it feel routine and calm (a normal 90-day chore), not alarming or like something is broken? | | |

---

# Punch-list (this is the deliverable)

When you finish, go back through every **Fail** — and any Pass where you had a strong
opinion — and add one row per issue below. Keep each row short; the goal is a clear,
actionable list, not an essay.

- **#** — use the check's code (e.g. `T5`, `G3`) plus a letter if one check produced
  more than one issue (`T5a`, `T5b`).
- **Page** — which screen (Home, Goal, Transactions, Shell, PWA…).
- **Problem** — what was wrong, in one sentence, in your own words.
- **Suggested fix** — what you'd want instead (a guess is fine; "not sure" is fine).
- **Priority** — **fix-now** (it makes the app feel broken, wrong, or untrustworthy)
  or **defer** (a nice-to-have or polish that can wait).

| # | Page | Problem | Suggested fix | Priority (fix-now / defer) |
|---|------|---------|---------------|----------------------------|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

## How to triage (deciding fix-now vs defer)

Mark it **fix-now** if any of these are true:
- A number looks **wrong or untrustworthy** (the app's one job is to be correct about
  the €100k picture — treat any wrong figure as fix-now).
- Something is **broken or unreachable** (a button does nothing, a page won't load, a
  link goes to the wrong place).
- Text is **unreadable** on the phone, or a colour makes text vanish in dark or light
  mode.
- Fernanda **couldn't complete a core task** on her own (install, reconnect, change a
  budget, understand the goal).

Mark it **defer** if it's real but not urgent:
- Polish, spacing, wording preferences, "would be nicer if…".
- Anything that needs a **new feature** to fix (out of scope for this pass).
- The known **`/eb/callback` CLI fallback** until the live Enable-Banking settings are
  added — that is a pending setup item, already tracked.

When you're unsure, put it in and mark it **fix-now** — it's easier to demote a row
later than to lose a real problem. Hand the finished list back and it becomes the
prioritized set of fixes.

---

*You did the whole app. Thank you — this is exactly how it gets to feel finished.*

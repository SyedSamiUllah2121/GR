@AGENTS.md

# Inspection Log (Royal Gujrat)

Weekly food-safety and service inspection app for a nine-branch restaurant
estate, with a maintenance board and appliance register. Next.js 16 (App
Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, `motion` for
animation, `lucide-react` for icons. There are no other dependencies and no
external services or API keys (the AI Studio Gemini setup was removed; do not
add it back).

- `README.md` — what the app does and how to run it, for anyone new.
- `docs/design-notes.md` — why the asset register, schedule, job board and
  asset matching work as they do. Read it before changing those.
- This file — what you need to work in the code.

## Guardrails: changing system logic

The people asking for changes here are often not developers, and a request
that sounds like a small tweak ("let managers close their own jobs", "count
N/A as a pass") can change who may do what, how a branch is scored, or
whether records survive the next page load. So before changing any of the
logic below, **stop and warn first. Do not edit until the user has said yes.**

### What counts as system logic

- **Permissions.** `permissions.ts`, and anything deciding who sees or does
  what. This includes the branch narrowing in `session.ts`.
- **Sign-in.** `session.ts`, `authenticate()`, the demo sign-in switch and
  password rules.
- **Scoring.** How an inspection is scored and passed: `calculatedScore` in
  `ReviewScreen.tsx`, severity and photo rules in `priority.ts`, and what
  `reportModel.ts` and `dashboardModel.ts` count.
- **The checklist's meaning.** Reason groups, severities, which group raises
  a maintenance job (`maintenanceIntake.ts`), archiving, and the
  `nextItemId` / `idBase` numbering. Wording changes to a check are not
  system logic.
- **Scheduling.** The Monday round (`mondaySchedule.ts`), service cadences
  and due dates (`maintenanceSchedule.ts`, `maintenancePlanStore.ts`,
  `generalMaintenance.ts`), and surprise-visit rotation and assignment
  (`assignments.ts`, `settings.ts`).
- **The job lifecycle.** How jobs are raised, deduplicated, started, closed
  and reopened, and what closing a job writes back to the asset register.
- **Storage.** Any localStorage key name, any seed, migration or purge
  (`estateReset.ts`, `SEED_VERSION`, `RETIRED_SEEDS`, `CORRECTED_SEEDS`,
  `CHECKLIST_KEY`), and the shape of a stored record in `types.ts`.
- **Identity.** How ids are derived: asset numbers, equipment ids, scheduled
  job ids, and asset matching in `assetForCheck`.

Wording, colours, layout, spacing, icons and animation are not system logic.
Change those without the warning, but still follow the UI conventions below.

### The workflows

These are the journeys the business runs on. A change that removes a step,
reorders steps, skips a check, moves a step to another role, or stops one
journey feeding the next **breaks a workflow**, even if every screen still
loads.

1. **Monday round.** A branch manager starts this week's round, fills in
   the checklist, reviews, signs and submits it, and gets a summary and a
   printable report. The dashboard shows the branch as done, or late.
2. **Surprise visit.** The admin books a visit; the branch and inspector
   are chosen automatically or by hand. The inspector sees it, carries it
   out and submits it. Only that inspector and the admin see it.
3. **Failed check to repair.** A failed MAINTENANCE check on a submitted
   inspection raises a job naming the unit. The maintenance manager starts
   and closes it with a note and photos, and closing it updates the asset's
   status on the register.
4. **Reported problem.** A branch manager reports a fault on any day. It
   lands on the board, and they can follow it but not close it.
5. **Scheduled service.** A service falls due on its cadence and raises
   exactly one job. Finishing it restarts the clock from the day the work
   was done.
6. **Month-end.** The month-end report counts problems and services
   separately, per branch, filed under the month the work belongs to.
7. **Accounts.** Sign in; a manager with two branches switches between
   them, and every screen follows the switch. The admin creates and resets
   accounts from `/users`.

The element ids listed under UI conventions are how the end-to-end tests
walk these journeys. Renaming or removing one breaks the tests even when
the screen looks fine.

### The warning

Before the first edit, start the reply with a clearly marked warning. Use
**"⚠ This breaks the <name> workflow"** when a journey above stops working
as described, and **"⚠ This changes the system's logic"** otherwise. Then
say in plain words, without code:

1. **Which workflow or rule changes,** by its name from the lists above.
   Say which step breaks and what a user will run into.
2. **What happens today,** and what will happen after the change.
3. **Who it affects:** which roles, which branches, every browser or only
   new records.
4. **What happens to data already saved.** Will existing inspections,
   jobs, scores or accounts read differently, need migrating, or be lost?
   Remember that seeds only reach empty stores, and a renamed key strands
   whatever was saved under the old name.
5. **What is hard to undo.** A purge or migration that runs on page load
   runs in every browser that opens the live site, and cannot be called
   back once it has.

Then wait for a clear yes. If the request is vague, ask what they actually
want rather than guessing at the logic. If a safer change gets them the same
result, for example a setting instead of a rule change, an archive instead
of a delete, or a new key instead of a rewritten one, offer it.

### While making the change

- **Tests.** Run `npm run lint` and `npm test`. If a test fails because it
  encodes the rule being changed, say so and name the test before updating
  it. Never weaken or delete a test just to get a pass.
- **Comments and notes.** Update the block comment that explains the rule,
  and `docs/design-notes.md` if the rule is described there. A comment that
  still argues for the old behaviour is worse than none.
- **Changes deliberately undone.** Many rules exist because the opposite
  was tried and went wrong; their comments and the design notes say so.
  If a change undoes one of those, quote that reason to the user before
  going ahead.
- **Reporting.** In the final message, say plainly which rule changed and
  what existing data will do.

## Commands

```bash
npm run dev     # http://localhost:3000
npm run build   # production build — also type-checks
npm run lint    # tsc --noEmit (there is no ESLint)
npm test        # every src/__tests__/*.mts suite, each in its own process
```

Run `npm run lint` and `npm test`, and add the change to **Project
history** at the end of this file, before calling a change done. Run a single
suite with `npx tsx src/__tests__/m-branch-managers.mts`.

## There is no backend

Everything is in the browser's `localStorage` (session in `sessionStorage`).
Each store under `src/services/` owns its keys, reads through
`ensureEstate()` first, and dispatches its own change event. Hooks under
`src/hooks/` subscribe to those events.

Consequences to keep in mind:

- Data is per browser and per origin. An account created on localhost does
  not exist on the Vercel site, and one device never sees another's records.
- Writes can fail when storage is full. Every store write returns a result
  (`boolean` or `{ ok, error }`). Callers must check it and show the failure;
  never report success on a write you did not check. Photos go through
  `readImageFile` in `photoFile.ts`, which shrinks them first.
- Seeds are only written to an empty store. Changing seed data for existing
  browsers needs a migration. See `SEED_VERSION`, `RETIRED_SEEDS` and
  `CORRECTED_SEEDS` in `userStore.ts`.
- The checklist is the same: `DEFAULT_CHECKLIST` in `defaultChecklist.ts` is
  only read when its store is empty. To ship a new checklist to browsers that
  already have one, bump `CHECKLIST_KEY` in `checklistStore.ts` (now `_v3`)
  and note why in the comment above it.
- The live checklist is the `standard` list (the CHECKLIST STANDARD sheet,
  nine categories, 76 checks). Lists and items it replaced are marked
  `archived`, never deleted, because past inspections still render against
  them.
- Passwords are stored in plain text. `authenticate()` is the only reader.

## Where things are

- `src/app/` — routes only. Each `page.tsx` renders one screen component.
- `src/components/` — screens (`*Screen.tsx`) and shared pieces.
  - `ui.tsx` — `Card`, `Panel`, `PanelHeader`, `PageHeader`, `BUTTON` classes.
    Build new screens from these.
  - `charts.tsx` — `TrendChart`, `BarList`, `StackedMeter`, `ScoreDial` and
    `CHART_COLORS`.
  - `motion.tsx` — `Reveal`, `Stagger`, `StaggerItem`, `CountUp`, `TEMPO`,
    `t()`, `SPRING`, `EASE_OUT`.
- `src/services/` — all logic and storage.
  - `permissions.ts` — the only place that decides who may do what. Screens
    call `can()`, `canViewInspection()` and so on; never check roles inline.
  - `session.ts` — sign-in, and `currentUser()`.
- `src/types.ts` — shared types, plus `BRANCHES` and `branchesOf()`.
- `src/data/` — seed data: checklist, asset register, plans, categories.
- `src/__tests__/` — node test suites. `harness.mts` fakes `localStorage`.

## Accounts and branches

- Four roles: `admin`, `branch-manager`, `job-manager` (shown as Maintenance
  Manager) and `inspector`.
- A user's sign-in name is stored in `email`. It can be an email address or a
  plain username. Matching ignores case and spaces; passwords must match
  exactly.
- Branch managers use their name run together, plus `123` as the password
  (`Parvezuddin` / `Parvezuddin123`). The full list is in `SEED_USERS`.
- A manager can run more than one branch (`User.branchNames: string[]`).
  Always read it through `branchesOf(user)`.
- A manager with two branches works on one at a time. `currentUser()` returns
  the account narrowed to the branch chosen in the top-bar switcher (stored
  per tab), so every screen and permission follows the switch. Use
  `switchableBranches()` for the full list.
- The demo sign-in shortcuts (`123` / `123` and "Or sign in as") are on unless
  the app is built with `NEXT_PUBLIC_DEMO_SIGN_IN=false`.

## UI conventions

- **Colours.** Brand red `#C8202D` is for actions and alerts only. Status
  colours are green `#157F4B`, amber `#B4740A` and red `#C8202D`. Text is
  `#17181D`, secondary text `#6B6F76`, muted text `#9CA1A9`.
- **Surfaces.** Cards are white, `rounded-2xl`, with a `#E8E9EE` border and
  a soft shadow. Use `Card` or `CARD` from `ui.tsx`.
- **Charts.** Use the colours in `CHART_COLORS`; they were checked for
  colour-blind contrast.
  - One colour for a single measure.
  - A one-hue light-to-dark ramp for severity.
  - Status colours only for status.
  - Text never takes the data colour.
  - A legend whenever there are two or more series. Never a second y-axis.
- **Motion.**
  - Every duration and delay goes through `t()`, so `TEMPO` in `motion.tsx`
    sets the speed of the whole app. Never write a bare number in seconds.
  - Anything that moves uses `SPRING`.
  - `MotionConfig` turns motion off for users who ask for reduced motion.
  - Never wrap a `position: fixed` dialog or a `position: sticky` bar in
    `Reveal` or `Stagger`: a transform on an ancestor breaks both.
  - Pages rendered on the server (the login page) use the CSS
    `.animate-rise` keyframe instead, so they are not invisible until
    scripts load.
- **Errors.**
  - Show a refusal next to the button that caused it, not at the top of a
    long form.
  - Toasts: `showToast(msg)` for success, `showToast(msg, 'error')` for
    failure.
- **Phone width.** Check every layout at 390px. Nothing may scroll
  sideways.
- **Element ids.** The end-to-end journeys depend on them
  (`#login-submit-btn`, `#topbar-branch`, `#checklist-review-btn`,
  `#user-form-save` and so on). Do not rename or remove ids.

## Code style

Match the surrounding code. The codebase explains *why* in block comments
above non-obvious decisions. Keep those comments accurate when you change
what they describe, and write new ones in the same voice.

## Deploying

- **faaaiz05/gujrat-restaurants-os** is `origin`.
- **SyedSamiUllah2121/GR** is the `gr` remote. Vercel deploys it to
  https://gr-one-eta.vercel.app.
- Push `main` to both.
- Vercel reads `NEXT_PUBLIC_DEMO_SIGN_IN` at build time; `.env.local` is
  gitignored and never reaches the site.

## Project history

**Rule: every change to the project adds an entry here, in the same commit
as the change.** A change is not done until it is recorded. This covers code,
data, docs and configuration, by anyone.

- Newest first, under a heading for the date (`### 2026-10-08`).
- One line per change, in plain words a non-developer can follow: what
  changed and why it matters. Not file names or function names.
- Start the line with **⚠** if it changed a workflow or system logic (see
  Guardrails), and say what happens to data already saved.
- Never rewrite or delete a past entry. Correct one by adding a new entry.
- **Before starting work,** compare `git log` with the newest entry here. If
  there are commits not recorded (changes made by hand, in another tool, or
  pulled from the other remote), add entries for them first, in the same
  style.

### 2026-10-09

- Renamed the brand from Royal Gujrat to Gujrat Group on the logo, the
  sign-in screen and the sidebar. The emblem and the "Restaurant & Sweets"
  line are unchanged, and the Royal Gujarat branch keeps its name.

### 2026-10-08

- Added this Project history, written back to the first commit, and the
  rule that every change to the project adds an entry here.
- Added guardrails to the README, so builders who never open this file see
  the protected workflows and the rules for changing them.
- Named the seven core workflows in this file. Claude must now warn
  "This breaks the <name> workflow" before a change that stops one working.
- Added guardrails: before changing permissions, sign-in, scoring,
  schedules, the job lifecycle, storage or ids, Claude must warn in plain
  words and wait for a yes.
- Brought this file up to date with the new checklist, the docs and the
  removed AI setup.
- Rewrote the README for someone new to the project. The design reasoning
  moved word for word to `docs/design-notes.md`.
- Removed the Gemini / AI Studio setup (package, API key placeholders,
  capability flag). The app never used it and needs no API keys.
- ⚠ Replaced the checklist with the CHECKLIST STANDARD sheet: 76 checks in
  nine categories. The old lists are archived, so past reports still open.
  Every browser picks up the new list (storage key moved to `_v3`); checklist
  edits made in the app before this are not carried over.

### 2026-09-29

- Redesigned every screen, with real charts and motion.
- ⚠ Gave the branches their real managers (seven managers over nine
  branches; some run two). Invented manager accounts are retired on the next
  load. Every refusal is now shown next to the button that caused it.

### 2026-09-22

- The newest job now appears at the top of the job board.
- Brought back the "Sign in as" role switcher, with a build setting to turn
  it off.
- ⚠ Opened maintenance to branch managers (report and follow repairs at
  their own branch), and closed permission gaps that had no check.

### 2026-09-21

- ⚠ Stopped the register's status stamps from raising jobs on their own,
  and made jobs name the exact unit.
- ⚠ Loaded the estate's real asset register (302 assets across nine
  branches) and deleted the invented demo data. Existing browsers were
  cleared once on their next load.

### 2026-09-14

- Every page and dialog can now be reached and used by keyboard.

### 2026-09-12

- A failed check asks which unit before asking what is wrong with it.
- Branches can write their own equipment categories, and services are
  scheduled by category.

### 2026-09-11

- ⚠ Equipment is tracked on a servicing schedule, and branches can report
  repairs.

### 2026-09-09

- Fixed the Details button only showing on hover.
- Surprise visits can be booked for a time window, not just a moment.
- ⚠ Surprise visits rotate across branches; the admin can book them and
  turn automatic booking off.
- Fixed the checklist editor saving a question with no text.
- Removed seven unused imports.
- ⚠ Added a Job Manager role (now Maintenance Manager) over the
  maintenance board.
- ⚠ Inspectors can route findings to maintenance.

### 2026-09-08

- ⚠ Added user roles, surprise visits and locked results.
- Rebranded to Royal Gujrat, and split inspections from maintenance.

### 2026-09-07

- Added a dashboard and a maintenance module.
- Showed the score in the report's donut chart, with animation.
- Added an editable checklist, issue priorities and a detailed inspection
  report.

### 2026-09-04

- Moved the app from a Vite single-page app to Next.js 16.

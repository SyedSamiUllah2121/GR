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

## Commands

```bash
npm run dev     # http://localhost:3000
npm run build   # production build — also type-checks
npm run lint    # tsc --noEmit (there is no ESLint)
npm test        # every src/__tests__/*.mts suite, each in its own process
```

Run `npm run lint` and `npm test` before calling a change done. Run a single
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

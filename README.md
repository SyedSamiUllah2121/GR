# Inspection Log

Weekly restaurant hygiene and service inspection log, built with **Next.js 16** (App Router),
React 19, TypeScript and Tailwind CSS 4.

Inspection records are stored in the browser via `localStorage` — there is no backend or database.

## Run locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

Demo sign-in — email `123`, password `123`, which is the Main Admin.

## Roles

Four account types. Permissions are listed one at a time in
`src/services/permissions.ts`, which is what every guarded route and hidden
button asks — they are not derived from an ordering, because the roles do not
nest: an inspector may submit a visit at any branch where a branch manager may
not, and a job manager works across every branch while seeing none of their
inspections.

| Role           | Reach                                                         | Demo sign-in                            |
| -------------- | ------------------------------------------------------------- | --------------------------------------- |
| Main Admin     | Everything: all branches, records, accounts, checklist, jobs  | `admin@royalgujrat.com` / `admin123`    |
| Branch Manager | Their own branch, and its Monday round                        | `zahras@royalgujrat.com` / `branch123`  |
| Job Manager    | The whole maintenance board, every branch                      | `jobs@royalgujrat.com` / `jobs123`      |
| Inspector      | Only the surprise visits assigned to them                     | `rahman@royalgujrat.com` / `visit123`   |

A surprise visit can be booked for a time — the **When** field on the form —
in which case the inspector sees it due then and it is flagged late if that
time passes unstarted. Left empty, it is due as soon as they can get there.

Surprise visits can be placed by the system: the branch is drawn from a
rotation that deals every branch once before repeating any, and the inspector
from whoever is carrying the fewest outstanding visits. The Main Admin can
turn this off with the **Automatic assignment** switch on the surprise-visit
form, after which the branch and inspector are named by hand on every visit.

A Job Manager has the maintenance module in full — the board, the overview,
the month-end report, and starting, ending, re-timing, reopening, deleting and
raising jobs. They have no inspections list, but may open the report of an
inspection that raised a job, since a repair whose origin cannot be read is a
repair taken on trust. Records that raised nothing stay out of reach.

The admin creates Branch Manager, Job Manager and Inspector accounts from
`/users`. A second Main Admin is not something that screen mints.

Because seed accounts are only written to an empty store, an installation
already in use will not gain the Job Manager demo account — create one from
`/users` instead.

## Scripts

| Script          | What it does                                  |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Start the dev server on port 3000              |
| `npm run build` | Production build                               |
| `npm run start` | Serve the production build                     |
| `npm run lint`  | Typecheck with `tsc --noEmit`                  |

## Routes

| Route                            | Screen                              |
| -------------------------------- | ----------------------------------- |
| `/`                              | Redirects to `/inspections` or `/login` |
| `/login`                         | Sign in                             |
| `/inspections`                   | Records list                        |
| `/inspections/new`               | Start a new inspection              |
| `/inspections/[id]/checklist`    | Section-by-section checklist        |
| `/inspections/[id]/review`       | Review, sign and submit             |
| `/inspections/[id]`              | Printable report                    |

## Project structure

```
src/
  app/                    App Router routes, layouts and global CSS
    inspections/          Auth-guarded area (sidebar shell + toast provider)
  components/             Screen and UI components
  data/                   Checklist templates and seed records
  hooks/                  useMounted (client-only render guard)
  services/storage.ts     localStorage persistence layer
  types.ts                Domain types, reason groups and branches
```

Everything under `/inspections` is client-rendered: the auth check and all inspection
data come from `localStorage`, so those screens wait for mount before rendering.

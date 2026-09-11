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
| Branch Manager | Their own branch: its Monday round, its repairs and its assets | `zahras@royalgujrat.com` / `branch123`  |
| Maintenance Mgr| The whole maintenance board, every branch                      | `jobs@royalgujrat.com` / `jobs123`      |
| Inspector      | Only the surprise visits assigned to them                     | `rahman@royalgujrat.com` / `visit123`   |

A surprise visit can be booked for a time — the **When** field on the form —
in which case the inspector sees it due then and it is flagged late if that
time passes unstarted. Left empty, it is due as soon as they can get there.

Surprise visits can be placed by the system: the branch is drawn from a
rotation that deals every branch once before repeating any, and the inspector
from whoever is carrying the fewest outstanding visits. The Main Admin can
turn this off with the **Automatic assignment** switch on the surprise-visit
form, after which the branch and inspector are named by hand on every visit.

A Branch Manager reports repairs at their own branch on any day, not only
inspection day: **Maintenance** in the sidebar, or **Report a repair** on the
dashboard, opens the job board narrowed to their branch, and **Report a
problem** puts a fault on it there and then. Equipment does not wait for the
round, and before this the only way onto the board was a failed Monday check —
so a chiller that went on the Tuesday went unrecorded until the following week.

What they do not get is the running of the repair. Starting, ending, re-timing,
reopening and deleting a job stay with maintenance, because a branch that could
close its own jobs could mark a repair done that nobody carried out. They raise
it, and they watch it: the job's timeline says where it has got to. The
estate-wide overview and the month-end report stay out of reach as well.

## Equipment and scheduled maintenance

Each branch's assets — chillers, air conditioners, printers — are recorded
individually on **Maintenance → Equipment**, with serial number, make, model,
location and install date. Paste a whole appliance list in with **Import a
list**: comma separated, one asset per line, columns in the order the dialog
shows. Only branch and name are required. An asset already on record is
corrected rather than added twice, matched on an id derived from its branch
and name, so a corrected spreadsheet can be pasted again without doubling the
register. Rows that cannot be read are reported by line number instead of
being dropped — an impossible date such as `2026-02-30` is refused rather
than silently rolled forward to 2 March, because the schedule counts from it.

**Maintenance → Schedule** holds the recurring services, written per category
rather than per asset: printers serviced every 3 months and their toner every
6, refrigeration every 6, gas and fire safety yearly. Every asset in the
register under that category follows its category's plan. An individual asset
that genuinely differs carries an override on its own record, including being
exempted outright — the display fridge that is on a contract.

When a service falls due the job appears on the board by itself. There is no
server and nothing runs on a timer, so this is worked out each time the app is
opened. That is safe because a scheduled job's id is derived from its plan, its
asset and the date it was due — so the same occurrence can never raise two
jobs, however many tabs are open or however long the app was shut. A service
is dated the day it fell due, not the day it was noticed, so the month-end
report files it under the right month.

A long gap raises **one** job, not one per missed interval: a quarterly plan
last serviced two years ago produces a single overdue job, because nobody is
going to carry out eight retrospective services and a board saying otherwise
would be noise. Finishing a service restarts the interval from the day the
work was done.

Jobs carry a **kind** — a problem report or a scheduled service — filtered on
the board and marked on the job. The distinction is not cosmetic: the
**Repeated** tab counts only breakdowns, or a printer serviced on time would
top the list of repeat offenders four times a year, and the month-end report
counts problems and services in separate columns, or a branch that looks after
its equipment would read as a branch that keeps breaking it.

A Branch Manager reads their own branch's register and sees what is due on it,
but cannot change it: an interval is an estate-wide commitment about how often
the contractor comes, and is the admin's and the Maintenance Manager's to set.

A Maintenance Manager has the maintenance module in full — the board, the
overview, the month-end report, and starting, ending, re-timing, reopening,
deleting and raising jobs. They have no inspections list, but may open the
report of an inspection that raised a job, since a repair whose origin cannot
be read is a repair taken on trust. Records that raised nothing stay out of
reach.

Closing a job takes photographs as well as a note — the receipt, and the work
once it is finished, up to six. They are what turn a typed-in cost into a
figure someone can check, and they show on the job beside the fault photo the
inspection raised it with. Pictures are scaled down before they are kept,
because the whole app shares one small browser store and a photo straight off
a phone would fill it; if a write will not fit, closing the job is refused
with a message rather than quietly losing the record.

The role is stored under its older key, `job-manager`. Only the name changed —
renaming the key would have stranded accounts already saved in a browser.

The admin creates Branch Manager, Maintenance Manager and Inspector accounts from
`/users`. A second Main Admin is not something that screen mints.

Because seed accounts are only written to an empty store, an installation
already in use will not gain the Maintenance Manager demo account — create one from
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

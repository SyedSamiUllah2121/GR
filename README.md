# Inspection Log — Royal Gujrat

A web app for running food-safety inspections and equipment maintenance
across a restaurant group of nine branches in Abu Dhabi.

Every branch is inspected against the same checklist each week. Anything that
fails is scored, signed off and kept on record, and a broken piece of
equipment found during an inspection goes straight onto a maintenance board
where it is tracked until it is fixed.

**Live demo:** https://gr-one-eta.vercel.app

---

## What it does

**Inspections**

- **Weekly Monday round.** Each branch manager inspects their own branch
  every Monday. The dashboard shows which branches have done this week's round
  and which are late.
- **Surprise visits.** The admin books an unannounced visit and an inspector
  carries it out. The app can choose the branch and the inspector itself,
  spreading visits evenly across branches and inspectors.
- **One standard checklist.** It has 76 checks in nine categories: staff
  hygiene, premises, handwashing, kitchen hygiene, dry storage, chilled
  storage, dishwashing, documentation and pest control. Each check is graded
  by severity, and the admin can edit the checklist from the **Checklist**
  screen.
- **Score, review and sign.** A finished inspection gets a percentage score.
  The person who did it reviews and signs it, and it becomes a printable
  report.

**Maintenance**

- **Job board.** Every repair and service job in one place, newest first,
  from reported through in progress to done. When a maintenance check fails
  on the Monday round, the app creates a job for it. A branch manager can also
  report a problem on any day.
- **Appliance register.** The group's real equipment list: 302 assets (air
  conditioners, chillers and electrical equipment), each with its own asset
  number such as `RG-ACU-008`.
- **Service schedule.** Regular services fall due by themselves. Air
  conditioning is every 45 days, refrigeration quarterly and electrical every
  six months.
- **Month-end report.** Repairs and services for each branch, counted
  separately.

## Who uses it

| Role | What they can do |
| ---- | ---------------- |
| **Main Admin** | Everything: every branch, every record, user accounts, the checklist and the maintenance board. |
| **Branch Manager** | Runs their own branch's Monday round and reports repairs there. A manager with two branches switches between them from the top bar. |
| **Maintenance Manager** | Runs the maintenance board for every branch: starts, finishes and reschedules jobs, and reads the month-end report. |
| **Inspector** | Sees and carries out only the surprise visits assigned to them. |

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/SyedSamiUllah2121/GR.git
cd GR
npm install
npm run dev
```

Then open **http://localhost:3000**.

### Signing in

The quickest way in is `123` / `123`, which signs in as the Main Admin. On
the sign-in page, **Or sign in as** lets you try each role with one click.

| Who | Sign-in name | Password |
| --- | ------------ | -------- |
| Main Admin | `admin@royalgujrat.com` | `admin123` |
| Maintenance Manager | `jobs@royalgujrat.com` | `jobs123` |
| Inspector | `rahman@royalgujrat.com` | `visit123` |
| Branch Manager | their name with no spaces, e.g. `Parvezuddin` | the same name followed by `123`, e.g. `Parvezuddin123` |

The other branch managers are `AliBarakat`, `MusaShafqat`,
`MehranShahabuddin`, `Mr.Altaf`, `MuhammadArshaan` and `FarooqKhan`. Sign-in
names ignore capital letters and spaces. Passwords do not.

These are starting accounts for trying the app. The admin can change any
password from the **Users** screen.

## Where the data is kept

There is no server or database. Everything is saved in the web browser
(`localStorage`). This means:

- **Each browser has its own data.** An inspection recorded on one phone does
  not appear on another device, and data on `localhost` is separate from the
  live site.
- **Clearing the browser's site data deletes the records.**
- **Storage is limited to a few megabytes per browser.** Photos are shrunk
  before they are saved, and if something still won't fit, the app shows an
  error rather than losing it silently.
- **Passwords are stored as plain text** in the browser.

This suits a demonstration or a pilot on one device. Using it across the
whole group with shared records would need a backend.

### Turning off the demo shortcuts

The `123` / `123` shortcut and the **Or sign in as** buttons let anyone with
the link in as the admin without a password. They are on by default. For a
deployment holding real records, set this environment variable and rebuild:

```
NEXT_PUBLIC_DEMO_SIGN_IN=false
```

It is read when the app is built, so the setting only takes effect after a
redeploy. See [.env.example](.env.example).

## Commands

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm run build` | Production build (also checks the types) |
| `npm run start` | Serve the production build |
| `npm run lint` | Check the types (`tsc --noEmit`) |
| `npm test` | Run every test suite |

## Built with

[Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript,
Tailwind CSS 4, [Motion](https://motion.dev) for animation and
[Lucide](https://lucide.dev) for icons. No other services, accounts or API
keys are needed.

## How the code is organised

```
src/
  app/            One folder per page (dashboard, inspections, maintenance,
                  checklist, users, login)
  components/     The screens (*Screen.tsx) and shared pieces
    ui.tsx          Cards, panels, page headers and buttons
    charts.tsx      Charts and their colours
    motion.tsx      Animation timing
  services/       All the logic and storage, one store per kind of record
    permissions.ts  The only place that decides who may do what
    session.ts      Sign-in and the current user
  data/           Starting data: the checklist, the asset register,
                  service plans and accounts
  types.ts        Shared types and the list of branches
  __tests__/      Test suites (run with npm test)
docs/
  design-notes.md Why things work the way they do
```

### Pages

| Address | Page |
| ------- | ---- |
| `/login` | Sign in |
| `/dashboard` | Overview of this week's rounds, scores and open jobs |
| `/inspections` | All inspection records |
| `/inspections/new` | Start an inspection or book a surprise visit |
| `/inspections/[id]/checklist` | Fill in the checklist |
| `/inspections/[id]/review` | Review, sign and submit |
| `/inspections/[id]/summary` | Result after submitting |
| `/inspections/[id]` | Printable report |
| `/maintenance` | Maintenance overview |
| `/maintenance/jobs` | Job board |
| `/maintenance/[id]` | One job and its timeline |
| `/maintenance/equipment` | Appliance register |
| `/maintenance/schedule` | Service schedule |
| `/maintenance/report` | Month-end report |
| `/checklist` | Edit the inspection checklist |
| `/users` | Manage accounts |

## Tests

`npm test` runs 13 suites in Node with a stand-in for the browser's storage,
so no browser is needed. They cover the asset register, the service schedule,
the job board, permissions, surprise-visit assignment, submitting an
inspection, full storage and the branch-manager accounts. Each suite runs in
its own process so that one cannot affect another.

## Deployment

The live site is hosted on [Vercel](https://vercel.com) and redeploys
automatically on every push to `main` of this repository.

## Before you change anything

Some changes alter how the business runs, not just how a screen looks: who
may do what, how an inspection is scored, the steps of the Monday round or
a repair, and where records are stored. Changes like these can break a
workflow or affect records already saved in every browser.
[CLAUDE.md](CLAUDE.md) lists the protected workflows and system logic, and
what to check before changing them. Read it first, whether you are making
the change yourself or with an AI coding assistant. Claude Code reads it
automatically and warns before it touches any of them.

## Further reading

[docs/design-notes.md](docs/design-notes.md) explains the decisions behind
the asset register, the service schedule, the job board and asset matching.
It is useful reading before changing any of them.

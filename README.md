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

Demo sign-in — email `123`, password `123`.

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

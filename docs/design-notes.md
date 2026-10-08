# Design notes

Why the app works the way it does. The [README](../README.md) says what the
app is and how to run it; this file is for whoever has to change it, and
explains the decisions that look odd until you know the reason.

## The asset register

The estate's real register ships with the app: **302 assets across nine
branches**, transcribed from the AC, chiller and electrical master documents
dated 17 September 2026.

| Segment | Assets | Numbering | Trade |
| ------- | ------ | --------- | ----- |
| `ACU`   | 91     | 001–091   | AC & ventilation |
| `CHL`   | 93     | 001–093   | Refrigeration & chillers |
| `ELC`   | 118    | 001–118   | Electrical equipment |

| Branch | Prefix | ACU | CHL | ELC |
| ------ | ------ | --: | --: | --: |
| Nana House - Shabiya 11          | `NHB`  |  7 | 11 |  6 |
| Royal Gujarat                    | `RG`   | 20 | 21 | 32 |
| Mussafah 17 - Delight Gujarat    | `DGR`  | 11 | 13 | 12 |
| Shabiya 12 - Gujarat Restaurants | `GRSB` |  4 |  6 |  5 |
| Nana House - Shabiya 10          | `NH`   |  2 | 10 |  9 |
| Mafraq Gujarat Restaurant        | `MGR`  | 12 | 15 | 10 |
| Manpasand - New Store            | `MPS`  | 14 |  2 | 19 |
| Mussafah 26 - Gujarat Hotel      | `GRS`  | 12 | 10 | 13 |
| Mussafah 26 - Zaharat Gujarat    | `ZG`   |  9 |  5 | 12 |

### The asset number is the identity

`RG-ACU-008` is Royal Gujarat, air conditioning, unit 8. Every equipment id
derives from it, and that is not cosmetic: eleven assets at Royal Gujarat are
called "Fan" and nine at Nana House are called "Refrigerator", and the old
id — derived from the branch and the name — folded each of those groups into a
single record.

The number runs **continuously across the whole estate**, not per branch, which
is how the master documents number them. **Next free** on the asset form offers
the next one for the branch and trade; a withdrawn asset's number is never
reissued, because the estate's paperwork still refers to it.

### What is recorded, and what is not

Every field comes from the source document or is left blank. There are no
invented serial numbers, install dates or models — the registers record none,
and a fabricated number on screen matching nothing on the wall is worse than an
empty field.

Each asset carries the register's own wording verbatim in `statusNote`
("SERVICE DUE", "Serviced 25 Aug 2026", "Unit 1 of 2") **and** a sorted
`serviceStatus` the screens can filter and colour by: Serviced, Service due,
Service pending, Not working, On inventory, Not recorded. Both are kept,
because the note says things the status cannot — which of two identical shake
machines this is, or that a date was never written down.

For the 47 air conditioners whose register line carries a date, that date is
the clock the schedule counts from, ahead of the install date but behind any
job this app watched happen.

### Dropdowns that suggest rather than constrain

Asset type, make, capacity and location are comboboxes. The options are the
register's own vocabulary joined with whatever is already on the operator's
assets — so a brand typed once is in the list next time, with no second store
to keep in step. Nothing is rejected: a fitter standing in front of a machine
the list does not have can record what is actually there.

Choosing a type fills the rest of the sentence in. It sets the name while the
name is still following it, and it sets the category when the register has only
ever filed that type under one trade — pick "Kulfi Freezer" and the asset lands
under refrigeration without being asked.

Capacity appears only for trades measured in tons. It is text, not a number,
because the register contains "Approx. 2.35 Ton" for a unit whose indoor and
outdoor halves are different makes.

### Importing

**Import a list** takes the master registers as they stand:

```
Asset no, Branch, Type, Capacity, Make, Location, Status, Serial, Model, Installed
RG-ACU-008, Royal Gujarat, Split AC, 2.5 Ton, Mitsubishi, Juice & Sweets, SERVICE DUE
```

Only Branch and Type are required and a line can stop at any comma. The trade
is read from the asset number, so the documents need no category column. The
Status column is kept in the register's own wording and read at the same time:
"Serviced 25 Aug 2026" sets the status *and* the date. An asset already on
record is corrected rather than added twice, matched on its asset number, so a
corrected register can be pasted again. Rows that cannot be read are reported
by line number rather than dropped, and a duplicate asset number within one
paste is caught on the second line rather than overwriting the first.

## Scheduled maintenance

**Maintenance → Schedule** holds the recurring services, written per category
rather than per asset. Air conditioning is looked at every 45 days — these are
kitchen and hall units in Abu Dhabi, and the shipped register already shows 35
of 91 overdue; a six-monthly rule would have agreed with that backlog instead
of raising it. Refrigeration goes quarterly, electrical six-monthly, each with
an annual full service beside it.

An individual asset that genuinely differs carries an override on its own
record, including being exempted outright.

### The register's status is recorded, not acted on

38 of the 302 assets arrive with the master document already saying something
is owed — 33 `SERVICE DUE`, 3 pending, 2 `NOT WORKING`. Those are kept on the
asset, drive the coloured pill and the status filter on the Appliances screen,
and are searchable. **They do not create jobs.**

That is deliberate, and it was tried the other way first. Reading the stamps as
work put 38 jobs on the board on the first load — none of which anybody in the
company had raised. A board is a list of work somebody is accountable for, and
filling it from a transcribed document breaks that: the operator opens the app
on day one and is answerable for 38 things they never agreed to.

So the board starts empty. Work arrives three ways, all of them traceable to a
person or to this app's own arithmetic:

- somebody reports a problem
- a failed maintenance check on the Monday round raises one
- a service falls due on its cadence

The flags are not lost, they are just where a statement copied out of a
document belongs — on the record, not on the work queue. **Appliances → filter
by "Service due"** is the list of what the register says is owed.

In practice the board does not stay empty for long: 47 air conditioners carry a
real service date from August, and a 45-day cadence brings the first six round
on 26 September. That is the app's own clock, counted from work that actually
happened.

Every job title leads with the asset number — `RG-ACU-013 — General
maintenance — Split AC`. Without it the board is unreadable: twenty-eight
Split ACs come due together, and twenty-eight rows reading "General
maintenance — Split AC" look like a bug in the app rather than twenty-eight
machines.

### Clearing what the earlier build raised

For one release the app read those stamps as work and put 38 jobs on the board
before anyone had opened it. Removing that code does not remove the jobs — they
were written into the browser at the time — so `maintenanceStore` clears them
once, on the next read.

Narrow on purpose: it removes only jobs the app raised itself (`reportedBy` of
"Maintenance schedule" or "Asset register") that nobody has touched. A job a
person reported, one that has been started, and one that has been finished are
all kept, because those are records of real work. After it runs once a marker
stops it for good, so the services that genuinely fall due from here on are
left alone.

### Finishing the work corrects the register

Closing a job rewrites the asset's own status, in the register's wording:
`SERVICE DUE` becomes `Serviced 22 Sep 2026` with the date filled in. Without
that step the schedule moved on correctly but the register screen kept its red
pill for ever, and the status filter — the one place a manager looks to answer
"what still needs doing" — kept counting a unit that had just been serviced.

A repair is not a service and does not claim to be one: fixing a dead unit
clears the breakdown and records `Repaired 23 Sep 2026`, leaving the routine
service still owed on its own clock.

When a service falls due the job appears on the board by itself. There is no
server and nothing runs on a timer, so this is worked out each time the app is
opened. That is safe because a scheduled job's id is derived from its plan, its
asset and the date it was due — so the same occurrence can never raise two
jobs, however many tabs are open or however long the app was shut. A service is
dated the day it fell due, not the day it was noticed, so the month-end report
files it under the right month.

A long gap raises **one** job, not one per missed interval: a quarterly plan
last serviced two years ago produces a single overdue job, because nobody is
going to carry out eight retrospective services. Finishing a service restarts
the interval from the day the work was done.

Jobs carry a **kind** — a problem report or a scheduled service — filtered on
the board and marked on the job. The distinction is not cosmetic: the
**Repeated** tab counts only breakdowns, and the month-end report counts
problems and services in separate columns, or a branch that looks after its
equipment would read as a branch that keeps breaking it.

A Branch Manager reads their own branch's register and sees what is due on it,
but cannot change it: an interval is an estate-wide commitment about how often
the contractor comes, and is the admin's and the Maintenance Manager's to set.

A Maintenance Manager has the maintenance module in full — the board, the
overview, the month-end report, and starting, ending, re-timing, reopening,
deleting and raising jobs. They have no inspections list, but may open the
report of an inspection that raised a job, since a repair whose origin cannot
be read is a repair taken on trust.

Closing a job takes photographs as well as a note — the receipt, and the work
once it is finished, up to six. Pictures are scaled down before they are kept,
because the whole app shares one small browser store; if a write will not fit,
closing the job is refused with a message rather than quietly losing the record.

The role is stored under its older key, `job-manager`. Only the name changed —
renaming the key would have stranded accounts already saved in a browser.

The admin creates Branch Manager, Maintenance Manager and Inspector accounts
from `/users`. A second Main Admin is not something that screen mints.

## Starting from nothing

The jobs board and the records list start **empty**, and that is deliberate.

Both used to ship with fixtures. The maintenance seed generated one completed
service per asset per plan, which against 302 real assets would have written
some six hundred completed jobs — each naming a real unit at a real branch,
each claiming a service on a date with a contractor's name attached, each
indistinguishable from work that happened, each anchoring a schedule and
counted by the month-end report.

An empty board is the honest state of an estate whose maintenance has not been
recorded here yet. The register is not empty, so there is plenty to look at; it
is the *work* that has to be earned rather than seeded.

## Upgrading an installation already in use

**Everything stored by the previous build is deleted, once, on the next page
load.** Not migrated — deleted.

That is deliberate. Migrating is the right instinct when an estate grows a
branch, but nothing in the old store was ever real: seven invented branches,
ninety-eight appliances nobody owns, thirteen trades chosen before there was
anything to file under them, and generated inspections and jobs. Preserving any
of it would carry invented assets and invented services into a register that is
now the operator's actual paperwork, where nobody on the floor could tell which
rows were which.

`services/estateReset.ts` removes every `inspection_log_*` key and each store
then seeds itself as if the browser had never run the app. Keys belonging to
anything else on the origin are left alone.

Be plain about the cost: **this clears the signed-in session, and any
inspection or maintenance job recorded against the demo estate.** Everybody
signs in again. That is the point — those records name branches that do not
exist.

It runs at most once, and the marker it leaves is written *last*, so a purge
interrupted half way repeats on the next load rather than leaving a store
half-cleared and marked done.

## Naming the unit on a finding

When a maintenance check fails, **Which unit** picks the machine off that
branch's register, grouped by trade:

```
AC & ventilation
  RG-ACU-008 — Split AC — 2.5 Ton — Juice & Sweets
  RG-ACU-009 — Split AC — 2.5 Ton — Juice & Sweets
Refrigeration & chillers
  RG-CHL-030 — Refrigerator — Main Kitchen
```

The asset number leads because on this estate nothing else identifies a unit:
Royal Gujarat has nine assets called "Refrigerator" and ten called "Fan", and
the register records no serial numbers. Before this, all ten fans read "Fan" in
the dropdown — 73 assets produced 33 distinct labels.

Worse, the finding stored only the name, so `assetForCheck` matched the first
asset carrying it. Picking `RG-CHL-030` and reopening the inspection resolved
to `RG-CHL-020`: the unit changed underneath the inspector, the dropdown showed
the wrong one selected, and the job went to the wrong machine with nothing
reporting a problem. Matching is now by asset number, then serial, then a name
**only when exactly one asset at the branch carries it** — an ambiguous name
resolves to null, which reads as "not about a particular unit", the honest
answer to a record that does not say which.

The number is carried onto the job, so the board can tell that a fault reported
today is one it already has somebody working on, and withdrawn assets are not
offered.

## Reading a fault into a trade

A failed maintenance check on the Monday round becomes a job, and the trade is
guessed from the wording so the board is not a wall of "Other".
`CATEGORY_HINTS` in `services/maintenanceIntake.ts` is written from this
estate's register rather than from what a kitchen generally contains, which is
why two entries look wrong until you check:

- **A fan is electrical, not ventilation.** The register has fifteen, every one
  an `ELC` asset — standing and wall fans in the outdoor area and dish wash,
  not extraction. Filing "fan not working" under air conditioning would send
  the AC contractor to a fan.
- **An oven, fryer or bain-marie is electrical too.** There is no cooking-gas
  trade on this estate; the pizza ovens, fryers and bain-maries are all on the
  electrical register, so a fault on one is an electrician's job.

Hints for trades the estate has no assets for — gas, fire safety, plumbing —
stay in the list but never fire, because `suggestCategory` skips any category
that is not on the live list. They start working the moment somebody adds that
trade back, which is a button; a register that gains a gas bank should not also
need a code change.

# FraudGuard

A purchase-to-payment fraud monitoring and transaction alert system for small businesses.

Every supplier invoice is checked against six fraud rules before it can be paid. Low-risk invoices go straight through. Anything unusual is held, and the Finance Manager reviews it with the reasons in front of them. The system never accuses anyone, it says "review required".

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, PostgreSQL on Neon, plain SQL through the `pg` driver. Deploys free on Vercel + Neon.

## Run it on your PC

You need Node.js 20 or newer.

1. Open this folder in VS Code and open a terminal (Terminal > New Terminal).
2. Install the packages:
   ```
   npm install
   ```
3. Create the database on Neon: neon.tech > New project. On the project dashboard click **Connect** and copy the connection string.
4. Copy `.env.example` to `.env.local` and paste the connection string as `DATABASE_URL` (keep the quotes):
   ```
   DATABASE_URL="postgresql://user:password@ep-something.eu-central-1.aws.neon.tech/neondb?sslmode=require"
   ```
5. Create the tables and the demo data:
   ```
   npm run db:setup
   ```
6. Start the app:
   ```
   npm run dev
   ```
   Open http://localhost:3000 and pick a role on the login page. All demo accounts use the password `Password123!`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app on http://localhost:3000 |
| `npm run db:setup` | Creates the tables and adds demo data (does nothing if data already exists) |
| `npm run db:reset` | Deletes everything and re-creates fresh demo data. Run this before your presentation |
| `npm test` | Unit tests for the fraud rules. No database needed |
| `npm run test:e2e` | Full end-to-end test through the running app (start `npm run dev` first). It adds its own test purchases, so run `npm run db:reset` afterwards |
| `npm run build` then `npm start` | Production build. Needs `AUTH_SECRET` set (see below) |

## The demo accounts

| Role | Person | Email |
|---|---|---|
| Employee | Thandi Mokoena | thandi@fraudguard.demo |
| Manager | Mpho Dlamini | mpho@fraudguard.demo |
| Procurement Officer | John Khumalo | john@fraudguard.demo |
| Accountant | Ayanda Zulu | ayanda@fraudguard.demo |
| Finance Manager | Naledi Khumalo | naledi@fraudguard.demo |
| Auditor | Pieter van der Merwe | pieter@fraudguard.demo |

(Sindi Ndlovu and Kagiso Molefe are extra employees who appear in the history.)

`DEMO_SCRIPT.md` has the exact clicks and values for the live demo.

## What each role can do

| Role | Can | Cannot |
|---|---|---|
| Employee | Make purchase requests, see their own | Approve anything |
| Manager | Approve or reject requests, make their own requests, see the dashboard | Approve their own request |
| Procurement Officer | Add suppliers, change supplier bank details, create purchase orders, record goods received | Approve requests, capture invoices, pay |
| Accountant | Capture invoices (this runs the fraud check), pay approved invoices, see the journal | Create purchase orders, decide alerts |
| Finance Manager | Approve or reject requests, verify new suppliers, approve, reject or escalate alerts | Capture invoices, pay |
| Auditor | Read everything: dashboard, alerts, invoices, journal, audit trail | Change anything |

Roles are enforced on the server for every action (`src/lib/p2p.ts`), not just by hiding buttons.

## Small Civils and VZ Coatings

The business behind this prototype is run as two companies sharing one set of staff, suppliers and system: **Small Civils** and **VZ Coatings**. Every purchase request, order, invoice, alert and journal entry belongs to one of the two, shown everywhere as a small coloured chip (a gold dot for Small Civils, a blue dot for VZ Coatings, with the name always spelled out next to it).

- An employee chooses the company when making a request.
- A purchase order and an invoice default to the same company as the step before them, but Procurement and the Accountant can change it. This is how a project that started under one company can carry on under the other, for example when Small Civils raises the request but VZ Coatings ends up paying.
- Every list page (Requests, Orders, Invoices, Alerts, Journal, Audit trail, Dashboard) has an "All companies / Small Civils / VZ Coatings" filter, so each person can see everything or just their own company's work.
- Suppliers, categories and users are shared between the two companies, since it is one back-office running both.

## The fraud rules

Each rule that fires adds points. The total is capped at 100.

| Rule | Points | Fires when |
|---|---|---|
| Supplier not verified yet | 30 | The supplier has not been verified by the Finance Manager |
| Supplier bank details changed | 30 | The account on the invoice is not the account on file, or the details on file changed in the last 30 days |
| Purchase order, goods received and invoice do not match | 40 | The billed quantity is not what was received, or the unit price is not the PO price |
| Possible duplicate invoice | 35 | Same supplier and invoice number as an earlier invoice, or the same amount within 30 days |
| Amount above normal for the category | 20 | The invoice total is above the category's normal maximum (`category_norms` table) |
| Several invoices in a short time | 15 | 3 or more invoices from the same supplier in 7 days |

| Score | Band | What happens |
|---|---|---|
| 0 to 24 | Low | Approved automatically, journal posted, ready to pay |
| 25 to 59 | Medium | Payment held, alert raised |
| 60 to 100 | High | Payment held, alert raised |

The points and thresholds are constants at the top of `src/lib/rules.ts`. Two controls are preventive instead of scored: nobody can approve their own request, and a held invoice cannot be paid until its alert is resolved.

## Accounting and VAT

Every amount in the system shows VAT alongside it, in two directions:

- **A purchase request's estimated cost is entered excluding VAT** (the way a rough estimate is normally given). The screen adds 15% on top and shows the result, for example an estimate of R17,000 shows "+ VAT R2,550.00 = R19,550.00 incl. VAT" right under the field as you type, and the same breakdown appears on every request in the list.
- **Purchase order and invoice amounts are VAT-inclusive**, since that is what a real supplier invoice states. Wherever one of these totals is shown (orders, invoices, alerts, the dashboard), a small line underneath it states how much of that total is VAT, worked out by dividing by 1.15.

The 15% rate is one constant, `VAT_RATE` in `src/lib/money.ts`.

Invoice amounts are VAT-inclusive at 15%. When an invoice is approved:

```
Dr  Expense or asset account for the category   (amount excluding VAT)
Dr  VAT Input                                   (VAT)
    Cr  Accounts Payable                        (invoice total)
```

When it is paid:

```
Dr  Accounts Payable
    Cr  Bank
```

A rejected invoice posts nothing. The journal page shows every entry and checks that debits equal credits. Each category posts to its own account (for example IT Equipment to Computer Equipment, Office Supplies to Office Supplies Expense), set in the `category_norms` table.

## Deploy to Vercel (free)

1. Push this folder to a GitHub repository (`.env.local` is git-ignored, so your secrets stay out).
2. On vercel.com choose **Add New > Project** and import the repository.
3. Add these environment variables:
   - `DATABASE_URL`: your Neon connection string
   - `AUTH_SECRET`: a long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `DEMO_MODE`: `true` to keep the one-click demo accounts on the login page, `false` to hide them
4. Deploy. The database is the same Neon database you set up locally, so it already has the tables and demo data.

Neon's free plan pauses the database when it is idle, so the first request after a quiet spell is slow. Open the app and sign in a few minutes before you present. Vercel's free plan is for personal, non-commercial use (as far as I know), which suits the assessment.

## Project layout

```
db/schema.sql            All tables
scripts/db-setup.ts      npm run db:setup / db:reset
scripts/seed.ts          Demo data (built by calling the real workflow functions)
scripts/e2e.ts           End-to-end test
src/lib/rules.ts         The fraud rules engine (pure functions, unit tested)
src/lib/p2p.ts           The purchase-to-payment workflow, role checks, journals, audit log
src/lib/auth.ts          Login cookie (signed with AUTH_SECRET)
src/lib/roles.ts         Roles, permissions, navigation per role
src/app/api/**           JSON API routes
src/app/(app)/**         The pages
src/components/**        Forms and shared UI
```

## Limits of this prototype

- No screens for creating users or resetting passwords. Users are created by the seed script.
- Demo accounts share a known password. Set `DEMO_MODE=false` and change the passwords before real use.
- No invoice file uploads and no email notifications.
- The login rate limit is kept in memory, so on Vercel it is per server instance.
- Bank account numbers are stored as text, and shown masked in the screens.
- Rules are fixed rules with fixed thresholds. There is no machine learning.

## Troubleshooting

- **`DATABASE_URL is not set`**: the file must be called `.env.local` (not `.env.example`) and sit next to `package.json`.
- **`relation "users" does not exist`**: run `npm run db:setup`.
- **Connection timeout on the first try**: Neon was asleep. Run the command again.
- **`AUTH_SECRET is not set`**: only happens in production mode (`npm start` or on Vercel). Set it as shown above.
- **Port 3000 is busy**: `npm run dev -- -p 3001`.

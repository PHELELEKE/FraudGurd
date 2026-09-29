# FraudGuard demo script

About 6 minutes of live demo. Rehearse it, then run `npm run db:reset` right before the real presentation so everything is fresh. Open the app and sign in a few minutes early so Neon is awake.

Every demo account uses the password `Password123!`. On the login page you can click a role instead of typing.

The reset gives you three purchase orders that are already delivered and waiting for their invoice:

| Purchase order | What it is | Company | Use it for |
|---|---|---|---|
| PO-0020 | 10 x Dell Latitude 5540 laptops, ABC Technology, R120,000 | Small Civils | Spare, for rehearsal |
| PO-0021 | 10 x HP ProBook 450 laptops, ABC Technology, R120,000 | VZ Coatings | Scenario 2 (fraud) |
| PO-0022 | Printer toner and paper, XYZ Stationery, R4,500 | Small Civils | Scenario 3 (duplicate) |

There is also one alert already waiting (Sandton Cloud Solutions, medium risk) so the Finance Manager's queue is not empty, and the purchase history has a mix of both companies, with one project (around PO-0003) that started under Small Civils and was moved to VZ Coatings by Procurement, if you want to point that out from the Orders page.

---

## Scenario 1: a clean purchase, start to finish (about 90 seconds)

The point: normal purchases are not slowed down, and the two companies share the one system.

1. **Thandi (Employee)** > Requests > New request:
   - Company: `Small Civils`
   - What do you need: `10 x Laptops`
   - Quantity: `10`, Estimated cost: `104347.83` (excl. VAT) — watch it show "+ VAT R15,652.17 = R120,000.00 incl. VAT" as you type
   - Category: `IT Equipment`, Department: `IT`
   - Reason: `New employees starting in October`
   - Send for approval
2. **Mpho (Manager)** > Requests > Approve.
3. **John (Procurement Officer)** > Orders > find the request under "Approved requests waiting for a purchase order". Point out the gold "Small Civils" chip next to it. Supplier `ABC Technology`, Unit price `12000`, Company stays `Small Civils (as requested)` > Create purchase order. Then in the Purchase orders table type `10` and click Record delivery.
4. **Ayanda (Accountant)** > Invoices > Capture invoice > choose the new purchase order:
   - Invoice number: `INV-2001`
   - Leave everything else as filled in, including the company
   - Check and capture invoice
   - Result: **0 Low, cleared for payment**. Point at the three-way match on the right: all three documents agree.
5. Go to Invoices and click **Pay**. Open **Journal** and show the two entries: the invoice (cost, VAT Input, Accounts Payable) and the payment (Accounts Payable, Bank), and the "Debits equal credits" tag.

## Scenario 2: the fraud attempt (about 2 minutes, the main event)

The point: the system stops it before the money leaves, whichever company it belongs to, and shows exactly why.

1. **Ayanda (Accountant)** > Invoices > Capture invoice > choose **PO-0021** (HP ProBook laptops, note the blue **VZ Coatings** chip):
   - Invoice number: `INV-90432`
   - Unit price billed: `15000` (the PO says 12,000)
   - Bank: `Standard Bank`
   - Account holder: `ABC Tech Logistics CC`
   - Account number: `10184734491`
   - Branch code: `051001`
   - Watch the right side turn red as you type, then click Check and capture invoice.
   - Result: **90 High, held for review**, with three rules: bank details changed (+30), purchase order and invoice do not match (+40), amount above normal for IT Equipment (+20).
2. On the Invoices page there is no Pay button for it. The payment is blocked.
3. Sign out. **Naledi (Finance Manager)** > Alerts > Review:
   - Walk down the page: the VZ Coatings chip at the top, the risk score and reasons, the two bank accounts side by side (only the last 4 digits are shown), the three-way match with the R30,000 variance, and the activity list of everyone who touched this purchase.
   - Reason: `Called ABC Technology on the number we have on file. They did not change banks.`
   - Click **Reject invoice**.
4. **Journal**: nothing was posted for it. **Audit trail** (Naledi or Pieter): every step is there with who and when, and which company it was for.

Say out loud: an unusual invoice is not proof of fraud, the manager decides. A different outcome would be Approve after a phone call. It doesn't matter which of the two companies the invoice is under, the same checks apply.

## Scenario 3: a duplicate invoice (about 60 seconds)

The point: the middle band, and a different rule.

1. **Ayanda** > Capture invoice > **PO-0022** (toner and paper, Small Civils): Invoice number `INV-7781`, leave the rest. Cleared, low risk.
2. Click **Capture another invoice**, choose PO-0022 again, enter `INV-7781` again. Result: **35 Medium, held**, "Possible duplicate invoice".
3. **Naledi** > Alerts > Review > Reason `Checking with the supplier first` > **Escalate**. The payment stays held. **Pieter (Auditor)** can now see it but has no buttons: read-only.

## Scenario 4: separation of duties (about 30 seconds)

The point: the roles are enforced, not decoration.

1. **Mpho (Manager)** > Requests. His own pending request ("Conference room display screen") shows "Your own request. Someone else has to decide it." and has no Approve button. Even a direct call to the server is refused.
2. **Naledi (Finance Manager)** > Requests > Approve it.
3. Optional: sign in as **Thandi (Employee)**. She only sees the Requests page. As **Pieter (Auditor)** everything is visible but nothing can be changed.

## Scenario 5: filtering by company (about 30 seconds, optional if time allows)

The point: one system, but each company's work can be looked at on its own.

1. On any list page (Requests, Orders, Invoices, Alerts, Journal, Audit trail, Dashboard) click **VZ Coatings** in the filter bar at the top. The list narrows to just that company. Click **Small Civils**, then **All companies**, to show it switching back.
2. On the Dashboard, filtering to one company recalculates every number: invoices checked, risk split, the chart, and the recent invoices list.

---

## Numbers to remember

| Rule | Points |
|---|---|
| Supplier not verified | 30 |
| Bank details changed | 30 |
| PO, goods received and invoice do not match | 40 |
| Possible duplicate | 35 |
| Amount above category normal | 20 |
| Several invoices in a short time | 15 |

Low 0 to 24, Medium 25 to 59, High 60 and above. Two controls are preventive rather than scored: no self-approval, and a held invoice cannot be paid.

VAT is 15%. A request's estimated cost is entered excluding VAT and the system adds VAT on top (R17,000 becomes R19,550). A purchase order or invoice total already includes VAT, and the VAT portion is shown underneath it.

## If something goes wrong on the day

- A scenario shows an extra "several invoices" rule (+15): you rehearsed too many invoices for the same supplier this week. Run `npm run db:reset`.
- The first page load is slow: Neon was asleep. Wait a few seconds.
- Record a backup video of the full demo beforehand in case the internet fails.

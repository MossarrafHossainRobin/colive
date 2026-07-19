# NestHub Admin Information Architecture

## Design principles

1. Transparency: totals, formulas, source counts, exclusions, actors, and revisions remain visible.
2. Speed: the primary editing surface is a keyboard-first spreadsheet, not a sequence of CRUD forms.
3. Safety: validation, duplicate detection, audit records, soft delete, and restore sit in the save path.
4. Deliberate communication: data edits never send a notification. Review and confirmation are separate actions.
5. Consistency: one monthly `mealRatePeriods/{YYYY-MM}` record is the shared meal-rate source for admin and member screens.

## Navigation

- Overview
- Operations
  - Meal Tracking
  - Bazar Management
  - Bills
  - Service Charges
- Communication
  - Announcements
  - Issues
- System
  - Archive / deleted users

The shared admin shell owns navigation, theme, page width, background, and responsive behavior. Individual pages do not render duplicate navigation.

## Common page anatomy

1. Breadcrumb-style title, description, month/date scope, and primary action.
2. Compact KPI cards with source context.
3. View tabs rather than separate disconnected pages.
4. Toolbar for search, filters, bulk actions, import/export, undo/redo, and notifications.
5. Main work surface: spreadsheet, analytics, formula, balance, or activity view.
6. Review modal for notifications, with explicit recipients, channels, changes, metrics, checkbox, and confirmation.

## Bazar workspace

Views:

- Ledger: inline spreadsheet with Date, Market ID, Description, Category, Amount, Paid By, Added By, Notes, Attachment, Counted, and Place.
- Analytics: daily/cumulative trend, monthly expense, category breakdown, member contribution, and weekly comparison.
- Balances: opening balance, monthly budget, running balance formula, member transfers, and transfer history.
- Activity & Trash: immutable actor/action/version history and restore points.

Calculation rules:

- Only active rows with `countInBazar !== false` contribute to finance totals.
- Running balance = opening balance − counted monthly expenses.
- Remaining budget = monthly budget − counted monthly expenses; without a budget it uses running balance.
- Member transfers redistribute contribution balances and never change the house expense total.
- Amounts are serialized with integer paisa alongside the compatibility amount field.

## Meal workspace

Views:

- Meal Sheet: member rows, date columns, frozen first column/header, lunch/dinner/guest modes, fractional input, range fill, copy/paste, and bulk soft delete.
- Monthly Summary: member totals and cost using the published canonical rate.
- Rate & Formula: every input, operator, source count, result, consistency status, and revision.
- Activity: saves, imports, deletes, restores, publication events, and notification sends.

Canonical formula:

```text
Total cost = Bazar cost − previous balance + other expenses + signed adjustments
Meal rate = Total cost ÷ Total meals
```

Active meal documents are deduplicated by member/date, with the newest version used for display. Publishing and notification sending are blocked while duplicates or formula mismatches remain.

## Notification workflow

```text
Edit data → Review saved changes → Send Notification → Preview → Confirm → Deliver
```

- In-app and push are available now.
- Email, SMS, and WhatsApp are visible as future adapters and cannot be selected yet.
- The preview is built from the published calculation snapshot, not an unpublished draft.

## Data and performance boundaries

- Month-scoped Firestore listeners keep operational datasets bounded.
- Six-month Bazar analytics is loaded separately from the editable month.
- Filtering/sorting is memoized in the client, while spreadsheet drafts are local and autosaved.
- Tables use sticky/frozen regions, bounded scroll containers, and incremental rendering for large result sets.
- Audit records contain scalar snapshots rather than Firestore timestamp internals.
- Soft-deleted meal and Bazar rows are excluded through shared normalization helpers across admin/member views.

# Category drill-down: clearer entry and category switcher

Date: 2026-09-21

## Problem

On the Reports page it is not obvious that the rows in "Spending by
category" open a detail view. The only cues are a faint chevron and a
grey hint line under the list.

Once inside a category, changing category means going back to Reports
and tapping another row.

## Design

### Reports page rows

- Tappable rows get a hover and press background. Padding is pulled
  back with a negative margin so the layout does not move.
- The chevron is visible at rest (`--text-3`) and turns brand on hover.
- Labels on tappable rows use `--text` instead of `--text-2`.
- The hint line under the list is replaced by a card head row:
  "Spending by category" on the left, "Tap a category for details" on
  the right. On phones the hint wraps under the title.
- The merged "Other" row stays plain.

### Category detail page

- `PageHeader` and `MobileHeader` take `title` as `ReactNode`.
- The page title becomes a `Select` listing the named expense
  categories (all but `OtherExpenses`). Picking one navigates to
  `/reports/category/<key>` with the same period query, using
  `replace: true` so Back still returns to Reports.
- The select is styled as a title: no border, no background, title
  font size (22px desktop, 16px mobile), chevron kept, focus ring kept.
- On mobile the select sits next to the back arrow but outside the back
  button, so tapping the title does not go back.
- Data loading already keys on `category`, so switching reloads in
  place.

# Review: My Work → Timesheet, week view (2026-10-27)

Asked for by the user: "review the timesheet weekly view. it looks soo out of place."
Method: the taste skill's app-screen review (`references/app-screens.md` §2.7). It is a review only; nothing is changed yet.
Evidence: the approved visual baselines `e2e/visual-2.spec.ts-snapshots/ts-week-{1440,390}-{light,dark}`, set beside its
siblings in the same app (`ts-day-1440-light`, the manager's `tteam-week-1440-light`), and the code in
`src/features/timesheet/WeekGrid.tsx`. The inspector cannot sign in, so the measurements below are read from the
screenshots and the source.

Screen: Bigyan Poudel (grid type, classic week layout), week 33, Wed 12 Aug recorded 07:00–15:00 and awaiting approval.

## The screen's question

"Have I logged this week, and what is left to do?" The answer on this data: 7h30 of 40h, one day of five recorded, that
day awaiting approval, four working days still blank, and Submit week.

## Why it looks out of place

It is the one screen in the app that is not built from the app's parts.

1. **The today column is blue.** Thursday is a full-height `--qp-rota-early-surface` fill (`WeekGrid.tsx:32`): the rota's
   "early shift" info-blue, light blue on white and navy in dark. Nowhere else in the app is blue a surface; the app's
   colours are the dark green, lime and the status inks. The phone layout of the same grid marks today with a 3px
   brand-green bar and a green "Today" pill (`WeekGrid.tsx:243`), and the manager's week matrix marks today not at all.
   Three screens, three ways to say "today". Next to it the blue "Awaiting approval" pill makes the card read blue.
2. **It is a form of blanks, in the browser's own controls.** At 1440 there are 14 native time inputs, 13 of them empty,
   each showing the browser's "--:--" and a clock icon, and 3 native `<select>`s (`NativeSelect`) with the browser's
   arrow and a "—". The Day view a tab away uses the design system's `SelectBox` ("Choose", the app's chevron, the
   tinted field) and large labelled fields. The week grid's 34px boxes with grey placeholder dashes are the busiest
   thing on the screen and carry no data. At 390 the same inputs are too narrow and clip "07:00" to "07:C".
3. **The answer is in the smallest type.** The week's answer, "Total 07:30 · awaiting approval … 40h contracted", is a
   12px line under the card. Home, Approvals and Overview now lead with their answer in the dark green lead block; the
   Day view leads with a NET WORKING / BREAKS summary. The week view has neither, so it reads as an older screen.

## Further findings (app-screen critique, §2.7)

- **Biggest thing:** the allocation column of three stacked selects (Project, Project task, Cost centre) sets the row at
  about 200px, so the day cells float in the middle of a tall empty row and the start/finish pair has no label of its own.
- **Colour:** blue fill (today) and blue pill (status) are the only hues besides the primary button; the data (07:30) is
  in plain ink.
- **Numbers:** one fact, four places, two formats. 07:30 shows in the row total, the totals row, the footer and (as
  37:30-style h:mm) the catch-up table; contracted time is "40h" in the footer and "contracted 40:00" on the phone. The
  manager matrix writes hours as decimals ("7.5"). Pick one format for hours on the timesheet screens.
- **Zeros:** six "00:00" in the totals row for days with nothing recorded. The manager matrix shows a grey dash for the
  same "nothing here". §11: a missing value is a dash; a real zero is printed. An unrecorded working day is missing.
- **Status twice:** "Awaiting approval" is the header pill and again in the footer line.
- **Controls:** "This week" is disabled because this is this week, drawn grey on grey (low contrast); it reads broken.
  On the phone it takes a row of its own, and Submit week takes another.
- **Catch-up table:** each row carries two status marks ("— Ready" and "Closed"); the app's rule since Phase 1 is one
  status mark per row.
- **Phone:** the day list is a good composition (one row per day, "+ Add time for this day"), better than the desktop.
  Problems: clipped time inputs, the two lone control rows, contracted time in a second format.

Kept as decided (not findings): the uppercase 12px table headers and the striped rows (decision 1, v15 tables), the
dark green top bar, the `?` guide button.

## The three changes that would move it most

1. **Mark today the way the rest of the app does.** Drop the blue rota fill; mark Thursday with the brand-green top rule and
   the green "Today" word the phone already uses, keep weekends one tone step down. One change, and the card stops being
   blue. (`WeekGrid.tsx:32`, `:126-128`.)
2. **Use the app's controls, and let empty cells be quiet.** Swap `NativeSelect` for the design system's `SelectBox`, as
   the Day view does. Style the time inputs as the app's fields: no native clock icon, a grey dash until the cell is
   used, the value in ink once it is, and a width that holds "07:00" at 390. Then the one recorded day is the thing the
   eye finds, not thirteen empty boxes. Consider folding the allocation into one line above the days ("No project · no
   task · no cost centre", Edit) so rows return to their natural height.
3. **Answer the week first.** Put the week's answer in the card's header row beside Submit week: "7:30 of 40:00
   recorded · Wed awaiting approval · 4 working days blank", with the app's `Meter` against contracted hours. Remove the
   footer line it replaces, print unrecorded days as a grey dash, and use one hours format on the screen (and on the phone).

Smaller, after those: give "This week" a readable disabled state or hide it on the current week; one status mark per
catch-up row; on the phone, put the week switcher, status and Submit week on one row.

## Not checked

The other two week layouts (`grid` and `days` at desktop), proxy entry (the manager entering a week for someone), and
the empty and locked states. The same changes would apply to them, since they share `WeekGrid.tsx`.

## Applied (2026-10-27)

The three changes are in (`WeekGrid.tsx`, `WeekView.tsx`), with these rulings from the user:

- **Empty days print a dash.** This reverses the old test "an empty day totals 00:00, not a dash". It applies to day, row and week totals in all three layouts.
- **Allocation: one picker for project and task, in every layout.** This replaced option B, a popover behind an Edit button, after the user asked for something better than a floating window.
  - A BC time sheet line is Job No. and Job Task No., so project and task are one searchable `Combobox`. It lists "No project", then each project followed by its tasks ("Project › Task"); picking a task sets both.
  - An untouched row shows it as a dashed "+ Project and task".
  - The cost centre is its own picker underneath. Choosing a project fills it with the project's default (`OpenProject.costCentre`, from the job's default dimension). It stays editable, because a project's cost centre can differ by person, and a choice made by hand survives a change of project (`chooseProjectTask`).
  - An organisation that doesn't capture projects gets its fields one by one, as before.
  - In classic the pickers sit in the row's first cell without labels, so the row stays near the height of the start and finish pair.
  - Adding a row focuses its project picker. Removing one focuses the row above's.
- **Today** is the brand-green top rule and "today" word in every layout, with no blue fill.
- **Time cells** have no browser clock icon. An empty cell shows a grey dash, and focus brings the field back.
- **The week's answer leads.** It reads "07:30 of 40:00 recorded" on the app's `Meter`, followed by "N weekdays still blank": weekdays up to today with nothing on them, leaving out future and closed days. It sits beside the status pill and Submit week. The footer line is gone. Contracted time uses one format (40:00). The grid's own contracted line now shows only on proxy entry, which has no such header.
- New test id: `tid.ts.weekAnswer`. All old ids keep their meaning. `tid.week.ctx(row, 'project')` is now the combined project-and-task picker; there is no separate `job_task` picker when project is captured.

**Not done** (the smaller items):
- "This week" disabled styling, which is the shared `CalNav`.
- One status mark per catch-up row.
- The phone header on one row.

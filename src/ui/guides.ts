/* The page guides behind `?`: the prototype's GUIDES (qnipay-workforce-v15.html:
   9930-10060). What belongs here is how a page fits together, what it will
   and will not do. Anything about current state or the consequence of an
   action stays on the page, where it can be seen. Copy is the prototype's,
   with each em-dash aside rewritten as its own sentence. A page whose view
   has no entry shows no `?`. */
export interface Guide { label: string; title: string; sections: readonly (readonly [string, string])[] }

export const GUIDES: Readonly<Record<string, Guide>> = {
  ts: { label: 'How time capture works', title: 'How time capture works', sections: [
    ['Clocking',
      'Clock in when you start and out when you finish. Your times fill in and lock while the shift runs, and breaks are recorded as you take them.'],
    ['Manual entry',
      'The day form and the weekly grid capture the same fields. The grid pivots them across the week for employees who record a whole week at once. Fields marked required are required for your work pattern.'],
    ['Breaks and allowances',
      'Add breaks only if you took them. They come off your net hours. Tick any allowances that applied to the shift. Rates are held in Business Central; nothing here sets a monetary value.'],
    ['What is checked',
      'Overlapping breaks, a break outside the shift, breaks longer than the shift and a day above the daily maximum are refused. Long days are flagged for your approver but still submit.'],
    ['After you submit',
      'It goes to your manager. If it comes back, correct it and submit again. That is recorded as a resubmission rather than a new entry.'],
    ['The full key',
      'Status: approved, submitted, resubmitted, draft, and sent back.'],
  ] },
  tteam: { label: 'How to read this queue', title: 'How to read this queue', sections: [
    ['What is waiting',
      'The queue holds first submissions and resubmissions together, so a corrected entry cannot fall out of sight. A resubmission carries the reason it was sent back.'],
    ['Why a row is flagged',
      'A day over the review threshold, or an entry made by a manager on somebody else’s behalf.'],
    ['Approving in bulk',
      'Approve all is scoped to your site and asks you to confirm the record count, the hours and any exceptions first. Each approval is decided on its own.'],
  ] },
  mts: { label: 'What the capture rules do', title: 'What the capture rules do', sections: [
    ['Errors block, thresholds warn',
      'The settings on this page decide what is refused outright and what is merely flagged for the approver.'],
    ['Always refused, whatever these are set to',
      'Overlapping breaks, a break outside the shift, breaks longer than the shift, a break with only one end, and a net total below the minimum. These are integrity rules, not policy.'],
    ['Where they apply',
      'Every path that writes time: the day form, the weekly grid, proxy entry on behalf of somebody else, and week submission.'],
  ] },
  /* 1c group 8: the 1b and 1c pages the prototype gives a guide (v15:9931-10058) */
  aemployees: { label: 'How the workforce record works', title: 'How the workforce record works', sections: [
    ['One record per employee, used by every module',
      'Employee ID, work pattern, position, department, site, contracted hours and clearance are held once here. Timesheet entries reference this record; they never copy it.'],
    ['What that means in practice',
      'Move somebody to another site and their timesheets, approvals and eligibility follow on the next screen. There is no second list to keep in step.'],
    ['Contracted hours',
      'Hours shows each person\'s contracted week. Timesheet compares actual hours against it, so changing it on the record changes what it compares. A bank or zero-hours colleague has none, and is measured against a maximum instead.'],
    ['Who can sign in, and how it is matched',
      'A portal administrator also sees, beside each status, whether that person can sign in to QniConnect: an envelope for invited, a key for signs in, a lock for switched off. Logins come from Business Central and are matched to these records by employee number, on this page only. View opens the record, where the login is managed.'],
  ] },
  aloc: { label: 'How master data is shared', title: 'How master data is shared', sections: [
    ['What the dimensions are for',
      'Sites, departments and cost centres: what Business Central analyses every posted line by. A site carries its manager, department and cost centre, which approvals and costing read directly.'],
    ['Why a position is not a dimension',
      'The job titles employees hold, kept once here and used by every module. A position is not a ledger dimension.'],
    ['Projects and their tasks',
      'What time is charged to. Each project has its own tasks, as a Business Central job has job tasks, and a timesheet line names both. A project\'s cost centre is the default a timesheet row starts with.'],
  ] },
  /* The prototype's second section said its checks ran in the browser; here
     the server refuses every request a capability does not allow, so the
     section says that, and keeps its heading. */
  aperm: { label: 'How permissions work', title: 'How permissions work', sections: [
    ['These switches are live',
      'The navigation is rendered from this matrix. Revoke a capability and the surface it names disappears for that persona, and the action behind it is refused.'],
    ['UI visibility is not security',
      'Hiding a button is not the same as refusing the request behind it. The server checks every capability as well, so a request the matrix does not allow is refused even when it does not come from this screen.'],
    ['Tenant policy can sit above the matrix',
      'A capability can also be withheld by a module being switched off. Where both apply, both must agree.'],
  ] },
  docs: { label: 'Where documents come from', title: 'Where documents come from', sections: [
    ['Read-only outputs from payroll',
      'Payslips, P60, P11D and P45 are produced by payroll in Business Central and fetched from it each time you open one. They are never stored here, generated or altered.'],
    ['Choosing a year',
      'The payslips list shows one fiscal year at a time, starting on the open one. A P60 or P11D asks which year you want; a P60 is only offered once its year has closed.'],
    ['Everything else',
      'Contracts, policies and certificates are held by Workforce and can carry an expiry. An expiring compliance document is flagged to your manager before it lapses.'],
  ] },
  profile: { label: 'What is held where', title: 'What is held where', sections: [
    ['Your payroll record is read only',
      'Your personal, tax, bank and pension details come from payroll in Business Central. Tax code, NI number and bank details stay hidden until you show them. To change them, ask your payroll administrator.'],
    ['What you can change yourself',
      'Contact, emergency and bank details are yours to propose at the top of the page. That part is not yet connected to payroll, so a change you send there does not reach Business Central.'],
    ['A change is a request',
      'It is approved before it takes effect, and the old value is kept in the audit trail.'],
  ] },
};

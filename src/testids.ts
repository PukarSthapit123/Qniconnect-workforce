/* The one source of test ids. Components and Playwright import the same names,
   so a rename is a type error, not a broken test. Format: area-element[-recordId],
   kebab-case, never display text. */
const k = (...parts: (string | number)[]) =>
  parts.map(p => String(p).replace(/[^A-Za-z0-9-]+/g, '-')).join('-');

export const tid = {
  app: 'app-root',
  page: (view: string) => k('page', view),
  /* the development sign-in picker (/dev/sign-in), only while the fake server runs */
  devSignIn: {
    unmatched: 'dev-sign-in-unmatched', group: (userType: string) => k('dev-sign-in-group', userType),
    account: (email: string) => k('dev-sign-in-account', email), loading: 'dev-sign-in-loading', error: 'dev-sign-in-error',
    storageNote: 'dev-sign-in-storage-note', storageTip: 'dev-sign-in-storage-tip', suggested: 'dev-sign-in-suggested',
  },
  /* the sign-in gate's own states (src/App.tsx), the auth error page and the
     authorization callback (src/features/auth-pages) */
  auth: {
    redirecting: 'auth-redirecting', signingOut: 'auth-signing-out', error: 'auth-error', errorMessage: 'auth-error-message',
    errorHome: 'auth-error-home',
    callbackTitle: 'auth-callback-title', callbackMessage: 'auth-callback-message', callbackReturn: 'auth-callback-return',
  },
  /* the public pages, outside the app frame (src/features/public): the
     shared bar and footer, landing (LAND), sign-in (LOGIN), registration
     (REG) and pricing (PRICE) */
  pub: {
    home: 'pub-home', help: 'pub-help', pricing: 'pub-pricing', register: 'pub-register', signIn: 'pub-sign-in',
    privacy: 'pub-privacy', terms: 'pub-terms', year: 'pub-year',
  },
  land: { signIn: 'land-sign-in', error: 'land-sign-in-error', register: 'land-register' },
  login: { signIn: 'login-sign-in', error: 'login-sign-in-error', redirecting: 'login-redirecting', help: 'login-help' },
  reg: {
    back: 'reg-back', step: 'reg-step', tracker: (n: number) => k('reg-tracker', n), field: (name: string) => k('reg-field', name),
    next: 'reg-next', prev: 'reg-prev', submit: 'reg-submit', blocked: 'reg-blocked',
    billing: (v: string) => k('reg-billing', v), plan: (v: string) => k('reg-plan', v), addOn: (code: string) => k('reg-add-on', code), total: 'reg-total', totalNote: 'reg-total-note',
    summary: (key: string) => k('reg-summary', key), legal: (n: number) => k('reg-legal', n),
    error: 'reg-error', errorDismiss: 'reg-error-dismiss', done: 'reg-done', doneHome: 'reg-done-home',
  },
  price: {
    /* Ruling Q23: the base price, each add-on, the call to action, the add-on email and How access works */
    base: 'price-base', addOn: (code: string) => k('price-add-on', code), cta: 'price-cta', ask: 'price-ask', how: 'price-how',
  },
  /* environment selection and the first-login overlay (src/features/account-setup) */
  accountSetup: {
    loading: 'account-setup-loading', error: 'account-setup-error', errorAction: 'account-setup-error-action',
    environment: (id: string) => k('account-setup-environment', id), home: 'account-setup-home', continue: 'account-setup-continue',
    empty: 'account-setup-empty',
    firstLogin: 'account-setup-first-login', firstLoginContinue: 'account-setup-first-login-continue', firstLoginError: 'account-setup-first-login-error',
  },
  nav: {
    group: (key: string) => k('nav-group', key),
    tab: (view: string) => k('nav-tab', view),
    menu: (group: string) => k('nav-menu', group),
    bottom: (view: string) => k('nav-bottom', view),
    more: 'nav-bottom-more',
    /* 1c group 8: the phone's Go to sheet behind More (v15:12072) */
    goToList: 'nav-goto-list', goTo: (view: string) => k('nav-goto', view),
  },
  shell: {
    rolePill: 'shell-role-pill', bell: 'shell-bell', bellCount: 'shell-bell-count', theme: 'shell-theme',
    account: 'shell-account', signOut: 'shell-sign-out', viewAsEnd: 'shell-view-as-end',
    viewAs: (employeeCode: string) => k('shell-view-as', employeeCode),
    menuAccount: 'shell-menu-account', menuRole: 'shell-menu-role', menuViewAsEnd: 'shell-menu-view-as-end',
    menuViewAsLoading: 'shell-menu-view-as-loading', menuViewAsError: 'shell-menu-view-as-error',
    loading: 'shell-loading', error: 'shell-error', retry: 'shell-retry',
    /* final review I1: Home, Documents and My profile while looking at the app as someone else */
    payrollHidden: 'shell-payroll-hidden',
    /* final review M4: sign-in could not start (main.tsx) */
    startFailed: 'start-failed', startReload: 'start-reload',
  },
  notBuilt: { root: 'not-built', subProject: 'not-built-sub-project' },
  setup: { card: (view: string) => k('setup-card', view), cardDescription: (view: string) => k('setup-description', view),
    /* taste review 2026-10-26: the index's Recent changes, the last five audit entries */
    recent: 'setup-recent', recentRow: (id: string) => k('setup-recent-row', id), recentAll: 'setup-recent-all',
    recentEmpty: 'setup-recent-empty', recentError: 'setup-recent-error' },
  access: {
    table: 'access-table',
    cell: (cap: string, userType: string) => k('access-cell', cap, userType),
    userTypeName: (userType: string) => k('access-user-type-name', userType),
    groupRow: (group: string) => k('access-group-row', group),
    capRow: (cap: string) => k('access-cap-row', cap),
    usersTable: 'access-users-table', caution: 'access-caution',
    userRow: (email: string) => k('access-user-row', email),
    exceptions: (email: string) => k('access-user-exceptions', email),
    exceptionAdd: (email: string) => k('access-exception-add', email),
    exceptionCap: 'access-exception-cap', exceptionMode: 'access-exception-mode',
    exceptionReason: 'access-exception-reason', exceptionSave: 'access-exception-save',
    exceptionRemove: (email: string, cap: string) => k('access-exception-remove', email, cap),
    reach: 'access-reach', reachTip: 'access-reach-tip', usersTip: 'access-users-tip',
  },
  audit: {
    table: 'audit-table', row: (id: string) => k('audit-row', id),
    filterEntity: 'audit-filter-entity', filterWho: 'audit-filter-who', filterText: 'audit-filter-text',
    error: 'audit-error', total: 'audit-total', empty: 'audit-empty', clear: 'audit-clear',
    /* taste review 2026-10-26: the count beside the filters */
    count: 'audit-count',
  },
  /* plan 1b: the employees lists, the employee record, the employee form and the lifecycle dialog */
  employees: {
    table: 'employees-table', row: (code: string) => k('employees-row', code), search: 'employees-search', stateFilter: 'employees-state-filter',
    locationFilter: 'employees-location-filter', loginFilter: 'employees-login-filter', typeFilter: 'employees-type-filter', employmentTypeFilter: 'employees-employment-type-filter',
    count: 'employees-count', empty: 'employees-empty', error: 'employees-error', add: 'employees-add',
    open: (code: string) => k('employees-open', code), edit: (code: string) => k('employees-edit', code), state: (code: string) => k('employees-state', code),
  },
  employee: {
    record: 'employee-record', state: 'employee-state', history: 'employee-history', historyRow: (id: string) => k('employee-history-row', id),
    close: 'employee-close', fact: (key: string) => k('employee-fact', key), stat: (key: string) => k('employee-stat', key),
    edit: 'employee-edit', changeState: 'employee-change-state', error: 'employee-error',
  },
  employeeForm: {
    root: 'employee-form', field: (name: string) => k('employee-form', name), save: 'employee-form-save',
    cancel: 'employee-form-cancel', warn: 'employee-form-warn', changeState: 'employee-form-change-state',
  },
  lifecycle: {
    from: 'lifecycle-from', option: (state: string) => k('lifecycle-option', state), reason: 'lifecycle-reason',
    save: 'lifecycle-save', cancel: 'lifecycle-cancel', warn: 'lifecycle-warn',
  },
  /* plan 1b: My profile, proposing a change, and the manager and payroll approval queues */
  profile: {
    propose: 'profile-propose', value: (key: string) => k('profile-value', key), pending: (key: string) => k('profile-pending', key),
    pendingCount: 'profile-pending-count', field: (key: string) => k('profile-field', key), payroll: (key: string) => k('profile-payroll', key),
    note: 'profile-note', send: 'profile-send', cancel: 'profile-cancel', warn: 'profile-warn', fact: (key: string) => k('profile-fact', key),
    off: 'profile-off', state: 'profile-state', error: 'profile-error', managedTip: 'profile-managed-tip', detailsTip: 'profile-details-tip',
    /* 1c group 8: the way to My documents under the profile (essProfile, v15:5647) */
    docs: 'profile-docs',
    /* Task 18: the Business Central sections (PROF), their reveal toggles, and the Workforce parts' "Not yet connected" */
    bcSection: (key: string) => k('profile-bc-section', key), bcValue: (key: string) => k('profile-bc-value', key),
    bcReveal: (key: string) => k('profile-bc-reveal', key), bcLoading: 'profile-bc-loading', bcFailed: 'profile-bc-failed', bcTip: 'profile-bc-tip',
    notConnected: (key: string) => k('profile-not-connected', key),
  },
  queue: {
    root: (stage: string) => k('profile-queue', stage), row: (id: string) => k('profile-queue-row', id),
    approve: (id: string) => k('profile-queue-approve', id), decline: (id: string) => k('profile-queue-decline', id),
    payroll: (id: string) => k('profile-queue-payroll', id), reason: 'profile-queue-reason',
    confirmDecline: 'profile-queue-confirm-decline', cancelDecline: 'profile-queue-cancel-decline', warn: 'profile-queue-warn',
    notConnected: (stage: string) => k('profile-queue-not-connected', stage),
    count: (stage: string) => k('profile-queue-count', stage),
  },
  /* plan 1b: Dimensions (aloc) and Contracts (acon) */
  dims: {
    card: (kind: string) => k('dims-card', kind), cardDescription: (kind: string) => k('dims-description', kind), back: 'dims-back', add: 'dims-add',
    table: 'dims-table', row: (code: string) => k('dims-row', code), edit: (code: string) => k('dims-edit', code),
    cell: (code: string, key: string) => k('dims-cell', code, key), field: (key: string) => k('dims-form', key),
    /* a project's tasks: the count that opens them, and the list */
    tasks: (code: string) => k('dims-tasks', code), taskList: (code: string) => k('dims-task-list', code),
    save: 'dims-form-save', remove: 'dims-form-remove', removeWhy: 'dims-form-remove-why', cancel: 'dims-form-cancel', warn: 'dims-form-warn',
    groupTip: (kind: string) => k('dims-group', kind, 'tip'), empty: 'dims-empty', error: 'dims-error',
  },
  /* plan 1b: Work patterns (atypes) */
  types: {
    list: 'types-list', /* the dropdown's option for a type (SelectBox names its options) */ chip: (code: string) => `types-list-option-${code}`, add: 'types-add', detail: 'types-detail',
    field: (key: string) => k('types-form', key), cap: (code: string) => k('types-cap', code), save: 'types-save',
    remove: 'types-remove', removeWhy: 'types-remove-why', warn: 'types-warn', jobs: 'types-jobs', jobsLink: 'types-jobs-link',
    newField: (key: string) => k('types-new', key), newSave: 'types-new-save', newCancel: 'types-new-cancel', newWarn: 'types-new-warn',
    error: 'types-error', heldBy: 'types-held-by',
    /* 1c group 8: where a type's capture fields are set */
    setupLink: (view: string) => k('types-setup-link', view),
  },
  /* A Field's own ids come from the control it wraps, so a form never types one by hand. */
  field: { root: (controlTestId: string) => `${controlTestId}-field`, tip: (controlTestId: string) => `${controlTestId}-field-tip` },
  modal: { root: 'modal', title: 'modal-title', close: 'modal-close', confirm: 'modal-confirm', cancel: 'modal-cancel' },
  toast: { info: 'toast-info', error: 'toast-error', next: 'toast-next', dismiss: 'toast-dismiss' },
  /* A page head's own affordances (src/ui/Page.tsx): its i tip and its standing caution. */
  head: { tip: (view: string) => k('head-tip', view), caution: (view: string) => k('head-caution', view) },
  /* module 2: a page's guide behind `?` (src/ui/Guide.tsx) */
  guide: { open: (view: string) => k('guide-open', view), close: 'guide-close' },
  /* module 2: My timesheet (ts): the page, the day view's frame and the week view's frame */
  ts: {
    view: (v: string) => k('ts-view', v), error: 'ts-error',
    dayPrev: 'ts-day-prev', dayNext: 'ts-day-next', dayToday: 'ts-day-today', dayLabel: 'ts-day-label', dayState: 'ts-day-state',
    nonWorking: 'ts-non-working', copyDay: 'ts-copy-day', reason: 'ts-reason', reasonNotes: 'ts-reason-notes',
    submitReason: 'ts-submit-reason', entryTip: 'ts-entry-tip', banner: (kind: string) => k('ts-banner', kind),
    weekPrev: 'ts-week-prev', weekNext: 'ts-week-next', weekToday: 'ts-week-today', weekLabel: 'ts-week-label', weekState: 'ts-week-state',
    seeded: 'ts-seeded', submitWeek: 'ts-submit-week', weekTotal: 'ts-week-total', contracted: 'ts-contracted', weekResult: 'ts-week-result',
    multiweek: 'ts-multiweek', mwTip: 'ts-multiweek-tip', mwAll: 'ts-multiweek-all', mwRow: (ws: string) => k('ts-multiweek-row', ws),
    mwCheck: (ws: string) => k('ts-multiweek-check', ws), mwState: (ws: string) => k('ts-multiweek-state', ws), mwSubmit: 'ts-multiweek-submit',
    mwResult: 'ts-multiweek-result', weekAnswer: 'ts-week-answer',
  },
  /* module 2: the day form, shared by My timesheet and proxy entry */
  dayForm: {
    field: (code: string) => k('day-form', code), tip: (code: string) => k('day-form-tip', code), group: (key: string) => k('day-form-group', key),
    addBreak: 'day-form-add-break', save: 'day-form-save', submit: 'day-form-submit', warn: 'day-form-warn', check: 'day-form-check',
    stat: (key: string) => k('day-form-stat', key), rateTip: 'day-form-rate-tip', empty: 'day-form-empty', refusal: 'day-form-refusal',
  },
  /* module 2: the weekly grid in its three layouts, shared by My timesheet and proxy entry */
  week: {
    grid: 'week-grid', empty: 'week-empty', allocRow: (row: number) => k('week-alloc-row', row), row: (row: number) => k('week-row', row),
    cell: (row: number, day: number, part: string) => k('week-cell', row, day, part), ctx: (row: number, field: string) => k('week-ctx', row, field),
    addAlloc: 'week-add-alloc', delAlloc: (row: number) => k('week-del-alloc', row), rowTotal: (row: number) => k('week-row-total', row),
    dayTotal: (day: number) => k('week-day-total', day), total: 'week-total', alloc: 'week-alloc', allocTip: 'week-alloc-tip',
    day: (day: number) => k('week-day', day), addLine: (day: number) => k('week-add-line', day), delLine: (day: number, line: number) => k('week-del-line', day, line),
    lineCtx: (day: number, line: number, field: string) => k('week-line-ctx', day, line, field),
    lineCell: (day: number, line: number, part: string) => k('week-line-cell', day, line, part), closed: (day: number) => k('week-closed', day),
  },
  /* module 2: Team timesheets (tteam): the day queue, the week matrix, and the bulk approval and return dialogs */
  tteam: {
    view: (v: string) => k('tteam-view', v), error: 'tteam-error', pending: 'tteam-pending', clear: 'tteam-clear', approveAll: 'tteam-approve-all',
    filter: (f: string) => k('tteam-filter', f), search: 'tteam-search', table: 'tteam-table', row: (id: string) => k('tteam-row', id),
    proxyPill: (id: string) => k('tteam-proxy', id), state: (id: string) => k('tteam-state', id),
    history: (id: string) => k('tteam-history', id), approve: (id: string) => k('tteam-approve', id), ret: (id: string) => k('tteam-return', id),
    empty: 'tteam-empty', loading: 'tteam-loading', more: 'tteam-more', refusal: 'tteam-refusal', held: 'tteam-held', elementsTip: 'tteam-elements-tip',
    matrix: 'tteam-matrix', mxAll: 'tteam-mx-all', mxRow: (code: string) => k('tteam-mx-row', code), mxCheck: (code: string) => k('tteam-mx-check', code),
    pip: (code: string, day: number) => k('tteam-pip', code, day), approveSelected: 'tteam-approve-selected',
    weekPrev: 'tteam-week-prev', weekNext: 'tteam-week-next', weekNow: 'tteam-week-now', weekLabel: 'tteam-week-label',
    bulkStat: (key: string) => k('tteam-bulk-stat', key), bulkFlagRow: (id: string) => k('tteam-bulk-flag', id), bulkOutside: 'tteam-bulk-outside',
    bulkAck: 'tteam-bulk-ack', bulkWarn: 'tteam-bulk-warn', bulkConfirm: 'tteam-bulk-confirm', bulkCancel: 'tteam-bulk-cancel',
    returnReason: 'tteam-return-reason', returnConfirm: 'tteam-return-confirm', returnCancel: 'tteam-return-cancel', returnWarn: 'tteam-return-warn',
  },
  /* module 2: proxy entry, opened from a team member's record */
  proxy: {
    open: 'proxy-open', view: (v: string) => k('proxy-view', v), banner: 'proxy-banner', error: 'proxy-error',
    submitDay: 'proxy-submit-day', submitWeek: 'proxy-submit-week', refusal: 'proxy-refusal', held: 'proxy-held',
  },
  /* module 2: Timesheet setup (mts): capture fields, capture rules, allowances and pay rules by type, overtime, the BC boundary */
  mts: {
    error: 'mts-error', warn: 'mts-warn', save: 'mts-save', cancel: 'mts-cancel', dirty: 'mts-dirty',
    card: (key: string) => k('mts-card', key), tip: (key: string) => k('mts-tip', key),
    fieldType: (code: string) => k('mts-field-type', code), fieldCat: (cat: string) => k('mts-field-cat', cat),
    fieldRow: (c: string) => k('mts-field-row', c), fieldVis: (c: string) => k('mts-field-vis', c), fieldMand: (c: string) => k('mts-field-mand', c),
    fieldsEmpty: 'mts-fields-empty', rule: (key: string) => k('mts-rule', key), weekGrid: 'mts-week-grid', weekLayout: 'mts-week-layout',
    type: (code: string) => k('mts-type', code), allowRow: (code: string) => k('mts-allow-row', code),
    allowLabel: (code: string) => k('mts-allow-label', code), allowOn: (code: string) => k('mts-allow-on', code),
    allowAdd: 'mts-allow-add', allowName: 'mts-allow-name', allowConfirm: 'mts-allow-confirm', allowCancel: 'mts-allow-cancel',
    payRow: (i: number) => k('mts-pay-row', i), payTrigger: (i: number) => k('mts-pay-trigger', i), payWhen: (i: number) => k('mts-pay-when', i),
    payCode: (i: number) => k('mts-pay-code', i), payValue: (i: number) => k('mts-pay-value', i), payHow: (i: number) => k('mts-pay-how', i),
    payRemove: (i: number) => k('mts-pay-remove', i), payEmpty: 'mts-pay-empty', payAdd: 'mts-pay-add',
    ot: (key: string) => k('mts-ot', key), otDay: 'mts-ot-day',
    cutoffDay: 'mts-cutoff-day', cutoffTime: 'mts-cutoff-time',
    returnReasonRequired: 'mts-return-reason-required',
    allowTable: 'mts-allow-table',
  },
  /* 1c: Modules & features (amods): the index cards and the drill-in per module */
  amods: {
    error: 'amods-error', loading: 'amods-loading', search: 'amods-search', empty: 'amods-empty',
    card: (code: string) => k('amods-card', code), cardState: (code: string) => k('amods-card-state', code), cardCounts: (code: string) => k('amods-card-counts', code),
    offPill: 'amods-off-pill', moduleCard: 'amods-module-card', moduleTip: 'amods-module-tip', enableNote: 'amods-enable-note',
    features: 'amods-features', featuresTip: 'amods-features-tip', offBanner: 'amods-off-banner', noFeatures: 'amods-no-features',
    mod: (code: string) => k('amods-mod', code), flag: (code: string) => k('amods-flag', code), row: (code: string) => k('amods-row', code),
    weekGrid: 'amods-week-grid', weekLayout: 'amods-week-layout',
    stepDown: (key: string) => k('amods-step-down', key), stepUp: (key: string) => k('amods-step-up', key), stepValue: (key: string) => k('amods-step-value', key),
  },
  /* 1c: Calendar and saved data (acal) */
  acal: {
    error: 'acal-error', loading: 'acal-loading', card: (key: string) => k('acal-card', key), tip: (key: string) => k('acal-tip', key),
    finYear: 'acal-fin-year', weekStart: 'acal-week-start', holidays: 'acal-holidays',
    holiday: (date: string) => k('acal-holiday', date), treatment: (date: string) => k('acal-treatment', date), noHolidays: 'acal-no-holidays',
    saving: 'acal-saving', size: 'acal-size', export: 'acal-export', reset: 'acal-reset', restore: 'acal-restore', build: 'acal-build',
    finYearStart: 'acal-fin-year-start', finYearEnd: 'acal-fin-year-end',
    settingsSave: 'acal-settings-save', settingsCancel: 'acal-settings-cancel',
    region: 'acal-region', fillRegion: 'acal-fill-region', addHoliday: 'acal-add-holiday',
    newHolidayDate: 'acal-new-holiday-date', newHolidayName: 'acal-new-holiday-name',
    holidayDate: (date: string) => k('acal-holiday-date', date), holidayName: (date: string) => k('acal-holiday-name', date),
    holidayEdit: (date: string) => k('acal-holiday-edit', date), holidaySave: (date: string) => k('acal-holiday-save', date),
    holidayCancel: (date: string) => k('acal-holiday-cancel', date), holidayRemove: (date: string) => k('acal-holiday-remove', date),
    fullTimeHours: 'acal-full-time-hours',
  },
  /* 1c: the Rename roles dialog on Permissions (D11) */
  roleNames: { open: 'role-names-open', field: (id: string) => k('role-names-field', id), save: 'role-names-save', cancel: 'role-names-cancel', warn: 'role-names-warn' },
  /* 1c D6: Timesheet setup points at the weekly grid's row in Modules & features */
  mtsPointer: { weekly: 'mts-weekly-pointer', link: 'mts-weekly-link',
    /* module 6: the pay codes the pay rules pick from are kept on Setup → Integrations → Pay codes */
    payCodes: 'mts-pay-codes-pointer', payCodesLink: 'mts-pay-codes-link' },
  /* 1c: Organisation (aorg): the configuration spine, templates, company, compliance and pay periods */
  aorg: {
    error: 'aorg-error', loading: 'aorg-loading', card: (key: string) => k('aorg-card', key), tip: (key: string) => k('aorg-tip', key),
    spine: 'aorg-spine', template: (key: string) => k('aorg-template', key), live: 'aorg-live',
    saveOpen: 'aorg-save-open', importOpen: 'aorg-import-open', importFile: 'aorg-import-file',
    saved: 'aorg-saved', savedRow: (key: string) => k('aorg-saved-row', key), noSaved: 'aorg-no-saved',
    export: (key: string) => k('aorg-export', key), remove: (key: string) => k('aorg-remove', key),
    saveName: 'aorg-save-name', saveDesc: 'aorg-save-desc', scope: (s: string) => k('aorg-scope', s), save: 'aorg-save', saveCancel: 'aorg-save-cancel', saveWarn: 'aorg-save-warn',
    plan: (part: string) => k('aorg-plan', part), planLoading: 'aorg-plan-loading', planError: 'aorg-plan-error', apply: 'aorg-apply', applyCancel: 'aorg-apply-cancel',
    name: 'aorg-name', registration: 'aorg-registration', address: 'aorg-address', country: 'aorg-country',
    nmw: 'aorg-nmw', bankHolidays: 'aorg-bank-holidays', payFrequency: 'aorg-pay-frequency', weekEnding: 'aorg-week-ending',
    firstPayDate: 'aorg-first-pay-date', cutoff: 'aorg-cutoff', cutoffLink: 'aorg-cutoff-link',
    timezone: 'aorg-timezone', timeZones: 'aorg-time-zones', dateFormat: 'aorg-date-format', clock: 'aorg-clock',
    timezoneList: 'aorg-timezone-list', timezoneError: 'aorg-timezone-error',
    /* module 8: the country's time zone, offered when the organisation's differs */
    countryZone: 'aorg-country-zone', useCountryZone: 'aorg-use-country-zone',
  },
  /* 1c group 4: the bell's inbox panel (D9) */
  inbox: {
    panel: 'inbox-panel', markAll: 'inbox-mark-all', empty: 'inbox-empty', loading: 'inbox-loading', error: 'inbox-error',
    item: (id: string) => k('inbox-item', id), dot: (id: string) => k('inbox-dot', id), dest: (id: string) => k('inbox-dest', id),
    /* Task 18, the merged bell (D13): the "n new" pill (BELL.R7), a payroll item's source, and its detail (BELL.R10) */
    newCount: 'inbox-new-count', source: (id: string) => k('inbox-source', id), when: (id: string) => k('inbox-when', id),
    detail: 'inbox-detail', detailWhen: 'inbox-detail-when', detailMessage: 'inbox-detail-message', detailDone: 'inbox-detail-done',
  },
  /* 1c: a link to a page that does not exist, or that this employee cannot open (D9) */
  unavailable: { root: 'unavailable', home: 'unavailable-home' },
  /* 1c group 4: Notifications (anotif): the event x user type channel matrix */
  anotif: {
    error: 'anotif-error', loading: 'anotif-loading', tip: 'anotif-tip', table: 'anotif-table',
    group: (module: string) => k('anotif-group', module), row: (code: string) => k('anotif-row', code),
    cell: (code: string, persona: string) => k('anotif-cell', code, persona), never: (code: string, persona: string) => k('anotif-never', code, persona),
    notConnected: 'anotif-not-connected',
    save: 'anotif-save', cancel: 'anotif-cancel',
  },
  /* 1c group 5: Approvals (aappr): the chain per module, sign-off settings and delegations (D8) */
  aappr: {
    error: 'aappr-error', loading: 'aappr-loading', tip: 'aappr-tip',
    chain: 'aappr-chain', chainTip: 'aappr-chain-tip', chainTable: 'aappr-chain-table', fixedTip: 'aappr-fixed-tip',
    group: (module: string) => k('aappr-group', module), edit: (module: string) => k('aappr-edit', module),
    row: (module: string, i: number) => k('aappr-row', module, i),
    role: (i: number) => k('aappr-role', i), scope: (i: number) => k('aappr-scope', i), when: (i: number) => k('aappr-when', i),
    slaN: (i: number) => k('aappr-sla-n', i), slaUnit: (i: number) => k('aappr-sla-unit', i), remove: (i: number) => k('aappr-remove', i),
    layer: (i: number) => k('aappr-layer', i), add: 'aappr-add', dialogFixedTip: 'aappr-dialog-fixed-tip',
    chainSave: 'aappr-chain-save', chainCancel: 'aappr-chain-cancel', chainWarn: 'aappr-chain-warn',
    signOff: 'aappr-signoff', signOffTip: 'aappr-signoff-tip', methodTip: 'aappr-method-tip', method: 'aappr-method', methodLink: 'aappr-method-link',
    cutoff: 'aappr-cutoff', cutoffLink: 'aappr-cutoff-link', enforceTip: 'aappr-enforce-tip', enforce: 'aappr-enforce', enforceLink: 'aappr-enforce-link',
    current: 'aappr-current', previous: 'aappr-previous', reasonTip: 'aappr-reason-tip', reason: 'aappr-reason', reasonLink: 'aappr-reason-link',
    deleg: 'aappr-deleg', delegTip: 'aappr-deleg-tip', delegTable: 'aappr-deleg-table', delegError: 'aappr-deleg-error', delegLoading: 'aappr-deleg-loading',
    delegRow: (id: string) => k('aappr-deleg-row', id), delegRemove: (id: string) => k('aappr-deleg-remove', id), delegEmpty: 'aappr-deleg-empty',
    delegAdd: 'aappr-deleg-add', who: 'aappr-deleg-who', to: 'aappr-deleg-to', from: 'aappr-deleg-from', until: 'aappr-deleg-until',
    module: (m: string) => k('aappr-deleg-module', m), delegSave: 'aappr-deleg-save', delegCancel: 'aappr-deleg-cancel', delegWarn: 'aappr-deleg-warn',
  },
  /* Task 16: My work → Home, QniConnect's payslip dashboard (portal inventory HOME) */
  home: {
    loading: 'home-loading', failed: 'home-failed', tip: 'home-tip',
    summary: 'home-summary', avatar: 'home-avatar', name: 'home-name', role: 'home-role',
    employeeId: 'home-employee-id', joined: 'home-joined', frequency: 'home-frequency',
    latest: 'home-latest', latestNet: 'home-latest-net', latestPeriod: 'home-latest-period', latestPaid: 'home-latest-paid', latestEmpty: 'home-latest-empty',
    /* Ruling Q19: the lead payslip's three amounts and its own View and Download */
    latestLine: 'home-latest-line', latestView: 'home-latest-view', latestDownload: 'home-latest-download',
    /* D2: the Today strip */
    today: 'home-today', todayState: 'home-today-state', todayWeek: 'home-today-week', todayLink: 'home-today-link',
    /* the eye that shows or hides every amount on the page (ui/PayMask) */
    mask: 'home-mask',
    tax: 'home-tax', taxCode: 'home-tax-code', niNumber: 'home-ni-number', niCategory: 'home-ni-category',
    contact: 'home-contact', email: 'home-email', phone: 'home-phone', address: 'home-address',
    payslips: 'home-payslips', payslip: (row: number) => k('home-payslip', row), placeholder: (row: number) => k('home-payslip-none', row),
    view: (row: number) => k('home-payslip-view', row), download: (row: number) => k('home-payslip-download', row),
  },
  /* the PDF preview (portal inventory PDF), shared by Home and Documents */
  pdf: { frame: 'pdf-frame', empty: 'pdf-empty', close: 'pdf-close', download: 'pdf-download' },
  /* 1c group 7, moved by Task 16: My work → My Calendar (essHome, v15:5323), its month and live key (calKey, 6244) and the day dialog (empDayBox, 5435) */
  cal: {
    error: 'cal-error', loading: 'cal-loading', sentBack: 'cal-sent-back', fixIt: 'cal-fix-it',
    today: 'cal-today', week: 'cal-week',
    month: 'cal-month', prev: 'cal-prev', nextMonth: 'cal-next-month', thisMonth: 'cal-this-month', summary: 'cal-summary', grid: 'cal-grid',
    day: (date: string) => k('cal-day', date), key: 'cal-key', keyItem: (kind: string, id: string | number) => k('cal-key', kind, id), keyEmpty: 'cal-key-empty',
    dayState: 'cal-day-state', dayBank: 'cal-day-bank',
    dayHours: 'cal-day-hours', dayLocked: 'cal-day-locked',
    dayClose: 'cal-day-close', recordHours: 'cal-record-hours',
  },
  /* 1c group 7: My Team → Team Home (mgrTeamHome, v15:10555) */
  thome: { tip: 'thome-tip', grid: 'thome-grid', card: (view: string) => k('thome-card', view), count: (view: string) => k('thome-count', view) },
  /* My work → Documents: Workforce's documents (essDocs, v15:5673) and, since
     Task 17, QniConnect's payslips and tax documents (portal inventory DOCS) */
  docs: {
    error: 'docs-error', loading: 'docs-loading', card: 'docs-card', tip: 'docs-tip', source: 'docs-source', row: (id: string) => k('docs-row', id),
    empty: 'docs-empty', openNote: 'docs-open-note',
    /* the eye that shows or hides the payslips' amounts (ui/PayMask) */
    mask: 'docs-mask',
    headTip: 'docs-head-tip', banner: 'docs-banner', bannerDismiss: 'docs-banner-dismiss', bannerNext: 'docs-banner-next',
    payLoading: 'docs-pay-loading', payslips: 'docs-payslips', year: 'docs-year', payslipsEmpty: 'docs-payslips-empty',
    payslip: (row: number) => k('docs-payslip', row), payslipView: (row: number) => k('docs-payslip-view', row),
    payslipDownload: (row: number) => k('docs-payslip-download', row),
    tax: 'docs-tax', taxEmpty: 'docs-tax-empty', taxFailed: 'docs-tax-failed', taxRow: (type: string) => k('docs-tax-row', type),
    taxView: (type: string) => k('docs-tax-view', type), taxDownload: (type: string) => k('docs-tax-download', type),
    secure: 'docs-secure',
    /* the fiscal year dialog (QniConnect's FiscalYearSelectionModal, FYM) */
    fyLoading: 'docs-fy-loading', fyEmpty: 'docs-fy-empty', fyNone: 'docs-fy-none', fyPrompt: 'docs-fy-prompt',
    fyOption: (i: number) => k('docs-fy-option', i), fyCancel: 'docs-fy-cancel', fyConfirm: 'docs-fy-confirm',
  },
  /* 1c fix B: the live state pill on Permissions (admPermissions, v15:8336) */
  accessState: { pill: 'access-state-pill' },
  /* 1c fix B: why the Saved data card has a session set aside (D14) */
  acalSetAside: { why: 'acal-set-aside-why' },
  /* module 2b: the clock card on My timesheet's day view (.clockcard, v15:6382-6386), the forgotten clock-out
     banner, the Closed later pills on the day and in Team timesheets, and the not-built feature rows */
  clock: {
    card: 'clock-card', ring: 'clock-ring', ringPct: 'clock-ring-pct', timer: 'clock-timer', status: 'clock-status',
    clockIn: 'clock-in', again: 'clock-again', breakStart: 'clock-break-start', resume: 'clock-resume', clockOut: 'clock-out', refusal: 'clock-refusal',
    forgotten: 'clock-forgotten', finish: 'clock-finish', close: 'clock-close', closeRefusal: 'clock-close-refusal',
    closedLate: 'clock-closed-late',
    queueClosedLate: (id: string) => k('clock-queue-closed-late', id),
    notBuilt: (code: string) => k('clock-not-built', code),
    /* review I1: why the day form waits while the clock runs */
    outFirst: 'clock-out-first',
    /* review I2: the forgotten banner's sentence when the day can no longer be written */
    noDay: 'clock-no-day',
    /* review I3: when a clock still running from an earlier day started */
    since: 'clock-since',
    /* review M3: Clock out at a time you choose, after a day rule refused the clock out */
    choose: 'clock-choose', chooseFinish: 'clock-choose-finish', chooseRefusal: 'clock-choose-refusal',
  },
  /* module 5: My work → Onboarding, the new starter's portal (essOnboarding, v15:4766; onbSubmitted, 4796) */
  onb: {
    error: 'onb-error', loading: 'onb-loading', tip: 'onb-tip', progress: 'onb-progress', rail: 'onb-rail', step: (id: string) => k('onb-step', id),
    body: (id: string) => k('onb-body', id), back: 'onb-back', next: 'onb-next', submit: 'onb-submit', saved: 'onb-saved', formWarn: 'onb-form-warn',
    field: (key: string) => k('onb-field', key),
    contact: (i: number) => k('onb-contact', i), contactField: (i: number, key: string) => k('onb-contact', i, key),
    contactAdd: 'onb-contact-add', contactRemove: (i: number) => k('onb-contact-remove', i),
    qual: (i: number) => k('onb-qual', i), qualField: (i: number, key: string) => k('onb-qual', i, key),
    qualAdd: 'onb-qual-add', qualRemove: (i: number) => k('onb-qual-remove', i), noQuals: 'onb-no-quals',
    docs: 'onb-docs', doc: (id: string) => k('onb-doc', id), docState: (id: string) => k('onb-doc-state', id), docFile: (id: string) => k('onb-doc-file', id),
    docReason: (id: string) => k('onb-doc-reason', id), docError: (id: string) => k('onb-doc-error', id),
    docView: (id: string) => k('onb-doc-view', id), docUpload: (id: string) => k('onb-doc-upload', id), filePick: 'onb-file-pick', filesNote: 'onb-files-note',
    viewImage: 'onb-view-image', viewNoPreview: 'onb-view-no-preview', viewReplace: 'onb-view-replace', viewClose: 'onb-view-close',
    policies: 'onb-policies', polCount: 'onb-pol-count', pol: (id: string) => k('onb-pol', id), polAck: (id: string) => k('onb-pol-ack', id),
    polVer: (id: string) => k('onb-pol-ver', id), polRead: (id: string) => k('onb-pol-read', id), polReadPill: (id: string) => k('onb-pol-read-pill', id),
    polError: (id: string) => k('onb-pol-error', id), readBody: 'onb-read-body', readAck: 'onb-read-ack', readClose: 'onb-read-close',
    todo: 'onb-todo', complete: 'onb-complete', review: (key: string) => k('onb-review', key), sign: 'onb-sign', consent: 'onb-consent', consentError: 'onb-consent-error',
    submitted: 'onb-submitted', ref: 'onb-ref', submittedAt: 'onb-submitted-at', whatNext: 'onb-what-next', sentBack: 'onb-sent-back', askedAgain: 'onb-asked-again',
    /* the step card's and the submitted card's `i` tip (the prototype's acard tip) */
    stepTip: 'onb-step-tip', submittedTip: 'onb-submitted-tip',
  },
  /* module 5: My team → Onboarding, the tracker (mgrOnboarding, v15:4729) */
  tonb: {
    error: 'tonb-error', loading: 'tonb-loading', tip: 'tonb-tip', add: 'tonb-add', addEmpty: 'tonb-add-empty', toVerify: 'tonb-to-verify',
    queue: 'tonb-queue', queueTip: 'tonb-queue-tip', queueRow: (code: string, doc: string) => k('tonb-queue-row', code, doc),
    queueFile: (code: string, doc: string) => k('tonb-queue-file', code, doc), check: (code: string, doc: string) => k('tonb-check', code, doc),
    list: 'tonb-list', listTip: 'tonb-list-tip', table: 'tonb-table', empty: 'tonb-empty', row: (code: string) => k('tonb-row', code),
    progress: (code: string) => k('tonb-progress', code), state: (code: string) => k('tonb-state', code), blocking: (code: string) => k('tonb-blocking', code),
    invite: (code: string) => k('tonb-invite', code), start: (code: string) => k('tonb-start', code),
    template: (code: string) => k('tonb-template', code),
    /* the check dialog (onb-review) */
    checkImage: 'tonb-check-image', checkNoPreview: 'tonb-check-no-preview', reason: 'tonb-reason', checkWarn: 'tonb-check-warn',
    notNow: 'tonb-not-now', reject: 'tonb-reject', verify: 'tonb-verify',
    /* the not-ready dialog (onb-activate) */
    notReady: 'tonb-not-ready', blocker: (i: number) => k('tonb-blocker', i), notReadyClose: 'tonb-not-ready-close', chase: 'tonb-chase',
    notReadyTemplate: 'tonb-not-ready-template',
    /* Task 20: the portal invite offered once a starter has started (spec N19) */
    portalOffer: 'tonb-portal-offer', portalSend: 'tonb-portal-send', portalNotNow: 'tonb-portal-not-now', portalNotConnected: 'tonb-portal-not-connected',
  },
  /* module 5: Setup → Modules → Onboarding → Onboarding setup (admOnboarding, v15:4672) */
  monb: {
    error: 'monb-error', loading: 'monb-loading', off: 'monb-off', warn: 'monb-warn', save: 'monb-save', cancel: 'monb-cancel', dirty: 'monb-dirty',
    card: (key: string) => k('monb-card', key), tip: (key: string) => k('monb-tip', key), stepsCount: 'monb-steps-count',
    step: (id: string) => k('monb-step', id), stepSwitch: (id: string) => k('monb-step-switch', id), stepOn: (id: string) => k('monb-step-on', id),
    stepNeeds: (id: string) => k('monb-step-needs', id), stepError: (id: string) => k('monb-step-error', id),
    docs: 'monb-docs', doc: (id: string) => k('monb-doc', id), docReq: (id: string) => k('monb-doc-req', id), docVerify: (id: string) => k('monb-doc-verify', id),
    docBlocks: (id: string) => k('monb-doc-blocks', id), docExpiry: (id: string) => k('monb-doc-expiry', id),
    docVerifyText: (id: string) => k('monb-doc-verify-text', id), docExpiryText: (id: string) => k('monb-doc-expiry-text', id), docShared: 'monb-doc-shared',
    policies: 'monb-policies', polCount: 'monb-pol-count', polsEmpty: 'monb-pols-empty', pol: (id: string) => k('monb-pol', id),
    polVer: (id: string) => k('monb-pol-ver', id), polFile: (id: string) => k('monb-pol-file', id), polAcks: (id: string) => k('monb-pol-acks', id),
    polUpload: (id: string) => k('monb-pol-upload', id), polEdit: (id: string) => k('monb-pol-edit', id), polRemove: (id: string) => k('monb-pol-remove', id),
    polAdd: 'monb-pol-add', polAsked: (id: string) => k('monb-pol-asked', id), polLocked: 'monb-pol-locked', filePick: 'monb-file-pick',
    /* the add and edit dialog (pol-add, pol-edit) */
    polName: 'monb-pol-name', polVersion: 'monb-pol-version', polSum: 'monb-pol-sum', polWarn: 'monb-pol-warn', polCancel: 'monb-pol-cancel', polSave: 'monb-pol-save',
    /* module 8: a document switched off, and the documents this tenant adds, renames and removes */
    docOn: (id: string) => k('monb-doc-on', id), docCustom: (id: string) => k('monb-doc-custom', id),
    docRename: (id: string) => k('monb-doc-rename', id), docRemove: (id: string) => k('monb-doc-remove', id), docAdd: 'monb-doc-add', docLocked: 'monb-doc-locked',
    docName: 'monb-doc-name', docHint: 'monb-doc-hint', docWarn: 'monb-doc-warn', docCancel: 'monb-doc-cancel', docSave: 'monb-doc-save',
    /* templates by position: the bar, the New template dialog and a template while it loads */
    templateBar: 'monb-template-bar', template: 'monb-template', templateNew: 'monb-template-new', templateLoading: 'monb-template-loading',
    newName: 'monb-new-name', newFrom: 'monb-new-from', newWarn: 'monb-new-warn', newCancel: 'monb-new-cancel', newCreate: 'monb-new-create',
    /* the Applies to card: position chips, the add picker, Rename and Delete */
    profile: (code: string) => k('monb-profile', code), profileRemove: (code: string) => k('monb-profile-remove', code),
    profilesEmpty: 'monb-profiles-empty', profileAdd: 'monb-profile-add', profileError: 'monb-profile-error', nameError: 'monb-name-error',
    templateRename: 'monb-template-rename', templateDelete: 'monb-template-delete',
    renameName: 'monb-rename-name', renameWarn: 'monb-rename-warn', renameCancel: 'monb-rename-cancel', renameSave: 'monb-rename-save',
  },
  /* module 6: Setup → Integrations → Pay codes (admPayCodes, v15:9596): the table of base and allowance
     codes, New pay code, and the new or edit dialog (payCodeBox, v15:9554) */
  mpay: {
    error: 'mpay-error', loading: 'mpay-loading', table: 'mpay-table', add: 'mpay-add', footer: 'mpay-footer', workTypeTip: 'mpay-work-type-tip',
    row: (code: string) => k('mpay-row', code), workType: (code: string) => k('mpay-work-type', code), value: (code: string) => k('mpay-value', code),
    claimed: (code: string) => k('mpay-claimed', code), edit: (code: string) => k('mpay-edit', code), readOnly: (code: string) => k('mpay-read-only', code),
    code: 'mpay-code', label: 'mpay-label', basis: 'mpay-basis', valueInput: 'mpay-value-input', element: 'mpay-element', wt: 'mpay-wt',
    money: 'mpay-money', inUse: 'mpay-in-use', warn: 'mpay-warn', cancel: 'mpay-cancel', remove: 'mpay-remove', removeWhy: 'mpay-remove-why', save: 'mpay-save',
  },
  /* Task 19: Setup → Business Central (src/features/connection), QniConnect's admin pages */
  aoverview: {
    loading: 'aoverview-loading', tenant: 'aoverview-tenant', registered: 'aoverview-registered',
    stat: (key: string) => k('aoverview-stat', key), expiry: 'aoverview-expiry', expiryLink: 'aoverview-expiry-link',
    action: (key: string) => k('aoverview-action', key), users: 'aoverview-users', usersAll: 'aoverview-users-all',
    tile: (key: string) => k('aoverview-tile', key), resource: (key: string) => k('aoverview-resource', key),
    /* Ruling Q20: the connection lead block and its term meter */
    connection: 'aoverview-connection', meter: 'aoverview-meter',
  },
  aenv: {
    loading: 'aenv-loading', error: 'aenv-error', add: 'aenv-add', empty: 'aenv-empty', emptyAdd: 'aenv-empty-add', list: 'aenv-list',
    row: (id: string) => k('aenv-row', id), isDefault: (id: string) => k('aenv-default', id), setDefault: (id: string) => k('aenv-set-default', id),
    open: (id: string) => k('aenv-open', id),
    name: 'aenv-name', type: 'aenv-type', url: 'aenv-url', companyId: 'aenv-company-id', companyName: 'aenv-company-name',
    formError: 'aenv-form-error', cancel: 'aenv-cancel', save: 'aenv-save',
  },
  aauth: {
    loading: 'aauth-loading', message: 'aauth-message', refresh: 'aauth-refresh', start: 'aauth-new', card: 'aauth-card',
    notAuthorized: 'aauth-not-authorized', notAuthorizedStart: 'aauth-not-authorized-start', details: 'aauth-details',
    field: (key: string) => k('aauth-field', key), status: 'aauth-status', expiry: 'aauth-expiry',
    accessToken: 'aauth-access-token', refreshToken: 'aauth-refresh-token', show: 'aauth-show',
    copy: (which: string) => k('aauth-copy', which), copied: (which: string) => k('aauth-copied', which),
    begin: 'aauth-begin', cancel: 'aauth-cancel', guide: 'aauth-guide', docsLink: 'aauth-docs-link',
  },
  asettings: {
    loading: 'asettings-loading', message: 'asettings-message', defaultEnvironment: 'asettings-default-environment',
    notifications: 'asettings-notifications', autoRefresh: 'asettings-auto-refresh', interval: 'asettings-interval', debug: 'asettings-debug',
    reset: 'asettings-reset', save: 'asettings-save', note: 'asettings-note',
  },
  /* Task 20: Setup · Employees (src/features/employees): the portal logins
     (inventory USERS) beside the Workforce records, joined by employee number */
  people: {
    records: 'people-records', recordsNotConnected: 'people-records-not-connected', portalCol: (code: string) => k('people-portal', code),
    invite: (code: string) => k('people-invite', code), recordPortal: 'people-record-portal', recordInvite: 'people-record-invite',
    loginLegend: 'people-login-legend',
  },
  ausers: {
    panel: 'ausers-panel', loading: 'ausers-loading', error: 'ausers-error', add: 'ausers-add', search: 'ausers-search',
    tab: (key: string) => k('ausers-tab', key), list: 'ausers-list', empty: 'ausers-empty', clear: 'ausers-clear',
    row: (id: string) => k('ausers-row', id), status: (id: string) => k('ausers-status', id), admin: (id: string) => k('ausers-admin', id),
    lastLogin: (id: string) => k('ausers-last-login', id), noRecord: (id: string) => k('ausers-no-record', id),
    menu: (id: string) => k('ausers-menu', id), locked: (id: string) => k('ausers-locked', id),
    activate: (id: string) => k('ausers-activate', id), deactivate: (id: string) => k('ausers-deactivate', id), edit: (id: string) => k('ausers-edit', id),
    form: 'ausers-form', formError: 'ausers-form-error', name: 'ausers-name', email: 'ausers-email', role: 'ausers-role', isAdmin: 'ausers-is-admin',
    cancel: 'ausers-cancel', save: 'ausers-save',
  },
} as const;

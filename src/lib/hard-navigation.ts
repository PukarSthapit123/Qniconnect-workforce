/* QniConnect's `window.location.href = ...`: a full page load, which starts
   the app again from sign-in. One seam, so a test can watch it (jsdom cannot
   navigate): call it as hardNavigation.go(url), never destructured. */
export const hardNavigation = {
  go(url: string): void { window.location.assign(url); },
};

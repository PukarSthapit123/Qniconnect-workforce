/* QniConnect's old addresses and where each lives now (spec section 8). The
   sign-in gate (src/App.tsx) sends an exact match on, query kept, before
   anything else routes, so a bookmark from before the merge still opens its
   page (or, signed out, signs in on the way to it). */
export const REDIRECTS: Record<string, string> = {
  '/portal': '/work/home',
  '/portal/dashboard': '/work/home',
  '/portal/documents': '/work/docs',
  '/portal/profile': '/work/profile',
  '/admin': '/setup/aoverview',
  '/admin/dashboard': '/setup/aoverview',
  '/admin/users': '/setup/aemployees',
  '/admin/environments': '/setup/aenv',
  '/admin/authorization': '/setup/aauth',
  '/admin/settings': '/setup/asettings',
  '/environment-select': '/account-setup/environment',
  '/forgot-password': '/login',
};

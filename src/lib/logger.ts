/* QniConnect's debug logger (utils/logger.js; inventories AUTH.R6 and public
   DIAG.R1 to DIAG.R5), the whole of it: four methods that print through the
   console method of the same name only when REACT_APP_DEBUG is exactly
   'true', read once when the module loads. Otherwise every call is a no-op,
   errors included, and nothing ever reaches the page. Both env files set it
   to false. MSAL's own messages come through here too (src/auth/config.ts).

   This is all of QniConnect's diagnostics that is ported. Its debug panel
   rendered nothing, and its CORS debugger and CORS error handler were never
   mounted, so none of them is (Ruling Q13); build:check proves that a build
   that is not a debug build carries none of their words
   (scripts/build-check.mjs, DEBUG_MARKERS). In a plain build the switch is
   the constant false, so the minifier drops the console calls. */
const isDebug = import.meta.env.REACT_APP_DEBUG === 'true';

export const logger = {
  log: (...args: unknown[]) => { if (isDebug) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDebug) console.warn(...args); },
  error: (...args: unknown[]) => { if (isDebug) console.error(...args); },
  debug: (...args: unknown[]) => { if (isDebug) console.debug(...args); },
};

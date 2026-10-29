/* QniConnect src/auth/authConfig.js, typed (inventory AUTH.R1, AUTH.R2). The
   values are QC's; only the env access changes (import.meta.env, which reads
   REACT_APP_* through vite.config.ts's envPrefix). */
import { LogLevel, type Configuration } from '@azure/msal-browser';
import { logger } from '@/lib/logger';

export const loginRequest = { scopes: ['User.Read', 'openid', 'profile', 'email'] };

/* QC defines read, readWrite and api; all three are this one scope. */
export const businessCentralScopes = { read: ['https://api.businesscentral.dynamics.com/.default'] };

/* Built on call, not at import, so window.location is read where MSAL is made. */
export const msalConfig = (origin: string = window.location.origin): Configuration => ({
  auth: {
    clientId: import.meta.env.REACT_APP_CLIENT_ID || 'demoClientID',
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: origin,
    postLogoutRedirectUri: origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: true,
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message, containsPii) => {
        if (containsPii) return;
        logger.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Warning,
    },
  },
});

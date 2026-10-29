/// <reference types="vite/client" />
/* Set by vite.config.ts's fakeServerFlag plugin; read it through src/lib/fake-server.ts. */
declare const __FAKE_SERVER_ON__: boolean;

/* Read through import.meta.env. REACT_APP_* come from QC's .env files (vite.config.ts
   envPrefix); VITE_FAKE_BC and VITE_AUTH are set in .env.test. main.tsx reads VITE_AUTH
   (behind __FAKE_SERVER_ON__). VITE_FAKE_BC 'off' turns the fake /bc and /session off
   (src/mocks/bc/handlers.ts, src/api/bc/client.ts); anything else leaves it on. */
interface ImportMetaEnv {
  readonly REACT_APP_CLIENT_ID?: string;
  readonly REACT_APP_TENANT_ID?: string;
  readonly REACT_APP_AUTHORITY?: string;
  readonly REACT_APP_REDIRECT_URI?: string;
  readonly REACT_APP_API_BASE_URL?: string;
  readonly REACT_APP_BC_API_BASE_URL?: string;
  readonly REACT_APP_DEBUG?: string;
  readonly VITE_FAKE_BC?: 'on' | 'off';
  /* the /api/v1 modules the fake server answers (src/lib/fake-modules.ts): unset is all of them */
  readonly VITE_FAKE_MODULES?: string;
  readonly VITE_AUTH?: 'stub' | 'msal';
  readonly VITE_MOCKS?: 'on' | 'off';
}

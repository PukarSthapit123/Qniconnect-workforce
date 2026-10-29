import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { auth, setAuth } from './auth';
import { msalAuth } from './auth/msal';
import { trackInputModality } from './ui/inputModality';
import { logger } from './lib/logger';
import { StartFailed } from './shell/StartFailed';

async function start() {
  trackInputModality();
  /* The literal behind lib/fake-server.ts's FAKE_SERVER_ON, used directly
     here on purpose: a constant inside this very module is what lets the
     bundler drop the dynamic import before it builds the chunk graph, so a
     plain production build does not even emit the fake server's chunk. */
  if (__FAKE_SERVER_ON__) await (await import('./mocks/browser')).startFakeServer();
  /* The same literal, for the same reason: in a plain production build the
     condition is false before VITE_AUTH is even read, so the stub's chunk is
     never emitted and the app always signs in through Microsoft Entra. */
  if (__FAKE_SERVER_ON__ && import.meta.env.VITE_AUTH === 'stub') setAuth((await import('./mocks/auth-stub')).stubAuth);
  else setAuth(msalAuth);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index.html declares #root; its absence is a build-time defect, not a runtime one to guard against.
  const root = createRoot(document.getElementById('root')!);
  /* QniConnect rendered nothing until MSAL was initialised and the redirect
     handled (index.js). One that fails is said, not left blank (final review
     M4, Ruling A3's upgrade). */
  try {
    await auth().init();
  } catch (e) {
    logger.error('Sign-in could not start:', e);
    root.render(<StrictMode><StartFailed /></StrictMode>);
    return;
  }
  root.render(<StrictMode><App /></StrictMode>);
}
void start();

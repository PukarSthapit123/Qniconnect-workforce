import { tid } from '@/testids';
import { Button, Card } from '@/ui';

/* Sign-in could not start: MSAL's initialise or its redirect handling
   rejected before the app could render (main.tsx). QniConnect left the page
   blank (Ruling A3); this says what happened and what to do next (final
   review M4). Nothing here depends on a session or the router. */
export function StartFailed() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-lg">
      <Card testId={tid.shell.startFailed} className="max-w-md text-center">
        <p role="alert" className="font-semibold">QniConnect could not start sign-in. Reload the page.</p>
        <p className="mt-sm text-sm text-text-secondary">If it happens again, ask your administrator.</p>
        <div className="mt-md flex justify-center">
          <Button testId={tid.shell.startReload} kind="primary" onClick={() => { window.location.reload(); }}>Reload</Button>
        </div>
      </Card>
    </div>);
}

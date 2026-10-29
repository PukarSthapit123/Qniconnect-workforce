// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEBUG_MARKERS, debugBuild, findMarkers, MARKERS, markersFor } from './build-check.mjs';

/* I8: build:check fails the build on any trace of the fake server. */
let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'build-check-')); mkdirSync(join(dir, 'assets')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a clean dist has no markers', () => {
  writeFileSync(join(dir, 'assets', 'index.js'), 'console.log("hello")');
  expect(findMarkers(dir)).toEqual([]);
});
/* Single-quoted, as a minifier writes a literal holding double quotes (the
   stub's '{"alg":"none"}'); JSON.stringify would escape them out of the text. */
test.each(MARKERS)('a dist carrying %s is caught', marker => {
  writeFileSync(join(dir, 'assets', 'index.js'), `const x = '${marker}';`);
  expect(findMarkers(dir)).toEqual([`assets/index.js: contains "${marker}"`]);
});
test('the worker script is caught by its file name alone', () => {
  writeFileSync(join(dir, 'mockServiceWorker.js'), '');
  expect(findMarkers(dir)).toContain('mockServiceWorker.js: file name contains "mockServiceWorker"');
});

/* Task 21, DIAG: QniConnect's diagnostics UI (its debug panel, CORS debugger
   and CORS error handler) is not ported (Ruling Q13), and a build without
   REACT_APP_DEBUG=true must never carry any of it. */
test.each(DEBUG_MARKERS)('DIAG.R10: a non-debug dist carrying the diagnostics text %s is caught', marker => {
  writeFileSync(join(dir, 'assets', 'index.js'), `const x = '${marker}';`);
  expect(findMarkers(dir, DEBUG_MARKERS)).toEqual([`assets/index.js: contains "${marker}"`]);
});
test('DIAG.R10: the debug markers are checked unless REACT_APP_DEBUG is exactly "true", from the process or the production env file', () => {
  expect(DEBUG_MARKERS).toEqual(['Auth Debug', 'CORS Debugger', 'CORS Error Detected', 'Force Auth']);
  expect(debugBuild({}, 'REACT_APP_DEBUG=false\n')).toBe(false);
  expect(debugBuild({}, 'A=1\r\nREACT_APP_DEBUG=true\r\n')).toBe(true);
  expect(debugBuild({}, 'REACT_APP_DEBUG=TRUE')).toBe(false);
  expect(debugBuild({}, '')).toBe(false);
  expect(debugBuild({ REACT_APP_DEBUG: 'true' }, 'REACT_APP_DEBUG=false')).toBe(true);
  expect(debugBuild({ REACT_APP_DEBUG: 'false' }, 'REACT_APP_DEBUG=true')).toBe(false);
  expect(markersFor(false)).toEqual([...MARKERS, ...DEBUG_MARKERS]);
  expect(markersFor(true)).toEqual(MARKERS);
});

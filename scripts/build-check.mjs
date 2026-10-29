/* npm run build:check: make the plain production build and fail if any part
   of the fake server reached it. A plain build must never carry the _dev
   control endpoints, the demo password, MSW's worker, the seed or the auth
   stub (src/mocks/auth-stub.ts). Nor, unless REACT_APP_DEBUG is 'true', any
   development diagnostics (DEBUG_MARKERS). */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
/* The seed marker is the demo tenant's email domain: every seeded employee and
   account in social.json carries it, and nothing outside the seed does. The
   auth stub's markers are its sessionStorage key and the header of the
   unsigned tokens it makes; MSAL itself contains neither. The dev picker's
   marker is the sessionStorage key that keeps its choice
   (src/lib/dev-account.ts). The fake /bc seed's marker is its demo
   registration id, which every fake portal user and environment carries.
   The per-module switch's marker is its own name, which only its refusal of
   a bad value spells out (src/lib/fake-modules.ts). */
export const MARKERS = ['_dev/', 'Qnipay@123', 'setupWorker', 'mockServiceWorker', '@brightpath.org', 'qniconnect.stubAccount', 'qniconnect.devAccount', 'alg":"none', 'REG-DEMO-', '__fakeBc', 'VITE_FAKE_MODULES'];
/* QniConnect's diagnostics UI, by its own words (public inventory DIAG): the
   debug panel's heading and its Force Auth button, the CORS debugger's
   heading and the CORS error handler's banner. None of it is ported (Ruling
   Q13), and a build that is not a debug build must never carry it. */
export const DEBUG_MARKERS = ['Auth Debug', 'CORS Debugger', 'CORS Error Detected', 'Force Auth'];

/* A debug build: REACT_APP_DEBUG is exactly 'true', in the process (which
   wins, as with Vite) or else in the production env file. */
export function debugBuild(processEnv, envFileText) {
  if (processEnv.REACT_APP_DEBUG !== undefined) return processEnv.REACT_APP_DEBUG === 'true';
  const line = envFileText.split(/\r?\n/).find(l => l.startsWith('REACT_APP_DEBUG='));
  return line !== undefined && line.slice('REACT_APP_DEBUG='.length).trim() === 'true';
}
export const markersFor = debug => (debug ? MARKERS : [...MARKERS, ...DEBUG_MARKERS]);

export function findMarkers(dir, markers = MARKERS) {
  const hits = [];
  const walk = d => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const rel = relative(dir, p).split(sep).join('/');
      for (const m of markers) if (rel.includes(m)) hits.push(`${rel}: file name contains "${m}"`);
      if (!/\.(js|mjs|css|html|json|map|txt)$/.test(name)) continue;
      const text = readFileSync(p, 'utf8');
      for (const m of markers) if (text.includes(m)) hits.push(`${rel}: contains "${m}"`);
    }
  };
  walk(dir);
  return hits;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = { ...process.env };
  delete env.VITE_MOCKS;
  const r = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true, env });
  if (r.status !== 0) { console.error('build:check: the production build failed'); process.exit(r.status ?? 1); }
  const envFile = resolve(root, '.env.production');
  const markers = markersFor(debugBuild(env, existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''));
  const hits = findMarkers(dist, markers);
  if (hits.length) {
    console.error('build:check: the production build carries the fake server or debug diagnostics:\n  ' + hits.join('\n  '));
    process.exit(1);
  }
  console.log(`build:check: dist/ is free of ${markers.join(', ')}`);
}

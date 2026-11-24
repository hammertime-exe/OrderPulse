// Builds dist/lambda/{api,agent} for `sam deploy`. Run: npm run build:lambda
import { execSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { build, type BuildOptions } from 'esbuild';
import pkg from '../package.json' with { type: 'json' };

rmSync('dist', { recursive: true, force: true });
execSync('npx vite build', { stdio: 'inherit' });

const common: BuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // AWS SDK ships with the Lambda runtime; Playwright and Chromium are installed as real packages (they carry binaries)
  external: ['@aws-sdk/*', 'playwright-core', '@sparticuz/chromium'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
};
await build({ ...common, entryPoints: ['server/lambda-api.ts'], outfile: 'dist/lambda/api/index.mjs' });
cpSync('dist/web', 'dist/lambda/api/web', { recursive: true });

await build({ ...common, entryPoints: ['server/lambda-agent.ts'], outfile: 'dist/lambda/agent/index.mjs' });
const dev = pkg.devDependencies as Record<string, string>;
writeFileSync('dist/lambda/agent/package.json', JSON.stringify({
  type: 'module',
  dependencies: { 'playwright-core': dev['playwright-core'], '@sparticuz/chromium': dev['@sparticuz/chromium'] },
}));
execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund', { cwd: 'dist/lambda/agent', stdio: 'inherit' });

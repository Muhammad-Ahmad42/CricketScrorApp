import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, '.expo', 'types');
const require = createRequire(join(ROOT, 'package.json'));

function resolveGenerator() {
  const cli = require.resolve('@expo/cli/package.json', { paths: [dirname(require.resolve('expo/package.json'))] });
  return require.resolve('@expo/router-server/build/typed-routes', { paths: [dirname(cli)] });
}

const target = join(OUTPUT, 'router.d.ts');
rmSync(target, { force: true });
process.env.EXPO_ROUTER_APP_ROOT = join(ROOT, 'src', 'app');
const generator = require(resolveGenerator());
generator.regenerateDeclarations(OUTPUT, {});

const deadline = Date.now() + 10000;
const timer = setInterval(() => {
  if (existsSync(target)) {
    clearInterval(timer);
    process.stdout.write(`Typed routes written to ${target}\n`);
  } else if (Date.now() > deadline) {
    clearInterval(timer);
    process.stderr.write('Typed routes were not generated.\n');
    process.exitCode = 1;
  }
}, 100);

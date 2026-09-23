import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
process.chdir(projectRoot);
process.env.PORT ??= '8080';
process.env.HOST ??= '0.0.0.0';
process.env.NODE_ENV ??= 'production';

if (!existsSync(resolve(projectRoot, 'node_modules', 'tsx'))) {
  console.log(JSON.stringify({ event: 'discloud_dependencies_installing' }));
  execFileSync('npm', ['ci', '--omit=dev'], { cwd: projectRoot, stdio: 'inherit' });
}

const { register } = await import('tsx/esm/api');
register();
await import('./server.ts');

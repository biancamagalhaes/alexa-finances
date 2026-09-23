import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const stagingDirectory = join(skillDirectory, 'alexa-hosted-build');
const lambdaDirectory = join(stagingDirectory, 'lambda');
const archivePath = join(skillDirectory, 'minha-carteira-alexa-hosted-code.zip');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: skillDirectory, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(stagingDirectory, { recursive: true, force: true });
rmSync(archivePath, { force: true });
mkdirSync(lambdaDirectory, { recursive: true });

run('npx', ['tsc', '--outDir', lambdaDirectory]);
cpSync(join(skillDirectory, 'package.json'), join(lambdaDirectory, 'package.json'));
cpSync(join(skillDirectory, 'package-lock.json'), join(lambdaDirectory, 'package-lock.json'));
cpSync(
  join(skillDirectory, 'hosted-template', 'services', 'portfolio-api.js'),
  join(lambdaDirectory, 'services', 'portfolio-api.js'),
);

run('zip', ['-qr', archivePath, 'lambda'], { cwd: stagingDirectory });
console.log(`Alexa-hosted code package created at ${archivePath}`);

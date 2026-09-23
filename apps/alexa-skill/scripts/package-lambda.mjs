import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const deployDirectory = join(skillDirectory, 'deploy');
const archivePath = join(skillDirectory, 'minha-carteira-lambda.zip');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: skillDirectory,
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

rmSync(deployDirectory, { recursive: true, force: true });
rmSync(archivePath, { force: true });
mkdirSync(deployDirectory, { recursive: true });

run('npx', ['tsc', '--outDir', 'deploy']);
cpSync(join(skillDirectory, 'package.json'), join(deployDirectory, 'package.json'));
cpSync(join(skillDirectory, 'package-lock.json'), join(deployDirectory, 'package-lock.json'));
run('npm', ['ci', '--omit=dev', '--prefix', deployDirectory]);

if (!existsSync(join(deployDirectory, 'index.js'))) {
  throw new Error('O pacote da Lambda não contém index.js na raiz.');
}

run('zip', ['-qr', archivePath, '.'], { cwd: deployDirectory });
console.log(`Pacote criado em ${archivePath}`);

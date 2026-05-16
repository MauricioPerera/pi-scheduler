#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const packages = ['scheduler-core', 'scheduler-ext'];
const rootDir = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  const type = process.argv[2] || 'patch';
  if (!['patch', 'minor'].includes(type)) {
    console.error('Usage: node scripts/release.mjs [patch|minor]');
    process.exit(1);
  }

  const rootPkg = readJson(join(rootDir, 'package.json'));
  const newVersion = bumpVersion(rootPkg.version, type);
  console.log(`Releasing v${newVersion} (${type})...`);

  rootPkg.version = newVersion;
  writeJson(join(rootDir, 'package.json'), rootPkg);

  for (const pkg of packages) {
    const pkgPath = join(rootDir, 'packages', pkg, 'package.json');
    const data = readJson(pkgPath);
    data.version = newVersion;
    if (data.dependencies?.['@earendil-works/pi-scheduler-core']) {
      data.dependencies['@earendil-works/pi-scheduler-core'] = `^${newVersion}`;
    }
    writeJson(pkgPath, data);
    console.log(`  ${pkg}: ${newVersion}`);
  }

  execSync('git add package.json packages/*/package.json', { cwd: rootDir });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { cwd: rootDir });
  execSync(`git tag v${newVersion}`, { cwd: rootDir });

  console.log(`Released v${newVersion}`);
  console.log('Run "npm run build && npm publish --workspaces" to publish.');
}

main();

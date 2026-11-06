const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, '.tmp');

// 1. Ensure .tmp directory exists on Drive D
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// 2. Redirect TEMP and TMP environment variables to Drive D
process.env.TEMP = tmpDir;
process.env.TMP = tmpDir;

console.log('[Dev Launcher] Directing compiler temp & hook files to Drive D:');
console.log('               ' + tmpDir);

// 3. Locate ts-node-dev binary
const isWin = process.platform === 'win32';
const tsNodeDevBin = path.join(rootDir, 'node_modules', '.bin', isWin ? 'ts-node-dev.cmd' : 'ts-node-dev');

// Optimized flags: ignore watching node_modules, .tmp, dist, uploads, data to avoid slow file watching lag
const args = [
  '--respawn',
  '--transpile-only',
  '--exit-child',
  '--ignore-watch',
  'node_modules,.tmp,dist,uploads,data',
  'src/server.ts',
];

const quotedBin = `"${tsNodeDevBin}"`;
const child = spawn(quotedBin, args, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    TEMP: tmpDir,
    TMP: tmpDir,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

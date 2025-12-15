import { spawn } from 'node:child_process';

const BASE = process.env.WARMUP_BASE || 'http://localhost:3000';
const TARGETS = ['/', '/api/status'];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForReady(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE, { method: 'GET' });
      if (res.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function warmup() {
  const ready = await waitForReady();
  if (!ready) {
    console.error('[warmup] Dev server not ready within timeout');
    return;
  }
  for (const path of TARGETS) {
    try {
      const url = BASE + path;
      const res = await fetch(url, { method: 'GET' });
      // console.log(`[warmup] ${path} -> ${res.status}`);
    } catch (e) {
      console.log(`[warmup] ${path} -> error`);
    }
  }
}

function run() {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'dev'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  // Fire warmup in parallel; it waits until server is reachable
  warmup().catch(() => {});

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

run();



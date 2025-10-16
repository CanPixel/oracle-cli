// Simple warmup script: waits for dev server to be reachable, then pings routes
// to trigger compilation without opening the browser.

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
    process.exit(0); // do not fail the dev script
  }

  for (const path of TARGETS) {
    try {
      const url = BASE + path;
      const res = await fetch(url, { method: 'GET' });
      console.log(`[warmup] ${path} -> ${res.status}`);
    } catch (e) {
      console.log(`[warmup] ${path} -> error`);
    }
  }
  process.exit(0);
}

warmup();



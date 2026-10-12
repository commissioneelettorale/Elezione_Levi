'use strict';
const expected = process.env.EXPECTED_RELEASE;
if (!/^[a-f0-9]{40}$/.test(expected || '')) throw Error('Expected release missing');
(async () => {
  for (let attempt = 0; attempt < 36; attempt++) {
    try {
      const response = await fetch('https://elezione-levi.vercel.app/api/call', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ name: 'getPublicServiceStatus', data: {} }), signal: AbortSignal.timeout(10000)
      });
      const body = await response.json();
      if (response.ok && body.data?.release?.commit === expected && body.data.release.environment === 'production') {
        console.log('Expected Production release confirmed.'); return;
      }
    } catch (_) { /* Retry transient deployment errors without logging response bodies. */ }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw Error('Expected Production release not available: migration not started');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

import assert from 'node:assert/strict';
import { verifyLinearSignature } from '../worker/src/linear/signature';

async function run() {
  const payload = JSON.stringify({ hello: 'world' });
  const secret = 'test_secret';
  const currentTimestamp = String(Date.now());
  const staleTimestamp = String(Date.now() - 5 * 60 * 1000);
  const originalWarn = console.warn;

  console.warn = () => {};

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const ok = await verifyLinearSignature({
      secret,
      payload,
      headerSignature: hex,
      headerTimestamp: currentTimestamp,
    });
    assert.equal(ok, true);

    const bad = await verifyLinearSignature({
      secret,
      payload,
      headerSignature: 'deadbeef',
      headerTimestamp: currentTimestamp,
    });
    assert.equal(bad, false);

    const stale = await verifyLinearSignature({
      secret,
      payload,
      headerSignature: hex,
      headerTimestamp: staleTimestamp,
    });
    assert.equal(stale, false);
  } finally {
    console.warn = originalWarn;
  }

  console.log('signature.test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

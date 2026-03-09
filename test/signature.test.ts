import assert from 'node:assert/strict';
import { verifyLinearSignature } from '../worker/src/linear/signature';

async function run() {
  const payload = JSON.stringify({ hello: 'world' });
  const secret = 'test_secret';

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');

  const ok = await verifyLinearSignature({ secret, payload, headerSignature: hex });
  assert.equal(ok, true);

  const bad = await verifyLinearSignature({ secret, payload, headerSignature: 'deadbeef' });
  assert.equal(bad, false);

  console.log('signature.test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

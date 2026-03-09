import assert from 'node:assert/strict';
import { LinearWebhookEnvelopeSchema } from '../worker/src/domain/linear';

function run() {
  const webhook = LinearWebhookEnvelopeSchema.parse({
    id: 'wh_1',
    type: 'Issue',
    action: 'create',
    data: { id: '1' }
  });
  assert.equal(webhook.type, 'Issue');
  assert.equal(webhook.action, 'create');

  assert.throws(() => LinearWebhookEnvelopeSchema.parse({ type: 'Issue' }));
  console.log('schemas.test passed');
}

run();

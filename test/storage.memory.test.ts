import assert from 'node:assert/strict';
import { InMemoryStorage } from '../worker/src/storage/memory';

async function run() {
  const storage = new InMemoryStorage();
  const created = await storage.tasks.create({
    source: 'linear',
    eventType: 'issue.created',
    webhookId: 'wh_1',
    workspaceId: 'ws_1',
    organizationId: null,
    issueId: 'issue_1',
    issueIdentifier: 'PCF-1',
    commentId: null,
    actorId: 'user_1',
    actorName: 'Tester',
    payloadJson: JSON.stringify({ hello: 'world' })
  });

  assert.equal(created.status, 'pending');

  const pending = await storage.tasks.listByStatus({ status: 'pending', limit: 10 });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, created.id);

  const claimed = await storage.tasks.claim(created.id, 300);
  assert.ok(claimed);
  assert.equal(claimed?.status, 'processing');

  const completed = await storage.tasks.applyResult(created.id, {
    status: 'completed',
    resultAction: 'noop',
    resultReason: null,
    replyBody: null
  });
  assert.ok(completed);
  assert.equal(completed?.status, 'completed');

  console.log('storage.memory.test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

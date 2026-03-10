import assert from 'node:assert/strict';

export async function testInvokeReplayAgentSessionCreated() {
  const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
  const secret = process.env.OPENCLAW_INTERNAL_SECRET || 'test-secret';

  const payload = {
    type: 'AgentSessionEvent.created',
    agentSessionId: 'as_test_123',
    workspaceId: 'ws_test_456',
    issue: {
      identifier: 'WS-37',
      title: 'Overnight Coding — Invocation boundary',
      url: 'https://linear.app/example/issue/WS-37',
    },
    guidance: { text: 'Be fast and transparent.' },
    promptContext: {
      task: 'Write the first thought and plan.',
      comment: { body: 'Please start.' },
    },
  };

  const res = await fetch(`${baseUrl}/internal/invoke/replay/agent-session-created`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(typeof json.traceId === 'string' && json.traceId.length > 10);
  assert.ok(json.reserved);
  assert.equal(json.reserved.receivedType, 'AgentSessionEvent.created');
  assert.ok(typeof json.reserved.firstThoughtPrompt === 'string');
  assert.match(json.reserved.firstThoughtPrompt, /Linear Expert agent/i);
  assert.match(json.reserved.firstThoughtPrompt, /WS-37/i);
}

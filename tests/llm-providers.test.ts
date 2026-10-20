// Run: node --experimental-strip-types --test tests/llm-providers.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCall, costOf, parseRequest, parseResponse, providerError, withoutOptionalParams, LIMITS } from '../supabase/functions/llm/providers.ts';

const ok = (body: unknown) => {
  const r = parseRequest(body);
  assert.notEqual(typeof r, 'string', String(r));
  return r as Exclude<typeof r, string>;
};

test('parseRequest accepts a conversation and caps max_tokens', () => {
  const r = ok({ messages: [{ role: 'user', content: 'Cześć' }], system: 'Bądź miły', temperature: 0.2, max_tokens: 99999 });
  assert.equal(r.max_tokens, LIMITS.maxTokens);
  assert.equal(r.system, 'Bądź miły');
  assert.equal(r.temperature, 0.2);
});

test('parseRequest rejects bad input with a Polish message', () => {
  assert.match(String(parseRequest({ messages: [] })), /niepustej listy/);
  assert.match(String(parseRequest({ messages: [{ role: 'system', content: 'x' }] })), /role/);
  assert.match(String(parseRequest({ messages: [{ role: 'user', content: '' }] })), /content/);
  assert.match(String(parseRequest({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] })), /Ostatnia/);
  assert.match(String(parseRequest({ messages: [{ role: 'user', content: 'a' }], temperature: 3 })), /temperature/);
  assert.match(String(parseRequest({ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.chars + 1) }] })), /Za długi/);
  assert.match(String(parseRequest(null)), /niepustej listy/);
});

test('buildCall: Anthropic puts system outside messages, OpenRouter as the first message', () => {
  const req = ok({ messages: [{ role: 'user', content: 'Hej' }], system: 'Pirat' });
  const a = buildCall('anthropic', 'claude-haiku-4-5', 'k', req);
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a.headers['x-api-key'], 'k');
  assert.equal((a.body as any).system, 'Pirat');
  assert.deepEqual((a.body as any).messages, [{ role: 'user', content: 'Hej' }]);
  assert.equal('temperature' in a.body, false);

  const o = buildCall('openrouter', 'anthropic/claude-haiku-4.5', 'k', req);
  assert.equal(o.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal((o.headers as any).Authorization, 'Bearer k');
  assert.deepEqual((o.body as any).messages[0], { role: 'system', content: 'Pirat' });
  assert.deepEqual((o.body as any).usage, { include: true });
});

test('effort goes to output_config (Anthropic) and reasoning (OpenRouter); default max_tokens leaves room for thinking', () => {
  const req = { ...ok({ messages: [{ role: 'user', content: 'Hej' }] }), effort: 'low' as const };
  assert.equal(req.max_tokens, LIMITS.defaultMaxTokens);
  assert.deepEqual((buildCall('anthropic', 'claude-haiku-5-5', 'k', req).body as any).output_config, { effort: 'low' });
  assert.deepEqual((buildCall('openrouter', 'anthropic/claude-haiku-5.5', 'k', req).body as any).reasoning, { effort: 'low' });
});

test('withoutOptionalParams drops temperature and effort for the retry', () => {
  const req = { ...ok({ messages: [{ role: 'user', content: 'Hej' }], temperature: 0 }), effort: 'low' as const };
  const retry = withoutOptionalParams(req)!;
  assert.deepEqual(retry.dropped, ['temperature', 'effort']);
  assert.equal('temperature' in retry.request || 'effort' in retry.request, false);
  assert.equal(withoutOptionalParams(ok({ messages: [{ role: 'user', content: 'Hej' }] })), null);
});

test('parseResponse: Anthropic skips thinking blocks', () => {
  const r = parseResponse('anthropic', {
    content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Ahoj' }],
    usage: { input_tokens: 5, output_tokens: 40 },
    stop_reason: 'end_turn',
  });
  assert.equal(r.text, 'Ahoj');
});

test('parseResponse: Anthropic text blocks and usage', () => {
  const r = parseResponse('anthropic', {
    content: [{ type: 'text', text: 'Ahoj' }, { type: 'text', text: '!' }],
    usage: { input_tokens: 12, output_tokens: 3 },
    stop_reason: 'end_turn',
  });
  assert.deepEqual(r, { text: 'Ahoj!', input_tokens: 12, output_tokens: 3, stop_reason: 'end_turn', cost_usd: null });
});

test('parseResponse: OpenRouter cost and finish_reason "length"', () => {
  const r = parseResponse('openrouter', {
    choices: [{ message: { content: 'Ahoj' }, finish_reason: 'length' }],
    usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.00003 },
  });
  assert.equal(r.text, 'Ahoj');
  assert.equal(r.stop_reason, 'max_tokens');
  assert.equal(r.cost_usd, 0.00003);
  assert.throws(() => parseResponse('openrouter', { error: 'x' }));
});

test('costOf: provider cost first, else prices per million tokens', () => {
  const prices = { input_price_per_mtok: 1, output_price_per_mtok: 5 };
  assert.equal(costOf({ text: '', input_tokens: 1_000_000, output_tokens: 200_000, stop_reason: '', cost_usd: null }, prices), 2);
  assert.equal(costOf({ text: '', input_tokens: 5, output_tokens: 5, stop_reason: '', cost_usd: 0.5 }, prices), 0.5);
});

test('providerError maps statuses', () => {
  assert.equal(providerError(401).status, 502);
  assert.match(providerError(402).message, /środki/);
  assert.equal(providerError(429).status, 429);
  assert.equal(providerError(529).status, 503);
});

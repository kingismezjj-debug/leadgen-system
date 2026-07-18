import test from 'node:test';
import assert from 'node:assert/strict';
import { translateEmailCampaign, validateTargetLanguage } from '../server/translate.mjs';

test('validateTargetLanguage accepts BCP-like language codes and rejects bad values', () => {
  assert.equal(validateTargetLanguage('en'), 'en');
  assert.equal(validateTargetLanguage('zh-CN'), 'zh-CN');
  assert.throws(() => validateTargetLanguage('../en'), /targetLanguage/);
});

test('translateEmailCampaign translates subject and sanitized html while preserving template fields', async () => {
  const calls = [];
  const fakeFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return new Response(JSON.stringify({
      data: {
        translations: body.q.map((value) => ({
          translatedText: value
            .replace('Hello', 'Hola')
            .replace('intro', 'presentacion')
        }))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await translateEmailCampaign({
    subject: 'Hello {{name}}',
    body: 'Hello {name}',
    htmlBody: '<p>Hello {{name}}</p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
    targetLanguage: 'es',
    apiKey: 'test-key',
    fetchImpl: fakeFetch
  });

  assert.equal(result.subject, 'Hola {{name}}');
  assert.match(result.htmlBody, /Hola {{name}}/);
  assert.doesNotMatch(result.htmlBody, /script|onerror/);
  assert.equal(result.body, 'Hola {{name}}');
  assert.equal(calls[0].format, 'text');
  assert.equal(calls[1].format, 'html');
});

test('translateEmailCampaign preserves single-brace template fields in plain text', async () => {
  const fakeFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({
      data: {
        translations: body.q.map((value) => ({
          translatedText: value.replace('Hello', 'Hola')
        }))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await translateEmailCampaign({
    subject: 'Hello {name}',
    body: 'Hello {name}',
    htmlBody: '',
    targetLanguage: 'es',
    apiKey: 'test-key',
    fetchImpl: fakeFetch
  });

  assert.equal(result.subject, 'Hola {name}');
  assert.equal(result.body, 'Hola {name}');
  assert.equal(result.htmlBody, '');
});

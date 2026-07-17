import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEmailDrafts } from '../server/emailGeneration.mjs';

test('generateEmailDrafts requires keywords and OpenAI-compatible API key', async () => {
  await assert.rejects(() => generateEmailDrafts({ keywords: '' }), /keywords/);
  await assert.rejects(() => generateEmailDrafts({ keywords: 'LCD' }), /OpenAI API Key/);
});

test('generateEmailDrafts calls chat completions base URL and sanitizes returned html', async () => {
  let calledUrl = '';
  let requestedBody = {};
  const fakeFetch = async (url, init) => {
    calledUrl = url;
    requestedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            drafts: [
              {
                angle: 'repair parts',
                subject: 'Reliable LCD screen supply for {{name}}',
                body: 'Hi {{name}}, we supply replacement phone LCD screens.',
                htmlBody: '<p>Hi {{name}}, we supply replacement phone LCD screens.</p><script>alert(1)</script>'
              },
              {
                angle: 'inventory support',
                subject: 'Phone screen inventory support',
                body: 'We can help keep popular iPhone and Samsung screens in stock.',
                htmlBody: '<p>We can help keep popular iPhone and Samsung screens in stock.</p>'
              },
              {
                angle: 'wholesale partnership',
                subject: 'Wholesale LCD parts for repair stores',
                body: 'Could we send a short parts list?',
                htmlBody: '<p>Could we send a short parts list?</p>'
              }
            ]
          })
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const drafts = await generateEmailDrafts({
    keywords: 'LCD, phone repair store',
    apiKey: 'test-key',
    baseUrl: 'https://na.izytoken.com/v1/',
    model: 'test-model',
    fetchImpl: fakeFetch
  });

  assert.equal(calledUrl, 'https://na.izytoken.com/v1/chat/completions');
  assert.equal(requestedBody.model, 'test-model');
  assert.ok(Array.isArray(requestedBody.messages));
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].subject, 'Reliable LCD screen supply for {{name}}');
  assert.doesNotMatch(drafts[0].htmlBody, /script/);
});

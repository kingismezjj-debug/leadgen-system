import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEmailDrafts } from '../server/emailGeneration.mjs';

test('generateEmailDrafts requires keywords and OpenAI API key', async () => {
  await assert.rejects(() => generateEmailDrafts({ keywords: '' }), /keywords/);
  await assert.rejects(() => generateEmailDrafts({ keywords: 'LCD' }), /OpenAI API Key/);
});

test('generateEmailDrafts calls configured base URL and sanitizes returned html', async () => {
  let calledUrl = '';
  let requestedModel = '';
  const fakeFetch = async (url, init) => {
    calledUrl = url;
    requestedModel = JSON.parse(init.body).model;
    return new Response(JSON.stringify({
      output: [{
        content: [{
          type: 'output_text',
          text: JSON.stringify({
            drafts: [
              {
                angle: '维修备件',
                subject: 'Reliable LCD screen supply for {{name}}',
                body: 'Hi {{name}}, we supply replacement phone LCD screens.',
                htmlBody: '<p>Hi {{name}}, we supply replacement phone LCD screens.</p><script>alert(1)</script>'
              },
              {
                angle: '库存补充',
                subject: 'Phone screen inventory support',
                body: 'We can help keep popular iPhone and Samsung screens in stock.',
                htmlBody: '<p>We can help keep popular iPhone and Samsung screens in stock.</p>'
              },
              {
                angle: '批发合作',
                subject: 'Wholesale LCD parts for repair stores',
                body: 'Could we send a short parts list?',
                htmlBody: '<p>Could we send a short parts list?</p>'
              }
            ]
          })
        }]
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

  assert.equal(calledUrl, 'https://na.izytoken.com/v1/responses');
  assert.equal(requestedModel, 'test-model');
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].subject, 'Reliable LCD screen supply for {{name}}');
  assert.doesNotMatch(drafts[0].htmlBody, /script/);
});

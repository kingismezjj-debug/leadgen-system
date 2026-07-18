import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWhatsAppDrafts } from '../server/whatsappGeneration.mjs';

test('generateWhatsAppDrafts requires keywords and OpenAI-compatible API key', async () => {
  await assert.rejects(() => generateWhatsAppDrafts({ keywords: '' }), /keywords/);
  await assert.rejects(() => generateWhatsAppDrafts({ keywords: 'LCD' }), /OpenAI API Key/);
});

test('generateWhatsAppDrafts calls chat completions base URL and parses returned drafts', async () => {
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
                angle: 'warm intro',
                message: 'Hi {{name}}, we help repair shops source LCD screens faster.',
                followUp: 'If useful, I can share a quick catalog.'
              },
              {
                angle: 'value first',
                message: 'Hello {{name}}, I noticed your team works on mobile repair and wanted to reach out with a short supply option.',
                followUp: 'We can keep it brief if you prefer.'
              },
              {
                angle: 'direct offer',
                message: 'Hi {{name}}, if you need consistent LCD screen supply for your repair business, I can send details.',
                followUp: 'Just reply with the phone models you need.'
              }
            ]
          })
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const drafts = await generateWhatsAppDrafts({
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
  assert.equal(drafts[0].angle, 'warm intro');
  assert.equal(drafts[0].message, 'Hi {{name}}, we help repair shops source LCD screens faster.');
});

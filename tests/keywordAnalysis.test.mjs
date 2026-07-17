import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeKeywords } from '../server/keywordAnalysis.mjs';

test('keyword analysis uses a local fallback without an API key', async () => {
  const result = await analyzeKeywords({ keywords: 'LCD, phone repair store' });

  assert.equal(result.source, 'fallback');
  assert.equal(result.primaryPlaceType, 'cell_phone_store');
  assert.ok(result.searchKeywords.includes('phone repair store'));
  assert.ok(result.searchBatches.length > 0);
});

test('keyword analysis parses chat-completions output without executing a search', async () => {
  let calledUrl = '';
  let requestedBody = {};
  const fakeFetch = async (url, init) => {
    calledUrl = url;
    requestedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            customerProfile: 'phone repair stores',
            productIntent: 'buy replacement phone LCD screens',
            recommendedMode: 'smart',
            primaryPlaceType: 'phone_repair_shop',
            placeTypes: ['phone_repair_shop', 'not_a_real_type'],
            searchKeywords: ['phone repair store', 'mobile phone parts'],
            negativeKeywords: ['LCD TV'],
            searchBatches: [{
              label: 'phone repair stores',
              keyword: 'phone repair store',
              placeType: 'phone_repair_shop',
              mode: 'smart'
            }],
            notes: ['Confirm strategy before searching.']
          })
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await analyzeKeywords({
    keywords: 'LCD, phone repair store',
    country: 'United States',
    region: 'New York',
    apiKey: 'test-key',
    baseUrl: 'https://na.izytoken.com/v1/',
    fetchImpl: fakeFetch
  });

  assert.equal(calledUrl, 'https://na.izytoken.com/v1/chat/completions');
  assert.ok(Array.isArray(requestedBody.messages));
  assert.equal(result.source, 'openai');
  assert.deepEqual(result.placeTypes, ['phone_repair_shop']);
  assert.equal(result.searchBatches[0].keyword, 'phone repair store');
});

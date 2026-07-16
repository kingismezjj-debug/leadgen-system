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

test('keyword analysis parses structured OpenAI output without executing a search', async () => {
  let calledUrl = '';
  const fakeFetch = async (url) => {
    calledUrl = url;
    return new Response(JSON.stringify({
      output: [{
        content: [{
          type: 'output_text',
          text: JSON.stringify({
            customerProfile: '手机维修店',
            productIntent: '采购手机屏幕',
            recommendedMode: 'smart',
            primaryPlaceType: 'phone_repair_shop',
            placeTypes: ['phone_repair_shop', 'not_a_real_type'],
            searchKeywords: ['phone repair store', 'mobile phone parts'],
            negativeKeywords: ['LCD TV'],
            searchBatches: [{
              label: '手机维修店',
              keyword: 'phone repair store',
              placeType: 'phone_repair_shop',
              mode: 'smart'
            }],
            notes: ['先确认策略，再执行搜索。']
          })
        }]
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

  assert.equal(calledUrl, 'https://na.izytoken.com/v1/responses');
  assert.equal(result.source, 'openai');
  assert.deepEqual(result.placeTypes, ['phone_repair_shop']);
  assert.equal(result.searchBatches[0].keyword, 'phone repair store');
});

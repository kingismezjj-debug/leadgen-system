import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEmailQuality, assessLeadEmails } from '../server/emailQuality.mjs';

const okMx = async () => [{ exchange: 'mx.example.test', priority: 10 }];
const noMx = async () => [];
const failingMx = async () => {
  throw new Error('ENOTFOUND');
};

test('assessEmailQuality scores matching business emails highly', async () => {
  const quality = await assessEmailQuality('owner@acme.test', {
    website: 'https://www.acme.test',
    resolver: okMx
  });

  assert.equal(quality.status, 'high');
  assert.equal(quality.score, 100);
  assert.ok(quality.reasons.includes('邮箱域名匹配官网'));
  assert.ok(quality.reasons.includes('MX 记录有效'));
});

test('assessEmailQuality lowers confidence for public and role emails', async () => {
  const quality = await assessEmailQuality('sales.acme@gmail.com', {
    website: 'https://www.acme.test',
    resolver: okMx
  });

  assert.equal(quality.status, 'medium');
  assert.ok(quality.score < 100);
  assert.ok(quality.reasons.includes('公共邮箱'));
  assert.ok(quality.reasons.includes('邮箱域名与官网不一致'));
});

test('assessEmailQuality marks missing MX as invalid', async () => {
  const quality = await assessEmailQuality('hello@missing-mx.test', {
    website: 'https://missing-mx.test',
    resolver: noMx
  });

  assert.equal(quality.status, 'invalid');
  assert.ok(quality.reasons.includes('缺少 MX 记录'));

  const failedLookup = await assessEmailQuality('hello@lookup-fails.test', {
    resolver: failingMx
  });
  assert.equal(failedLookup.status, 'invalid');
  assert.ok(failedLookup.reasons.includes('MX 记录不可用'));
});

test('assessLeadEmails deduplicates emails', async () => {
  const results = await assessLeadEmails(['Owner@Acme.test', 'owner@acme.test'], {
    website: 'https://acme.test',
    resolver: okMx
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].email, 'owner@acme.test');
});

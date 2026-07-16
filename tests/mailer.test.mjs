import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnsubscribeUrl, previewCampaign, renderTemplate } from '../server/mailer.mjs';

test('renderTemplate replaces known lead fields and blanks unknown fields', () => {
  assert.equal(
    renderTemplate('Hello {{ name }} from {{city}}', { name: 'Acme Dental' }),
    'Hello Acme Dental from '
  );
});

test('previewCampaign adds recipient, rendered subject, and unsubscribe footer', () => {
  const unsubscribeUrl = 'https://mailer.example/unsubscribe/token-123';
  const preview = previewCampaign(
    { subject: 'Hi {{name}}', body: 'Your phone is {{phone}}' },
    { name: 'Acme Dental', phone: '555-0100', emails: ['owner@acme.test'], unsubscribeUrl }
  );

  assert.equal(preview.to, 'owner@acme.test');
  assert.equal(preview.subject, 'Hi Acme Dental');
  assert.match(preview.text, /Your phone is 555-0100/);
  assert.match(preview.text, /退订/);
  assert.match(preview.text, new RegExp(unsubscribeUrl));
  assert.equal(preview.headers['List-Unsubscribe'], `<${unsubscribeUrl}>`);
  assert.equal(preview.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('previewCampaign renders sanitized html bodies with template fields', () => {
  const unsubscribeUrl = 'https://mailer.example/unsubscribe/token-123';
  const preview = previewCampaign(
    { subject: 'Hi', body: 'Fallback', htmlBody: '<p>Hello <strong>{{name}}</strong></p>' },
    { name: 'Acme Dental', emails: ['owner@acme.test'], unsubscribeUrl }
  );

  assert.match(preview.html, /Hello <strong>Acme Dental<\/strong>/);
  assert.match(preview.html, new RegExp(unsubscribeUrl));
  assert.match(preview.text, /Fallback/);
});

test('buildUnsubscribeUrl appends an encoded token to the configured endpoint', () => {
  assert.equal(
    buildUnsubscribeUrl({ unsubscribeUrl: 'https://mailer.example/unsubscribe/' }, 'a/b c'),
    'https://mailer.example/unsubscribe/a%2Fb%20c'
  );
});

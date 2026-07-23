import test from 'node:test';
import assert from 'node:assert/strict';
import { leadsToCsv } from '../server/csv.mjs';

test('leadsToCsv quotes fields and joins email arrays', () => {
  const csv = leadsToCsv([
    {
      name: 'Acme, Inc.',
      companyType: 'Dentist',
      phone: '555',
      sourceKeywords: ['dentist', 'clinic'],
      sourceKeyword: 'dentist',
      matchStrategies: ['keyword', 'expanded:clinic'],
      emails: ['a@example.com', 'b@example.com'],
      emailSources: [{ email: 'a@example.com', url: 'https://example.com/contact' }],
      website: 'https://example.com',
      address: '1 Main St',
      googleMapsUrl: 'https://maps.example',
      rating: 5,
      reviewCount: 3,
      status: 'new',
      source: 'test'
    }
  ]);

  assert.match(csv, /"Acme, Inc\."/);
  assert.match(csv, /"dentist; clinic"/);
  assert.match(csv, /"keyword; expanded:clinic"/);
  assert.match(csv, /"a@example.com; b@example.com"/);
  assert.match(csv, /"https:\/\/example\.com\/contact"/);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /\r\n/);
});

test('leadsToCsv prevents spreadsheet formula execution', () => {
  const csv = leadsToCsv([{ name: '=HYPERLINK("https://evil.test")', phone: '+15550100', emails: [] }]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/evil\.test""\)"/);
  assert.match(csv, /"'\+15550100"/);
});

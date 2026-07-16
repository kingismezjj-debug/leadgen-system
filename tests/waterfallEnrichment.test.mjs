import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichLeadWaterfall } from '../server/waterfallEnrichment.mjs';

test('enrichLeadWaterfall combines website emails and external profile evidence', async (t) => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const currentUrl = new URL(String(url));
    if (currentUrl.hostname === 'iana.org' && currentUrl.pathname === '/') {
      return new Response(`
        <p>Contact info@iana.org</p>
        <a href="https://linkedin.com/company/iana">LinkedIn</a>
        <a href="https://www.yelp.com/biz/iana">Yelp</a>
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    return new Response('', { status: 404, headers: { 'Content-Type': 'text/html' } });
  };
  t.after(() => {
    global.fetch = previousFetch;
  });

  const lead = await enrichLeadWaterfall({
    id: 'lead-1',
    name: 'IANA',
    website: 'https://iana.org/',
    emails: []
  }, { emailDiscoveryDepth: 0, timeoutMs: 1000 });

  assert.deepEqual(lead.emails, ['info@iana.org']);
  assert.equal(lead.enrichmentStatus, 'found');
  assert.equal(lead.emailDiscoveryReason, '');
  assert.equal(lead.socialProfiles[0].source, 'linkedin');
  assert.equal(lead.directoryProfiles[0].source, 'yelp');
  assert.ok(lead.enrichmentSteps.some((item) => item.name === 'official_website' && item.status === 'found'));
  assert.ok(lead.enrichmentSteps.some((item) => item.name === 'third_party_email_api' && item.status === 'skipped'));
});

test('enrichLeadWaterfall uses configured Foursquare, Hunter, and RDAP sources while skipping Yelp API', async (t) => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const currentUrl = new URL(String(url));
    if (currentUrl.hostname === 'acme.test') {
      return new Response('<p>No public email here</p>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    if (currentUrl.hostname === 'rdap.org') {
      return new Response(JSON.stringify({
        handle: 'ACME-TEST',
        events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }],
        entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]] }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (currentUrl.hostname === 'api.yelp.com') {
      throw new Error('Yelp API should stay disabled');
    }
    if (currentUrl.hostname === 'api.foursquare.com') {
      return new Response(JSON.stringify({ results: [{ fsq_id: 'fsq1', name: 'Acme', website: 'https://foursquare.example/acme', tel: '+15550100' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (currentUrl.hostname === 'api.hunter.io') {
      return new Response(JSON.stringify({ data: { emails: [{ value: 'sales@acme.test' }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('', { status: 404, headers: { 'Content-Type': 'text/html' } });
  };
  t.after(() => {
    global.fetch = previousFetch;
  });

  const lead = await enrichLeadWaterfall({
    id: 'lead-2',
    name: 'Acme',
    website: 'https://acme.test/',
    address: '1 Main St, New York',
    emails: []
  }, {
    emailDiscoveryDepth: 0,
    timeoutMs: 1000,
    settings: {
      yelpApiKey: 'yelp-key',
      foursquareApiKey: 'fsq-key',
      hunterApiKey: 'hunter-key'
    }
  });

  assert.deepEqual(lead.emails, ['sales@acme.test']);
  assert.equal(lead.domainInfo.rdap.handle, 'ACME-TEST');
  assert.ok(lead.directoryProfiles.some((item) => item.source === 'foursquare'));
  assert.ok(lead.enrichmentSteps.some((item) => item.name === 'yelp_places' && item.status === 'skipped' && item.reason === 'disabled_to_control_cost'));
  assert.ok(lead.enrichmentSteps.some((item) => item.name === 'hunter_domain_search' && item.status === 'found'));
});

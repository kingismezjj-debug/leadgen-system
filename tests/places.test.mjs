import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSearchBody, buildSearchRequests, formatPhoneNumberForRegion, inferBusinessSearchProfile, normalizePlace, searchPlaces } from '../server/places.mjs';

test('normalizePlace maps Google Places fields to lead shape', () => {
  const lead = normalizePlace({
    id: 'abc123',
    displayName: { text: 'Acme Dental' },
    primaryTypeDisplayName: { text: 'Dentist' },
    nationalPhoneNumber: '(555) 010-1000',
    websiteUri: 'https://acme.example',
    formattedAddress: '1 Main St',
    googleMapsUri: 'https://maps.google.com/?cid=1',
    rating: 4.8,
    userRatingCount: 42,
    businessStatus: 'OPERATIONAL',
    location: { latitude: 40.1, longitude: -73.9 }
  });

  assert.equal(lead.placeId, 'abc123');
  assert.equal(lead.name, 'Acme Dental');
  assert.equal(lead.companyType, 'Dentist');
  assert.equal(lead.phone, '(555) 010-1000');
  assert.equal(lead.reviewCount, 42);
  assert.equal(lead.lat, 40.1);
});

test('formatPhoneNumberForRegion adds the selected country calling code', () => {
  assert.equal(
    formatPhoneNumberForRegion({ nationalPhoneNumber: '0903 650 6625' }, 'NG'),
    '+234 903 650 6625'
  );
  assert.equal(
    formatPhoneNumberForRegion({ nationalPhoneNumber: '(555) 010-1000' }, 'US'),
    '+1 (555) 010-1000'
  );
  assert.equal(
    formatPhoneNumberForRegion({ nationalPhoneNumber: '0903 650 6625', internationalPhoneNumber: '+234 903 650 6625' }, 'NG'),
    '+234 903 650 6625'
  );
});

test('buildSearchBody carries country, language, and pagination parameters', () => {
  assert.deepEqual(buildSearchBody({
    keyword: 'dentist',
    area: 'Toronto',
    maxResults: 50,
    languageCode: 'en',
    regionCode: 'ca',
    pageToken: 'next-page',
    includedType: 'dentist'
  }), {
    textQuery: 'dentist in Toronto',
    maxResultCount: 20,
    includedType: 'dentist',
    languageCode: 'en',
    regionCode: 'CA',
    pageToken: 'next-page'
  });
});

test('smart search builds type and expanded keyword requests', () => {
  const profile = inferBusinessSearchProfile('dentist');
  assert.deepEqual(profile.types, ['dentist']);
  assert.ok(profile.expansions.includes('orthodontist'));

  const requests = buildSearchRequests({
    keyword: 'dentist',
    area: 'Toronto',
    maxResults: 10,
    languageCode: 'en',
    regionCode: 'ca',
    searchMode: 'smart'
  });

  assert.equal(requests[0].body.includedType, 'dentist');
  assert.ok(requests.some((request) => request.strategy.startsWith('expanded:')));
  assert.equal(requests.some((request) => request.nextPageEligible), false);
});

test('type search uses selected Google place type and keeps pagination eligible', () => {
  const [request] = buildSearchRequests({
    keyword: 'auto repair',
    area: 'New York',
    placeType: 'car_repair',
    searchMode: 'type'
  });

  assert.equal(request.body.includedType, 'car_repair');
  assert.equal(request.strategy, 'type:car_repair');
  assert.equal(request.nextPageEligible, true);
});

test('type search maps common aliases to supported Google place types', () => {
  const [usedDealerRequest] = buildSearchRequests({
    keyword: 'used',
    area: 'New York',
    placeType: 'auto',
    searchMode: 'type'
  });
  assert.equal(usedDealerRequest.body.includedType, 'car_dealer');

  const [autoRepairRequest] = buildSearchRequests({
    keyword: 'oil change',
    area: 'New York',
    placeType: 'auto',
    searchMode: 'type'
  });
  assert.equal(autoRepairRequest.body.includedType, 'car_repair');
});

test('searchPlaces follows Google pagination to satisfy larger requested counts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-places-'));
  const settingsPath = join(directory, 'settings.json');
  const previousSettingsPath = process.env.LEADGEN_SETTINGS_PATH;
  const previousFetch = global.fetch;
  process.env.LEADGEN_SETTINGS_PATH = settingsPath;
  await writeFile(settingsPath, JSON.stringify({ googleMapsApiKey: 'test-key' }, null, 2));

  const requests = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const offset = body.pageToken === 'page-2' ? 20 : 0;
    const places = Array.from({ length: body.maxResultCount }, (_, index) => ({
      id: `place-${offset + index}`,
      displayName: { text: `Place ${offset + index}` },
      formattedAddress: `${offset + index} Main St`
    }));

    return new Response(JSON.stringify({
      places,
      nextPageToken: body.pageToken ? '' : 'page-2'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  t.after(async () => {
    global.fetch = previousFetch;
    if (previousSettingsPath === undefined) delete process.env.LEADGEN_SETTINGS_PATH;
    else process.env.LEADGEN_SETTINGS_PATH = previousSettingsPath;
    await rm(directory, { recursive: true, force: true });
  });

  const result = await searchPlaces({
    keyword: 'dentist',
    area: 'Toronto',
    maxResults: 25,
    searchMode: 'keyword'
  });

  assert.equal(result.leads.length, 25);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].maxResultCount, 20);
  assert.equal(requests[1].maxResultCount, 5);
  assert.equal(requests[1].pageToken, 'page-2');
});

test('searchPlaces deduplicates results by shared website and phone', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-places-dedupe-'));
  const settingsPath = join(directory, 'settings.json');
  const previousSettingsPath = process.env.LEADGEN_SETTINGS_PATH;
  const previousFetch = global.fetch;
  process.env.LEADGEN_SETTINGS_PATH = settingsPath;
  await writeFile(settingsPath, JSON.stringify({ googleMapsApiKey: 'test-key' }, null, 2));

  global.fetch = async () => new Response(JSON.stringify({
    places: [
      {
        id: 'place-a',
        displayName: { text: 'Alpha Repair' },
        formattedAddress: '1 Main St',
        websiteUri: 'https://alpha.test',
        internationalPhoneNumber: '+1 555 0100'
      },
      {
        id: 'place-b',
        displayName: { text: 'Alpha Repair Downtown' },
        formattedAddress: '1 Main Street',
        websiteUri: 'https://www.alpha.test/',
        internationalPhoneNumber: '+1 (555) 0100',
        googleMapsUri: 'https://maps.example/alpha'
      },
      {
        id: 'place-c',
        displayName: { text: 'Beta Repair' },
        formattedAddress: '2 Main St',
        websiteUri: 'https://beta.test'
      }
    ]
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  t.after(async () => {
    global.fetch = previousFetch;
    if (previousSettingsPath === undefined) delete process.env.LEADGEN_SETTINGS_PATH;
    else process.env.LEADGEN_SETTINGS_PATH = previousSettingsPath;
    await rm(directory, { recursive: true, force: true });
  });

  const result = await searchPlaces({
    keyword: 'phone repair',
    area: 'New York',
    maxResults: 10,
    searchMode: 'keyword'
  });

  assert.equal(result.leads.length, 2);
  assert.deepEqual(result.leads.map((lead) => lead.website).sort(), ['https://beta.test', 'https://www.alpha.test/']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

test('store serializes concurrent mutations without losing records', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const { addSearchRecord, readStore } = await import('../server/store.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await Promise.all(Array.from({ length: 25 }, (_, index) => addSearchRecord({
    keyword: `keyword-${index}`,
    area: 'test-area'
  })));

  const store = await readStore();
  assert.equal(store.searches.length, 25);
  assert.equal(new Set(store.searches.map((item) => item.keyword)).size, 25);
});

test('store file lock preserves mutations across multiple Node processes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-processes-'));
  const storePath = join(directory, 'store.json');
  const storeModuleUrl = new URL('../server/store.mjs', import.meta.url).href;
  process.env.LEADGEN_STORE_PATH = storePath;

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await Promise.all(Array.from({ length: 4 }, (_, processIndex) => {
    const script = `const m = await import(${JSON.stringify(storeModuleUrl)}); await Promise.all(Array.from({length: 5}, (_, i) => m.addSearchRecord({ keyword: 'p${processIndex}-' + i, area: 'test' })));`;
    return execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, LEADGEN_STORE_PATH: storePath }
    });
  }));

  const { readStore } = await import('../server/store.mjs');
  const store = await readStore();
  assert.equal(store.searches.length, 20);
  assert.equal(new Set(store.searches.map((item) => item.keyword)).size, 20);
});

test('upsertLeads preserves every search source for duplicate leads', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-sources-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const { readStore, upsertLeads } = await import('../server/store.mjs');
  const lead = {
    placeId: 'place-1',
    name: 'Shared Lead',
    address: 'Test address',
    emails: []
  };

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await upsertLeads([{ ...lead, sourceKeyword: 'dentist', sourceKeywords: ['dentist'], sourceKeywordZh: '牙医', sourceKeywordsZh: ['牙医'], matchStrategy: 'keyword' }], 'google-places:dentist:New York');
  await upsertLeads([{ ...lead, sourceKeyword: 'clinic', sourceKeywords: ['clinic'], sourceKeywordZh: '诊所', sourceKeywordsZh: ['诊所'], matchStrategy: 'expanded:clinic' }], 'google-places:clinic:New York');

  const store = await readStore();
  assert.equal(store.leads.length, 1);
  assert.deepEqual(store.leads[0].searchSources, [
    'google-places:dentist:New York',
    'google-places:clinic:New York'
  ]);
  assert.deepEqual(store.leads[0].sourceKeywords, ['dentist', 'clinic']);
  assert.deepEqual(store.leads[0].sourceKeywordsZh, ['牙医', '诊所']);
  assert.deepEqual(store.leads[0].matchStrategies, ['keyword', 'expanded:clinic']);
});

test('upsertLeads keeps separate copies of the same lead for different owners', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-owner-scope-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const { readStore, upsertLeads } = await import('../server/store.mjs');
  const lead = {
    placeId: 'place-1',
    name: 'Scoped Lead',
    address: 'Test address',
    emails: []
  };

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await upsertLeads([lead], 'google-places:dentist:New York', { id: 'owner-a' });
  await upsertLeads([lead], 'google-places:dentist:New York', { id: 'owner-b' });

  const store = await readStore();
  assert.equal(store.leads.length, 2);
  assert.deepEqual(new Set(store.leads.map((item) => item.userId)), new Set(['owner-a', 'owner-b']));
});

test('upsertLeads merges email sources', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-email-sources-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const { readStore, upsertLeads } = await import('../server/store.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await upsertLeads([{
    placeId: 'place-1',
    name: 'Source Lead',
    address: 'Address',
    website: 'https://source.test',
    emails: ['info@source.test'],
    emailQuality: [{ email: 'info@source.test', status: 'medium', score: 72 }],
    emailSources: [{ email: 'info@source.test', url: 'https://source.test/contact' }]
  }], 'google-places:lcd:Buenos Aires');

  await upsertLeads([{
    placeId: 'place-1',
    name: 'Source Lead',
    address: 'Address',
    website: 'https://source.test',
    emails: ['sales@source.test'],
    emailQuality: [{ email: 'sales@source.test', status: 'high', score: 92 }],
    emailSources: [{ email: 'sales@source.test', url: 'https://source.test/team' }]
  }], 'google-places:repair:Buenos Aires');

  const store = await readStore();
  assert.equal(store.leads.length, 1);
  assert.deepEqual(store.leads[0].emails, ['info@source.test', 'sales@source.test']);
  assert.equal(store.leads[0].emailSources.length, 2);
});

test('keyword group deletion can remove only the tag or its exclusive leads', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-delete-group-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const {
    addSearchRecord,
    deleteLeadKeywordGroup,
    readStore,
    upsertLeads
  } = await import('../server/store.mjs');
  const sharedLead = { placeId: 'shared', name: 'Shared', address: 'Shared address' };
  const dentistOnly = { placeId: 'dentist-only', name: 'Dentist', address: 'Dentist address' };

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await addSearchRecord({ keyword: 'dentist', area: 'New York' });
  await addSearchRecord({ keyword: 'clinic', area: 'New York' });
  await upsertLeads([sharedLead, dentistOnly], 'google-places:dentist:New York');
  await upsertLeads([sharedLead], 'google-places:clinic:New York');

  const contentsResult = await deleteLeadKeywordGroup('dentist', 'contents');
  assert.equal(contentsResult.deletedLeads, 1);
  assert.equal(contentsResult.detachedLeads, 1);

  let store = await readStore();
  assert.equal(store.leads.length, 1);
  assert.deepEqual(store.leads[0].searchSources, ['google-places:clinic:New York']);
  assert.equal(store.searches.length, 2);

  const tagResult = await deleteLeadKeywordGroup('clinic', 'tag');
  assert.equal(tagResult.deletedSearches, 1);
  assert.equal(tagResult.deletedLeads, 0);

  store = await readStore();
  assert.equal(store.leads.length, 1);
  assert.equal(store.leads[0].source, '');
  assert.deepEqual(store.leads[0].searchSources, []);
  assert.equal(store.searches.length, 1);
});

test('keyword group deletion stays within one owner scope', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-delete-group-owner-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const {
    addSearchRecord,
    deleteLeadKeywordGroup,
    readStore,
    upsertLeads
  } = await import('../server/store.mjs');
  const sharedLead = { placeId: 'shared', name: 'Shared', address: 'Shared address' };

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await addSearchRecord({ keyword: 'dentist', area: 'New York' }, { id: 'owner-a' });
  await addSearchRecord({ keyword: 'dentist', area: 'New York' }, { id: 'owner-b' });
  await upsertLeads([sharedLead], 'google-places:dentist:New York', { id: 'owner-a' });
  await upsertLeads([sharedLead], 'google-places:dentist:New York', { id: 'owner-b' });

  const result = await deleteLeadKeywordGroup('dentist', 'tag', { id: 'owner-a', role: 'member' });
  assert.equal(result.deletedSearches, 1);

  const store = await readStore();
  assert.equal(store.searches.length, 1);
  assert.equal(store.searches[0].userId, 'owner-b');
  assert.equal(store.leads.length, 2);
  const ownerALead = store.leads.find((lead) => lead.userId === 'owner-a');
  const ownerBLead = store.leads.find((lead) => lead.userId === 'owner-b');
  assert.deepEqual(ownerALead.searchSources, []);
  assert.deepEqual(ownerBLead.searchSources, ['google-places:dentist:New York']);
});

test('deleteAllLeadData clears leads and search tabs without touching other records', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-delete-all-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const {
    addCampaignRecord,
    addSearchRecord,
    deleteAllLeadData,
    readStore,
    upsertLeads
  } = await import('../server/store.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await addSearchRecord({ keyword: 'dentist', area: 'New York' });
  await upsertLeads([
    { placeId: 'lead-1', name: 'Lead 1', address: 'Address 1' }
  ], 'google-places:dentist:New York');
  await addCampaignRecord({ subject: 'Keep me', leadCount: 1 });

  const result = await deleteAllLeadData();
  assert.deepEqual(result, { deletedLeads: 1, deletedSearches: 1 });

  const store = await readStore();
  assert.deepEqual(store.leads, []);
  assert.deepEqual(store.searches, []);
  assert.equal(store.campaigns.length, 1);
});

test('deleteAllLeadData only clears the current owner when scoped', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-delete-owner-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const {
    addCampaignRecord,
    addSearchRecord,
    deleteAllLeadData,
    readStore,
    upsertLeads
  } = await import('../server/store.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await addSearchRecord({ keyword: 'owner-a', area: 'New York' }, { id: 'owner-a' });
  await addSearchRecord({ keyword: 'owner-b', area: 'New York' }, { id: 'owner-b' });
  await upsertLeads([{ placeId: 'lead-a', name: 'Lead A', address: 'Address A' }], 'google-places:owner-a:New York', { id: 'owner-a' });
  await upsertLeads([{ placeId: 'lead-b', name: 'Lead B', address: 'Address B' }], 'google-places:owner-b:New York', { id: 'owner-b' });
  await addCampaignRecord({ subject: 'Keep me', leadCount: 1 }, { id: 'owner-b' });

  const result = await deleteAllLeadData({ id: 'owner-a', role: 'member' });
  assert.deepEqual(result, { deletedLeads: 1, deletedSearches: 1 });

  const store = await readStore();
  assert.equal(store.leads.length, 1);
  assert.equal(store.leads[0].userId, 'owner-b');
  assert.equal(store.searches.length, 1);
  assert.equal(store.searches[0].userId, 'owner-b');
  assert.equal(store.campaigns.length, 1);
  assert.equal(store.campaigns[0].userId, 'owner-b');
});

test('task records can be read and cleared by status', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-tasks-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const {
    addTaskRecord,
    deleteTaskRecords,
    getTaskRecord,
    readStore
  } = await import('../server/store.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  const failed = await addTaskRecord({ kind: 'search', title: 'Failed', status: 'failed', progress: 100 });
  await addTaskRecord({ kind: 'search', title: 'Done', status: 'done', progress: 100 });
  await addTaskRecord({ kind: 'search', title: 'Running', status: 'running', progress: 20 });

  assert.equal((await getTaskRecord(failed.id)).title, 'Failed');

  const result = await deleteTaskRecords({ statuses: ['done', 'failed'] });
  assert.equal(result.deletedTasks, 2);

  const store = await readStore();
  assert.equal(store.tasks.length, 1);
  assert.equal(store.tasks[0].status, 'running');
});

test('send log is capped and can be cleared', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-store-send-log-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const {
    addSendLog,
    deleteSendLogEntries,
    readStore
  } = await import('../server/store.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  await addSendLog(Array.from({ length: 520 }, (_, index) => ({
    leadId: `lead-${index}`,
    to: `lead-${index}@example.com`,
    status: 'sent'
  })));

  let store = await readStore();
  assert.equal(store.sendLog.length, 500);

  const result = await deleteSendLogEntries();
  assert.deepEqual(result, { deletedSendLog: 500 });

  store = await readStore();
  assert.deepEqual(store.sendLog, []);
});

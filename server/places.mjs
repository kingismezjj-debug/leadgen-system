import { getRuntimeSettings } from './settings.mjs';

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_MAX_RESULTS_PER_PAGE = 20;
const searchModes = new Set(['keyword', 'type', 'smart']);
const typePattern = /^[a-z][a-z0-9_]{1,80}$/;
const countryCallingCodes = {
  AC: '247', AD: '376', AE: '971', AF: '93', AG: '1', AI: '1', AL: '355', AM: '374', AO: '244',
  AR: '54', AS: '1', AT: '43', AU: '61', AW: '297', AX: '358', AZ: '994', BA: '387', BB: '1',
  BD: '880', BE: '32', BF: '226', BG: '359', BH: '973', BI: '257', BJ: '229', BL: '590', BM: '1',
  BN: '673', BO: '591', BQ: '599', BR: '55', BS: '1', BT: '975', BW: '267', BY: '375', BZ: '501',
  CA: '1', CC: '61', CD: '243', CF: '236', CG: '242', CH: '41', CI: '225', CK: '682', CL: '56',
  CM: '237', CN: '86', CO: '57', CR: '506', CU: '53', CV: '238', CW: '599', CX: '61', CY: '357',
  CZ: '420', DE: '49', DJ: '253', DK: '45', DM: '1', DO: '1', DZ: '213', EC: '593', EE: '372',
  EG: '20', EH: '212', ER: '291', ES: '34', ET: '251', FI: '358', FJ: '679', FK: '500', FM: '691',
  FO: '298', FR: '33', GA: '241', GB: '44', GD: '1', GE: '995', GF: '594', GG: '44', GH: '233',
  GI: '350', GL: '299', GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30', GT: '502', GU: '1',
  GW: '245', GY: '592', HK: '852', HN: '504', HR: '385', HT: '509', HU: '36', ID: '62', IE: '353',
  IL: '972', IM: '44', IN: '91', IO: '246', IQ: '964', IR: '98', IS: '354', IT: '39', JE: '44',
  JM: '1', JO: '962', JP: '81', KE: '254', KG: '996', KH: '855', KI: '686', KM: '269', KN: '1',
  KP: '850', KR: '82', KW: '965', KY: '1', KZ: '7', LA: '856', LB: '961', LC: '1', LI: '423',
  LK: '94', LR: '231', LS: '266', LT: '370', LU: '352', LV: '371', LY: '218', MA: '212', MC: '377',
  MD: '373', ME: '382', MF: '590', MG: '261', MH: '692', MK: '389', ML: '223', MM: '95', MN: '976',
  MO: '853', MP: '1', MQ: '596', MR: '222', MS: '1', MT: '356', MU: '230', MV: '960', MW: '265',
  MX: '52', MY: '60', MZ: '258', NA: '264', NC: '687', NE: '227', NF: '672', NG: '234', NI: '505',
  NL: '31', NO: '47', NP: '977', NR: '674', NU: '683', NZ: '64', OM: '968', PA: '507', PE: '51',
  PF: '689', PG: '675', PH: '63', PK: '92', PL: '48', PM: '508', PR: '1', PS: '970', PT: '351',
  PW: '680', PY: '595', QA: '974', RE: '262', RO: '40', RS: '381', RU: '7', RW: '250', SA: '966',
  SB: '677', SC: '248', SD: '249', SE: '46', SG: '65', SH: '290', SI: '386', SJ: '47', SK: '421',
  SL: '232', SM: '378', SN: '221', SO: '252', SR: '597', SS: '211', ST: '239', SV: '503', SX: '1',
  SY: '963', SZ: '268', TC: '1', TD: '235', TG: '228', TH: '66', TJ: '992', TK: '690', TL: '670',
  TM: '993', TN: '216', TO: '676', TR: '90', TT: '1', TV: '688', TW: '886', TZ: '255', UA: '380',
  UG: '256', US: '1', UY: '598', UZ: '998', VA: '39', VC: '1', VE: '58', VG: '1', VI: '1',
  VN: '84', VU: '678', WF: '681', WS: '685', XK: '383', YE: '967', YT: '262', ZA: '27',
  ZM: '260', ZW: '263'
};
const countriesKeepingNationalLeadingZero = new Set(['IT', 'SM', 'VA']);
const placeTypeAliases = {
  auto: 'car_repair',
  automotive: 'car_repair',
  mechanic: 'car_repair',
  auto_repair: 'car_repair',
  car_repair_shop: 'car_repair',
  dealership: 'car_dealer',
  dealer: 'car_dealer',
  used: 'car_dealer',
  used_car: 'car_dealer',
  used_car_dealer: 'car_dealer',
  car_dealership: 'car_dealer'
};
const businessSearchProfiles = {
  dentist: { types: ['dentist'], expansions: ['dental clinic', 'orthodontist', 'cosmetic dentist', 'emergency dentist'] },
  plumber: { types: ['plumber'], expansions: ['plumbing contractor', 'drain cleaning', 'emergency plumber', 'water heater repair'] },
  roofing: { types: ['roofing_contractor'], expansions: ['roofer', 'roof repair', 'roofing company', 'roof replacement'] },
  electrician: { types: ['electrician'], expansions: ['electrical contractor', 'emergency electrician', 'electrical repair'] },
  salon: { types: ['beauty_salon', 'hair_care'], expansions: ['hair salon', 'beauty salon', 'nail salon', 'spa'] },
  lawyer: { types: ['lawyer'], expansions: ['law firm', 'attorney', 'legal services'] },
  realtor: { types: ['real_estate_agency'], expansions: ['real estate agent', 'realtor', 'property management'] },
  restaurant: { types: ['restaurant'], expansions: ['restaurant', 'cafe', 'bar'] },
  gym: { types: ['gym'], expansions: ['fitness center', 'personal trainer', 'health club'] },
  veterinary: { types: ['veterinary_care'], expansions: ['veterinarian', 'animal hospital', 'pet clinic'] },
  auto: { types: ['car_repair', 'car_dealer'], expansions: ['auto repair', 'car dealership', 'used car dealer', 'auto body shop'] },
  insurance: { types: ['insurance_agency'], expansions: ['insurance agency', 'insurance broker'] },
  doctor: { types: ['doctor'], expansions: ['medical clinic', 'family doctor', 'urgent care'] }
};

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.location',
  'nextPageToken'
].join(',');

const normalizeText = (value) => String(value || '').trim();
const normalizeProfileKey = (value) => normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normalizeRequestedResultCount = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.floor(numericValue) : GOOGLE_MAX_RESULTS_PER_PAGE;
};
const getPageResultCount = (value) => Math.min(normalizeRequestedResultCount(value), GOOGLE_MAX_RESULTS_PER_PAGE);

export function formatPhoneNumberForRegion(place, regionCode = '') {
  const internationalPhoneNumber = normalizeText(place.internationalPhoneNumber);
  if (internationalPhoneNumber) return internationalPhoneNumber;

  const nationalPhoneNumber = normalizeText(place.nationalPhoneNumber);
  if (!nationalPhoneNumber) return '';
  if (nationalPhoneNumber.startsWith('+')) return nationalPhoneNumber;
  if (nationalPhoneNumber.startsWith('00')) return `+${nationalPhoneNumber.slice(2).trim()}`;

  const normalizedRegionCode = normalizeText(regionCode).toUpperCase();
  const callingCode = countryCallingCodes[normalizedRegionCode];
  if (!callingCode) return nationalPhoneNumber;

  const nationalSignificantNumber = countriesKeepingNationalLeadingZero.has(normalizedRegionCode)
    ? nationalPhoneNumber
    : nationalPhoneNumber.replace(/^0+/, '');
  return `+${callingCode} ${nationalSignificantNumber}`.trim();
}

export function inferBusinessSearchProfile(keyword) {
  const normalized = normalizeProfileKey(keyword);
  if (!normalized) return { types: [], expansions: [] };
  const direct = businessSearchProfiles[normalized];
  if (direct) return direct;
  for (const [key, profile] of Object.entries(businessSearchProfiles)) {
    if (normalized.includes(key) || profile.expansions.some((item) => normalized.includes(item))) {
      return profile;
    }
  }
  return { types: [], expansions: [] };
}

export function normalizeSearchMode(value) {
  const mode = normalizeText(value).toLowerCase();
  return searchModes.has(mode) ? mode : 'keyword';
}

export function normalizePlaceType(value, keyword = '') {
  const placeType = normalizeText(value).toLowerCase();
  if (!placeType) return '';
  if (placeType === 'auto') {
    const normalizedKeyword = normalizeProfileKey(keyword);
    if (/\b(?:used|dealer|dealership|sales)\b/.test(normalizedKeyword)) return 'car_dealer';
  }
  const aliasedType = placeTypeAliases[placeType] || placeType;
  return typePattern.test(aliasedType) ? aliasedType : '';
}

export function normalizePlace(place, regionCode = '') {
  return {
    placeId: place.id || '',
    name: place.displayName?.text || '未命名商户',
    companyType: place.primaryTypeDisplayName?.text || place.primaryType || (place.types || [])[0] || '',
    phone: formatPhoneNumberForRegion(place, regionCode),
    website: place.websiteUri || '',
    address: place.formattedAddress || '',
    googleMapsUrl: place.googleMapsUri || '',
    rating: place.rating || null,
    reviewCount: place.userRatingCount || 0,
    businessStatus: place.businessStatus || '',
    lat: place.location?.latitude || null,
    lng: place.location?.longitude || null,
    tags: [place.primaryTypeDisplayName?.text, place.primaryType].filter(Boolean)
  };
}

export function buildSearchBody({ keyword, area, maxResults = 20, pageToken = '', languageCode, regionCode, includedType = '' }) {
  const body = {
    textQuery: `${keyword} in ${area}`,
    maxResultCount: getPageResultCount(maxResults)
  };
  if (includedType) body.includedType = includedType;
  if (languageCode) body.languageCode = languageCode;
  if (regionCode) body.regionCode = regionCode.toUpperCase();
  if (pageToken) body.pageToken = pageToken;
  return body;
}

export function buildSearchRequests({ keyword, area, maxResults = 20, pageToken = '', languageCode, regionCode, searchMode = 'keyword', placeType = '' }) {
  const mode = normalizeSearchMode(searchMode);
  const requestedType = normalizePlaceType(placeType, keyword);
  const profile = inferBusinessSearchProfile(keyword);
  const profileTypes = requestedType ? [requestedType] : profile.types;
  const maxResultCount = getPageResultCount(maxResults);

  if (pageToken || mode === 'keyword') {
    return [{
      body: buildSearchBody({ keyword, area, maxResults: maxResultCount, pageToken, languageCode, regionCode }),
      strategy: 'keyword',
      searchKeyword: keyword,
      nextPageEligible: true
    }];
  }

  if (mode === 'type') {
    const includedType = profileTypes[0] || requestedType;
    return [{
      body: buildSearchBody({ keyword, area, maxResults: maxResultCount, languageCode, regionCode, includedType }),
      strategy: includedType ? `type:${includedType}` : 'keyword',
      searchKeyword: keyword,
      nextPageEligible: true
    }];
  }

  const requests = [];
  for (const includedType of profileTypes.slice(0, 2)) {
    requests.push({
      body: buildSearchBody({ keyword, area, maxResults: maxResultCount, languageCode, regionCode, includedType }),
      strategy: `type:${includedType}`,
      searchKeyword: keyword,
      nextPageEligible: false
    });
  }

  const expansionQueries = Array.from(new Set([keyword, ...profile.expansions].map(normalizeText).filter(Boolean))).slice(0, 4);
  for (const query of expansionQueries) {
    requests.push({
      body: buildSearchBody({ keyword: query, area, maxResults: maxResultCount, languageCode, regionCode }),
      strategy: query === keyword ? 'keyword' : `expanded:${query}`,
      searchKeyword: query,
      nextPageEligible: false
    });
  }

  return requests.length ? requests : [{
    body: buildSearchBody({ keyword, area, maxResults: maxResultCount, languageCode, regionCode }),
    strategy: 'keyword',
    searchKeyword: keyword,
    nextPageEligible: true
  }];
}

function dedupePlaces(places) {
  const byKey = new Map();
  const aliases = new Map();
  const normalizeWebsite = (value) => normalizeText(value).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const normalizePhone = (value) => normalizeText(value).replace(/[^\d+]/g, '');
  const placeQuality = (item) => {
    const place = item.place || {};
    return [
      place.websiteUri,
      place.internationalPhoneNumber || place.nationalPhoneNumber,
      place.formattedAddress,
      place.rating,
      place.userRatingCount,
      place.googleMapsUri
    ].filter(Boolean).length;
  };
  const keysForPlace = (place = {}) => {
    const keys = [];
    if (place.id) keys.push(`id:${place.id}`);
    const website = normalizeWebsite(place.websiteUri);
    if (website) keys.push(`site:${website}`);
    const phone = normalizePhone(place.internationalPhoneNumber || place.nationalPhoneNumber);
    if (phone && phone.length >= 7) keys.push(`phone:${phone}`);
    const nameAddress = `${normalizeProfileKey(place.displayName?.text)}|${normalizeProfileKey(place.formattedAddress)}`;
    if (nameAddress !== '|') keys.push(`name:${nameAddress}`);
    return keys;
  };

  const mergeItemMetadata = (existing = {}, incoming = {}) => ({
    sourceKeywords: Array.from(new Set([
      ...(existing.sourceKeywords || []),
      existing.sourceKeyword,
      ...(incoming.sourceKeywords || []),
      incoming.sourceKeyword
    ].map(normalizeText).filter(Boolean))),
    matchStrategies: Array.from(new Set([
      ...(existing.matchStrategies || []),
      existing.strategy,
      ...(incoming.matchStrategies || []),
      incoming.strategy
    ].map(normalizeText).filter(Boolean)))
  });

  for (const item of places) {
    const keys = keysForPlace(item.place);
    const existingKey = keys.map((key) => aliases.get(key)).find(Boolean);
    if (existingKey) {
      const existing = byKey.get(existingKey);
      const merged = mergeItemMetadata(existing, item);
      byKey.set(existingKey, placeQuality(item) > placeQuality(existing)
        ? { ...item, sourceKeywords: merged.sourceKeywords, matchStrategies: merged.matchStrategies }
        : { ...existing, sourceKeywords: merged.sourceKeywords, matchStrategies: merged.matchStrategies });
      for (const key of keys) aliases.set(key, existingKey);
      continue;
    }
    const canonicalKey = keys[0];
    if (!canonicalKey) continue;
    byKey.set(canonicalKey, item);
    for (const key of keys) aliases.set(key, canonicalKey);
  }
  return Array.from(byKey.values());
}

export async function searchPlaces({
  keyword,
  area,
  maxResults = 20,
  pageToken = '',
  languageCode = '',
  regionCode = '',
  searchMode = 'keyword',
  placeType = ''
}) {
  const settings = await getRuntimeSettings();
  if (!settings.googleMapsApiKey) {
    throw Object.assign(new Error('缺少商户数据服务 API Key，请先在系统设置里配置。'), { status: 400 });
  }

  const effectiveRegionCode = regionCode || settings.placesRegionCode;
  const requests = buildSearchRequests({
    keyword,
    area,
    maxResults,
    pageToken,
    languageCode: languageCode || settings.placesLanguageCode,
    regionCode: effectiveRegionCode,
    searchMode,
    placeType
  });

  const requestedResultCount = normalizeRequestedResultCount(maxResults);
  const collected = [];
  let nextPageToken = '';
  for (const request of requests) {
    let pageTokenForRequest = request.body.pageToken || '';

    do {
      const currentUniqueCount = dedupePlaces(collected).length;
      const remaining = requestedResultCount - currentUniqueCount;
      if (remaining <= 0) break;

      const body = {
        ...request.body,
        maxResultCount: Math.min(getPageResultCount(request.body.maxResultCount), remaining)
      };
      if (pageTokenForRequest) body.pageToken = pageTokenForRequest;

    const response = await fetch(TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': settings.googleMapsApiKey,
        'X-Goog-FieldMask': FIELD_MASK
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw Object.assign(new Error(`商户数据查询失败：${response.status} ${text}`), { status: response.status });
    }

    const data = await response.json();
    pageTokenForRequest = request.nextPageEligible ? data.nextPageToken || '' : '';
    if (request.nextPageEligible) nextPageToken = pageTokenForRequest;
    for (const place of data.places || []) {
      collected.push({
        place,
        strategy: request.strategy,
        sourceKeyword: request.searchKeyword || keyword,
        sourceKeywords: [request.searchKeyword || keyword],
        matchStrategies: [request.strategy]
      });
    }
    } while (request.nextPageEligible && pageTokenForRequest && dedupePlaces(collected).length < requestedResultCount);

    if (dedupePlaces(collected).length >= requestedResultCount) break;
  }

  const merged = dedupePlaces(collected).slice(0, requestedResultCount);
  return {
    leads: merged.map(({ place, strategy, sourceKeyword, sourceKeywords = [], matchStrategies = [] }) => ({
      ...normalizePlace(place, effectiveRegionCode),
      sourceKeyword: sourceKeyword || sourceKeywords[0] || keyword,
      sourceKeywords: Array.from(new Set([...(sourceKeywords || []), sourceKeyword || keyword].map(normalizeText).filter(Boolean))),
      matchStrategy: strategy,
      matchStrategies: Array.from(new Set([...(matchStrategies || []), strategy].map(normalizeText).filter(Boolean)))
    })),
    nextPageToken,
    strategies: requests.map((request) => request.strategy)
  };
}

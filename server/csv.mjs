function quote(value) {
  const original = value == null ? '' : String(value);
  const text = /^[\s]*[=+\-@]/.test(original) ? `'${original}` : original;
  return `"${text.replace(/"/g, '""')}"`;
}

export function leadsToCsv(leads) {
  const headers = [
    'name',
    'companyType',
    'phone',
    'whatsappContactUrls',
    'whatsappContactPhones',
    'emails',
    'emailSourceUrls',
    'emailDiscoveryReason',
    'emailDiscoveryReasonCode',
    'emailDiscoveryPagesScanned',
    'socialProfileUrls',
    'directoryProfileUrls',
    'enrichmentSteps',
    'website',
    'address',
    'googleMapsUrl',
    'rating',
    'reviewCount',
    'status',
    'source'
  ];
  const rows = leads.map((lead) => [
    lead.name,
    lead.companyType,
    lead.phone,
    (lead.whatsappContacts || []).map((item) => item.url).filter(Boolean).join('; '),
    (lead.whatsappContacts || []).map((item) => item.phone).filter(Boolean).join('; '),
    (lead.emails || []).join('; '),
    (lead.emailSources || []).map((item) => item.url).filter(Boolean).join('; '),
    lead.emailDiscoveryReason || lead.emailDiscoveryError || '',
    lead.emailDiscoveryReasonCode || '',
    lead.emailDiscoveryPagesScanned ?? '',
    (lead.socialProfiles || []).map((item) => item.url).filter(Boolean).join('; '),
    (lead.directoryProfiles || []).map((item) => item.url).filter(Boolean).join('; '),
    (lead.enrichmentSteps || []).map((item) => `${item.name}:${item.status}`).join('; '),
    lead.website,
    lead.address,
    lead.googleMapsUrl,
    lead.rating,
    lead.reviewCount,
    lead.status,
    lead.source
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')}`;
}

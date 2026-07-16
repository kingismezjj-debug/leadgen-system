import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverEmailDetails,
  discoverContactLinks,
  extractCloudflareProtectedEmails,
  extractEmailsFromHtml,
  extractJsonLdEmails,
  extractMailtoEmails
} from '../server/emailDiscovery.mjs';

test('discoverEmailDetails classifies missing websites', async () => {
  const result = await discoverEmailDetails('');
  assert.deepEqual(result.emails, []);
  assert.equal(result.status, 'empty');
  assert.equal(result.reason.code, 'missing_website');
  assert.equal(result.pagesScanned, 0);
});

test('discoverEmailDetails keeps found emails even if a later page times out', async (t) => {
  const previousFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const currentUrl = new URL(String(url));
    if (currentUrl.pathname === '/') {
      return new Response('<p>info@iana.org</p><a href="/team">Team</a>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    if (currentUrl.pathname === '/team') {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    return new Response('', { status: 404, headers: { 'Content-Type': 'text/html' } });
  };

  t.after(() => {
    global.fetch = previousFetch;
  });

  const result = await discoverEmailDetails('https://iana.org', {
    timeoutMs: 50,
    maxDepth: 1
  });

  assert.deepEqual(result.emails, ['info@iana.org']);
  assert.equal(result.status, 'found');
  assert.equal(result.reason, null);
});

test('extractMailtoEmails reads mailto hrefs and allows explicit public-provider contacts', () => {
  const html = `
    <a href="mailto:hello@acme.test?subject=Hi">Email</a>
    <a href="mailto:orders.acme@gmail.com">Gmail</a>
    <a href="mailto:sales@other.test">Other</a>
  `;

  assert.deepEqual(extractMailtoEmails(html, 'acme.test'), ['hello@acme.test', 'orders.acme@gmail.com']);
});

test('extractCloudflareProtectedEmails decodes email-protection links', () => {
  const html = `
    <a href="/cdn-cgi/l/email-protection#1a6a7f7e737e7569346e777b5a7d777b737634797577">
      <span class="__cf_email__" data-cfemail="1a6a7f7e737e7569346e777b5a7d777b737634797577">[email protected]</span>
    </a>
  `;

  assert.deepEqual(extractCloudflareProtectedEmails(html, 'todomayoristaargentina.com'), ['pedidos.tma@gmail.com']);
});

test('extractJsonLdEmails reads nested email fields', () => {
  const html = `
    <script type="application/ld+json">
      {
        "@type": "LocalBusiness",
        "department": { "email": "frontdesk@clinic.test" }
      }
    </script>
  `;

  assert.deepEqual(extractJsonLdEmails(html, 'clinic.test'), ['frontdesk@clinic.test']);
});

test('discoverContactLinks returns same-domain contact-like paths from homepage', () => {
  const html = `
    <a href="/team">Meet the team</a>
    <a href="/kontakt">Kontakt</a>
    <a href="https://external.test/contact">External contact</a>
    <a href="/brochure.pdf">Contact PDF</a>
  `;

  assert.deepEqual(discoverContactLinks(html, 'https://acme.test'), ['/team', '/kontakt']);
});

test('extractEmailsFromHtml combines text, mailto, and json-ld sources', () => {
  const html = `
    <p>Reach us at info@acme.test.</p>
    <a href="mailto:booking@acme.test">Booking</a>
    <script type="application/ld+json">{"email":"owner@acme.test"}</script>
  `;

  assert.deepEqual(
    extractEmailsFromHtml(html, 'acme.test').sort(),
    ['booking@acme.test', 'info@acme.test', 'owner@acme.test']
  );
});

test('extractEmailsFromHtml can allow public-provider text emails on contact pages', () => {
  const html = `
    <section>
      <h2>Support</h2>
      <p>easyfixng1@gmail.com</p>
      <p>sales_team@qq.com</p>
      <p>orders-shop@mail.ru</p>
      <p>tokyo.branch@yahoo.co.jp</p>
      <p>bonjour.orange@orange.fr</p>
    </section>
  `;

  assert.deepEqual(extractEmailsFromHtml(html, 'www.easyfix.ng'), []);
  assert.deepEqual(
    extractEmailsFromHtml(html, 'www.easyfix.ng', { allowPublicProvider: true }).sort(),
    [
      'bonjour.orange@orange.fr',
      'easyfixng1@gmail.com',
      'orders-shop@mail.ru',
      'sales_team@qq.com',
      'tokyo.branch@yahoo.co.jp'
    ]
  );
});

test('email extraction rejects lookalike domains and escaped markup artifacts', () => {
  assert.deepEqual(extractEmailsFromHtml('sales@notacme.test', 'acme.test'), []);
  assert.deepEqual(extractEmailsFromHtml('\\u003einfo@acme.test', 'acme.test'), ['info@acme.test']);
  assert.deepEqual(extractEmailsFromHtml('sales@evilco.uk', 'shop.co.uk'), []);
});

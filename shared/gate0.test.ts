import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate0 } from './gate0.ts';

const label = (url: string, final?: string) => gate0(url, final).label;

test('exact official hosts are confirmed, www allowed', () => {
  assert.equal(label('https://udyamregistration.gov.in/'), 'Official source confirmed');
  assert.equal(label('https://www.udyamregistration.gov.in/Government-India/Ministry-MSME-registration.htm'), 'Official source confirmed');
});

test('HTTPS is required but not enough', () => {
  assert.equal(label('http://udyamregistration.gov.in/'), 'Unable to verify');
  assert.equal(label('https://udyamregistration-gov.example/'), 'Potential lookalike');
});

test('lookalikes: brand name, official host as prefix, typo, punycode', () => {
  assert.equal(label('https://udyamregistration.gov.in.verify-now.example/'), 'Potential lookalike');
  assert.equal(label('https://udyamregistraton.gov.in/'), 'Potential lookalike');
  assert.equal(label('https://scholarships.gov.co/'), 'Potential lookalike');
  assert.equal(label('https://xn--udyam-9za.in/'), 'Potential lookalike');
});

test('unknown sites and unvetted subdomains are "Unable to verify", not called fake', () => {
  assert.equal(label('https://example.org/'), 'Unable to verify');
  assert.equal(label('https://help.udyamregistration.gov.in/'), 'Unable to verify');
  assert.equal(label('not a url'), 'Unable to verify');
});

test('redirects: worst of start and landing page wins, and the redirect is disclosed', () => {
  const r = gate0('https://udyamregistration.gov.in/', 'https://udyamregistration-gov.example/pay');
  assert.equal(r.label, 'Potential lookalike');
  assert.equal(r.hostname, 'udyamregistration-gov.example');
  assert.match(r.reasons[0], /Redirected from udyamregistration.gov.in to udyamregistration-gov.example/);
});

test('same-host redirect: reasons explain the worse label', () => {
  const r = gate0('http://udyamregistration.gov.in/', 'https://udyamregistration.gov.in/');
  assert.equal(r.label, 'Unable to verify');
  assert.match(r.reasons[0], /not served over HTTPS/);
});

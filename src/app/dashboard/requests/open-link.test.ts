/**
 * اختبارات open-link.ts: اسم الحدث، والتحقق من معرّف الطلب، واستخراجه من رابط سطر الإشعار.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { OPEN_REQUEST_EVENT, isRequestId, requestIdOfHref } from './open-link.js';

const ID = '0b7c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4';

test('event name is the one the sidebar and the requests page agree on', () => {
  assert.equal(OPEN_REQUEST_EVENT, 'vd:open-request');
});

test('isRequestId accepts UUIDs of either case and nothing else', () => {
  assert.equal(isRequestId(ID), true);
  assert.equal(isRequestId(ID.toUpperCase()), true);
  for (const bad of [
    '', 'R1', 'abc', ID + 'x', 'x' + ID, ' ' + ID, ID + ' ', ID.slice(1), ID.replace(/-/g, ''),
    '0b7c1d2e-3f4a-4b5c-8d6e-7f8091a2b3cg', ID + '\n', null, undefined, 0, 12, {}, [], [ID], true,
  ]) assert.equal(isRequestId(bad), false, JSON.stringify(bad));
});

test('requestIdOfHref reads the open parameter of a notification href', () => {
  assert.equal(requestIdOfHref(`/dashboard/requests?open=${ID}`), ID);
  assert.equal(requestIdOfHref(`/dashboard/requests?open=${encodeURIComponent(ID)}`), ID);
  assert.equal(requestIdOfHref(`/dashboard/requests?x=1&open=${ID}&y=2`), ID);
  assert.equal(requestIdOfHref(`/dashboard/requests?open=${ID}#top`), ID);
  assert.equal(requestIdOfHref(`?open=${ID}`), ID);
  assert.equal(requestIdOfHref(`/dashboard/requests/?open=${ID.toUpperCase()}`), ID.toUpperCase());
});

test('requestIdOfHref answers null (plain navigation) for anything it cannot trust', () => {
  for (const href of [
    '', '/dashboard/requests', '/dashboard/requests?', '/dashboard/requests?open=', '/dashboard/requests?open',
    '/dashboard/requests?open=R1', `/dashboard/requests?open=${ID}x`, `/dashboard/requests?opened=${ID}`,
    `/dashboard/requests?open=%20${ID}`, `/dashboard/requests#open=${ID}`, `/dashboard/requests#x?open=${ID}`,
    '/dashboard/requests?open=a%20b%26c%3D1', '/dashboard/requests?open=%E0%A4%A',
  ]) assert.equal(requestIdOfHref(href), null, href);
});

test('requestIdOfHref uses the first open parameter when repeated', () => {
  assert.equal(requestIdOfHref(`/dashboard/requests?open=${ID}&open=R1`), ID);
  assert.equal(requestIdOfHref(`/dashboard/requests?open=R1&open=${ID}`), null);
});

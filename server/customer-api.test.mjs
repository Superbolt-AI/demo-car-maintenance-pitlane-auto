import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { localStore } from './local-store.mjs';
import { quoteApi, appointmentsApi } from './customer-api.mjs';
import { handler } from './workshop.mjs';

async function fixture(run) {
  const directory = await mkdtemp(tmpdir() + '/pitlane-api-');
  try {
    const store = localStore(directory);
    await run({ store, quote: quoteApi(store), book: appointmentsApi(store), workshop: handler(store) });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const request = (body, method = 'POST') => new Request('http://localhost/api/appointments', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const booking = {
  customerName: 'Demo Customer', email: 'demo@example.com', model: 'Corolla', year: 2020,
  serviceId: 'essential', date: '2099-01-10', time: '10:00', requestId: 'demo-001',
};

test('model search is read-only, resolves aliases, returns live and custom service prices', () => fixture(async ({ store, quote, workshop }) => {
  let response = await quote(new Request('http://localhost/api/quote?model=corolla'));
  assert.equal(response.status, 200);
  let data = await response.json();
  assert.equal(data.quotes.length, 6);
  assert.equal(data.quotes[0].price, 189);
  assert.equal((await store.list('quote/')).length, 0);
  assert.equal((await store.list('appointment/')).length, 0);
  await workshop(request({ action: 'price', id: 'essential', vehiclePrices: { car: 22000, suv: 27000, ute: 31000, luxury: 40000 } }));
  response = await quote(new Request('http://localhost/api/quote?model=Mazda%20CX5&serviceId=essential'));
  data = await response.json();
  assert.equal(data.vehicle.vehicleType, 'suv');
  assert.equal(data.quotes[0].priceCents, 27000);
  const added = await (await workshop(request({ action: 'addService', name: 'AC check', description: 'AC inspection', minutes: 30, vehiclePrices: { car: 10000, suv: 12000, ute: 14000, luxury: 16000 } }))).json();
  response = await quote(new Request(`http://localhost/api/quote?model=Corolla&serviceId=${added.service.id}`));
  assert.equal((await response.json()).quotes[0].price, 100);
}));

test('appointment creation calculates its own price, persists and appears in the existing UI', () => fixture(async ({ store, book, workshop }) => {
  let response = await book(request({ ...booking, priceCents: 1, status: 'Confirmed' }));
  assert.equal(response.status, 201);
  const created = (await response.json()).appointment;
  assert.equal(created.status, 'Pending');
  assert.equal(created.priceCents, 18900);
  let list = await (await workshop(new Request('http://localhost/api/workshop?view=appointments'))).json();
  assert(list.appointments.some(a => a.id === created.id));
  await workshop(request({ action: 'status', id: created.id, status: 'Cancelled' }));
  await workshop(request({ action: 'price', id: 'essential', vehiclePrices: { car: 50000, suv: 50000, ute: 50000, luxury: 50000 } }));
  response = await appointmentsApi(store)(request(booking));
  assert.equal(response.status, 200);
  const retry = await response.json();
  assert.equal(retry.appointment.id, created.id);
  assert.equal(retry.appointment.status, 'Cancelled');
  assert.equal(retry.appointment.priceCents, 18900);
  assert.equal(retry.replayed, true);
  assert.equal((await book(request({ ...booking, customerName: 'Different Customer' }))).status, 409);
}));

test('simultaneous retry requests create one appointment', () => fixture(async ({ store, book }) => {
  const results = await Promise.all([book(request(booking)), book(request(booking)), book(request(booking))]);
  assert(results.every(response => [200, 201].includes(response.status)));
  assert.equal((await store.list('appointment/')).length, 1);
}));

test('invalid requests return useful errors without saving appointments', () => fixture(async ({ store, book, quote }) => {
  for (const update of [{ email: 'bad' }, { year: 1900.5 }, { date: '2099-02-31' }, { date: '2020-01-01' }, { time: '03:00' }, { requestId: '../bad' }]) {
    assert.equal((await book(request({ ...booking, ...update }))).status, 400);
  }
  assert.equal((await book(request({ ...booking, serviceId: 'missing' }))).status, 404);
  assert.equal((await book(request({ ...booking, model: 'Unlisted model' }))).status, 422);
  assert.equal((await quote(new Request('http://localhost/api/quote?model=Corolla&make=Ford'))).status, 422);
  assert.equal((await quote(new Request('http://localhost/api/quote'))).status, 400);
  assert.equal((await quote(request({}))).status, 405);
  assert.equal((await book(new Request('http://localhost/api/appointments'))).status, 405);
  assert.equal((await book(new Request('http://localhost/api/appointments', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await book(new Request('http://localhost/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await store.list('appointment/')).length, 0);
}));

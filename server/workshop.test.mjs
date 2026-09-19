import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { handler } from './workshop.mjs';
import { localStore } from './local-store.mjs';

test('services, vehicle prices, appointment statuses and persistence', async () => {
  const directory = await mkdtemp(tmpdir() + '/pitlane-test-');
  try {
    let run = handler(localStore(directory));
    const get = async () => {
      const response = await run(new Request('http://localhost/api/workshop?view=appointments'));
      return response.json();
    };
    const post = async data => {
      const response = await run(new Request('http://localhost/api/workshop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }));
      return { status: response.status, data: await response.json() };
    };

    let data = await get();
    assert.equal(data.appointments.length, 3);
    assert.deepEqual(data.appointments.map(a => a.status), ['Pending', 'Confirmed', 'Cancelled']);

    await post({ action: 'status', id: 'demo-pending', status: 'Cancelled' });
    data = await get();
    assert.equal(data.appointments.length, 3);
    assert.equal(data.appointments[0].status, 'Cancelled');

    const result = await post({
      action: 'addService', name: 'Air conditioning', description: 'AC inspection', minutes: 60,
      vehiclePrices: { car: 10000, suv: 12000, ute: 14000, luxury: 17000 },
    });
    const service = result.data.service;
    assert.equal(result.status, 200);

    const details = { action: 'quote', make: 'Mazda', model: 'CX-5', year: 2022, service: service.id, vehicleType: 'suv' };
    const quote = (await post(details)).data;
    assert.equal(quote.cents, 12000);
    await post({ action: 'price', id: service.id, vehiclePrices: { car: 11000, suv: 15000, ute: 16000, luxury: 19000 } });
    assert.equal((await post(details)).data.cents, 15000);

    const booking = { action: 'book', quote: quote.id, name: 'Demo Customer', email: 'demo@example.com', date: '2099-01-10', time: '10:00' };
    await post(booking);
    await post(booking);

    // A new handler still sees records written by the previous handler.
    run = handler(localStore(directory));
    data = await get();
    assert.equal(data.appointments.length, 4);
    const saved = data.appointments.find(a => a.id === quote.id);
    assert.equal(saved.cents, 12000);
    assert.equal(saved.status, 'Pending');

    await post({ action: 'status', id: quote.id, status: 'Confirmed' });
    assert.equal((await get()).appointments.find(a => a.id === quote.id).status, 'Confirmed');
    assert.equal((await post({ action: 'status', id: quote.id, status: 'Invalid' })).status, 400);
    assert.equal((await post({ ...booking, date: '2099-02-31' })).status, 400);

    const reset = await post({ action: 'reset' });
    assert.equal(reset.status, 200);
    data = await get();
    assert.equal(data.appointments.length, 3);
    assert.deepEqual(data.appointments.map(a => a.status), ['Pending', 'Confirmed', 'Cancelled']);
    assert.equal(data.prices.some(item => item.id === service.id), false);
    assert.equal(data.prices.find(item => item.id === 'essential').vehiclePrices.car, 18900);
    assert.equal(await localStore(directory).get(`quote/${quote.id}`), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

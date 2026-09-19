import { getServicePrices } from './pricing.mjs';
import { services } from './defaults.mjs';
import { randomUUID } from 'node:crypto';

const types = ['car', 'suv', 'ute', 'luxury'];
const statuses = ['Pending', 'Confirmed', 'Cancelled'];
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' }
});
const validText = (v, max) => typeof v === 'string' && !!v.trim() && v.length <= max;
const validPrices = p => p && types.every(t => Number.isInteger(p[t]) && p[t] >= 0 && p[t] <= 10000000);
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

export function handler(store) {
  const getPrices = () => getServicePrices(store);

  async function seedExamples() {
    const rows = [
      ['demo-pending', 'Alex Sample', 'Toyota', 'Corolla', 2020, 'car', 'Pending', 1],
      ['demo-confirmed', 'Sam Sample', 'Mazda', 'CX-5', 2022, 'suv', 'Confirmed', 2],
      ['demo-cancelled', 'Jordan Sample', 'Ford', 'Ranger', 2021, 'ute', 'Cancelled', 3]
    ];
    const service = (await getPrices())[0];
    for (const [id, name, make, model, year, vehicleType, status, offset] of rows) {
      const date = new Date(today() + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + offset);
      await store.set(`appointment/${id}`, {
        id, name, email: `${id}@example.com`, make, model, year, vehicleType,
        service: service.name, cents: service.vehiclePrices[vehicleType],
        minutes: service.minutes, date: date.toISOString().slice(0, 10),
        time: '10:00', status, isDemo: true
      }, { onlyIfNew: true });
    }
  }

  return async request => {
    try {
      if (request.method === 'GET') {
        let appointments = [];
        if (new URL(request.url).searchParams.get('view') === 'appointments') {
          await seedExamples();
          appointments = (await store.list('appointment/'))
            .map(a => ({ ...a, status: a.status === 'Requested' ? 'Pending' : a.status }))
            .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        }
        return json({ prices: await getPrices(), appointments });
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!request.headers.get('content-type')?.includes('application/json')) {
        return json({ error: 'Expected JSON.' }, 415);
      }
      const raw = await request.text();
      if (raw.length > 10000) return json({ error: 'Request too large.' }, 413);
      let b;
      try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!b || typeof b !== 'object') return json({ error: 'Invalid request.' }, 400);

      if (b.action === 'reset') {
        if (typeof store.clear !== 'function') {
          return json({ error: 'Reset is not supported by this storage adapter.' }, 501);
        }
        for (const prefix of ['price/', 'service/', 'quote/', 'appointment/']) {
          await store.clear(prefix);
        }
        await seedExamples();
        return json({ ok: true });
      }

      if (b.action === 'addService') {
        if (!validText(b.name, 80) || !validText(b.description, 250) ||
          !Number.isInteger(b.minutes) || b.minutes < 5 || b.minutes > 1440 ||
          !validPrices(b.vehiclePrices)) {
          return json({ error: 'Enter a service name, description, duration and four valid prices.' }, 400);
        }
        const service = {
          id: randomUUID(), name: b.name.trim(), description: b.description.trim(),
          minutes: b.minutes, vehiclePrices: b.vehiclePrices, cents: b.vehiclePrices.car
        };
        await store.set(`service/${service.id}`, service);
        return json({ service });
      }

      if (b.action === 'price') {
        const p = (await getPrices()).find(p => p.id === b.id);
        if (!p) return json({ error: 'Service not found.' }, 404);
        if (!validPrices(b.vehiclePrices)) return json({ error: 'Check all four prices.' }, 400);
        const service = { ...p, vehiclePrices: b.vehiclePrices, cents: b.vehiclePrices.car };
        const prefix = services.some(s => s.id === p.id) ? 'price/' : 'service/';
        await store.set(prefix + p.id, service);
        return json({ service });
      }

      if (b.action === 'status') {
        if (!validId(b.id) || !statuses.includes(b.status)) {
          return json({ error: 'Choose Pending, Confirmed or Cancelled.' }, 400);
        }
        const key = `appointment/${b.id}`;
        const a = await store.get(key);
        if (!a) return json({ error: 'Appointment not found.' }, 404);
        await store.set(key, { ...a, status: b.status });
        return json({ ok: true });
      }

      if (b.action === 'quote') {
        if (!validText(b.make, 60) || !validText(b.model, 80) ||
          !Number.isInteger(b.year) || b.year < 1980 ||
          b.year > new Date().getFullYear() + 1 || !types.includes(b.vehicleType)) {
          return json({ error: 'Enter valid vehicle details and choose a vehicle type.' }, 400);
        }
        const p = (await getPrices()).find(p => p.id === b.service);
        if (!p) return json({ error: 'Choose a service.' }, 400);
        const q = {
          id: randomUUID(), make: b.make.trim(), model: b.model.trim(), year: b.year,
          vehicleType: b.vehicleType, service: p.name,
          cents: p.vehiclePrices[b.vehicleType], minutes: p.minutes,
          created: new Date().toISOString()
        };
        await store.set(`quote/${q.id}`, q);
        return json(q);
      }

      if (b.action === 'book') {
        const validDate = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
          !isNaN(Date.parse(b.date)) && new Date(b.date).toISOString().slice(0, 10) === b.date &&
          b.date >= today();
        const times = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
        if (!validText(b.name, 100) || !validText(b.email, 200) ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
          !validDate || !times.includes(b.time) || !validId(b.quote)) {
          return json({ error: 'Check your contact details, date and time.' }, 400);
        }
        const now = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date());
        if (b.date === today() && b.time <= now) {
          return json({ error: 'Choose a later appointment time.' }, 400);
        }
        const q = await store.get(`quote/${b.quote}`);
        if (!q) return json({ error: 'Generate a quote first.' }, 404);
        await store.set(`appointment/${q.id}`, {
          ...q, name: b.name.trim(), email: b.email.trim(),
          date: b.date, time: b.time, status: 'Pending'
        }, { onlyIfNew: true });
        return json({ ok: true, id: q.id });
      }
      return json({ error: 'Unknown action.' }, 400);
    } catch (error) {
      console.error(error);
      return json({ error: 'Unable to load or save. Please try again.' }, 503);
    }
  };
}

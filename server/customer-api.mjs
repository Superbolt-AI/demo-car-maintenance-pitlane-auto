import { randomUUID, createHash } from 'node:crypto';
import { getServicePrices } from './pricing.mjs';
import { findVehicle, vehicleModels } from './vehicle-models.mjs';

const TIMEZONE = 'Australia/Melbourne';
const TIMES = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
const validText = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;
const validYear = year => Number.isInteger(year) && year >= 1980 && year <= new Date().getFullYear() + 1;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = (data, status = 200, extraHeaders = {}) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', ...extraHeaders },
});
class ApiError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
function vehicleFor(model, make) {
  if (!validText(model, 80) || (make !== undefined && !validText(make, 60))) {
    throw new ApiError(400, 'Provide a model. Make is optional.');
  }
  const vehicle = findVehicle(model, make);
  if (!vehicle) throw new ApiError(422, 'No matching model in the demo catalogue. Add it to server/vehicle-models.mjs.', {
    supportedModels: vehicleModels.map(vehicle => `${vehicle.make} ${vehicle.model}`),
  });
  return { make: vehicle.make, model: vehicle.model, vehicleType: vehicle.vehicleType };
}
function estimate(service, vehicle) {
  const priceCents = service.vehiclePrices[vehicle.vehicleType];
  return {
    serviceId: service.id, serviceName: service.name,
    price: priceCents / 100, priceCents, currency: 'AUD', gstIncluded: true,
    durationMinutes: service.minutes,
  };
}
async function readBody(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(415, 'Use Content-Type: application/json.');
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 10000) throw new ApiError(413, 'Request body is too large.');
  let body;
  try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Provide a JSON object.');
  return body;
}
function validateBooking(body) {
  if (!validText(body.customerName, 100) || !validText(body.email, 200) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    throw new ApiError(400, 'Provide a customerName and valid email.');
  }
  if (!validYear(body.year)) throw new ApiError(400, 'Provide a numeric vehicle year from 1980 through next year.');
  if (!validText(body.serviceId, 80)) throw new ApiError(400, 'Provide a serviceId from the quote search.');
  const date = body.date;
  const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate || !TIMES.includes(body.time)) throw new ApiError(400, 'Use a valid date (YYYY-MM-DD) and available time (HH:mm).', { availableTimes: TIMES });
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  if (date < today || (date === today && body.time <= time)) throw new ApiError(400, 'Choose a future date and time in Melbourne.');
  if (body.requestId !== undefined &&
      (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.requestId))) {
    throw new ApiError(400, 'requestId must contain 1–80 letters, numbers, hyphens or underscores.');
  }
}
function bookingResponse(record) {
  return {
    id: record.id, customerName: record.name, email: record.email,
    make: record.make, model: record.model, year: record.year, vehicleType: record.vehicleType,
    serviceId: record.serviceId, serviceName: record.service,
    date: record.date, time: record.time, timezone: TIMEZONE, status: record.status,
    price: record.cents / 100, priceCents: record.cents, currency: 'AUD', gstIncluded: true,
  };
}
function failure(error) {
  if (error instanceof ApiError) return json({ error: error.message, ...error.details }, error.status);
  console.error('Customer API failed:', error);
  return json({ error: 'Storage is unavailable. Please try again.' }, 503);
}

// GET /api/quote?model=Corolla&serviceId=essential
// Omitting serviceId returns an estimate for every available service.
// This endpoint is read-only: it does not save quotes or appointments.
export function quoteApi(store) {
  return async request => {
    if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405, { Allow: 'GET' });
    try {
      const query = new URL(request.url).searchParams;
      const vehicle = vehicleFor(query.get('model'), query.get('make') ?? undefined);
      if (query.has('year')) {
        const year = Number(query.get('year'));
        if (!validYear(year)) throw new ApiError(400, 'Invalid year.');
        vehicle.year = year;
      }
      const services = await getServicePrices(store);
      const serviceId = query.get('serviceId');
      const matches = serviceId === null ? services : services.filter(service => service.id === serviceId);
      if (!matches.length) throw new ApiError(404, 'Service not found.');
      return json({
        vehicle, quotes: matches.map(service => estimate(service, vehicle)),
        pricingBasis: 'Saved service price for the model’s demo vehicle category. Year does not change this demo price.',
        note: 'Estimate only. Final pricing is confirmed after inspection.',
      });
    } catch (error) { return failure(error); }
  };
}

// POST /api/appointments
// A caller-supplied requestId makes safe retries possible without duplicate bookings.
export function appointmentsApi(store) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, { Allow: 'POST' });
    try {
      const body = await readBody(request);
      validateBooking(body);
      const vehicle = vehicleFor(body.model, body.make);
      const normalized = {
        ...vehicle, year: body.year, serviceId: body.serviceId,
        customerName: body.customerName.trim(), email: body.email.trim(),
        date: body.date, time: body.time,
      };
      const fingerprint = hash(JSON.stringify(normalized));
      const id = body.requestId ? `api-${hash(body.requestId)}` : randomUUID();
      const key = `appointment/${id}`;
      if (body.requestId) {
        const existing = await store.get(key);
        if (existing) {
          if (existing.requestFingerprint !== fingerprint) throw new ApiError(409, 'requestId was already used with different appointment details.');
          return json({ appointment: bookingResponse(existing), replayed: true });
        }
      }
      const service = (await getServicePrices(store)).find(service => service.id === body.serviceId);
      if (!service) throw new ApiError(404, 'Service not found.');
      // Ignore any caller-supplied price or status. Always calculate on the server.
      const appointment = {
        id, ...vehicle, year: body.year, serviceId: service.id, service: service.name,
        cents: service.vehiclePrices[vehicle.vehicleType], minutes: service.minutes,
        name: normalized.customerName, email: normalized.email, date: body.date, time: body.time,
        status: 'Pending', created: new Date().toISOString(), source: 'api', requestFingerprint: fingerprint,
      };
      await store.set(key, appointment, { onlyIfNew: true });
      const saved = await store.get(key);
      if (!saved) throw new Error('Record was not available after saving.');
      if (saved.requestFingerprint !== fingerprint) throw new ApiError(409, 'requestId was already used with different appointment details.');
      return json({ appointment: bookingResponse(saved), replayed: false }, 201);
    } catch (error) { return failure(error); }
  };
}

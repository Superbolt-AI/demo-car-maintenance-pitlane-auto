# Pitlane customer APIs

Both endpoints use the same saved service prices and appointment records as the website.

- Local development: run `npm ci` and `npm run dev`, then use the URL Vite prints (normally `http://localhost:5173`).
- Netlify: use your deployed site's URL. Deploy this whole updated project, including the functions and `netlify.toml`.
- The project is prepared for deployment; it has not been deployed to your Netlify account here.

## 1. Search quotes by car model

**GET `/api/quote`**

Query parameters:

| Parameter | Required | Description |
|---|---|---|
| `model` | Yes | A supported demo model, such as Corolla or CX-5. Case and spaces/hyphens are normalised. |
| `serviceId` | No | One service ID. Omit to return every available service and its estimate. |
| `make` | No | Optional make to disambiguate or validate the model. |
| `year` | No | Integer from 1980 through next year. Recorded in the response; it does not change the demo rate. |

Search every service for a model:

```http
GET /api/quote?model=Corolla
```

Search one service:

```http
GET /api/quote?model=Corolla&serviceId=essential
```

Example response using the original default service prices:

```json
{
  "vehicle": {
    "make": "Toyota",
    "model": "Corolla",
    "vehicleType": "car"
  },
  "quotes": [
    {
      "serviceId": "essential",
      "serviceName": "Essential service",
      "price": 189,
      "priceCents": 18900,
      "currency": "AUD",
      "gstIncluded": true,
      "durationMinutes": 60
    }
  ],
  "pricingBasis": "Saved service price for the model’s demo vehicle category. Year does not change this demo price.",
  "note": "Estimate only. Final pricing is confirmed after inspection."
}
```

`price` is dollars; `priceCents` is integer cents. Responses reflect prices saved in Service pricing, including newly added services. The default service IDs are `essential`, `logbook`, `brakes`, `tyres`, `battery`, and `diagnostic`. Custom service IDs are returned by a search without `serviceId`.

This endpoint does not save any records. It is an estimate search, not a price reservation. Appointment creation recalculates using the current saved price, so a pricing edit between search and booking may change the returned appointment estimate.

### Editable demo model catalogue

`server/vehicle-models.mjs` contains these demo mappings:

| Make | Model | Pricing category |
|---|---|---|
| Toyota | Corolla | car |
| Toyota | Camry | car |
| Toyota | RAV4 | suv |
| Mazda | Mazda3 | car |
| Mazda | CX-5 | suv |
| Ford | Ranger | ute |
| BMW | 320i | luxury |

These are editable demonstration rules, not a universal automotive catalogue. Unknown models and make/model mismatches return HTTP 422; the API never silently selects a price category for an unknown car.

Add another model by adding an object to the `vehicleModels` array, then redeploy:

```javascript
{
  make: 'Your make',
  model: 'Your model',
  vehicleType: 'car', // car, suv, ute or luxury
  aliases: ['Optional alternative name']
}
```

## 2. Create an appointment

**POST `/api/appointments`**

Header:

```http
Content-Type: application/json
```

Body:

```json
{
  "customerName": "Alex Sample",
  "email": "alex@example.com",
  "model": "Corolla",
  "year": 2020,
  "serviceId": "essential",
  "date": "2026-10-01",
  "time": "10:00",
  "requestId": "booking-demo-001"
}
```

Choose a future date when testing this example. All fields above are required except `requestId`. `make` is also accepted as an optional field. `year` must be a JSON number, not a string.

Available times: `08:00`, `09:00`, `10:00`, `11:00`, `13:00`, `14:00`, `15:00`, `16:00`. Dates and times use **Australia/Melbourne**, including daylight saving.

The API calculates the estimate on the server and always creates new requests as **Pending**. Caller-supplied prices and statuses are ignored. Requests do not reserve workshop capacity or enforce conflicts; confirmation happens separately on the appointments page.

A successful new request returns **201 Created**:

```json
{
  "appointment": {
    "id": "GENERATED_APPOINTMENT_ID",
    "customerName": "Alex Sample",
    "email": "alex@example.com",
    "make": "Toyota",
    "model": "Corolla",
    "year": 2020,
    "vehicleType": "car",
    "serviceId": "essential",
    "serviceName": "Essential service",
    "date": "2026-10-01",
    "time": "10:00",
    "timezone": "Australia/Melbourne",
    "status": "Pending",
    "price": 189,
    "priceCents": 18900,
    "currency": "AUD",
    "gstIncluded": true
  },
  "replayed": false
}
```

The request appears on `/appointments`, where its status can be changed to Confirmed or Cancelled. Its original estimate stays saved if service prices change later.

### Retrying safely

Send a unique `requestId` for each intended appointment and reuse that same ID when retrying the same request. It can contain 1–80 letters, numbers, hyphens or underscores. Retrying an existing valid request returns its saved record, normally with HTTP 200 and `replayed: true`. Reusing an ID with different booking details returns 409. Requests without an ID create a new record each time. Concurrent identical requests share one stored record, though simultaneous first responses may both report 201. Booking date validation still applies on retries.

## JavaScript usage

```javascript
// Runs on the same website. For a server-to-server integration,
// prepend your deployed Netlify URL to both paths.
const quoteResponse = await fetch('/api/quote?model=Corolla&serviceId=essential');
const quotes = await quoteResponse.json();
if (!quoteResponse.ok) throw new Error(quotes.error);
console.log(quotes.quotes[0].price);

const bookingResponse = await fetch('/api/appointments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerName: 'Alex Sample',
    email: 'alex@example.com',
    model: 'Corolla',
    year: 2020,
    serviceId: 'essential',
    date: '2026-10-01', // Change to a future date.
    time: '10:00',
    requestId: 'booking-demo-001'
  })
});
const booking = await bookingResponse.json();
if (!bookingResponse.ok) throw new Error(booking.error);
console.log(booking.appointment.id);
```

## Error responses

Errors use JSON with an `error` string. Some include useful details such as `supportedModels` or `availableTimes`.

| HTTP status | Meaning |
|---|---|
| 400 | Missing/invalid input, invalid JSON, or date/time in the past |
| 404 | Unknown service |
| 405 | Wrong HTTP method |
| 409 | The same requestId was used with different appointment details |
| 413 | JSON request exceeds 10 KB |
| 415 | Missing or incorrect JSON Content-Type |
| 422 | Model not found or make/model mismatch |
| 503 | Storage temporarily unavailable |

## Access and verification

These endpoints retain the project's shared-demo access model. They do not add authentication, authorization or an external browser CORS policy. Use sample customer details; a real deployment handling customer records needs staff access control. Server-to-server integrations can call the endpoints without browser CORS requirements.

Validation performed locally: five automated tests, actual HTTP quote and appointment calls, persistence through the existing appointment listing, all three page routes, and a production frontend build. Live Netlify deployment and production Blobs access have not been tested here.


## Reset demo data

`POST /api/workshop` with `{ "action": "reset" }` clears saved price overrides, custom services, generated quotes and appointments, then restores the built-in sample appointments.

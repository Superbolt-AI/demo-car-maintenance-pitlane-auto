# Pitlane Auto — Netlify-ready car maintenance demo

## What is included

- `/`: enter a car make, model, year and service to generate an AUD quote, then request an appointment.
- `/pricing`: list six services and save new prices.
- `/appointments`: view saved appointment requests, customer details, vehicles, services and original estimates.
- Responsive desktop/mobile design, input validation, loading/error/empty states.
- Quotes are calculated server-side. New prices affect new quotes; earlier quotes retain their original price.
- A booking uses the quote ID as its unique key, preventing duplicate appointments when a request is retried.

This demo uses separate editable service prices for Car/Hatchback, SUV, Ute/Van, and Luxury. Make/model/year are recorded; the selected vehicle category determines the price. Prices are hidden on service selection cards and shown in the generated quote. You can add services from the Service pricing page. Three labelled sample appointments are created automatically; their Pending, Confirmed and Cancelled statuses can be updated and persist after refresh. All displayed prices include GST. Appointment times use Australia/Melbourne and remain requests pending workshop confirmation. There are no payments or outbound confirmation emails.

## Stack

React, TypeScript, Vite, Tailwind CSS, Shadcn primitives and Lucide icons. Netlify Functions handle API requests; Netlify Blobs stores service prices, quote snapshots and appointments. No Cloudflare-specific services or separate database account are required.

## Run it on your laptop

Install Node.js 22.13+ (Node 22 recommended), then open a terminal in this folder:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. The local development server saves data to `.local-data/` on disk. Data survives restarts on that computer. This development data is not uploaded to Netlify. `npm run preview` serves only the built frontend; use `npm run dev` to test the full local workflow.

## Deploy on Netlify

### Option A — Connect a Git repository

1. Upload the contents of this folder to a new GitHub repository. Include `netlify.toml`, `package.json`, `package-lock.json`, `src`, `server`, `public`, `vendor`, and `netlify/functions`.
2. Sign in to Netlify, choose **Add new project → Import an existing project**, and select the repository.
3. Netlify reads `netlify.toml`. Confirm build command **npm run build**, publish directory **dist**, and functions directory **netlify/functions**.
4. Deploy. Open the URL provided by Netlify.

Netlify supplies Blobs credentials automatically to the function. No manual storage keys are needed for a normal Netlify deployment.

### Option B — Deploy from your terminal

```sh
npm ci
npm install --global netlify-cli
netlify login
netlify deploy --build --prod
```

Follow the prompts to create or select a Netlify project. Use the published URL printed by the CLI. Deploy the full project with its function; dragging only `dist` into Netlify does not deploy the API required for quotes and storage.

## Quick demo walkthrough

1. In **Service pricing**, change Essential service’s Car/Hatchback price to **$225.50** and click **Save prices**.
2. In **Get a quote**, enter Toyota / Corolla / 2020, select Car/Hatchback, and choose Essential service, and click **Get my quote**.
3. The estimate should display **$225.50**.
4. Click **Request an appointment**, enter Demo Customer / demo@example.com, and choose a future date and time.
5. Submit, open **Appointments**, and verify the request is listed.
6. Refresh: the appointment remains. Changing the service price afterwards does not change this appointment's estimate.

## Demo access and production use

This is an intentionally shared demo: everyone who can access the deployment can edit prices and view appointment requests. Use fictional contact details. Add authenticated staff access and server-side authorization before using it for real customer data. No AI voice widget or voice-agent integration is included in this build.

Netlify Blobs stores each record separately. Prices use last-write-wins semantics; appointment creation uses atomic `onlyIfNew`. The application uses strong consistency. This is suitable for a small demo; a busy workshop should use authenticated users, pagination, retention controls and a relational database with capacity/conflict management.

## Commands

- `npm run dev`: frontend plus local API and persistent local storage.
- `npm run build`: TypeScript validation and production frontend build.
- `npm test`: price changes, quote snapshots, invalid input, duplicate booking prevention and restart persistence.

## File map

- `src/Workshop.tsx`: the three page views and forms.
- `src/styles.css`: responsive theme and layout.
- `server/defaults.mjs`: initial services and prices.
- `server/workshop.mjs`: shared API logic and validation.
- `server/local-store.mjs`: development-only disk storage.
- `netlify/functions/workshop.mjs`: production Netlify Blobs adapter.
- `netlify.toml`: build, function, and SPA route configuration.

## Official references

- https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/
- https://docs.netlify.com/build/data-and-storage/netlify-blobs/

The project is prepared for Netlify, but a live deployment requires access to your Netlify account. No live Netlify URL is bundled.

## Customer API endpoints

- `GET /api/quote?model=Corolla&serviceId=essential`: find a current estimate by car model. Omit `serviceId` for all services.
- `POST /api/appointments`: create a Pending appointment using customer and vehicle details.

See **API.md** for request bodies, responses, supported models, retry handling, and integration examples.


### Reset demo data

Use **Reset demo data** in the app to restore the original service prices, remove custom services and generated customer data, and restore the three sample appointments.

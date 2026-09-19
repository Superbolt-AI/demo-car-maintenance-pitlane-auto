import { appointmentsApi } from '../../server/customer-api.mjs';
import { netlifyStore } from '../../server/netlify-store.mjs';

export default async function(request) {
  try { return await appointmentsApi(netlifyStore())(request); }
  catch (error) {
    console.error(error);
    return Response.json({ error: 'Storage is unavailable. Please try again.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

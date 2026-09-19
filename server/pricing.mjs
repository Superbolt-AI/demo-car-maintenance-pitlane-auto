import { services } from './defaults.mjs';

// Shared by the website and both public APIs so all quotes use saved prices.
export async function getServicePrices(store) {
  const defaults = await Promise.all(services.map(async service => ({
    ...service,
    ...await store.get(`price/${service.id}`),
  })));
  const custom = await store.list('service/');
  return [...defaults, ...custom].map(service => ({
    ...service,
    vehiclePrices: service.vehiclePrices ?? {
      car: service.cents,
      suv: Math.round(service.cents * 1.2),
      ute: Math.round(service.cents * 1.3),
      luxury: Math.round(service.cents * 1.5),
    },
  }));
}

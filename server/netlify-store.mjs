import { getStore } from '@netlify/blobs';

export function netlifyStore() {
  const blobs = getStore({ name: 'pitlane-workshop', consistency: 'strong' });
  return {
    get: key => blobs.get(key, { type: 'json' }),
    set: (key, value, options) => blobs.setJSON(key, value, options),
    list: async prefix => {
      const { blobs: entries } = await blobs.list({ prefix });
      return (await Promise.all(entries.map(entry =>
        blobs.get(entry.key, { type: 'json' })
      ))).filter(Boolean);
    },
    clear: async prefix => {
      const { blobs: entries } = await blobs.list({ prefix });
      await Promise.all(entries.map(entry => blobs.delete(entry.key)));
    },
  };
}

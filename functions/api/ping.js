// EdgeOne Pages Edge Function: /api/ping
// Tiny no-cache response for latency / jitter measurement.
// Echoes the EdgeOne edge node region info when available.

export function onRequest(context) {
  const { request } = context;

  // EdgeOne exposes geo info via request.eo on supported runtimes.
  let region = '';
  let colo = '';
  try {
    const eo = request.eo || {};
    const geo = eo.geo || {};
    region = geo.regionName || geo.cityName || geo.countryName || '';
    colo = eo.clientIp ? '' : '';
  } catch (e) {
    region = '';
  }

  return new Response(JSON.stringify({ t: Date.now(), region }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Timing-Allow-Origin': '*',
    },
  });
}

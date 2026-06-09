// EdgeOne Pages Edge Function: /api/download
// Returns a stream of random-ish bytes for download speed measurement.
// Query param: bytes (default 25MB, capped at 100MB)

export function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  let bytes = parseInt(url.searchParams.get('bytes') || '26214400', 10);
  if (isNaN(bytes) || bytes <= 0) bytes = 26214400;
  bytes = Math.min(bytes, 104857600); // cap 100MB

  const chunkSize = 65536; // 64KB
  // Pre-build a reusable chunk filled with pseudo-random bytes.
  const chunk = new Uint8Array(chunkSize);
  for (let i = 0; i < chunkSize; i++) {
    chunk[i] = (i * 167 + 13) & 0xff;
  }

  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= bytes) {
        controller.close();
        return;
      }
      const remaining = bytes - sent;
      if (remaining >= chunkSize) {
        controller.enqueue(chunk);
        sent += chunkSize;
      } else {
        controller.enqueue(chunk.subarray(0, remaining));
        sent += remaining;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Timing-Allow-Origin': '*',
    },
  });
}

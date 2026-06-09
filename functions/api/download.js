// EdgeOne Pages Edge Function: /api/download
// Streams INCOMPRESSIBLE pseudo-random bytes for accurate download measurement.
// Repeating/patterned data gets gzip/brotli-compressed on the wire, which makes
// the browser count decompressed bytes and report wildly inflated speeds.
// Query param: bytes (default 25MB, capped at 100MB)

export function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  let bytes = parseInt(url.searchParams.get('bytes') || '26214400', 10);
  if (isNaN(bytes) || bytes <= 0) bytes = 26214400;
  bytes = Math.min(bytes, 104857600); // cap 100MB

  const chunkSize = 65536; // 64KB

  // xorshift32 PRNG — fast, and produces incompressible output so the stream
  // is never shrunk by transport compression. Seed varies per request.
  let seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 || 0x12345678;
  function nextChunk() {
    const buf = new Uint8Array(chunkSize);
    let x = seed;
    for (let i = 0; i < chunkSize; i++) {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5;  x >>>= 0;
      buf[i] = x & 0xff;
    }
    seed = x >>> 0;
    return buf;
  }

  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= bytes) {
        controller.close();
        return;
      }
      const remaining = bytes - sent;
      const chunk = nextChunk();
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
      'Content-Encoding': 'identity',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Timing-Allow-Origin': '*',
    },
  });
}

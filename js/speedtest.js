/* EdgeOne Speed Test — front-end engine
 * Phases: ping -> download -> upload
 * Uses fetch streaming for download and POST for upload.
 */
(function () {
  'use strict';

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const startBtn = $('startBtn');
  const dialProgress = $('dialProgress');
  const dialPhase = $('dialPhase');
  const dialValue = $('dialValue');
  const dialUnit = $('dialUnit');
  const dialTicks = $('dialTicks');
  const statusText = $('statusText');
  const valPing = $('valPing');
  const valJitter = $('valJitter');
  const valDownload = $('valDownload');
  const valUpload = $('valUpload');
  const cards = {
    ping: $('cardPing'), jitter: $('cardJitter'),
    download: $('cardDownload'), upload: $('cardUpload'),
  };

  // ---- Config ----
  const DIAL_CIRCUM = 879;       // approx 2πr for r=140
  const DIAL_ARC = 660;          // visible arc (~270deg)
  const SPEED_MAX = 1000;        // gauge max in Mbps (log-ish scale handled below)
  const PING_COUNT = 8;
  const DL_BYTES = 30 * 1024 * 1024; // per stream
  const DL_STREAMS = 4;
  const DL_DURATION = 10000;     // ms
  const UL_DURATION = 8000;      // ms
  const UL_CHUNK = 1 * 1024 * 1024;

  let running = false;

  // ---- Gauge helpers (logarithmic scale for better low-end resolution) ----
  function speedToFraction(mbps) {
    if (mbps <= 0) return 0;
    const f = Math.log10(mbps + 1) / Math.log10(SPEED_MAX + 1);
    return Math.max(0, Math.min(1, f));
  }
  function setDial(fraction, color) {
    const len = DIAL_ARC * Math.max(0, Math.min(1, fraction));
    dialProgress.style.strokeDasharray = `${len} ${DIAL_CIRCUM}`;
    if (color) dialProgress.style.stroke = color;
  }
  function setDialValue(v, unit, phase) {
    dialValue.textContent = v;
    if (unit) dialUnit.textContent = unit;
    if (phase) dialPhase.textContent = phase;
  }

  // ---- Tick labels around the dial ----
  function buildTicks() {
    const marks = [0, 1, 5, 10, 50, 100, 500, 1000];
    const startAngle = 135, sweep = 270;
    marks.forEach((m) => {
      const frac = speedToFraction(m);
      const angle = startAngle + sweep * frac;
      const rad = (angle * Math.PI) / 180;
      const r = 128;
      const x = Math.cos(rad) * r;
      const y = Math.sin(rad) * r;
      const el = document.createElement('span');
      el.textContent = m;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      dialTicks.appendChild(el);
    });
  }

  // ---- Active card highlight ----
  function setActive(name) {
    Object.values(cards).forEach((c) => c.classList.remove('active'));
    if (name === 'ping' || name === 'jitter') {
      cards.ping.classList.add('active'); cards.jitter.classList.add('active');
    } else if (cards[name]) {
      cards[name].classList.add('active');
    }
  }

  // ================= PING =================
  async function measurePing() {
    setActive('ping');
    setDialValue('0', 'ms', '延迟');
    dialProgress.style.stroke = 'var(--ping)';
    const samples = [];
    for (let i = 0; i < PING_COUNT; i++) {
      const t0 = performance.now();
      try {
        await fetch(`/api/ping?t=${Date.now()}_${i}`, { cache: 'no-store' });
        const rtt = performance.now() - t0;
        samples.push(rtt);
        const cur = Math.min(...samples);
        valPing.textContent = cur.toFixed(0);
        setDialValue(cur.toFixed(0), 'ms', '延迟');
        setDial(1 - Math.min(cur, 300) / 300, 'var(--ping)');
        statusText.textContent = `测量延迟 ${i + 1}/${PING_COUNT}`;
      } catch (e) { /* ignore */ }
      await sleep(120);
    }
    if (!samples.length) { valPing.textContent = '--'; return; }
    samples.sort((a, b) => a - b);
    const ping = samples[0];
    // jitter = avg abs diff between consecutive sorted samples
    let jit = 0;
    for (let i = 1; i < samples.length; i++) jit += Math.abs(samples[i] - samples[i - 1]);
    jit = samples.length > 1 ? jit / (samples.length - 1) : 0;
    valPing.textContent = ping.toFixed(0);
    valJitter.textContent = jit.toFixed(1);
    return { ping, jitter: jit };
  }

  // ================= DOWNLOAD =================
  async function measureDownload() {
    setActive('download');
    dialProgress.style.stroke = 'var(--download)';
    setDialValue('0.00', 'Mbps', '下载');
    let totalBytes = 0;
    const start = performance.now();
    const deadline = start + DL_DURATION;
    let stop = false;

    const ticker = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0) {
        const mbps = (totalBytes * 8) / elapsed / 1e6;
        valDownload.textContent = mbps.toFixed(2);
        setDialValue(mbps.toFixed(2), 'Mbps', '下载');
        setDial(speedToFraction(mbps), 'var(--download)');
        const pct = Math.min(100, ((performance.now() - start) / DL_DURATION) * 100);
        statusText.textContent = `下载测速中… ${pct.toFixed(0)}%`;
      }
    }, 100);

    async function streamWorker() {
      while (!stop && performance.now() < deadline) {
        try {
          const resp = await fetch(`/api/download?bytes=${DL_BYTES}&r=${Math.random()}`, { cache: 'no-store' });
          const reader = resp.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.length;
            if (performance.now() >= deadline) { stop = true; try { reader.cancel(); } catch (e) {} break; }
          }
        } catch (e) { break; }
      }
    }

    const workers = [];
    for (let i = 0; i < DL_STREAMS; i++) workers.push(streamWorker());
    await Promise.all(workers);
    clearInterval(ticker);

    const elapsed = (performance.now() - start) / 1000;
    const mbps = elapsed > 0 ? (totalBytes * 8) / elapsed / 1e6 : 0;
    valDownload.textContent = mbps.toFixed(2);
    setDialValue(mbps.toFixed(2), 'Mbps', '下载');
    setDial(speedToFraction(mbps), 'var(--download)');
    return mbps;
  }

  // ================= UPLOAD =================
  async function measureUpload() {
    setActive('upload');
    dialProgress.style.stroke = 'var(--upload)';
    setDialValue('0.00', 'Mbps', '上传');
    let totalBytes = 0;
    const start = performance.now();
    const deadline = start + UL_DURATION;
    let stop = false;

    // Incompressible payload — an all-zero / patterned buffer gets squashed by
    // transport compression, making upload speed read absurdly high.
    const payload = new Uint8Array(UL_CHUNK);
    if (self.crypto && self.crypto.getRandomValues) {
      for (let off = 0; off < UL_CHUNK; off += 65536) {
        payload.set(self.crypto.getRandomValues(new Uint8Array(Math.min(65536, UL_CHUNK - off))), off);
      }
    } else {
      let x = 0x9e3779b9;
      for (let i = 0; i < UL_CHUNK; i++) {
        x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
        payload[i] = x & 0xff;
      }
    }

    const ticker = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0) {
        const mbps = (totalBytes * 8) / elapsed / 1e6;
        valUpload.textContent = mbps.toFixed(2);
        setDialValue(mbps.toFixed(2), 'Mbps', '上传');
        setDial(speedToFraction(mbps), 'var(--upload)');
        const pct = Math.min(100, ((performance.now() - start) / UL_DURATION) * 100);
        statusText.textContent = `上传测速中… ${pct.toFixed(0)}%`;
      }
    }, 100);

    async function uploadWorker() {
      while (!stop && performance.now() < deadline) {
        try {
          await fetch(`/api/upload?r=${Math.random()}`, {
            method: 'POST',
            body: payload,
            cache: 'no-store',
            headers: { 'Content-Type': 'application/octet-stream' },
          });
          totalBytes += UL_CHUNK;
          if (performance.now() >= deadline) stop = true;
        } catch (e) { break; }
      }
    }

    const workers = [];
    for (let i = 0; i < 3; i++) workers.push(uploadWorker());
    await Promise.all(workers);
    clearInterval(ticker);

    const elapsed = (performance.now() - start) / 1000;
    const mbps = elapsed > 0 ? (totalBytes * 8) / elapsed / 1e6 : 0;
    valUpload.textContent = mbps.toFixed(2);
    setDialValue(mbps.toFixed(2), 'Mbps', '上传');
    setDial(speedToFraction(mbps), 'var(--upload)');
    return mbps;
  }

  // ================= ORCHESTRATION =================
  async function runTest() {
    if (running) return;
    running = true;
    startBtn.classList.add('running');
    startBtn.querySelector('.btn-label').textContent = '···';
    resetValues();

    try {
      const pingRes = await measurePing() || { ping: 0, jitter: 0 };
      const dl = await measureDownload();
      const ul = await measureUpload();

      setActive(null);
      setDialValue('完成', '', '结果');
      dialPhase.textContent = '完成';
      statusText.textContent = '测速完成 · 点击 GO 重新测试';
      saveHistory({ download: dl, upload: ul, ping: pingRes.ping, jitter: pingRes.jitter });
    } catch (e) {
      statusText.textContent = '测速出错：' + (e.message || e);
    } finally {
      running = false;
      startBtn.classList.remove('running');
      startBtn.querySelector('.btn-label').textContent = 'GO';
    }
  }

  function resetValues() {
    valPing.textContent = '--';
    valJitter.textContent = '--';
    valDownload.textContent = '--';
    valUpload.textContent = '--';
    setDial(0);
  }

  // ================= HISTORY (localStorage) =================
  const HKEY = 'eo_speedtest_history';
  function saveHistory(r) {
    const list = loadHistory();
    list.unshift({ ...r, ts: Date.now() });
    while (list.length > 20) list.pop();
    localStorage.setItem(HKEY, JSON.stringify(list));
    renderHistory();
  }
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; }
  }
  function renderHistory() {
    const list = loadHistory();
    const section = $('historySection');
    const body = $('historyBody');
    if (!list.length) { section.hidden = true; return; }
    section.hidden = false;
    body.innerHTML = list.map((r) => {
      const d = new Date(r.ts);
      const t = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      return `<tr><td>${t}</td><td>${r.download.toFixed(1)}</td><td>${r.upload.toFixed(1)}</td><td>${r.ping.toFixed(0)}</td><td>${r.jitter.toFixed(1)}</td></tr>`;
    }).join('');
  }
  $('clearHistory').addEventListener('click', () => {
    localStorage.removeItem(HKEY); renderHistory();
  });

  // ================= INFO BAR =================
  function detectInfo() {
    // browser
    const ua = navigator.userAgent;
    let b = '未知';
    if (/Edg\//.test(ua)) b = 'Edge';
    else if (/Chrome\//.test(ua)) b = 'Chrome';
    else if (/Firefox\//.test(ua)) b = 'Firefox';
    else if (/Safari\//.test(ua)) b = 'Safari';
    $('infoBrowser').textContent = b;

    // protocol guess via location
    $('infoProto').textContent = location.protocol === 'https:' ? 'HTTPS' : 'HTTP';

    // region from ping endpoint
    fetch('/api/ping?info=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d && d.region) $('infoRegion').textContent = d.region; else $('infoRegion').textContent = '全球边缘'; })
      .catch(() => { $('infoRegion').textContent = '全球边缘'; });
  }

  // ---- utils ----
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function pad(n) { return String(n).padStart(2, '0'); }

  // ---- init ----
  buildTicks();
  renderHistory();
  detectInfo();
  setDial(0);
  startBtn.addEventListener('click', runTest);
})();

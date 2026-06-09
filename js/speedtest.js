/* EdgeOne Speed Test — front-end engine (XHR rewrite)
 * Download: repeatedly fetch a static incompressible binary, measure real
 *           bytes via XHR onprogress (industry-standard approach).
 * Upload:   POST random payload, measure via XHR upload.onprogress.
 * Ping:     small no-cache requests, RTT via performance timing.
 */
(function () {
  'use strict';

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
  const nodeSelect = $('nodeSelect');
  const nodeHint = $('nodeHint');

  // ---- Targets (节点) ----
  const TARGETS = (window.SPEEDTEST_TARGETS && window.SPEEDTEST_TARGETS.length)
    ? window.SPEEDTEST_TARGETS
    : [{ id: 'auto', label: '自动 · 就近节点', region: 'EdgeOne Anycast',
         download: 'assets/random10mb.bin', upload: '/api/upload', ping: '/api/ping' }];
  let currentTarget = TARGETS[0];

  function ep(kind) {
    // resolve endpoint url for current target with cache-buster
    const base = currentTarget[kind];
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return `${base}${sep}r=${Math.random()}`;
  }

  // ---- Config ----
  const DIAL_CIRCUM = 879;
  const DIAL_ARC = 660;
  const SPEED_MAX = 1000;
  const PING_COUNT = 10;

  const DL_STREAMS = 6;
  const DL_DURATION = 10000;
  const DL_WARMUP = 1500;       // ignore first 1.5s (TCP ramp-up)

  const UL_DURATION = 8000;
  const UL_WARMUP = 1500;
  const UL_STREAMS = 3;
  const UL_CHUNK = 2 * 1024 * 1024;

  let running = false;
  let abortFns = [];

  // ---- Gauge ----
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
  function buildTicks() {
    const marks = [0, 1, 5, 10, 50, 100, 500, 1000];
    const startAngle = 135, sweep = 270;
    marks.forEach((m) => {
      const frac = speedToFraction(m);
      const angle = startAngle + sweep * frac;
      const rad = (angle * Math.PI) / 180;
      const r = 128;
      const el = document.createElement('span');
      el.textContent = m;
      el.style.transform = `translate(${Math.cos(rad) * r}px, ${Math.sin(rad) * r}px) translate(-50%, -50%)`;
      dialTicks.appendChild(el);
    });
  }
  function setActive(name) {
    Object.values(cards).forEach((c) => c.classList.remove('active'));
    if (name === 'ping' || name === 'jitter') {
      cards.ping.classList.add('active'); cards.jitter.classList.add('active');
    } else if (cards[name]) {
      cards[name].classList.add('active');
    }
  }

  // ================= PING =================
  function pingOnce(i) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${currentTarget.ping}${currentTarget.ping.indexOf('?')>=0?'&':'?'}t=${Date.now()}_${i}`, true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) resolve(performance.now() - t0);
      };
      xhr.onerror = () => resolve(null);
      xhr.send();
    });
  }
  async function measurePing() {
    setActive('ping');
    setDialValue('0', 'ms', '延迟');
    dialProgress.style.stroke = 'var(--ping)';
    const samples = [];
    for (let i = 0; i < PING_COUNT; i++) {
      const rtt = await pingOnce(i);
      if (rtt != null) {
        samples.push(rtt);
        const cur = Math.min(...samples);
        valPing.textContent = cur.toFixed(0);
        setDialValue(cur.toFixed(0), 'ms', '延迟');
        setDial(1 - Math.min(cur, 300) / 300, 'var(--ping)');
      }
      statusText.textContent = `测量延迟 ${i + 1}/${PING_COUNT}`;
      await sleep(100);
    }
    if (!samples.length) { valPing.textContent = '--'; return { ping: 0, jitter: 0 }; }
    samples.sort((a, b) => a - b);
    const ping = samples[0];
    let jit = 0;
    for (let i = 1; i < samples.length; i++) jit += Math.abs(samples[i] - samples[i - 1]);
    jit = samples.length > 1 ? jit / (samples.length - 1) : 0;
    valPing.textContent = ping.toFixed(0);
    valJitter.textContent = jit.toFixed(1);
    return { ping, jitter: jit };
  }

  // ================= DOWNLOAD (XHR onprogress) =================
  function measureDownload() {
    return new Promise((resolve) => {
      setActive('download');
      dialProgress.style.stroke = 'var(--download)';
      setDialValue('0.00', 'Mbps', '下载');

      let totalBytes = 0;       // total since start
      let warmBytes = 0;        // bytes counted after warmup
      let warmStart = 0;        // perf time when warmup ended
      const start = performance.now();
      const deadline = start + DL_DURATION;
      let finished = false;
      const xhrs = [];

      const ticker = setInterval(() => {
        const now = performance.now();
        if (now - start >= DL_WARMUP && warmStart === 0) {
          warmStart = now;
          warmBytes = 0; // reset measurement window after warmup
        }
        let mbps;
        if (warmStart > 0) {
          const el = (now - warmStart) / 1000;
          mbps = el > 0 ? (warmBytes * 8) / el / 1e6 : 0;
        } else {
          const el = (now - start) / 1000;
          mbps = el > 0 ? (totalBytes * 8) / el / 1e6 : 0;
        }
        valDownload.textContent = mbps.toFixed(2);
        setDialValue(mbps.toFixed(2), 'Mbps', '下载');
        setDial(speedToFraction(mbps), 'var(--download)');
        statusText.textContent = `下载测速中… ${Math.min(100, ((now - start) / DL_DURATION) * 100).toFixed(0)}%`;
        if (now >= deadline) finish();
      }, 100);

      function finish() {
        if (finished) return;
        finished = true;
        clearInterval(ticker);
        xhrs.forEach((x) => { try { x.abort(); } catch (e) {} });
        const el = warmStart > 0 ? (performance.now() - warmStart) / 1000 : (performance.now() - start) / 1000;
        const bytes = warmStart > 0 ? warmBytes : totalBytes;
        const mbps = el > 0 ? (bytes * 8) / el / 1e6 : 0;
        valDownload.textContent = mbps.toFixed(2);
        setDialValue(mbps.toFixed(2), 'Mbps', '下载');
        setDial(speedToFraction(mbps), 'var(--download)');
        resolve(mbps);
      }
      abortFns.push(finish);

      function spawn() {
        if (finished || performance.now() >= deadline) return;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', ep('download'), true);
        xhr.responseType = 'arraybuffer';
        let last = 0;
        xhr.onprogress = (e) => {
          const delta = e.loaded - last;
          last = e.loaded;
          totalBytes += delta;
          if (warmStart > 0) warmBytes += delta;
        };
        xhr.onload = xhr.onerror = () => {
          if (!finished) spawn(); // loop: fetch the file again
        };
        xhrs.push(xhr);
        xhr.send();
      }
      for (let i = 0; i < DL_STREAMS; i++) spawn();
    });
  }

  // ================= UPLOAD (XHR upload.onprogress) =================
  function measureUpload() {
    return new Promise((resolve) => {
      setActive('upload');
      dialProgress.style.stroke = 'var(--upload)';
      setDialValue('0.00', 'Mbps', '上传');

      // incompressible random payload
      const payload = new Uint8Array(UL_CHUNK);
      if (self.crypto && self.crypto.getRandomValues) {
        for (let off = 0; off < UL_CHUNK; off += 65536) {
          payload.set(self.crypto.getRandomValues(new Uint8Array(Math.min(65536, UL_CHUNK - off))), off);
        }
      } else {
        let x = 0x9e3779b9;
        for (let i = 0; i < UL_CHUNK; i++) { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; payload[i] = x & 0xff; }
      }

      let totalBytes = 0;
      let warmBytes = 0, warmStart = 0;
      const start = performance.now();
      const deadline = start + UL_DURATION;
      let finished = false;
      const xhrs = [];

      const ticker = setInterval(() => {
        const now = performance.now();
        if (now - start >= UL_WARMUP && warmStart === 0) { warmStart = now; warmBytes = 0; }
        let mbps;
        if (warmStart > 0) { const el = (now - warmStart) / 1000; mbps = el > 0 ? (warmBytes * 8) / el / 1e6 : 0; }
        else { const el = (now - start) / 1000; mbps = el > 0 ? (totalBytes * 8) / el / 1e6 : 0; }
        valUpload.textContent = mbps.toFixed(2);
        setDialValue(mbps.toFixed(2), 'Mbps', '上传');
        setDial(speedToFraction(mbps), 'var(--upload)');
        statusText.textContent = `上传测速中… ${Math.min(100, ((now - start) / UL_DURATION) * 100).toFixed(0)}%`;
        if (now >= deadline) finish();
      }, 100);

      function finish() {
        if (finished) return;
        finished = true;
        clearInterval(ticker);
        xhrs.forEach((x) => { try { x.abort(); } catch (e) {} });
        const el = warmStart > 0 ? (performance.now() - warmStart) / 1000 : (performance.now() - start) / 1000;
        const bytes = warmStart > 0 ? warmBytes : totalBytes;
        const mbps = el > 0 ? (bytes * 8) / el / 1e6 : 0;
        valUpload.textContent = mbps.toFixed(2);
        setDialValue(mbps.toFixed(2), 'Mbps', '上传');
        setDial(speedToFraction(mbps), 'var(--upload)');
        resolve(mbps);
      }
      abortFns.push(finish);

      function spawn() {
        if (finished || performance.now() >= deadline) return;
        const xhr = new XMLHttpRequest();
        xhr.open('POST', ep('upload'), true);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        let last = 0;
        xhr.upload.onprogress = (e) => {
          const delta = e.loaded - last;
          last = e.loaded;
          totalBytes += delta;
          if (warmStart > 0) warmBytes += delta;
        };
        xhr.onload = xhr.onerror = () => { if (!finished) spawn(); };
        xhrs.push(xhr);
        xhr.send(payload);
      }
      for (let i = 0; i < UL_STREAMS; i++) spawn();
    });
  }

  // ================= ORCHESTRATION =================
  async function runTest() {
    if (running) return;
    running = true;
    abortFns = [];
    startBtn.classList.add('running');
    startBtn.querySelector('.btn-label').textContent = '···';
    resetValues();

    try {
      const pingRes = await measurePing();
      const dl = await measureDownload();
      const ul = await measureUpload();

      setActive(null);
      dialPhase.textContent = '完成';
      setDialValue('完成', '', '结果');
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
    valPing.textContent = '--'; valJitter.textContent = '--';
    valDownload.textContent = '--'; valUpload.textContent = '--';
    setDial(0);
  }

  // ================= HISTORY =================
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
  $('clearHistory').addEventListener('click', () => { localStorage.removeItem(HKEY); renderHistory(); });

  // ================= INFO BAR =================
  function detectInfo() {
    const ua = navigator.userAgent;
    let b = '未知';
    if (/Edg\//.test(ua)) b = 'Edge';
    else if (/Chrome\//.test(ua)) b = 'Chrome';
    else if (/Firefox\//.test(ua)) b = 'Firefox';
    else if (/Safari\//.test(ua)) b = 'Safari';
    $('infoBrowser').textContent = b;
    $('infoProto').textContent = location.protocol === 'https:' ? 'HTTPS' : 'HTTP';
    refreshRegion();
  }
  function refreshRegion() {
    const url = currentTarget.ping + (currentTarget.ping.indexOf('?') >= 0 ? '&' : '?') + 'info=1';
    $('infoRegion').textContent = '检测中…';
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { $('infoRegion').textContent = (d && d.region) ? d.region : (currentTarget.region || '全球边缘'); })
      .catch(() => { $('infoRegion').textContent = currentTarget.region || '全球边缘'; });
  }

  // ---- Node picker ----
  function initNodePicker() {
    if (!nodeSelect) return;
    nodeSelect.innerHTML = TARGETS.map((t, i) =>
      `<option value="${i}">${t.label}</option>`).join('');
    nodeSelect.value = '0';
    updateNodeHint();
    nodeSelect.addEventListener('change', () => {
      if (running) { nodeSelect.value = String(TARGETS.indexOf(currentTarget)); return; }
      currentTarget = TARGETS[parseInt(nodeSelect.value, 10)] || TARGETS[0];
      updateNodeHint();
      refreshRegion();
    });
  }
  function updateNodeHint() {
    if (!nodeHint) return;
    if (currentTarget.id === 'auto') {
      nodeHint.textContent = 'EdgeOne 自动路由到离你最近的边缘节点';
    } else {
      nodeHint.textContent = `定向测速：${currentTarget.region || currentTarget.label}（需该地区已绑定独立域名）`;
    }
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function pad(n) { return String(n).padStart(2, '0'); }

  buildTicks();
  initNodePicker();
  renderHistory();
  detectInfo();
  setDial(0);
  startBtn.addEventListener('click', runTest);
})();

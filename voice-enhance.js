(() => {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'voice-enhance.css';
  document.head.appendChild(style);

  const SONGS = {
    'وصلة تراثية': { segments: [[0,25.4],[25.4,42.1],[42.1,64.86]] },
    'ديرتي': { segments: [[0,18.7],[18.7,49.5],[49.5,66.85]] }
  };

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);

  let rawBlob = null;
  let rawUrl = null;
  let enhancedBlob = null;
  let enhancedUrl = null;
  let rawAudio = null;
  let enhancedAudio = null;
  let selectedVersion = 'enhanced';
  let processingToken = 0;
  let soloAudio = null;
  let monitor = null;
  let metrics = null;

  if (originalGetUserMedia) {
    navigator.mediaDevices.getUserMedia = (constraints = {}) => {
      const next = { ...constraints };
      const audio = constraints.audio;
      if (audio) {
        next.audio = {
          ...(typeof audio === 'object' ? audio : {}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        };
      }
      return originalGetUserMedia(next);
    };
  }

  URL.createObjectURL = function(object) {
    const url = originalCreateObjectURL(object);
    if (object instanceof Blob && object.type?.startsWith('audio/') && document.querySelector('[data-coach-root]')) {
      queueMicrotask(() => captureRecording(object, url));
    }
    return url;
  };

  function detail() { return document.querySelector('#songDetail'); }
  function currentTitle() { return detail()?.querySelector('#dialogTitle')?.textContent?.trim() || ''; }
  function activeSegmentIndex() {
    const active = detail()?.querySelector('[data-coach-segment].active');
    return active ? Number(active.dataset.coachSegment) : 0;
  }
  function currentSegment() {
    const song = SONGS[currentTitle()];
    return song?.segments?.[activeSegmentIndex()] || [0, 999];
  }
  function masterVolume() {
    const input = detail()?.querySelector('#coachVolume');
    const value = Number(input?.value ?? 1);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  }

  function resetState() {
    processingToken += 1;
    stopPlayback();
    if (enhancedUrl) originalRevokeObjectURL(enhancedUrl);
    enhancedUrl = null;
    enhancedBlob = null;
    enhancedAudio = null;
    rawBlob = null;
    rawUrl = null;
    rawAudio = null;
    metrics = null;
    selectedVersion = 'enhanced';
    const panel = document.querySelector('#voiceEnhancePanel');
    if (panel) panel.remove();
  }

  function stopPlayback() {
    if (monitor) { clearInterval(monitor); monitor = null; }
    [soloAudio, rawAudio, enhancedAudio].filter(Boolean).forEach(a => {
      try { a.pause(); } catch (_) {}
    });
    soloAudio = null;
    const btn = document.querySelector('#enhanceSoloPlay');
    if (btn) btn.textContent = 'استمع إلى صوتك';
  }

  function ensurePanel() {
    const root = detail()?.querySelector('[data-coach-root]');
    const take = detail()?.querySelector('#coachTakePreview');
    if (!root || !take) return null;
    let panel = document.querySelector('#voiceEnhancePanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'voiceEnhancePanel';
    panel.className = 'enhance-panel';
    panel.innerHTML = `
      <div class="enhance-head">
        <div>
          <span class="eyebrow">تحسين التسجيل</span>
          <h4>معالجة تلقائية خفيفة</h4>
          <p id="enhanceStatus">جارٍ تحليل التسجيل…</p>
        </div>
        <span class="enhance-badge">محلي على جهازك</span>
      </div>
      <div class="enhance-modes" role="group" aria-label="نسخة التسجيل">
        <button type="button" data-enhance-version="enhanced" class="active">المحسّن</button>
        <button type="button" data-enhance-version="raw">الأصلي</button>
      </div>
      <div class="enhance-wave" id="enhanceWave" aria-hidden="true"></div>
      <div class="enhance-actions">
        <button type="button" class="training-action" id="enhanceSoloPlay" disabled>استمع إلى صوتك</button>
        <div class="enhance-balance">
          <label for="enhanceBalance">الموازنة مع الكورال</label>
          <div><span>صوتي</span><input id="enhanceBalance" type="range" min="0" max="100" value="55" step="1"><span>الكورال</span></div>
        </div>
      </div>
      <div class="enhance-chain" aria-label="المعالجة المطبقة">
        <span>خفض ضجيج</span><span>EQ</span><span>ضغط ديناميكي</span><span>موازنة مستوى</span><span>Limiter</span>
      </div>
      <div class="enhance-metrics" id="enhanceMetrics"></div>
      <p class="enhance-note">تبقى النسخة الأصلية متاحة، ولا تُرفع أي نسخة إلى الخادم.</p>
    `;
    take.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function renderBars(values) {
    const wave = document.querySelector('#enhanceWave');
    if (!wave) return;
    wave.innerHTML = values.map(v => `<i style="--h:${Math.max(7, Math.round(v * 100))}%"></i>`).join('');
  }

  async function captureRecording(blob, url) {
    if (!document.querySelector('[data-coach-root]')) return;
    if (blob === enhancedBlob) return;

    rawBlob = blob;
    rawUrl = url;
    rawAudio = new Audio(rawUrl);
    selectedVersion = 'enhanced';
    const panel = ensurePanel();
    if (!panel) return;
    panel.querySelector('#enhanceStatus').textContent = 'جارٍ تحليل التسجيل وتحسينه…';
    panel.querySelector('#enhanceSoloPlay').disabled = true;
    const token = ++processingToken;

    try {
      const result = await enhanceRecording(blob);
      if (token !== processingToken) return;
      enhancedBlob = result.blob;
      enhancedUrl = originalCreateObjectURL(enhancedBlob);
      enhancedAudio = new Audio(enhancedUrl);
      metrics = result.metrics;
      renderBars(result.peaks);
      renderMetrics(metrics);
      panel.querySelector('#enhanceStatus').textContent = 'تم تنظيف التسجيل وموازنة مستواه للكورال.';
      panel.querySelector('#enhanceSoloPlay').disabled = false;
      setVersion('enhanced');
    } catch (error) {
      if (token !== processingToken) return;
      selectedVersion = 'raw';
      const rawPeaks = await blobPeaks(blob);
      renderBars(rawPeaks);
      panel.querySelector('#enhanceStatus').textContent = 'تعذّرت المعالجة المتقدمة؛ النسخة الأصلية متاحة للاستماع.';
      panel.querySelector('#enhanceSoloPlay').disabled = false;
      panel.querySelector('[data-enhance-version="enhanced"]').disabled = true;
      setVersion('raw');
    }
  }

  function renderMetrics(info) {
    const box = document.querySelector('#enhanceMetrics');
    if (!box || !info) return;
    box.innerHTML = `
      <span><small>ضجيج الخلفية</small><strong>${info.noiseLabel}</strong></span>
      <span><small>مستوى التسجيل</small><strong>${info.levelLabel}</strong></span>
      <span><small>التشويه</small><strong>${info.clipped ? 'رُصدت قمم مرتفعة' : 'لا يوجد'}</strong></span>
    `;
  }

  function setVersion(version) {
    selectedVersion = version;
    document.querySelectorAll('[data-enhance-version]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.enhanceVersion === version);
    });
  }

  function selectedAudio() {
    if (selectedVersion === 'enhanced' && enhancedAudio) return enhancedAudio;
    return rawAudio;
  }

  function balanceGains() {
    const value = Number(document.querySelector('#enhanceBalance')?.value ?? 55) / 100;
    return {
      take: Math.min(1, 0.62 + value * 0.38),
      choir: Math.min(1, 1.05 - value * 0.45)
    };
  }

  async function playSolo() {
    const audio = selectedAudio();
    if (!audio) return;
    if (soloAudio && !soloAudio.paused) {
      stopPlayback();
      return;
    }
    stopSiteAudio();
    audio.currentTime = 0;
    audio.volume = masterVolume();
    soloAudio = audio;
    const btn = document.querySelector('#enhanceSoloPlay');
    try {
      await audio.play();
      if (btn) btn.textContent = 'إيقاف';
      audio.onended = () => { if (btn) btn.textContent = 'استمع إلى صوتك'; soloAudio = null; };
    } catch (_) {}
  }

  function stopSiteAudio() {
    detail()?.querySelectorAll('audio').forEach(a => { try { a.pause(); } catch (_) {} });
    stopPlayback();
  }

  async function playWithChoir() {
    const take = selectedAudio();
    const mix = detail()?.querySelector('#coachMixAudio');
    if (!take || !mix) return;
    stopSiteAudio();
    const [start, end] = currentSegment();
    const gains = balanceGains();
    mix.currentTime = start;
    mix.volume = masterVolume() * gains.choir;
    take.currentTime = 0;
    take.volume = masterVolume() * gains.take;
    try {
      await Promise.all([mix.play(), take.play()]);
      monitor = setInterval(() => {
        if (mix.currentTime >= end || mix.ended || take.ended) {
          clearInterval(monitor); monitor = null;
          mix.pause(); take.pause();
          try { take.currentTime = 0; } catch (_) {}
        }
      }, 60);
    } catch (_) {}
  }

  async function enhanceRecording(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx || !Offline) throw new Error('Web Audio unavailable');

    const ctx = new Ctx();
    const bytes = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    const mono = mixToMono(decoded);
    const rawStats = analyseBuffer(mono);
    const cleaned = gateBuffer(mono, rawStats.noiseFloor);

    const offline = new Offline(1, cleaned.length, cleaned.sampleRate);
    const sourceBuffer = offline.createBuffer(1, cleaned.length, cleaned.sampleRate);
    sourceBuffer.copyToChannel(cleaned.data, 0);
    const source = offline.createBufferSource();
    source.buffer = sourceBuffer;

    const high = offline.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 80;
    high.Q.value = 0.7;

    const mud = offline.createBiquadFilter();
    mud.type = 'peaking';
    mud.frequency.value = 260;
    mud.Q.value = 0.9;
    mud.gain.value = -2.2;

    const presence = offline.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3200;
    presence.Q.value = 0.8;
    presence.gain.value = 1.8;

    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = -25;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.18;

    const limiter = offline.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 1;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;

    const dry = offline.createGain();
    dry.gain.value = 0.94;
    const wet = offline.createGain();
    wet.gain.value = 0.06;
    const reverb = offline.createConvolver();
    reverb.buffer = makeImpulse(offline, 0.55, 2.6);

    source.connect(high).connect(mud).connect(presence).connect(compressor);
    compressor.connect(dry).connect(limiter);
    compressor.connect(reverb).connect(wet).connect(limiter);
    limiter.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    normalizeBuffer(rendered, 0.135, 0.9);
    const finalStats = analyseAudioBuffer(rendered);
    const wav = audioBufferToWav(rendered);
    const outBlob = new Blob([wav], { type: 'audio/wav' });
    const peaks = bufferPeaks(rendered, 72);

    try { await ctx.close(); } catch (_) {}

    return {
      blob: outBlob,
      peaks,
      metrics: {
        noiseLabel: rawStats.noiseFloor < 0.008 ? 'منخفض' : rawStats.noiseFloor < 0.025 ? 'متوسط' : 'مرتفع',
        levelLabel: rawStats.rms < 0.035 ? 'منخفض — تم رفعه' : rawStats.rms > 0.23 ? 'مرتفع' : 'جيد',
        clipped: rawStats.peak > 0.985,
        finalRms: finalStats.rms
      }
    };
  }

  function mixToMono(buffer) {
    const length = buffer.length;
    const data = new Float32Array(length);
    const channels = buffer.numberOfChannels;
    for (let c = 0; c < channels; c++) {
      const src = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] += src[i] / channels;
    }
    return { data, length, sampleRate: buffer.sampleRate };
  }

  function analyseBuffer(mono) {
    const data = mono.data;
    let sum = 0, peak = 0;
    const block = Math.max(128, Math.round(mono.sampleRate * 0.02));
    const blocks = [];
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      peak = Math.max(peak, a);
      sum += data[i] * data[i];
    }
    for (let start = 0; start < data.length; start += block) {
      let s = 0, n = 0;
      for (let i = start; i < Math.min(data.length, start + block); i++) { s += data[i] * data[i]; n++; }
      if (n) blocks.push(Math.sqrt(s / n));
    }
    blocks.sort((a,b) => a-b);
    const quietCount = Math.max(1, Math.floor(blocks.length * 0.18));
    const noiseFloor = blocks.slice(0, quietCount).reduce((a,b) => a+b, 0) / quietCount;
    return { rms: Math.sqrt(sum / Math.max(1, data.length)), peak, noiseFloor };
  }

  function gateBuffer(mono, noiseFloor) {
    const src = mono.data;
    const out = new Float32Array(src.length);
    const threshold = Math.max(0.0045, noiseFloor * 2.4);
    const release = Math.exp(-1 / (mono.sampleRate * 0.055));
    const attack = Math.exp(-1 / (mono.sampleRate * 0.008));
    let env = 0, gain = 1;
    for (let i = 0; i < src.length; i++) {
      const a = Math.abs(src[i]);
      env = a > env ? attack * env + (1 - attack) * a : release * env + (1 - release) * a;
      let target = 1;
      if (env < threshold) {
        const ratio = Math.max(0, env / threshold);
        target = 0.16 + 0.84 * ratio * ratio;
      }
      gain += (target - gain) * (target < gain ? 0.012 : 0.08);
      out[i] = src[i] * gain;
    }
    return { data: out, length: mono.length, sampleRate: mono.sampleRate };
  }

  function makeImpulse(ctx, seconds, decay) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const impulse = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = impulse.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
    return impulse;
  }

  function analyseAudioBuffer(buffer) {
    const data = buffer.getChannelData(0);
    let sum = 0, peak = 0;
    for (const sample of data) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
    return { rms: Math.sqrt(sum / Math.max(1, data.length)), peak };
  }

  function normalizeBuffer(buffer, targetRms, ceiling) {
    const data = buffer.getChannelData(0);
    const stats = analyseAudioBuffer(buffer);
    if (!stats.rms || !stats.peak) return;
    const gain = Math.min(targetRms / stats.rms, ceiling / stats.peak, 4.5);
    for (let i = 0; i < data.length; i++) {
      const x = data[i] * gain;
      data[i] = Math.tanh(x * 1.04) / Math.tanh(1.04);
    }
  }

  function bufferPeaks(buffer, bins = 72) {
    const data = buffer.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / bins));
    const values = [];
    for (let i = 0; i < bins; i++) {
      let peak = 0;
      const start = i * size;
      const end = i === bins - 1 ? data.length : Math.min(data.length, start + size);
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(data[j]));
      values.push(peak);
    }
    const max = Math.max(...values, 0.001);
    return values.map(v => Math.pow(v / max, 0.72));
  }

  async function blobPeaks(blob, bins = 72) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const buffer = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
      const peaks = bufferPeaks(buffer, bins);
      try { await ctx.close(); } catch (_) {}
      return peaks;
    } catch (_) { return []; }
  }

  function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = length * blockAlign;
    const array = new ArrayBuffer(44 + dataSize);
    const view = new DataView(array);
    const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < channels; c++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return array;
  }

  document.addEventListener('click', async event => {
    const version = event.target.closest('[data-enhance-version]');
    if (version) {
      if (!version.disabled) setVersion(version.dataset.enhanceVersion);
      return;
    }

    if (event.target.closest('#enhanceSoloPlay')) {
      event.preventDefault();
      await playSolo();
      return;
    }

    const compare = event.target.closest('#coachPlayTake');
    if (compare && (enhancedAudio || rawAudio)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      await playWithChoir();
      return;
    }

    if (event.target.closest('#coachRecord, [data-coach-segment], [data-coach-voice]')) {
      if (!event.target.closest('#coachRecord') || document.querySelector('#voiceEnhancePanel')) resetState();
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target.matches('#coachVolume')) {
      const v = masterVolume();
      [rawAudio, enhancedAudio, soloAudio].filter(Boolean).forEach(a => a.volume = v);
    }
  }, true);

  const dialog = document.querySelector('#songDialog');
  if (dialog) {
    dialog.addEventListener('close', resetState);
    dialog.addEventListener('cancel', resetState);
  }
})();

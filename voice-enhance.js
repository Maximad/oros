(() => {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'voice-enhance.css?v=3';
  document.head.appendChild(style);

  const NativeMediaRecorder = window.MediaRecorder;
  if (!NativeMediaRecorder) return;

  const SONGS = {
    'وصلة تراثية': { segments: [[0,25.4],[25.4,42.1],[42.1,64.86]] },
    'ديرتي': { segments: [[0,18.7],[18.7,49.5],[49.5,66.85]] }
  };

  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);

  let rawUrl = null;
  let enhancedUrl = null;
  let rawAudio = null;
  let enhancedAudio = null;
  let selectedVersion = 'enhanced';
  let soloAudio = null;
  let compareMonitor = null;

  function detail() { return document.querySelector('#songDetail'); }
  function currentTitle() { return detail()?.querySelector('#dialogTitle')?.textContent?.trim() || ''; }
  function activeSegmentIndex() {
    const active = detail()?.querySelector('[data-coach-segment].active');
    return active ? Number(active.dataset.coachSegment) : 0;
  }
  function currentSegment() {
    return SONGS[currentTitle()]?.segments?.[activeSegmentIndex()] || [0, 999];
  }
  function masterVolume() {
    const input = detail()?.querySelector('#coachVolume');
    const value = Number(input?.value ?? 1);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  }
  function average(values) {
    return values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0;
  }
  function normalizeEnvelope(values, bins = 72) {
    if (!values.length) return [];
    const out = [];
    for (let i = 0; i < bins; i++) {
      const from = Math.floor(i * values.length / bins);
      const to = Math.max(from + 1, Math.floor((i + 1) * values.length / bins));
      let peak = 0;
      for (let j = from; j < Math.min(values.length, to); j++) peak = Math.max(peak, values[j]);
      out.push(peak);
    }
    const max = Math.max(...out, 0.001);
    return out.map(v => Math.pow(v / max, 0.72));
  }
  function analyserLevel(analyser, scratch) {
    if (!analyser) return { rms:0, peak:0 };
    analyser.getFloatTimeDomainData(scratch);
    let sum = 0, peak = 0;
    for (let i = 0; i < scratch.length; i++) {
      const v = scratch[i];
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: Math.sqrt(sum / scratch.length), peak };
  }

  // Prefer browser-level suppression before the choir processing chain.
  try {
    const gum = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (gum) {
      navigator.mediaDevices.getUserMedia = (constraints = {}) => {
        const next = { ...constraints };
        if (constraints.audio) {
          next.audio = {
            ...(typeof constraints.audio === 'object' ? constraints.audio : {}),
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false
          };
        }
        return gum(next);
      };
    }
  } catch (_) {}

  function concatFloat32(chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Float32Array(length);
    let offset = 0;
    chunks.forEach(chunk => { out.set(chunk, offset); offset += chunk.length; });
    return out;
  }

  function normalizePcm(data, targetRms = 0.14, ceiling = 0.9) {
    if (!data.length) return data;
    let sum = 0, peak = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
      peak = Math.max(peak, Math.abs(data[i]));
    }
    const rms = Math.sqrt(sum / data.length);
    if (!rms || !peak) return data;
    const gain = Math.min(targetRms / rms, ceiling / peak, 5);
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const x = data[i] * gain;
      out[i] = Math.tanh(x * 1.03) / Math.tanh(1.03);
    }
    return out;
  }

  function pcmToWav(data, sampleRate) {
    const bytesPerSample = 2;
    const dataSize = data.length * bytesPerSample;
    const array = new ArrayBuffer(44 + dataSize);
    const view = new DataView(array);
    const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
    return new Blob([array], { type:'audio/wav' });
  }

  class ChoirMediaRecorder extends EventTarget {
    constructor(stream, options) {
      super();
      this._raw = new NativeMediaRecorder(stream, options);
      this.stream = stream;
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      this._rawChunks = [];
      this._pcmChunks = [];
      this._rawEnvelope = [];
      this._enhancedEnvelope = [];
      this._rawRms = [];
      this._enhancedRms = [];
      this._rawPeak = 0;
      this._enhancedPeak = 0;
      this._capture = false;
      this._meterTimer = null;
      this._ctx = null;
      this._processor = null;
      this._rawAnalyser = null;
      this._enhancedAnalyser = null;
      this._sampleRate = 48000;
      this._enhancementReady = false;

      this._raw.addEventListener('dataavailable', e => {
        if (e.data?.size) this._rawChunks.push(e.data);
        this._emit('dataavailable', e);
      });
      this._raw.addEventListener('error', e => this._emit('error', e));
      this._raw.addEventListener('stop', () => this._finish());

      this._setupLiveEnhancement(stream);
    }

    get state() { return this._raw.state; }
    get mimeType() { return this._raw.mimeType; }

    _emit(type, originalEvent) {
      try { this.dispatchEvent(new Event(type)); } catch (_) {}
      const handler = this[`on${type}`];
      if (typeof handler === 'function') handler.call(this, originalEvent || new Event(type));
    }

    _setupLiveEnhancement(stream) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        this._ctx = ctx;
        this._sampleRate = ctx.sampleRate || 48000;
        ctx.resume?.().catch(() => {});

        const source = ctx.createMediaStreamSource(stream);

        const rawAnalyser = ctx.createAnalyser();
        rawAnalyser.fftSize = 1024;
        const rawMute = ctx.createGain();
        rawMute.gain.value = 0;
        source.connect(rawAnalyser).connect(rawMute).connect(ctx.destination);
        this._rawAnalyser = rawAnalyser;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 85;
        highpass.Q.value = 0.7;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 13500;
        lowpass.Q.value = 0.45;

        const mud = ctx.createBiquadFilter();
        mud.type = 'peaking';
        mud.frequency.value = 260;
        mud.Q.value = 0.9;
        mud.gain.value = -2.4;

        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 3100;
        presence.Q.value = 0.85;
        presence.gain.value = 2.2;

        const air = ctx.createBiquadFilter();
        air.type = 'highshelf';
        air.frequency.value = 7000;
        air.gain.value = 1.2;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -27;
        compressor.knee.value = 20;
        compressor.ratio.value = 3.4;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.2;

        const makeup = ctx.createGain();
        makeup.gain.value = 1.65;

        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -5;
        limiter.knee.value = 1;
        limiter.ratio.value = 18;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.09;

        const enhancedAnalyser = ctx.createAnalyser();
        enhancedAnalyser.fftSize = 1024;
        this._enhancedAnalyser = enhancedAnalyser;

        // ScriptProcessor is intentionally used as a compatibility bridge:
        // it works on mobile Safari where decoding a MediaRecorder blob often fails.
        const processor = ctx.createScriptProcessor ? ctx.createScriptProcessor(2048, 1, 1) : null;
        if (!processor) return;
        this._processor = processor;

        const mute = ctx.createGain();
        mute.gain.value = 0;
        source
          .connect(highpass)
          .connect(lowpass)
          .connect(mud)
          .connect(presence)
          .connect(air)
          .connect(compressor)
          .connect(makeup)
          .connect(limiter)
          .connect(enhancedAnalyser)
          .connect(processor)
          .connect(mute)
          .connect(ctx.destination);

        processor.onaudioprocess = event => {
          if (!this._capture) return;
          const input = event.inputBuffer.getChannelData(0);
          this._pcmChunks.push(new Float32Array(input));
        };
        this._enhancementReady = true;
      } catch (error) {
        console.warn('Óros mobile enhancement unavailable:', error);
        this._enhancementReady = false;
      }
    }

    _startMeter() {
      this._stopMeter();
      const rawScratch = new Float32Array(this._rawAnalyser?.fftSize || 1024);
      const enhancedScratch = new Float32Array(this._enhancedAnalyser?.fftSize || 1024);
      this._meterTimer = setInterval(() => {
        if (this._rawAnalyser) {
          const s = analyserLevel(this._rawAnalyser, rawScratch);
          this._rawEnvelope.push(s.rms);
          this._rawRms.push(s.rms);
          this._rawPeak = Math.max(this._rawPeak, s.peak);
        }
        if (this._enhancedAnalyser) {
          const s = analyserLevel(this._enhancedAnalyser, enhancedScratch);
          this._enhancedEnvelope.push(s.rms);
          this._enhancedRms.push(s.rms);
          this._enhancedPeak = Math.max(this._enhancedPeak, s.peak);
        }
      }, 55);
    }

    _stopMeter() {
      if (this._meterTimer) clearInterval(this._meterTimer);
      this._meterTimer = null;
    }

    start(timeslice) {
      this._rawChunks = [];
      this._pcmChunks = [];
      this._rawEnvelope = [];
      this._enhancedEnvelope = [];
      this._rawRms = [];
      this._enhancedRms = [];
      this._rawPeak = 0;
      this._enhancedPeak = 0;
      this._capture = true;
      this._ctx?.resume?.().catch(() => {});
      this._startMeter();
      this._raw.start(timeslice);
    }

    stop() {
      this._capture = false;
      this._stopMeter();
      if (this._raw.state !== 'inactive') this._raw.stop();
    }

    pause() { if (this._raw.state === 'recording') this._raw.pause(); }
    resume() { if (this._raw.state === 'paused') this._raw.resume(); }
    requestData() { this._raw.requestData(); }

    _finish() {
      const type = this._raw.mimeType || this._rawChunks[0]?.type || 'audio/webm';
      const rawBlob = this._rawChunks.length ? new Blob(this._rawChunks, { type }) : null;
      let enhancedBlob = null;

      if (this._enhancementReady && this._pcmChunks.length) {
        const pcm = normalizePcm(concatFloat32(this._pcmChunks));
        if (pcm.length) enhancedBlob = pcmToWav(pcm, this._sampleRate);
      }

      const metrics = {
        rawRms: average(this._rawRms),
        enhancedRms: average(this._enhancedRms),
        rawPeak: this._rawPeak,
        enhancedPeak: this._enhancedPeak,
        enhancedAvailable: Boolean(enhancedBlob)
      };

      const detail = {
        rawBlob,
        enhancedBlob,
        rawPeaks: normalizeEnvelope(this._rawEnvelope),
        enhancedPeaks: normalizeEnvelope(this._enhancedEnvelope),
        metrics
      };

      window.dispatchEvent(new CustomEvent('oros:recording-ready', { detail }));
      this._emit('stop', new Event('stop'));

      setTimeout(() => {
        try { this._processor && (this._processor.onaudioprocess = null); } catch (_) {}
        try { this._ctx?.close(); } catch (_) {}
      }, 300);
    }
  }

  ChoirMediaRecorder.isTypeSupported = NativeMediaRecorder.isTypeSupported?.bind(NativeMediaRecorder) || (() => true);
  try { window.MediaRecorder = ChoirMediaRecorder; } catch (_) {}

  function stopComparePlayback() {
    if (compareMonitor) { clearInterval(compareMonitor); compareMonitor = null; }
    [soloAudio, rawAudio, enhancedAudio].filter(Boolean).forEach(a => { try { a.pause(); } catch (_) {} });
    soloAudio = null;
    const btn = document.querySelector('#enhanceSoloPlay');
    if (btn) btn.textContent = 'استمع إلى صوتك';
  }

  function clearEnhancement() {
    stopComparePlayback();
    if (rawUrl) nativeRevokeObjectURL(rawUrl);
    if (enhancedUrl) nativeRevokeObjectURL(enhancedUrl);
    rawUrl = enhancedUrl = null;
    rawAudio = enhancedAudio = null;
    selectedVersion = 'enhanced';
    document.querySelector('#voiceEnhancePanel')?.remove();
  }

  function ensurePanel() {
    const take = detail()?.querySelector('#coachTakePreview');
    if (!take) return null;
    let panel = document.querySelector('#voiceEnhancePanel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'voiceEnhancePanel';
    panel.className = 'enhance-panel';
    panel.innerHTML = `
      <div class="enhance-head">
        <div><span class="eyebrow">تحسين التسجيل</span><h4>صوتك بعد المعالجة</h4><p id="enhanceStatus">جارٍ تجهيز النسختين…</p></div>
        <span class="enhance-badge">محلي على جهازك</span>
      </div>
      <div class="enhance-modes" role="group" aria-label="نسخة التسجيل">
        <button type="button" data-enhance-version="enhanced">المحسّن</button>
        <button type="button" data-enhance-version="raw">الأصلي</button>
      </div>
      <div class="enhance-wave" id="enhanceWave" aria-hidden="true"></div>
      <div class="enhance-actions">
        <button type="button" class="training-action" id="enhanceSoloPlay">استمع إلى صوتك</button>
        <div class="enhance-balance"><label for="enhanceBalance">الموازنة مع الكورال</label><div><span>صوتي</span><input id="enhanceBalance" type="range" min="0" max="100" value="60" step="1"><span>الكورال</span></div></div>
      </div>
      <div class="enhance-chain"><span>خفض ضجيج</span><span>EQ</span><span>ضغط ديناميكي</span><span>رفع المستوى</span><span>Limiter</span></div>
      <div class="enhance-metrics" id="enhanceMetrics"></div>
      <p class="enhance-note">تبقى النسخة الأصلية متاحة، ولا يُرفع أي تسجيل إلى الخادم.</p>`;
    take.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function renderWave(values) {
    const wave = document.querySelector('#enhanceWave');
    if (!wave) return;
    wave.innerHTML = values.length
      ? values.map(v => `<i style="--h:${Math.max(7, Math.round(v * 100))}%"></i>`).join('')
      : '<span>لا تتوفر معاينة للموجة.</span>';
  }

  function renderMetrics(metrics) {
    const box = document.querySelector('#enhanceMetrics');
    if (!box) return;
    const rawRms = metrics?.rawRms || 0;
    const noise = rawRms < 0.012 ? 'منخفض' : rawRms < 0.04 ? 'متوسط' : 'مرتفع';
    const level = rawRms < 0.025 ? 'منخفض — تم رفعه' : rawRms > 0.2 ? 'مرتفع' : 'جيد';
    const clipped = (metrics?.rawPeak || 0) > 0.985;
    box.innerHTML = `<span><small>الخلفية</small><strong>${noise}</strong></span><span><small>المستوى</small><strong>${level}</strong></span><span><small>التشويه</small><strong>${clipped ? 'قمم مرتفعة' : 'لا يوجد'}</strong></span>`;
  }

  function setVersion(version) {
    if (version === 'enhanced' && !enhancedAudio) version = 'raw';
    selectedVersion = version;
    document.querySelectorAll('[data-enhance-version]').forEach(btn => btn.classList.toggle('active', btn.dataset.enhanceVersion === version));
    renderWave(version === 'enhanced' ? (window.__OROS_ENHANCED_PEAKS || []) : (window.__OROS_RAW_PEAKS || []));
  }

  function selectedAudio() {
    return selectedVersion === 'enhanced' && enhancedAudio ? enhancedAudio : rawAudio;
  }

  window.addEventListener('oros:recording-ready', event => {
    clearEnhancement();
    const { rawBlob, enhancedBlob, rawPeaks = [], enhancedPeaks = [], metrics } = event.detail || {};
    if (rawBlob) {
      rawUrl = nativeCreateObjectURL(rawBlob);
      rawAudio = new Audio(rawUrl);
    }
    if (enhancedBlob) {
      enhancedUrl = nativeCreateObjectURL(enhancedBlob);
      enhancedAudio = new Audio(enhancedUrl);
    }
    window.__OROS_RAW_PEAKS = rawPeaks;
    window.__OROS_ENHANCED_PEAKS = enhancedPeaks;

    const panel = ensurePanel();
    if (!panel) return;
    const status = panel.querySelector('#enhanceStatus');
    const enhancedButton = panel.querySelector('[data-enhance-version="enhanced"]');
    if (enhancedAudio) {
      status.textContent = 'تم إنشاء نسخة محسّنة منفصلة عن التسجيل الأصلي.';
      enhancedButton.disabled = false;
      setVersion('enhanced');
    } else {
      status.textContent = 'تعذّر إنشاء النسخة المحسّنة على هذا الجهاز؛ التسجيل الأصلي متاح.';
      enhancedButton.disabled = true;
      setVersion('raw');
    }
    renderMetrics(metrics);
  });

  function balanceGains() {
    const x = Number(document.querySelector('#enhanceBalance')?.value ?? 60) / 100;
    return { take: Math.min(1, 0.55 + x * 0.45), choir: Math.max(0.28, 1 - x * 0.62) };
  }

  function stopSiteAudio() {
    detail()?.querySelectorAll('audio').forEach(a => { try { a.pause(); } catch (_) {} });
    stopComparePlayback();
  }

  async function playSolo() {
    const audio = selectedAudio();
    if (!audio) return;
    if (soloAudio && !soloAudio.paused) { stopComparePlayback(); return; }
    stopSiteAudio();
    audio.currentTime = 0;
    audio.volume = masterVolume();
    soloAudio = audio;
    const button = document.querySelector('#enhanceSoloPlay');
    try {
      await audio.play();
      if (button) button.textContent = 'إيقاف';
      audio.onended = () => { if (button) button.textContent = 'استمع إلى صوتك'; soloAudio = null; };
    } catch (error) {
      document.querySelector('#enhanceStatus').textContent = 'تعذّر تشغيل هذه النسخة على المتصفح.';
    }
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
      compareMonitor = setInterval(() => {
        if (mix.currentTime >= end || mix.ended || take.ended) {
          clearInterval(compareMonitor); compareMonitor = null;
          mix.pause(); take.pause();
          try { take.currentTime = 0; } catch (_) {}
        }
      }, 60);
    } catch (_) {}
  }

  document.addEventListener('click', async event => {
    const version = event.target.closest('[data-enhance-version]');
    if (version) { if (!version.disabled) setVersion(version.dataset.enhanceVersion); return; }
    if (event.target.closest('#enhanceSoloPlay')) { event.preventDefault(); await playSolo(); return; }

    const compare = event.target.closest('#coachPlayTake');
    if (compare && (enhancedAudio || rawAudio)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      await playWithChoir();
      return;
    }

    if (event.target.closest('[data-coach-segment], [data-coach-voice]')) clearEnhancement();
  }, true);

  const dialog = document.querySelector('#songDialog');
  if (dialog) {
    dialog.addEventListener('close', clearEnhancement);
    dialog.addEventListener('cancel', clearEnhancement);
  }
})();
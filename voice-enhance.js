(() => {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'voice-enhance.css?v=4';
  document.head.appendChild(style);

  const VOICES = [
    { key:'soprano', file:'soprano.mp3' },
    { key:'alto', file:'alto.mp3' },
    { key:'konter', file:'konter.mp3' },
    { key:'tenor', file:'tenor.mp3' },
    { key:'bass', file:'bass.mp3' },
    { key:'dubl', file:'dubl.mp3' }
  ];

  const SONGS = {
    'وصلة تراثية': { base:'https://aswat.habaq.online/assets/audio/wasla-turathiya/', segments:[[0,25.4],[25.4,42.1],[42.1,64.86]] },
    'ديرتي': { base:'https://aswat.habaq.online/assets/audio/Deerty/', segments:[[0,18.7],[18.7,49.5],[49.5,66.85]] }
  };

  const PRESETS = {
    guide:   { user:120, choir:28, guide:18 },
    balance: { user:130, choir:35, guide:6 },
    test:    { user:145, choir:45, guide:0 }
  };

  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const nativeGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);

  let rawUrl = null;
  let rawAudio = null;
  let backingAudios = [];
  let monitor = null;
  let userCtx = null;
  let userSource = null;
  let userGain = null;
  let userLimiter = null;

  if (nativeGetUserMedia) {
    navigator.mediaDevices.getUserMedia = (constraints = {}) => {
      const next = { ...constraints };
      if (constraints.audio) {
        next.audio = {
          ...(typeof constraints.audio === 'object' ? constraints.audio : {}),
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        };
      }
      return nativeGetUserMedia(next);
    };
  }

  URL.createObjectURL = function(object) {
    const url = nativeCreateObjectURL(object);
    if (object instanceof Blob && object.type?.startsWith('audio/') && document.querySelector('[data-coach-root]')) {
      queueMicrotask(() => captureTake(url));
    }
    return url;
  };

  const detail = () => document.querySelector('#songDetail');
  const title = () => detail()?.querySelector('#dialogTitle')?.textContent?.trim() || '';
  const song = () => SONGS[title()];
  const selectedVoiceIndex = () => {
    const active = detail()?.querySelector('[data-coach-voice].active');
    return active ? Number(active.dataset.coachVoice) : null;
  };
  const segmentIndex = () => {
    const active = detail()?.querySelector('[data-coach-segment].active');
    return active ? Number(active.dataset.coachSegment) : 0;
  };
  const currentSegment = () => song()?.segments?.[segmentIndex()] || [0, 999];
  const masterVolume = () => {
    const value = Number(detail()?.querySelector('#coachVolume')?.value ?? 1);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  };

  function stopEverything(reset = false) {
    if (monitor) { clearInterval(monitor); monitor = null; }
    detail()?.querySelectorAll('audio').forEach(a => { try { a.pause(); } catch (_) {} });
    backingAudios.forEach(a => { try { a.pause(); if (reset) a.currentTime = 0; } catch (_) {} });
    backingAudios = [];
    if (rawAudio) { try { rawAudio.pause(); if (reset) rawAudio.currentTime = 0; } catch (_) {} }
    const solo = document.querySelector('#safeSoloPlay');
    if (solo) solo.textContent = 'اسمع صوتي وحده';
  }

  function resetTake() {
    stopEverything(true);
    if (rawUrl) nativeRevokeObjectURL(rawUrl);
    rawUrl = null;
    rawAudio = null;
    userSource = null;
    userGain = null;
    userLimiter = null;
    if (userCtx) { try { userCtx.close(); } catch (_) {} }
    userCtx = null;
    const panel = document.querySelector('#safeBalancePanel');
    if (panel) panel.remove();
  }

  function captureTake(url) {
    rawUrl = url;
    rawAudio = new Audio(rawUrl);
    rawAudio.preload = 'metadata';
    ensurePanel();
  }

  function ensurePanel() {
    const takePreview = detail()?.querySelector('#coachTakePreview');
    if (!takePreview || !rawAudio) return null;
    let panel = document.querySelector('#safeBalancePanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'safeBalancePanel';
    panel.className = 'safe-balance-panel';
    panel.innerHTML = `
      <div class="safe-head">
        <div>
          <span class="eyebrow">بعد التسجيل</span>
          <h4>ضع صوتك داخل الكورال</h4>
          <p>استمع إلى موقع صوتك، ثم اضبط العلاقة بينك وبين المجموعة بحسب ما تحتاجه في التدريب.</p>
        </div>
        <span class="safe-badge">موازنة مباشرة</span>
      </div>
      <div class="safe-presets" role="group" aria-label="أوضاع الاستماع">
        <button type="button" data-safe-preset="guide">مع مرجع</button>
        <button type="button" data-safe-preset="balance" class="active">داخل الكورال</button>
        <button type="button" data-safe-preset="test">اختبار</button>
      </div>
      <div class="safe-controls">
        <label><span>صوتي</span><input id="safeUserGain" type="range" min="100" max="180" value="130" step="5"><output id="safeUserGainValue">130%</output></label>
        <label><span>المجموعة</span><input id="safeChoirLevel" type="range" min="10" max="60" value="35" step="5"><output id="safeChoirLevelValue">35%</output></label>
        <label><span>الصوت المرجعي</span><input id="safeGuideLevel" type="range" min="0" max="30" value="6" step="2"><output id="safeGuideLevelValue">6%</output></label>
      </div>
      <div class="safe-actions">
        <button type="button" class="training-action" id="safeSoloPlay">اسمع صوتي وحده</button>
        <p>ابدأ بمرجع واضح عند الحاجة، ثم خفّضه تدريجياً حتى تسمع مكانك داخل المجموعة.</p>
      </div>`;
    takePreview.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function userGainValue() { return Number(document.querySelector('#safeUserGain')?.value ?? 130) / 100; }
  function choirLevelValue() { return Number(document.querySelector('#safeChoirLevel')?.value ?? 35) / 100; }
  function guideLevelValue() { return Number(document.querySelector('#safeGuideLevel')?.value ?? 6) / 100; }

  function setControl(id, value) {
    const input = document.querySelector(`#${id}`);
    const output = document.querySelector(`#${id}Value`);
    if (input) input.value = String(value);
    if (output) output.textContent = `${value}%`;
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    setControl('safeUserGain', preset.user);
    setControl('safeChoirLevel', preset.choir);
    setControl('safeGuideLevel', preset.guide);
    document.querySelectorAll('[data-safe-preset]').forEach(button => {
      button.classList.toggle('active', button.dataset.safePreset === name);
    });
    if (userGain) userGain.gain.value = userGainValue();
  }

  function clearPresetState() {
    document.querySelectorAll('[data-safe-preset]').forEach(button => button.classList.remove('active'));
  }

  function ensureUserGainGraph() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !rawAudio) return false;
    if (!userCtx) userCtx = new Ctx();
    if (!userSource) {
      userSource = userCtx.createMediaElementSource(rawAudio);
      userGain = userCtx.createGain();
      userLimiter = userCtx.createDynamicsCompressor();
      userLimiter.threshold.value = -3;
      userLimiter.knee.value = 1;
      userLimiter.ratio.value = 12;
      userLimiter.attack.value = 0.003;
      userLimiter.release.value = 0.08;
      userSource.connect(userGain).connect(userLimiter).connect(userCtx.destination);
    }
    return true;
  }

  async function playSolo() {
    if (!rawAudio) return;
    if (!rawAudio.paused) { stopEverything(false); return; }
    stopEverything(false);
    rawAudio.currentTime = 0;
    rawAudio.volume = masterVolume();
    const button = document.querySelector('#safeSoloPlay');
    try {
      if (ensureUserGainGraph()) {
        if (userCtx.state === 'suspended') await userCtx.resume();
        userGain.gain.value = userGainValue();
      }
      await rawAudio.play();
      if (button) button.textContent = 'إيقاف';
      rawAudio.onended = () => { if (button) button.textContent = 'اسمع صوتي وحده'; };
    } catch (_) {}
  }

  function waitMetadata(audio) {
    if (audio.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('audio load failed')); };
      const cleanup = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail); };
      audio.addEventListener('loadedmetadata', ok, { once:true });
      audio.addEventListener('error', fail, { once:true });
      audio.load();
    });
  }

  async function playComparison() {
    if (!rawAudio || selectedVoiceIndex() === null || !song()) return;
    stopEverything(false);
    const selected = selectedVoiceIndex();
    const [start, end] = currentSegment();
    const choir = choirLevelValue();
    const guide = guideLevelValue();

    backingAudios = VOICES.map((voice, index) => {
      const audio = new Audio(song().base + voice.file);
      audio.preload = 'metadata';
      audio.volume = masterVolume() * (index === selected ? choir * guide : choir);
      return audio;
    });

    try {
      await Promise.all(backingAudios.map(waitMetadata));
      backingAudios.forEach(audio => { audio.currentTime = start; });
      rawAudio.currentTime = 0;
      rawAudio.volume = masterVolume();
      if (ensureUserGainGraph()) {
        if (userCtx.state === 'suspended') await userCtx.resume();
        userGain.gain.value = userGainValue();
      }
      await Promise.all([...backingAudios.map(audio => audio.play()), rawAudio.play()]);
      monitor = setInterval(() => {
        const ref = backingAudios[0];
        if (!ref || ref.currentTime >= end || ref.ended || rawAudio.ended) {
          stopEverything(false);
          try { rawAudio.currentTime = 0; } catch (_) {}
        }
      }, 60);
    } catch (_) {
      stopEverything(false);
      const status = detail()?.querySelector('#coachStatus');
      if (status) status.textContent = 'لم يبدأ الاستماع. جرّب مرة أخرى.';
    }
  }

  document.addEventListener('click', async event => {
    const preset = event.target.closest('[data-safe-preset]');
    if (preset) {
      applyPreset(preset.dataset.safePreset);
      return;
    }
    if (event.target.closest('#safeSoloPlay')) {
      event.preventDefault();
      await playSolo();
      return;
    }
    if (event.target.closest('#coachPlayTake') && rawAudio) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      await playComparison();
      return;
    }
    if (event.target.closest('[data-coach-segment], [data-coach-voice]')) resetTake();
    if (event.target.closest('#coachRecord') && document.querySelector('#safeBalancePanel')) resetTake();
  }, true);

  document.addEventListener('input', event => {
    const outputMap = { safeUserGain:'safeUserGainValue', safeChoirLevel:'safeChoirLevelValue', safeGuideLevel:'safeGuideLevelValue' };
    const outputId = outputMap[event.target.id];
    if (outputId) {
      const output = document.querySelector(`#${outputId}`);
      if (output) output.textContent = `${event.target.value}%`;
      clearPresetState();
      if (event.target.id === 'safeUserGain' && userGain) userGain.gain.value = userGainValue();
    }
  }, true);

  const dialog = document.querySelector('#songDialog');
  dialog?.addEventListener('close', resetTake);
  dialog?.addEventListener('cancel', resetTake);
})();

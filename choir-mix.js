(() => {
  const VOICES = [
    { key: 'soprano', name: 'سوبرانو', file: 'soprano.mp3', desc: 'أعلى طبقة في التوزيع؛ صوت مشرق وواضح يعلو فوق بقية الأصوات.' },
    { key: 'alto', name: 'ألتو', file: 'alto.mp3', desc: 'طبقة متوسطة دافئة تربط الأصوات العليا بالطبقات الوسطى.' },
    { key: 'konter', name: 'كاونتر تينور', file: 'konter.mp3', desc: 'صوت رجالي مرتفع في مجال قريب من الألتو، يضيف لوناً خفيفاً للهارموني.' },
    { key: 'tenor', name: 'تينور', file: 'tenor.mp3', desc: 'أعلى الطبقات الرجالية التقليدية، ويقع في المجال المتوسط والعالي.' },
    { key: 'bass', name: 'باس', file: 'bass.mp3', desc: 'طبقة رجالية منخفضة تمنح التوزيع العمق والثبات.' },
    { key: 'dubl', name: 'دوبل باس', file: 'dubl.mp3', desc: 'أعمق طبقة في هذا التوزيع، وتثبّت القاعدة المنخفضة للهارموني.' }
  ];

  const SONGS = {
    'وصلة تراثية': {
      id: 'wasla-turathiya',
      duration: 64.86,
      base: 'https://aswat.habaq.online/assets/audio/wasla-turathiya/',
      segments: [
        { label: 'المقطع الأول', start: 0, end: 25.4, lyrics: null },
        { label: 'المقطع الثاني', start: 25.4, end: 42.1, lyrics: null },
        { label: 'المقطع الثالث', start: 42.1, end: 64.86, lyrics: null }
      ]
    },
    'ديرتي': {
      id: 'deerty',
      duration: 66.85,
      base: 'https://aswat.habaq.online/assets/audio/Deerty/',
      segments: [
        { label: 'المقطع الأول', start: 0, end: 18.7, lyrics: null },
        { label: 'المقطع الثاني', start: 18.7, end: 49.5, lyrics: null },
        { label: 'المقطع الثالث', start: 49.5, end: 66.85, lyrics: null }
      ]
    }
  };

  const detail = document.querySelector('#songDetail');
  const dialog = document.querySelector('#songDialog');
  if (!detail || !dialog) return;

  const mixStyle = document.createElement('link');
  mixStyle.rel = 'stylesheet';
  mixStyle.href = 'voice-enhance.css?v=stable1';
  document.head.appendChild(mixStyle);

  let song = null;
  let voiceIndex = null;
  let segmentIndex = 0;
  let volume = 1;
  let mode = null;
  let monitor = null;

  let recorder = null;
  let micStream = null;
  let chunks = [];
  let takeUrl = null;
  let takeAudio = null;

  let meterContext = null;
  let meterTimer = null;
  let meterValues = [];

  let compareBacking = null;
  let compareGuide = null;
  let comparisonUsingMinusOne = false;

  const RECORDING_GUIDE_MAX = 0.18;

  const $ = selector => detail.querySelector(selector);
  const $$ = selector => [...detail.querySelectorAll(selector)];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fmt = seconds => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function selectedVoice() {
    return voiceIndex === null ? null : VOICES[voiceIndex];
  }

  function segment() {
    return song.segments[segmentIndex];
  }

  function peaks(key) {
    return window.OROS_WAVEFORMS?.[song?.id]?.[key] || [];
  }

  function waveMarkup(values, id) {
    if (!values?.length) return `<div class="coach-wave empty" id="${id}"></div>`;
    return `<div class="coach-wave" id="${id}" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${values.map(value => `<i style="--h:${Math.max(8, Math.round(value * 100))}%"></i>`).join('')}</div>`;
  }

  function setWave(id, ratio) {
    const wave = $(`#${id}`);
    if (!wave) return;
    const bars = [...wave.children];
    const safeRatio = clamp(Number(ratio) || 0, 0, 1);
    const count = Math.round(safeRatio * bars.length);
    bars.forEach((bar, index) => bar.classList.toggle('played', index < count));
    wave.setAttribute('aria-valuenow', String(Math.round(safeRatio * 100)));
  }

  function normalizeMeter(values, bins = 64) {
    if (!values.length) return [];
    const result = [];
    for (let i = 0; i < bins; i++) {
      const from = Math.floor(i * values.length / bins);
      const to = Math.max(from + 1, Math.floor((i + 1) * values.length / bins));
      let peak = 0;
      for (let j = from; j < Math.min(values.length, to); j++) peak = Math.max(peak, values[j]);
      result.push(peak);
    }
    const max = Math.max(...result, 0.001);
    return result.map(value => Math.pow(value / max, 0.72));
  }

  function voiceAudio() { return $('#coachVoiceAudio'); }
  function mixAudio() { return $('#coachMixAudio'); }

  function clearMonitor() {
    if (monitor) clearInterval(monitor);
    monitor = null;
  }

  function stopComparison(reset = false) {
    [compareBacking, compareGuide].filter(Boolean).forEach(audio => {
      try {
        audio.pause();
        if (reset) audio.currentTime = 0;
      } catch (_) {}
    });
    compareBacking = null;
    compareGuide = null;
    comparisonUsingMinusOne = false;
  }

  function resetButtons() {
    const voiceButton = $('#coachVoicePlay');
    if (voiceButton) {
      voiceButton.textContent = '▶';
      voiceButton.classList.remove('is-playing');
    }
    const mixButton = $('#coachMixPlay');
    if (mixButton) {
      const icon = mixButton.querySelector('.player-icon');
      const label = mixButton.querySelector('.all-label');
      if (icon) icon.textContent = '▶';
      if (label) label.textContent = 'استمع إلى الكورال كاملاً';
      mixButton.classList.remove('is-playing');
    }
    const segmentButton = $('#coachSegmentListen');
    if (segmentButton) segmentButton.textContent = 'اسمع المقطع';
    const compareButton = $('#coachPlayTake');
    if (compareButton) compareButton.textContent = 'اسمعني داخل الكورال';
  }

  function stopAll(reset = false) {
    clearMonitor();
    stopComparison(reset);
    [voiceAudio(), mixAudio(), takeAudio].filter(Boolean).forEach(audio => {
      try {
        audio.pause();
        if (reset) audio.currentTime = 0;
      } catch (_) {}
    });
    mode = null;
    resetButtons();
  }

  function monitorUntil(referenceAudio, end, done) {
    clearMonitor();
    monitor = setInterval(() => {
      if (!referenceAudio || referenceAudio.currentTime >= end || referenceAudio.ended) {
        clearMonitor();
        try { referenceAudio?.pause(); } catch (_) {}
        mode = null;
        resetButtons();
        if (done) done();
      }
    }, 80);
  }

  function applyVolume() {
    const value = clamp(volume, 0, 1);
    [voiceAudio(), mixAudio()].filter(Boolean).forEach(audio => { audio.volume = value; });
    if (takeAudio && mode !== 'compare') takeAudio.volume = value;
    const output = $('#coachVolumeValue');
    if (output) output.textContent = `${Math.round(value * 100)}%`;
  }

  function stopMic() {
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  function stopMeter() {
    if (meterTimer) clearInterval(meterTimer);
    meterTimer = null;
    if (meterContext) {
      try { meterContext.close(); } catch (_) {}
    }
    meterContext = null;
  }

  function startMeter(stream) {
    stopMeter();
    meterValues = [];
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      meterContext = new AudioContextClass();
      const source = meterContext.createMediaStreamSource(stream);
      const analyser = meterContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      meterTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        meterValues.push(Math.sqrt(sum / data.length));
      }, 70);
    } catch (_) {
      stopMeter();
    }
  }

  function clearTake() {
    stopAll(false);
    stopMeter();
    stopMic();
    if (takeUrl) URL.revokeObjectURL(takeUrl);
    takeUrl = null;
    takeAudio = null;
    chunks = [];
    meterValues = [];
    const preview = $('#coachTakePreview');
    if (preview) preview.hidden = true;
    const panel = $('#coachMixPanel');
    if (panel) panel.hidden = true;
    const compareButton = $('#coachPlayTake');
    if (compareButton) compareButton.disabled = true;
  }

  function updateSummary() {
    const summary = $('#coachSummary');
    if (!summary) return;
    const currentSegment = segment();
    summary.innerHTML = `<span><strong>الصوت:</strong> ${selectedVoice()?.name || 'لم يُحدّد بعد'}</span><span><strong>المقطع:</strong> ${currentSegment.label}</span><span>${fmt(currentSegment.start)} – ${fmt(currentSegment.end)}</span>`;
  }

  function updateSegment() {
    stopAll(false);
    clearTake();
    $$('[data-coach-segment]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.coachSegment) === segmentIndex);
    });
    const currentSegment = segment();
    const info = $('#coachSegmentInfo');
    if (info) info.innerHTML = `<strong>${currentSegment.label}</strong><span>${fmt(currentSegment.start)} – ${fmt(currentSegment.end)}</span>`;
    const lyrics = $('#coachLyrics');
    if (lyrics) {
      lyrics.textContent = currentSegment.lyrics || 'الكلمات قيد الإضافة.';
      lyrics.classList.toggle('is-empty', !currentSegment.lyrics);
    }
    const next = $('#coachNext');
    if (next) next.disabled = segmentIndex >= song.segments.length - 1;
    const status = $('#coachStatus');
    if (status) status.textContent = voiceIndex === null ? 'اختر طبقتك أولاً.' : 'اسمع المقطع، ثم جرّب غناء دورك.';
    updateSummary();
  }

  function selectVoice(index) {
    voiceIndex = index;
    stopAll(false);
    clearTake();
    $$('[data-coach-voice]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.coachVoice) === index);
    });
    const voice = VOICES[index];
    const audio = voiceAudio();
    audio.src = song.base + voice.file;
    audio.load();
    audio.volume = volume;
    $('#coachVoiceName').textContent = voice.name;
    $('#coachVoiceDesc').textContent = voice.desc;
    $('#coachWaveWrap').innerHTML = waveMarkup(peaks(voice.key), 'coachVoiceWave');
    $('#coachVoiceTime').textContent = `0:00 / ${fmt(song.duration)}`;
    $('#coachVoicePlay').disabled = false;
    $('#coachSegmentListen').disabled = false;
    $('#coachRecord').disabled = false;
    const status = $('#coachStatus');
    if (status) status.textContent = 'اسمع دور الطبقة، ثم انتقل إلى المقطع الذي تريد تدريبه.';
    updateSummary();
  }

  async function playVoiceFull() {
    if (voiceIndex === null) return;
    const audio = voiceAudio();
    if (mode === 'voice-full' && !audio.paused) {
      stopAll(false);
      return;
    }
    stopAll(false);
    audio.volume = volume;
    try {
      await audio.play();
      mode = 'voice-full';
      $('#coachVoicePlay').textContent = '■';
      $('#coachVoicePlay').classList.add('is-playing');
    } catch (_) {}
  }

  async function playMixFull() {
    const audio = mixAudio();
    if (!audio) return;
    if (mode === 'mix-full' && !audio.paused) {
      stopAll(false);
      return;
    }
    stopAll(false);
    audio.currentTime = 0;
    audio.volume = volume;
    try {
      await audio.play();
      mode = 'mix-full';
      $('#coachMixPlay').classList.add('is-playing');
      $('#coachMixPlay .player-icon').textContent = '■';
      $('#coachMixPlay .all-label').textContent = 'إيقاف الكورال';
    } catch (_) {
      const status = $('#coachStatus');
      if (status) status.textContent = 'لم يبدأ التشغيل. جرّب مرة أخرى.';
    }
  }

  async function playVoiceSegment(forRecording = false, done = null) {
    if (voiceIndex === null) return;
    const audio = voiceAudio();
    const currentSegment = segment();
    stopAll(false);
    audio.currentTime = currentSegment.start;
    audio.volume = forRecording ? Math.min(volume * 0.22, RECORDING_GUIDE_MAX) : volume;
    try {
      await audio.play();
      mode = forRecording ? 'recording' : 'segment';
      if (!forRecording) $('#coachSegmentListen').textContent = 'إيقاف المقطع';
      monitorUntil(audio, currentSegment.end, done);
    } catch (_) {}
  }

  let beepContext = null;
  function ensureBeepContext() {
    if (!beepContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) beepContext = new AudioContextClass();
    }
    return beepContext;
  }

  function beep(frequency) {
    const context = ensureBeepContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.025;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  }

  async function countIn() {
    const box = $('#coachCount');
    if (!box) return;
    box.hidden = false;
    for (const number of [3, 2, 1]) {
      box.textContent = number;
      beep(number === 1 ? 980 : 720);
      await delay(650);
    }
    box.textContent = 'ابدأ';
    beep(1120);
    await delay(260);
    box.hidden = true;
  }

  async function getMic() {
    const preferred = {
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    try {
      return await navigator.mediaDevices.getUserMedia(preferred);
    } catch (_) {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }

  function recorderOptions() {
    if (!window.MediaRecorder?.isTypeSupported) return undefined;
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
    const type = types.find(candidate => MediaRecorder.isTypeSupported(candidate));
    return type ? { mimeType: type } : undefined;
  }

  async function recordTake() {
    if (voiceIndex === null) return;
    if (recorder?.state === 'recording') {
      stopAll(false);
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      const status = $('#coachStatus');
      if (status) status.textContent = 'التسجيل غير متاح على هذا الجهاز.';
      return;
    }

    clearTake();
    stopAll(false);
    const recordButton = $('#coachRecord');
    const status = $('#coachStatus');

    try {
      micStream = await getMic();
      const options = recorderOptions();
      recorder = options ? new MediaRecorder(micStream, options) : new MediaRecorder(micStream);
      chunks = [];
      recorder.ondataavailable = event => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stopMeter();
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type });
        takeUrl = URL.createObjectURL(blob);
        takeAudio = new Audio(takeUrl);
        takeAudio.preload = 'metadata';
        takeAudio.volume = volume;
        takeAudio.ontimeupdate = () => setWave('coachRecordedWave', takeAudio.duration ? takeAudio.currentTime / takeAudio.duration : 0);

        const waveform = normalizeMeter(meterValues);
        $('#coachTakeWave').innerHTML = waveMarkup(waveform, 'coachRecordedWave');
        $('#coachTakePreview').hidden = false;
        $('#coachMixPanel').hidden = false;
        $('#coachPlayTake').disabled = false;
        recordButton.textContent = 'سجّل من جديد';
        recordButton.classList.remove('recording');
        if (status) status.textContent = 'المحاولة جاهزة. اسمع صوتك وحده أو ضعه داخل الكورال.';
        stopMic();
      };

      recordButton.classList.add('recording');
      recordButton.textContent = 'استعد…';
      if (status) status.textContent = 'استعد للدخول مع بداية المقطع.';
      await countIn();

      startMeter(micStream);
      recorder.start();
      recordButton.textContent = 'إيقاف التسجيل';
      if (status) status.textContent = `التسجيل جارٍ · ${selectedVoice().name}`;
      await playVoiceSegment(true, () => {
        if (recorder?.state === 'recording') recorder.stop();
      });
    } catch (_) {
      stopMeter();
      stopMic();
      recordButton.textContent = 'سجّل صوتك';
      recordButton.classList.remove('recording');
      if (status) status.textContent = 'تعذّر بدء التسجيل. تحقّق من إذن الميكروفون.';
    }
  }

  function waitForAudio(audio, timeout = 2500) {
    if (audio.readyState >= 1) return Promise.resolve(true);
    return new Promise(resolve => {
      let finished = false;
      const done = value => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('error', onError);
        resolve(value);
      };
      const onReady = () => done(true);
      const onError = () => done(false);
      const timer = setTimeout(() => done(false), timeout);
      audio.addEventListener('loadedmetadata', onReady, { once: true });
      audio.addEventListener('canplay', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.load();
    });
  }

  function mixLevels() {
    return {
      user: Number($('#mixUserLevel')?.value ?? 100) / 100,
      group: Number($('#mixGroupLevel')?.value ?? 40) / 100,
      guide: Number($('#mixGuideLevel')?.value ?? 0) / 100
    };
  }

  async function buildBacking() {
    const voice = selectedVoice();
    if (!voice) return null;
    const minusOne = new Audio(`${song.base}backing-${voice.key}.mp3`);
    minusOne.preload = 'metadata';
    const available = await waitForAudio(minusOne);
    if (available) {
      comparisonUsingMinusOne = true;
      return minusOne;
    }
    comparisonUsingMinusOne = false;
    const fallback = new Audio(`${song.base}all-voices.mp3`);
    fallback.preload = 'metadata';
    return fallback;
  }

  async function playTakeSolo() {
    if (!takeAudio) return;
    if (mode === 'take-solo' && !takeAudio.paused) {
      stopAll(false);
      return;
    }
    stopAll(false);
    takeAudio.currentTime = 0;
    takeAudio.volume = volume;
    try {
      await takeAudio.play();
      mode = 'take-solo';
      const button = $('#coachTakeSolo');
      if (button) button.textContent = 'إيقاف';
      takeAudio.onended = () => {
        mode = null;
        const current = $('#coachTakeSolo');
        if (current) current.textContent = 'اسمع صوتي وحده';
        setWave('coachRecordedWave', 0);
      };
    } catch (_) {}
  }

  async function playComparison() {
    if (!takeAudio || voiceIndex === null) return;
    if (mode === 'compare') {
      stopAll(false);
      return;
    }

    stopAll(false);
    const currentSegment = segment();
    const levels = mixLevels();
    const status = $('#coachStatus');

    try {
      compareBacking = await buildBacking();
      if (!compareBacking) throw new Error('no backing');
      const backingReady = await waitForAudio(compareBacking);
      if (!backingReady) throw new Error('backing unavailable');

      compareBacking.currentTime = currentSegment.start;
      compareBacking.volume = clamp(volume * levels.group, 0, 1);

      if (levels.guide > 0) {
        compareGuide = new Audio(song.base + selectedVoice().file);
        compareGuide.preload = 'metadata';
        const guideReady = await waitForAudio(compareGuide);
        if (guideReady) {
          compareGuide.currentTime = currentSegment.start;
          compareGuide.volume = clamp(volume * levels.guide, 0, 1);
        } else {
          compareGuide = null;
        }
      }

      takeAudio.currentTime = 0;
      takeAudio.volume = clamp(volume * levels.user, 0, 1);

      const plays = [compareBacking.play(), takeAudio.play()];
      if (compareGuide) plays.push(compareGuide.play());
      await Promise.all(plays);

      mode = 'compare';
      $('#coachPlayTake').textContent = 'إيقاف';
      if (status) status.textContent = comparisonUsingMinusOne ? 'اسمع موقع صوتك بين بقية الطبقات.' : 'اسمع المحاولة مع المجموعة.';

      clearMonitor();
      monitor = setInterval(() => {
        if (!compareBacking || compareBacking.currentTime >= currentSegment.end || compareBacking.ended || takeAudio.ended) {
          stopAll(false);
          try { takeAudio.currentTime = 0; } catch (_) {}
          setWave('coachRecordedWave', 0);
        }
      }, 80);
    } catch (_) {
      stopAll(false);
      if (status) status.textContent = 'لم يبدأ الاستماع. جرّب مرة أخرى.';
    }
  }

  function updateMixOutputs() {
    const map = [
      ['mixUserLevel', 'mixUserValue'],
      ['mixGroupLevel', 'mixGroupValue'],
      ['mixGuideLevel', 'mixGuideValue']
    ];
    map.forEach(([inputId, outputId]) => {
      const input = $(`#${inputId}`);
      const output = $(`#${outputId}`);
      if (input && output) output.textContent = `${input.value}%`;
    });
  }

  function build(title) {
    song = SONGS[title];
    if (!song) return;
    voiceIndex = null;
    segmentIndex = 0;
    clearTake();

    detail.innerHTML = `<div class="coach-root" data-coach-root>
      <header class="coach-head">
        <div><p class="eyebrow">مساحة تدريب</p><h2 id="dialogTitle">${title}</h2><p class="song-meta">6 مسارات صوتية · ${fmt(song.duration)}</p></div>
        <div class="coach-volume"><label>مستوى الصوت</label><input id="coachVolume" type="range" min="0" max="1" step=".01" value="${volume}"><output id="coachVolumeValue">${Math.round(volume * 100)}%</output></div>
      </header>

      <section class="coach-choose">
        <div class="coach-section-head">
          <div><p class="eyebrow">الخطوة الأولى</p><h3>اختر طبقتك</h3><p>استمع إلى الطبقات، واختر المجال الأقرب إلى صوتك.</p></div>
          <button id="coachMixPlay" class="all-voices-button" type="button"><span class="player-icon">▶</span><span class="all-label">استمع إلى الكورال كاملاً</span></button>
        </div>
        <div class="coach-voice-buttons">${VOICES.map((voice, index) => `<button type="button" data-coach-voice="${index}">${voice.name}</button>`).join('')}</div>
        <div class="coach-selected">
          <button id="coachVoicePlay" class="player-button" type="button" disabled>▶</button>
          <div><strong id="coachVoiceName">اختر طبقتك</strong><p id="coachVoiceDesc">سيظهر هنا دور الطبقة ومسارها الصوتي.</p></div>
          <div class="coach-timeline"><div id="coachWaveWrap"><div class="coach-wave empty"></div></div><span id="coachVoiceTime">0:00 / ${fmt(song.duration)}</span></div>
        </div>
        <audio id="coachVoiceAudio" preload="metadata"></audio>
        <audio id="coachMixAudio" preload="metadata" src="${song.base}all-voices.mp3"></audio>
      </section>

      <section class="coach-practice">
        <div class="coach-section-head">
          <div><p class="eyebrow">الخطوة الثانية</p><h3>درّب المقطع</h3><p>ثبّت دورك على جزء قصير، ثم جرّب وضع صوتك مكانه داخل المجموعة.</p></div>
          <div class="coach-segments">${song.segments.map((item, index) => `<button type="button" data-coach-segment="${index}" class="${index === 0 ? 'active' : ''}">${item.label}</button>`).join('')}</div>
        </div>
        <div id="coachSummary" class="coach-summary"></div>
        <div class="coach-lyrics"><span>الكلمات</span><p id="coachLyrics" class="is-empty">الكلمات قيد الإضافة.</p></div>
        <div id="coachSegmentInfo" class="segment-info"></div>

        <div class="coach-flow">
          <article><span>01</span><strong>اسمع الدور</strong><p>اسمع الجملة كاملة وركّز على الدخول والنهاية.</p><button id="coachSegmentListen" class="training-action" type="button" disabled>اسمع المقطع</button></article>
          <article class="coach-record"><span>02</span><strong>غنِّه</strong><p>خذ العدّ، ثم ادخل مع بداية المقطع واستمر حتى نهايته.</p><button id="coachRecord" class="training-action primary" type="button" disabled>سجّل صوتك</button><div id="coachCount" class="coach-count" hidden></div></article>
          <article><span>03</span><strong>اسمع موقعك</strong><p>ضع تسجيلك داخل التوزيع وقارن حضورك مع بقية الطبقات.</p><button id="coachPlayTake" class="training-action" type="button" disabled>اسمعني داخل الكورال</button></article>
        </div>

        <div id="coachTakePreview" class="coach-take" hidden>
          <div><span class="eyebrow">تسجيلك</span><strong>المحاولة الحالية</strong></div>
          <div id="coachTakeWave"></div>
          <button id="coachTakeSolo" class="training-action" type="button">اسمع صوتي وحده</button>
        </div>

        <section id="coachMixPanel" class="safe-balance-panel" hidden>
          <div class="safe-head"><div><span class="eyebrow">مكان صوتك</span><h4>داخل التوزيع</h4><p>ابدأ بصوتك واضحاً، ثم غيّر الموازنة حتى تسمع كيف يستقر الدور مع بقية الأصوات.</p></div></div>
          <div class="safe-controls">
            <label><span>صوتي</span><input id="mixUserLevel" type="range" min="60" max="100" value="100" step="5"><output id="mixUserValue">100%</output></label>
            <label><span>بقية الأصوات</span><input id="mixGroupLevel" type="range" min="10" max="70" value="40" step="5"><output id="mixGroupValue">40%</output></label>
            <label><span>الدور المرجعي</span><input id="mixGuideLevel" type="range" min="0" max="30" value="0" step="5"><output id="mixGuideValue">0%</output></label>
          </div>
          <p class="enhance-note">يمكن إبقاء الدور المرجعي صامتاً، أو رفعه قليلاً عند الحاجة إلى دليل.</p>
        </section>

        <div class="coach-bottom"><p id="coachStatus">اختر طبقتك أولاً.</p><button id="coachNext" class="training-action" type="button">المقطع التالي</button></div>
        <p class="segment-note">لأفضل تجربة، استخدم سماعات إن كانت متاحة. يبقى التسجيل على جهازك خلال الجلسة.</p>
      </section>
    </div>`;

    const voice = voiceAudio();
    const mix = mixAudio();
    mix.volume = volume;
    voice.ontimeupdate = () => {
      const duration = Number.isFinite(voice.duration) ? voice.duration : song.duration;
      setWave('coachVoiceWave', duration ? voice.currentTime / duration : 0);
      const time = $('#coachVoiceTime');
      if (time) time.textContent = `${fmt(voice.currentTime)} / ${fmt(duration)}`;
    };
    voice.onended = () => { mode = null; resetButtons(); };
    mix.onended = () => { mode = null; resetButtons(); };
    updateSegment();
  }

  detail.addEventListener('click', async event => {
    const voiceButton = event.target.closest('[data-coach-voice]');
    if (voiceButton) {
      selectVoice(Number(voiceButton.dataset.coachVoice));
      return;
    }

    const segmentButton = event.target.closest('[data-coach-segment]');
    if (segmentButton) {
      segmentIndex = Number(segmentButton.dataset.coachSegment);
      updateSegment();
      return;
    }

    if (event.target.closest('#coachVoicePlay')) { await playVoiceFull(); return; }
    if (event.target.closest('#coachMixPlay')) { await playMixFull(); return; }
    if (event.target.closest('#coachSegmentListen')) {
      if (mode === 'segment') stopAll(false);
      else await playVoiceSegment(false);
      return;
    }
    if (event.target.closest('#coachRecord')) { await recordTake(); return; }
    if (event.target.closest('#coachTakeSolo')) { await playTakeSolo(); return; }
    if (event.target.closest('#coachPlayTake')) { await playComparison(); return; }
    if (event.target.closest('#coachNext') && segmentIndex < song.segments.length - 1) {
      segmentIndex += 1;
      updateSegment();
    }
  });

  detail.addEventListener('input', event => {
    if (event.target.matches('#coachVolume')) {
      volume = Number(event.target.value);
      applyVolume();
      return;
    }
    if (event.target.matches('#mixUserLevel, #mixGroupLevel, #mixGuideLevel')) {
      updateMixOutputs();
    }
  });

  detail.addEventListener('pointerdown', event => {
    const wave = event.target.closest('#coachVoiceWave');
    if (!wave || voiceIndex === null) return;
    const rect = wave.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const audio = voiceAudio();
    const duration = Number.isFinite(audio.duration) ? audio.duration : song.duration;
    audio.currentTime = duration * ratio;
  });

  dialog.addEventListener('close', () => {
    stopAll(true);
    stopMeter();
    stopMic();
    clearTake();
  });
  dialog.addEventListener('cancel', () => {
    stopAll(true);
    stopMeter();
    stopMic();
    clearTake();
  });

  const observer = new MutationObserver(() => {
    if (detail.querySelector('[data-coach-root]')) return;
    const title = detail.querySelector('#dialogTitle')?.textContent?.trim();
    if (title && SONGS[title]) build(title);
  });
  observer.observe(detail, { childList: true, subtree: true });

  const waveformScript = document.createElement('script');
  waveformScript.src = 'waveforms.js?v=stable1';
  document.head.appendChild(waveformScript);
})();
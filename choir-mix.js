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
      duration: 64.896,
      trimStart: 2.40,
      trimEnd: 64.68,
      base: 'https://aswat.habaq.online/assets/audio/wasla-turathiya/',
      segments: [
        { label: 'المقطع الأول', start: 0, end: 25.4, lyrics: null },
        { label: 'المقطع الثاني', start: 25.4, end: 42.1, lyrics: null },
        { label: 'المقطع الثالث', start: 42.1, end: 64.896, lyrics: null }
      ]
    },
    'ديرتي': {
      id: 'deerty',
      duration: 66.873,
      trimStart: 3.60,
      trimEnd: 65.80,
      base: 'https://aswat.habaq.online/assets/audio/Deerty/',
      segments: [
        { label: 'المقطع الأول', start: 0, end: 18.7, lyrics: null },
        { label: 'المقطع الثاني', start: 18.7, end: 49.5, lyrics: null },
        { label: 'المقطع الثالث', start: 49.5, end: 66.873, lyrics: null }
      ]
    }
  };

  const detail = document.querySelector('#songDetail');
  const dialog = document.querySelector('#songDialog');
  if (!detail || !dialog) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'voice-enhance.css?v=wizard1';
  document.head.appendChild(css);

  let song = null;
  let voiceIndex = null;
  let segmentIndex = 0;
  let stepIndex = 1;
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
  let beepContext = null;

  const RECORDING_GUIDE_MAX = 0.18;
  const $ = selector => detail.querySelector(selector);
  const $$ = selector => [...detail.querySelectorAll(selector)];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const fmt = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;

  function selectedVoice() { return voiceIndex === null ? null : VOICES[voiceIndex]; }
  function segment() { return song.segments[segmentIndex]; }
  function songStart() { return song?.trimStart ?? 0; }
  function songEnd() { return song?.trimEnd ?? song?.duration ?? 0; }
  function songLength() { return Math.max(0, songEnd() - songStart()); }
  function segmentStart(item = segment()) { return Math.max(item.start, songStart()); }
  function segmentEnd(item = segment()) { return Math.min(item.end, songEnd()); }
  function segmentLength(item = segment()) { return Math.max(0, segmentEnd(item) - segmentStart(item)); }
  function relativeTime(absolute) { return Math.max(0, absolute - songStart()); }
  function peaks(key) { return window.OROS_WAVEFORMS?.[song?.id]?.[key] || []; }

  function slicePeaks(values, start, end, bins = 72) {
    if (!values?.length || !song?.duration) return [];
    const from = clamp(Math.floor((start / song.duration) * values.length), 0, values.length - 1);
    const to = clamp(Math.ceil((end / song.duration) * values.length), from + 1, values.length);
    const source = values.slice(from, to);
    if (!source.length) return [];
    const result = [];
    for (let i = 0; i < bins; i++) {
      const a = Math.floor((i * source.length) / bins);
      const b = Math.max(a + 1, Math.floor(((i + 1) * source.length) / bins));
      let peak = 0;
      for (let j = a; j < Math.min(source.length, b); j++) peak = Math.max(peak, source[j]);
      result.push(peak);
    }
    const max = Math.max(...result, 0.001);
    return result.map(value => Math.pow(value / max, 0.82));
  }

  function trimmedVoicePeaks() {
    const voice = selectedVoice();
    return voice ? slicePeaks(peaks(voice.key), songStart(), songEnd(), 96) : [];
  }

  function currentSegmentPeaks() {
    const voice = selectedVoice();
    return voice ? slicePeaks(peaks(voice.key), segmentStart(), segmentEnd(), 64) : [];
  }

  function waveMarkup(values, id, extraClass = '') {
    if (!values?.length) return `<div class="coach-wave empty ${extraClass}" id="${id}"></div>`;
    return `<div class="coach-wave ${extraClass}" id="${id}" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${values.map(value => `<i style="--h:${Math.max(8, Math.round(value * 100))}%"></i>`).join('')}</div>`;
  }

  function setWave(id, ratio) {
    const wave = $(`#${id}`);
    if (!wave) return;
    const bars = [...wave.children];
    const safe = clamp(Number(ratio) || 0, 0, 1);
    const count = Math.round(safe * bars.length);
    bars.forEach((bar, index) => bar.classList.toggle('played', index < count));
    wave.setAttribute('aria-valuenow', String(Math.round(safe * 100)));
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

  function resetButtons() {
    const voiceButton = $('#coachVoicePlay');
    if (voiceButton) { voiceButton.textContent = '▶'; voiceButton.classList.remove('is-playing'); }
    const mixButton = $('#coachMixPlay');
    if (mixButton) {
      mixButton.classList.remove('is-playing');
      const icon = mixButton.querySelector('.player-icon');
      const label = mixButton.querySelector('.all-label');
      if (icon) icon.textContent = '▶';
      if (label) label.textContent = 'استمع إلى الكورال كاملاً';
    }
    const segmentButton = $('#coachSegmentListen');
    if (segmentButton) segmentButton.textContent = 'اسمع المقطع';
    const compareButton = $('#coachPlayTake');
    if (compareButton) compareButton.textContent = 'اسمعني داخل الكورال';
    const takeSolo = $('#coachTakeSolo');
    if (takeSolo) takeSolo.textContent = 'اسمع صوتي وحده';
  }

  function stopComparison(reset = false) {
    [compareBacking, compareGuide].filter(Boolean).forEach(audio => {
      try { audio.pause(); if (reset) audio.currentTime = songStart(); } catch (_) {}
    });
    compareBacking = null;
    compareGuide = null;
    comparisonUsingMinusOne = false;
  }

  function stopAll(reset = false) {
    clearMonitor();
    stopComparison(reset);
    [voiceAudio(), mixAudio(), takeAudio].filter(Boolean).forEach(audio => {
      try {
        audio.pause();
        if (reset) audio.currentTime = audio === takeAudio ? 0 : songStart();
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
    }, 60);
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
    if (meterContext) { try { meterContext.close(); } catch (_) {} }
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
    } catch (_) { stopMeter(); }
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

  function renderVoiceWave() {
    const wrap = $('#coachWaveWrap');
    if (wrap) wrap.innerHTML = waveMarkup(trimmedVoicePeaks(), 'coachVoiceWave');
  }

  function renderSegmentWaves() {
    const values = currentSegmentPeaks();
    const training = $('#coachSegmentWaveWrap');
    const recording = $('#coachRecordWaveWrap');
    if (training) training.innerHTML = waveMarkup(values, 'coachSegmentWave', 'segment-wave');
    if (recording) recording.innerHTML = waveMarkup(values, 'coachRecordWave', 'record-wave');
    const duration = fmt(segmentLength());
    const trainingTime = $('#coachSegmentWaveTime');
    const recordTime = $('#coachRecordWaveTime');
    if (trainingTime) trainingTime.textContent = `0:00 / ${duration}`;
    if (recordTime) recordTime.textContent = `0:00 / ${duration}`;
  }

  function updateContext() {
    const current = segment();
    const voiceName = selectedVoice()?.name || 'لم يُحدّد بعد';
    const range = `${fmt(relativeTime(segmentStart(current)))} – ${fmt(relativeTime(segmentEnd(current)))}`;
    ['coachSummary', 'coachRecordSummary'].forEach(id => {
      const node = $(`#${id}`);
      if (node) node.innerHTML = `<span><strong>الصوت:</strong> ${voiceName}</span><span><strong>المقطع:</strong> ${current.label}</span><span>${range}</span>`;
    });
    ['coachSegmentInfo', 'coachRecordInfo'].forEach(id => {
      const node = $(`#${id}`);
      if (node) node.innerHTML = `<strong>${current.label}</strong><span>${range}</span>`;
    });
    ['coachLyrics', 'coachRecordLyrics'].forEach(id => {
      const node = $(`#${id}`);
      if (!node) return;
      node.textContent = current.lyrics || 'الكلمات قيد الإضافة.';
      node.classList.toggle('is-empty', !current.lyrics);
    });
    renderSegmentWaves();
  }

  function updateSegment() {
    stopAll(false);
    clearTake();
    $$('[data-coach-segment]').forEach(button => button.classList.toggle('active', Number(button.dataset.coachSegment) === segmentIndex));
    const nextSegment = $('#coachNextSegment');
    if (nextSegment) nextSegment.disabled = segmentIndex >= song.segments.length - 1;
    const status = $('#coachStatus');
    if (status) status.textContent = voiceIndex === null ? 'اختر طبقتك أولاً.' : 'جاهز للتسجيل.';
    updateContext();
  }

  function updateStepAvailability() {
    $$('[data-coach-step]').forEach(button => {
      const target = Number(button.dataset.coachStep);
      button.disabled = target > 1 && voiceIndex === null;
      button.classList.toggle('active', target === stepIndex);
      button.classList.toggle('complete', target < stepIndex && (target === 1 ? voiceIndex !== null : true));
      button.setAttribute('aria-current', target === stepIndex ? 'step' : 'false');
    });
    const nextVoice = $('#coachVoiceNext');
    if (nextVoice) nextVoice.disabled = voiceIndex === null;
    const nextRecord = $('#coachTrainingNext');
    if (nextRecord) nextRecord.disabled = voiceIndex === null;
  }

  function showStep(step, scroll = true) {
    if (step > 1 && voiceIndex === null) return;
    stepIndex = clamp(step, 1, 3);
    stopAll(false);
    $$('[data-step-panel]').forEach(panel => {
      panel.hidden = Number(panel.dataset.stepPanel) !== stepIndex;
    });
    updateStepAvailability();
    if (stepIndex === 2 || stepIndex === 3) updateContext();
    if (scroll) detail.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  function selectVoice(index) {
    voiceIndex = index;
    stopAll(false);
    clearTake();
    $$('[data-coach-voice]').forEach(button => button.classList.toggle('active', Number(button.dataset.coachVoice) === index));
    const voice = VOICES[index];
    const audio = voiceAudio();
    audio.src = song.base + voice.file;
    audio.load();
    audio.volume = volume;
    $('#coachVoiceName').textContent = voice.name;
    $('#coachVoiceDesc').textContent = voice.desc;
    $('#coachVoiceTime').textContent = `0:00 / ${fmt(songLength())}`;
    $('#coachVoicePlay').disabled = false;
    $('#coachSegmentListen').disabled = false;
    $('#coachRecord').disabled = false;
    renderVoiceWave();
    updateContext();
    updateStepAvailability();
  }

  function waitForAudio(audio, timeout = 3000) {
    if (audio.readyState >= 2) return Promise.resolve(true);
    return new Promise(resolve => {
      let finished = false;
      const done = value => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        audio.removeEventListener('canplay', ready);
        audio.removeEventListener('loadeddata', ready);
        audio.removeEventListener('error', fail);
        resolve(value);
      };
      const ready = () => done(true);
      const fail = () => done(false);
      const timer = setTimeout(() => done(audio.readyState >= 1), timeout);
      audio.addEventListener('canplay', ready, { once: true });
      audio.addEventListener('loadeddata', ready, { once: true });
      audio.addEventListener('error', fail, { once: true });
      audio.load();
    });
  }

  async function seekReady(audio, time, timeout = 1200) {
    const ready = await waitForAudio(audio);
    if (!ready) return false;
    if (Math.abs(audio.currentTime - time) < 0.035) return true;
    return new Promise(resolve => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        audio.removeEventListener('seeked', done);
        resolve(true);
      };
      const timer = setTimeout(done, timeout);
      audio.addEventListener('seeked', done, { once: true });
      try { audio.currentTime = time; } catch (_) { done(); }
    });
  }

  async function playVoiceFull() {
    if (voiceIndex === null) return;
    const audio = voiceAudio();
    if (mode === 'voice-full' && !audio.paused) { stopAll(false); return; }
    stopAll(false);
    await seekReady(audio, songStart());
    audio.volume = volume;
    try {
      await audio.play();
      mode = 'voice-full';
      $('#coachVoicePlay').textContent = '■';
      $('#coachVoicePlay').classList.add('is-playing');
      monitorUntil(audio, songEnd());
    } catch (_) {}
  }

  async function playMixFull() {
    const audio = mixAudio();
    if (!audio) return;
    if (mode === 'mix-full' && !audio.paused) { stopAll(false); return; }
    stopAll(false);
    await seekReady(audio, songStart());
    audio.volume = volume;
    try {
      await audio.play();
      mode = 'mix-full';
      $('#coachMixPlay').classList.add('is-playing');
      $('#coachMixPlay .player-icon').textContent = '■';
      $('#coachMixPlay .all-label').textContent = 'إيقاف الكورال';
      monitorUntil(audio, songEnd());
    } catch (_) {}
  }

  async function prepareVoiceSegment(forRecording) {
    if (voiceIndex === null) return false;
    const audio = voiceAudio();
    audio.pause();
    const ready = await seekReady(audio, segmentStart());
    audio.volume = forRecording ? Math.min(volume * 0.22, RECORDING_GUIDE_MAX) : volume;
    return ready;
  }

  async function startPreparedVoiceSegment(forRecording = false, done = null) {
    const audio = voiceAudio();
    try {
      await audio.play();
      mode = forRecording ? 'recording' : 'segment';
      if (!forRecording) $('#coachSegmentListen').textContent = 'إيقاف المقطع';
      monitorUntil(audio, segmentEnd(), done);
      return true;
    } catch (_) { return false; }
  }

  async function playVoiceSegment(forRecording = false, done = null) {
    if (voiceIndex === null) return;
    stopAll(false);
    const ready = await prepareVoiceSegment(forRecording);
    if (!ready) return;
    await startPreparedVoiceSegment(forRecording, done);
  }

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
    await delay(120);
    box.hidden = true;
  }

  async function getMic() {
    const preferred = { audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    try { return await navigator.mediaDevices.getUserMedia(preferred); }
    catch (_) { return navigator.mediaDevices.getUserMedia({ audio: true }); }
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
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stopMeter();
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type });
        takeUrl = URL.createObjectURL(blob);
        takeAudio = new Audio(takeUrl);
        takeAudio.preload = 'metadata';
        takeAudio.volume = volume;
        takeAudio.ontimeupdate = () => setWave('coachRecordedWave', takeAudio.duration ? takeAudio.currentTime / takeAudio.duration : 0);
        $('#coachTakeWave').innerHTML = waveMarkup(normalizeMeter(meterValues), 'coachRecordedWave', 'recorded-wave');
        $('#coachTakePreview').hidden = false;
        $('#coachMixPanel').hidden = false;
        $('#coachPlayTake').disabled = false;
        recordButton.textContent = 'سجّل من جديد';
        recordButton.classList.remove('recording');
        if (status) status.textContent = 'المحاولة جاهزة.';
        stopMic();
      };

      recordButton.classList.add('recording');
      recordButton.textContent = 'استعد…';
      if (status) status.textContent = 'استعد للدخول.';

      const prepared = await prepareVoiceSegment(true);
      if (!prepared) throw new Error('guide unavailable');
      await countIn();

      startMeter(micStream);
      recorder.start();
      recordButton.textContent = 'إيقاف التسجيل';
      if (status) status.textContent = `التسجيل جارٍ · ${selectedVoice().name}`;
      const started = await startPreparedVoiceSegment(true, () => {
        if (recorder?.state === 'recording') recorder.stop();
      });
      if (!started && recorder?.state === 'recording') recorder.stop();
    } catch (_) {
      stopMeter();
      stopMic();
      recordButton.textContent = 'سجّل صوتك';
      recordButton.classList.remove('recording');
      if (status) status.textContent = 'تعذّر بدء التسجيل. تحقّق من إذن الميكروفون.';
    }
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
    if (await waitForAudio(minusOne)) {
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
    if (mode === 'take-solo' && !takeAudio.paused) { stopAll(false); return; }
    stopAll(false);
    takeAudio.currentTime = 0;
    takeAudio.volume = volume;
    try {
      await takeAudio.play();
      mode = 'take-solo';
      $('#coachTakeSolo').textContent = 'إيقاف';
      takeAudio.onended = () => {
        mode = null;
        $('#coachTakeSolo').textContent = 'اسمع صوتي وحده';
        setWave('coachRecordedWave', 0);
      };
    } catch (_) {}
  }

  async function playComparison() {
    if (!takeAudio || voiceIndex === null) return;
    if (mode === 'compare') { stopAll(false); return; }
    stopAll(false);
    const levels = mixLevels();
    const status = $('#coachStatus');

    try {
      compareBacking = await buildBacking();
      if (!compareBacking || !(await waitForAudio(compareBacking))) throw new Error('backing unavailable');
      await seekReady(compareBacking, segmentStart());
      compareBacking.volume = clamp(volume * levels.group, 0, 1);

      if (levels.guide > 0) {
        compareGuide = new Audio(song.base + selectedVoice().file);
        compareGuide.preload = 'metadata';
        if (await waitForAudio(compareGuide)) {
          await seekReady(compareGuide, segmentStart());
          compareGuide.volume = clamp(volume * levels.guide, 0, 1);
        } else compareGuide = null;
      }

      takeAudio.currentTime = 0;
      takeAudio.volume = clamp(volume * levels.user, 0, 1);
      const plays = [compareBacking.play(), takeAudio.play()];
      if (compareGuide) plays.push(compareGuide.play());
      await Promise.all(plays);

      mode = 'compare';
      $('#coachPlayTake').textContent = 'إيقاف';
      if (status) status.textContent = comparisonUsingMinusOne ? 'استمع إلى موقع صوتك بين بقية الطبقات.' : 'استمع إلى المحاولة مع المجموعة.';
      clearMonitor();
      monitor = setInterval(() => {
        if (!compareBacking || compareBacking.currentTime >= segmentEnd() || compareBacking.ended || takeAudio.ended) {
          stopAll(false);
          try { takeAudio.currentTime = 0; } catch (_) {}
          setWave('coachRecordedWave', 0);
        }
      }, 60);
    } catch (_) {
      stopAll(false);
      if (status) status.textContent = 'لم يبدأ الاستماع. جرّب مرة أخرى.';
    }
  }

  function updateMixOutputs() {
    [['mixUserLevel','mixUserValue'],['mixGroupLevel','mixGroupValue'],['mixGuideLevel','mixGuideValue']].forEach(([inputId, outputId]) => {
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
    stepIndex = 1;
    clearTake();

    detail.innerHTML = `<div class="coach-root coach-wizard" data-coach-root>
      <header class="coach-head coach-wizard-head">
        <div><p class="eyebrow">مساحة تدريب</p><h2 id="dialogTitle">${title}</h2><p class="song-meta">6 مسارات صوتية · ${fmt(songLength())}</p></div>
        <div class="coach-volume"><label>مستوى الصوت</label><input id="coachVolume" type="range" min="0" max="1" step=".01" value="${volume}"><output id="coachVolumeValue">${Math.round(volume * 100)}%</output></div>
      </header>

      <nav class="coach-stepper" aria-label="مراحل التدريب">
        <button type="button" data-coach-step="1" class="active"><span>01</span><strong>اختيار الطبقة</strong></button>
        <button type="button" data-coach-step="2" disabled><span>02</span><strong>التدريب</strong></button>
        <button type="button" data-coach-step="3" disabled><span>03</span><strong>التسجيل</strong></button>
      </nav>

      <section class="coach-step-panel coach-choose" data-step-panel="1">
        <div class="coach-page-intro">
          <div><p class="eyebrow">01 · اعثر على دورك</p><h3>اختر طبقتك</h3><p>جرّب المسارات واحداً واحداً، واستقر على المجال الأقرب إلى صوتك.</p></div>
          <button id="coachMixPlay" class="all-voices-button" type="button"><span class="player-icon">▶</span><span class="all-label">استمع إلى الكورال كاملاً</span></button>
        </div>
        <div class="coach-voice-buttons">${VOICES.map((voice,index)=>`<button type="button" data-coach-voice="${index}">${voice.name}</button>`).join('')}</div>
        <div class="coach-selected coach-selected-focus">
          <button id="coachVoicePlay" class="player-button" type="button" disabled>▶</button>
          <div><strong id="coachVoiceName">اختر طبقتك</strong><p id="coachVoiceDesc">سيظهر هنا دور الطبقة ومسارها الصوتي.</p></div>
          <div class="coach-timeline"><div id="coachWaveWrap"><div class="coach-wave empty"></div></div><span id="coachVoiceTime">0:00 / ${fmt(songLength())}</span></div>
        </div>
        <div class="coach-step-nav single-next"><span></span><button id="coachVoiceNext" class="training-action primary coach-next-action" type="button" disabled>متابعة إلى التدريب ←</button></div>
      </section>

      <section class="coach-step-panel coach-practice coach-training-page" data-step-panel="2" hidden>
        <div class="coach-page-intro">
          <div><p class="eyebrow">02 · ثبّت الدور</p><h3>درّب المقطع</h3><p>اختر جزءاً قصيراً، واسمع دخولك وخروجك قبل الانتقال إلى التسجيل.</p></div>
          <div class="coach-segments">${song.segments.map((item,index)=>`<button type="button" data-coach-segment="${index}" class="${index===0?'active':''}">${item.label}</button>`).join('')}</div>
        </div>
        <div id="coachSummary" class="coach-summary"></div>
        <div class="coach-lyrics"><span>الكلمات</span><p id="coachLyrics" class="is-empty">الكلمات قيد الإضافة.</p></div>
        <div class="coach-segment-stage">
          <div class="segment-stage-head"><div id="coachSegmentInfo" class="segment-info"></div><span>مسار الدور</span></div>
          <div class="coach-segment-timeline"><div id="coachSegmentWaveWrap"></div><span id="coachSegmentWaveTime">0:00</span></div>
          <button id="coachSegmentListen" class="training-action primary" type="button" disabled>اسمع المقطع</button>
        </div>
        <div class="coach-step-nav"><button class="training-action" type="button" data-go-step="1">→ اختيار الطبقة</button><div class="coach-nav-group"><button id="coachNextSegment" class="training-action" type="button">المقطع التالي</button><button id="coachTrainingNext" class="training-action primary coach-next-action" type="button" disabled>متابعة إلى التسجيل ←</button></div></div>
      </section>

      <section class="coach-step-panel coach-practice coach-record-page" data-step-panel="3" hidden>
        <div class="coach-page-intro record-intro">
          <div><p class="eyebrow">03 · سجّل دورك</p><h3>غنِّ المقطع</h3><p>خذ العدّ، ثم ادخل مباشرة مع بداية المسار.</p></div>
          <button class="training-action" type="button" data-go-step="2">تغيير المقطع</button>
        </div>
        <div id="coachRecordSummary" class="coach-summary"></div>
        <div class="coach-lyrics compact-lyrics"><span>الكلمات</span><p id="coachRecordLyrics" class="is-empty">الكلمات قيد الإضافة.</p></div>

        <div class="coach-record-stage">
          <div class="record-stage-top"><div><span class="eyebrow">المسار</span><div id="coachRecordInfo" class="segment-info"></div></div><span class="record-ready">جاهز</span></div>
          <div class="coach-record-timeline"><div id="coachRecordWaveWrap"></div><span id="coachRecordWaveTime">0:00</span></div>
          <div class="record-action-row">
            <button id="coachRecord" class="training-action primary record-main-button" type="button" disabled>سجّل صوتك</button>
            <p id="coachStatus">جاهز للتسجيل.</p>
          </div>
          <div id="coachCount" class="coach-count" hidden></div>
        </div>

        <div id="coachTakePreview" class="coach-take coach-take-result" hidden>
          <div><span class="eyebrow">تسجيلك</span><strong>المحاولة الحالية</strong></div>
          <div id="coachTakeWave"></div>
          <div class="take-actions"><button id="coachTakeSolo" class="training-action" type="button">اسمع صوتي وحده</button><button id="coachPlayTake" class="training-action primary" type="button" disabled>اسمعني داخل الكورال</button></div>
        </div>

        <section id="coachMixPanel" class="safe-balance-panel" hidden>
          <div class="safe-head"><div><span class="eyebrow">مكان صوتك</span><h4>داخل التوزيع</h4><p>اضبط حضور صوتك والمجموعة، وارفع الدور المرجعي فقط عندما تحتاج إليه.</p></div></div>
          <div class="safe-controls"><label><span>صوتي</span><input id="mixUserLevel" type="range" min="60" max="100" value="100" step="5"><output id="mixUserValue">100%</output></label><label><span>بقية الأصوات</span><input id="mixGroupLevel" type="range" min="10" max="70" value="40" step="5"><output id="mixGroupValue">40%</output></label><label><span>الدور المرجعي</span><input id="mixGuideLevel" type="range" min="0" max="30" value="0" step="5"><output id="mixGuideValue">0%</output></label></div>
        </section>

        <div class="coach-step-nav record-bottom-nav"><button class="training-action" type="button" data-go-step="2">→ العودة إلى التدريب</button><p class="segment-note">يبقى التسجيل على جهازك خلال الجلسة.</p></div>
      </section>

      <audio id="coachVoiceAudio" preload="auto"></audio>
      <audio id="coachMixAudio" preload="auto" src="${song.base}all-voices.mp3"></audio>
    </div>`;

    const voice = voiceAudio();
    const mix = mixAudio();
    mix.volume = volume;
    voice.ontimeupdate = () => {
      const position = clamp(relativeTime(voice.currentTime), 0, songLength());
      setWave('coachVoiceWave', songLength() ? position / songLength() : 0);
      const voiceTime = $('#coachVoiceTime');
      if (voiceTime) voiceTime.textContent = `${fmt(position)} / ${fmt(songLength())}`;

      const segPosition = clamp(voice.currentTime - segmentStart(), 0, segmentLength());
      const segRatio = segmentLength() ? segPosition / segmentLength() : 0;
      setWave('coachSegmentWave', segRatio);
      setWave('coachRecordWave', segRatio);
      const segmentTime = $('#coachSegmentWaveTime');
      const recordTime = $('#coachRecordWaveTime');
      const display = `${fmt(segPosition)} / ${fmt(segmentLength())}`;
      if (segmentTime) segmentTime.textContent = display;
      if (recordTime) recordTime.textContent = display;
    };
    voice.onended = () => { mode = null; resetButtons(); };
    mix.onended = () => { mode = null; resetButtons(); };
    updateContext();
    updateStepAvailability();
    showStep(1, false);
  }

  detail.addEventListener('click', async event => {
    const stepButton = event.target.closest('[data-coach-step]');
    if (stepButton) { showStep(Number(stepButton.dataset.coachStep)); return; }
    const goStep = event.target.closest('[data-go-step]');
    if (goStep) { showStep(Number(goStep.dataset.goStep)); return; }
    if (event.target.closest('#coachVoiceNext')) { showStep(2); return; }
    if (event.target.closest('#coachTrainingNext')) { showStep(3); return; }

    const voiceButton = event.target.closest('[data-coach-voice]');
    if (voiceButton) { selectVoice(Number(voiceButton.dataset.coachVoice)); return; }
    const segmentButton = event.target.closest('[data-coach-segment]');
    if (segmentButton) { segmentIndex = Number(segmentButton.dataset.coachSegment); updateSegment(); return; }

    if (event.target.closest('#coachVoicePlay')) { await playVoiceFull(); return; }
    if (event.target.closest('#coachMixPlay')) { await playMixFull(); return; }
    if (event.target.closest('#coachSegmentListen')) { if (mode === 'segment') stopAll(false); else await playVoiceSegment(false); return; }
    if (event.target.closest('#coachRecord')) { await recordTake(); return; }
    if (event.target.closest('#coachTakeSolo')) { await playTakeSolo(); return; }
    if (event.target.closest('#coachPlayTake')) { await playComparison(); return; }
    if (event.target.closest('#coachNextSegment') && segmentIndex < song.segments.length - 1) { segmentIndex += 1; updateSegment(); }
  });

  detail.addEventListener('input', event => {
    if (event.target.matches('#coachVolume')) { volume = Number(event.target.value); applyVolume(); return; }
    if (event.target.matches('#mixUserLevel, #mixGroupLevel, #mixGuideLevel')) updateMixOutputs();
  });

  detail.addEventListener('pointerdown', event => {
    const fullWave = event.target.closest('#coachVoiceWave');
    if (fullWave && voiceIndex !== null) {
      const rect = fullWave.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      voiceAudio().currentTime = songStart() + songLength() * ratio;
      return;
    }
    const segmentWave = event.target.closest('#coachSegmentWave');
    if (segmentWave && voiceIndex !== null) {
      const rect = segmentWave.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      voiceAudio().currentTime = segmentStart() + segmentLength() * ratio;
    }
  });

  dialog.addEventListener('close', () => { stopAll(true); stopMeter(); stopMic(); clearTake(); });
  dialog.addEventListener('cancel', () => { stopAll(true); stopMeter(); stopMic(); clearTake(); });

  const observer = new MutationObserver(() => {
    if (detail.querySelector('[data-coach-root]')) return;
    const title = detail.querySelector('#dialogTitle')?.textContent?.trim();
    if (title && SONGS[title]) build(title);
  });
  observer.observe(detail, { childList: true, subtree: true });

  const waveformScript = document.createElement('script');
  waveformScript.src = 'waveforms.js?v=stable2';
  waveformScript.onload = () => {
    if (selectedVoice()) {
      renderVoiceWave();
      renderSegmentWaves();
    }
  };
  document.head.appendChild(waveformScript);
})();
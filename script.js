const trainingStyles = document.createElement('link');
trainingStyles.rel = 'stylesheet';
trainingStyles.href = 'training-player.css';
document.head.appendChild(trainingStyles);

const VOICES = [
  {
    name: 'سوبرانو',
    file: 'soprano.mp3',
    description: 'أعلى طبقة في التوزيع؛ صوت مشرق وواضح يظهر فوق بقية الأصوات.'
  },
  {
    name: 'ألتو',
    file: 'alto.mp3',
    description: 'طبقة متوسطة وأكثر دفئاً من السوبرانو، تربط الأصوات العليا بالوسطى.'
  },
  {
    name: 'كاونتر تينور',
    file: 'konter.mp3',
    description: 'صوت رجالي مرتفع يغني في مجال قريب من الألتو ويضيف لوناً خفيفاً للهارموني.'
  },
  {
    name: 'تينور',
    file: 'tenor.mp3',
    description: 'أعلى الطبقات الرجالية التقليدية؛ واضح ومشرق في المجال المتوسط والعالي.'
  },
  {
    name: 'باس',
    file: 'bass.mp3',
    description: 'طبقة رجالية منخفضة تمنح التوزيع العمق والثبات.'
  },
  {
    name: 'دوبل باس',
    file: 'dubl.mp3',
    description: 'أعمق طبقة في هذا التوزيع، وتثبّت القاعدة المنخفضة للهارموني.'
  }
];

const songs = [
  {
    id: 'wasla-turathiya',
    title: 'وصلة تراثية',
    subtitle: 'وصلة كورالية تراثية',
    voices: 6,
    duration: '1:05',
    durationSeconds: 65,
    status: 'متاحة للتدريب',
    description: 'وصلة تراثية بستة مسارات صوتية للتعلّم والتدريب.',
    parts: VOICES,
    audioBase: 'https://aswat.habaq.online/assets/audio/wasla-turathiya/',
    segments: [
      { label: 'المقطع الأول', from: 0, to: 0.34 },
      { label: 'المقطع الثاني', from: 0.34, to: 0.68 },
      { label: 'المقطع الثالث', from: 0.68, to: 1 }
    ]
  },
  {
    id: 'deerty',
    title: 'ديرتي',
    subtitle: 'أغنية كورالية',
    voices: 6,
    duration: '1:04',
    durationSeconds: 64,
    status: 'متاحة للتدريب',
    description: 'أغنية كورالية بستة مسارات صوتية للتعلّم والتدريب.',
    parts: VOICES,
    audioBase: 'https://aswat.habaq.online/assets/audio/Deerty/',
    segments: [
      { label: 'المقطع الأول', from: 0, to: 0.34 },
      { label: 'المقطع الثاني', from: 0.34, to: 0.68 },
      { label: 'المقطع الثالث', from: 0.68, to: 1 }
    ]
  }
];

const songGrid = document.querySelector('#songGrid');
const dialog = document.querySelector('#songDialog');
const songDetail = document.querySelector('#songDetail');
const dialogClose = document.querySelector('#dialogClose');
const navToggle = document.querySelector('#navToggle');
const mainNav = document.querySelector('#mainNav');
let lastSongTrigger = null;

let masterVolume = 1;
let groupMonitor = null;
let groupMode = null;
let activeSegmentIndex = 0;
let mediaRecorder = null;
let microphoneStream = null;
let recordedChunks = [];
let recordedTakeUrl = null;
let recordedTakeAudio = null;
let currentSong = null;

function voiceLabel(song) {
  return song.voices === 6 ? '6 مسارات صوتية' : `${song.voices} أصوات`;
}

function metaLine(song) {
  return [voiceLabel(song), song.duration].filter(Boolean).join(' · ');
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function renderSongs() {
  songGrid.innerHTML = songs.map((song, index) => `
    <article class="song-card" data-index="0${index + 1}">
      <div class="song-card-top">
        <div>
          <p class="eyebrow">${song.subtitle}</p>
          <h3>${song.title}</h3>
          <p class="song-meta">${metaLine(song)}</p>
        </div>
        <span class="tag">${song.status}</span>
      </div>
      <p class="song-description">${song.description}</p>
      <div class="song-card-footer">
        <button class="song-open" type="button" data-song="${song.id}">افتح التدريب</button>
        <span class="song-readiness"><i></i> المسارات متاحة</span>
      </div>
    </article>
  `).join('');
}

function buildTracks(song) {
  return song.parts.map((part, index) => `
    <div class="voice-player" data-part-index="${index}">
      <button class="player-button" type="button" data-play-track="${index}" aria-label="تشغيل ${part.name}">▶</button>
      <div class="voice-copy">
        <strong>${part.name}</strong>
        <p>${part.description}</p>
      </div>
      <div class="voice-progress">
        <input class="voice-seek" type="range" min="0" max="1000" value="0" step="1" data-seek-track="${index}" aria-label="موضع التشغيل لمسار ${part.name}" />
        <span class="voice-time" data-time-track="${index}">0:00 / ${song.duration}</span>
      </div>
      <audio class="voice-audio" preload="metadata" data-audio-track="${index}" aria-label="مسار ${part.name} — ${song.title}">
        <source src="${song.audioBase}${part.file}" type="audio/mpeg" />
      </audio>
    </div>
  `).join('');
}

function buildSegments(song) {
  return song.segments.map((segment, index) => `
    <button class="segment-button${index === 0 ? ' active' : ''}" type="button" data-segment="${index}">${segment.label}</button>
  `).join('');
}

function dialogAudios() {
  return [...songDetail.querySelectorAll('.voice-audio')];
}

function referenceDuration(song = currentSong) {
  const first = dialogAudios()[0];
  return first && Number.isFinite(first.duration) ? first.duration : song.durationSeconds;
}

function segmentBounds(song = currentSong, index = activeSegmentIndex) {
  const duration = referenceDuration(song);
  const segment = song.segments[index];
  return {
    start: duration * segment.from,
    end: duration * segment.to
  };
}

function resetPlayButtons() {
  songDetail.querySelectorAll('.player-button').forEach((button) => {
    button.textContent = '▶';
    button.classList.remove('is-playing');
  });
  const allButton = songDetail.querySelector('#playAllVoices');
  if (allButton) {
    allButton.classList.remove('is-playing');
    allButton.querySelector('.player-icon').textContent = '▶';
    allButton.querySelector('.all-label').textContent = 'استمع إلى الأصوات كلها';
  }
  const segmentListen = songDetail.querySelector('#listenSegment');
  if (segmentListen) segmentListen.textContent = 'استمع إلى المقطع';
}

function pauseAllAudio(reset = false) {
  if (groupMonitor) {
    clearInterval(groupMonitor);
    groupMonitor = null;
  }
  dialogAudios().forEach((audio) => {
    audio.pause();
    if (reset) audio.currentTime = 0;
  });
  if (recordedTakeAudio) {
    recordedTakeAudio.pause();
    if (reset) recordedTakeAudio.currentTime = 0;
  }
  groupMode = null;
  resetPlayButtons();
}

function applyMasterVolume() {
  dialogAudios().forEach((audio) => { audio.volume = masterVolume; });
  if (recordedTakeAudio) recordedTakeAudio.volume = masterVolume;
  const output = songDetail.querySelector('#masterVolumeValue');
  if (output) output.textContent = `${Math.round(masterVolume * 100)}%`;
}

function updateVoiceProgress(audio, index) {
  const seek = songDetail.querySelector(`[data-seek-track="${index}"]`);
  const time = songDetail.querySelector(`[data-time-track="${index}"]`);
  if (!seek || !time) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : currentSong.durationSeconds;
  const ratio = duration ? audio.currentTime / duration : 0;
  seek.value = String(Math.round(ratio * 1000));
  time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
}

function stopGroupPlayback(onEnd) {
  if (groupMonitor) {
    clearInterval(groupMonitor);
    groupMonitor = null;
  }
  dialogAudios().forEach((audio) => audio.pause());
  if (recordedTakeAudio) recordedTakeAudio.pause();
  const previousMode = groupMode;
  groupMode = null;
  resetPlayButtons();
  if (typeof onEnd === 'function') onEnd(previousMode);
}

async function startGroupPlayback(start = 0, end = null, options = {}) {
  pauseAllAudio(false);
  const audios = dialogAudios();
  if (!audios.length) return;

  const { mode = 'all', includeTake = false, onEnd = null } = options;
  const duration = referenceDuration();
  const stopAt = Number.isFinite(end) ? end : duration;
  groupMode = mode;

  audios.forEach((audio) => {
    audio.currentTime = start;
    audio.volume = masterVolume;
  });

  if (includeTake && recordedTakeAudio) {
    recordedTakeAudio.currentTime = 0;
    recordedTakeAudio.volume = masterVolume;
  }

  try {
    await Promise.all(audios.map((audio) => audio.play()));
    if (includeTake && recordedTakeAudio) await recordedTakeAudio.play();
  } catch (error) {
    groupMode = null;
    return;
  }

  if (mode === 'all') {
    const allButton = songDetail.querySelector('#playAllVoices');
    if (allButton) {
      allButton.classList.add('is-playing');
      allButton.querySelector('.player-icon').textContent = '■';
      allButton.querySelector('.all-label').textContent = 'إيقاف الأصوات';
    }
  }

  if (mode === 'segment' || mode === 'recording' || mode === 'take') {
    const segmentListen = songDetail.querySelector('#listenSegment');
    if (segmentListen && mode === 'segment') segmentListen.textContent = 'إيقاف المقطع';
  }

  groupMonitor = setInterval(() => {
    const reference = audios[0];
    if (!reference || reference.currentTime >= stopAt || reference.ended) {
      stopGroupPlayback(onEnd);
    }
  }, 80);
}

function updateSegmentUI() {
  songDetail.querySelectorAll('[data-segment]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.segment) === activeSegmentIndex);
  });

  const bounds = segmentBounds();
  const info = songDetail.querySelector('#segmentInfo');
  if (info) {
    info.innerHTML = `<strong>${currentSong.segments[activeSegmentIndex].label}</strong><span>${formatTime(bounds.start)} – ${formatTime(bounds.end)}</span>`;
  }

  const next = songDetail.querySelector('#nextSegment');
  if (next) next.disabled = activeSegmentIndex >= currentSong.segments.length - 1;
}

async function toggleSoloTrack(index) {
  const audios = dialogAudios();
  const audio = audios[index];
  const button = songDetail.querySelector(`[data-play-track="${index}"]`);
  if (!audio || !button) return;

  if (!audio.paused) {
    audio.pause();
    button.textContent = '▶';
    button.classList.remove('is-playing');
    return;
  }

  pauseAllAudio(false);
  audio.volume = masterVolume;
  try {
    await audio.play();
    button.textContent = '■';
    button.classList.add('is-playing');
  } catch (error) {
    button.textContent = '▶';
  }
}

function clearRecording() {
  if (recordedTakeUrl) URL.revokeObjectURL(recordedTakeUrl);
  recordedTakeUrl = null;
  recordedTakeAudio = null;
  recordedChunks = [];
  const playTake = songDetail.querySelector('#playTake');
  if (playTake) playTake.disabled = true;
}

function stopMicrophone() {
  if (microphoneStream) {
    microphoneStream.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }
}

function finishRecording() {
  stopMicrophone();
  const recordButton = songDetail.querySelector('#recordTake');
  if (recordButton) {
    recordButton.textContent = 'سجّل صوتك';
    recordButton.classList.remove('recording');
  }
}

async function toggleRecording() {
  const status = songDetail.querySelector('#recordStatus');
  const recordButton = songDetail.querySelector('#recordTake');

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    pauseAllAudio(false);
    mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    if (status) status.textContent = 'التسجيل عبر المتصفح غير مدعوم على هذا الجهاز.';
    return;
  }

  clearRecording();

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(microphoneStream);
    recordedChunks = [];

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) recordedChunks.push(event.data);
    });

    mediaRecorder.addEventListener('stop', () => {
      if (recordedChunks.length) {
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        recordedTakeUrl = URL.createObjectURL(blob);
        recordedTakeAudio = new Audio(recordedTakeUrl);
        recordedTakeAudio.volume = masterVolume;
        const playTake = songDetail.querySelector('#playTake');
        if (playTake) playTake.disabled = false;
        if (status) status.innerHTML = '<strong>تم تسجيل المحاولة.</strong> استمع إليها مع الكورال، ثم أعدها أو انتقل إلى المقطع التالي.';
      }
      finishRecording();
    });

    const bounds = segmentBounds();
    mediaRecorder.start();
    recordButton.textContent = 'إيقاف التسجيل';
    recordButton.classList.add('recording');
    if (status) status.textContent = 'التسجيل جارٍ. يُفضّل استخدام سماعات رأس.';

    await startGroupPlayback(bounds.start, bounds.end, {
      mode: 'recording',
      onEnd: () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
      }
    });
  } catch (error) {
    finishRecording();
    if (status) status.textContent = 'تعذّر الوصول إلى الميكروفون. تحقق من إذن المتصفح ثم حاول مجدداً.';
  }
}

async function playTakeWithChoir() {
  if (!recordedTakeAudio) return;
  const bounds = segmentBounds();
  await startGroupPlayback(bounds.start, bounds.end, { mode: 'take', includeTake: true });
}

function setupTrainingInteractions(song) {
  const audios = dialogAudios();

  audios.forEach((audio, index) => {
    audio.volume = masterVolume;

    audio.addEventListener('loadedmetadata', () => {
      updateVoiceProgress(audio, index);
      if (index === 0) updateSegmentUI();
    });

    audio.addEventListener('timeupdate', () => updateVoiceProgress(audio, index));
    audio.addEventListener('ended', () => {
      const button = songDetail.querySelector(`[data-play-track="${index}"]`);
      if (button) {
        button.textContent = '▶';
        button.classList.remove('is-playing');
      }
    });
  });

  songDetail.addEventListener('click', async (event) => {
    const playTrack = event.target.closest('[data-play-track]');
    if (playTrack) {
      await toggleSoloTrack(Number(playTrack.dataset.playTrack));
      return;
    }

    const segmentButton = event.target.closest('[data-segment]');
    if (segmentButton) {
      pauseAllAudio(false);
      activeSegmentIndex = Number(segmentButton.dataset.segment);
      clearRecording();
      updateSegmentUI();
      const status = songDetail.querySelector('#recordStatus');
      if (status) status.textContent = 'استمع إلى المقطع، ثم سجّل محاولتك. يُفضّل استخدام سماعات رأس.';
      return;
    }

    if (event.target.closest('#playAllVoices')) {
      if (groupMode === 'all') pauseAllAudio(false);
      else await startGroupPlayback(0, referenceDuration(song), { mode: 'all' });
      return;
    }

    if (event.target.closest('#listenSegment')) {
      if (groupMode === 'segment') pauseAllAudio(false);
      else {
        const bounds = segmentBounds(song);
        await startGroupPlayback(bounds.start, bounds.end, { mode: 'segment' });
      }
      return;
    }

    if (event.target.closest('#recordTake')) {
      await toggleRecording();
      return;
    }

    if (event.target.closest('#playTake')) {
      await playTakeWithChoir();
      return;
    }

    if (event.target.closest('#nextSegment')) {
      if (activeSegmentIndex < song.segments.length - 1) {
        pauseAllAudio(false);
        activeSegmentIndex += 1;
        clearRecording();
        updateSegmentUI();
        const status = songDetail.querySelector('#recordStatus');
        if (status) status.textContent = 'استمع إلى المقطع الجديد، ثم سجّل محاولتك.';
      }
    }
  });

  songDetail.addEventListener('input', (event) => {
    if (event.target.matches('#masterVolume')) {
      masterVolume = Number(event.target.value);
      applyMasterVolume();
      return;
    }

    if (event.target.matches('[data-seek-track]')) {
      const index = Number(event.target.dataset.seekTrack);
      const audio = audios[index];
      if (!audio) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : song.durationSeconds;
      audio.currentTime = duration * (Number(event.target.value) / 1000);
      updateVoiceProgress(audio, index);
    }
  });

  applyMasterVolume();
  updateSegmentUI();
}

function stopDialogAudio() {
  pauseAllAudio(true);
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  stopMicrophone();
  clearRecording();
}

function openSong(song, trigger) {
  lastSongTrigger = trigger || null;
  currentSong = song;
  activeSegmentIndex = 0;

  songDetail.innerHTML = `
    <div class="training-workspace">
      <div class="training-header">
        <div>
          <p class="eyebrow">${song.status}</p>
          <h2 id="dialogTitle">${song.title}</h2>
          <p class="song-meta">${metaLine(song)}</p>
        </div>
      </div>

      <div class="master-tools">
        <div class="master-volume">
          <label for="masterVolume">مستوى الصوت</label>
          <input id="masterVolume" type="range" min="0" max="1" step="0.01" value="${masterVolume}" />
          <output id="masterVolumeValue">${Math.round(masterVolume * 100)}%</output>
        </div>
        <button class="all-voices-button" id="playAllVoices" type="button">
          <span class="player-icon" aria-hidden="true">▶</span>
          <span class="all-label">استمع إلى الأصوات كلها</span>
        </button>
      </div>

      <section aria-labelledby="voicesTitle">
        <h3 class="voice-guide-title" id="voicesTitle">تعرّف إلى الأصوات</h3>
        <p class="voice-guide-intro">اختر طبقتك، واستمع إلى دورها منفرداً قبل الغناء مع المجموعة.</p>
        <div class="voice-list">${buildTracks(song)}</div>
      </section>

      <section class="segment-training" aria-labelledby="segmentsTitle">
        <div class="segment-training-head">
          <div>
            <p class="eyebrow">تدريب تدريجي</p>
            <h3 id="segmentsTitle">تعلّم الأغنية مقطعاً مقطعاً</h3>
            <p>استمع، سجّل محاولتك، ثم قارنها بالكورال قبل الانتقال.</p>
          </div>
          <div class="segment-tabs">${buildSegments(song)}</div>
        </div>

        <div class="segment-info" id="segmentInfo"></div>
        <div class="segment-actions">
          <button class="training-action" id="listenSegment" type="button">استمع إلى المقطع</button>
          <button class="training-action primary" id="recordTake" type="button">سجّل صوتك</button>
          <button class="training-action" id="playTake" type="button" disabled>استمع إلى تسجيلك مع الكورال</button>
          <button class="training-action" id="nextSegment" type="button">المقطع التالي</button>
        </div>
        <p class="record-status" id="recordStatus">استمع إلى المقطع، ثم سجّل محاولتك. يُفضّل استخدام سماعات رأس.</p>
        <p class="segment-note">التسجيل يبقى على جهازك أثناء هذه الجلسة ولا يُرفع إلى الموقع.</p>
      </section>
    </div>
  `;

  dialog.showModal();
  setupTrainingInteractions(song);
}

function closeDialog() {
  stopDialogAudio();
  dialog.close();
}

function closeMenu() {
  mainNav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'فتح القائمة');
  document.body.classList.remove('nav-open');
}

function toggleMenu() {
  const willOpen = navToggle.getAttribute('aria-expanded') !== 'true';
  mainNav.classList.toggle('open', willOpen);
  navToggle.setAttribute('aria-expanded', String(willOpen));
  navToggle.setAttribute('aria-label', willOpen ? 'إغلاق القائمة' : 'فتح القائمة');
  document.body.classList.toggle('nav-open', willOpen);
}

songGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-song]');
  if (!button) return;
  const song = songs.find(item => item.id === button.dataset.song);
  if (song) openSong(song, button);
});

dialogClose.addEventListener('click', closeDialog);
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDialog();
});
dialog.addEventListener('close', () => {
  if (lastSongTrigger) lastSongTrigger.focus();
});

navToggle.addEventListener('click', toggleMenu);
mainNav.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mainNav.classList.contains('open')) closeMenu();
});

renderSongs();

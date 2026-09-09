const songs = [
  {
    id: 'song-1',
    title: 'وصلة تراثية',
    subtitle: 'وصلة كورالية تراثية',
    voices: 6,
    duration: '1:05',
    status: 'متاحة للتدريب',
    description: 'وصلة تراثية موزعة على ستة مسارات صوتية منفصلة للتعلّم والتدريب الجماعي.',
    parts: [
      { name: 'سوبرانو', file: 'soprano.mp3' },
      { name: 'ألتو', file: 'alto.mp3' },
      { name: 'تينور', file: 'tenor.mp3' },
      { name: 'باص', file: 'bass.mp3' },
      { name: 'دوبل', file: 'dubl.mp3' },
      { name: 'كونتر', file: 'konter.mp3' }
    ],
    audioBase: 'https://aswat.habaq.online/assets/audio/wasla-turathiya/'
  },
  {
    id: 'song-2',
    title: 'الأغنية الثانية',
    subtitle: 'مقطع كورالي قصير',
    voices: 2,
    duration: '30–60 ثانية',
    status: 'قيد الإعداد',
    description: 'ستُضاف هنا نبذة قصيرة عن الأغنية وسياقها بعد اختيار الريبرتوار النهائي.'
  },
  {
    id: 'song-3',
    title: 'الأغنية الثالثة',
    subtitle: 'مقطع كورالي قصير',
    voices: 4,
    duration: '30–60 ثانية',
    status: 'قيد الإعداد',
    description: 'ستُضاف هنا نبذة قصيرة عن الأغنية وسياقها بعد اختيار الريبرتوار النهائي.'
  },
  {
    id: 'song-4',
    title: 'الأغنية الرابعة',
    subtitle: 'مقطع كورالي قصير',
    voices: 3,
    duration: '30–60 ثانية',
    status: 'قيد الإعداد',
    description: 'ستُضاف هنا نبذة قصيرة عن الأغنية وسياقها بعد اختيار الريبرتوار النهائي.'
  }
];

const songGrid = document.querySelector('#songGrid');
const dialog = document.querySelector('#songDialog');
const songDetail = document.querySelector('#songDetail');
const dialogClose = document.querySelector('#dialogClose');
const navToggle = document.querySelector('#navToggle');
const mainNav = document.querySelector('#mainNav');
let lastSongTrigger = null;

function arabicVoiceCount(count) {
  if (count === 2) return 'صوتان';
  if (count === 3) return '3 أصوات';
  if (count === 4) return '4 أصوات';
  if (count === 6) return '6 مسارات صوتية';
  return `${count} أصوات`;
}

function renderSongs() {
  songGrid.innerHTML = songs.map((song, index) => {
    const ready = Array.isArray(song.parts) && song.parts.length > 0 && song.audioBase;
    return `
      <article class="song-card" data-index="0${index + 1}">
        <div class="song-card-top">
          <div>
            <p class="eyebrow">${song.subtitle}</p>
            <h3>${song.title}</h3>
            <p class="song-meta">${arabicVoiceCount(song.voices)} · ${song.duration}</p>
          </div>
          <span class="tag">${song.status}</span>
        </div>
        <p class="song-description">${song.description}</p>
        <div class="song-card-footer">
          <button class="song-open" type="button" data-song="${song.id}">افتح مساحة التدريب</button>
          <span class="song-readiness"><i></i> ${ready ? 'المسارات متاحة' : 'قيد التجهيز'}</span>
        </div>
      </article>
    `;
  }).join('');
}

function buildTracks(song) {
  if (Array.isArray(song.parts) && song.parts.length && song.audioBase) {
    return song.parts.map((part, index) => `
      <div class="track track-ready">
        <span class="track-copy">
          <strong>${part.name}</strong>
          <small>المسار ${index + 1} من ${song.parts.length} · استمع للدور ثم ردّده</small>
        </span>
        <audio class="training-audio" controls preload="metadata" controlsList="nodownload" aria-label="مسار ${part.name}">
          <source src="${song.audioBase}${part.file}" type="audio/mpeg" />
          متصفحك لا يدعم تشغيل الصوت.
        </audio>
      </div>
    `).join('');
  }

  const partNames = Array.from({ length: song.voices }, (_, i) => `الصوت ${i + 1}`);
  return partNames.map((part) => `
    <div class="track">
      <span class="track-copy">
        <strong>${part}</strong>
        <small>استمع لهذا الدور منفرداً ثم ردّده</small>
      </span>
      <span class="track-status">يُضاف قريباً</span>
    </div>
  `).join('');
}

function stopDialogAudio() {
  songDetail.querySelectorAll('audio').forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function openSong(song, trigger) {
  lastSongTrigger = trigger || null;
  const hasAudio = Array.isArray(song.parts) && song.parts.length > 0 && song.audioBase;

  songDetail.innerHTML = `
    <p class="eyebrow">${song.status}</p>
    <h2 id="dialogTitle">${song.title}</h2>
    <p class="dialog-intro">${song.description}</p>
    <p class="song-meta">${arabicVoiceCount(song.voices)} · ${song.duration}</p>

    <div class="training-block">
      <h3>اختَر دورك واستمع</h3>
      <p class="training-help">${hasAudio
        ? 'شغّل المسار الذي تريد تعلّمه. عند تشغيل مسار جديد سيتوقف المسار السابق تلقائياً.'
        : 'ستُضاف هنا تسجيلات الخطوط الصوتية المنفصلة لتعلّمها بالأذن.'}</p>
      <div class="track-list">${buildTracks(song)}</div>
    </div>

    <div class="dialog-note">
      ${hasAudio
        ? 'نصيحة: استمع إلى المسار مرتين أو ثلاثاً، ثم غنِّ معه قبل الانتقال إلى بقية الأصوات.'
        : 'هذه المادة ما زالت قيد التجهيز.'}
    </div>
  `;

  songDetail.querySelectorAll('audio').forEach((audio) => {
    audio.addEventListener('play', () => {
      songDetail.querySelectorAll('audio').forEach((other) => {
        if (other !== audio) other.pause();
      });
    });
  });

  dialog.showModal();
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
  if (window.innerWidth > 760) closeMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mainNav.classList.contains('open')) closeMenu();
});

renderSongs();

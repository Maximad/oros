const songs = [
  {
    id: 'wasla-turathiya',
    title: 'وصلة تراثية',
    subtitle: 'وصلة كورالية تراثية',
    voices: 6,
    duration: '1:05',
    status: 'متاحة للتدريب',
    description: 'وصلة تراثية بستة مسارات صوتية للتعلّم والتدريب.',
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
    id: 'deerty',
    title: 'ديرتي',
    subtitle: 'أغنية كورالية',
    voices: 6,
    status: 'متاحة للتدريب',
    description: 'أغنية كورالية بستة مسارات صوتية للتعلّم والتدريب.',
    parts: [
      { name: 'سوبرانو', file: 'soprano.mp3' },
      { name: 'ألتو', file: 'alto.mp3' },
      { name: 'تينور', file: 'tenor.mp3' },
      { name: 'باص', file: 'bass.mp3' },
      { name: 'دوبل', file: 'dubl.mp3' },
      { name: 'كونتر', file: 'konter.mp3' }
    ],
    audioBase: 'https://aswat.habaq.online/assets/audio/Deerty/'
  }
];

const songGrid = document.querySelector('#songGrid');
const dialog = document.querySelector('#songDialog');
const songDetail = document.querySelector('#songDetail');
const dialogClose = document.querySelector('#dialogClose');
const navToggle = document.querySelector('#navToggle');
const mainNav = document.querySelector('#mainNav');
let lastSongTrigger = null;

function voiceLabel(song) {
  return song.voices === 6 ? '6 مسارات صوتية' : `${song.voices} أصوات`;
}

function metaLine(song) {
  return [voiceLabel(song), song.duration].filter(Boolean).join(' · ');
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
    <div class="track track-ready">
      <span class="track-copy">
        <strong>${part.name}</strong>
        <small>المسار ${index + 1} من ${song.parts.length}</small>
      </span>
      <audio class="training-audio" controls preload="metadata" controlsList="nodownload" aria-label="مسار ${part.name} — ${song.title}">
        <source src="${song.audioBase}${part.file}" type="audio/mpeg" />
        متصفحك لا يدعم تشغيل الصوت.
      </audio>
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

  songDetail.innerHTML = `
    <p class="eyebrow">${song.status}</p>
    <h2 id="dialogTitle">${song.title}</h2>
    <p class="dialog-intro">${song.description}</p>
    <p class="song-meta">${metaLine(song)}</p>

    <div class="training-block">
      <h3>اختر دورك</h3>
      <p class="training-help">شغّل المسار الذي تريد تعلّمه.</p>
      <div class="track-list">${buildTracks(song)}</div>
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
  if (window.innerWidth > 900) closeMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mainNav.classList.contains('open')) closeMenu();
});

renderSongs();

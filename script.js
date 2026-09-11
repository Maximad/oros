const trainingStyles = document.createElement('link');
trainingStyles.rel = 'stylesheet';
trainingStyles.href = 'training-player.css';
document.head.appendChild(trainingStyles);

const songs = [
  {
    id: 'wasla-turathiya',
    title: 'وصلة تراثية',
    subtitle: 'وصلة كورالية تراثية',
    voices: 4,
    duration: '1:02',
    status: 'متاحة للتدريب',
    description: 'وصلة تراثية بأربعة مسارات صوتية للتعلّم والتدريب.'
  },
  {
    id: 'deerty',
    title: 'ديرتي',
    subtitle: 'أغنية كورالية',
    voices: 4,
    duration: '1:02',
    status: 'متاحة للتدريب',
    description: 'أغنية كورالية بأربعة مسارات صوتية للتعلّم والتدريب.'
  }
];

const songGrid = document.querySelector('#songGrid');
const dialog = document.querySelector('#songDialog');
const songDetail = document.querySelector('#songDetail');
const dialogClose = document.querySelector('#dialogClose');
const navToggle = document.querySelector('#navToggle');
const mainNav = document.querySelector('#mainNav');
let lastSongTrigger = null;

function metaLine(song) {
  return [`${song.voices} مسارات صوتية`, song.duration].join(' · ');
}

function renderSongs() {
  if (!songGrid) return;
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

function openSong(song, trigger) {
  if (!dialog || !songDetail) return;
  lastSongTrigger = trigger || null;
  songDetail.innerHTML = `
    <div class="training-workspace">
      <div class="training-header">
        <div>
          <p class="eyebrow">${song.status}</p>
          <h2 id="dialogTitle">${song.title}</h2>
          <p class="song-meta">${metaLine(song)}</p>
        </div>
      </div>
    </div>`;
  dialog.showModal();
}

function closeDialog() {
  if (dialog?.open) dialog.close();
}

function closeMenu() {
  if (!mainNav || !navToggle) return;
  mainNav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'فتح القائمة');
  document.body.classList.remove('nav-open');
}

function toggleMenu() {
  if (!mainNav || !navToggle) return;
  const willOpen = navToggle.getAttribute('aria-expanded') !== 'true';
  mainNav.classList.toggle('open', willOpen);
  navToggle.setAttribute('aria-expanded', String(willOpen));
  navToggle.setAttribute('aria-label', willOpen ? 'إغلاق القائمة' : 'فتح القائمة');
  document.body.classList.toggle('nav-open', willOpen);
}

songGrid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-song]');
  if (!button) return;
  const song = songs.find(item => item.id === button.dataset.song);
  if (song) openSong(song, button);
});

dialogClose?.addEventListener('click', closeDialog);
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});
dialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDialog();
});
dialog?.addEventListener('close', () => {
  songDetail.innerHTML = '';
  if (lastSongTrigger) lastSongTrigger.focus();
});

navToggle?.addEventListener('click', toggleMenu);
mainNav?.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mainNav?.classList.contains('open')) closeMenu();
});

renderSongs();

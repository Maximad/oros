const songs = [
  {
    id: 'song-1',
    title: 'وصلة تراثية',
    subtitle: 'وصلة كورالية تراثية',
    voices: 6,
    duration: '1:05',
    status: 'قيد التجهيز للنشر',
    description: 'وصلة تراثية موزعة على ستة مسارات صوتية منفصلة للتعلّم والتدريب الجماعي.',
    parts: ['سوبرانو', 'ألتو', 'تينور', 'باص', 'دوبل', 'كونتر']
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

function arabicVoiceCount(count) {
  if (count === 2) return 'صوتان';
  if (count === 3) return '3 أصوات';
  if (count === 4) return '4 أصوات';
  if (count === 6) return '6 مسارات صوتية';
  return `${count} أصوات`;
}

function renderSongs() {
  songGrid.innerHTML = songs.map((song, index) => `
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
        <span class="song-readiness"><i></i> البنية جاهزة</span>
      </div>
    </article>
  `).join('');
}

function buildTracks(song) {
  const partNames = song.parts || Array.from({ length: song.voices }, (_, i) => `الصوت ${i + 1}`);
  const soloTracks = partNames.map((part) => `
    <div class="track">
      <span class="track-copy">
        <strong>${part}</strong>
        <small>استمع لهذا الدور منفرداً ثم ردّده</small>
      </span>
      <span class="track-status">يُضاف قريباً</span>
    </div>
  `).join('');

  return `
    ${soloTracks}
    <div class="track">
      <span class="track-copy">
        <strong>كل الأصوات معاً</strong>
        <small>النسخة المرجعية الكاملة للمقطع</small>
      </span>
      <span class="track-status">يُضاف قريباً</span>
    </div>
    <div class="track">
      <span class="track-copy">
        <strong>نسخة التدريب</strong>
        <small>غنِّ دورك بينما تسمع بقية المجموعة</small>
      </span>
      <span class="track-status">يُضاف قريباً</span>
    </div>
  `;
}

function openSong(song) {
  songDetail.innerHTML = `
    <p class="eyebrow">${song.status}</p>
    <h2 id="dialogTitle">${song.title}</h2>
    <p class="dialog-intro">${song.description}</p>
    <p class="song-meta">${arabicVoiceCount(song.voices)} · ${song.duration}</p>

    <div class="training-block">
      <h3>1. اختَر دورك</h3>
      <p class="training-help">سنضع هنا تسجيل كل خط صوتي بشكل منفصل لتتعلمه بالأذن.</p>
      <div class="track-list">${buildTracks(song)}</div>
    </div>

    <div class="dialog-note">
      عند إضافة التسجيلات الحقيقية، ستتحول هذه الصفوف إلى مشغلات صوت مباشرة مع زر إعادة بسيط، من دون الحاجة لتنزيل أي ملف.
    </div>
  `;
  dialog.showModal();
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
  if (song) openSong(song);
});

dialogClose.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

dialog.addEventListener('close', () => {
  const trigger = document.querySelector(`[data-song]`);
  if (trigger && document.activeElement === document.body) trigger.focus();
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

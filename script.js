const songs = [
  {
    id: 'song-1',
    title: 'الأغنية الأولى',
    subtitle: 'مقطع كورالي قصير',
    voices: 3,
    duration: '30–60 ثانية',
    progress: 20,
    status: 'قيد الإعداد',
    description: 'ستُضاف هنا نبذة قصيرة عن الأغنية وسياقها بعد اختيار الريبرتوار النهائي.'
  },
  {
    id: 'song-2',
    title: 'الأغنية الثانية',
    subtitle: 'مقطع كورالي قصير',
    voices: 2,
    duration: '30–60 ثانية',
    progress: 10,
    status: 'قيد الإعداد',
    description: 'ستُضاف هنا نبذة قصيرة عن الأغنية وسياقها بعد اختيار الريبرتوار النهائي.'
  },
  {
    id: 'song-3',
    title: 'الأغنية الثالثة',
    subtitle: 'مقطع كورالي قصير',
    voices: 4,
    duration: '30–60 ثانية',
    progress: 10,
    status: 'قيد الإعداد',
    description: 'ستُضاف هنا نبذة قصيرة عن الأغنية وسياقها بعد اختيار الريبرتوار النهائي.'
  },
  {
    id: 'song-4',
    title: 'الأغنية الرابعة',
    subtitle: 'مقطع كورالي قصير',
    voices: 3,
    duration: '30–60 ثانية',
    progress: 10,
    status: 'قيد الإعداد',
    description: 'ستُضاف هنا نبذة قصيرة عن الأغنية وسياقها بعد اختيار الريبرتوار النهائي.'
  }
];

const songGrid = document.querySelector('#songGrid');
const songSelect = document.querySelector('#songSelect');
const dialog = document.querySelector('#songDialog');
const songDetail = document.querySelector('#songDetail');
const dialogClose = document.querySelector('#dialogClose');

function renderSongs() {
  songGrid.innerHTML = songs.map(song => `
    <article class="song-card">
      <div class="song-card-top">
        <div>
          <p class="eyebrow">${song.subtitle}</p>
          <h3>${song.title}</h3>
          <p class="song-meta">${song.voices} أصوات · ${song.duration}</p>
        </div>
        <span class="tag">${song.status}</span>
      </div>
      <p>${song.description}</p>
      <div class="progress" aria-label="تقدم تجهيز المادة"><span style="width:${song.progress}%"></span></div>
      <button class="button ghost" type="button" data-song="${song.id}">افتح صفحة التدريب</button>
    </article>
  `).join('');

  songSelect.innerHTML = songs.map(song => `<option value="${song.id}">${song.title}</option>`).join('');
}

function openSong(song) {
  const tracks = Array.from({ length: song.voices }, (_, i) => `
    <div class="track">
      <span>الصوت ${i + 1}</span>
      <button disabled>الصوت قريباً</button>
    </div>
  `).join('');

  songDetail.innerHTML = `
    <p class="eyebrow">${song.status}</p>
    <h2 id="dialogTitle">${song.title}</h2>
    <p>${song.description}</p>
    <p class="song-meta">${song.voices} أصوات · ${song.duration}</p>
    <h3>تعلّم دورك</h3>
    <div class="track-list">${tracks}</div>
    <div class="track"><span>كل الأصوات معاً</span><button disabled>التسجيل قريباً</button></div>
    <div class="track"><span>نسخة للتدريب</span><button disabled>قريباً</button></div>
    <p class="form-note">سنضيف الكلمات، ملفات MP3 المنفصلة، والنسخة الجماعية عند جاهزية التسجيلات.</p>
  `;
  dialog.showModal();
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

document.querySelector('#contributionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('#formNote').textContent = 'هذه نسخة تجريبية فقط؛ لم يتم إرسال أي بيانات.';
});

renderSongs();

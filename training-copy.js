(() => {
  const detail = document.querySelector('#songDetail');
  if (!detail) return;

  function selectedVoiceName() {
    const active = detail.querySelector('[data-coach-voice].active');
    return active?.textContent?.trim() || 'طبقتك';
  }

  function polish() {
    const root = detail.querySelector('[data-coach-root]');
    if (!root) return;

    const sectionHeads = root.querySelectorAll('.coach-section-head');
    const chooseCopy = sectionHeads[0]?.querySelector('p:last-child');
    if (chooseCopy) chooseCopy.textContent = 'استمع إلى الطبقات، واختر المجال الذي يناسب صوتك قبل بدء التدريب.';

    const selectedName = root.querySelector('#coachVoiceName');
    const selectedDesc = root.querySelector('#coachVoiceDesc');
    if (selectedName?.textContent.trim() === 'اختر أحد الأصوات') selectedName.textContent = 'اختر طبقتك';
    if (selectedDesc?.textContent.includes('بعد الاختيار')) selectedDesc.textContent = 'سيظهر هنا دور الطبقة ومسارها الصوتي.';

    const practiceCopy = sectionHeads[1]?.querySelector('p:last-child');
    if (practiceCopy) practiceCopy.textContent = 'ثبّت دورك على مقاطع قصيرة، ثم اسمع مكانه داخل المجموعة.';

    const flowCards = root.querySelectorAll('.coach-flow article');
    if (flowCards[0]) {
      const p = flowCards[0].querySelector('p');
      const button = flowCards[0].querySelector('button');
      if (p) p.textContent = 'اسمع الجملة كاملة، وركّز على الدخول والنهاية.';
      if (button) button.textContent = 'اسمع المقطع';
    }
    if (flowCards[1]) {
      const title = flowCards[1].querySelector('strong');
      const p = flowCards[1].querySelector('p');
      if (title) title.textContent = 'غنِّ دورك';
      if (p) p.textContent = 'خذ العدّ، ثم ادخل مع بداية المقطع واستمر حتى نهايته.';
    }
    if (flowCards[2]) {
      const title = flowCards[2].querySelector('strong');
      const p = flowCards[2].querySelector('p');
      const button = flowCards[2].querySelector('button');
      if (title) title.textContent = 'اسمع موقعك';
      if (p) p.textContent = 'قارن حضور صوتك مع بقية الطبقات وعدّل الموازنة كما تحتاج.';
      if (button) button.textContent = 'اسمعني داخل الكورال';
    }

    const note = root.querySelector('.segment-note');
    if (note) note.textContent = 'لأفضل تجربة، استخدم سماعات إن كانت متاحة. يبقى التسجيل على جهازك خلال الجلسة.';

    const status = root.querySelector('#coachStatus');
    if (status) {
      const text = status.textContent.trim();
      if (text.includes('تم خفض صوت الدليل تلقائياً')) {
        status.textContent = `التسجيل جارٍ · ${selectedVoiceName()}. تابع المقطع حتى النهاية.`;
      } else if (text.includes('تم تسجيل المحاولة')) {
        status.textContent = 'المحاولة جاهزة. اسمع صوتك وحده أو داخل الكورال.';
      }
    }
  }

  const observer = new MutationObserver(polish);
  observer.observe(detail, { childList:true, subtree:true, characterData:true });
  polish();

  // Keep the reference track discreet while the microphone is active.
  setInterval(() => {
    const record = detail.querySelector('#coachRecord.recording');
    const voice = detail.querySelector('#coachVoiceAudio');
    if (!record || !voice || voice.paused) return;
    const master = Number(detail.querySelector('#coachVolume')?.value ?? 1);
    const target = Math.min(Math.max(0, master) * 0.28, 0.20);
    if (Number.isFinite(target)) voice.volume = target;
  }, 120);
})();

(() => {
  const API_BASE = 'api/recordings';
  const state = {
    blob: null,
    blobUrl: null,
    blobVersion: 0,
    playingAudio: null,
    playingButton: null,
    archivePage: 1,
    archivePages: 1,
    archiveSong: '',
    archiveVoice: ''
  };

  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function patchedCreateObjectURL(value) {
    const url = nativeCreateObjectURL(value);
    if (value instanceof Blob && isRecordingBlob(value)) {
      state.blob = value;
      state.blobUrl = url;
      state.blobVersion += 1;
      queueMicrotask(syncSavePanel);
    }
    return url;
  };

  function isRecordingBlob(blob) {
    const type = (blob.type || '').toLowerCase();
    return type.startsWith('audio/') || type === 'video/webm';
  }

  function qs(selector, root = document) { return root.querySelector(selector); }
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function currentContext() {
    const detail = qs('#songDetail');
    if (!detail) return null;
    const activeVoice = qs('[data-coach-voice].active', detail);
    const activeSegment = qs('[data-coach-segment].active', detail);
    const title = qs('#dialogTitle', detail)?.textContent?.trim() || '';
    const voice = activeVoice?.textContent?.trim() || '';
    const segment = activeSegment?.textContent?.trim() || qs('#coachRecordInfo strong', detail)?.textContent?.trim() || '';
    const lyrics = qs('#coachRecordLyrics', detail)?.textContent?.trim() || '';
    return { title, voice, segment, lyrics };
  }

  function getBlobExtension(type = '') {
    const t = type.toLowerCase();
    if (t.includes('webm')) return 'webm';
    if (t.includes('mp4') || t.includes('m4a')) return 'm4a';
    if (t.includes('ogg')) return 'ogg';
    if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
    return 'webm';
  }

  function getBlobDuration(blobUrl) {
    return new Promise(resolve => {
      if (!blobUrl) return resolve(0);
      const audio = new Audio();
      const done = value => {
        audio.removeAttribute('src');
        resolve(Number.isFinite(value) ? Math.max(0, value) : 0);
      };
      const timeout = setTimeout(() => done(0), 2500);
      audio.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        done(audio.duration);
      }, { once: true });
      audio.addEventListener('error', () => {
        clearTimeout(timeout);
        done(0);
      }, { once: true });
      audio.src = blobUrl;
      audio.preload = 'metadata';
    });
  }

  function syncSavePanel() {
    const preview = qs('#coachTakePreview');
    if (!preview || preview.hidden || !state.blob) return;

    let panel = qs('#saveTakePanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'saveTakePanel';
      panel.className = 'save-take-panel';
      panel.innerHTML = `
        <div class="save-take-intro">
          <div class="save-take-copy">
            <span class="eyebrow">احتفظ بالمحاولة</span>
            <strong>هل تريد إبقاء هذا التسجيل ضمن المشروع؟</strong>
            <p>لن يُحفظ التسجيل على الموقع إلا إذا اخترت ذلك.</p>
          </div>
          <button class="training-action primary" id="openSaveTake" type="button">احتفظ بهذا التسجيل</button>
        </div>
        <form class="save-take-form" id="saveTakeForm" hidden>
          <label class="save-name-field">
            <span>الاسم</span>
            <input id="recordingDisplayName" name="display_name" type="text" maxlength="60" placeholder="اختياري" autocomplete="name" />
          </label>
          <label class="save-consent">
            <input id="recordingConsent" type="checkbox" required />
            <span>أوافق على حفظ هذا التسجيل وعرضه ضمن تسجيلات المشروع.</span>
          </label>
          <div class="save-form-actions">
            <button class="training-action primary" id="submitSaveTake" type="submit">حفظ التسجيل</button>
            <button class="training-action" id="cancelSaveTake" type="button">إلغاء</button>
          </div>
          <p class="save-take-status" id="saveTakeStatus" aria-live="polite"></p>
        </form>`;
      preview.appendChild(panel);
      wireSavePanel(panel);
    }

    if (panel.dataset.blobVersion !== String(state.blobVersion)) {
      panel.dataset.blobVersion = String(state.blobVersion);
      resetSavePanel(panel);
    }
  }

  function resetSavePanel(panel) {
    const form = qs('#saveTakeForm', panel);
    const open = qs('#openSaveTake', panel);
    const status = qs('#saveTakeStatus', panel);
    const consent = qs('#recordingConsent', panel);
    if (form) form.hidden = true;
    if (open) {
      open.disabled = false;
      open.textContent = 'احتفظ بهذا التسجيل';
      open.hidden = false;
    }
    if (status) {
      status.textContent = '';
      status.className = 'save-take-status';
    }
    if (consent) consent.checked = false;
  }

  function wireSavePanel(panel) {
    qs('#openSaveTake', panel)?.addEventListener('click', () => {
      qs('#saveTakeForm', panel).hidden = false;
      qs('#openSaveTake', panel).hidden = true;
    });

    qs('#cancelSaveTake', panel)?.addEventListener('click', () => {
      qs('#saveTakeForm', panel).hidden = true;
      qs('#openSaveTake', panel).hidden = false;
    });

    qs('#saveTakeForm', panel)?.addEventListener('submit', saveCurrentTake);
  }

  async function saveCurrentTake(event) {
    event.preventDefault();
    const panel = event.currentTarget.closest('#saveTakePanel');
    const status = qs('#saveTakeStatus', panel);
    const button = qs('#submitSaveTake', panel);
    const consent = qs('#recordingConsent', panel);

    if (!state.blob) {
      status.textContent = 'لم يعد التسجيل الحالي متاحًا للحفظ.';
      status.className = 'save-take-status error';
      return;
    }
    if (!consent?.checked) {
      status.textContent = 'يلزم تأكيد الموافقة قبل الحفظ.';
      status.className = 'save-take-status error';
      return;
    }

    const context = currentContext();
    if (!context?.title || !context.voice) {
      status.textContent = 'تعذّر تحديد الأغنية والطبقة لهذا التسجيل.';
      status.className = 'save-take-status error';
      return;
    }

    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    status.textContent = 'يتم رفع التسجيل.';
    status.className = 'save-take-status';

    try {
      const duration = await getBlobDuration(state.blobUrl);
      const data = new FormData();
      data.append('recording', state.blob, `recording.${getBlobExtension(state.blob.type)}`);
      data.append('song', context.title);
      data.append('voice', context.voice);
      data.append('segment', context.segment);
      data.append('lyrics', context.lyrics);
      data.append('display_name', qs('#recordingDisplayName', panel)?.value?.trim() || '');
      data.append('duration', String(duration || 0));
      data.append('consent', 'yes');

      const response = await fetch(`${API_BASE}/upload.php`, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'upload_failed');

      status.textContent = 'تم حفظ التسجيل وإضافته إلى تسجيلات المشروع.';
      status.className = 'save-take-status success';
      button.textContent = 'تم الحفظ';
      button.disabled = true;
      const cancel = qs('#cancelSaveTake', panel);
      if (cancel) cancel.hidden = true;
      document.dispatchEvent(new CustomEvent('oros:recording-saved', { detail: payload.item || null }));
    } catch (error) {
      const githubPreview = location.hostname.endsWith('github.io');
      status.textContent = githubPreview
        ? 'الحفظ الدائم سيعمل بعد نقل الموقع إلى الاستضافة التي تشغّل PHP.'
        : 'تعذّر حفظ التسجيل الآن. حاول مرة أخرى.';
      status.className = 'save-take-status error';
      button.disabled = false;
      button.textContent = 'حفظ التسجيل';
    }
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function renderRecordingCard(item) {
    const name = item.display_name?.trim() || 'بدون اسم';
    const meta = [item.song, item.voice, item.segment].filter(Boolean).join(' · ');
    return `
      <article class="recording-card" data-recording-id="${escapeHtml(item.id)}">
        <div class="recording-card-top">
          <span class="recording-kicker">${escapeHtml(item.song || 'تسجيل')}</span>
          <strong>${escapeHtml(name)}</strong>
          <p>${escapeHtml(meta)}</p>
        </div>
        <div class="recording-card-footer">
          <button class="recording-play" type="button" data-recording-play data-audio-url="${escapeHtml(item.audio_url)}">▶ استمع</button>
          <time datetime="${escapeHtml(item.created_at || '')}">${escapeHtml(formatDate(item.created_at))}</time>
        </div>
      </article>`;
  }

  function stopCardAudio() {
    if (state.playingAudio) {
      try { state.playingAudio.pause(); state.playingAudio.currentTime = 0; } catch (_) {}
    }
    if (state.playingButton) {
      state.playingButton.classList.remove('is-playing');
      state.playingButton.textContent = '▶ استمع';
    }
    state.playingAudio = null;
    state.playingButton = null;
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-recording-play]');
    if (!button) return;
    if (state.playingButton === button) {
      stopCardAudio();
      return;
    }
    stopCardAudio();
    const url = button.dataset.audioUrl;
    if (!url) return;
    const audio = new Audio(url);
    audio.preload = 'none';
    state.playingAudio = audio;
    state.playingButton = button;
    try {
      await audio.play();
      button.classList.add('is-playing');
      button.textContent = '■ إيقاف';
      audio.addEventListener('ended', stopCardAudio, { once: true });
    } catch (_) {
      stopCardAudio();
    }
  });

  async function fetchRecordings({ limit = 6, page = 1, song = '', voice = '' } = {}) {
    const params = new URLSearchParams({ limit: String(limit), page: String(page) });
    if (song) params.set('song', song);
    if (voice) params.set('voice', voice);
    const response = await fetch(`${API_BASE}/list.php?${params.toString()}`, { headers: { 'Accept': 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'list_failed');
    return payload;
  }

  async function loadLatest(force = false) {
    const grid = qs('#latestRecordings');
    const status = qs('#latestRecordingsState');
    if (!grid || (grid.dataset.loaded === '1' && !force)) return;
    status.textContent = 'جارٍ تحميل أحدث التسجيلات…';
    try {
      const data = await fetchRecordings({ limit: 6, page: 1 });
      grid.innerHTML = (data.items || []).map(renderRecordingCard).join('');
      grid.dataset.loaded = '1';
      status.textContent = data.items?.length ? '' : 'لم تُحفظ تسجيلات بعد.';
    } catch (_) {
      grid.innerHTML = '';
      status.textContent = location.hostname.endsWith('github.io')
        ? 'سيظهر هذا القسم بعد نقل الموقع إلى الاستضافة وتفعيل الحفظ.'
        : 'تعذّر تحميل التسجيلات الآن.';
    }
  }

  function setupLatest() {
    const section = qs('[data-recordings-latest]');
    if (!section) return;
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          loadLatest();
        }
      }, { rootMargin: '240px 0px' });
      observer.observe(section);
    } else {
      loadLatest();
    }
    document.addEventListener('oros:recording-saved', () => loadLatest(true));
  }

  async function loadArchive() {
    const grid = qs('#recordingsArchive');
    const status = qs('#recordingsArchiveState');
    const pageLabel = qs('#recordingsPageLabel');
    const prev = qs('#recordingsPrev');
    const next = qs('#recordingsNext');
    if (!grid) return;

    status.textContent = 'جارٍ تحميل التسجيلات…';
    stopCardAudio();
    try {
      const data = await fetchRecordings({
        limit: 12,
        page: state.archivePage,
        song: state.archiveSong,
        voice: state.archiveVoice
      });
      state.archivePages = Math.max(1, Number(data.pages) || 1);
      if (state.archivePage > state.archivePages) {
        state.archivePage = state.archivePages;
        return loadArchive();
      }
      grid.innerHTML = (data.items || []).map(renderRecordingCard).join('');
      status.textContent = data.items?.length ? '' : 'لا توجد تسجيلات مطابقة.';
      if (pageLabel) pageLabel.textContent = `${state.archivePage} / ${state.archivePages}`;
      if (prev) prev.disabled = state.archivePage <= 1;
      if (next) next.disabled = state.archivePage >= state.archivePages;
      syncArchiveUrl();
    } catch (_) {
      grid.innerHTML = '';
      status.textContent = location.hostname.endsWith('github.io')
        ? 'سيعمل أرشيف التسجيلات بعد نقل الموقع إلى الاستضافة.'
        : 'تعذّر تحميل التسجيلات الآن.';
      if (prev) prev.disabled = true;
      if (next) next.disabled = true;
    }
  }

  function syncArchiveUrl() {
    if (!qs('[data-recordings-page]')) return;
    const params = new URLSearchParams();
    if (state.archivePage > 1) params.set('page', String(state.archivePage));
    if (state.archiveSong) params.set('song', state.archiveSong);
    if (state.archiveVoice) params.set('voice', state.archiveVoice);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
  }

  function setupArchive() {
    if (!qs('[data-recordings-page]')) return;
    const params = new URLSearchParams(location.search);
    state.archivePage = Math.max(1, Number(params.get('page')) || 1);
    state.archiveSong = params.get('song') || '';
    state.archiveVoice = params.get('voice') || '';

    const song = qs('#recordingSongFilter');
    const voice = qs('#recordingVoiceFilter');
    if (song) song.value = state.archiveSong;
    if (voice) voice.value = state.archiveVoice;

    qs('#recordingsFilterForm')?.addEventListener('submit', event => {
      event.preventDefault();
      state.archiveSong = song?.value || '';
      state.archiveVoice = voice?.value || '';
      state.archivePage = 1;
      loadArchive();
    });
    qs('#recordingsPrev')?.addEventListener('click', () => {
      if (state.archivePage > 1) { state.archivePage -= 1; loadArchive(); }
    });
    qs('#recordingsNext')?.addEventListener('click', () => {
      if (state.archivePage < state.archivePages) { state.archivePage += 1; loadArchive(); }
    });
    loadArchive();
  }

  const takeObserver = new MutationObserver(syncSavePanel);
  takeObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });

  setupLatest();
  setupArchive();
})();

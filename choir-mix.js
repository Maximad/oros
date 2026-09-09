(() => {
  const MIX_URLS = {
    'وصلة تراثية': 'https://aswat.habaq.online/assets/audio/wasla-turathiya/all-voices.mp3',
    'ديرتي': 'https://aswat.habaq.online/assets/audio/Deerty/all-voices.mp3'
  };

  let mixAudio = null;
  let mixUrl = null;
  let bypassNextAllClick = false;

  function currentSongTitle() {
    return document.querySelector('#dialogTitle')?.textContent?.trim() || '';
  }

  function currentVolume() {
    const control = document.querySelector('#masterVolume');
    if (!control) return 1;
    const value = Number(control.value);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  }

  function allVoicesButton() {
    return document.querySelector('#playAllVoices');
  }

  function setButtonState(playing) {
    const button = allVoicesButton();
    if (!button) return;

    button.classList.toggle('is-playing', playing);
    const icon = button.querySelector('.player-icon');
    const label = button.querySelector('.all-label');

    if (icon) icon.textContent = playing ? '■' : '▶';
    if (label) label.textContent = playing ? 'إيقاف الأصوات' : 'استمع إلى الأصوات كلها';
  }

  function stopMix(reset = false) {
    if (!mixAudio) {
      setButtonState(false);
      return;
    }

    mixAudio.pause();
    if (reset) {
      try { mixAudio.currentTime = 0; } catch (_) {}
    }
    setButtonState(false);
  }

  function ensureMix(url) {
    if (mixAudio && mixUrl === url) return mixAudio;

    stopMix(true);
    mixUrl = url;
    mixAudio = new Audio(url);
    mixAudio.preload = 'metadata';
    mixAudio.volume = currentVolume();
    mixAudio.addEventListener('ended', () => setButtonState(false));
    mixAudio.addEventListener('error', () => setButtonState(false));
    return mixAudio;
  }

  function resetSoloButtons() {
    document.querySelectorAll('.player-button').forEach((button) => {
      button.textContent = '▶';
      button.classList.remove('is-playing');
    });
  }

  document.addEventListener('click', async (event) => {
    const allButton = event.target.closest('#playAllVoices');

    if (allButton) {
      if (bypassNextAllClick) {
        bypassNextAllClick = false;
        return;
      }

      const url = MIX_URLS[currentSongTitle()];
      if (!url) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const audio = ensureMix(url);

      if (!audio.paused) {
        stopMix(false);
        return;
      }

      document.querySelectorAll('.voice-audio').forEach((track) => track.pause());
      resetSoloButtons();
      audio.volume = currentVolume();

      try {
        audio.currentTime = 0;
        await audio.play();
        setButtonState(true);
      } catch (error) {
        // If the pre-mixed file is unavailable, fall back to the original
        // six-track playback rather than leaving the control unusable.
        stopMix(true);
        bypassNextAllClick = true;
        allButton.click();
      }
      return;
    }

    if (event.target.closest('[data-play-track], #listenSegment, #recordTake, #playTake, #nextSegment, [data-segment]')) {
      stopMix(false);
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target.matches('#masterVolume') && mixAudio) {
      mixAudio.volume = currentVolume();
    }
  }, true);

  const dialog = document.querySelector('#songDialog');
  if (dialog) {
    dialog.addEventListener('close', () => stopMix(true));
    dialog.addEventListener('cancel', () => stopMix(true));
  }
})();

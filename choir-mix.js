(() => {
  const VOICES = [
    { key:'soprano', name:'سوبرانو', file:'soprano.mp3', desc:'أعلى طبقة في التوزيع؛ صوت مشرق وواضح يعلو فوق بقية الأصوات.' },
    { key:'alto', name:'ألتو', file:'alto.mp3', desc:'طبقة متوسطة دافئة تربط الأصوات العليا بالطبقات الوسطى.' },
    { key:'konter', name:'كاونتر تينور', file:'konter.mp3', desc:'صوت رجالي مرتفع في مجال قريب من الألتو، يضيف لوناً خفيفاً للهارموني.' },
    { key:'tenor', name:'تينور', file:'tenor.mp3', desc:'أعلى الطبقات الرجالية التقليدية، ويقع في المجال المتوسط والعالي.' },
    { key:'bass', name:'باس', file:'bass.mp3', desc:'طبقة رجالية منخفضة تمنح التوزيع العمق والثبات.' },
    { key:'dubl', name:'دوبل باس', file:'dubl.mp3', desc:'أعمق طبقة في هذا التوزيع، وتثبّت القاعدة المنخفضة للهارموني.' }
  ];

  const SONGS = {
    'وصلة تراثية': {
      id:'wasla-turathiya', duration:64.86, base:'https://aswat.habaq.online/assets/audio/wasla-turathiya/',
      segments:[
        { label:'المقطع الأول', start:0, end:25.4, lyrics:null },
        { label:'المقطع الثاني', start:25.4, end:42.1, lyrics:null },
        { label:'المقطع الثالث', start:42.1, end:64.86, lyrics:null }
      ]
    },
    'ديرتي': {
      id:'deerty', duration:66.85, base:'https://aswat.habaq.online/assets/audio/Deerty/',
      segments:[
        { label:'المقطع الأول', start:0, end:18.7, lyrics:null },
        { label:'المقطع الثاني', start:18.7, end:49.5, lyrics:null },
        { label:'المقطع الثالث', start:49.5, end:66.85, lyrics:null }
      ]
    }
  };

  const detail = document.querySelector('#songDetail');
  const dialog = document.querySelector('#songDialog');
  if (!detail || !dialog) return;

  let song = null;
  let voiceIndex = null;
  let segmentIndex = 0;
  let volume = 1;
  let monitor = null;
  let mode = null;
  let recorder = null;
  let micStream = null;
  let chunks = [];
  let takeUrl = null;
  let takeAudio = null;
  let audioContext = null;

  const $ = (sel) => detail.querySelector(sel);
  const $$ = (sel) => [...detail.querySelectorAll(sel)];
  const fmt = (sec) => `${Math.floor(sec/60)}:${Math.floor(sec%60).toString().padStart(2,'0')}`;
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  function peaks(key) {
    if (!song) return [];
    return window.OROS_WAVEFORMS?.[song.id]?.[key] || [];
  }

  function waveMarkup(values, id) {
    if (!values.length) return `<div class="coach-wave empty" id="${id}"></div>`;
    return `<div class="coach-wave" id="${id}" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${values.map(v => `<i style="--h:${Math.max(8,Math.round(v*100))}%"></i>`).join('')}</div>`;
  }

  function setWave(id, ratio) {
    const wave = $(`#${id}`); if (!wave) return;
    const bars = [...wave.children];
    const count = Math.round(Math.max(0,Math.min(1,ratio || 0))*bars.length);
    bars.forEach((bar,i) => bar.classList.toggle('played', i < count));
    wave.setAttribute('aria-valuenow', String(Math.round((ratio||0)*100)));
  }

  function voiceAudio() { return $('#coachVoiceAudio'); }
  function mixAudio() { return $('#coachMixAudio'); }
  function segment() { return song.segments[segmentIndex]; }

  function clearMonitor() { if (monitor) { clearInterval(monitor); monitor = null; } }

  function resetButtons() {
    const vp = $('#coachVoicePlay'); if (vp) { vp.textContent='▶'; vp.classList.remove('is-playing'); }
    const mp = $('#coachMixPlay'); if (mp) { mp.querySelector('.player-icon').textContent='▶'; mp.querySelector('.all-label').textContent='استمع إلى الكورال كاملاً'; mp.classList.remove('is-playing'); }
    const sp = $('#coachSegmentListen'); if (sp) sp.textContent='استمع إلى صوتك في هذا المقطع';
  }

  function stopAll(reset=false) {
    clearMonitor();
    [voiceAudio(), mixAudio(), takeAudio].filter(Boolean).forEach(a => { a.pause(); if(reset){ try{a.currentTime=0;}catch(_){}} });
    mode = null;
    resetButtons();
  }

  function monitorUntil(audio, end, done) {
    clearMonitor();
    monitor = setInterval(() => {
      if (!audio || audio.currentTime >= end || audio.ended) {
        clearMonitor(); audio?.pause(); mode=null; resetButtons(); if(done) done();
      }
    }, 60);
  }

  function applyVolume() {
    [voiceAudio(), mixAudio(), takeAudio].filter(Boolean).forEach(a => a.volume=volume);
    const out=$('#coachVolumeValue'); if(out) out.textContent=`${Math.round(volume*100)}%`;
  }

  function clearTake() {
    if(takeUrl) URL.revokeObjectURL(takeUrl);
    takeUrl=null; takeAudio=null; chunks=[];
    const btn=$('#coachPlayTake'); if(btn) btn.disabled=true;
    const prev=$('#coachTakePreview'); if(prev) prev.hidden=true;
  }

  function updateSummary() {
    const s=$('#coachSummary'); if(!s) return;
    const seg=segment();
    s.innerHTML=`<span><strong>الصوت:</strong> ${voiceIndex===null?'لم يُحدّد بعد':VOICES[voiceIndex].name}</span><span><strong>المقطع:</strong> ${seg.label}</span><span>${fmt(seg.start)} – ${fmt(seg.end)}</span>`;
  }

  function updateSegment() {
    stopAll(false); clearTake();
    $$('[data-coach-segment]').forEach(b=>b.classList.toggle('active',Number(b.dataset.coachSegment)===segmentIndex));
    const seg=segment();
    const info=$('#coachSegmentInfo'); if(info) info.innerHTML=`<strong>${seg.label}</strong><span>${fmt(seg.start)} – ${fmt(seg.end)}</span>`;
    const words=$('#coachLyrics'); if(words){ words.textContent=seg.lyrics || 'الكلمات قيد الإضافة.'; words.classList.toggle('is-empty',!seg.lyrics); }
    const next=$('#coachNext'); if(next) next.disabled=segmentIndex>=song.segments.length-1;
    const status=$('#coachStatus'); if(status) status.textContent=voiceIndex===null?'اختر طبقتك أولاً.':'استمع إلى صوتك في المقطع، ثم سجّل محاولتك.';
    updateSummary();
  }

  function selectVoice(index) {
    voiceIndex=index; stopAll(false); clearTake();
    $$('[data-coach-voice]').forEach(b=>b.classList.toggle('active',Number(b.dataset.coachVoice)===index));
    const v=VOICES[index], audio=voiceAudio();
    audio.src=song.base+v.file; audio.load(); audio.volume=volume;
    $('#coachVoiceName').textContent=v.name;
    $('#coachVoiceDesc').textContent=v.desc;
    $('#coachWaveWrap').innerHTML=waveMarkup(peaks(v.key),'coachVoiceWave');
    $('#coachVoiceTime').textContent=`0:00 / ${fmt(song.duration)}`;
    $('#coachSegmentListen').disabled=false;
    $('#coachRecord').disabled=false;
    updateSummary();
    $('#coachStatus').textContent='استمع إلى صوتك في المقطع، ثم سجّل محاولتك.';
  }

  async function playVoiceFull() {
    if(voiceIndex===null) return;
    const a=voiceAudio();
    if(mode==='voice-full'&&!a.paused){ stopAll(false); return; }
    stopAll(false); a.volume=volume;
    try{ await a.play(); mode='voice-full'; $('#coachVoicePlay').textContent='■'; $('#coachVoicePlay').classList.add('is-playing'); }catch(_){ }
  }

  async function playMixFull() {
    const a=mixAudio(); if(!a) return;
    if(mode==='mix-full'&&!a.paused){ stopAll(false); return; }
    stopAll(false); a.currentTime=0; a.volume=volume;
    try{ await a.play(); mode='mix-full'; $('#coachMixPlay').classList.add('is-playing'); $('#coachMixPlay .player-icon').textContent='■'; $('#coachMixPlay .all-label').textContent='إيقاف الكورال'; }catch(_){ $('#coachStatus').textContent='تعذّر تشغيل المزيج الكامل.'; }
  }

  async function playVoiceSegment(recording=false, done=null) {
    if(voiceIndex===null) return;
    const a=voiceAudio(), seg=segment();
    stopAll(false); a.currentTime=seg.start; a.volume=volume;
    try{
      await a.play(); mode=recording?'recording':'segment';
      if(!recording) $('#coachSegmentListen').textContent='إيقاف المقطع';
      monitorUntil(a,seg.end,done);
    }catch(_){ }
  }

  function ensureContext(){ if(!audioContext){ const C=window.AudioContext||window.webkitAudioContext; if(C) audioContext=new C(); } return audioContext; }
  function beep(freq){ const c=ensureContext(); if(!c) return; const o=c.createOscillator(),g=c.createGain(); o.frequency.value=freq; g.gain.value=.05; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+.09); }

  async function countIn(){ const box=$('#coachCount'); box.hidden=false; for(const n of [3,2,1]){ box.textContent=n; beep(n===1?980:720); await delay(650); } box.textContent='ابدأ'; beep(1120); await delay(280); box.hidden=true; }

  function stopMic(){ if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; } }

  async function blobPeaks(blob,bins=64){
    try{ const c=ensureContext(); if(!c) return []; const b=await blob.arrayBuffer(),d=await c.decodeAudioData(b.slice(0)),x=d.getChannelData(0),size=Math.max(1,Math.floor(x.length/bins)),vals=[]; for(let i=0;i<bins;i++){ let p=0,start=i*size,end=i===bins-1?x.length:Math.min(x.length,start+size); for(let j=start;j<end;j++)p=Math.max(p,Math.abs(x[j])); vals.push(p); } const m=Math.max(...vals,.001); return vals.map(v=>Math.pow(v/m,.75)); }catch(_){ return []; }
  }

  async function recordTake(){
    if(voiceIndex===null) return;
    if(recorder?.state==='recording'){ stopAll(false); recorder.stop(); return; }
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){ $('#coachStatus').textContent='التسجيل عبر المتصفح غير مدعوم على هذا الجهاز.'; return; }
    clearTake(); stopAll(false);
    try{
      micStream=await navigator.mediaDevices.getUserMedia({audio:true}); recorder=new MediaRecorder(micStream); chunks=[];
      recorder.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
      recorder.onstop=async()=>{ const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'}); takeUrl=URL.createObjectURL(blob); takeAudio=new Audio(takeUrl); takeAudio.volume=volume; $('#coachPlayTake').disabled=false; const vals=await blobPeaks(blob); $('#coachTakeWave').innerHTML=waveMarkup(vals,'coachRecordedWave'); $('#coachTakePreview').hidden=false; $('#coachStatus').innerHTML='<strong>تم تسجيل المحاولة.</strong> استمع إليها مع الكورال أو أعد التسجيل.'; $('#coachRecord').textContent='سجّل صوتك'; $('#coachRecord').classList.remove('recording'); stopMic(); takeAudio.ontimeupdate=()=>setWave('coachRecordedWave',takeAudio.duration?takeAudio.currentTime/takeAudio.duration:0); };
      $('#coachRecord').classList.add('recording'); $('#coachRecord').textContent='استعد…'; $('#coachStatus').textContent='استعد. يبدأ التسجيل بعد العدّ التنازلي.';
      await countIn(); recorder.start(); $('#coachRecord').textContent='إيقاف التسجيل'; $('#coachStatus').textContent=`التسجيل جارٍ على صوت ${VOICES[voiceIndex].name}.`;
      await playVoiceSegment(true,()=>{ if(recorder?.state==='recording') recorder.stop(); });
    }catch(_){ stopMic(); $('#coachRecord').textContent='سجّل صوتك'; $('#coachRecord').classList.remove('recording'); $('#coachStatus').textContent='تعذّر الوصول إلى الميكروفون. تحقّق من إذن المتصفح.'; }
  }

  async function playTakeWithChoir(){
    if(!takeAudio) return; const m=mixAudio(),seg=segment(); stopAll(false); m.currentTime=seg.start; m.volume=volume; takeAudio.currentTime=0; takeAudio.volume=volume;
    try{ await Promise.all([m.play(),takeAudio.play()]); mode='take'; monitorUntil(m,seg.end,()=>{ takeAudio.pause(); takeAudio.currentTime=0; setWave('coachRecordedWave',0); }); }catch(_){ $('#coachStatus').textContent='تعذّر تشغيل تسجيلك مع الكورال.'; }
  }

  function build(title){
    song=SONGS[title]; if(!song) return; voiceIndex=null; segmentIndex=0; clearTake();
    detail.innerHTML=`<div class="coach-root" data-coach-root>
      <header class="coach-head"><div><p class="eyebrow">مساحة تدريب</p><h2 id="dialogTitle">${title}</h2><p class="song-meta">6 مسارات صوتية · ${fmt(song.duration)}</p></div><div class="coach-volume"><label>مستوى الصوت</label><input id="coachVolume" type="range" min="0" max="1" step=".01" value="${volume}"><output id="coachVolumeValue">${Math.round(volume*100)}%</output></div></header>
      <section class="coach-choose"><div class="coach-section-head"><div><p class="eyebrow">الخطوة الأولى</p><h3>اختر طبقتك</h3><p>اختر صوتاً واحداً للتدريب. يظهر وصفه ومساره هنا فقط.</p></div><button id="coachMixPlay" class="all-voices-button" type="button"><span class="player-icon">▶</span><span class="all-label">استمع إلى الكورال كاملاً</span></button></div>
      <div class="coach-voice-buttons">${VOICES.map((v,i)=>`<button type="button" data-coach-voice="${i}">${v.name}</button>`).join('')}</div>
      <div class="coach-selected"><button id="coachVoicePlay" class="player-button" type="button" disabled>▶</button><div><strong id="coachVoiceName">اختر أحد الأصوات</strong><p id="coachVoiceDesc">بعد الاختيار سيظهر وصف الطبقة ومسارها الصوتي.</p></div><div class="coach-timeline"><div id="coachWaveWrap"><div class="coach-wave empty"></div></div><span id="coachVoiceTime">0:00 / ${fmt(song.duration)}</span></div></div>
      <audio id="coachVoiceAudio" preload="metadata"></audio><audio id="coachMixAudio" preload="metadata" src="${song.base}all-voices.mp3"></audio></section>
      <section class="coach-practice"><div class="coach-section-head"><div><p class="eyebrow">الخطوة الثانية</p><h3>تعلّم الأغنية مقطعاً مقطعاً</h3><p>استمع إلى طبقتك، ثم سجّلها وقارنها بالكورال.</p></div><div class="coach-segments">${song.segments.map((s,i)=>`<button type="button" data-coach-segment="${i}" class="${i===0?'active':''}">${s.label}</button>`).join('')}</div></div>
      <div id="coachSummary" class="coach-summary"></div><div class="coach-lyrics"><span>الكلمات</span><p id="coachLyrics" class="is-empty">الكلمات قيد الإضافة.</p></div><div id="coachSegmentInfo" class="segment-info"></div>
      <div class="coach-flow"><article><span>01</span><strong>استمع</strong><p>اسمع طبقتك في المقطع قبل التسجيل.</p><button id="coachSegmentListen" class="training-action" type="button" disabled>استمع إلى صوتك في هذا المقطع</button></article><article class="coach-record"><span>02</span><strong>سجّل</strong><p>بعد العدّ 3، 2، 1 يبدأ الصوت ويبدأ التسجيل معه.</p><button id="coachRecord" class="training-action primary" type="button" disabled>سجّل صوتك</button><div id="coachCount" class="coach-count" hidden></div></article><article><span>03</span><strong>قارن</strong><p>استمع إلى تسجيلك مع المزيج الكامل للكورال.</p><button id="coachPlayTake" class="training-action" type="button" disabled>استمع إلى تسجيلك مع الكورال</button></article></div>
      <div id="coachTakePreview" class="coach-take" hidden><div><span class="eyebrow">تسجيلك</span><strong>المحاولة الحالية</strong></div><div id="coachTakeWave"></div></div><div class="coach-bottom"><p id="coachStatus">اختر طبقتك أولاً.</p><button id="coachNext" class="training-action" type="button">المقطع التالي</button></div><p class="segment-note">التسجيل يبقى على جهازك أثناء هذه الجلسة ولا يُرفع إلى الموقع. يُفضّل استخدام سماعات رأس.</p></section></div>`;

    const va=voiceAudio(),ma=mixAudio(); ma.volume=volume;
    va.ontimeupdate=()=>{ const d=Number.isFinite(va.duration)?va.duration:song.duration; setWave('coachVoiceWave',d?va.currentTime/d:0); $('#coachVoiceTime').textContent=`${fmt(va.currentTime)} / ${fmt(d)}`; };
    va.onended=()=>{ mode=null; resetButtons(); };
    ma.onended=()=>{ mode=null; resetButtons(); };
    updateSegment();
  }

  detail.addEventListener('click',async e=>{
    const vb=e.target.closest('[data-coach-voice]'); if(vb){ selectVoice(Number(vb.dataset.coachVoice)); $('#coachVoicePlay').disabled=false; return; }
    const sb=e.target.closest('[data-coach-segment]'); if(sb){ segmentIndex=Number(sb.dataset.coachSegment); updateSegment(); return; }
    if(e.target.closest('#coachVoicePlay')){ await playVoiceFull(); return; }
    if(e.target.closest('#coachMixPlay')){ await playMixFull(); return; }
    if(e.target.closest('#coachSegmentListen')){ if(mode==='segment') stopAll(false); else await playVoiceSegment(false); return; }
    if(e.target.closest('#coachRecord')){ await recordTake(); return; }
    if(e.target.closest('#coachPlayTake')){ await playTakeWithChoir(); return; }
    if(e.target.closest('#coachNext')&&segmentIndex<song.segments.length-1){ segmentIndex++; updateSegment(); }
  });

  detail.addEventListener('input',e=>{ if(e.target.matches('#coachVolume')){ volume=Number(e.target.value); applyVolume(); } });
  detail.addEventListener('pointerdown',e=>{ const w=e.target.closest('#coachVoiceWave'); if(!w||voiceIndex===null)return; const r=w.getBoundingClientRect(),ratio=(e.clientX-r.left)/r.width,a=voiceAudio(),d=Number.isFinite(a.duration)?a.duration:song.duration; a.currentTime=Math.max(0,Math.min(d,d*ratio)); });

  dialog.addEventListener('close',()=>{ stopAll(true); stopMic(); clearTake(); });
  dialog.addEventListener('cancel',()=>{ stopAll(true); stopMic(); clearTake(); });

  const observer=new MutationObserver(()=>{ if(detail.querySelector('[data-coach-root]'))return; const title=detail.querySelector('#dialogTitle')?.textContent?.trim(); if(title&&SONGS[title]) build(title); });
  observer.observe(detail,{childList:true,subtree:true});

  const wf=document.createElement('script'); wf.src='waveforms.js'; document.head.appendChild(wf);
})();

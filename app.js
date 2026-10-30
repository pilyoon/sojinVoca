'use strict';
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);
const INTERVAL = [0, 1, 2, 4, 7, 14]; // 박스별 복습 간격(일)
const MODEL = 'claude-sonnet-5-5';

// ---------- 저장소 ----------
let S = JSON.parse(localStorage.getItem('pv') || 'null') || {
  decks: [], words: {}, key: '', level: '초등 저학년',
  stats: { streak: 0, last: 0, tDay: 0, tCnt: 0, goal: 10 }
};
const save = () => localStorage.setItem('pv', JSON.stringify(S));
const mk = (word, ko, pos, ex, exKo, emoji, deck) =>
  ({ id: 'w_' + word.toLowerCase(), word, ko, pos, ex, exKo, emoji, deck, box: 0, due: 0, seen: 0, ok: 0, ng: 0 });
if (!S.decks.length) { // 첫 실행: 기본 단어장 (사진 단어장보다 항상 오래된 것으로 취급)
  S.decks.push({ id: 'starter', title: '🌱 기본 단어장', created: 0 });
  STARTER.forEach(r => { const w = mk(...r, 'starter'); S.words[w.id] = w; });
  save();
}
const latestDeck = () => S.decks.reduce((a, b) => b.created > a.created ? b : a);
const deckWords = id => Object.values(S.words).filter(w => w.deck === id);
const dayStats = () => { const s = S.stats, d = dayNum(); if (s.tDay !== d) { s.tDay = d; s.tCnt = 0; } return s; };

// ---------- 유틸 ----------
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
function speak(t) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = 0.85; speechSynthesis.speak(u);
}
const act = {};
app.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && act[el.dataset.a]) act[el.dataset.a](el.dataset, el); });

// ---------- 홈 ----------
function home() {
  const st = dayStats(), d = latestDeck(), ws = deckWords(d.id);
  const mastered = ws.filter(w => w.box >= 4).length;
  const total = Object.keys(S.words).length;
  const pct = Math.min(100, st.tCnt / st.goal * 100);
  app.innerHTML = `
    <div class="row sp"><h1>📸 포토보카</h1><button class="btn ghost sm" data-a="settings">⚙️ 설정</button></div>
    <div class="card row">
      <div class="stat"><b>🔥 ${st.streak}</b><span>연속 학습일</span></div>
      <div class="stat"><b>${total}</b><span>전체 단어</span></div>
      <div class="stat"><b>${Object.values(S.words).filter(w => w.box >= 4).length}</b><span>외운 단어</span></div>
    </div>
    <div class="card">
      <div class="row sp"><h2>오늘의 목표</h2><span class="mu">${st.tCnt} / ${st.goal}</span></div>
      <div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
    </div>
    <div class="card">
      <div class="mu" style="text-align:left">지금 학습 중인 단어장</div>
      <h2 style="margin:6px 0">${esc(d.title)}</h2>
      <div class="bar"><i style="width:${ws.length ? mastered / ws.length * 100 : 0}%"></i></div>
      <div class="mu" style="text-align:left;margin-top:6px">${ws.length}개 중 ${mastered}개 외움</div>
    </div>
    <button class="btn" data-a="learn">▶ 오늘의 학습 시작</button>
    <button class="btn sec" data-a="scan">📷 사진으로 새 단어 만들기</button>
    <button class="btn sec" data-a="decks">📚 단어장 보기</button>`;
}
act.home = home;

// ---------- 사진 → 단어 ----------
const MAX_SHOTS = 8;
let shots = []; // 한 번에 분석할 사진들 (모두 하나의 단어장이 됨)
act.scan = () => {
  if (!S.key) { toast('먼저 설정에서 API 키를 입력해 주세요'); return settings(); }
  shots = []; scanScreen();
};
function scanScreen() {
  app.innerHTML = `
    <div class="row sp"><h1>📷 사진으로 단어 만들기</h1><button class="btn ghost sm" data-a="home">닫기</button></div>
    <div class="card mu">학습지를 여러 장 찍어도 하나의 단어장으로 만들어요. (최대 ${MAX_SHOTS}장)<br>종이를 평평하게 펴고, 글씨가 또렷하게 나오도록 위에서 찍으면 더 정확해요.</div>
    ${shots.length ? `<div class="row" style="flex-wrap:wrap">${shots.map((s, i) => `
      <div style="position:relative"><img src="${s}" style="width:92px;height:92px;object-fit:cover;border-radius:12px">
      <button class="btn sm" style="position:absolute;top:-6px;right:-6px;padding:2px 8px;border-radius:50%" data-a="rmShot" data-i="${i}">✕</button></div>`).join('')}</div>
    <button class="btn" data-a="analyze">🔍 ${shots.length}장 분석하기</button>` : ''}
    <button class="btn ${shots.length ? 'sec' : ''}" data-a="shoot" ${shots.length >= MAX_SHOTS ? 'disabled' : ''}>📸 ${shots.length ? '한 장 더 ' : ''}카메라로 찍기</button>
    <button class="btn sec" data-a="pick" ${shots.length >= MAX_SHOTS ? 'disabled' : ''}>🖼️ 앨범에서 고르기 (여러 장 가능)</button>`;
}
act.shoot = () => $('#cam').click();
act.pick = () => $('#gallery').click();
act.rmShot = d => { shots.splice(+d.i, 1); scanScreen(); };
act.analyze = () => analyze();
['cam', 'gallery'].forEach(id => $('#' + id).addEventListener('change', async e => {
  const files = [...e.target.files].slice(0, MAX_SHOTS - shots.length); e.target.value = '';
  if (!files.length) return;
  try { for (const f of files) shots.push(await toJpeg(f)); } catch (err) { toast(err.message); }
  scanScreen();
}));

function toJpeg(file, max = 1800) { // 학습지의 작은 글씨를 읽기 위해 해상도를 높게 유지
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * r; c.height = img.height * r;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new Error('사진을 열 수 없어요'));
    img.src = url;
  });
}

async function analyze() {
  const imgs = shots;
  app.innerHTML = `<div class="spin"><i></i><div>사진 ${imgs.length}장에서 단어를 찾고 있어요...</div></div>`;
  try {
    const prompt = `첨부한 ${imgs.length}장의 사진은 한 어린이(${S.level})의 영어 학습지(교재·워크북) 페이지들로, 하나의 학습 범위입니다. 전체를 합쳐서 공부할 영어 단어를 ${imgs.length > 1 ? '최대 60개' : '최대 30개'} 뽑아주세요. 여러 페이지에 같은 단어가 나오면 한 번만 쓰세요.
- 페이지에 인쇄된 영어 단어/표현(단어 목록, 빈칸 문제, 지문, 보기, 그림 설명)만 대상으로 하세요. 그림 속 사물을 추측해서 만들지 마세요.
- 학습지에 단어 목록이 있으면 그 단어들을 우선하고, 한국어 뜻이 적혀 있으면 그 뜻을 따르세요. 없으면 문맥에 맞는 쉬운 뜻을 쓰세요.
- 단어는 소문자 기본형(a/the/is 같은 쉬운 기능어, 이름, 숫자 표기는 제외), 중복 금지. 구(phrase)는 학습지에 단어처럼 제시된 경우만 허용.
- ex는 학습지에 나온 문장이 있으면 그것을, 없으면 ${S.level} 수준의 짧은 영어 예문을 쓰세요. exKo는 예문 해석, emoji는 뜻을 나타내는 이모지 1개.
- title은 학습지의 단원/제목(예: "Unit 3 Animals")이 보이면 그것을, 없으면 내용을 나타내는 짧은 제목.
JSON만 출력하세요: {"title":"","words":[{"word":"","ko":"","pos":"n.|v.|adj.|adv.","ex":"","exKo":"","emoji":""}]}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': S.key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 10000,
        messages: [{ role: 'user', content: [
          ...imgs.map(d => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d.split(',')[1] } })),
          { type: 'text', text: prompt }] }]
      })
    });
    if (!r.ok) throw new Error(r.status === 401 ? 'API 키가 올바르지 않아요' : `분석 실패 (${r.status})`);
    const txt = (await r.json()).content.map(c => c.text || '').join('');
    const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('결과를 읽지 못했어요');
    const data = JSON.parse(m[0]);
    const words = (data.words || []).filter(w => w.word && w.ko);
    if (!words.length) throw new Error('단어를 찾지 못했어요. 다시 찍어볼까요?');
    review(imgs, data.title || '사진 단어장', words);
  } catch (e) {
    toast(e.message || '오류가 발생했어요'); scanScreen(); // 찍어둔 사진은 유지
  }
}

function review(imgs, title, words) {
  const sel = words.map(() => true);
  const draw = () => {
    app.innerHTML = `
      <h1>찾은 단어 ${words.length}개</h1>
      <div class="row" style="overflow-x:auto">${imgs.map(s => `<img src="${s}" style="height:110px;border-radius:10px;background:#fff">`).join('')}</div>
      <div class="opts">${words.map((w, i) => `
        <label class="chip ${sel[i] ? '' : 'off'}" style="margin:0;color:inherit">
          <input type="checkbox" data-i="${i}" ${sel[i] ? 'checked' : ''}>
          <span style="font-size:30px">${esc(w.emoji)}</span>
          <span class="w"><b>${esc(w.word)}</b> <small>${esc(w.pos)}</small><div>${esc(w.ko)} · ${esc(w.ex)}</div></span>
        </label>`).join('')}</div>
      <button class="btn" id="saveDeck">✅ ${sel.filter(Boolean).length}개 단어장에 저장</button>
      <button class="btn ghost" data-a="home">취소</button>`;
    app.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => { sel[cb.dataset.i] = cb.checked; draw(); });
    $('#saveDeck').onclick = () => {
      const picked = words.filter((_, i) => sel[i]); if (!picked.length) return toast('단어를 선택해 주세요');
      const deck = { id: 'd' + Date.now(), title: `📄 ${title}`, created: Date.now() };
      S.decks.push(deck);
      picked.forEach(p => {
        const id = 'w_' + p.word.toLowerCase();
        if (S.words[id]) S.words[id].deck = deck.id; // 이미 아는 단어는 진도 유지 + 최신 단어장으로 이동
        else S.words[id] = mk(p.word.toLowerCase(), p.ko, p.pos || '', p.ex || '', p.exKo || '', p.emoji || '🔤', deck.id);
      });
      save(); toast('새 단어장이 만들어졌어요!'); home();
    };
  };
  draw();
}

// ---------- 학습 세션 ----------
let Q = null;
function pickWords(practice) {
  const t = dayNum(), d = latestDeck(), all = Object.values(S.words);
  if (practice) return shuffle(deckWords(d.id)).slice(0, 10);
  const byRecent = id => (S.decks.find(x => x.id === id) || {}).created || 0;
  const due = all.filter(w => w.seen && w.due <= t).sort((a, b) => byRecent(b.deck) - byRecent(a.deck)).slice(0, 6);
  const fresh = all.filter(w => !w.seen).sort((a, b) => byRecent(b.deck) - byRecent(a.deck)).slice(0, 10 - due.length > 5 ? 5 : 10 - due.length);
  return [...due, ...fresh];
}
act.learn = (_, __, practice) => {
  const ws = pickWords(practice === true);
  if (!ws.length) {
    app.innerHTML = `<h1>🎉 오늘 할 학습을 모두 끝냈어요!</h1>
      <div class="card mu">복습할 단어가 아직 없어요. 최신 단어장으로 더 연습해 볼까요?</div>
      <button class="btn" data-a="practice">💪 더 연습하기</button>
      <button class="btn sec" data-a="scan">📷 새 사진 찍기</button>
      <button class="btn ghost" data-a="home">홈으로</button>`;
    return;
  }
  Q = { ids: ws.map(w => w.id), intro: ws.filter(w => !w.seen).map(w => w.id), queue: ws.map(w => ({ id: w.id })), done: 0, total: ws.length, okN: 0, ngN: 0 };
  Q.intro.length ? intro(0) : nextQ();
};
act.practice = () => act.learn({}, null, true);

function intro(i) {
  const w = S.words[Q.intro[i]];
  app.innerHTML = `
    <div class="row sp"><button class="btn ghost sm" data-a="quit">✕</button><span class="mu">새 단어 ${i + 1}/${Q.intro.length}</span></div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="emoji">${esc(w.emoji)}</div>
      <div class="big">${esc(w.word)}</div>
      <button class="spk" data-a="say" data-t="${esc(w.word)}">🔊</button>
      <div class="ko">${esc(w.ko)} <small class="mu">${esc(w.pos)}</small></div>
      <div class="ex">${esc(w.ex)}<br><span class="mu">${esc(w.exKo)}</span>
        <div><button class="btn ghost sm" data-a="say" data-t="${esc(w.ex)}">🔊 예문 듣기</button></div></div>
    </div>
    <button class="btn" data-a="introNext" data-i="${i + 1}">${i + 1 < Q.intro.length ? '다음 단어' : '퀴즈 시작!'}</button>`;
  speak(w.word);
}
act.say = d => speak(d.t);
act.introNext = d => +d.i < Q.intro.length ? intro(+d.i) : nextQ();
act.quit = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); Q = null; home(); };

function qType(w) {
  if (w.box <= 1) return 'en2ko';
  if (w.box === 2) return 'ko2en';
  if (w.box === 3) return 'listen';
  return /^[a-z]{2,10}$/.test(w.word) ? 'spell' : 'listen';
}
const pool = () => {
  const m = new Map(); Object.values(S.words).forEach(w => m.set(w.word, w));
  STARTER.forEach(r => { if (!m.has(r[0])) m.set(r[0], { word: r[0], ko: r[1] }); });
  return [...m.values()];
};

function nextQ() {
  if (!Q.queue.length) return finish();
  const cur = Q.queue.shift(), w = S.words[cur.id];
  const type = cur.retry ? 'en2ko' : qType(w);
  Q.cur = { ...cur, w, type };
  const head = `<div class="row sp"><button class="btn ghost sm" data-a="quit">✕</button>
    <div class="bar" style="flex:1"><i style="width:${Q.done / Q.total * 100}%"></i></div></div>`;
  if (type === 'spell') return spellQ(head, w);
  const key = type === 'en2ko' ? 'ko' : 'word';
  const wrong = shuffle(pool().filter(p => p.word !== w.word && p[key] !== w[key])).slice(0, 3);
  const opts = shuffle([w, ...wrong]);
  Q.cur.opts = opts;
  const prompt = {
    en2ko: `<div class="mu">뜻을 골라보세요</div><div class="big">${esc(w.word)}</div><button class="spk" data-a="say" data-t="${esc(w.word)}">🔊</button>`,
    ko2en: `<div class="mu">알맞은 영어 단어는?</div><div class="emoji">${esc(w.emoji)}</div><div class="ko">${esc(w.ko)}</div>`,
    listen: `<div class="mu">듣고 알맞은 단어를 골라보세요</div><button class="spk" style="width:96px;height:96px;font-size:48px" data-a="say" data-t="${esc(w.word)}">🔊</button>`
  }[type];
  app.innerHTML = `${head}<div class="card" style="display:flex;flex-direction:column;gap:12px;min-height:200px;justify-content:center">${prompt}</div>
    <div class="opts">${opts.map((o, i) => `<button class="opt" data-a="choose" data-i="${i}">${esc(o[key])}</button>`).join('')}</div>
    <div id="fb"></div>`;
  if (type !== 'ko2en') speak(w.word);
}

function grade(ok) { // 첫 시도만 학습 기록에 반영
  const { w, retry } = Q.cur;
  if (!retry) {
    w.seen++; ok ? w.ok++ : w.ng++;
    w.box = ok ? Math.min(5, w.box + 1) : 0;
    w.due = dayNum() + (ok ? INTERVAL[w.box] : 0);
    const st = dayStats(); st.tCnt++;
    ok ? Q.okN++ : Q.ngN++;
  }
  if (ok) Q.done++; else Q.queue.push({ id: w.id, retry: true });
  save();
}
function feedback(ok, extra = '') {
  const fb = $('#fb');
  if (ok) { fb.innerHTML = `<div class="ko" style="color:var(--ok)">👍 정답!</div>`; setTimeout(nextQ, 800); return; }
  const w = Q.cur.w;
  fb.innerHTML = `<div class="card" style="text-align:center"><b>정답: ${esc(w.word)}</b> (${esc(w.ko)})<br>${extra}</div>
    <button class="btn" data-a="next">다음</button>`;
  speak(w.word);
}
act.next = () => nextQ();
act.choose = d => {
  const { opts, w, type } = Q.cur, pick = opts[+d.i], ok = pick.word === w.word;
  const btns = app.querySelectorAll('.opt');
  btns.forEach((b, i) => { b.disabled = true; if (opts[i].word === w.word) b.classList.add('ok'); });
  if (!ok) { btns[+d.i].classList.add('ng', 'shake'); }
  grade(ok); feedback(ok);
};

function spellQ(head, w) {
  Q.spell = { ans: [], av: shuffle(w.word.split('').map((c, i) => ({ c, i, used: false }))) };
  const draw = () => {
    const sp = Q.spell, filled = sp.ans.length === w.word.length;
    app.innerHTML = `${head}<div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="mu">철자를 맞춰보세요</div><div class="emoji">${esc(w.emoji)}</div><div class="ko">${esc(w.ko)}</div>
      <button class="spk" data-a="say" data-t="${esc(w.word)}">🔊</button></div>
      <div class="tiles">${w.word.split('').map((_, k) => sp.ans[k] ? `<button class="tile" data-a="unspell" data-k="${k}">${sp.ans[k].c}</button>` : `<span class="tile slot"></span>`).join('')}</div>
      <div class="tiles">${sp.av.map((t, k) => `<button class="tile" ${t.used ? 'style="opacity:.25" disabled' : ''} data-a="spell" data-k="${k}">${t.c}</button>`).join('')}</div>
      <div id="fb"></div>`;
    if (filled) {
      const ok = sp.ans.map(t => t.c).join('') === w.word;
      app.querySelectorAll('.tiles:first-of-type .tile').forEach(t => { t.classList.add(ok ? 'ok' : 'ng'); t.disabled = true; });
      app.querySelectorAll('.tiles:last-of-type .tile').forEach(t => t.disabled = true);
      grade(ok); feedback(ok);
    }
  };
  Q.spell.draw = draw; draw();
}
act.spell = d => { const sp = Q.spell, t = sp.av[+d.k]; t.used = true; sp.ans.push(t); sp.draw(); };
act.unspell = d => { const sp = Q.spell; const [t] = sp.ans.splice(+d.k, 1); t.used = false; sp.draw(); };

function finish() {
  const s = dayStats(), d = dayNum();
  if (s.last !== d) { s.streak = s.last === d - 1 ? s.streak + 1 : 1; s.last = d; }
  save();
  const tot = Q.okN + Q.ngN, pct = tot ? Math.round(Q.okN / tot * 100) : 100;
  app.innerHTML = `<div class="emoji" style="margin-top:30px">${pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '💪'}</div>
    <h1 style="text-align:center">학습 완료!</h1>
    <div class="card row"><div class="stat"><b>${Q.okN}</b><span>한 번에 맞춤</span></div>
      <div class="stat"><b>${Q.ngN}</b><span>다시 볼 단어</span></div><div class="stat"><b>${pct}%</b><span>정답률</span></div></div>
    <div class="card" style="text-align:center">🔥 ${s.streak}일 연속 학습 중 · 오늘 ${s.tCnt}/${s.goal}</div>
    <button class="btn" data-a="learn">한 번 더 학습</button>
    <button class="btn ghost" data-a="home">홈으로</button>`;
  Q = null;
}

// ---------- 단어장 ----------
act.decks = () => {
  const ds = [...S.decks].sort((a, b) => b.created - a.created);
  app.innerHTML = `<div class="row sp"><h1>📚 단어장</h1><button class="btn ghost sm" data-a="home">닫기</button></div>
    ${ds.map((d, i) => {
      const ws = deckWords(d.id);
      return `<div class="card"><div class="row sp"><h2>${esc(d.title)}</h2>
        ${d.id !== 'starter' ? `<button class="btn ghost sm" data-a="delDeck" data-id="${d.id}">🗑</button>` : ''}</div>
        <div class="mu" style="text-align:left;margin:4px 0 8px">${i === 0 ? '⭐ 현재 학습 중 · ' : ''}${ws.length}개 · ${d.created ? new Date(d.created).toLocaleDateString('ko-KR') : '기본'}</div>
        <div style="line-height:1.9">${ws.map(w => `<span title="${esc(w.ko)}" style="display:inline-block;margin:2px;padding:2px 10px;border-radius:12px;background:${w.box >= 4 ? '#dcfce7' : '#eef2ff'}">${esc(w.emoji)} ${esc(w.word)}</span>`).join('')}</div></div>`;
    }).join('')}`;
};
act.delDeck = d => {
  if (!confirm('이 단어장을 삭제할까요?')) return;
  Object.values(S.words).forEach(w => { if (w.deck === d.id) delete S.words[w.id]; });
  S.decks = S.decks.filter(x => x.id !== d.id); save(); act.decks();
};

// ---------- 설정 ----------
function settings() {
  app.innerHTML = `<div class="row sp"><h1>⚙️ 설정</h1><button class="btn ghost sm" data-a="home">닫기</button></div>
    <div class="card"><label>Anthropic API 키 (사진 분석용 · 이 기기에만 저장돼요)</label>
      <input type="password" id="key" value="${esc(S.key)}" placeholder="sk-ant-..."></div>
    <div class="card"><label>하루 목표 (문제 수)</label>
      <input type="number" id="goal" min="1" max="500" inputmode="numeric" value="${S.stats.goal}"></div>
    <button class="btn" id="saveSet">저장</button>
    <button class="btn ghost" id="reset">모든 학습 기록 초기화</button>`;
  $('#saveSet').onclick = () => {
    const goal = Math.round(+$('#goal').value);
    if (!(goal >= 1 && goal <= 500)) return toast('하루 목표는 1~500 사이 숫자로 입력해 주세요');
    S.key = $('#key').value.trim(); S.stats.goal = goal; save(); toast('저장했어요'); home();
  };
  $('#reset').onclick = () => { if (confirm('정말 모두 지울까요?')) { localStorage.removeItem('pv'); location.reload(); } };
}
act.settings = settings;

home();

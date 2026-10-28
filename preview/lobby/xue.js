/* =========================================================
 * 穴位小卡：輕點穴點，旁邊浮出毛玻璃框，顯示「部位」（紅字）與「取穴法」
 *   資料：model/xue.json（整理自使用者提供的針灸科學筆記，依穴位代碼 SI4 等）
 *   同一穴快速點兩下：照舊打開那條經的資訊
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { camera, canvas, stage, view, points: PT } = L;
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let XUE = null;
  fetch('model/xue.json').then(r => r.json()).then(d => { XUE = d; if (cur) fill(cur); }).catch(() => { XUE = {}; });

  const card = document.createElement('aside');
  card.className = 'xue';
  card.setAttribute('aria-live', 'polite');
  stage.appendChild(card);

  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function nearestPoint(cx, cy, tol) {
    if (!view.showPoints) return null;
    const r = canvas.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    let best = null, bd = tol;
    // 只算畫面上看得到的穴點（和 lobby.js 穴點淡入的距離一樣）；全身遠景時點經絡就好，不跳穴位小卡
    const dist = camera.position.distanceTo(L.controls.target), sel = L.selected;
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (const o of PT) {
      const vis = o.m.id === sel ? (o.major ? ss(42, 32, dist) : ss(26, 19, dist)) : (o.major ? ss(22, 16, dist) : ss(13, 9.5, dist));
      if (vis < 0.5) continue;
      if (_w.subVectors(camera.position, o.p).normalize().dot(o.n) < (view.opaque > 0.5 ? 0.05 : -0.3)) continue;
      _v.copy(o.p).project(camera);
      if (_v.z > 1) continue;
      const d = Math.hypot((_v.x + 1) / 2 * r.width - x, (1 - _v.y) / 2 * r.height - y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /* 小卡最下面 ＋：自己補充（可加、可改、清空就刪掉）；存在這台裝置（tcm-xnote-v1，依穴位代碼），有設定 GitHub 同步時合併到 tcm-notes sync/xnote.json */
  const XNK = 'tcm-xnote-v1', XN_URL = 'https://api.github.com/repos/janetlo8321/tcm-notes/contents/sync/xnote.json';
  const xnAll = () => { try { const a = JSON.parse(localStorage.getItem(XNK) || '{}'); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (e) { return {}; } };
  const xnStore = a => { try { localStorage.setItem(XNK, JSON.stringify(a)); } catch (e) {} };
  const xnOf = k => ((xnAll()[k] || {}).list || []).slice();
  function xnSave(k, list) { const a = xnAll(); a[k] = { list, t: Date.now() }; xnStore(a); clearTimeout(xnSync.t); xnSync.t = setTimeout(() => xnSync(true), 1200); }
  async function xnSync(push) {
    let tok = ''; try { tok = localStorage.getItem('tcm-gh-token-v1') || ''; } catch (e) {}
    if (!tok) return;
    const b64e = t => btoa(unescape(encodeURIComponent(t))), b64d = t => decodeURIComponent(escape(atob(t.replace(/\s/g, ''))));
    try {
      const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      const r = await fetch(XN_URL + '?t=' + Date.now(), { headers: H, cache: 'no-store' });
      let remote = {}, sha;
      if (r.ok) { const j = await r.json(); sha = j.sha; try { remote = JSON.parse(b64d(j.content)) || {}; } catch (e) {} }
      const merged = { ...remote }, mine = xnAll();
      Object.keys(mine).forEach(k => { if (!merged[k] || (mine[k].t || 0) > (merged[k].t || 0)) merged[k] = mine[k]; });   // 只加或取較新的
      const changed = JSON.stringify(merged) !== JSON.stringify(mine);
      xnStore(merged);
      if (changed && cur && !card.contains(document.activeElement)) fill(cur);
      if (push && JSON.stringify(merged) !== JSON.stringify(remote))
        await fetch(XN_URL, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '同步穴位補充', content: b64e(JSON.stringify(merged, null, 1)), ...(sha ? { sha } : {}) }) });
    } catch (e) {}
  }
  // 補充一排一排加；多出來的超過原本小卡高度的 1/3，就固定高度、小卡右邊出現滾動欄
  function xnFit(toEnd) {
    card.style.maxHeight = '';
    const ps = [...card.querySelectorAll('.xue-my-t')];
    const extra = ps.reduce((h, p) => h + p.offsetHeight, 0), base = card.scrollHeight - extra;
    if (extra > base / 3) card.style.maxHeight = Math.min(Math.round(base * 4 / 3), card.getBoundingClientRect().height || 1e9) + 'px';
    if (toEnd) card.scrollTop = card.scrollHeight;
  }
  const xnRead = () => [...card.querySelectorAll('.xue-my-t')].map(p => p.innerText.replace(/\n+$/, ''));
  card.addEventListener('input', e => { if (!e.target.closest('.xue-my-t') || !cur) return; xnSave(cur.m.id + cur.no, xnRead()); xnFit(false); });
  card.addEventListener('focusout', e => {
    const p = e.target.closest && e.target.closest('.xue-my-t'); if (!p || !cur) return;
    if (p.innerText.trim()) return;
    p.remove(); xnSave(cur.m.id + cur.no, xnRead().filter(t => t.trim()));
    card.querySelectorAll('.xue-my-t').forEach((q, i) => { q.dataset.xn = i; });
    xnFit(false);
  });
  card.addEventListener('keydown', e => { if (e.target.closest && e.target.closest('.xue-my-t')) e.stopPropagation(); });   // 打字時 Esc 等鍵不要收起小卡
  card.addEventListener('paste', e => {   // 貼上只留純文字，字型跟小卡一樣
    if (!e.target.closest || !e.target.closest('.xue-my-t') || !e.clipboardData) return;
    e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  xnSync(false);

  let cur = null, last = null, lit = null;   // lit：資訊欄下拉選的穴，只亮燈不跳小卡
  function fill(o) {
    const d = XUE && XUE[o.m.id + o.no];
    card.dataset.hlk = 'x:' + o.m.id + o.no;
    const ps = a => (a || []).map(t => `<p>${E(t)}</p>`).join('');
    card.innerHTML = `<button type="button" class="xue-x" aria-label="關閉">✕</button>
      <header><button type="button" class="xue-mback" aria-label="回到${E(o.m.name)}" title="回到${E(o.m.name)}">«</button><b>${E(o.name)}</b><small>${E(o.m.id + o.no)}・${E(o.m.name)}</small></header>
      ${d ? `<section><h4>部位</h4><div class="xue-pos">${ps(d.pos)}</div></section>${d.take && d.take.length ? `<section><h4>取穴法</h4>${ps(d.take)}</section>` : ''}`
        : `<p class="xue-none">${XUE ? '筆記裡沒有這個穴的部位資料' : '載入中…'}</p>`}
      <section class="xue-my">${xnOf(o.m.id + o.no).map((t, i) => `<p class="xue-my-t" contenteditable="true" spellcheck="false" data-xn="${i}" title="輕點可以修改；清空就刪掉">${E(t)}</p>`).join('')}<button type="button" class="xue-my-add" data-xnadd title="自己補充">＋</button></section>`;
    card.scrollTop = 0;
    requestAnimationFrame(() => xnFit(false));
  }
  let shownAt = 0;
  function show(o) {
    cur = o; lit = null; shownAt = performance.now();
    fill(o);
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    place();
  }
  function hide() { cur = null; hov = false; card.classList.remove('show'); }
  let hov = false, hovT = 0;
  // 小卡固定位置（電腦：左下角；手機：腳底），不再跟著穴點跑，也就不會蓋到人或抖動
  // 手機上小卡佔掉下半部，畫面往上移小卡高度的一半，人仍在可見區域中間，一樣可以放大縮小
  const PHONE = matchMedia('(max-aspect-ratio: 3/4), (max-width: 600px)');
  let off = 0;
  function place() {
    const g = cur || lit;
    const away = !!g && _w.subVectors(camera.position, g.p).normalize().dot(g.n) < (view.opaque > 0.5 ? 0.05 : -0.3);
    glow.material.opacity = away ? 0 : 1;
    stage.classList.toggle('xue-on', !!cur);
    const want = cur && PHONE.matches ? card.offsetHeight / 2 : 0;
    if (Math.abs(want - off) < 0.5) { if (off === want) return; off = want; } else off += (want - off) * 0.18;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (off > 0.5 && w && h) camera.setViewOffset(w, h, 0, off, w, h); else { off = 0; camera.clearViewOffset(); }
  }
  // 亮點：選到的穴像一盞小燈（加法混色的光暈，會微微呼吸）
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.18, 'rgba(255,236,170,.95)'); r.addColorStop(0.45, 'rgba(255,190,90,.35)'); r.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
  glow.renderOrder = 20; glow.visible = false;
  L.scene.add(glow);
  L.hooks.frame.push(() => {
    place();
    const g = cur || lit;
    glow.visible = !!g;
    if (!g) return;
    glow.position.copy(g.p).addScaledVector(g.n, 0.04);
    const d = camera.position.distanceTo(g.p), k = 1 + 0.18 * Math.sin(performance.now() / 260);
    glow.scale.setScalar(Math.max(0.35, d * 0.045) * k);
  });

  L.hooks.tap.push((x, y, type) => {
    const o = nearestPoint(x, y, type === 'touch' ? 22 : 12);
    if (!o) { if (performance.now() - shownAt > 600) hide(); return false; }   // 剛打開（例如查詢點兩下的第二下）不要馬上收起
    const now = performance.now();
    if (last && last.o === o && now - last.t < 380) return true;   // 點兩下：一樣是這一穴的小卡
    last = { o, t: now };
    L.select(o.m.id);
    show(o);
    return true;
  });
  card.addEventListener('click', e => {
    if (e.target.closest('.xue-x')) { hide(); return; }
    if (e.target.closest('[data-xnadd]') && cur) {
      const sec = card.querySelector('.xue-my'), p = document.createElement('p');
      p.className = 'xue-my-t'; p.contentEditable = 'true'; p.spellcheck = false; p.title = '輕點可以修改；清空就刪掉';
      p.dataset.xn = sec.querySelectorAll('.xue-my-t').length;
      sec.insertBefore(p, e.target.closest('[data-xnadd]')); p.focus();
      xnFit(true);
      return;
    }
    if (e.target.closest('.xue-mback') && cur) {   // « 回到這一穴所在經絡的資訊頁
      const id = cur.m.id; hide();
      back.hidden = true; backId = null;
      if (L.info && L.info.openId) L.info.close(false);
      L.select(id); L.open(id);   // 回到這條經的資訊頁（經文＋五輸天干表＋銅人）
    }
  });
  // 滑鼠移到穴名上：顯示小卡；移開（且不在小卡上）就收起
  const labelsEl = L.labelsEl;
  if (labelsEl) {
    labelsEl.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-pt]');
      if (!t || e.pointerType !== 'mouse') return;
      clearTimeout(hovT);
      const o = PT[+t.dataset.pt];
      if (o && o !== cur) { show(o); hov = true; }
    });
    labelsEl.addEventListener('pointerout', e => { if (e.target.closest('[data-pt]') && hov) { clearTimeout(hovT); hovT = setTimeout(() => { if (hov && !card.matches(':hover')) hide(); }, 400); } });
    labelsEl.addEventListener('click', e => { const t = e.target.closest('[data-pt]'); if (t) { const o = PT[+t.dataset.pt]; L.select(o.m.id); show(o); hov = false; } });
    card.addEventListener('pointerleave', e => { if (hov && e.pointerType === 'mouse') hovT = setTimeout(hide, 300); });
    card.addEventListener('pointerenter', () => clearTimeout(hovT));
  }

  /* ---------- 經絡資訊欄裡的穴名都可以點：點了收起資訊欄、飛到那一穴、顯示小卡；左上「« 返回」回到資訊欄 ---------- */
  // 五輸表裡的簡寫／異體字：溪＝谿、陰陵＝陰陵泉…
  const ALIAS = { 後溪: '後谿', 陽溪: '陽谿', 太溪: '太谿', 解溪: '解谿', 俠溪: '俠谿', 陰陵: '陰陵泉', 陽陵: '陽陵泉', 三里: '足三里', 竅陰: '足竅陰', 通谷: '足通谷', 臨泣: '足臨泣' };
  const NAMES = [...new Set(PT.map(o => o.name).filter(n => n && n.length >= 2).concat(Object.keys(ALIAS)))].sort((a, b) => b.length - a.length);
  const NAME_RE = new RegExp(NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  function findPt(name) {
    const mid = L.info && L.info.openId;
    return PT.find(o => o.name === name && o.m.id === mid && o.side > 0) || PT.find(o => o.name === name && o.side > 0) || PT.find(o => o.name === name);
  }
  function linkify(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('select, option, button, .pt-link, h2, small, .an-note, [contenteditable]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const t = n.nodeValue; NAME_RE.lastIndex = 0;
      if (!NAME_RE.test(t)) return;
      const span = document.createElement('span');
      span.innerHTML = E(t).replace(NAME_RE, m => `<span class="pt-link" data-pn="${ALIAS[m] || m}" role="button" tabindex="0">${m}</span>`);
      n.replaceWith(...span.childNodes);
    });
  }
  document.querySelectorAll('.ip .ip-body').forEach(el => new MutationObserver(() => linkify(el)).observe(el, { childList: true }));
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'xue-back'; back.textContent = '« 返回'; back.hidden = true;
  stage.appendChild(back);
  let backId = null;
  document.addEventListener('click', e => {
    const a = e.target.closest('.pt-link');
    if (!a) return;
    const o = findPt(a.dataset.pn);
    if (!o || !L.info) return;
    backId = L.info.openId;
    L.info.close(false);
    L.select(o.m.id);
    L.info.flyToPoint(o);
    show(o);
    back.hidden = !backId;
  });
  back.addEventListener('click', () => {
    const id = backId; backId = null; back.hidden = true; hide();
    if (id) { L.select(id); L.open(id); }
  });
  L.hooks.open.push(() => { back.hidden = true; backId = null; });
  L.xue = { show: o => { show(o); hov = false; }, light: o => { lit = o || null; }, linkify };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  L.hooks.select.push(id => { if (cur && id !== cur.m.id) hide(); if (lit && id !== lit.m.id) lit = null; });
})();

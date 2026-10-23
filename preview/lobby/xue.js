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

  let cur = null, last = null;
  function fill(o) {
    const d = XUE && XUE[o.m.id + o.no];
    const ps = a => (a || []).map(t => `<p>${E(t)}</p>`).join('');
    card.innerHTML = `<button type="button" class="xue-x" aria-label="關閉">✕</button>
      <header><b>${E(o.name)}</b><small>${E(o.m.id + o.no)}・${E(o.m.name)}</small></header>
      ${d ? `<section><h4>部位</h4><div class="xue-pos">${ps(d.pos)}</div></section>${d.take && d.take.length ? `<section><h4>取穴法</h4>${ps(d.take)}</section>` : ''}`
        : `<p class="xue-none">${XUE ? '筆記裡沒有這個穴的部位資料' : '載入中…'}</p>`}`;
  }
  let shownAt = 0;
  function show(o) {
    cur = o; shownAt = performance.now();
    fill(o);
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    place();
  }
  function hide() { cur = null; hov = false; card.classList.remove('show'); }
  let hov = false, hovT = 0;
  // 跟著穴點移動；穴點轉到背面就收起
  function place() {
    if (!cur) return;
    const away = _w.subVectors(camera.position, cur.p).normalize().dot(cur.n) < (view.opaque > 0.5 ? 0.05 : -0.3);   // 轉到背面：先藏起來，轉回來再出現
    card.classList.toggle('away', away); glow.material.opacity = away ? 0 : 1;
    if (away) return;
    const r = stage.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    _v.copy(cur.p).project(camera);
    const x = c.left - r.left + (_v.x + 1) / 2 * c.width, y = c.top - r.top + (1 - _v.y) / 2 * c.height;
    // 小卡不能蓋住穴點亮光和右邊的穴名：先試左右兩側，放不下（手機）就放在穴點上方或下方
    const PAD = 8, TOP = 60, lblW = 14 * (cur.name.length + 1) + 20, gap = 26;
    card.style.maxHeight = '';
    const w = card.offsetWidth;
    let h = card.offsetHeight, left, top;
    if (x + lblW + w <= r.width - PAD) { left = x + lblW; top = y - h / 2; }
    else if (x - gap - w >= PAD) { left = x - gap - w; top = y - h / 2; }
    else {
      left = Math.max(PAD, Math.min(x - w / 2, r.width - w - PAD));
      const below = r.height - PAD - (y + gap), above = y - gap - TOP;
      if (h <= below || (h > above && below >= above)) { top = y + gap; if (h > below) { card.style.maxHeight = Math.max(120, below) + 'px'; h = Math.max(120, below); } }
      else { if (h > above) { card.style.maxHeight = Math.max(120, above) + 'px'; h = Math.max(120, above); } top = y - gap - h; }
    }
    if (left !== undefined && (x + lblW + w <= r.width - PAD || x - gap - w >= PAD)) top = Math.max(TOP, Math.min(top, r.height - h - PAD));
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
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
    glow.visible = !!cur;
    if (!cur) return;
    glow.position.copy(cur.p).addScaledVector(cur.n, 0.04);
    const d = camera.position.distanceTo(cur.p), k = 1 + 0.18 * Math.sin(performance.now() / 260);
    glow.scale.setScalar(Math.max(0.35, d * 0.045) * k);
  });

  L.hooks.tap.push((x, y, type) => {
    const o = nearestPoint(x, y, type === 'touch' ? 22 : 12);
    if (!o) { if (performance.now() - shownAt > 600) hide(); return false; }   // 剛打開（例如查詢點兩下的第二下）不要馬上收起
    const now = performance.now();
    if (last && last.o === o && now - last.t < 380) {   // 點兩下：打開經絡資訊
      last = null; hide();
      L.select(o.m.id); L.open(o.m.id);
      return true;
    }
    last = { o, t: now };
    L.select(o.m.id);
    show(o);
    return true;
  });
  card.addEventListener('click', e => { if (e.target.closest('.xue-x')) hide(); });
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
  const NAMES = [...new Set(PT.map(o => o.name).filter(n => n && n.length >= 2))].sort((a, b) => b.length - a.length);
  const NAME_RE = new RegExp(NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  function findPt(name) {
    const mid = L.info && L.info.openId;
    return PT.find(o => o.name === name && o.m.id === mid && o.side > 0) || PT.find(o => o.name === name && o.side > 0) || PT.find(o => o.name === name);
  }
  function linkify(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('select, option, button, .pt-link, h2, small') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const t = n.nodeValue; NAME_RE.lastIndex = 0;
      if (!NAME_RE.test(t)) return;
      const span = document.createElement('span');
      span.innerHTML = E(t).replace(NAME_RE, m => `<span class="pt-link" data-pn="${m}" role="button" tabindex="0">${m}</span>`);
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
  L.xue = { show: o => { show(o); hov = false; }, linkify };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  L.hooks.select.push(id => { if (cur && id !== cur.m.id) hide(); });
})();

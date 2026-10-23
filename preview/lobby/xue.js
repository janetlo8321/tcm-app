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
    for (const o of PT) {
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
  function show(o) {
    cur = o;
    fill(o);
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    place();
  }
  function hide() { cur = null; card.classList.remove('show'); }
  // 跟著穴點移動；穴點轉到背面就收起
  function place() {
    if (!cur) return;
    if (_w.subVectors(camera.position, cur.p).normalize().dot(cur.n) < (view.opaque > 0.5 ? 0.05 : -0.3)) { hide(); return; }
    const r = stage.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    _v.copy(cur.p).project(camera);
    const x = c.left - r.left + (_v.x + 1) / 2 * c.width, y = c.top - r.top + (1 - _v.y) / 2 * c.height;
    const w = card.offsetWidth, h = card.offsetHeight;
    let left = x + 18;
    if (left + w > r.width - 8) left = x - 18 - w;   // 右邊放不下：放左邊
    left = Math.max(8, Math.min(left, r.width - w - 8));
    const top = Math.max(60, Math.min(y - h / 2, r.height - h - 8));
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  L.hooks.frame.push(place);

  L.hooks.tap.push((x, y, type) => {
    const o = nearestPoint(x, y, type === 'touch' ? 22 : 12);
    if (!o) { hide(); return false; }
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  L.hooks.select.push(id => { if (cur && id !== cur.m.id) hide(); });
})();

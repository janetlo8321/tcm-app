/* =========================================================
 * 螢光筆（銅人頁）：經絡資訊欄、五輸天干表、穴位小卡裡的文字
 *   長按選字（可拖拉調整範圍），停下來右上出現綠色 ✓，按了變黃底；在黃底上再長按，✓ 確認後去掉
 *   和資料庫同一份（tcm-hl-v1，每一頁用 lb: 開頭的鍵分開存），有設定 GitHub 同步時合併到 tcm-notes sync/hl.json
 * ========================================================= */
(() => {
  'use strict';
  const HLK = 'tcm-hl-v1', GH_KEY = 'tcm-gh-token-v1';
  const HL_URL = 'https://api.github.com/repos/janetlo8321/tcm-notes/contents/sync/hl.json';
  const SKIP = 'input,textarea,select,button,.bz-hl-ok,.bz-ntbox,script,style,[contenteditable],.an-note';
  const all = () => { try { const a = JSON.parse(localStorage.getItem(HLK) || '{}'); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (e) { return {}; } };
  const store = a => { try { localStorage.setItem(HLK, JSON.stringify(a)); } catch (e) {} };
  const token = () => { try { return localStorage.getItem(GH_KEY) || ''; } catch (e) { return ''; } };
  const b64e = t => btoa(unescape(encodeURIComponent(t))), b64d = t => decodeURIComponent(escape(atob(t.replace(/\s/g, ''))));

  const roots = () => [...document.querySelectorAll('.ip:not(.tr-ip) .ip-body, .xue')].filter(r => r.dataset.hlk);
  const keyOf = root => root.dataset.hlk ? 'lb:' + root.dataset.hlk : '';
  function texts(root) {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let pos = 0, n;
    while ((n = w.nextNode())) { out.push({ n, s: pos }); pos += n.data.length; }
    return out;
  }
  function unwrap(root) {
    root.querySelectorAll('mark.bz-hl').forEach(m => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
  }
  function wrap(ts, s, e, id, note) {
    ts.forEach(({ n, s: ns }) => {
      const ne = ns + n.data.length;
      if (ne <= s || ns >= e || !n.data.trim()) return;
      let t = n;
      if (s > ns) t = t.splitText(s - ns);
      if (e < ne) t.splitText(e - Math.max(s, ns));
      const m = document.createElement('mark'); m.className = note ? 'bz-hl bz-note' : 'bz-hl'; m.dataset.hl = id;
      t.parentNode.insertBefore(m, t); m.appendChild(t);
    });
  }
  let busy = false;
  function apply(root) {
    const key = keyOf(root); if (!key) return;
    busy = true;
    try {
      unwrap(root);
      const list = (all()[key] || {}).list || [];
      if (!list.length) return;
      let ts = texts(root);
      const full = ts.map(x => x.n.data).join('');
      list.forEach(h => {
        let s = h.s;
        if (full.slice(s, s + h.x.length) !== h.x) {   // 內容有變：找最接近原位置的同一段字
          let best = -1, i = full.indexOf(h.x);
          while (i >= 0) { if (best < 0 || Math.abs(i - h.s) < Math.abs(best - h.s)) best = i; i = full.indexOf(h.x, i + 1); }
          if (best < 0) return; s = best;
        }
        wrap(ts, s, s + h.x.length, h.id, h.k === 'n');
        ts = texts(root);
      });
    } finally { busy = false; }
  }
  function offset(root, node, off) {   // 選取的端點 → 全文位置
    const ts = texts(root);
    if (node.nodeType !== 3) { const r = document.createRange(); r.setStart(node, off); const t = ts.find(x => r.comparePoint(x.n, 0) >= 0); return t ? t.s : (ts.length ? ts[ts.length - 1].s + ts[ts.length - 1].n.data.length : 0); }
    const t = ts.find(x => x.n === node); return t ? t.s + off : -1;
  }

  const ok = document.createElement('button');
  ok.type = 'button'; ok.className = 'bz-hl-ok'; ok.textContent = '✓'; ok.hidden = true;
  document.body.appendChild(ok);
  // v2.44.0：綠勾旁邊多一個藍色「註」（和經方一樣）
  const nt = document.createElement('button');
  nt.type = 'button'; nt.className = 'bz-hl-ok bz-hl-nt'; nt.textContent = '註'; nt.title = '加註（字旁會出現可以打字的框）'; nt.hidden = true;
  document.body.appendChild(nt);
  let pend = null, tm = 0;
  const COARSE = matchMedia('(pointer: coarse)');
  function show(rect, p) {
    pend = p;
    let x = Math.min(innerWidth - 40, rect.right + 4), y = rect.top - 34 < 6 ? rect.bottom + 6 : rect.top - 34;
    if (COARSE.matches) {   // 手機：系統的「複製…」選單在選取範圍上方，綠勾改放到選取範圍下方（避開拖拉把手）
      let bt = rect.bottom, rt = rect.right;
      try { const b = getSelection().getRangeAt(0).getBoundingClientRect(); if (b.height) { bt = b.bottom; rt = Math.max(rt, b.right); } } catch (er) {}
      x = Math.min(innerWidth - 46, Math.max(6, rt - 20)); y = bt + 30;
      if (y + 44 > innerHeight) y = Math.max(6, rect.top - 96);
    }
    ok.style.left = x + 'px'; ok.style.top = y + 'px';
    ok.classList.toggle('del', p.act === 'del'); ok.title = p.act === 'del' ? '去掉這段黃底' : '畫上黃底';
    ok.hidden = false;
    if (p.act === 'add' || p.nt) {
      const gap = COARSE.matches ? 46 : 38;
      nt.style.top = y + 'px'; nt.style.left = (x + gap + 30 > innerWidth - 4 ? x - gap : x + gap) + 'px'; nt.hidden = false;
    } else nt.hidden = true;
    if (!box.hidden) ntClose();
  }
  const hide = () => { ok.hidden = true; nt.hidden = true; pend = null; };
  const elOf = n => n.nodeType === 1 ? n : n.parentElement;
  document.addEventListener('selectionchange', () => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      const sel = getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) { if (!ok.matches(':hover') && !nt.matches(':hover')) hide(); return; }
      const r = sel.getRangeAt(0), root = roots().find(x => x.contains(r.commonAncestorContainer));
      if (!root || elOf(r.commonAncestorContainer).closest(SKIP)) { hide(); return; }
      const key = keyOf(root); if (!key) return;
      // 黃底和註疊在一起時，綠勾只管黃底（註另外用框右上的紅色 － 刪）
      // 選取端點剛好落在標記外面那一格（前一段字的最後／後一段字的最前）時，往標記裡挪
      const tsx = texts(root), ix = n => tsx.findIndex(t => t.n === n);
      let sn = r.startContainer, en = r.endContainer;
      if (sn.nodeType === 3 && r.startOffset === sn.data.length && tsx[ix(sn) + 1]) sn = tsx[ix(sn) + 1].n;
      if (en.nodeType === 3 && r.endOffset === 0 && ix(en) > 0) en = tsx[ix(en) - 1].n;
      const se = elOf(sn), ee = elOf(en);
      const mk = se.closest('mark.bz-hl:not(.bz-note)'), mk2 = ee.closest('mark.bz-hl:not(.bz-note)');
      if (mk && mk2 && mk.dataset.hl === mk2.dataset.hl) {   // 在黃底裡長按：確認去掉
        const ms = root.querySelectorAll(`mark.bz-hl[data-hl="${mk.dataset.hl}"]`), rc = ms[0].getBoundingClientRect(), last = ms[ms.length - 1].getBoundingClientRect();
        let ntp = null;   // 黃底上也可以加註
        if (!mk.classList.contains('bz-note') && !se.closest('mark.bz-note')) {
          const s = offset(root, r.startContainer, r.startOffset), e = offset(root, r.endContainer, r.endOffset);
          const x = s >= 0 && e > s ? texts(root).map(t => t.n.data).join('').slice(s, e) : '';
          if (x.trim()) ntp = { s, e, x };
        }
        show({ top: rc.top, bottom: rc.bottom, right: ms.length > 1 && last.top === rc.top ? last.right : rc.right }, { act: 'del', root, key, id: mk.dataset.hl, nt: ntp });
        return;
      }
      const s = offset(root, r.startContainer, r.startOffset), e = offset(root, r.endContainer, r.endOffset);
      if (s < 0 || e <= s) { hide(); return; }
      const x = texts(root).map(t => t.n.data).join('').slice(s, e);
      if (!x.trim()) { hide(); return; }
      const rs = r.getClientRects(), rc = rs.length ? rs[rs.length - 1] : r.getBoundingClientRect(), r0 = rs.length ? rs[0] : rc;
      show({ top: r0.top, bottom: r0.bottom, right: rs.length > 1 ? Math.max(r0.right, rc.right) : rc.right }, { act: 'add', root, key, s, e, x });
    }, 450);
  });
  ['pointerdown', 'touchstart', 'mousedown'].forEach(ev => ok.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, { passive: false }));
  // 手機：手指一放開就算按到（不等 click，免得被系統選單吃掉）
  ok.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { e.preventDefault(); e.stopPropagation(); ok.click(); } });
  ok.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const p = pend; if (!p) return;
    const a = all(), pg = a[p.key] || { list: [] };
    pg.list = pg.list || [];
    if (p.act === 'add') pg.list.push({ id: 'h' + Date.now().toString(36), s: p.s, e: p.e, x: p.x });
    else {
      const it = pg.list.find(h => h.id === p.id);
      if (!it || it.k === 'n') { hide(); return; }   // 綠勾絕不刪註
      pg.list = pg.list.filter(h => h.id !== p.id);
    }
    pg.t = Date.now(); a[p.key] = pg; store(a);
    try { getSelection().removeAllRanges(); } catch (er) {}
    hide(); apply(p.root);
    clearTimeout(sync.t); sync.t = setTimeout(() => sync(true), 1200);
  });
  addEventListener('scroll', () => { if (!ok.hidden) hide(); }, true);

  /* ---------- 註：選字後按藍色「註」，那段字變淡藍底＋藍底線，旁邊出現可以打字的小框；打的字自動存（tcm-hl-v1，k:'n'）
   * 電腦：游標移到淡藍字上就顯示，點一下可以打字；手機：點一下淡藍字。框裡沒字時右上紅色 － 整個註刪掉 ---------- */
  ['pointerdown', 'touchstart', 'mousedown'].forEach(ev => nt.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, { passive: false }));
  nt.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { e.preventDefault(); e.stopPropagation(); nt.click(); } });
  nt.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const p = pend; if (!p) return;
    const q = p.act === 'add' ? p : p.nt; if (!q) return;
    const a = all(), pg = a[p.key] || { list: [] }; pg.list = pg.list || [];
    const id = 'n' + Date.now().toString(36);
    pg.list.push({ id, s: q.s, e: q.e, x: q.x, k: 'n', note: '', nt: Date.now() });
    pg.t = Date.now(); a[p.key] = pg; store(a);
    try { getSelection().removeAllRanges(); } catch (er) {}
    hide(); apply(p.root);
    ntOpen(p.root, p.key, id, true);
    clearTimeout(sync.t); sync.t = setTimeout(() => sync(true), 1200);
  });
  const box = document.createElement('div');
  box.className = 'bz-ntbox lb-ntbox'; box.hidden = true;
  box.innerHTML = '<textarea class="bz-nt-t" spellcheck="false"></textarea><button type="button" class="bz-nt-rm" title="刪除這個註">－</button>';
  document.body.appendChild(box);
  const ta = box.querySelector('textarea'), rm = box.querySelector('.bz-nt-rm');
  let cur = null, pin = false, hideT = 0;
  const rmUpd = () => {};
  const item = c => c && (((all()[c.key] || {}).list) || []).find(h => h.id === c.id);
  function place(root, id) {   // 框放在那段字的右上方（放不下就放下面、往左移）
    const ms = root.querySelectorAll(`mark.bz-note[data-hl="${id}"]`); if (!ms.length) return;
    const r = ms[ms.length - 1].getBoundingClientRect(), W = box.offsetWidth, H = box.offsetHeight;
    let x = r.right + 2, y = r.top - H - 2;
    if (x + W > innerWidth - 6) x = Math.max(6, innerWidth - W - 6);
    if (y < 6) y = r.bottom + 4;
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }
  function ntOpen(root, key, id, p) {
    clearTimeout(hideT);
    if (cur && cur.id === id) { if (p && !pin) { pin = true; box.classList.add('pin'); ta.focus(); } return; }
    if (cur && pin && !p) return;
    if (cur) ntClose();
    cur = { root, key, id }; pin = !!p;
    const h = item(cur); if (!h) { cur = null; return; }
    ta.value = h.note || ''; rmUpd();
    box.classList.toggle('pin', pin); box.hidden = false;
    place(root, id);
    root.querySelectorAll(`mark.bz-note[data-hl="${id}"]`).forEach(m => m.classList.add('cur'));
    if (pin) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
  }
  function save() {
    if (!cur) return;
    const a = all(), pg = a[cur.key]; if (!pg) return;
    const h = (pg.list || []).find(x => x.id === cur.id); if (!h || h.note === ta.value) return;
    h.note = ta.value; h.nt = Date.now(); pg.t = Date.now(); store(a);
    clearTimeout(sync.t); sync.t = setTimeout(() => sync(true), 1500);
  }
  function ntClose() {
    save(); box.hidden = true; pin = false;
    if (cur) cur.root.querySelectorAll('mark.bz-note.cur').forEach(m => m.classList.remove('cur'));
    cur = null;
  }
  ta.addEventListener('input', () => { rmUpd(); clearTimeout(save.t); save.t = setTimeout(save, 400); });
  rm.addEventListener('mousedown', e => e.preventDefault());
  rm.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    if (!cur) return;
    if (ta.value.trim() && !confirm('要刪除這個註嗎？（註裡打的字也會一起刪掉）')) return;
    const c = cur, a = all(), pg = a[c.key]; if (!pg) return;
    pg.list = (pg.list || []).filter(x => x.id !== c.id); pg.t = Date.now(); store(a);
    box.hidden = true; pin = false; cur = null; apply(c.root);
    clearTimeout(sync.t); sync.t = setTimeout(() => sync(true), 1200);
  });
  box.addEventListener('focusin', () => { pin = true; box.classList.add('pin'); });
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); ntClose(); } e.stopPropagation(); });
  ['wheel', 'pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick'].forEach(ev => box.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
  box.addEventListener('mouseenter', () => clearTimeout(hideT));
  box.addEventListener('mouseleave', () => { if (!pin) hideT = setTimeout(ntClose, 300); });
  addEventListener('scroll', e => { if (!box.hidden && !box.contains(e.target)) ntClose(); }, true);
  const find = t => { const m = t && t.closest && t.closest('mark.bz-note'); if (!m) return null; const root = roots().find(r => r.contains(m)); return root ? { m, root, key: keyOf(root) } : null; };
  document.addEventListener('mouseover', e => {
    const f = find(e.target); if (!f || !ok.hidden) return;
    clearTimeout(hideT); ntOpen(f.root, f.key, f.m.dataset.hl, false);
  });
  document.addEventListener('mouseout', e => {
    const f = find(e.target); if (!f || pin) return;
    const rt = e.relatedTarget;
    if (rt && (box.contains(rt) || (rt.closest && rt.closest(`mark.bz-note[data-hl="${f.m.dataset.hl}"]`)))) return;
    hideT = setTimeout(() => { if (!pin) ntClose(); }, 300);
  });
  document.addEventListener('click', e => {
    const f = find(e.target);
    if (f) { const sel = getSelection(); if (sel && !sel.isCollapsed) return; e.preventDefault(); e.stopPropagation(); ntOpen(f.root, f.key, f.m.dataset.hl, true); return; }
    if (pin && !box.contains(e.target) && !nt.contains(e.target)) ntClose();
  }, true);

  async function sync(push) {
    const tok = token(); if (!tok) return false;
    try {
      const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      const r = await fetch(HL_URL + '?t=' + Date.now(), { headers: H, cache: 'no-store' });
      let remote = {}, sha;
      if (r.ok) { const j = await r.json(); sha = j.sha; try { remote = JSON.parse(b64d(j.content)) || {}; } catch (e) {} }
      const merged = { ...remote }, mine = all();
      Object.keys(mine).forEach(k => { if (!merged[k] || (mine[k].t || 0) > (merged[k].t || 0)) merged[k] = mine[k]; });   // 只加或取較新的，不會刪掉別台裝置的
      const changed = JSON.stringify(merged) !== JSON.stringify(mine);
      store(merged);
      if (changed) roots().forEach(r => { if (!cur || cur.root !== r) apply(r); });
      if (push && JSON.stringify(merged) !== JSON.stringify(remote))
        await fetch(HL_URL, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '同步螢光筆', content: b64e(JSON.stringify(merged, null, 1)), ...(sha ? { sha } : {}) }) });
      return true;
    } catch (e) { return false; }
  }

  // 內容換掉（換經、點紅字、換穴）之後重新畫上
  const later = root => { clearTimeout(root._hlq); root._hlq = setTimeout(() => { if (!busy) apply(root); }, 80); };
  document.querySelectorAll('.ip:not(.tr-ip) .ip-body, .xue').forEach(root => {
    new MutationObserver(() => { if (!busy) later(root); }).observe(root, { childList: true });
    later(root);
  });
  sync(true);   // 打開時：合併後和雲端不一樣才上傳（這台有、雲端沒有的補上去）
})();

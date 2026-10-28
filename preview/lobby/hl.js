/* =========================================================
 * 螢光筆（銅人頁）：經絡資訊欄、五輸天干表、穴位小卡裡的文字
 *   長按選字（可拖拉調整範圍），停下來右上出現綠色 ✓，按了變黃底；在黃底上再長按，✓ 確認後去掉
 *   和資料庫同一份（tcm-hl-v1，每一頁用 lb: 開頭的鍵分開存），有設定 GitHub 同步時合併到 tcm-notes sync/hl.json
 * ========================================================= */
(() => {
  'use strict';
  const HLK = 'tcm-hl-v1', GH_KEY = 'tcm-gh-token-v1';
  const HL_URL = 'https://api.github.com/repos/janetlo8321/tcm-notes/contents/sync/hl.json';
  const SKIP = 'input,textarea,select,button,.bz-hl-ok,script,style';
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
  function wrap(ts, s, e, id) {
    ts.forEach(({ n, s: ns }) => {
      const ne = ns + n.data.length;
      if (ne <= s || ns >= e || !n.data.trim()) return;
      let t = n;
      if (s > ns) t = t.splitText(s - ns);
      if (e < ne) t.splitText(e - Math.max(s, ns));
      const m = document.createElement('mark'); m.className = 'bz-hl'; m.dataset.hl = id;
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
        wrap(ts, s, s + h.x.length, h.id);
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
  let pend = null, tm = 0;
  function show(rect, p) {
    pend = p;
    const x = Math.min(innerWidth - 40, rect.right + 4), y = rect.top - 34 < 6 ? rect.bottom + 6 : rect.top - 34;
    ok.style.left = x + 'px'; ok.style.top = y + 'px';
    ok.classList.toggle('del', p.act === 'del'); ok.title = p.act === 'del' ? '去掉這段黃底' : '畫上黃底';
    ok.hidden = false;
  }
  const hide = () => { ok.hidden = true; pend = null; };
  const elOf = n => n.nodeType === 1 ? n : n.parentElement;
  document.addEventListener('selectionchange', () => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      const sel = getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) { if (!ok.matches(':hover')) hide(); return; }
      const r = sel.getRangeAt(0), root = roots().find(x => x.contains(r.commonAncestorContainer));
      if (!root || elOf(r.commonAncestorContainer).closest(SKIP)) { hide(); return; }
      const key = keyOf(root); if (!key) return;
      const mk = elOf(r.startContainer).closest('mark.bz-hl'), mk2 = elOf(r.endContainer).closest('mark.bz-hl');
      if (mk && mk2 && mk.dataset.hl === mk2.dataset.hl) {   // 在黃底裡長按：確認去掉
        const ms = root.querySelectorAll(`mark.bz-hl[data-hl="${mk.dataset.hl}"]`), rc = ms[0].getBoundingClientRect(), last = ms[ms.length - 1].getBoundingClientRect();
        show({ top: rc.top, bottom: rc.bottom, right: ms.length > 1 && last.top === rc.top ? last.right : rc.right }, { act: 'del', root, key, id: mk.dataset.hl });
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
  ok.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const p = pend; if (!p) return;
    const a = all(), pg = a[p.key] || { list: [] };
    pg.list = pg.list || [];
    if (p.act === 'add') pg.list.push({ id: 'h' + Date.now().toString(36), s: p.s, e: p.e, x: p.x });
    else pg.list = pg.list.filter(h => h.id !== p.id);
    pg.t = Date.now(); a[p.key] = pg; store(a);
    try { getSelection().removeAllRanges(); } catch (er) {}
    hide(); apply(p.root);
    clearTimeout(sync.t); sync.t = setTimeout(() => sync(true), 1200);
  });
  addEventListener('scroll', () => { if (!ok.hidden) hide(); }, true);

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
      if (changed) roots().forEach(apply);
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
  sync(false);
})();

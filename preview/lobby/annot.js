/* =========================================================
 * 行間筆記（電腦）：按空白鍵，經絡資訊欄每一列字下面空出一行；
 *   滑鼠點在哪個字下面，就在那裡打字（灰字），清空就刪掉；再按一次空白鍵收起
 *   每一頁分開存（tcm-annot-v1，鍵同螢光筆 lb:…），位置記「上面那個字」＋前後文，
 *   有設定 GitHub 同步時合併到 tcm-notes sync/annot.json
 * ========================================================= */
(() => {
  'use strict';
  const stage = document.getElementById('stage') || document.body;
  const AK = 'tcm-annot-v1', GH_KEY = 'tcm-gh-token-v1';
  const AN_URL = 'https://api.github.com/repos/janetlo8321/tcm-notes/contents/sync/annot.json';
  const SKIP = 'input,textarea,select,button,.bz-hl-ok,script,style,[contenteditable],.an-note';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const all = () => { try { const a = JSON.parse(localStorage.getItem(AK) || '{}'); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (e) { return {}; } };
  const store = a => { try { localStorage.setItem(AK, JSON.stringify(a)); } catch (e) {} };
  const token = () => { try { return localStorage.getItem(GH_KEY) || ''; } catch (e) { return ''; } };
  const b64e = t => btoa(unescape(encodeURIComponent(t))), b64d = t => decodeURIComponent(escape(atob(t.replace(/\s/g, ''))));

  const rootEl = () => document.querySelector('.ip:not(.tr-ip):not(.ip-left) .ip-body');
  const keyOf = root => root && root.dataset.hlk ? 'lb:' + root.dataset.hlk : '';
  const listOf = key => ((all()[key] || {}).list || []).slice();
  function save(key, list) {
    const a = all(); a[key] = { list, t: Date.now() }; store(a);
    clearTimeout(sync.t); sync.t = setTimeout(() => sync(true), 1200);
  }
  function texts(root) {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let pos = 0, n;
    while ((n = w.nextNode())) { out.push({ n, s: pos }); pos += n.data.length; }
    return out;
  }
  const inPara = n => { const el = n.nodeType === 1 ? n : n.parentElement; return el && el.closest('.ip-body p') && !el.closest(SKIP) ? el.closest('.ip-body p') : null; };
  function charRect(node, off) {
    if (!node || node.nodeType !== 3 || !node.data.length) return null;
    const o = Math.max(0, Math.min(off, node.data.length - 1)), r = document.createRange();
    r.setStart(node, o); r.setEnd(node, o + 1);
    const rs = r.getClientRects(); return rs.length ? rs[0] : r.getBoundingClientRect();
  }
  const caretAt = (x, y) => {
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; }
    return null;
  };

  /* ---------- 畫出筆記 ---------- */
  function render() {
    const root = rootEl();
    document.querySelectorAll('.an-note').forEach(n => { if (n !== document.activeElement) n.remove(); });
    if (!root || !stage.classList.contains('an-on')) return;
    const key = keyOf(root); if (!key) return;
    const ts = texts(root), full = ts.map(x => x.n.data).join('');
    const rr = root.getBoundingClientRect();
    listOf(key).forEach(a => {
      if (root.querySelector(`.an-note[data-an="${a.id}"]`)) return;
      let s = a.s;
      if (full.slice(s - (a.pre || '').length, s + (a.post || '').length) !== (a.pre || '') + (a.post || '')) {   // 內容有變：用前後文找最近的位置
        const ctx = (a.pre || '') + (a.post || ''); let best = -1, i = ctx ? full.indexOf(ctx) : -1;
        while (i >= 0) { const p = i + (a.pre || '').length; if (best < 0 || Math.abs(p - a.s) < Math.abs(best - a.s)) best = p; i = full.indexOf(ctx, i + 1); }
        if (best < 0) return; s = best;
      }
      const t = ts.find(x => s >= x.s && s < x.s + x.n.data.length); if (!t) return;
      const rc = charRect(t.n, s - t.s); if (!rc) return;
      put(root, a.id, rc.left - rr.left + root.scrollLeft, rc.bottom - rr.top + root.scrollTop, a.text);
    });
  }
  function put(root, id, x, y, text) {
    const n = document.createElement('div');
    n.className = 'an-note'; n.dataset.an = id; n.contentEditable = 'true'; n.spellcheck = false;
    n.style.left = Math.max(0, x) + 'px'; n.style.top = (y + 3) + 'px';
    n.style.maxWidth = Math.max(60, root.clientWidth - x - 12) + 'px';
    n.textContent = text || '';
    root.appendChild(n);
    return n;
  }

  /* ---------- 點在字下面的空行：在那裡開一個筆記 ---------- */
  document.addEventListener('mousedown', e => {
    if (!stage.classList.contains('an-on') || e.button !== 0) return;
    const root = rootEl(); if (!root || !root.contains(e.target) || e.target.closest('.an-note') || !inPara(e.target)) return;
    let hit = null;
    for (const dy of [0, -1]) {   // 先看這個點對到的那一列，對到下一列的話往上一列找
      const lh = parseFloat(getComputedStyle(inPara(e.target)).lineHeight) || 40;
      const c = caretAt(e.clientX, e.clientY + dy * lh * 0.75);
      if (!c || !inPara(c.node) || c.node.nodeType !== 3) continue;
      const off = c.off >= c.node.data.length ? c.node.data.length - 1 : c.off;
      const rc = charRect(c.node, off); if (!rc) continue;
      if (e.clientY >= rc.bottom) { hit = { node: c.node, off, rc }; break; }
    }
    if (!hit) return;   // 點在字上：照舊（可以用螢光筆選字）
    e.preventDefault();
    const ts = texts(root), t = ts.find(x => x.n === hit.node); if (!t) return;
    const full = ts.map(x => x.n.data).join(''), s = t.s + hit.off;
    const rr = root.getBoundingClientRect();
    const id = 'a' + Date.now().toString(36);
    const n = put(root, id, hit.rc.left - rr.left + root.scrollLeft, hit.rc.bottom - rr.top + root.scrollTop, '');
    n.dataset.s = s; n.dataset.pre = full.slice(Math.max(0, s - 6), s); n.dataset.post = full.slice(s, s + 6); n.dataset.fresh = '1';
    setTimeout(() => n.focus(), 0);
  }, true);

  const noteSave = n => {
    const root = rootEl(), key = keyOf(root); if (!key) return;
    const text = n.innerText.replace(/\n+$/, '');
    let list = listOf(key);
    const i = list.findIndex(a => a.id === n.dataset.an);
    if (!text.trim()) { if (i >= 0) { list.splice(i, 1); save(key, list); } return; }
    if (i >= 0) list[i] = Object.assign({}, list[i], { text });
    else list.push({ id: n.dataset.an, s: +n.dataset.s, pre: n.dataset.pre, post: n.dataset.post, text });
    save(key, list);
  };
  document.addEventListener('input', e => { const n = e.target.closest && e.target.closest('.an-note'); if (n) noteSave(n); });
  document.addEventListener('focusout', e => {
    const n = e.target.closest && e.target.closest('.an-note'); if (!n) return;
    noteSave(n);
    if (!n.innerText.trim()) n.remove();
  });
  document.addEventListener('paste', e => {   // 貼上只留純文字
    const n = e.target.closest && e.target.closest('.an-note'); if (!n || !e.clipboardData) return;
    e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  /* ---------- 空白鍵：打開／收起 ---------- */
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const t = e.target;
    if (e.isComposing || (t && (t.closest('input,textarea,select,[contenteditable="true"]') || t.isContentEditable))) return;
    if (!rootEl() || !rootEl().closest('.ip.show')) return;
    e.preventDefault();
    const root = rootEl(), top = root.scrollTop / Math.max(1, root.scrollHeight);
    stage.classList.toggle('an-on');
    render();
    root.scrollTop = top * root.scrollHeight;   // 行距變了，捲到差不多同一段
  });

  // 內容換掉、視窗改大小：重新放
  let q = 0;
  const later = () => { clearTimeout(q); q = setTimeout(render, 120); };
  const r0 = rootEl();
  if (r0) new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(x => !(x.classList && x.classList.contains('an-note'))))) later(); }).observe(r0, { childList: true });
  addEventListener('resize', later);

  async function sync(push) {
    const tok = token(); if (!tok) return false;
    try {
      const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      const r = await fetch(AN_URL + '?t=' + Date.now(), { headers: H, cache: 'no-store' });
      let remote = {}, sha;
      if (r.ok) { const j = await r.json(); sha = j.sha; try { remote = JSON.parse(b64d(j.content)) || {}; } catch (e) {} }
      const merged = { ...remote }, mine = all();
      Object.keys(mine).forEach(k => { if (!merged[k] || (mine[k].t || 0) > (merged[k].t || 0)) merged[k] = mine[k]; });   // 只加或取較新的
      const changed = JSON.stringify(merged) !== JSON.stringify(mine);
      store(merged);
      if (changed) later();
      if (push && JSON.stringify(merged) !== JSON.stringify(remote))
        await fetch(AN_URL, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '同步行間筆記', content: b64e(JSON.stringify(merged, null, 1)), ...(sha ? { sha } : {}) }) });
      return true;
    } catch (e) { return false; }
  }
  sync(false);
})();

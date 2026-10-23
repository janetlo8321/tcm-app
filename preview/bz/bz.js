/* =========================================================
 * 八綱辨證（模擬看診的辨證思路）
 *   主訴（病證）→ 八綱（陰陽、表裡、寒熱、虛實）→ 舌象 → 脈象 → 症狀
 *   → 依符合程度排出證型卡（舌、脈、症、病機、治法、方、組成）
 *   → 辨證結果報告單：欄位可用資料庫內容下拉選，處方可選「其他」自訂，並列出組成
 *   也可以嵌進大廳病證區域右側的毛玻璃欄（TCMBZ.mount）
 * 資料全部取自解鎖後的資料庫（病證表、方劑、藥物），這支程式本身不含任何內容。
 * 由預覽版外殼在解鎖後載入；用到資料庫裡的 zzDiseases、nbGrid、nbRoles、nbScan、compOf、go 等。
 * ========================================================= */
(() => {
  'use strict';
  if (typeof zzDiseases === 'undefined' || typeof nbGrid !== 'function') return;   // 舊版資料庫沒有合併病證，不啟用
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SRC = { A: '內科表', B: '中西醫結合', C: '針灸', D: '講義' };
  const clean = s => String(s || '').replace(/\s+/g, '').replace(/^[：:、，,。；;]+|[：:、，,。；;]+$/g, '');

  /* ---------- 由病證表拆出證型 ---------- */
  function fxNames(text) {   // 方欄裡的方名（和資料庫的組成列用同一套辨識）
    const out = [];
    const add = (nm, raw) => { nm = clean(nm); if (nm && !out.some(o => o.name === nm)) out.push({ name: nm, raw: clean(raw || nm), comp: compOf(nm) || compOf(raw) }); };
    nbScan(text, (t, tg) => {
      if (tg) { add(tg.f ? tg.f.name : (NB_FX.map[ybNorm(t)] || t), t); return; }
      t.split(/[，,、；;。\n\/／（）()＋+★⊕]|合用|合|或|及|配/).forEach(seg => {
        const m = clean(seg).replace(/^(以|用|可服|可用|宜|方用|主方|選用|酌加|再|並|和|成藥|成方)/, '');
        const mm = m.match(/^[一-鿿]{2,8}[湯散丸飲丹膏煎]/);
        if (mm && !/^(伴|加(?![味減]))/.test(mm[0])) add(mm[0]);
      });
    });
    return out;
  }
  const TONGUE = /舌|苔/, PULSE = /脈/;
  const IS_T = /^(舌|苔)/, IS_P = /^(兩|雙|左|右)?[寸關尺]?脈(?!絡)/;
  function findings(cols) {   // 症狀欄 → 舌象、脈象、其他症狀
    const tongue = [], pulse = [], sx = [];
    const push = (arr, v) => { v = clean(v); if (v.length >= 1 && v.length <= 16 && !arr.includes(v)) arr.push(v); };
    cols.forEach(({ h, t }) => {
      const hT = TONGUE.test(h) && !PULSE.test(h), hP = PULSE.test(h) && !TONGUE.test(h), hSx = !h || /症|證|候|狀|特點|表現|辨證|舌|脈/.test(h);
      String(t).replace(/(舌脈|舌象|脈象|舌苔脈象|舌診|脈診)[：:]/g, '，').split(/[，,。；;、\n]/).forEach(seg => {
        seg = clean(seg);
        if (!seg || /^(無|－|-|—)$/.test(seg)) return;
        const pi = seg.search(/[寸關尺]?脈(?!絡)/);
        if (IS_T.test(seg) && pi > 0) { push(tongue, seg.slice(0, pi)); push(pulse, seg.slice(pi)); return; }   // 「舌紅苔黃脈弦數」
        if (IS_P.test(seg)) { push(pulse, seg); return; }
        if (IS_T.test(seg)) { push(tongue, seg); return; }
        if (hP) { push(pulse, '脈' + seg); return; }
        if (hT) { push(tongue, (/苔/.test(h) && !/舌/.test(h) ? '苔' : '舌') + seg); return; }
        push(sx, !hSx && seg.length <= 4 ? h + seg : seg);
      });
    });
    return { tongue, pulse, sx };
  }
  const cache = {};
  function patterns(o) {
    if (cache[o.id]) return cache[o.id];
    const out = [];
    o.d.secs.forEach(sec => (sec.parts || []).forEach(p => {
      if (!p.tb) return;
      const g = nbGrid(p.tb), rr = nbRoles(p.tb, g);
      if (!rr) return;
      const { role, ht } = rr, H = p.tb.head || 0;
      const rows = [];
      g.cells.forEach(x => { if (x.r < H || !clean(x.cell.t)) return; for (let r = x.r; r < x.r + x.rs; r++) (rows[r] = rows[r] || []).push(x); });
      rows.forEach((cells, r) => {
        if (!cells) return;
        const by = k => cells.filter(x => role[x.l0] === k).sort((a, b) => a.l0 - b.l0);
        const ks = by('k').map(x => clean(x.cell.t)).filter(t => t && t !== clean(o.name));
        const fs = by('f'), ss = by('s');
        if (!fs.length && !ss.length) return;
        const name = [...new Set(ks.map(k => k.replace(/^[0-9０-９一二三四五六七八九十]+[.、．）)]\s*|^[（(][0-9一二三四五六七八九十]+[)）]/, '')))].join('・') || '（未分型）';
        if (!fs.length && /^(特徵|特點|病因病機|病因|病機|辨證要點|診斷|治療|概述|鑑別)/.test(name)) return;
        const fx = fs.flatMap(x => fxNames(x.cell.t));
        const cols = ss.map(x => ({ h: ht ? clean(ht.slice(x.l0, x.l1).join('')) : '', t: x.cell.t }));
        const f = findings(cols);
        const last = out[out.length - 1];
        if (last && last.name === name && last.src === sec.src && !fx.length) {   // 同一證型拆成多列：併在一起
          ['tongue', 'pulse', 'sx'].forEach(k => f[k].forEach(v => { if (!last[k].includes(v)) last[k].push(v); }));
          return;
        }
        out.push({
          name, src: sec.src, ...f, fx,
          fxText: fs.map(x => clean(x.cell.t)).join('；'),
          jj: by('j').map(x => clean(x.cell.t)).join('；'),
          zf: by('z').map(x => clean(x.cell.t)).join('；'),
          bj: by('b').map(x => clean(x.cell.t)).join('；')
        });
      });
    }));
    const seen = new Set();
    const uniqOut = out.filter(p => { const k = [p.name, p.src, p.fx.map(f => f.name).join('+'), p.tongue.join('/')].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    uniqOut.forEach((p, i) => {
      p.i = i; p.ax = bagang(p);
      p.tongue = [...new Set(p.tongue.map(v => v.replace(/^舌苔/, '苔').replace(/^舌質?/, '')).filter(Boolean))];   // 下拉不要開頭的「舌」
      p.pulse = [...new Set(p.pulse.map(v => v.replace(/脈象?/g, '').replace(/^[：:，,\s]+/, '')).filter(Boolean))];   // 下拉不要「脈」字
    });
    return (cache[o.id] = uniqOut);
  }

  /* ---------- 八綱：由證型名、病機、治法、舌脈症的字面估計（可在報告單上再調整） ---------- */
  const count = (s, re) => (String(s).match(re) || []).length;
  const AX = [   // 順序照報告單：陰陽、虛實、寒熱、表裡
    { k: 'yy', a: '陰', b: '陽' },
    { k: 'xs', a: '虛', b: '實' },
    { k: 'hr', a: '寒', b: '熱' },
    { k: 'bl', a: '表', b: '裡' }
  ];
  function bagang(p) {
    const main = p.name + ' ' + p.bj + ' ' + p.zf, sub = p.tongue.join(' ') + ' ' + p.pulse.join(' ') + ' ' + p.sx.join(' ');
    const sc = (re, w) => count(main, re) * w + count(sub, re);
    const v = (pos, neg) => { const d = pos - neg; return Math.max(-1, Math.min(1, d / (Math.abs(pos) + Math.abs(neg) + 1.5))); };
    const hot = sc(/熱|火|燥|溫病|陽亢|陽明/g, 2.5) + count(sub, /黃|紅|絳|數|渴|煩/g);
    const cold = sc(/寒|冷|陽虛|溫中|溫陽|溫腎|溫肺|溫經|散寒|喜暖|喜溫/g, 2.5) + count(sub, /遲|緊|清稀|淡白|白滑|不渴|喜熱/g);
    const excess = sc(/實|滯|瘀|痰|濕|食積|食滯|積|阻|壅|結|閉|邪|鬱|逆|毒|亢/g, 2) + count(main, /瀉|祛|化|消|導|攻|逐|疏|清|散|通|利/g) + count(sub, /有力|滑|弦|拒按/g);
    const defic = sc(/虛|不足|虧|衰|弱|失養|損|勞/g, 2.5) + count(main, /補|益|養|滋|固|斂|健/g) + count(sub, /無力|細|弱|沉遲|喜按|乏|少氣/g);
    const ext = sc(/表|衛|外感|風寒束|風熱犯|風寒襲|風熱襲|暑濕傷表|解表|疏風/g, 2.5) + count(sub, /浮|惡寒發熱|惡風|頭身痛/g);
    const half = /少陽|半表半裡|半表半裏/.test(main);
    const ax = {
      hr: v(hot, cold),
      xs: v(excess, defic),
      bl: half ? 0 : ext >= 2.5 ? Math.min(1, 0.35 + ext / 10) : -0.6
    };
    ax.yy = Math.max(-1, Math.min(1, (1.2 * ax.hr + 0.7 * ax.xs + 0.5 * Math.sign(ax.bl)) / 2.4));   // 寒、虛、裡偏陰；熱、實、表偏陽
    return ax;
  }
  // 表裡的數值：負 = 表、正 = 裡（畫面上「表」在左）；bl 原本 + 為表，畫的時候反過來
  const axVal = (ax, k) => k === 'bl' ? -ax.bl : ax[k];
  const side = v => v <= -0.15 ? -1 : v >= 0.15 ? 1 : 0;
  const axTag = (ax, a) => { const s = side(axVal(ax, a.k)); return s < 0 ? (a.k === 'bl' ? '表' : a.a) : s > 0 ? (a.k === 'bl' ? '裡' : a.b) : (a.k === 'bl' ? '半表半裡' : '兩可'); };

  /* ---------- 畫面 ---------- */
  const root = document.createElement('div');
  root.id = 'bz';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '八綱辨證');
  document.body.appendChild(root);

  let cur = null, pats = [], report = null;

  let host = null, onGo = null;   // 嵌在大廳右側的毛玻璃欄時：host = 大廳裡的容器
  function show(id, keepFields) {
    const o = typeof by !== 'undefined' && by[id];
    if (!o || o.kind !== 'zd') return false;
    cur = o; pats = patterns(o);
    const old = report;
    report = blankReport();
    if (keepFields && old) report.name = old.name;
    root.hidden = false;
    if (!host) document.documentElement.classList.add('bz-open');
    draw();
    root.scrollTop = 0;
    pullOnce();
    return true;
  }
  function unmount() {
    if (!host) return;
    host = null; onGo = null;
    root.classList.remove('bz-embed');
    document.body.appendChild(root);
  }
  function open(id, keepFields) {   // 資料庫裡的全螢幕頁
    const fromLobby = host && cur && cur.id === id;
    unmount();
    if (fromLobby) {   // 從大廳的報告單按「›」進來：已經填的內容接著用
      root.hidden = false;
      document.documentElement.classList.add('bz-open');
      draw();
      root.scrollTop = 0;
      return true;
    }
    return show(id, keepFields);
  }
  // 大廳（同網域的 iframe）把報告單放進自己的欄位；go(id) = 按「›」時大廳要做的事
  function mount(container, id, go) {
    if (!by[id]) return false;
    host = container; onGo = go || null;
    root.classList.add('bz-embed');
    container.appendChild(root);
    return show(id, true);
  }
  function close() {
    root.hidden = true;
    document.documentElement.classList.remove('bz-open');
  }

  /* ---------- 報告單的資料 ---------- */
  const OTHER = '__other__';
  const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
  function blankReport() {
    return { name: '', sx: [], tongue: '', pulse: '', pat: '', bg: {}, fx: '', fxOther: '', herbs: [], adj: [], note: '', ax: { yy: 0, xs: 0, hr: 0, bl: 0 } };
  }
  const uniq = k => { const m = new Map(); pats.forEach(p => p[k].forEach(v => m.set(v, (m.get(v) || 0) + 1))); const list = [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); return k === 'tongue' ? list.map((v, i) => [tongueRank(v), i, v]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]) : list; };
  // 舌象排序：先舌色（淡 → 紅 → 絳 → 瘀紫），再舌苔（薄白 → 白膩 → 黃 → 灰黑 → 少苔、剝苔）
  const T_COLOR = [[/淡白/, 0], [/淡紅/, 2], [/淡/, 1], [/絳/, 5], [/紫|瘀|暗|青/, 6], [/紅/, 4]];
  const T_COAT = [[/薄白/, 0], [/白.*(滑|膩|厚)|(滑|膩|厚).*白/, 2], [/白/, 1], [/薄黃/, 3], [/黃.*(膩|燥|厚)|(膩|燥|厚).*黃/, 5], [/黃/, 4], [/灰/, 6], [/黑|焦/, 7], [/少|無|剝|光|鏡/, 8], [/膩|滑|厚/, 2]];
  function tongueRank(v) {
    const coat = /^(舌)?苔/.test(v) || (!/淡|紅|絳|紫|瘀|暗|青|胖|瘦|裂|齒/.test(v.split(/苔/)[0]) && /白|黃|膩|滑|厚|灰|黑|剝|少|無|乾|燥/.test(v)), t = coat ? v : v.split(/苔/)[0];
    const hit = (coat ? T_COAT : T_COLOR).find(([re]) => re.test(t));
    return (coat ? 100 : 0) + (hit ? hit[1] : coat ? 9 : 3) + (coat ? 0 : /苔/.test(v) ? 0.5 : 0);
  }
  // 依已填的伴隨症狀、舌、脈、八綱，算每個證型符合幾項
  function score(p) {
    const r = report;
    let s = 0, n = 0;
    if (!r.bgAuto) AX.forEach(a => { const want = r.bg[a.k]; if (!want) return; n++; const got = side(axVal(p.ax, a.k)); if (got === want) s++; else if (got === -want) s--; });
    r.sx.forEach(v => { n++; if (p.sx.includes(v)) s++; });
    if (r.tongue) { n++; if (p.tongue.includes(r.tongue.replace(/^舌苔/, '苔').replace(/^舌質?/, ''))) s++; }
    if (r.pulse) { n++; if (p.pulse.includes(r.pulse.replace(/脈象?/g, ''))) s++; }
    return { s, n };
  }
  function ranked() {
    const xs = pats.map(p => ({ p, sc: score(p) }));
    if (xs.some(x => x.sc.n)) xs.sort((a, b) => (b.sc.s - a.sc.s) || (a.p.i - b.p.i));
    return xs;
  }
  function fxComp(name) {
    if (!name) return null;
    for (const p of pats) for (const f of p.fx) if (f.name === name) return f.comp;
    return compOf(name);
  }
  function herbsOf(name) { const c = fxComp(name); return c ? c.hs.map(h => ({ n: h.n, id: h.id || null })) : []; }
  const herbId = n => { const h = typeof NB_HERB !== 'undefined' && NB_HERB[n]; return h ? h.id : null; };
  // 加一味藥：照藥物總表的分類檢索，先分溫、寒涼、中性，再分類，第二層是這一類的藥
  let HGC = null;
  const herbName = g => (by[g] && by[g].name) || g;
  function herbGroups() {
    if (HGC) return HGC;
    let cats = [];
    try { cats = typeof sheetCats === 'function' ? sheetCats() : []; } catch (e) { cats = []; }
    const kind = t => typeof XL_ORANGE !== 'undefined' && XL_ORANGE.has(t) ? ['溫', 'or'] : typeof XL_BLUE !== 'undefined' && XL_BLUE.has(t) ? ['寒涼', 'bl'] : ['中性', 'gy'];
    const out = [];
    ['溫', '寒涼', '中性'].forEach(k => cats.forEach(c => {
      const [sec, cls] = kind(c.t);
      if (sec !== k || !c.hs || !c.hs.length) return;
      const seen = new Set(), items = [];
      c.hs.forEach(x => { if (x.g && !seen.has(x.g)) { seen.add(x.g); items.push({ v: x.g, t: herbName(x.g) }); } });
      if (items.length) out.push({ name: c.t, items, sec, cls });
    }));
    return (HGC = out);
  }
  function allHerbNames() { return (DB.herbs || []).map(h => h.name).sort((a, b) => a.localeCompare(b, 'zh-Hant')); }
  function setPattern(p) {
    const r = report;
    r.pat = p.name;
    if (!r.tongue) r.tongue = p.tongue[0] || '';
    if (!r.pulse) r.pulse = p.pulse[0] || '';
    r.ax = { ...p.ax, bl: -p.ax.bl };
    r.bg = {}; AX.forEach(a => { const v = side(r.ax[a.k]); if (v) r.bg[a.k] = v; });
    r.bgAuto = true;   // 由證型帶出的八綱，不拿來算符合程度
    r.fx = p.fx[0] ? p.fx[0].name : '';
    r.herbs = herbsOf(r.fx);
  }

  /* ---------- 畫面：報告單本身就是辨證的路徑（主訴 → 伴隨症狀、舌、脈 → 證型 → 處方 → 藥物 → 加減） ---------- */
  function opt(v, label, sel) { return `<option value="${E(v)}"${sel ? ' selected' : ''}>${E(label)}</option>`; }
  function pickOrType(key, list, val, ph) {   // 下拉選單＋最後一列「其他（自訂）」→ 自己打字
    const typed = val && !list.includes(val);
    return `<select data-f="${key}">${opt('', '請選擇', !val)}${list.map(v => opt(v, v, v === val)).join('')}${opt(OTHER, '⊕ 其他（自訂）', typed || !!report['_t_' + key])}</select>
      ${typed || report['_t_' + key] ? `<input type="text" data-t="${key}" value="${E(typed ? val : '')}" placeholder="自己輸入${ph}">` : ''}`;
  }
  const herbTag = (h, i, k) => `<span class="bz-tag">${h.id ? `<a href="#${h.id}" data-bzgo="${h.id}">${E(h.n)}</a>` : E(h.n)}<button type="button" data-del="${k}" data-i="${i}" aria-label="移除${E(h.n)}">×</button></span>`;

  /* ---------- 多層懸浮選單（主訴、處方、加一味藥） ----------
   * tree：[{ t, v?（點了就選）, kids?（下一層）, n?, cls?, note? }]
   * 選單掛在 body 上（position: fixed），可以超出報告單的框；滑鼠碰到就展開下一層，手指用點的 */
  const CAS = {};
  function cascade(key, label, tree, val) {
    CAS[key] = { tree, val };
    return `<div class="bz-cas" data-cas="${key}"><button type="button" class="bz-cas-btn" aria-haspopup="true" aria-expanded="false"><span>${E(label)}</span></button></div>`;
  }
  let menu = null;
  const docOf = () => root.ownerDocument, winOf = () => root.ownerDocument.defaultView || window;
  const narrow = () => winOf().innerWidth <= 700;
  function openMenu(cas, path) {
    closeMenu();
    const key = cas.dataset.cas, def = CAS[key];
    if (!def) return;
    const el = docOf().createElement('div');
    el.className = 'bz-menu' + (host ? ' dark' : '');
    el.setAttribute('role', 'menu');
    docOf().body.appendChild(el);
    menu = { key, cas, el, path: path || [], def, timer: 0 };
    const btn0 = cas.querySelector('.bz-cas-btn'); if (btn0) btn0.setAttribute('aria-expanded', 'true');
    cas.classList.add('open');
    el.addEventListener('pointerover', e => {
      clearTimeout(menu && menu.timer);
      if (e.pointerType !== 'mouse' || narrow()) return;
      const b = e.target.closest('[data-i]');
      if (b && b.dataset.k === '1') setPath(+b.dataset.c, +b.dataset.i);
    });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') leaveSoon(); });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (e.target.closest('[data-back]')) { menu.path.pop(); renderMenu(); return; }
      if (!b) return;
      const node = nodeAt(+b.dataset.c, +b.dataset.i);
      if (node.kids) { setPath(+b.dataset.c, +b.dataset.i); return; }
      const k = menu.key;
      closeMenu();
      pickCas(k, node.v);
    });
    renderMenu();
  }
  function leaveSoon() { if (!menu) return; clearTimeout(menu.timer); menu.timer = setTimeout(closeMenu, 350); }
  function levelAt(c) { let lv = menu.def.tree; for (let k = 0; k < c; k++) lv = lv[menu.path[k]].kids; return lv; }
  function nodeAt(c, i) { return levelAt(c)[i]; }
  function setPath(c, i) { const np = menu.path.slice(0, c).concat(i); if (np.join() === menu.path.join()) return; menu.path = np; renderMenu(c + 1); }
  function renderMenu(keep) {   // keep：前面幾欄內容沒變，保留捲動位置
    if (!menu) return;
    const { el, path, def } = menu, N = narrow();
    const tops = [...el.children].map(x => x.scrollTop);
    const cols = [];
    for (let c = 0; c <= path.length; c++) cols.push(levelAt(c));
    const col = (lv, c) => `<div class="bz-mcol">${N && c ? `<button type="button" class="bz-mback" data-back>‹ ${E(levelAt(c - 1)[path[c - 1]].t)}</button>` : ''}${lv.map((x, i) => x.sec != null
      ? `<div class="bz-msec ${x.cls || ''}">${E(x.sec)}</div>`
      : `<button type="button" data-c="${c}" data-i="${i}" data-k="${x.kids ? 1 : 0}" class="${[x.cls || '', path[c] === i ? 'on' : '', x.v != null && x.v === def.val ? 'cur' : ''].join(' ')}">${E(x.t)}${x.note ? `<em>${E(x.note)}</em>` : ''}${x.kids ? `<small>${x.n != null ? x.n : x.kids.length}</small><i>›</i>` : ''}</button>`).join('')}</div>`;
    el.innerHTML = N ? col(cols[cols.length - 1], cols.length - 1) : cols.map(col).join('');
    if (!N && keep) [...el.children].slice(0, keep).forEach((x, k) => { x.scrollTop = tops[k] || 0; });
    placeMenu();
  }
  function placeMenu() {
    const { el, cas } = menu, W = winOf(), r = cas.getBoundingClientRect(), vw = W.innerWidth, vh = W.innerHeight;
    el.style.cssText = '';
    let top = r.bottom + 4, maxH = vh - top - 10;
    if (maxH < 260 && r.top > vh - r.bottom) { maxH = r.top - 14; el.style.bottom = (vh - r.top + 4) + 'px'; } else el.style.top = top + 'px';
    el.style.setProperty('--mh', Math.max(160, Math.min(maxH, 480)) + 'px');
    if (narrow()) { const w = Math.min(vw - 16, Math.max(r.width, 260)); el.style.width = w + 'px'; el.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px'; return; }
    // 方向在打開時就定好（按鈕在畫面右半邊就往左展開），之後展開下一層，第一欄都不會跟著跑
    if (menu.rev == null) menu.rev = r.left + r.width / 2 > vw / 2;
    if (menu.rev) { el.classList.add('rev'); el.style.right = Math.max(8, vw - r.right) + 'px'; }
    else el.style.left = Math.max(8, r.left) + 'px';
  }
  function closeMenu() {
    if (!menu) return;
    clearTimeout(menu.timer);
    menu.el.remove();
    menu.cas.classList.remove('open');
    const b = menu.cas.querySelector('.bz-cas-btn'); if (b) b.setAttribute('aria-expanded', 'false');
    menu = null;
  }
  const closeCas = closeMenu;
  // 處方的選單樹：［符合八綱］→ 本病常用（證型 → 方）→ 各系（病 → 方）→ 其他方劑
  let FX_SYS = null;
  const uniqBy = (arr, f) => { const seen = new Set(); return arr.filter(x => { const k = f(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const fxLeaf = (name, note) => ({ t: name, v: name, note });
  function fxTree() {
    if (!FX_SYS) {
      FX_SYS = [];
      const bySys = {};
      zzDiseases.filter(d => !d.dup && !/青光眼/.test(d.name)).forEach(d => (bySys[d.sys] = bySys[d.sys] || []).push(d));
      const used = new Set();
      Object.entries(bySys).forEach(([sy, ds]) => {
        const kids = ds.map(d => { const fs = uniqBy(patterns(d).flatMap(p => p.fx.map(f => f.name)), x => x); fs.forEach(n => used.add(n)); return fs.length ? { t: d.name, kids: fs.map(n => fxLeaf(n)) } : null; }).filter(Boolean);
        if (kids.length) FX_SYS.push({ t: sy, kids, n: kids.reduce((a, k) => a + k.kids.length, 0) });
      });
      const rest = (DB.formulas || []).map(f => f.name).filter(n => !used.has(n)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      if (rest.length) FX_SYS.push({ t: '其他方劑', kids: rest.map(n => fxLeaf(n)) });
    }
    const out = [];
    const hit = bgMatches();
    if (hit) {
      // 符合的方 + 自己輸入過的方（同一病、同樣的虛實陰陽寒熱），前面加序號；最後一列可以自訂
      const mine = myFx().filter(x => x.tag === hit.key && !hit.list.some(y => y.v === x.n)).map(x => fxLeaf(x.n, '自訂'));
      const list = hit.list.concat(mine).map((x, i) => ({ ...x, t: `${i + 1}. ${x.t}` }));
      out.push({ t: `符合「${hit.tag}」的方`, cls: 'hit', kids: (list.length ? list : [{ t: '本病沒有完全符合的證型', v: '', cls: 'none' }]).concat([{ t: '⊕ 其他（自訂）', v: OTHER, cls: 'dir' }]) });
    }
    // 我輸入過的方：所有病證輸入過的都列出來，同名只留一個（本病的排前面）
    const allMine = uniqBy(myFx().concat(...Object.values(myFxAll())), x => x.n);
    if (allMine.length) out.push({ t: '我輸入過的方', cls: 'hit', kids: allMine.map((x, i) => ({ t: `${i + 1}. ${x.n}`, v: x.n })) });
    const local = uniqBy(pats, p => p.name).filter(p => p.fx.length);
    if (local.length) out.push({ t: '本病常用', kids: local.map(p => ({ t: p.name, kids: p.fx.map(f => fxLeaf(f.name)) })), n: uniqBy(local.flatMap(p => p.fx), f => f.name).length });
    return out.concat(FX_SYS, [{ t: '⊕ 自定義處方', v: OTHER, cls: 'dir' }]);
  }
  // 虛實、陰陽、寒熱：選了之後，找本病裡八綱相符的證型，帶出它們的方
  function bgMatches() {
    const want = AX.filter(a => report.bg[a.k]);
    if (!want.length || report.bgAuto) return null;
    const tag = want.map(a => report.bg[a.k] < 0 ? a.a : a.b).join('・');
    const sc = p => want.reduce((n, a) => n + (side(axVal(p.ax, a.k)) === report.bg[a.k] ? 1 : 0), 0);
    let best = 0; pats.forEach(p => { best = Math.max(best, sc(p)); });
    const ps = best ? pats.filter(p => sc(p) === best) : [];
    const list = uniqBy(ps.flatMap(p => p.fx.map(f => fxLeaf(f.name, p.name))), x => x.v);
    return { tag: best < want.length && best ? tag + '（部分）' : tag, key: tag, list };
  }
  // 自己輸入的方：存在這台裝置，依病名分開；記下輸入當時選的虛實陰陽寒熱
  const MYFX = 'tcm-bz-myfx-v1';
  function myFxAll() { try { return JSON.parse(localStorage.getItem(MYFX) || '{}') || {}; } catch (e) { return {}; } }
  function myFx() { return (cur && myFxAll()[cur.id]) || []; }
  function bgTag() { const want = AX.filter(a => report.bg[a.k]); return report.bgAuto || !want.length ? '' : want.map(a => report.bg[a.k] < 0 ? a.a : a.b).join('・'); }
  function saveMyFx(name) { if (cur) saveFxFor(cur.id, name, bgTag()); }
  function saveFxFor(id, name, tag) {
    name = String(name || '').trim();
    if (!name || !id) return;
    const all = myFxAll(), list = all[id] || [];
    if (list.some(x => x.n === name && x.tag === tag)) return;
    const i = list.findIndex(x => x.n === name);   // 同一病同名的方只留一筆（記最後一次的虛實陰陽寒熱）
    if (i >= 0) list.splice(i, 1);
    list.push({ n: name, tag });
    all[id] = list;
    try { localStorage.setItem(MYFX, JSON.stringify(all)); } catch (e) {}
    fxlRefresh();
    syncFx(true);
  }
  /* ---------- 自訂的方：用 GitHub 私人備份庫（tcm-notes）在電腦、手機之間同步 ----------
   * 每台裝置第一次按「☁ 同步」貼上只能讀寫 tcm-notes 內容的金鑰（只存在這台裝置）；之後自動合併上傳／下載 */
  const GH_KEY = 'tcm-gh-token-v1', GH_URL = 'https://api.github.com/repos/janetlo8321/tcm-notes/contents/sync/myfx.json';
  const ghToken = () => { try { return localStorage.getItem(GH_KEY) || ''; } catch (e) { return ''; } };
  const b64e = t => btoa(unescape(encodeURIComponent(t))), b64d = t => decodeURIComponent(escape(atob(t.replace(/\s/g, ''))));
  function mergeFx(a, b) {
    const out = {};
    [a, b].forEach(src => Object.entries(src || {}).forEach(([id, l]) => {
      const dst = out[id] = out[id] || [];
      (l || []).forEach(x => { if (x && x.n && !dst.some(y => y.n === x.n && y.tag === x.tag)) dst.push({ n: x.n, tag: x.tag || '' }); });
    }));
    return out;
  }
  let syncing = null, syncMsg = '';
  async function syncFx(push, tries) {
    const tok = ghToken();
    if (!tok) return false;
    if (syncing) { await syncing.catch(() => {}); }
    syncing = (async () => {
      const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      const r = await fetch(GH_URL + '?t=' + Date.now(), { headers: H, cache: 'no-store' });
      let remote = {}, sha;
      if (r.ok) { const j = await r.json(); sha = j.sha; try { remote = JSON.parse(b64d(j.content)); } catch (e) {} }
      else if (r.status !== 404) throw new Error(r.status === 401 ? '金鑰無效或過期' : r.status === 403 || r.status === 404 ? '金鑰沒有 tcm-notes 的權限' : 'HTTP ' + r.status);
      const merged = mergeFx(remote, myFxAll());
      try { localStorage.setItem(MYFX, JSON.stringify(merged)); } catch (e) {}
      if (JSON.stringify(merged) !== JSON.stringify(remote) && (push || !sha)) {
        const w = await fetch(GH_URL, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '同步自訂處方', content: b64e(JSON.stringify(merged, null, 1)), ...(sha ? { sha } : {}) }) });
        if ((w.status === 409 || w.status === 422) && (tries || 0) < 2) { syncing = null; return syncFx(push, (tries || 0) + 1); }
        if (!w.ok) throw new Error(w.status === 403 || w.status === 404 ? '金鑰沒有寫入 tcm-notes 的權限' : 'HTTP ' + w.status);
      }
      return true;
    })();
    try { await syncing; syncMsg = '已同步 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }); return true; }
    catch (e) { syncMsg = '同步失敗：' + e.message; return false; }
    finally { syncing = null; const el = root.querySelector('[data-bz="sync"]'); if (el) el.title = syncMsg; }
  }
  let pulled = false;
  async function pullOnce() { if (pulled || !ghToken()) return; pulled = true; if (await syncFx(false)) { if (report && !root.hidden) keep(draw); fxlRefresh(); } }
  async function syncSetup() {
    const W = winOf(), has = !!ghToken();
    const v = W.prompt(has ? `自訂處方已設定同步（${syncMsg || '尚未同步'}）。\n要換金鑰就貼上新的；輸入「關閉」停止這台裝置的同步；直接按確定立即同步。`
      : '貼上 GitHub 金鑰（只限 tcm-notes 的 Contents 讀寫），之後這台裝置的自訂處方會自動同步。', '');
    if (v == null) return;
    const t = v.trim();
    if (t === '關閉') { try { localStorage.removeItem(GH_KEY); } catch (e) {} W.alert('這台裝置已停止同步（已存的方還在）。'); keep(draw); return; }
    if (t) { try { localStorage.setItem(GH_KEY, t); } catch (e) {} }
    const ok = await syncFx(true);
    W.alert(ok ? '同步完成。電腦和手機都設定好之後，自訂的方會自動互通。' : syncMsg);
    keep(draw);
  }
  // 加一味藥：溫／寒涼／中性 → 分類 → 藥
  function herbTree() {
    const out = [];
    ['溫', '寒涼', '中性'].forEach(k => {
      const cats = herbGroups().filter(g => g.sec === k);
      if (cats.length) out.push({ t: k, cls: cats[0].cls, n: cats.length, kids: cats.map(g => ({ t: g.name, cls: g.cls, kids: g.items.map(x => ({ t: x.t, v: x.v })) })) });
    });
    return out.length ? out.concat([{ t: '⊕ 其他（自訂）', v: OTHER, cls: 'dir' }]) : null;
  }
  function pickCas(key, v) {
    const r = report;
    if (v == null || v === '') return;
    if (key === 'fxq') key = 'fx';   // 查詢選到的方
    if (key === 'herb') {
      if (v === OTHER) { r._t_herb = true; keep(draw); focusLater('[data-add="herb"]'); return; }
      r._t_herb = false;
      const nm = herbName(v);
      if (nm && !r.herbs.some(h => h.n === nm)) r.herbs.push({ n: nm, id: by[v] ? v : herbId(nm) });
      keep(draw);
      return;
    }
    if (key === 'cc') { show(v, true); return; }
    if (key === 'fx') {
      if (v === OTHER) { r.fx = OTHER; r.herbs = []; keep(draw); focusLater('[data-v="fxOther"]'); return; }
      r.fx = v; r.herbs = herbsOf(v);
      keep(draw);
    }
  }

  function draw() {
    const o = cur, r = report;
    const sysGroups = {};
    zzDiseases.filter(d => !d.dup && !/青光眼/.test(d.name)).forEach(d => (sysGroups[d.sys] = sysGroups[d.sys] || []).push(d));
    const R = ranked(), anyCrit = R.some(x => x.sc.n);
    const patNames = [];
    R.forEach(x => { if (!patNames.includes(x.p.name)) patNames.push(x.p.name); });
    const patLabel = n => { const x = R.find(y => y.p.name === n); return anyCrit && x && x.sc.n ? `${n}（符合 ${Math.max(0, x.sc.s)}/${x.sc.n}）` : n; };
    const typedPat = r.pat && !patNames.includes(r.pat);
    const curPat = pats.find(p => p.name === r.pat);
    const fxTyped = r.fx === OTHER;
    const SX = uniq('sx').filter(v => !r.sx.includes(v));
    const HT = herbTree();

    root.innerHTML = `
      <div class="bz-top">
        <button type="button" class="bz-back" data-bz="close" aria-label="返回">‹ 返回</button>
        <div class="bz-title"><small>八綱辨證・${E(o.sys)}</small><b>${E(o.name)}</b></div>
        <button type="button" class="bz-tbl" data-bzgo="${o.id}">原表格</button>
      </div>
      <div class="bz-body">
      <div class="bz-rep" id="bzRep">
        <div class="bz-rh"><button type="button" class="bz-go" data-bz="go" aria-label="${host ? '在資料庫裡打開' : '看原表格'}" title="${host ? '在資料庫裡打開' : '看原表格'}">›</button>
          <label class="bz-name">姓名<input type="text" data-v="name" value="${E(r.name)}" placeholder="輸入" autocomplete="off"></label><span>${today()}</span></div>
        <div class="bz-form">
          <div class="bz-fld"><span class="bz-lb">主訴</span>${cascade('cc', o.name, Object.entries(sysGroups).map(([sy, ds]) => ({ t: sy, kids: ds.map(d => ({ v: d.id, t: d.name })) })), o.id)}</div>
          <div class="bz-fld"><span class="bz-lb">伴隨症狀</span>
            <select data-f="sx">${opt('', r.sx.length ? '再加一項…' : '可選多項', true)}${SX.map(v => opt(v, v)).join('')}${opt(OTHER, '⊕ 其他（自訂）')}</select>
            ${r._t_sx ? `<input type="text" data-add="sx" placeholder="輸入症狀後按 Enter">` : ''}
            ${r.sx.length ? `<div class="bz-tags">${r.sx.map((v, i) => `<span class="bz-tag s">${E(v)}<button type="button" data-del="sx" data-i="${i}" aria-label="移除">×</button></span>`).join('')}</div>` : ''}</div>
          <label>舌象${pickOrType('tongue', uniq('tongue'), r.tongue, '舌象')}</label>
          <label>脈象${pickOrType('pulse', uniq('pulse'), r.pulse, '脈象')}</label>
          <div class="bz-fld"><span class="bz-lb">證型</span>
            <div class="bz-bgs">${AX.filter(a => a.k !== 'bl').map(a => `<span class="bz-bg2" data-ax="${a.k}">${[-1, 1].map(w => `<button type="button" data-w="${w}" class="${r.bg[a.k] === w ? 'on' : ''}">${w < 0 ? (a.k === 'bl' ? '表' : a.a) : (a.k === 'bl' ? '裡' : a.b)}</button>`).join('')}</span>`).join('')}</div>
</div>
          <div class="bz-fld"><span class="bz-lb">處方</span>
            ${cascade('fx', fxTyped ? '⊕ 自定義處方' : (r.fx || '請選擇'), fxTree(), r.fx)}
            ${fxTyped ? `<input type="text" data-v="fxOther" value="${E(r.fxOther)}" placeholder="輸入處方名稱">` : ''}
            <label class="bz-q" data-cas="fxq"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" data-q placeholder="查詢" autocomplete="off" enterkeyhint="search" aria-label="查詢處方"></label></div>
          <div class="bz-fld wide"><span class="bz-lb">藥物${r.fx && !fxTyped ? `<small>${E(r.fx)} 的組成</small>` : ''}</span>
            <div class="bz-box">${r.herbs.length ? r.herbs.map((h, i) => herbTag(h, i, 'herbs')).join('') : `<i class="bz-tbd">${r.fx && !fxTyped ? '這個方的組成待補，可以自己加' : '選處方後會列出組成'}</i>`}</div>
            <div class="bz-addrow">${HT ? cascade('herb', '加一味藥…', HT, null)
              : `<select data-f="herb">${opt('', '加一味藥…', true)}${allHerbNames().map(n => opt(n, n)).join('')}${opt(OTHER, '⊕ 其他（自訂）')}</select>`}
              ${r._t_herb ? `<input type="text" data-add="herb" placeholder="輸入藥名後按 Enter">` : ''}</div></div>
          <div class="bz-fld wide"><span class="bz-lb">藥物加減</span>
            ${r.adj.map((v, i) => `<div class="bz-adj"><input type="text" data-adj="${i}" value="${E(v)}" placeholder="例如：痛甚加延胡索、川楝子"><button type="button" data-del="adj" data-i="${i}" aria-label="刪除這一列">×</button></div>`).join('')}
            <button type="button" class="bz-plus" data-bz="adj">⊕ 加一列</button>
            ${curPat && curPat.jj ? `<p class="bz-hint">書上的加減：${E(curPat.jj)}</p>` : ''}</div>
        </div>
        <label class="bz-note">醫囑 / 備註<textarea data-v="note" rows="3" placeholder="輸入">${E(r.note)}</textarea></label>
        <div class="bz-acts"><button type="button" data-bz="print">列印</button><button type="button" data-bz="clear">清空</button><button type="button" data-bz="sync" title="${E(syncMsg)}">${ghToken() ? '☁ 已同步' : '☁ 同步'}</button></div>
      </div>
      ${curPat ? `<section class="bz-ref"><h2>參考：${E(curPat.name)}<small>${SRC[curPat.src] || ''}</small></h2>${refCard(curPat)}</section>`
        : !pats.length ? `<p class="bz-none">這個病證沒有可拆成證型的表格（例如只有針灸圖或段落）。可以看<a href="#${o.id}" data-bzgo="${o.id}">原表格／內文</a>，報告單每一欄都能自己輸入。</p>` : ''}
      </div>`;
  }
  function refCard(p) {   // 選定證型的書上內容，方便對照記憶
    return `<div class="bz-card">
      ${p.tongue.length ? `<div class="bz-row"><b class="bz-k t">舌</b><div>${p.tongue.map(v => `<span class="bz-mini t">${E(v)}</span>`).join('')}</div></div>` : ''}
      ${p.pulse.length ? `<div class="bz-row"><b class="bz-k p">脈</b><div>${p.pulse.map(v => `<span class="bz-mini p">${E(v)}</span>`).join('')}</div></div>` : ''}
      ${p.sx.length ? `<div class="bz-row"><b class="bz-k s">症</b><div>${p.sx.map(v => `<span class="bz-mini">${E(v)}</span>`).join('')}</div></div>` : ''}
      ${p.bj ? `<div class="bz-row"><b class="bz-k">機</b><div class="bz-txt">${E(p.bj)}</div></div>` : ''}
      ${p.zf ? `<div class="bz-row"><b class="bz-k z">法</b><div class="bz-txt"><strong>${E(p.zf)}</strong></div></div>` : ''}
      <div class="bz-fx">${p.fx.length ? p.fx.map(f => `<div class="bz-fx1"><b class="bz-fname">${E(f.raw)}</b><div class="bz-herbs">${f.comp ? f.comp.hs.map(h => h.id ? `<a class="bz-herb" href="#${h.id}" data-bzgo="${h.id}">${E(h.n)}</a>` : `<span class="bz-herb">${E(h.n)}</span>`).join('') : '<i class="bz-tbd">組成待補</i>'}</div></div>`).join('') : `<b class="bz-fname">${E(p.fxText || '（未列方）')}</b>`}</div>
    </div>`;
  }

  /* ---------- 操作 ---------- */
  function keep(fn) { const y = root.scrollTop; fn(); root.scrollTop = y; }
  function focusLater(sel) { const el = root.querySelector(sel); if (el) el.focus(); }
  root.addEventListener('click', e => {
    const t = e.target;
    const cas = t.closest('.bz-cas');
    if (cas) {
      if (menu && menu.cas === cas) { if (Date.now() - (+cas.dataset.hov || 0) > 800) closeMenu(); }   // 滑鼠碰到時已經展開：這一下不要又把它關掉
      else openMenu(cas);
      return;
    }
    closeCas();
    const g = t.closest('[data-bzgo]');
    if (g) { e.preventDefault(); close(); go(g.dataset.bzgo); return; }
    const b = t.closest('[data-bz]');
    if (b) {
      const k = b.dataset.bz;
      if (k === 'go') { if (host) { if (onGo) onGo(cur.id); } else { close(); go(cur.id); } }
      else if (k === 'close') close();
      else if (k === 'sync') syncSetup();
      else if (k === 'print') (root.ownerDocument.defaultView || window).print();
      else if (k === 'clear') { report = blankReport(); keep(draw); }
      else if (k === 'adj') { report.adj.push(''); keep(draw); focusLater(`[data-adj="${report.adj.length - 1}"]`); }
      return;
    }
    const d = t.closest('[data-del]');
    if (d) { report[d.dataset.del].splice(+d.dataset.i, 1); keep(draw); return; }
    const w = t.closest('.bz-bg2 button');
    if (w) {   // 八綱：點一下選、再點一下取消；刻度跟著動
      const k = w.parentNode.dataset.ax, v = +w.dataset.w;
      report.bgAuto = false;
      report.bg[k] = report.bg[k] === v ? 0 : v;
      if (!report.bg[k]) delete report.bg[k];
      report.ax[k] = (report.bg[k] || 0) * 0.6;
      keep(draw);
      const fc = root.querySelector('[data-cas="fx"]');   // 處方那格自動跳出相符的方
      if (fc && Object.keys(report.bg).length) openMenu(fc, [0]);
    }
  });
  // 滑鼠：碰到選單鈕就展開；離開選單鈕和選單一下子就收起
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const cas = e.target.closest('.bz-cas');
    if (!cas) return;
    if (menu && menu.cas === cas) { clearTimeout(menu.timer); return; }
    cas.dataset.hov = Date.now();
    openMenu(cas);
  });
  root.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse' || !menu) return;
    const cas = e.target.closest('.bz-cas');
    if (cas && cas === menu.cas && !cas.contains(e.relatedTarget) && !menu.el.contains(e.relatedTarget)) leaveSoon();
  });
  root.addEventListener('scroll', () => closeMenu(), { passive: true });
  docOf().addEventListener('pointerdown', e => { if (menu && !menu.el.contains(e.target) && !menu.cas.contains(e.target)) closeMenu(); }, true);
  root.addEventListener('change', e => {
    const t = e.target, k = t.dataset.f, r = report;
    if (!k) return;
    if (k === 'cc') { show(t.value, true); return; }
    if (t.value === OTHER) {   // 其他（自訂）：出現輸入框
      r['_t_' + k] = true;
      if (k === 'fx') { r.fx = OTHER; r.herbs = []; }
      else if (k !== 'sx' && k !== 'herb') r[k] = '';
      keep(draw);
      focusLater(k === 'fx' ? '[data-v="fxOther"]' : k === 'sx' || k === 'herb' ? `[data-add="${k}"]` : `[data-t="${k}"]`);
      return;
    }
    r['_t_' + k] = false;
    if (k === 'sx') { if (t.value && !r.sx.includes(t.value)) r.sx.push(t.value); }
    else if (k === 'herb') { if (t.value && !r.herbs.some(h => h.n === t.value)) r.herbs.push({ n: t.value, id: herbId(t.value) }); }
    else if (k === 'pat') { const p = pats.find(x => x.name === t.value); if (p) setPattern(p); else r.pat = t.value; }
    else if (k === 'fx') { r.fx = t.value; r.herbs = herbsOf(t.value); }
    else r[k] = t.value;
    keep(draw);
  });
  // 自訂處方打完（按 Enter 或離開輸入框）：記下來，下次會出現在「符合的方」清單裡
  root.addEventListener('change', e => {
    if (!e.target.dataset || e.target.dataset.v !== 'fxOther') return;
    const v = e.target.value.trim();
    if (!v) return;
    saveMyFx(v);
    report.fx = v; report.fxOther = '';   // 選單上直接顯示這個方名
    keep(draw);
  });
  root.addEventListener('keydown', e => { if (e.target.dataset && e.target.dataset.v === 'fxOther' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.blur(); } });
  // 處方查詢：打字就列出相關方劑（資料庫的方＋自己輸入過的方），點一下選用
  function fxSearch(q) {
    q = q.trim();
    if (!q) return [];
    const mine = new Set(); Object.values(myFxAll()).forEach(l => l.forEach(x => mine.add(x.n)));
    if (!FX_SYS) fxTree();
    const leaves = []; const walk = l => l.forEach(x => x.kids ? walk(x.kids) : x.v && leaves.push(x.v)); walk(FX_SYS);
    const names = uniqBy((DB.formulas || []).map(f => f.name).concat(leaves, pats.flatMap(p => p.fx.map(f => f.name)), [...mine]), x => x);
    return names.filter(n => n.includes(q))
      .sort((a, b) => (b.startsWith(q) - a.startsWith(q)) || a.length - b.length || a.localeCompare(b, 'zh-Hant'))
      .slice(0, 60).map(n => fxLeaf(n, mine.has(n) && !(DB.formulas || []).some(f => f.name === n) ? '自訂' : ''));
  }
  root.addEventListener('input', e => {
    const t = e.target;
    if (!t.matches || !t.matches('[data-q]')) return;
    const anchor = t.closest('.bz-q'), list = fxSearch(t.value);
    CAS.fxq = { tree: list.length ? list : (t.value.trim() ? [{ t: '找不到相關的方', v: '', cls: 'none' }] : []), val: report.fx };
    if (!CAS.fxq.tree.length) { closeMenu(); return; }
    if (menu && menu.key === 'fxq') { menu.def = CAS.fxq; menu.path = []; renderMenu(); } else openMenu(anchor, []);
  });
  root.addEventListener('keydown', e => {
    if (!e.target.matches || !e.target.matches('[data-q]') || e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const first = fxSearch(e.target.value)[0];
    if (first) { closeMenu(); pickCas('fx', first.v); }
  });
  root.addEventListener('input', e => {
    const t = e.target, r = report;
    if (t.dataset.v) r[t.dataset.v] = t.value;
    if (t.dataset.t) r[t.dataset.t] = t.value;
    if (t.dataset.adj) r.adj[+t.dataset.adj] = t.value;
  });
  root.addEventListener('keydown', e => {   // 自訂症狀、藥名：按 Enter 加入
    const t = e.target;
    if (!t.dataset || !t.dataset.add || e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const v = t.value.trim(), k = t.dataset.add;
    if (v) { if (k === 'sx') { if (!report.sx.includes(v)) report.sx.push(v); } else if (!report.herbs.some(h => h.n === v)) report.herbs.push({ n: v, id: herbId(v) }); }
    keep(draw);
    focusLater(`[data-add="${k}"]`);
  });
  root.addEventListener('focusout', e => {   // 打完字離開輸入框也加入
    const t = e.target;
    if (!t.dataset || !t.dataset.add || !t.value.trim()) return;
    const v = t.value.trim(), k = t.dataset.add;
    if (k === 'sx') { if (!report.sx.includes(v)) report.sx.push(v); } else if (!report.herbs.some(h => h.n === v)) report.herbs.push({ n: v, id: herbId(v) });
    t.value = '';
    setTimeout(() => keep(draw), 0);
  });
  root.addEventListener('change', e => {   // 自訂的舌、脈、證型打完後重算排序
    if (e.target.dataset && e.target.dataset.t) keep(draw);
  });
  // 八綱刻度：拖曳或用方向鍵調整
  let drag = null;
  function setAx(el, x) {
    const rc = el.getBoundingClientRect(), k = el.closest('[data-ax]').dataset.ax;
    const v = Math.max(-1, Math.min(1, ((x - rc.left) / rc.width - 0.5) / 0.46));
    report.ax[k] = v;
    el.querySelector('i').style.left = (50 + v * 46).toFixed(1) + '%';
    el.setAttribute('aria-valuenow', Math.round(v * 100));
  }
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest('.bz-mt');
    if (!el) return;
    drag = el; el.setPointerCapture(e.pointerId); setAx(el, e.clientX); e.preventDefault();
  });
  root.addEventListener('pointermove', e => { if (drag) setAx(drag, e.clientX); });
  root.addEventListener('pointerup', () => { drag = null; });
  root.addEventListener('keydown', e => {
    const el = e.target.closest && e.target.closest('.bz-mt');
    if (!el || !/Arrow(Left|Right)/.test(e.key)) return;
    const k = el.closest('[data-ax]').dataset.ax;
    report.ax[k] = Math.max(-1, Math.min(1, report.ax[k] + (e.key === 'ArrowLeft' ? -0.1 : 0.1)));
    el.querySelector('i').style.left = (50 + report.ax[k] * 46).toFixed(1) + '%';
    e.preventDefault();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden && !host) close(); });

  /* ---------- 資料庫病證頁加入口 ---------- */
  function addEntry() {
    const id = typeof state !== 'undefined' && state.cur;
    const o = id && by[id];
    const entry = document.getElementById('entry');
    if (!entry || !o || o.kind !== 'zd' || entry.querySelector('.bz-entry')) return;
    const h = entry.querySelector('h1');
    if (!h) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bz-entry';
    b.textContent = '八綱辨證 ›';
    b.addEventListener('click', () => open(o.id));
    h.insertAdjacentElement('afterend', b);
  }
  const entryEl = document.getElementById('entry');
  if (entryEl) { new MutationObserver(addEntry).observe(entryEl, { childList: true }); addEntry(); }

  /* ---------- 資料庫的病證頁：放大縮小那一列上方，依序列出本病提到的方＋自己輸入過的方，最後一列可自訂 ---------- */
  function fxlHtml(o) {
    const own = new Set();
    const names = uniqBy(patterns(o).flatMap(p => p.fx.map(f => f.name)), x => x);
    names.forEach(n => own.add(n));
    const mine = uniqBy(myFxAll()[o.id] || [], x => x.n).filter(x => !own.has(x.n));
    const fid = n => { const f = (DB.formulas || []).find(x => x.name === n); return f ? f.id : null; };
    const item = (n, i, tag) => { const id = fid(n); return `<li><span class="bz-fxl-no">${i}.</span>${id ? `<a href="#${id}" data-go="${id}">${E(n)}</a>` : `<span>${E(n)}</span>`}${tag ? `<small>${E(tag)}</small>` : ''}</li>`; };
    return `<h3>本病的方<small>${names.length} 首${mine.length ? `・自訂 ${mine.length} 首` : ''}</small></h3>
      <ol>${names.map((n, i) => item(n, i + 1)).join('')}${mine.map((x, i) => item(x.n, names.length + i + 1, x.tag ? '自訂・' + x.tag : '自訂')).join('')}
      <li class="bz-fxl-add"><button type="button" data-fxl-add>⊕ 其他（自訂）</button><input type="text" data-fxl-in placeholder="輸入方名後按 Enter" hidden></li></ol>`;
  }
  function fxlRefresh() {
    const ent = document.getElementById('entry');
    if (!ent || typeof state === 'undefined') return;
    const o = by[state.cur], bar = ent.querySelector('.nb-zbar');
    if (!o || o.kind !== 'zd' || !bar) return;
    let box = ent.querySelector('.bz-fxl');
    if (!box) { box = document.createElement('div'); box.className = 'bz-fxl'; bar.parentNode.insertBefore(box, bar); }
    box.dataset.id = o.id;
    box.innerHTML = fxlHtml(o);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fxl-add]');
    if (!b) return;
    const inp = b.parentNode.querySelector('[data-fxl-in]');
    inp.hidden = false; b.hidden = true; inp.focus();
  });
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (!t.matches || !t.matches('[data-fxl-in]') || e.isComposing) return;
    if (e.key === 'Escape') { fxlRefresh(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const box = t.closest('.bz-fxl');
    saveFxFor(box.dataset.id, t.value, '');
    fxlRefresh();
  });
  const entObs = document.getElementById('entry');
  if (entObs) new MutationObserver(() => { if (!entObs.querySelector('.bz-fxl')) { fxlRefresh(); pullOnce(); } }).observe(entObs, { childList: true });
  fxlRefresh();

  window.TCMBZ = { open, close, mount, unmount, patterns: id => patterns(by[id]) };
})();

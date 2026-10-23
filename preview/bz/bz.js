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
  function openMenu(cas, path, keyOver) {
    closeMenu();
    const key = keyOver || cas.dataset.cas, def = CAS[key];
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
    if (key === 'fxq' || key === 'fxhit') key = 'fx';   // 查詢、符合的方選到的方
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
</div>
          ${r.sx.length ? `<div class="bz-tags wide">${r.sx.map((v, i) => `<span class="bz-tag s">${E(v)}<button type="button" data-del="sx" data-i="${i}" aria-label="移除">×</button></span>`).join('')}</div>` : ''}
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
        <div class="bz-note"><div class="bz-note-h"><label for="bzNote">醫囑 / 備註</label>
          <span class="bz-clr"><label><input type="checkbox" data-clrchk> 清空</label><button type="button" data-bz="clear" disabled>確認</button></span></div>
          <textarea id="bzNote" data-v="note" rows="3" placeholder="輸入">${E(r.note)}</textarea></div>
        <div class="bz-acts"><button type="button" data-bz="print">列印</button><button type="button" data-bz="stat">統計</button><button type="button" data-bz="sync" title="${E(syncMsg)}">${ghToken() ? '☁ 已同步' : '☁ 同步'}</button></div>
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
      if (menu && menu.cas === cas && menu.key === 'fxhit') openMenu(cas);   // 自動跳出的「符合的方」：按處方格改開完整選單
      else if (menu && menu.cas === cas) { if (Date.now() - (+cas.dataset.hov || 0) > 800) closeMenu(); }   // 滑鼠碰到時已經展開：這一下不要又把它關掉
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
      else if (k === 'clear') { if (!b.disabled) { report = blankReport(); keep(draw); } }
      else if (k === 'stat') statOpen();
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
      // 只跳出「符合的方」那一欄，不帶出左邊整個分類選單
      const hit = fc && Object.keys(report.bg).length && CAS.fx && CAS.fx.tree[0] && CAS.fx.tree[0].cls === 'hit' ? CAS.fx.tree[0] : null;
      if (hit) { CAS.fxhit = { tree: hit.kids, val: report.fx }; openMenu(fc, [], 'fxhit'); }
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
  root.addEventListener('change', e => {   // 「清空」要先打勾，確認鈕才能按
    if (!e.target.matches('[data-clrchk]')) return;
    const b = root.querySelector('.bz-clr [data-bz="clear"]'); if (b) b.disabled = !e.target.checked;
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

  /* ---------- 小黑學長脈證處方表：欄寬可拉、不再調換欄位、長按格子可編輯 ----------
   * 欄寬與改過的格子存在這台裝置（tcm-xh-v1），有設定 GitHub 同步時一起存到 tcm-notes sync/xh.json */
  const XHK = 'tcm-xh-v1', XH_URL = GH_URL.replace('myfx.json', 'xh.json');
  const xhLoad = () => { try { const o = JSON.parse(localStorage.getItem(XHK) || '{}'); return { w: o.w || {}, e: o.e || {} }; } catch (e) { return { w: {}, e: {} }; } };
  let XS = xhLoad();
  const xhSave = () => { try { localStorage.setItem(XHK, JSON.stringify(XS)); } catch (e) {} clearTimeout(xhSave.t); xhSave.t = setTimeout(() => xhSync(true), 1500); };
  function xhMerge(a, b) {   // 每一欄、每一格各取比較新的那一份
    const out = { w: {}, e: {} };
    [a, b].forEach(src => ['w', 'e'].forEach(k => Object.entries((src && src[k]) || {}).forEach(([id, v]) => { if (!out[k][id] || (v.t || 0) > (out[k][id].t || 0)) out[k][id] = v; })));
    return out;
  }
  async function xhSync(push) {
    const tok = ghToken(); if (!tok) return false;
    try {
      const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      const r = await fetch(XH_URL + '?t=' + Date.now(), { headers: H, cache: 'no-store' });
      let remote = { w: {}, e: {} }, sha;
      if (r.ok) { const j = await r.json(); sha = j.sha; try { remote = JSON.parse(b64d(j.content)); } catch (e) {} }
      const merged = xhMerge(remote, xhLoad());
      const changed = JSON.stringify(merged) !== JSON.stringify(XS);
      XS = merged; try { localStorage.setItem(XHK, JSON.stringify(XS)); } catch (e) {}
      if (changed) xhDecorate();
      if (push && JSON.stringify(merged) !== JSON.stringify(remote))
        await fetch(XH_URL, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '同步脈證處方表', content: b64e(JSON.stringify(merged, null, 1)), ...(sha ? { sha } : {}) }) });
      return true;
    } catch (e) { return false; }
  }
  const xhOK = () => typeof XH !== 'undefined' && typeof xhOrder !== 'undefined';
  if (typeof xhApply === 'function' && xhOK()) {
    // 不再調換欄位：一律照原表順序
    try { xhOrder = XH_DEF.slice(); localStorage.removeItem('xhOrder'); } catch (e) {}
    window.xhMove = () => {};
    window.xhApply = function () {
      const st = document.getElementById('xhCss'), g = document.querySelector('.xh-g'); if (!st || !g) return;
      xhOrder = XH_DEF.slice();
      g.style.gridTemplateColumns = xhOrder.map(i => ((XS.w[i] && XS.w[i].v) || XH.cols[i].w) + 'em').join(' ');
      st.textContent = xhOrder.map((c, p) => `.xh-g [data-c="${c}"]{grid-column:${p + 1}}`).join('');
    };
    const _init = window.xhInit;
    window.xhInit = function () { const r = _init.apply(this, arguments); xhDecorate(); xhSync(false); return r; };
  }
  function xhDecorate() {
    const g = document.querySelector('.xh-g'); if (!g || !xhOK()) return;
    const sec = g.closest('.xh-sec');
    if (sec) {
      const note = sec.querySelector('.note'); if (note) note.textContent = '拖曳欄位標頭右邊的分隔線可以調整欄寬；長按格子可以編輯，點格子外面就存好。紅字、藍字照原表。方名可以點。';
      const rs = sec.querySelector('[data-xhreset]'); if (rs) { rs.textContent = '還原欄寬'; rs.dataset.xhwreset = ''; delete rs.dataset.xhreset; }
    }
    g.querySelectorAll('.xh-h').forEach(h => {
      h.removeAttribute('draggable'); h.removeAttribute('title');
      if (!h.querySelector('.xh-rs')) { const i = document.createElement('i'); i.className = 'xh-rs'; i.setAttribute('aria-label', '拖曳調整欄寬'); h.appendChild(i); }
    });
    g.querySelectorAll('.xh-c').forEach((c, i) => {
      c.dataset.xi = i;
      const ed = XS.e[i]; if (!ed) return;
      let d = c.firstElementChild; if (!d) { d = document.createElement('div'); c.appendChild(d); }
      if (d.innerHTML !== ed.h) d.innerHTML = ed.h;
      c.classList.toggle('e', !ed.h); c.classList.add('xh-ed');
    });
    window.xhApply();
  }
  // 拉欄寬
  let rsz = null;
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest && e.target.closest('.xh-rs'); if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const head = h.closest('.xh-h'), g = head.closest('.xh-g'), c = +head.dataset.xhc;
    const fs = parseFloat(getComputedStyle(g).fontSize) || 13;
    rsz = { c, x: e.clientX, w0: head.offsetWidth / fs, fs };
    head.classList.add('rsz');
    try { h.setPointerCapture(e.pointerId); } catch (er) {}
  }, true);
  document.addEventListener('pointermove', e => {
    if (!rsz) return;
    const v = Math.max(2, Math.round((rsz.w0 + (e.clientX - rsz.x) / rsz.fs) * 10) / 10);
    XS.w[rsz.c] = { v, t: Date.now() }; window.xhApply();
  });
  const rszEnd = () => { if (!rsz) return; rsz = null; document.querySelectorAll('.xh-h.rsz').forEach(x => x.classList.remove('rsz')); xhSave(); };
  document.addEventListener('pointerup', rszEnd); document.addEventListener('pointercancel', rszEnd);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-xhwreset]'); if (!b) return;
    e.stopPropagation();
    const t = Date.now(); Object.keys(XS.w).forEach(k => { XS.w[k] = { v: XH.cols[k].w, t }; }); window.xhApply(); xhSave();
  }, true);
  // 長按格子 → 這一格變成可以編輯
  let lp = null, lpFired = false;
  document.addEventListener('pointerdown', e => {
    const c = e.target.closest && e.target.closest('.xh-c'); if (!c || c.classList.contains('editing')) return;
    lpFired = false; clearTimeout(lp && lp.t);
    lp = { c, x: e.clientX, y: e.clientY, t: setTimeout(() => { lpFired = true; xhEdit(c); }, 550) };
  });
  document.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) { clearTimeout(lp.t); lp = null; } });
  ['pointerup', 'pointercancel', 'scroll'].forEach(k => document.addEventListener(k, () => { if (lp) { clearTimeout(lp.t); lp = null; } }, true));
  document.addEventListener('click', e => { if (lpFired && e.target.closest && e.target.closest('.xh-c')) { e.preventDefault(); e.stopPropagation(); lpFired = false; } }, true);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.xh-c.editing')) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.xh-c:not(.editing)')) e.preventDefault(); });
  function xhEdit(c) {
    let d = c.firstElementChild; if (!d) { d = document.createElement('div'); c.appendChild(d); }
    c.classList.add('editing'); c.classList.remove('e');
    d.contentEditable = 'true'; d.focus();
    try { const r = document.createRange(); r.selectNodeContents(d); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (er) {}
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {}
    const done = () => {
      d.removeEventListener('blur', done);
      d.contentEditable = 'false'; c.classList.remove('editing');
      const h = d.innerHTML.replace(/<br>$/, '').trim();
      const i = +c.dataset.xi;
      if (!(XS.e[i] && XS.e[i].h === h)) { XS.e[i] = { h, t: Date.now() }; c.classList.add('xh-ed'); xhSave(); }
      c.classList.toggle('e', !h);
    };
    d.addEventListener('blur', done);
    d.addEventListener('keydown', ev => { if (ev.key === 'Escape') d.blur(); });
  }
  xhDecorate();

  /* ---------- 統計：報告單按「統計」→ 補幾個統計欄位（不含姓名）存成一筆；資料庫標題旁齒輪 → 總統計儀表板 ----------
   * 紀錄存在這台裝置（tcm-stats-v1），有設定 GitHub 同步時合併到 tcm-notes sync/stats.json */
  const STK = 'tcm-stats-v1', ST_URL = GH_URL.replace('myfx.json', 'stats.json');
  const ST = {
    region: ['台北', '新北', '桃竹苗', '中彰投', '雲嘉南', '高屏', '宜蘭', '花蓮', '台東', '離島'],
    sex: ['女', '男'],
    age: ['<18', '18–29', '30–44', '45–64', '65–74', '75–84', '85–99', '100+'],
    body: ['平和', '氣虛', '陽虛', '陰虛', '痰濕', '濕熱', '血瘀', '氣鬱', '特稟'],
    concern: ['睡眠', '疼痛', '腸胃', '情緒壓力', '疲勞', '體重', '皮膚', '婦科', '慢性病控制'],
    sport: ['規律運動', '偶爾運動', '很少運動'],
    diet: ['外食為主', '偏油炸', '偏甜', '偏辣', '素食', '飲食清淡'],
    habit: ['抽菸', '喝酒', '嚼檳榔'],
    chronic: ['高血壓', '高血糖', '高血脂', '癌症'],
  };
  const stLoad = () => { try { const a = JSON.parse(localStorage.getItem(STK) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const stStore = a => { try { localStorage.setItem(STK, JSON.stringify(a)); } catch (e) {} };
  let stLast = (() => { try { return JSON.parse(localStorage.getItem('tcm-stats-last') || '{}'); } catch (e) { return {}; } })();
  async function stSync() {
    const tok = ghToken(); if (!tok) return false;
    try {
      const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      const r = await fetch(ST_URL + '?t=' + Date.now(), { headers: H, cache: 'no-store' });
      let remote = [], sha;
      if (r.ok) { const j = await r.json(); sha = j.sha; try { remote = JSON.parse(b64d(j.content)); } catch (e) {} }
      const m = new Map(); [...remote, ...stLoad()].forEach(x => x && x.id && m.set(x.id, x));
      const all = [...m.values()].sort((a, b) => a.t - b.t);
      stStore(all);
      if (all.length !== remote.length)
        await fetch(ST_URL, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '同步統計紀錄', content: b64e(JSON.stringify(all)), ...(sha ? { sha } : {}) }) });
      return true;
    } catch (e) { return false; }
  }
  // 自己新增的選項（每一類「⊕ 其他（可新增）」打的字），記在這台裝置，下次直接出現
  const STO = 'tcm-stats-opts-v1';
  const stOpts = () => { try { return JSON.parse(localStorage.getItem(STO) || '{}') || {}; } catch (e) { return {}; } };
  const stAddOpt = (k, v) => { const o = stOpts(); o[k] = o[k] || []; if (!ST[k].includes(v) && !o[k].includes(v)) o[k].push(v); try { localStorage.setItem(STO, JSON.stringify(o)); } catch (e) {} };
  const NO_OTHER = { sex: 1, age: 1 };
  const chip = (v, on) => `<button type="button" class="${on ? 'on' : ''}" data-val="${E(v)}">${E(v)}</button>`;
  const chips = (k, multi, val) => `<div class="st-chips" data-k="${k}" data-multi="${multi ? 1 : ''}">${ST[k].concat(stOpts()[k] || []).map(v => chip(v, multi ? (val || []).includes(v) : val === v)).join('')}${NO_OTHER[k] ? '' : '<button type="button" class="st-other" data-other>⊕ 其他（可新增）</button><input type="text" class="st-oin" placeholder="輸入後按 Enter" hidden>'}</div>`;
  function statOpen() {
    if (!cur) return;
    const doc = docOf();
    let m = root.querySelector('.st-modal');
    if (m) m.remove();
    m = doc.createElement('div'); m.className = 'st-modal';
    const L = stLast, bgTxt = Object.entries(report.bg || {}).map(([k, v]) => ({ yy: ['陰', '陽'], xs: ['虛', '實'], hr: ['寒', '熱'], bl: ['表', '裡'] }[k] || ['', ''])[v < 0 ? 0 : 1]).join('');
    m.innerHTML = `<div class="st-card" role="dialog" aria-label="加入統計">
      <div class="st-hd"><b>加入統計</b><small>不含姓名・${E(cur.name)}${bgTxt ? '・' + E(bgTxt) : ''}</small><button type="button" data-st="x" aria-label="關閉">✕</button></div>
      <div class="st-bd">
        <section><h4>① 地區</h4>${chips('region', false, L.region || '')}</section>
        <section><h4>② 性別・年齡</h4>${chips('sex', false, '')}${chips('age', false, '')}</section>
        <section><h4>③ 體質<small>可複選</small></h4>${chips('body', true, [])}</section>
        <section><h4>④ 病人關注議題<small>可複選</small></h4>${chips('concern', true, [])}</section>
        <section><h4>⑤ 運動・飲食</h4>${chips('sport', false, '')}${chips('diet', true, [])}</section>
        <section><h4>⑥ 菸酒檳榔・三高・癌症</h4>${chips('habit', true, [])}${chips('chronic', true, [])}</section>
      </div>
      <div class="st-ft"><button type="button" data-st="x">取消</button><button type="button" data-st="save" class="pri">存入統計</button></div></div>`;
    root.appendChild(m);
  }
  root.addEventListener('click', e => {
    const m = e.target.closest('.st-modal'); if (!m) return;
    e.stopPropagation();
    const oth = e.target.closest('[data-other]');
    if (oth) { const inp = oth.nextElementSibling; oth.hidden = true; inp.hidden = false; inp.focus(); return; }
    const c = e.target.closest('.st-chips button');
    if (c) {
      const box = c.parentNode;
      if (box.dataset.multi) c.classList.toggle('on');
      else { const was = c.classList.contains('on'); box.querySelectorAll('button').forEach(x => x.classList.remove('on')); if (!was) c.classList.add('on'); }
      return;
    }
    const a = e.target.closest('[data-st]');
    if (e.target === m || (a && a.dataset.st === 'x')) { m.remove(); return; }
    if (a && a.dataset.st === 'save') {
      const get = k => [...m.querySelectorAll(`.st-chips[data-k="${k}"] button.on`)].map(x => x.dataset.val);
      const one = k => get(k)[0] || '';
      if (!one('region')) { m.querySelector('.st-chips[data-k="region"]').classList.add('need'); return; }
      const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), dz: cur.id, dzName: cur.name, sys: cur.sys || '',
        bg: report.bg || {}, fx: report.fx || '', region: one('region'), sex: one('sex'), age: one('age'),
        body: get('body'), concern: get('concern'), sport: one('sport'), diet: get('diet'), habit: get('habit'), chronic: get('chronic') };
      const all = stLoad(); all.push(rec); stStore(all);
      stLast = { region: rec.region }; try { localStorage.setItem('tcm-stats-last', JSON.stringify(stLast)); } catch (er) {}
      m.remove();
      const W = winOf(); (W.TCMLobby && W.TCMLobby.toast ? W.TCMLobby.toast : (t => { const b = root.querySelector('[data-bz="stat"]'); if (b) { b.textContent = '✓ 已加入'; setTimeout(() => { b.textContent = '統計'; }, 1600); } }))(`已加入統計（${rec.region}，共 ${all.length} 筆）`);
      stSync();
    }
  }, true);

  root.addEventListener('keydown', e => {
    const inp = e.target; if (!inp.classList || !inp.classList.contains('st-oin') || e.isComposing) return;
    const box = inp.parentNode, oth = box.querySelector('[data-other]');
    if (e.key === 'Escape') { inp.value = ''; inp.hidden = true; oth.hidden = false; return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = inp.value.trim(); inp.value = ''; inp.hidden = true; oth.hidden = false;
    if (!v) return;
    const k = box.dataset.k; stAddOpt(k, v);
    let b = [...box.querySelectorAll('button[data-val]')].find(x => x.dataset.val === v);
    if (!b) { oth.insertAdjacentHTML('beforebegin', chip(v, false)); b = oth.previousElementSibling; }
    if (!box.dataset.multi) box.querySelectorAll('button.on').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  root.addEventListener('focusout', e => {   // 打完沒按 Enter 就點別處：也算新增
    const inp = e.target; if (!inp.classList || !inp.classList.contains('st-oin') || !inp.value.trim()) return;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  // 齒輪 → 第二層選單 → 總統計
  function gearInit() {
    const name = document.querySelector('.top .name');
    if (!name || document.querySelector('.tcm-gear')) return;
    const g = document.createElement('span'); g.className = 'tcm-gear-w';
    g.innerHTML = `<button type="button" class="tcm-gear" aria-label="設定" aria-expanded="false"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
      <div class="tcm-gear-m" hidden><button type="button" data-gear="stats">📊 總統計</button></div>`;
    name.appendChild(g);
    const btn = g.querySelector('.tcm-gear'), menu = g.querySelector('.tcm-gear-m');
    btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', e => { if (!g.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', e => { const b = e.target.closest('[data-gear]'); if (!b) return; menu.hidden = true; if (b.dataset.gear === 'stats') dashOpen(); });
  }

  /* ---------- 總統計儀表板（中間大環＝病例數，六個小環＝六大類，點小環看細項；可切台北、花蓮或兩地對照） ---------- */
  const CATS = [
    { k: 'body', t: '體質', ico: '☯' },
    { k: 'dz', t: '常見疾病・年齡', ico: '⚕' },
    { k: 'concern', t: '關注議題', ico: '◎' },
    { k: 'life', t: '運動・飲食', ico: '♨' },
    { k: 'habit', t: '菸酒檳榔', ico: '⊘' },
    { k: 'chronic', t: '三高・癌症', ico: '♥' },
  ];
  const vals = (r, k) => k === 'dz' ? [r.dzName] : k === 'life' ? [r.sport, ...(r.diet || [])] : [].concat(r[k] || []);
  function tally(recs, k) {
    const m = new Map(); recs.forEach(r => vals(r, k).forEach(v => v && m.set(v, (m.get(v) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  let dash = null, dashReg = '全部', dashCat = 'body';
  function dashOpen() {
    if (!dash) {
      dash = document.createElement('div'); dash.className = 'tcm-dash';
      document.body.appendChild(dash);
      dash.addEventListener('click', e => {
        const x = e.target.closest('[data-dash]');
        if (x) { const k = x.dataset.dash; if (k === 'x') { dash.hidden = true; document.body.classList.remove('dash-on'); } else if (k.startsWith('r:')) { dashReg = k.slice(2); dashDraw(); } else if (k.startsWith('c:')) { dashCat = k.slice(2); dashDraw(); } }
      });
      dash.addEventListener('change', e => { if (e.target.matches('[data-dreg]')) { dashReg = e.target.value; dashDraw(); } });
    }
    dash.hidden = false; document.body.classList.add('dash-on');
    dashDraw(); stSync().then(ok => { if (ok && !dash.hidden) dashDraw(); });
  }
  const ring = (pct, r, w, cls) => { const C = 2 * Math.PI * r; return `<circle r="${r}" cx="50" cy="50" class="trk" stroke-width="${w}"/><circle r="${r}" cx="50" cy="50" class="${cls || 'val'}" stroke-width="${w}" stroke-dasharray="${(C * Math.max(0, Math.min(1, pct))).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>`; };
  function dashDraw() {
    const all = stLoad(), empty = !all.length;
    const cmp = dashReg === '台北⇄花蓮';
    const recs = cmp ? all.filter(r => r.region === '台北' || r.region === '花蓮') : dashReg === '全部' ? all : all.filter(r => r.region === dashReg);
    const n = recs.length, cnt = reg => all.filter(r => r.region === reg).length;
    const top = k => { const t = tally(recs, k)[0]; return t ? { v: t[0], p: t[1] / Math.max(1, n) } : { v: '—', p: 0 }; };
    const others = [...new Set(ST.region.concat(stOpts().region || [], all.map(r => r.region)))].filter(r => r && r !== '台北' && r !== '花蓮');
    const tabs = ['全部', '台北', '花蓮', '台北⇄花蓮'];
    const sat = CATS.map((c, i) => { const t = top(c.k); return `<button type="button" class="sat s${i}${dashCat === c.k ? ' on' : ''}" data-dash="c:${c.k}">
        <svg viewBox="0 0 100 100">${ring(t.p, 42, 5)}<circle r="34" cx="50" cy="50" class="in"/></svg>
        <span class="ico">${c.ico}</span><b>${E(c.t)}</b><small>${E(t.v)}${t.p ? ` ${Math.round(t.p * 100)}%` : ''}</small></button>`; }).join('');
    dash.innerHTML = `<div class="dh"><button type="button" class="dx" data-dash="x" aria-label="返回">‹ 返回</button><h2>總統計</h2>
        <div class="dtabs">${tabs.map(t => `<button type="button" class="${dashReg === t ? 'on' : ''}" data-dash="r:${t}">${t}${t === '台北' || t === '花蓮' ? `<small>${cnt(t)}</small>` : ''}</button>`).join('')}
        <select data-dreg aria-label="其他地區"><option value="">其他地區…</option>${others.map(r => `<option value="${r}"${dashReg === r ? ' selected' : ''}>${r}（${cnt(r)}）</option>`).join('')}</select></div></div>
      ${empty ? '<p class="ddemo">目前 0 筆。在報告單按「統計」把確定要統計的病例存進來，這裡才會開始累計。</p>' : ''}
      <div class="hub">
        <svg class="wires" viewBox="0 0 600 420" preserveAspectRatio="none" aria-hidden="true">${[[90, 70], [510, 70], [54, 210], [546, 210], [90, 350], [510, 350]].map(([x, y]) => `<path d="M300 210 L${x} ${y}"/>`).join('')}<circle cx="300" cy="210" r="150" class="dash"/></svg>
        <div class="core"><svg viewBox="0 0 100 100">${ring(1, 46, 1.2, 'thin')}${ring(Math.min(1, n / 200), 40, 4)}<circle r="33" cx="50" cy="50" class="in"/></svg>
          <div class="core-t"><small>${cmp ? '台北＋花蓮' : E(dashReg)}</small><b>${n}</b><span>筆病例</span></div></div>
        ${sat}
      </div>
      <div class="detail">${dashDetail(recs, all, cmp)}</div>`;
  }
  function bars(list, n, cls) {
    const max = Math.max(1, ...list.map(x => x[1]));
    return list.slice(0, 8).map(([v, c]) => `<div class="dbar ${cls || ''}"><span class="bl">${E(v)}</span><span class="bt"><i style="width:${(c / max * 100).toFixed(1)}%"></i></span><span class="bn">${Math.round(c / Math.max(1, n) * 100)}%</span></div>`).join('') || '<p class="dnone">還沒有資料</p>';
  }
  function dashDetail(recs, all, cmp) {
    const c = CATS.find(x => x.k === dashCat);
    const head = `<h3>${c.ico} ${E(c.t)}</h3>`;
    if (cmp) {
      const A = recs.filter(r => r.region === '台北'), B = recs.filter(r => r.region === '花蓮');
      return head + `<div class="cmp"><div><h4>台北<small>${A.length} 筆</small></h4>${bars(tally(A, dashCat), A.length, 'a')}</div><div><h4>花蓮<small>${B.length} 筆</small></h4>${bars(tally(B, dashCat), B.length, 'b')}</div></div>`;
    }
    if (dashCat === 'dz') {   // 疾病 × 年齡層：顏色越亮人數越多
      const dz = tally(recs, 'dz').slice(0, 8).map(x => x[0]);
      const grid = dz.map(d => ST.age.map(a => recs.filter(r => r.dzName === d && r.age === a).length));
      const mx = Math.max(1, ...grid.flat());
      return head + (dz.length ? `<div class="heat"><div class="hr hh"><span></span>${ST.age.map(a => `<span>${a}</span>`).join('')}</div>${dz.map((d, i) => `<div class="hr"><span class="hl">${E(d)}</span>${grid[i].map(v => `<span class="hc" style="--v:${(v / mx).toFixed(2)}">${v || ''}</span>`).join('')}</div>`).join('')}</div>` : '<p class="dnone">還沒有資料</p>');
    }
    return head + bars(tally(recs, dashCat), recs.length);
  }
  gearInit();

  window.TCMBZ = { open, close, mount, unmount, patterns: id => patterns(by[id]) };
})();

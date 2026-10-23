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
    uniqOut.forEach((p, i) => { p.i = i; p.ax = bagang(p); });
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
  const uniq = k => { const m = new Map(); pats.forEach(p => p[k].forEach(v => m.set(v, (m.get(v) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); };
  // 依已填的伴隨症狀、舌、脈、八綱，算每個證型符合幾項
  function score(p) {
    const r = report;
    let s = 0, n = 0;
    if (!r.bgAuto) AX.forEach(a => { const want = r.bg[a.k]; if (!want) return; n++; const got = side(axVal(p.ax, a.k)); if (got === want) s++; else if (got === -want) s--; });
    r.sx.forEach(v => { n++; if (p.sx.includes(v)) s++; });
    if (r.tongue) { n++; if (p.tongue.includes(r.tongue)) s++; }
    if (r.pulse) { n++; if (p.pulse.includes(r.pulse)) s++; }
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
  function allFormulaNames(first) {
    const set = new Set(first);
    pats.forEach(p => p.fx.forEach(f => set.add(f.name)));
    const local = [...set];
    const all = (DB.formulas || []).map(f => f.name).filter(n => !set.has(n)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return { local, all };
  }
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

  /* ---------- 兩層懸浮選單：第一層是「系」，滑過（或點）才出現第二層 ---------- */
  const CAS = {};
  function cascade(key, label, groups, openGroup, val, direct) {
    CAS[key] = groups;
    const gi = Math.max(0, groups.findIndex(g => g.items.some(x => x.v === val)));
    return `<div class="bz-cas" data-cas="${key}">
      <button type="button" class="bz-cas-btn" aria-haspopup="true" aria-expanded="false"><span>${E(label)}</span></button>
      <div class="bz-cas-pop" role="menu">
        <ul class="bz-l1">${groups.map((g, i) => `${g.sec && (!i || groups[i - 1].sec !== g.sec) ? `<li class="bz-sec ${g.cls}">${E(g.sec)}<small>${groups.filter(x => x.sec === g.sec).length} 類</small></li>` : ''}<li${g.cls ? ` class="${g.cls}"` : ''}><button type="button" data-g="${i}" class="${i === gi && val ? 'cur' : ''}">${E(g.name)}<small>${g.items.length}</small><i>›</i></button></li>`).join('')}
          ${(direct || []).map(d => `<li><button type="button" class="bz-dir" data-pick="${E(d.v)}">${E(d.t)}</button></li>`).join('')}</ul>
        <div class="bz-l2" hidden></div>
      </div></div>`;
  }
  function showL2(cas, gi) {
    const key = cas.dataset.cas, g = CAS[key] && CAS[key][gi];
    if (!g) return;
    const l2 = cas.querySelector('.bz-l2');
    cas.querySelectorAll('.bz-l1 [data-g]').forEach(b => b.classList.toggle('on', +b.dataset.g === gi));
    l2.innerHTML = `<button type="button" class="bz-l2-back" data-l2back>‹ ${E(g.name)}</button>` +
      g.items.map(x => `<button type="button" data-pick="${E(x.v)}" class="${x.v === (key === 'cc' ? cur.id : report.fx) ? 'cur' : ''}">${E(x.t)}</button>`).join('');
    l2.hidden = false;
    cas.classList.add('l2on');
  }
  function closeCas(except) {
    root.querySelectorAll('.bz-cas.open').forEach(c => { if (c !== except) { c.classList.remove('open', 'l2on'); c.querySelector('.bz-cas-btn').setAttribute('aria-expanded', 'false'); c.querySelector('.bz-l2').hidden = true; } });
  }
  let FX_BY_SYS = null;
  function fxGroups(local, curPat) {   // 處方：先列這個證型／本病，再依各系病證裡用到的方分組
    if (!FX_BY_SYS) {
      FX_BY_SYS = {};
      zzDiseases.filter(d => !d.dup && !/青光眼/.test(d.name)).forEach(d => {
        const set = (FX_BY_SYS[d.sys] = FX_BY_SYS[d.sys] || new Set());
        patterns(d).forEach(p => p.fx.forEach(f => set.add(f.name)));
      });
    }
    const groups = [];
    if (local.length) groups.push({ name: curPat ? '這個證型・本病常用' : '本病常用', items: local.map(n => ({ v: n, t: n })) });
    const used = new Set();
    Object.entries(FX_BY_SYS).forEach(([sy, set]) => { if (!set.size) return; const ns = [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant')); ns.forEach(n => used.add(n)); groups.push({ name: sy, items: ns.map(n => ({ v: n, t: n })) }); });
    const rest = (DB.formulas || []).map(f => f.name).filter(n => !used.has(n)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    if (rest.length) groups.push({ name: '其他方劑', items: rest.map(n => ({ v: n, t: n })) });
    return groups;
  }
  function pickCas(key, v) {
    const r = report;
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
    const { local } = allFormulaNames(curPat ? curPat.fx.map(f => f.name) : []);
    const fxTyped = r.fx === OTHER;
    const SX = uniq('sx').filter(v => !r.sx.includes(v));
    const HG = herbGroups();

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
          <div class="bz-fld"><span class="bz-lb">主訴</span>${cascade('cc', o.name, Object.entries(sysGroups).map(([sy, ds]) => ({ name: sy, items: ds.map(d => ({ v: d.id, t: d.name })) })), o.sys, o.id)}</div>
          <div class="bz-fld"><span class="bz-lb">伴隨症狀</span>
            <select data-f="sx">${opt('', r.sx.length ? '再加一項…' : '可選多項', true)}${SX.map(v => opt(v, v)).join('')}${opt(OTHER, '⊕ 其他（自訂）')}</select>
            ${r._t_sx ? `<input type="text" data-add="sx" placeholder="輸入症狀後按 Enter">` : ''}
            ${r.sx.length ? `<div class="bz-tags">${r.sx.map((v, i) => `<span class="bz-tag s">${E(v)}<button type="button" data-del="sx" data-i="${i}" aria-label="移除">×</button></span>`).join('')}</div>` : ''}</div>
          <label>舌象${pickOrType('tongue', uniq('tongue'), r.tongue, '舌象')}</label>
          <label>脈象${pickOrType('pulse', uniq('pulse'), r.pulse, '脈象')}</label>
          <div class="bz-fld"><span class="bz-lb">證型</span>
            <div class="bz-bgs">${AX.filter(a => a.k === 'yy' || a.k === 'xs').map(a => `<span class="bz-bg2" data-ax="${a.k}">${[-1, 1].map(w => `<button type="button" data-w="${w}" class="${r.bg[a.k] === w ? 'on' : ''}">${w < 0 ? (a.k === 'bl' ? '表' : a.a) : (a.k === 'bl' ? '裡' : a.b)}</button>`).join('')}</span>`).join('')}</div>
</div>
          <div class="bz-fld"><span class="bz-lb">處方</span>
            ${cascade('fx', fxTyped ? '⊕ 自定義處方' : (r.fx || '請選擇'), fxGroups(local, curPat), fxTyped ? '' : null, r.fx, [{ v: OTHER, t: '⊕ 自定義處方' }])}
            ${fxTyped ? `<input type="text" data-v="fxOther" value="${E(r.fxOther)}" placeholder="輸入處方名稱">` : ''}</div>
          <div class="bz-fld wide"><span class="bz-lb">藥物${r.fx && !fxTyped ? `<small>${E(r.fx)} 的組成</small>` : ''}</span>
            <div class="bz-box">${r.herbs.length ? r.herbs.map((h, i) => herbTag(h, i, 'herbs')).join('') : `<i class="bz-tbd">${r.fx && !fxTyped ? '這個方的組成待補，可以自己加' : '選處方後會列出組成'}</i>`}</div>
            <div class="bz-addrow">${HG.length ? cascade('herb', '加一味藥…', HG, null, null, [{ v: OTHER, t: '⊕ 其他（自訂）' }])
              : `<select data-f="herb">${opt('', '加一味藥…', true)}${allHerbNames().map(n => opt(n, n)).join('')}${opt(OTHER, '⊕ 其他（自訂）')}</select>`}
              ${r._t_herb ? `<input type="text" data-add="herb" placeholder="輸入藥名後按 Enter">` : ''}</div></div>
          <div class="bz-fld wide"><span class="bz-lb">藥物加減</span>
            ${r.adj.map((v, i) => `<div class="bz-adj"><input type="text" data-adj="${i}" value="${E(v)}" placeholder="例如：痛甚加延胡索、川楝子"><button type="button" data-del="adj" data-i="${i}" aria-label="刪除這一列">×</button></div>`).join('')}
            <button type="button" class="bz-plus" data-bz="adj">⊕ 加一列</button>
            ${curPat && curPat.jj ? `<p class="bz-hint">書上的加減：${E(curPat.jj)}</p>` : ''}</div>
        </div>
        <label class="bz-note">醫囑 / 備註<textarea data-v="note" rows="3" placeholder="輸入">${E(r.note)}</textarea></label>
        <div class="bz-acts"><button type="button" data-bz="print">列印</button><button type="button" data-bz="clear">清空</button></div>
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
      const pk = t.closest('[data-pick]');
      if (pk) { const key = cas.dataset.cas; closeCas(); pickCas(key, pk.dataset.pick); return; }
      const gb = t.closest('[data-g]');
      if (gb) { showL2(cas, +gb.dataset.g); return; }
      if (t.closest('[data-l2back]')) { cas.classList.remove('l2on'); cas.querySelector('.bz-l2').hidden = true; return; }
      if (t.closest('.bz-cas-btn')) { if (cas.classList.contains('open') && Date.now() - (+cas.dataset.hov || 0) < 800) return;   // 滑鼠碰到時已經展開：這一下不要又把它關掉
        const on = !cas.classList.contains('open'); closeCas(cas); cas.classList.toggle('open', on); t.closest('.bz-cas-btn').setAttribute('aria-expanded', String(on)); return; }
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
    }
  });
  const narrow = () => host ? root.clientWidth <= 400 : window.innerWidth <= 700;
  // 滑鼠：碰到就展開，滑過第一層就出現第二層
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const cas = e.target.closest('.bz-cas');
    if (!cas) return;
    if (!cas.classList.contains('open')) { closeCas(cas); cas.classList.add('open'); cas.dataset.hov = Date.now(); cas.querySelector('.bz-cas-btn').setAttribute('aria-expanded', 'true'); }
    const gb = e.target.closest('[data-g]');
    if (gb && !gb.classList.contains('on') && !narrow()) showL2(cas, +gb.dataset.g);   // 窄的時候第二層會蓋掉第一層，要點才換
  });
  root.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const cas = e.target.closest('.bz-cas');
    if (cas && !cas.contains(e.relatedTarget)) closeCas();
  });
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

  window.TCMBZ = { open, close, mount, unmount, patterns: id => patterns(by[id]) };
})();

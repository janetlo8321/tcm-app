/* =========================================================
 * 八綱辨證（模擬看診的辨證思路）
 *   主訴（病證）→ 八綱（陰陽、表裡、寒熱、虛實）→ 舌象 → 脈象 → 症狀
 *   → 依符合程度排出證型卡（舌、脈、症、病機、治法、方、組成）
 *   → 辨證結果報告單：欄位可用資料庫內容下拉選，處方可選「其他」自訂，並列出組成
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

  let cur = null, pats = [], pick = { bg: {}, tongue: new Set(), pulse: new Set(), sx: new Set() }, chosen = null, more = {};

  function open(id) {
    const o = typeof by !== 'undefined' && by[id];
    if (!o || o.kind !== 'zd') return false;
    cur = o; pats = patterns(o);
    pick = { bg: {}, tongue: new Set(), pulse: new Set(), sx: new Set() };
    chosen = null; more = {};
    report = blankReport();
    root.hidden = false;
    document.documentElement.classList.add('bz-open');
    draw();
    root.scrollTop = 0;
    return true;
  }
  function close() {
    root.hidden = true;
    document.documentElement.classList.remove('bz-open');
  }

  function score(p) {   // 符合的條件數；八綱相反的扣分
    let s = 0, n = 0;
    AX.forEach(a => { const want = pick.bg[a.k]; if (!want) return; n++; const got = side(axVal(p.ax, a.k)); if (got === want) s++; else if (got === -want) s -= 1; });
    ['tongue', 'pulse', 'sx'].forEach(k => pick[k].forEach(v => { n++; if (p[k].includes(v)) s++; }));
    return { s, n };
  }
  const uniq = k => { const m = new Map(); pats.forEach(p => p[k].forEach(v => m.set(v, (m.get(v) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); };

  const LIM = { tongue: 14, pulse: 14, sx: 18 };
  function chips(k, all, cls) {
    const list = more[k] ? all : all.slice(0, LIM[k]);
    pick[k].forEach(v => { if (!list.includes(v)) list.push(v); });
    const btn = all.length > LIM[k] ? `<button type="button" class="bz-chip more" data-more="${k}">${more[k] ? '收起' : `更多 ${all.length - LIM[k]} 項`}</button>` : '';
    return list.map(v => `<button type="button" class="bz-chip ${cls}${pick[k].has(v) ? ' on' : ''}" data-pk="${k}" data-v="${E(v)}">${E(v)}</button>`).join('') + btn;
  }
  function herbChips(fx) {
    if (!fx.comp) return '<i class="bz-tbd">組成待補</i>';
    return fx.comp.hs.map(h => h.id ? `<a class="bz-herb" href="#${h.id}" data-bzgo="${h.id}">${E(h.n)}</a>` : `<span class="bz-herb">${E(h.n)}</span>`).join('') + (fx.comp.etc ? '<span class="bz-herb more">…</span>' : '');
  }
  function bars(ax, small) {
    return `<div class="bz-bars${small ? ' sm' : ''}">${AX.map(a => { const v = axVal(ax, a.k);
      return `<div class="bz-bar"><span class="l">${a.k === 'bl' ? '表' : a.a}</span><span class="t"><i style="left:${(50 + v * 44).toFixed(1)}%"></i></span><span class="r">${a.k === 'bl' ? '裡' : a.b}</span></div>`; }).join('')}</div>`;
  }
  function card(p, sc, rank) {
    const tags = ['bl', 'hr', 'xs'].map(k => axTag(p.ax, AX.find(a => a.k === k))).join('・') + '　→ ' + (side(p.ax.yy) < 0 ? '陰證' : side(p.ax.yy) > 0 ? '陽證' : '陰陽兩可');
    const hit = (k, v) => pick[k].has(v) ? ' hit' : '';
    return `<article class="bz-card${chosen === p.i ? ' chosen' : ''}${sc && sc.n && sc.s <= 0 ? ' dim' : ''}" data-pi="${p.i}">
      <header><h3>${E(p.name)}</h3>${sc && sc.n ? `<span class="bz-score">${Math.max(0, sc.s)}/${sc.n} 符合</span>` : ''}<small>${SRC[p.src] || ''}</small></header>
      <p class="bz-tags">${E(tags)}</p>
      ${p.tongue.length ? `<div class="bz-row"><b class="bz-k t">舌</b><div>${p.tongue.map(v => `<span class="bz-mini t${hit('tongue', v)}">${E(v)}</span>`).join('')}</div></div>` : ''}
      ${p.pulse.length ? `<div class="bz-row"><b class="bz-k p">脈</b><div>${p.pulse.map(v => `<span class="bz-mini p${hit('pulse', v)}">${E(v)}</span>`).join('')}</div></div>` : ''}
      ${p.sx.length ? `<div class="bz-row"><b class="bz-k s">症</b><div>${p.sx.map(v => `<span class="bz-mini s${hit('sx', v)}">${E(v)}</span>`).join('')}</div></div>` : ''}
      ${p.bj ? `<div class="bz-row"><b class="bz-k">機</b><div class="bz-txt">${E(p.bj)}</div></div>` : ''}
      ${p.zf ? `<div class="bz-row"><b class="bz-k z">法</b><div class="bz-txt"><strong>${E(p.zf)}</strong></div></div>` : ''}
      <div class="bz-fx">${p.fx.length ? p.fx.map(f => `<div class="bz-fx1"><b class="bz-fname">${E(f.raw)}</b><div class="bz-herbs">${herbChips(f)}</div></div>`).join('') : `<div class="bz-fx1"><b class="bz-fname">${E(p.fxText || '（未列方）')}</b></div>`}
        ${p.jj ? `<p class="bz-jj">加減：${E(p.jj)}</p>` : ''}</div>
      <button type="button" class="bz-use" data-use="${p.i}">${chosen === p.i ? '✓ 已填入報告單' : '選這個證型，填入報告單'}</button>
    </article>`;
  }

  function draw() {
    const o = cur;
    const scored = pats.map(p => ({ p, sc: score(p) }));
    const any = scored.some(x => x.sc.n);
    if (any) scored.sort((a, b) => (b.sc.s - a.sc.s) || (a.p.i - b.p.i));
    const T = uniq('tongue'), P = uniq('pulse'), S = uniq('sx');
    const step = (n, t, sub, body) => `<section class="bz-step"><h2><span class="bz-n">${n}</span>${t}${sub ? `<small>${sub}</small>` : ''}</h2>${body}</section>`;
    root.innerHTML = `
      <div class="bz-top">
        <button type="button" class="bz-back" data-bz="close" aria-label="返回">‹ 返回</button>
        <div class="bz-title"><small>八綱辨證・${E(o.sys)}</small><b>${E(o.name)}</b></div>
        <button type="button" class="bz-tbl" data-bzgo="${o.id}">原表格</button>
      </div>
      <div class="bz-body">
      ${pats.length ? `<div class="bz-main"><div class="bz-ask">
        ${step(1, '八綱', '先分大方向，不確定就留空', `<div class="bz-bg">${AX.map(a => `<div class="bz-seg" data-ax="${a.k}">
            <button type="button" data-w="-1" class="${pick.bg[a.k] === -1 ? 'on' : ''}">${a.k === 'bl' ? '表' : a.a}</button>
            <button type="button" data-w="0" class="${!pick.bg[a.k] ? 'on' : ''}">？</button>
            <button type="button" data-w="1" class="${pick.bg[a.k] === 1 ? 'on' : ''}">${a.k === 'bl' ? '裡' : a.b}</button></div>`).join('')}</div>`)}
        ${T.length ? step(2, '舌象', '看到的舌、苔', `<div class="bz-chips">${chips('tongue', T, 't')}</div>`) : ''}
        ${P.length ? step(3, '脈象', '摸到的脈', `<div class="bz-chips">${chips('pulse', P, 'p')}</div>`) : ''}
        ${S.length ? step(4, '症狀', '問診所得', `<div class="bz-chips">${chips('sx', S, 's')}</div>`) : ''}
        </div><div class="bz-res">
        ${step(5, '證型', any ? `依符合程度排序・共 ${pats.length} 個` : `共 ${pats.length} 個・點上面的條件來縮小範圍`,
          (any ? '<button type="button" class="bz-reset" data-bz="reset">清除條件</button>' : '') + `<div class="bz-cards">${scored.map((x, k) => card(x.p, x.sc, k)).join('')}</div>`)}
      </div></div>` : `<p class="bz-none">這個病證沒有可拆成證型的表格（例如只有針灸圖或段落）。可以先看<a href="#${o.id}" data-bzgo="${o.id}">原表格／內文</a>，報告單仍可手動填寫。</p>`}
        ${step(pats.length ? 6 : 1, '辨證結果報告單', '每一欄都可以點選或輸入', reportHtml())}
      </div>`;
  }

  /* ---------- 報告單 ---------- */
  let report = null;
  const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
  function blankReport() { return { name: '', tongue: '', pulse: '', pat: '', fx: '', fxOther: '', fxOtherComp: '', note: '', ax: { yy: 0, xs: 0, hr: 0, bl: 0 } }; }
  const OTHER = '__other__';
  function opt(v, label, sel) { return `<option value="${E(v)}"${sel ? ' selected' : ''}>${E(label)}</option>`; }
  function selectWithOther(key, list, val, ph) {
    const has = !val || list.includes(val);
    return `<select data-rp="${key}">${opt('', ph || '請選擇', !val)}${list.map(v => opt(v, v, v === val)).join('')}${opt(OTHER, '其他（自訂）', !has)}</select>
      ${!has ? `<input type="text" data-rpo="${key}" value="${E(val)}" placeholder="輸入${ph || ''}">` : ''}`;
  }
  function allFormulaNames() {
    const set = new Set();
    pats.forEach(p => p.fx.forEach(f => set.add(f.name)));
    const local = [...set];
    const all = (DB.formulas || []).map(f => f.name).filter(n => !set.has(n)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return { local, all };
  }
  function fxComp(name) {
    if (!name) return null;
    for (const p of pats) for (const f of p.fx) if (f.name === name) return f.comp;
    return compOf(name);
  }
  function reportHtml() {
    const r = report, o = cur;
    const sysGroups = {};
    zzDiseases.filter(d => !d.dup && !/青光眼/.test(d.name)).forEach(d => (sysGroups[d.sys] = sysGroups[d.sys] || []).push(d));
    const T = uniq('tongue'), P = uniq('pulse');
    const { local, all } = allFormulaNames();
    const fxIsOther = r.fx === OTHER;
    const comp = fxIsOther ? null : fxComp(r.fx);
    return `<div class="bz-rep" id="bzRep">
      <div class="bz-rh"><b>辨證結果報告單</b><span>${today()}</span></div>
      <div class="bz-rcols"><div class="bz-rl">
      <div class="bz-grid">
        <label>姓名<input type="text" data-rp="name" value="${E(r.name)}" placeholder="輸入" autocomplete="off"></label>
        <label>主訴<select data-rp="cc">${Object.entries(sysGroups).map(([s, ds]) => `<optgroup label="${E(s)}">${ds.map(d => opt(d.id, d.name, d.id === o.id)).join('')}</optgroup>`).join('')}</select></label>
        <label>舌象${selectWithOther('tongue', T, r.tongue, '舌象')}</label>
        <label>脈象${selectWithOther('pulse', P, r.pulse, '脈象')}</label>
        <label>證型${selectWithOther('pat', pats.map(p => p.name).filter((v, i, a) => a.indexOf(v) === i), r.pat, '證型')}</label>
        <label>處方<select data-rp="fx">${opt('', '請選擇', !r.fx)}
            ${local.length ? `<optgroup label="本病常用">${local.map(n => opt(n, n, n === r.fx)).join('')}</optgroup>` : ''}
            ${all.length ? `<optgroup label="其他方劑">${all.map(n => opt(n, n, n === r.fx)).join('')}</optgroup>` : ''}
            ${opt(OTHER, '其他（自訂）', fxIsOther)}</select>
          ${fxIsOther ? `<input type="text" data-rpx="fxOther" value="${E(r.fxOther)}" placeholder="自訂處方名">` : ''}</label>
      </div>
      ${r.fx ? `<div class="bz-comp"><b>${E(fxIsOther ? (r.fxOther || '自訂處方') : r.fx)}・組成</b>
        ${fxIsOther ? `<textarea data-rpx="fxOtherComp" rows="2" placeholder="輸入藥物，例如：黃耆 15g、桂枝 9g…">${E(r.fxOtherComp)}</textarea>`
          : comp ? `<div class="bz-herbs">${comp.hs.map(h => h.id ? `<a class="bz-herb" href="#${h.id}" data-bzgo="${h.id}">${E(h.n)}</a>` : `<span class="bz-herb">${E(h.n)}</span>`).join('')}${comp.etc ? '<span class="bz-herb more">…</span>' : ''}</div>` : '<i class="bz-tbd">組成待補</i>'}</div>` : ''}
      </div><div class="bz-rr">
      <div class="bz-meter">${AX.map(a => { const v = r.ax[a.k];
        return `<div class="bz-m" data-ax="${a.k}"><span class="bz-ml">${a.k === 'bl' ? '表 / 裡' : a.a + ' / ' + a.b}</span>
          <div class="bz-mt" role="slider" tabindex="0" aria-label="${a.a}${a.b}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"><i style="left:${(50 + v * 46).toFixed(1)}%"></i></div>
          <span class="bz-me l">${a.k === 'bl' ? '表' : a.a}</span><span class="bz-me r">${a.k === 'bl' ? '裡' : a.b}</span></div>`; }).join('')}</div>
      <label class="bz-note">醫囑 / 備註<textarea data-rp="note" rows="3" placeholder="輸入">${E(r.note)}</textarea></label>
      </div></div>
      <div class="bz-acts"><button type="button" data-bz="print">列印</button><button type="button" data-bz="clear">清空報告單</button></div>
    </div>`;
  }
  function usePattern(i) {
    const p = pats[i];
    if (!p) return;
    chosen = i;
    report.pat = p.name;
    report.tongue = p.tongue.find(v => pick.tongue.has(v)) || p.tongue[0] || '';
    report.pulse = p.pulse.find(v => pick.pulse.has(v)) || p.pulse[0] || '';
    report.fx = p.fx[0] ? p.fx[0].name : '';
    report.ax = { ...p.ax, bl: -p.ax.bl };
    draw();
    const rep = root.querySelector('#bzRep');
    if (rep) rep.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function redrawReport() {
    const old = root.querySelector('#bzRep');
    if (!old) return;
    const y = root.scrollTop;
    old.outerHTML = reportHtml();
    root.scrollTop = y;
  }

  /* ---------- 操作 ---------- */
  root.addEventListener('click', e => {
    const t = e.target;
    const g = t.closest('[data-bzgo]');
    if (g) { e.preventDefault(); close(); go(g.dataset.bzgo); return; }
    const b = t.closest('[data-bz]');
    if (b) {
      const k = b.dataset.bz;
      if (k === 'close') close();
      else if (k === 'reset') { pick = { bg: {}, tongue: new Set(), pulse: new Set(), sx: new Set() }; keep(draw); }
      else if (k === 'print') window.print();
      else if (k === 'clear') { report = blankReport(); chosen = null; keep(draw); }
      return;
    }
    const seg = t.closest('.bz-seg button');
    if (seg) { const ax = seg.parentNode.dataset.ax, w = +seg.dataset.w; if (w) pick.bg[ax] = w; else delete pick.bg[ax]; keep(draw); return; }
    const m = t.closest('[data-more]');
    if (m) { more[m.dataset.more] = !more[m.dataset.more]; keep(draw); return; }
    const c = t.closest('[data-pk]');
    if (c) { const s = pick[c.dataset.pk], v = c.dataset.v; s.has(v) ? s.delete(v) : s.add(v); keep(draw); return; }
    const u = t.closest('[data-use]');
    if (u) { usePattern(+u.dataset.use); return; }
  });
  function keep(fn) { const y = root.scrollTop; fn(); root.scrollTop = y; }
  root.addEventListener('change', e => {
    const t = e.target, k = t.dataset.rp;
    if (k === 'cc') { open(t.value); return; }
    if (k === 'fx') { report.fx = t.value; redrawReport(); return; }
    if (k && t.tagName === 'SELECT') {
      report[k] = t.value === OTHER ? ' ' : t.value;
      if (k === 'pat') { const p = pats.find(x => x.name === t.value); if (p) { usePattern(p.i); return; } }
      redrawReport();
      if (t.value === OTHER) { const inp = root.querySelector(`[data-rpo="${k}"]`); if (inp) { inp.value = ''; inp.focus(); } }
    }
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.rp && t.tagName !== 'SELECT') report[t.dataset.rp] = t.value;
    if (t.dataset.rpo) report[t.dataset.rpo] = t.value || ' ';
    if (t.dataset.rpx) report[t.dataset.rpx] = t.value;
  });
  // 八綱刻度：拖曳或用方向鍵調整
  let drag = null;
  function setAx(el, x) {
    const r = el.getBoundingClientRect(), k = el.closest('[data-ax]').dataset.ax;
    const v = Math.max(-1, Math.min(1, ((x - r.left) / r.width - 0.5) / 0.46));
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) close(); });

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

  window.TCMBZ = { open, close, patterns: id => patterns(by[id]) };
})();

/* =========================================================
 * 經絡資訊介面（點兩下經絡）
 *   銅人 0.5 秒阻尼拉近成這條經的特寫（電腦：人在左；手機：人在上）
 *   右側（手機在下方）Liquid Glass 毛玻璃欄，內容由上而下每 0.3 秒依序出現
 *   內容：標題旁穴數與流注時辰、五輸與特定穴表、講義的循行／病候／經筋／絡脈／經別／歌訣
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { stage, camera, controls, byId, points: PT } = L;
  let openId = null;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 經絡循行時辰（子午流注）
  const TIME = {
    LU: '03:00~05:00',
    LI: '05:00~07:00',
    ST: '07:00~09:00',
    SP: '09:00~11:00',
    HT: '11:00~13:00',
    SI: '13:00~15:00',
    BL: '15:00~17:00',
    KI: '17:00~19:00',
    PC: '19:00~21:00',
    SJ: '21:00~23:00',
    GB: '23:00~01:00',
    LR: '01:00~03:00'
  };
  const ALIAS = { REN: '陰脈之海', DU: '陽脈之海' };
  // 十二經的經文與歌訣：model/jing.json（整理自使用者提供的《十二正經》講義：循行、病候、經筋、絡脈、經別、穴歌、五輸穴歌、原絡穴）
  let JING = {};
  fetch('model/jing.json').then(r => r.json()).then(d => { JING = d; if (openId && !partFrom) body.innerHTML = content(byId[openId]); }).catch(() => {});
  const EXTRA = {};   // 之後再匯入的內容：{ LU: [{ h: '主治', list: [...] } 或 { h, p: '段落' }] }
  const YIN = ['井木', '滎火', '輸土', '經金', '合水'], YANG = ['井金', '滎水', '輸木', '經火', '合土'];

  /* ---------- 五輸穴・天干表（使用者的手稿表格；紅、藍、綠、灰字照原表） ----------
   * 'r' 紅、'b' 藍、'g' 綠、'k' 灰；目前這條經的那一欄底部亮白 */
  const WX = [
    { h: '手', yin: { jing: ['太陰', '厥陰', '少陰'], org: ['肺', '心包', '心'], el: ['金', '火', '火'], ids: ['LU', 'PC', 'HT'], lab: '(陰井木)', strong: 2 },
      yang: { jing: ['陽明', '少陽', '太陽'], org: ['大腸', '三焦', '小腸'], el: ['金', '火', '火'], ids: ['LI', 'SJ', 'SI'], lab: '陽井金' },
      rows: [
        ['乙木', '井', ['少商', '中衝', '少衝'], '庚金', ['商陽|r', '關衝', '少澤']],
        ['丁火', '滎', ['魚際', '勞宮|r', '少府|r'], '壬水', ['二間', '液門', '前谷']],
        ['己土', '輸', ['太淵', '大陵', '神門'], '甲木', ['三間', '中渚', '後溪']],
        ['土', '原', ['', '', ''], '火', ['合谷', '陽池', '腕骨']],
        ['辛金', '經', ['經渠|r', '間使', '靈道'], '丙火', ['陽溪', '支溝|r', '陽谷|r']],
        ['癸水', '合', ['尺澤', '曲澤', '少海'], '戊土', ['曲池', '天井', '小海']],
        ['', '絡', ['列缺|k', '', '通里|k'], '', ['偏歷|k', '', '支正|k']]
      ] },
    { h: '足', yin: { jing: ['太陰', '厥陰', '少陰'], org: ['脾', '肝|b', '腎'], el: ['土', '木', '水'], ids: ['SP', 'LR', 'KI'], lab: '', strong: 2 },
      yang: { jing: ['陽明', '少陽', '太陽'], org: ['胃|g', '膽', '膀胱'], el: ['土', '木', '水'], ids: ['ST', 'GB', 'BL'], lab: '' },
      rows: [
        ['乙木', '井', ['隱白', '大敦|r', '湧泉'], '庚金', ['厲兌', '竅陰', '至陰']],
        ['丁火', '滎', ['大都', '行間', '然谷'], '壬水', ['內庭', '俠溪', '通谷|r']],
        ['己土', '輸', ['太白|r', '太衝|b', '太溪'], '甲木', ['陷谷', '臨泣|r', '束骨']],
        ['土', '原', ['', '', ''], '火', ['衝陽|g', '丘墟', '京骨']],
        ['辛金', '經', ['商丘', '中封', '復溜'], '丙火', ['解溪', '陽輔', '崑崙']],
        ['癸水', '合', ['陰陵', '曲泉', '陰谷|r'], '戊土', ['三里|r', '陽陵', '委中']],
        ['', '絡', ['公孫|g', '蠡溝|k', '大鐘|k'], '', ['豐隆|k', '光明*|b', '飛揚|k']]
      ] }
  ];
  const HEHUA = [   // 五門十變合化（善治四肢病）
    ['木', '甲', '膽', '乙', '肝', '膽脾合化土', '脾胃症狀'],
    ['火', '丙', '小', '丁', '心', '肝大合化金', '肺大症狀'],
    ['土|g', '戊', '胃', '己', '脾', '小肺合化水', '膀腎症狀'],
    ['金|g', '庚', '大', '辛', '肺', '心膀合化木', '肝膽症狀'],
    ['水|g', '壬', '膀', '癸', '腎', '胃腎合化火', '小心症狀']
  ];
  const tx = v => { const [t, c] = String(v).split('|'); return c ? `<span class="wx-${c}">${E(t)}</span>` : E(t); };
  function wuxing(curId) {
    const tbl = g => {
      const ci = { yin: g.yin.ids.indexOf(curId), yang: g.yang.ids.indexOf(curId) };
      const td = (side, i, v, cls) => `<td class="${[cls, ci[side] === i ? 'cur' : '', side === 'yin' && i === g.yin.strong ? 'st' : ''].filter(Boolean).join(' ')}">${tx(v)}</td>`;
      const cols = (side, arr, cls) => arr.map((v, i) => td(side, i, v, cls)).join('');
      return `<table class="wx-tb"><thead>
        <tr><th colspan="11" class="wx-big">${g.h}</th></tr>
        <tr><th colspan="2"></th><th colspan="3">陰</th><th></th><th colspan="3">陽</th><th colspan="2"></th></tr>
        <tr><th colspan="2"></th>${cols('yin', g.yin.jing, 'h')}<th></th>${cols('yang', g.yang.jing, 'h')}<th colspan="2"></th></tr>
        <tr class="wx-org"><th colspan="2"></th>${cols('yin', g.yin.org, 'h')}<th></th>${cols('yang', g.yang.org, 'h')}<th colspan="2"></th></tr>
        <tr><th colspan="2">${g.yin.lab}</th>${cols('yin', g.yin.el, 'h')}<th></th>${cols('yang', g.yang.el, 'h')}<th colspan="2">${g.yang.lab}</th></tr></thead><tbody>
        ${g.rows.map(r => `<tr><td class="k">${r[0]}</td><td class="k">${r[1]}</td>${cols('yin', r[2])}<td class="k">${r[3]}</td>${cols('yang', r[4])}<td class="k">${r[1]}</td><td class="k">${r[3]}</td></tr>`).join('')}
        </tbody></table>`;
    };
    return `<p class="wx-top"><span class="wx-hl">先本經</span>(原穴→單一五行穴性)－遇瓶頸找<span class="wx-hl">同名經</span>－遇瓶頸再找<span class="wx-hl">上下接經＋合化</span><small>(x 表裡經會是相同狀況)</small></p>
      <p class="wx-top">肝'肺大胃脾心小腸　膀腎心包三焦　膽肝　<span class="wx-r">膽證_肺</span></p>
      ${tbl(WX[0])}
      ${tbl(WX[1])}
      <table class="wx-tb wx-hh"><colgroup><col><col><col><col><col><col class="l"></colgroup><thead><tr><th colspan="6">五門十變合化（善治四肢病）</th></tr><tr><th></th><th>＋</th><th>－</th><th colspan="2"></th><th>辨證合化症狀</th></tr></thead><tbody>
        ${HEHUA.map(r => `<tr><td>${tx(r[0])}</td><td>${r[1]}<small>${r[2]}</small></td><td>${r[3]}<small>${r[4]}</small></td><td>${r[2]}</td><td>${r[4]}</td><td class="l"><span class="wx-r">${r[5]}</span>(<span class="wx-r">${r[6]}</span>)</td></tr>`).join('')}</tbody></table>
      <table class="wx-tb wx-hh"><tbody>
        <tr><td colspan="2">陽明厥陰為合</td><td></td></tr><tr><td colspan="2">太陰太陽為開</td><td>＝臟腑通治</td></tr>
        <tr><td>井主心下滿</td><td>病在臟</td><td></td></tr><tr><td>滎主身熱</td><td>變於色</td><td>滎治外經</td></tr>
        <tr><td>俞主體重節痛</td><td>時甚</td><td>輸治外經</td></tr><tr><td>經主喘咳寒熱</td><td>變於音</td><td></td></tr>
        <tr><td>合主逆氣而泄</td><td>食不節</td><td>合治內腑</td></tr></tbody></table>`;
  }
  const WIDE = matchMedia('(min-aspect-ratio: 1/1) and (min-width: 900px)');   // 和 CSS 的電腦版版面同一個條件
  const wxPanel = document.createElement('aside');
  wxPanel.className = 'ip ip-left';
  wxPanel.setAttribute('aria-label', '五輸穴天干表');
  wxPanel.innerHTML = '<div class="ip-glass"></div><button type="button" class="ip-x" aria-label="關閉">✕</button><div class="ip-body wx-body"></div>';
  stage.appendChild(wxPanel);
  const wxBody = wxPanel.querySelector('.wx-body');

  /* ---------- 介面 ---------- */
  const panel = document.createElement('aside');
  panel.className = 'ip';
  panel.setAttribute('aria-label', '經絡資訊');
  panel.innerHTML = '<div class="ip-glass"></div><button type="button" class="ip-x" aria-label="關閉">✕</button><div class="ip-body"></div>';
  stage.appendChild(panel);
  const body = panel.querySelector('.ip-body');
  const tr = document.createElement('div');   // 手機右上：穴位下拉＋切換小點
  tr.className = 'ip-tr';
  stage.appendChild(tr);
  function setPage(n) {
    body.querySelectorAll('.ip-page').forEach(p => p.classList.toggle('on', +p.dataset.page === n));
    tr.querySelectorAll('.ip-dot').forEach(d => { const on = +d.dataset.page === n; d.classList.toggle('on', on); d.setAttribute('aria-current', on ? 'true' : 'false'); });
    body.scrollTop = 0;
  }
  tr.addEventListener('click', e => { const d = e.target.closest('.ip-dot'); if (d) setPage(+d.dataset.page); });
  // 左右滑也能切換
  let sw = null;
  body.addEventListener('touchstart', e => { const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY }; }, { passive: true });
  body.addEventListener('touchend', e => {
    if (!sw || WIDE.matches) return;
    const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y; sw = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setPage(dx < 0 ? 1 : 0);
  });

  // 經文：● 開頭的另起一行；「是動則病」「是主…所生病者」「其病」加粗
  const para = t => E(t).split('●').map((x, i) => x ? `${i ? '<br>●' : ''}${x}` : '').join('')
    .replace(/(是動則病|是主[^，、者]{1,2}所生病者|其病：?|其實|其病實)/g, '<b>$1</b>');
  const ptSelect = (m, pts) => `<select data-pt aria-label="${E(m.name)}的穴位"><option value="">${WIDE.matches ? `選一個穴位（共 ${pts.length} 穴）` : `${E(m.name)}・穴位（${pts.length}）`}</option>${pts.map((p, i) => `<option value="${i + 1}">${i + 1}．${E(p.name)}${p.major ? '　★常用' : ''}</option>`).join('')}</select>`;
  const secs = (m, j, pts) => {
    const out = [];
    if (j) j.secs.forEach(x => out.push(`<section class="ip-sec${/歌/.test(x.h) ? ' song' : ''}"><h3>${E(x.h)}</h3>${/歌/.test(x.h) ? `<p class="ip-p ip-verse">${(x.p.join('').match(/.{1,7}/g) || []).map(l => `<span>${E(l)}</span>`).join('')}</p>` : x.p.map(t => `<p class="ip-p">${para(t)}</p>`).join('')}</section>`));
    else out.push(`<section><h3>全部穴位</h3><p class="ip-p">${pts.map(p => E(p.name)).join('、')}</p></section>`);
    (EXTRA[m.id] || []).forEach(x => out.push(`<section><h3>${E(x.h)}</h3>${x.list ? `<ul class="ip-ul">${x.list.map(v => `<li>${E(v)}</li>`).join('')}</ul>` : `<p class="ip-p">${E(x.p)}</p>`}</section>`));
    return out;
  };
  const stagger = items => items.map((h, i) => `<div class="ip-it" style="animation-delay:${(0.15 + i * 0.3).toFixed(2)}s">${h}</div>`).join('');
  // 手機：資訊欄只放經文（循行、病候…），和五輸天干表用右上的小點切換；穴位下拉也在右上
  function phoneContent(m) {
    const pts = m.ptNames || [];
    return `<div class="ip-page on" data-page="0">${stagger(secs(m, JING[m.id], pts))}</div><div class="ip-page" data-page="1">${stagger([wuxing(m.id)])}</div>`;
  }
  function content(m) {
    if (!WIDE.matches) return phoneContent(m);
    const pts = m.ptNames || [];
    const j = JING[m.id];
    const items = [];
    items.push(`<header class="ip-h"><small>${m.bilateral ? '十二正經' : '奇經八脈'}</small><h2>${E(m.name)}<span class="ip-n">${pts.length}穴</span>${TIME[m.id] ? `<span class="ip-n">${TIME[m.id]}</span>` : ''}</h2>${ALIAS[m.id] ? `<p class="ip-alias">${ALIAS[m.id]}</p>` : ''}</header>`);
    if (j) {
      const yang = !!j.te[5], kinds = yang ? YANG : YIN;
      const te = ['募', '背俞', '原', '絡', '郄'].concat(yang ? ['下合'] : []);
      items.push(`<table class="ip-tb"><tr>${kinds.map(k => `<th>${k}</th>`).join('')}${yang ? '<th></th>' : ''}</tr><tr>${j.shu.map(n => `<td>${E(n)}</td>`).join('')}${yang ? '<td></td>' : ''}</tr>` +
        `<tr>${te.map(k => `<th>${k}</th>`).join('')}</tr><tr>${j.te.map(n => `<td>${E(n)}</td>`).join('')}</tr></table>`);
    }
    if (pts.length) items.push(`<section><h3>穴位</h3><label class="ip-pick">${ptSelect(m, pts)}</label></section>`);
    return stagger(items.concat(secs(m, j, pts)));
  }

  /* ---------- 鏡頭：0.5 秒阻尼拉近 ---------- */
  const wide = () => stage.clientWidth > stage.clientHeight;
  let anim = null, back = null;
  const _s0 = new THREE.Spherical(), _s1 = new THREE.Spherical(), _o = new THREE.Vector3();
  function flyTo(tgt, pos, ms) {
    anim = {
      t0: performance.now(), ms,
      tA: controls.target.clone(), sA: new THREE.Spherical().setFromVector3(_o.subVectors(camera.position, controls.target)),
      tB: tgt.clone(), sB: new THREE.Spherical().setFromVector3(_o.subVectors(pos, tgt))
    };
    let d = anim.sB.theta - anim.sA.theta;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    anim.sB.theta = anim.sA.theta + d;   // 走近的那一邊，不穿過身體
  }
  L.hooks.frame.push(() => {
    if (!anim) return;
    const k = Math.min(1, (performance.now() - anim.t0) / anim.ms);
    const e = 1 - Math.pow(1 - k, 3);   // 先快後慢，像有阻尼
    _s0.theta = anim.sA.theta + (anim.sB.theta - anim.sA.theta) * e;
    _s0.phi = anim.sA.phi + (anim.sB.phi - anim.sA.phi) * e;
    _s0.radius = anim.sA.radius + (anim.sB.radius - anim.sA.radius) * e;
    controls.target.lerpVectors(anim.tA, anim.tB, e);
    camera.position.copy(controls.target).add(_o.setFromSpherical(_s0));
    if (k >= 1) anim = null;
  });
  // 打開經絡資訊時人會在中間慢慢轉；手一碰就停，放開 5 秒後再轉（選了某一穴就不轉）
  let lastUser = 0, spin = false;
  controls.addEventListener('start', () => { anim = null; lastUser = performance.now(); });
  L.hooks.frame.push(() => { if (openId && spin) controls.autoRotate = !anim && performance.now() - lastUser > 5000; });

  function closeUp(m) {
    const ps = PT.filter(o => o.m === m && o.side > 0);
    if (!ps.length) return null;
    const box = new THREE.Box3(), nrm = V3(0, 0, 0);
    ps.forEach(o => { box.expandByPoint(o.p); nrm.add(o.n); });
    if (m.pick) m.pick.forEach(q => { if (q.p.x >= -0.05 || !m.bilateral) box.expandByPoint(q.p); });
    const c = box.getCenter(V3(0, 0, 0)), size = box.getSize(V3(0, 0, 0));
    nrm.y = 0;
    if (nrm.lengthSq() < 1e-4) nrm.set(0, 0, 1);
    nrm.normalize();
    if (nrm.z > -0.3 && Math.abs(nrm.x) > 0.6) nrm.lerp(V3(0, 0, 1), 0.4).normalize();   // 側面的經：稍微轉向前面
    const fov = THREE.MathUtils.degToRad(camera.fov), aspect = stage.clientWidth / stage.clientHeight;
    const W = wide();
    // 能用的畫面：電腦是左邊 56%，手機是上面 46%
    const useW = W ? 0.32 : 1, useH = W ? 1 : 0.46;   // 電腦：左邊五輸表、右邊資訊欄，人在中間
    const fitH = (size.y / 2 + 0.4) / Math.tan(fov / 2) / useH;
    const right = V3(nrm.z, 0, -nrm.x);   // 從鏡頭看過去的右手方向
    // 人放在畫面正中間：對準身體中軸（x = 0），寬度用兩側（左右對稱）離中軸最遠的點來算
    let half = 0;
    ps.forEach(o => { half = Math.max(half, Math.abs(o.p.x * right.x) + Math.abs(o.p.z * right.z)); });
    const fitW = (half + 0.4) / (Math.tan(fov / 2) * aspect * useW);
    const dist = Math.max(5.5, Math.min(30, Math.max(fitH, fitW) * 1.05));
    const halfH = Math.tan(fov / 2) * dist, halfW = halfH * aspect;
    const tgt = V3(0, c.y, 0);
    if (!W) tgt.y -= halfH * 0.54;                        // 人往上移，讓出下方欄
    return { tgt, pos: tgt.clone().addScaledVector(nrm, dist).add(V3(0, dist * 0.04, 0)) };
  }

  function open(id) {
    const m = byId[id];
    if (!m) return;
    if (!openId) back = { tgt: controls.target.clone(), pos: camera.position.clone() };
    openId = id;
    partFrom = null; stage.classList.remove('pp-on');
    controls.autoRotate = false;
    spin = true; lastUser = 0;
    const cu = closeUp(m);
    if (cu) flyTo(cu.tgt, cu.pos, 500);
    body.innerHTML = content(m);
    body.scrollTop = 0;
    const pts = m.ptNames || [];
    tr.innerHTML = WIDE.matches ? '' : `${pts.length ? `<label class="ip-pick">${ptSelect(m, pts)}</label>` : ''}<div class="ip-dots" role="tablist" aria-label="切換內容"><button type="button" class="ip-dot on" data-page="0" aria-label="經文"></button><button type="button" class="ip-dot" data-page="1" aria-label="五輸穴天干表"></button></div>`;
    wxBody.innerHTML = wuxing(id);
    wxBody.scrollTop = 0;
    [panel, wxPanel].forEach(el => el.classList.remove('show'));
    void panel.offsetWidth;   // 重新播放進場動畫
    panel.classList.add('show');
    if (WIDE.matches) wxPanel.classList.add('show');
    stage.classList.add('ip-on');
  }
  function close(fly) {
    if (!openId) return;
    openId = null;
    partFrom = null; stage.classList.remove('pp-on');
    panel.classList.remove('show');
    wxPanel.classList.remove('show');
    stage.classList.remove('ip-on');
    if (L.xue && L.xue.light) L.xue.light(null);
    spin = false; controls.autoRotate = false;
    if (fly !== false && back) flyTo(back.tgt, back.pos, 500);
    back = null;
  }
  panel.querySelector('.ip-x').addEventListener('click', () => close());
  wxPanel.querySelector('.ip-x').addEventListener('click', () => wxPanel.classList.remove('show'));
  // 穴位下拉：鏡頭拉到那一穴（人的左側那一個），名字閃一下
  const onPick = e => {
    const sel = e.target.closest('[data-pt]');
    if (!sel || !sel.value || !openId) return;
    const m = byId[openId], no = +sel.value;
    const o = PT.find(q => q.m === m && q.no === no && q.side > 0) || PT.find(q => q.m === m && q.no === no);
    if (!o) return;
    const dist = 16, tgt = o.p.clone();   // 選穴：看到上半身（大約肩到腰），要放大縮小再自己調
    if (!WIDE.matches) tgt.y -= Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * 0.54;
    flyTo(tgt, o.p.clone().addScaledVector(o.n, dist).add(V3(0, dist * 0.04, 0)).add(tgt).sub(o.p), 500);
    spin = false; controls.autoRotate = false;
    if (L.xue) { L.xue.show(o); if (L.xue.light) L.xue.light(o); }   // 選到的穴：跳出穴位小卡＋銅人身上亮起
    else L.toast(`${m.name}・${o.name}`, 1600);
  };
  body.addEventListener('change', onPick);
  tr.addEventListener('change', onPick);
  /* ---------- 右上：查詢穴位（打字就列出相關穴位，點一下鏡頭飛過去） ---------- */
  // 點穴名／查詢：看整個人（人在畫面中間），轉到看得見這一穴的那一面，亮點標出位置
  function flyToPoint(o) {
    const d = V3(o.n.x, 0, o.n.z);
    if (d.lengthSq() < 0.05) d.set(o.p.x, 0, o.p.z);
    if (d.lengthSq() < 0.05) d.set(0, 0, 1);
    d.normalize();
    const tgt = V3(0, -0.3, 0), dist = 40;
    flyTo(tgt, tgt.clone().addScaledVector(d, dist).add(V3(0, 1, 0)), 600);
  }
  const qBox = document.createElement('div');
  qBox.className = 'pt-q';
  qBox.innerHTML = '<label><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" placeholder="" autocomplete="off" enterkeyhint="search" aria-label="查詢穴位"></label><div class="pt-q-list" role="listbox" hidden></div>';
  const hudBtns = document.querySelector('.hud-btns');
  if (hudBtns) hudBtns.prepend(qBox);
  const qIn = qBox.querySelector('input'), qList = qBox.querySelector('.pt-q-list');
  let qHits = [];
  function qRun() {
    const q = qIn.value.trim();
    if (!q) { qList.hidden = true; return; }
    const seen = new Set();
    qHits = PT.filter(o => o.name && o.name.includes(q))
      .sort((a, b) => (b.name.startsWith(q) - a.name.startsWith(q)) || (b.side > 0) - (a.side > 0) || a.name.length - b.name.length)
      .filter(o => { const k = o.m.id + '|' + o.no; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 40);
    qList.innerHTML = qHits.length ? qHits.map((o, i) => `<button type="button" data-i="${i}"><b>${E(o.name)}</b><small>${E(o.m.name)}・${o.no}</small></button>`).join('') : '<p>找不到相關穴位</p>';
    qList.hidden = false;
  }
  function qPick(o) {
    if (!o) return;
    qList.hidden = true; qIn.blur();
    L.select(o.m.id);
    spin = false; controls.autoRotate = false;
    flyToPoint(o);
    if (L.xue) L.xue.show(o); else L.toast(`${o.m.name}・${o.name}`, 1800);   // 穴位小卡＋亮點
  }
  qIn.addEventListener('input', qRun);
  qIn.addEventListener('focus', qRun);
  qIn.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); qPick(qHits[0]); } else if (e.key === 'Escape') { qIn.value = ''; qList.hidden = true; } });
  qList.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) qPick(qHits[+b.dataset.i]); });
  document.addEventListener('pointerdown', e => { if (!qBox.contains(e.target)) qList.hidden = true; }, true);

  L.hooks.open.push(open);
  L.hooks.select.push(id => { if (openId && id !== openId) close(id ? false : true); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });


  /* ---------- 循行紅字（臟腑／部位）：點一下，右邊玻璃欄只顯示那一格整理內容；左上 « 回原經絡 ---------- */
  // 依使用者「十二經絡循行經過的臟腑」「十二經絡循行經過的部位」兩張整理表
  const SHORT = { LU: '肺', LI: '大腸', ST: '胃', SP: '脾', HT: '心', SI: '小腸', BL: '膀胱', KI: '腎', PC: '心包', SJ: '三焦', GB: '膽', LR: '肝' };
  const ORGAN = {
    肺: ['肺', '大腸', '循胃口'], 大腸: ['大腸', '肺'], 胃: ['胃', '脾'], 脾: ['脾', '胃', '注心中'],
    心: ['心', '小腸', '卻上肺'], 小腸: ['小腸', '心', '抵胃'], 膀胱: ['膀胱', '腎', '腦'], 腎: ['腎', '膀胱', '心', '肺', '肝'],
    心包: ['心包', '三焦'], 三焦: ['三焦', '心包'], 膽: ['膽', '肝'], 肝: ['肝', '膽', '上注肺', '挾胃']
  };
  const PART = {
    目: [['小腸、膀胱', '目內眥'], ['三焦、小腸、膽', '目銳（外）眥'], ['心、肝', '目系']],
    耳: [['三焦、膀胱', '耳上'], ['三焦、膽、胃', '耳前'], ['三焦、膽、小腸', '耳中'], ['三焦、膽', '耳後']],
    鼻: [['胃', '起於鼻之交頞中、下循鼻外'], ['大腸', '上挾鼻孔'], ['小腸', '抵鼻']],
    客主人: [['三焦', '過客主人'], ['胃', '過客主人']],
    䪼: [['小腸', '別頰上䪼'], ['三焦', '以屈下頰至䪼'], ['膽', '抵於䪼']],
    頰: [['大腸', '貫頰'], ['小腸', '上頰'], ['三焦', '以屈下頰'], ['肝', '下頰裡']],
    大迎: [['胃', '從大迎前下人迎'], ['膽', '下大迎']],
    唇: [['胃', '環唇（唇外）'], ['肝', '環唇內']],
    口: [['大腸', '還出挾口'], ['胃', '還出挾口']],
    舌: [['脾', '連舌本，散舌下'], ['腎', '挾舌本']],
    齒: [['胃', '上齒'], ['大腸', '下齒']],
    頸: [['大腸', '從缺盆上頸'], ['小腸', '從缺盆循頸'], ['膽', '循頸行手少陽之前、下頸']],
    項: [['膀胱', '還出別下項'], ['三焦', '上項系耳後']],
    喉嚨: [['胃', '循喉嚨'], ['腎', '循喉嚨，挾舌本'], ['肝', '循喉嚨之後，上入頏顙']],
    咽: [['脾', '屬脾，絡胃，上膈，挾咽'], ['心', '其支者，從心系，上挾咽，系目系'], ['小腸', '入缺盆，絡心，循咽']],
    缺盆: [['大腸', '下入缺盆'], ['膽、胃、小腸', '入缺盆'], ['膽、胃、大腸、小腸', '從缺盆'], ['三焦', '下缺盆、出缺盆']],
    膈: [['脾、肺', '上膈'], ['肝、腎', '貫膈'], ['心、心包、三焦、胃、小腸、大腸', '下膈']],
    膕: [['膀胱', '入膕中、下合膕中'], ['肝', '上膕內廉'], ['腎', '出膕內廉']],
    足跗: [['膽', '循足跗上'], ['胃', '下循脛外廉，下足跗'], ['肝', '上循足跗上廉']]
  };
  const PART_ALIAS = { 頔: '䪼', 顓: '䪼' };
  const PART_TITLE = { 客主人: '客主人（上關）', 䪼: '䪼（頔）' };
  const PART_NOTE = { 膈: '★ 膀胱經、膽經沒有經過膈' };
  let partFrom = null;
  const mer = (s, me) => s.split('、').map(x => `<span class="pp-m${x === me ? ' me' : ''}">${E(x)}</span>`).join('、');
  function partHtml(term, fromId) {
    const me = SHORT[fromId];
    const t = PART_ALIAS[term] || term;
    let h = '', sub = '';
    if (PART[t]) {
      sub = '十二經絡循行經過的部位';
      h = `<table class="ip-tb pp-tb"><tr><th>經絡</th><th>循行</th></tr>${PART[t].map(([ms, x]) => `<tr${ms.split('、').includes(me) ? ' class="me"' : ''}><td>${mer(ms, me)}</td><td>${E(x)}</td></tr>`).join('')}</table>`;
      if (t === '耳') h = `<div class="pp-ear">${PART.耳.map(([ms, x]) => `<div><b>${x}</b><span>${mer(ms, me)}</span></div>`).join('')}</div>` + h;
      if (PART_NOTE[t]) h += `<p class="pp-note">${PART_NOTE[t]}</p>`;
    } else if (ORGAN[t] || t === '腦') {
      sub = '十二經絡循行經過的臟腑';
      const has = x => x.includes(t) && !(t === '心' && x.includes('心包'));
      const via = Object.keys(ORGAN).filter(k => ORGAN[k].some(has));
      h = (ORGAN[t] ? `<table class="ip-tb pp-tb"><tr><th>經絡</th><th>循行經過的臟腑</th></tr><tr class="${t === me ? 'me' : ''}"><td>${mer(t, me)}</td><td>${ORGAN[t].map(E).join('、')}</td></tr></table>` : '') +
        `<table class="ip-tb pp-tb"><tr><th colspan="2">${t === '腦' ? '經過腦的經絡' : `與${E(t)}有聯繫之經絡`}</th></tr>${via.map(k => `<tr${k === me ? ' class="me"' : ''}><td>${mer(k, me)}</td><td>${ORGAN[k].filter(has).map(E).join('、')}</td></tr>`).join('')}</table>`;
    } else return '';
    const m = byId[fromId];
    return stagger([`<header class="ip-h pp-h"><button type="button" class="xue-mback pp-back" aria-label="回到${m ? E(m.name) : '經絡'}">«</button><div><small>${sub}${m ? `・從${E(m.name)}` : ''}</small><h2>${E(PART_TITLE[t] || t)}</h2></div></header>`, h]);
  }
  function openPart(term, fromId) {
    fromId = fromId || openId;
    const html = partHtml(term, fromId);
    if (!html) return false;
    if (!openId) {
      back = { tgt: controls.target.clone(), pos: camera.position.clone() };
      const cu = byId[fromId] && closeUp(byId[fromId]);
      if (cu) flyTo(cu.tgt, cu.pos, 500);
    }
    openId = fromId || openId;
    partFrom = fromId;
    if (L.hooks.part) L.hooks.part.forEach(f => f(term));
    body.innerHTML = html;
    body.scrollTop = 0;
    tr.innerHTML = '';
    wxPanel.classList.remove('show');
    panel.classList.remove('show'); void panel.offsetWidth; panel.classList.add('show');
    stage.classList.add('ip-on', 'pp-on');
    return true;
  }
  panel.addEventListener('click', e => { if (e.target.closest('.pp-back') && partFrom) { const id = partFrom; partFrom = null; stage.classList.remove('pp-on'); open(id); } });
  // 紅字：capture 階段攔下，免得同一個字也是穴名（缺盆、大迎）時跳去小卡
  document.addEventListener('click', e => {
    const r = e.target.closest('.tr-red');
    if (!r) return;
    const s = r.closest('[data-m]');
    const from = (s && s.dataset.m) || (r.closest('.tr-ip') && L.tour && L.tour.curId) || openId || null;
    if (!from || !partHtml(r.textContent, from)) return;
    e.stopPropagation(); e.preventDefault();
    openPart(r.textContent, from);
  }, true);

  L.info = { open, close, openPart, EXTRA, flyToPoint: o => { spin = false; controls.autoRotate = false; flyToPoint(o); }, get openId() { return openId; } };
})();

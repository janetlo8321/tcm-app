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
  fetch('model/jing.json').then(r => r.json()).then(d => { JING = d; if (openId) body.innerHTML = content(byId[openId]); }).catch(() => {});
  const EXTRA = {};   // 之後再匯入的內容：{ LU: [{ h: '主治', list: [...] } 或 { h, p: '段落' }] }
  const YIN = ['井木', '滎火', '輸土', '經金', '合水'], YANG = ['井金', '滎水', '輸木', '經火', '合土'];

  /* ---------- 介面 ---------- */
  const panel = document.createElement('aside');
  panel.className = 'ip';
  panel.setAttribute('aria-label', '經絡資訊');
  panel.innerHTML = '<div class="ip-glass"></div><button type="button" class="ip-x" aria-label="關閉">✕</button><div class="ip-body"></div>';
  stage.appendChild(panel);
  const body = panel.querySelector('.ip-body');

  // 經文：● 開頭的另起一行；「是動則病」「是主…所生病者」「其病」加粗
  const para = t => E(t).split('●').map((x, i) => x ? `${i ? '<br>●' : ''}${x}` : '').join('')
    .replace(/(是動則病|是主[^，、者]{1,2}所生病者|其病：?|其實|其病實)/g, '<b>$1</b>');
  function content(m) {
    const pts = m.ptNames || [];
    const major = pts.filter(p => p.major).map(p => p.name);
    const j = JING[m.id];
    const items = [];
    items.push(`<header class="ip-h"><small>${m.bilateral ? '十二正經' : '奇經八脈'}</small><h2>${E(m.name)}<span class="ip-n">${pts.length}穴</span>${TIME[m.id] ? `<span class="ip-n">${TIME[m.id]}</span>` : ''}</h2>${ALIAS[m.id] ? `<p class="ip-alias">${ALIAS[m.id]}</p>` : ''}</header>`);
    if (j) {
      const yang = !!j.te[5], kinds = yang ? YANG : YIN;
      const te = ['募', '背俞', '原', '絡', '郄'].concat(yang ? ['下合'] : []);
      items.push(`<table class="ip-tb"><tr>${kinds.map(k => `<th>${k}</th>`).join('')}${yang ? '<th></th>' : ''}</tr><tr>${j.shu.map(n => `<td>${E(n)}</td>`).join('')}${yang ? '<td></td>' : ''}</tr>` +
        `<tr>${te.map(k => `<th>${k}</th>`).join('')}</tr><tr>${j.te.map(n => `<td>${E(n)}</td>`).join('')}</tr></table>`);
    }
    if (major.length) items.push(`<section><h3>常用穴</h3><div class="ip-chips">${major.map(n => `<span>${E(n)}</span>`).join('')}</div></section>`);
    if (j) j.secs.forEach(x => items.push(`<section class="ip-sec${/歌/.test(x.h) ? ' song' : ''}"><h3>${E(x.h)}</h3>${/歌/.test(x.h) ? `<p class="ip-p ip-verse">${(x.p.join('').match(/.{1,7}/g) || []).map(l => `<span>${E(l)}</span>`).join('')}</p>` : x.p.map(t => `<p class="ip-p">${para(t)}</p>`).join('')}</section>`));
    else items.push(`<section><h3>全部穴位</h3><p class="ip-p">${pts.map(p => E(p.name)).join('、')}</p></section>`);
    (EXTRA[m.id] || []).forEach(x => items.push(`<section><h3>${E(x.h)}</h3>${x.list ? `<ul class="ip-ul">${x.list.map(v => `<li>${E(v)}</li>`).join('')}</ul>` : `<p class="ip-p">${E(x.p)}</p>`}</section>`));
    return items.map((h, i) => `<div class="ip-it" style="animation-delay:${(0.15 + i * 0.3).toFixed(2)}s">${h}</div>`).join('');
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
  controls.addEventListener('start', () => { anim = null; });

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
    const useW = W ? 0.56 : 1, useH = W ? 1 : 0.46;
    const fitH = (size.y / 2 + 0.4) / Math.tan(fov / 2) / useH;
    const fitW = (Math.max(size.x, size.z) / 2 + 0.4) / (Math.tan(fov / 2) * aspect * useW);
    const dist = Math.max(5.5, Math.min(30, Math.max(fitH, fitW) * 1.05));
    const halfH = Math.tan(fov / 2) * dist, halfW = halfH * aspect;
    const right = V3(nrm.z, 0, -nrm.x);   // 從鏡頭看過去的右手方向
    const tgt = c.clone();
    if (W) tgt.addScaledVector(right, halfW * 0.36);   // 人往左移，讓出右側欄
    else tgt.y -= halfH * 0.54;                        // 人往上移，讓出下方欄
    return { tgt, pos: tgt.clone().addScaledVector(nrm, dist).add(V3(0, dist * 0.04, 0)) };
  }

  function open(id) {
    const m = byId[id];
    if (!m) return;
    if (!openId) back = { tgt: controls.target.clone(), pos: camera.position.clone() };
    openId = id;
    controls.autoRotate = false;
    const cu = closeUp(m);
    if (cu) flyTo(cu.tgt, cu.pos, 500);
    body.innerHTML = content(m);
    body.scrollTop = 0;
    panel.classList.remove('show');
    void panel.offsetWidth;   // 重新播放進場動畫
    panel.classList.add('show');
    stage.classList.add('ip-on');
  }
  function close(fly) {
    if (!openId) return;
    openId = null;
    panel.classList.remove('show');
    stage.classList.remove('ip-on');
    if (fly !== false && back) flyTo(back.tgt, back.pos, 500);
    back = null;
  }
  panel.querySelector('.ip-x').addEventListener('click', () => close());
  L.hooks.open.push(open);
  L.hooks.select.push(id => { if (openId && id !== openId) close(id ? false : true); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  L.info = { open, close, EXTRA, get openId() { return openId; } };
})();

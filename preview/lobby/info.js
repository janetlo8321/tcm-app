/* =========================================================
 * 經絡資訊介面（點兩下經絡）
 *   銅人 0.5 秒阻尼拉近成這條經的特寫（電腦：人在左；手機：人在上）
 *   右側（手機在下方）Liquid Glass 毛玻璃欄，內容由上而下每 0.3 秒依序出現
 *   目前放的是基本資料與《靈樞・經脈》循行；之後匯入的內容接在 EXTRA 裡
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { stage, camera, controls, byId, points: PT } = L;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 經絡的基本資料（教科書通行說法）
  const BASE = {
    LU: { time: '寅時 3–5 點', pair: 'LI', el: '金', qx: '多氣少血' },
    LI: { time: '卯時 5–7 點', pair: 'LU', el: '金', qx: '多氣多血' },
    ST: { time: '辰時 7–9 點', pair: 'SP', el: '土', qx: '多氣多血' },
    SP: { time: '巳時 9–11 點', pair: 'ST', el: '土', qx: '多氣少血' },
    HT: { time: '午時 11–13 點', pair: 'SI', el: '火', qx: '多氣少血' },
    SI: { time: '未時 13–15 點', pair: 'HT', el: '火', qx: '多血少氣' },
    BL: { time: '申時 15–17 點', pair: 'KI', el: '水', qx: '多血少氣' },
    KI: { time: '酉時 17–19 點', pair: 'BL', el: '水', qx: '多氣少血' },
    PC: { time: '戌時 19–21 點', pair: 'SJ', el: '火（相火）', qx: '多血少氣' },
    SJ: { time: '亥時 21–23 點', pair: 'PC', el: '火（相火）', qx: '多氣少血' },
    GB: { time: '子時 23–1 點', pair: 'LR', el: '木', qx: '多氣少血' },
    LR: { time: '丑時 1–3 點', pair: 'GB', el: '木', qx: '多血少氣' },
    REN: { note: '陰脈之海' },
    DU: { note: '陽脈之海' }
  };
  const EXTRA = {};   // 之後匯入的內容：{ LU: [{ h: '主治', list: [...] } 或 { h, p: '段落' }] }

  /* ---------- 介面 ---------- */
  const panel = document.createElement('aside');
  panel.className = 'ip';
  panel.setAttribute('aria-label', '經絡資訊');
  panel.innerHTML = '<div class="ip-glass"></div><button type="button" class="ip-x" aria-label="關閉">✕</button><div class="ip-body"></div>';
  stage.appendChild(panel);
  const body = panel.querySelector('.ip-body');

  function content(m) {
    const b = BASE[m.id] || {};
    const pts = m.ptNames || [];
    const major = pts.filter(p => p.major).map(p => p.name);
    const tour = (L.tour && L.tour.TOURS[m.id]) || [];
    const items = [];
    items.push(`<header class="ip-h"><small>${m.bilateral ? '十二正經' : '奇經八脈'}</small><h2>${E(m.name)}</h2></header>`);
    const facts = [
      ['穴數', `${pts.length} 穴${m.bilateral ? '（左右各一）' : ''}`],
      pts.length ? ['起止', `${pts[0].name} → ${pts[pts.length - 1].name}`] : null,
      b.time ? ['流注', b.time] : null,
      b.pair ? ['表裡', byId[b.pair] ? byId[b.pair].name : b.pair] : null,
      b.el ? ['五行', b.el] : null,
      b.qx ? ['氣血', b.qx] : null,
      b.note ? ['別稱', b.note] : null
    ].filter(Boolean);
    items.push(`<dl class="ip-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${E(v)}</dd></div>`).join('')}</dl>`);
    if (major.length) items.push(`<section><h3>常用穴</h3><div class="ip-chips">${major.map(n => `<span>${E(n)}</span>`).join('')}</div></section>`);
    if (tour.length) items.push(`<section><h3>循行<small>《靈樞・經脈》</small></h3><ol class="ip-ol">${tour.map(s => `<li>${E(s.t)}</li>`).join('')}</ol></section>`);
    items.push(`<section><h3>全部穴位</h3><p class="ip-p">${pts.map(p => E(p.name)).join('、')}</p></section>`);
    (EXTRA[m.id] || []).forEach(x => items.push(`<section><h3>${E(x.h)}</h3>${x.list ? `<ul class="ip-ul">${x.list.map(v => `<li>${E(v)}</li>`).join('')}</ul>` : `<p class="ip-p">${E(x.p)}</p>`}</section>`));
    if (!EXTRA[m.id]) items.push(`<section class="ip-todo"><h3>主治・病候</h3><p class="ip-p">待匯入</p></section>`);
    return items.map((h, i) => `<div class="ip-it" style="animation-delay:${(0.15 + i * 0.3).toFixed(2)}s">${h}</div>`).join('');
  }

  /* ---------- 鏡頭：0.5 秒阻尼拉近 ---------- */
  const wide = () => stage.clientWidth > stage.clientHeight;
  let anim = null, back = null, openId = null;
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

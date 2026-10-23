/* =========================================================
 * 病證區域（左上角小人）
 *   點小人 → 同一個人身上出現各「證」系統的區域
 *   點區域 → 鏡頭移過去、相關臟腑亮起，下方列出這一系的病
 *   點病名 → 進入資料庫，直接打開那一個病證
 *   分類照資料庫「病證」的系統；氣血津液、血液、內分泌、小兒、癌症、其他屬全身，放在下方
 *   病名清單：model/zz.json（tools/zz.py 由 tcm-notes 病證.json 產生）
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { stage, camera, controls, view } = L;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // 各系的顏色（與資料庫病證頁的底色同一色系，調成在暗底上看得清楚）
  const COLOR = {
    肺系: '#facc15', 心系: '#ef4444', 脾胃系: '#f97316', 肝膽系: '#22c55e', 腎系: '#3b82f6',
    氣血津液: '#f9a8d4', 血液系統: '#fb7185', 內分泌代謝: '#f0abfc', 婦科: '#ec4899', 五官科: '#a855f7',
    皮膚科: '#eabe96', 小兒科: '#f5f5f4', 肢體經絡: '#a8a29e', 癌症: '#78716c', 其他: '#94a3b8'
  };
  // 身上的區域：at = 大約位置（會貼到皮膚上），organs = 一起亮起的臟腑，dist = 鏡頭距離，back = 從背面看
  const REGION = {
    五官科: { at: [0, 7.2, 1], organs: [], dist: 8, face: true },
    肺系: { at: [-0.8, 4.7, 1], organs: ['肺'], dist: 14 },
    心系: { at: [0.35, 4.3, 1], organs: ['心', '腦'], dist: 14 },
    肝膽系: { at: [-0.55, 3.1, 1], organs: ['肝', '膽'], dist: 14 },
    脾胃系: { at: [0.5, 2.8, 1], organs: ['胃', '脾', '小腸', '大腸'], dist: 14 },
    腎系: { at: [1.3, 2.3, -0.1], organs: ['腎', '膀胱'], dist: 14, side: true },
    婦科: { at: [0, 0.6, 1], organs: ['膀胱'], dist: 14 },
    肢體經絡: { at: [-0.75, -4.4, 0.6], organs: [], dist: 14, bones: true },
    皮膚科: { at: [2.8, 0.9, 0.3], organs: [], dist: 14 }
  };

  let DATA = null;
  fetch('model/zz.json').then(r => r.json()).then(d => { DATA = d; drawSystems(); }).catch(() => {});

  /* ---------- 小人按鈕 ---------- */
  const PEG = `<svg viewBox="0 0 24 32" width="22" height="30" aria-hidden="true">
    <circle cx="12" cy="6" r="4.6" fill="#ffc928" stroke="#a46a00" stroke-width="1"/>
    <path d="M6.2 12.5c0-1.6 1.3-2.8 2.9-2.8h5.8c1.6 0 2.9 1.2 2.9 2.8v7.3c0 .9-.7 1.6-1.6 1.6h-.6l-.6 8.2c-.1.8-.7 1.4-1.5 1.4h-2.9c-.8 0-1.4-.6-1.5-1.4l-.6-8.2h-.6c-.9 0-1.6-.7-1.6-1.6z" fill="#ffc928" stroke="#a46a00" stroke-width="1"/>
  </svg>`;
  const peg = document.createElement('button');
  peg.type = 'button';
  peg.className = 'peg';
  peg.title = '病證區域：依身體部位看疾病';
  peg.setAttribute('aria-label', '病證區域');
  peg.setAttribute('aria-pressed', 'false');
  peg.innerHTML = PEG + '<span>病證</span>';
  stage.appendChild(peg);

  /* ---------- 模式介面 ---------- */
  const pins = document.createElement('div');
  pins.className = 'zz-pins';
  stage.appendChild(pins);
  const sheet = document.createElement('section');
  sheet.className = 'zz-sheet';
  sheet.innerHTML = '<header class="zz-bar"><span>病證區域<small>點身上的區域或系統</small></span><button type="button" aria-label="離開病證區域">✕</button></header>' +
    '<nav class="zz-sys" aria-label="病證系統"></nav><div class="zz-list" role="list"></div>';
  stage.appendChild(sheet);
  const bar = sheet.querySelector('.zz-bar');
  const sysEl = sheet.querySelector('.zz-sys'), listEl = sheet.querySelector('.zz-list');

  const pinEls = {};
  Object.keys(REGION).forEach(name => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'zz-pin' + (REGION[name].at[0] < -0.3 ? ' left' : '');   // 人的右側：字放在左邊，才不會疊到中間的點
    b.style.setProperty('--c', COLOR[name]);
    b.innerHTML = `<i></i><span>${name}</span>`;
    b.addEventListener('click', () => pick(name));
    pins.appendChild(b);
    pinEls[name] = b;
  });

  // 區域位置貼到皮膚上；身上加一團柔光
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const glows = new THREE.Group();
  glows.visible = false;
  L.scene.add(glows);
  Object.entries(REGION).forEach(([name, r]) => {
    const q = L.snapToSkin(V3(...r.at), 0.05);
    r.p = q.p;
    r.n = q.n;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color(COLOR[name]), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sp.position.copy(q.p).addScaledVector(q.n, 0.05);
    sp.renderOrder = 7;
    r.sprite = sp;
    glows.add(sp);
  });

  /* ---------- 系統與病名 ---------- */
  let on = false, cur = null;
  function drawSystems() {
    if (!DATA) return;
    sysEl.innerHTML = '';
    const local = Object.keys(REGION), all = DATA.systems.map(s => s.name);
    const order = local.filter(n => all.includes(n)).concat(all.filter(n => !local.includes(n)));
    order.forEach(name => {
      const s = DATA.systems.find(x => x.name === name);
      if (!s || !s.diseases.length) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zz-chip' + (REGION[name] ? '' : ' whole');
      b.dataset.sys = name;
      b.style.setProperty('--c', COLOR[name] || '#d6a66b');
      b.innerHTML = `${name}<small>${s.diseases.length}</small>`;
      b.addEventListener('click', () => pick(name));
      sysEl.appendChild(b);
    });
    const lab = document.createElement('span');
    lab.className = 'zz-split';
    lab.textContent = '全身';
    const firstWhole = sysEl.querySelector('.whole');
    if (firstWhole) sysEl.insertBefore(lab, firstWhole);
    drawList();
  }
  function drawList() {
    listEl.innerHTML = '';
    if (!cur || !DATA) {
      listEl.innerHTML = '<p class="zz-empty">點身上的區域，或上面的系統，看這一系有哪些病</p>';
      return;
    }
    const s = DATA.systems.find(x => x.name === cur);
    const h = document.createElement('h3');
    h.style.setProperty('--c', COLOR[cur]);
    h.innerHTML = `${cur}<small>${s.diseases.length} 個病證・點病名進入資料庫</small>`;
    listEl.appendChild(h);
    s.diseases.forEach(d => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zz-dz';
      b.setAttribute('role', 'listitem');
      b.textContent = d.name;
      b.addEventListener('click', () => openDisease(d.id));
      listEl.appendChild(b);
    });
    listEl.scrollTop = 0;
  }
  function openDisease(id) {
    if (window.parent !== window) window.parent.postMessage({ type: 'tcm-enter', go: id }, '*');
    else location.href = '../#' + encodeURIComponent(id);
  }

  /* ---------- 選一系：鏡頭移過去，相關臟腑亮起 ---------- */
  // 鏡頭沿著球面繞過去（不會穿過身體），依時間平滑
  let zfly = null, lastT = 0;
  const HOME_T = V3(0, -1.6, 0), HOME_P = V3(0, -0.9, 33);
  const _s0 = new THREE.Spherical(), _s1 = new THREE.Spherical(), _off = new THREE.Vector3();
  function flyTo(tgt, pos) {
    _s1.setFromVector3(_off.subVectors(pos, tgt));
    zfly = { tgt: tgt.clone(), sph: _s1.clone() };
  }
  function pick(name) {
    cur = cur === name ? null : name;
    sysEl.querySelectorAll('.zz-chip').forEach(b => b.classList.toggle('active', b.dataset.sys === cur));
    const act = sysEl.querySelector('.zz-chip.active');
    if (act) act.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    Object.entries(pinEls).forEach(([k, b]) => b.classList.toggle('active', k === cur));
    const r = REGION[cur];
    L.organLook.keep = r ? new Set(r.organs) : null;
    L.organLook.glow = r ? new THREE.Color(COLOR[cur]) : null;
    L.organLook.fade = cur ? (r && r.organs.length ? 0.3 : 0.6) : 1;
    L.layers.skeleton.visible = !!(r && r.bones) || bonesBefore;
    if (r) {
      // 下方有清單，區域放在畫面上半部
      const tgt = V3(r.p.x * 0.6, r.p.y - r.dist * 0.2, 0);
      const dir = r.side ? V3(0.9, 0.05, 0.75) : V3(r.p.x > 1.5 ? 0.45 : 0.15, 0.05, 1);
      flyTo(tgt, tgt.clone().addScaledVector(dir.normalize(), r.dist));
    } else {
      flyTo(HOME_T, HOME_P);
    }
    controls.autoRotate = false;
    drawList();
  }

  let bonesBefore = false, merBefore = true, ptBefore = true;
  function setMode(v) {
    if (on === v) return;
    on = v;
    peg.setAttribute('aria-pressed', String(on));
    stage.classList.toggle('zz-on', on);
    glows.visible = on;
    if (on) {
      L.select(null);
      bonesBefore = L.layers.skeleton.visible;
      merBefore = view.showMeridians;
      ptBefore = view.showPoints;
      view.showMeridians = false; L.meridianGroup.visible = false;
      view.showPoints = false; L.pointsObj.visible = false;
      L.organLook.fade = 1;
      cur = null;
      sysEl.querySelectorAll('.zz-chip.active').forEach(b => b.classList.remove('active'));
      Object.values(pinEls).forEach(b => b.classList.remove('active'));
      drawList();
      controls.autoRotate = false;
      flyTo(HOME_T, HOME_P);
    } else {
      view.showMeridians = merBefore; L.meridianGroup.visible = merBefore;
      view.showPoints = ptBefore; L.pointsObj.visible = ptBefore;
      L.layers.skeleton.visible = bonesBefore;
      L.organLook.keep = null; L.organLook.glow = null; L.organLook.fade = 1;
      zfly = null;
      L.reset();
    }
  }
  peg.addEventListener('click', () => setMode(!on));
  bar.querySelector('button').addEventListener('click', () => setMode(false));
  controls.addEventListener('start', () => { zfly = null; });

  // 病證模式下：點身上 → 最近的區域；不選經絡
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function nearestPin(x, y, tol) {
    let best = null, bd = tol;
    Object.entries(REGION).forEach(([name, r]) => {
      const s = r.screen;
      if (!s || !s.front) return;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = name; }
    });
    return best;
  }
  L.hooks.tap.unshift((x, y, type) => {
    if (!on) return false;
    const name = nearestPin(x, y, type === 'touch' ? 70 : 55);
    if (name) pick(name);
    return true;
  });
  L.hooks.hover.unshift(() => on);

  L.hooks.frame.push(t => {
    if (!on) return;
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    if (zfly) {
      const k = 1 - Math.exp(-dt * 4);
      _s0.setFromVector3(_off.subVectors(camera.position, controls.target));
      let dth = zfly.sph.theta - _s0.theta;
      dth = Math.atan2(Math.sin(dth), Math.cos(dth));   // 走近的那一邊
      _s0.theta += dth * k;
      _s0.phi += (zfly.sph.phi - _s0.phi) * k;
      _s0.radius += (zfly.sph.radius - _s0.radius) * k;
      controls.target.lerp(zfly.tgt, k);
      camera.position.copy(controls.target).add(_off.setFromSpherical(_s0));
      if (Math.abs(dth) < 0.002 && Math.abs(zfly.sph.radius - _s0.radius) < 0.02 && controls.target.distanceTo(zfly.tgt) < 0.01) zfly = null;
    }
    const W = stage.clientWidth, H = stage.clientHeight;
    Object.entries(REGION).forEach(([name, r]) => {
      const el = pinEls[name];
      _v.copy(r.p).project(camera);
      if (_v.z > 1 || _v.z < -1) { el.style.opacity = 0; r.screen = null; return; }
      const front = _w.subVectors(camera.position, r.p).normalize().dot(r.n) > -0.1;
      const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
      r.screen = { x, y, front };
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${el.classList.contains('left') ? 'translate(calc(-100% + 9px), -9px)' : 'translate(-9px, -9px)'}`;
      el.style.opacity = front ? (cur && cur !== name ? 0.55 : 1) : 0.18;
      el.style.pointerEvents = front ? 'auto' : 'none';
      const sel = cur === name;
      r.sprite.material.opacity = (sel ? 0.75 : 0.35) * (0.8 + 0.2 * Math.sin(t * 2.2 + r.p.y));
      const sc = (sel ? 1.6 : 1.0) * (r.face ? 0.8 : 1);
      r.sprite.scale.set(sc, sc, 1);
    });
  });

  L.zheng = { open: () => setMode(true), close: () => setMode(false), pick, get on() { return on; } };
})();

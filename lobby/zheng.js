/* =========================================================
 * 病證區域（左上角小人）
 *   點小人 → 同一個人身上出現各「證」系統的區域
 *   點區域 → 鏡頭移過去、相關臟腑亮起，下方列出這一系的病
 *   點病名 → 右側毛玻璃欄出現辨證報告單（資料庫已解鎖時，各欄是資料庫的下拉選單；
 *            還沒解鎖時先給空白模板，可以自己打字；按「›」進資料庫看完整的）
 *   電腦：病名清單在人的左邊、報告單在右邊；手機：清單在下方，點病名後報告單從下方升起
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
  const repEl = document.createElement('aside');
  repEl.className = 'zz-rep';
  repEl.setAttribute('aria-label', '辨證報告單');
  repEl.innerHTML = '<button type="button" class="zz-rep-back">‹ 病名清單</button><div class="zz-rep-body"></div>';
  stage.appendChild(repEl);
  const repBody = repEl.querySelector('.zz-rep-body');
  repEl.querySelector('.zz-rep-back').addEventListener('click', () => repEl.classList.remove('show'));
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
    h.innerHTML = `${cur}<small>${s.diseases.length} 個病證・點病名開始辨證</small>`;
    listEl.appendChild(h);
    s.diseases.forEach(d => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zz-dz';
      b.setAttribute('role', 'listitem');
      b.textContent = d.name;
      b.dataset.id = d.id;
      if (d.id === repId) b.classList.add('active');
      b.addEventListener('click', () => openDisease(d.id));
      listEl.appendChild(b);
    });
    listEl.scrollTop = 0;
  }
  /* ---------- 右側報告單 ---------- */
  // 資料庫解鎖、進去過一次之後，外層就是資料庫本身（同網域），可以直接借它的八綱辨證
  // 還沒進去過：外層在背景開了一個看不見的資料庫（#tcm-data），一樣借它的
  const app = () => {
    try {
      const P = window.parent;
      if (P === window) return null;
      if (P.TCMBZ && P.TCMBZ.mount) return P.TCMBZ;
      const f = P.document.getElementById('tcm-data'), W = f && f.contentWindow;
      return W && W.TCMBZ && W.TCMBZ.mount ? W.TCMBZ : null;
    } catch (e) { return null; }
  };
  // 背景的資料庫準備好了：正在看的空白報告單換成有下拉選單的
  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'tcm-data-ready') return;
    if (repId && !repBody.classList.contains('live')) showReport(repId);
  });
  let repId = null;
  const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
  const esc = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function nameOf(id) {
    for (const sy of (DATA ? DATA.systems : [])) { const d = sy.diseases.find(x => x.id === id); if (d) return d.name; }
    return '';
  }
  function template(id) {   // 資料庫還沒好（這台裝置沒解鎖過）：同樣的報告單，每一欄自己打字
    const f = (lb, ph, v, cls) => `<label class="bz-fld${cls ? ' ' + cls : ''}"><span class="bz-lb">${lb}</span><input type="text" value="${esc(v)}" placeholder="${ph}"></label>`;
    return `<div id="bz" class="bz-embed"><div class="bz-body"><div class="bz-rep">
      <div class="bz-rh"><button type="button" class="bz-go" data-zgo aria-label="進入資料庫" title="進入資料庫">›</button>
        <label class="bz-name">姓名<input type="text" placeholder="輸入" autocomplete="off"></label><span>${today()}</span></div>
      <div class="bz-form">
        ${f('主訴', '輸入', id ? nameOf(id) : '')}${f('伴隨症狀', '輸入')}
        ${f('舌象', '輸入')}${f('脈象', '輸入')}
        <div class="bz-fld"><span class="bz-lb">證型</span><div class="bz-bgs"><span class="bz-bg2"><button type="button">陰</button><button type="button">陽</button></span><span class="bz-bg2"><button type="button">虛</button><button type="button">實</button></span><span class="bz-bg2"><button type="button">寒</button><button type="button">熱</button></span></div></div>
        ${f('處方', '輸入')}
        ${f('藥物', '輸入', '', 'wide')}
        <div class="bz-fld wide"><span class="bz-lb">藥物加減</span><div class="zz-adj"></div><button type="button" class="bz-plus" data-zadj>⊕ 加一列</button></div>
      </div>
      <label class="bz-note">醫囑 / 備註<textarea rows="3" placeholder="輸入"></textarea></label>
      <div class="bz-acts"><button type="button" data-zprint>列印</button><button type="button" data-zclear>清空</button></div>
    </div></div></div>`;
  }
  repBody.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-zgo]')) { enterDb(repId); return; }
    const bg = t.closest('.bz-bg2 button');
    if (bg) { const on = bg.classList.contains('on'); bg.parentNode.querySelectorAll('button').forEach(b => b.classList.remove('on')); bg.classList.toggle('on', !on); return; }
    if (t.closest('[data-zadj]')) { const d = document.createElement('div'); d.className = 'bz-adj'; d.innerHTML = '<input type="text" placeholder="例如：痛甚加延胡索、川楝子"><button type="button" aria-label="刪除這一列">×</button>'; repBody.querySelector('.zz-adj').appendChild(d); d.querySelector('input').focus(); return; }
    if (t.closest('.bz-adj button')) { t.closest('.bz-adj').remove(); return; }
    if (t.closest('[data-zprint]')) { window.print(); return; }
    if (t.closest('[data-zclear]')) showReport(repId, true);
  });
  function showReport(id, blank) {
    repId = id;
    const A = app();
    if (A && id && !blank) repBody.innerHTML = '';   // 換掉空白模板
    if (A && id && !blank && A.mount(repBody, id, enterDb)) { repBody.classList.add('live'); }
    else {
      if (A) { A.unmount(); A.close(); }
      repBody.classList.remove('live');
      repBody.innerHTML = template(id);
    }
    repBody.scrollTop = 0;
    if (id) repEl.classList.add('show');
  }
  function hideReport() {
    const A = app();
    if (A && repBody.classList.contains('live')) { A.unmount(); A.close(); }
    repBody.classList.remove('live');
    repEl.classList.remove('show');
    repId = null;
  }
  function enterDb(id) {   // 進入資料庫，直接打開那一個病證的八綱辨證
    if (window.parent !== window) window.parent.postMessage({ type: 'tcm-enter', go: id || null, bz: !!id }, '*');
    else location.href = '../' + (id ? '#' + encodeURIComponent(id) : '');
  }
  function openDisease(id) {
    listEl.querySelectorAll('.zz-dz').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    showReport(id);
  }
  /* ---------- 選一系：鏡頭移過去，相關臟腑亮起 ---------- */
  // 鏡頭沿著球面繞過去（不會穿過身體），依時間平滑
  let zfly = null, lastT = 0;
  const wide = () => stage.clientWidth > stage.clientHeight;   // 電腦 16:9：兩側是清單與報告單，不用把人往上推
  const HOME_T = V3(0, -1.6, 0), HOME_P = V3(0, -0.9, 33), HOME_TW = V3(0, -0.3, 0), HOME_PW = V3(0, 0.4, 33);
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
    // 鏡頭不跟著移：人一直在正中間、全身入鏡
    controls.autoRotate = false;
    drawList();
  }

  let jjBefore = true, bonesBefore = false, organsBefore = false, merBefore = true, ptBefore = true;
  function setMode(v) {
    if (on === v) return;
    on = v;
    peg.setAttribute('aria-pressed', String(on));
    stage.classList.toggle('zz-on', on);
    glows.visible = on;
    if (on) {
      L.select(null);
      bonesBefore = L.layers.skeleton.visible;
      organsBefore = L.layers.organs.visible;
      L.layers.organs.visible = false;   // 病證區域只看皮膚：不顯示臟腑、骨頭、腦
      L.layers.skeleton.visible = false;
      jjBefore = !!(L.layers.jingjin && L.layers.jingjin.visible);
      if (L.layers.jingjin) L.layers.jingjin.visible = false;
      merBefore = view.showMeridians;
      ptBefore = view.showPoints;
      view.showMeridians = false; L.meridianGroup.visible = false;
      view.showPoints = false; L.pointsObj.visible = false;
      L.organLook.fade = 1;
      cur = null;
      sysEl.querySelectorAll('.zz-chip.active').forEach(b => b.classList.remove('active'));
      Object.values(pinEls).forEach(b => b.classList.remove('active'));
      drawList();
      showReport(null);
      controls.autoRotate = false;
      wide() ? flyTo(HOME_TW, HOME_PW) : flyTo(HOME_T, HOME_P);
      lockOrbit(true);
    } else {
      lockOrbit(false);
      view.showMeridians = merBefore; L.meridianGroup.visible = merBefore;
      view.showPoints = ptBefore; L.pointsObj.visible = ptBefore;
      L.layers.skeleton.visible = bonesBefore;
      L.layers.organs.visible = organsBefore;
      if (L.layers.jingjin) L.layers.jingjin.visible = jjBefore;
      L.organLook.keep = null; L.organLook.glow = null; L.organLook.fade = 1;
      hideReport();
      zfly = null;
      L.reset();
    }
  }
  // 病證區域：只能左右轉（不能上下翻、縮放、平移）
  let polarBefore = null;
  function lockOrbit(v) {
    view.lockOrbit = v;
    controls.enablePan = !v;
    if (v) {
      polarBefore = [controls.minPolarAngle, controls.maxPolarAngle];
      const ph = Math.atan2(Math.hypot((wide() ? HOME_PW : HOME_P).x, (wide() ? HOME_PW : HOME_P).z), (wide() ? HOME_PW : HOME_P).y - (wide() ? HOME_TW : HOME_T).y);
      controls.minPolarAngle = controls.maxPolarAngle = ph;
    } else if (polarBefore) {
      [controls.minPolarAngle, controls.maxPolarAngle] = polarBefore;
      polarBefore = null;
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

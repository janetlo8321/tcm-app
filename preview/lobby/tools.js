/* =========================================================
 * 經絡銅人・左側工具列
 *   透明／不透   切換銅人皮膚
 *   圖層         皮膚、骨骼、臟腑、經絡、穴位、骨度分寸
 *   光標         點身上任一處 → 顯示最近的穴位
 *   畫筆         在畫面上手寫（離開畫筆時清除）
 *   標注         點身上加一個標注（存在這台裝置，點標注可刪除）
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { stage, camera, canvas, view, points: PT, bodyDepth, bodyShell } = L;

  const ICON = {
    skin: '<path d="M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm-6 18v-5c0-3 2.5-5 6-5s6 2 6 5v5"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6L5 3Z"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4Z"/><path d="M14 6l3 3"/>',
    note: '<path d="M6 21V4h11l-2 4 2 4H6"/>'
  };
  const svg = p => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  const bar = document.createElement('nav');
  bar.className = 'toolbar';
  bar.setAttribute('aria-label', '工具');
  const mk = (key, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.dataset.key = key;
    b.innerHTML = svg(ICON[key]) + `<span>${label}</span>`;
    bar.appendChild(b);
    return b;
  };
  const bSkin = mk('skin', '透明');
  const bLayers = mk('layers', '圖層');
  const bCursor = mk('cursor', '光標');
  const bPen = mk('pen', '畫筆');
  const bNote = mk('note', '標注');
  stage.appendChild(bar);

  /* ---------- 透明／不透 ---------- */
  bSkin.addEventListener('click', () => {
    view.opaqueTarget = view.opaqueTarget > 0.5 ? 0 : 1;
    bSkin.querySelector('span').textContent = view.opaqueTarget > 0.5 ? '不透' : '透明';
    bSkin.classList.toggle('on', view.opaqueTarget > 0.5);
  });

  /* ---------- 圖層 ---------- */
  const panel = document.createElement('div');
  panel.className = 'layer-panel';
  const LAYERS = [
    ['皮膚', () => bodyShell.visible, v => { bodyShell.visible = v; bodyDepth.visible = v; }],
    ['骨骼', () => L.layers.skeleton.visible, v => { L.layers.skeleton.visible = v; }],
    ['臟腑', () => L.layers.organs.visible, v => { L.layers.organs.visible = v; }],
    ['顱面骨・咽喉', () => L.layers.face.visible, v => { L.layers.face.visible = v; }],
    ['經筋（左半身）', () => !!(L.layers.jingjin && L.layers.jingjin.visible), v => { if (L.layers.jingjin) L.layers.jingjin.visible = v; }],
    ['經絡', () => view.showMeridians, v => { view.showMeridians = v; L.meridianGroup.visible = v; }],
    ['穴位', () => view.showPoints, v => { view.showPoints = v; L.pointsObj.visible = v; }],
    ['穴道名', () => view.showPointNames, v => { view.showPointNames = v; if (v && !view.showPoints) { view.showPoints = true; L.pointsObj.visible = true; } }],
    ['骨度分寸', () => L.layers.rulers.visible, v => { L.layers.rulers.visible = v; }]
  ];
  const boxes = [];
  LAYERS.forEach(([name, get, set]) => {
    const row = document.createElement('label');
    row.className = 'layer-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = get();
    boxes.push([cb, get]);
    cb.addEventListener('change', () => { set(cb.checked); boxes.forEach(([c, g]) => { c.checked = g(); }); });
    row.append(cb, document.createTextNode(name));
    panel.appendChild(row);
  });
  stage.appendChild(panel);
  bLayers.addEventListener('click', e => {
    e.stopPropagation();
    panel.querySelectorAll('input').forEach((cb, i) => { cb.checked = LAYERS[i][1](); });
    panel.classList.toggle('show');
    bLayers.classList.toggle('on', panel.classList.contains('show'));
  });
  stage.addEventListener('pointerdown', e => {
    if (!panel.contains(e.target) && e.target !== bLayers && !bLayers.contains(e.target)) {
      panel.classList.remove('show');
      bLayers.classList.remove('on');
    }
  });

  /* ---------- 模式：光標／畫筆／標注（一次一種） ---------- */
  let mode = null;
  const modeBtns = { cursor: bCursor, pen: bPen, note: bNote };
  function setMode(m) {
    if (mode === 'pen' && m !== 'pen') clearInk();
    mode = mode === m ? null : m;
    Object.entries(modeBtns).forEach(([k, b]) => b.classList.toggle('on', k === mode));
    ink.classList.toggle('show', mode === 'pen');
    penBar.classList.toggle('show', mode === 'pen');
    if (mode !== 'cursor') card.classList.remove('show');
    if (mode === 'cursor') L.toast('光標：點身上任一處看最近的穴位', 1800);
    if (mode === 'note') L.toast('標注：點身上要標注的位置', 1800);
  }
  bCursor.addEventListener('click', () => setMode('cursor'));
  bPen.addEventListener('click', () => setMode('pen'));
  bNote.addEventListener('click', () => setMode('note'));

  /* ---------- 光標：最近的穴位 ---------- */
  const card = document.createElement('div');
  card.className = 'pt-card';
  stage.appendChild(card);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function nearestPoint(cx, cy, tol) {
    const r = canvas.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    let best = null, bd = tol;
    for (const o of PT) {
      if (_w.subVectors(camera.position, o.p).normalize().dot(o.n) < (view.opaque > 0.5 ? 0.05 : -0.3)) continue;
      _v.copy(o.p).project(camera);
      if (_v.z > 1) continue;
      const d = Math.hypot((_v.x + 1) / 2 * r.width - x, (1 - _v.y) / 2 * r.height - y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function showCard(o, cx, cy) {
    const r = stage.getBoundingClientRect();
    card.innerHTML = '';
    const nm = document.createElement('b');
    nm.textContent = o.name;
    const code = document.createElement('span');
    code.textContent = `${o.m.id}${o.no}・${o.m.name}`;
    card.append(nm, code);
    card.style.left = `${Math.min(r.width - 170, Math.max(8, cx - r.left + 12))}px`;
    card.style.top = `${Math.max(70, cy - r.top - 56)}px`;
    card.classList.add('show');
  }
  L.hooks.tap.push((x, y, type) => {
    if (mode === 'cursor') {
      const o = nearestPoint(x, y, type === 'touch' ? 40 : 28);
      if (o) { showCard(o, x, y); L.select(o.m.id); }
      else card.classList.remove('show');
      return true;
    }
    if (mode === 'note') { addNoteAt(x, y); return true; }
    return false;
  });
  L.hooks.hover.push(e => {
    if (mode !== 'cursor') return false;
    const o = nearestPoint(e.clientX, e.clientY, 22);
    if (o) showCard(o, e.clientX, e.clientY);
    return true;
  });

  /* ---------- 畫筆 ---------- */
  const ink = document.createElement('canvas');
  ink.className = 'ink';
  stage.appendChild(ink);
  const penBar = document.createElement('div');
  penBar.className = 'pen-bar';
  const COLORS = ['#ffd84a', '#ff6a4a', '#8fdccb', '#ffffff'];
  let penColor = COLORS[0];
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (i === 0 ? ' on' : '');
    b.style.background = c;
    b.setAttribute('aria-label', '顏色');
    b.addEventListener('click', () => {
      penColor = c;
      penBar.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === b));
    });
    penBar.appendChild(b);
  });
  const clr = document.createElement('button');
  clr.type = 'button';
  clr.className = 'pen-clear';
  clr.textContent = '清除';
  clr.addEventListener('click', clearInk);
  penBar.appendChild(clr);
  stage.appendChild(penBar);

  const ictx = ink.getContext('2d');
  function sizeInk() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    ink.width = stage.clientWidth * dpr;
    ink.height = stage.clientHeight * dpr;
    ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function clearInk() { ictx.clearRect(0, 0, ink.width, ink.height); }
  new ResizeObserver(sizeInk).observe(stage);
  sizeInk();
  let drawing = null;
  ink.addEventListener('pointerdown', e => {
    ink.setPointerCapture(e.pointerId);
    const r = ink.getBoundingClientRect();
    drawing = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  ink.addEventListener('pointermove', e => {
    if (!drawing) return;
    const r = ink.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    ictx.strokeStyle = penColor;
    ictx.lineWidth = 3;
    ictx.lineCap = 'round';
    ictx.lineJoin = 'round';
    ictx.shadowColor = penColor;
    ictx.shadowBlur = 6;
    ictx.beginPath();
    ictx.moveTo(drawing.x, drawing.y);
    ictx.lineTo(x, y);
    ictx.stroke();
    drawing = { x, y };
  });
  const endDraw = () => { drawing = null; };
  ink.addEventListener('pointerup', endDraw);
  ink.addEventListener('pointercancel', endDraw);

  /* ---------- 標注 ---------- */
  const NOTE_KEY = 'tcm-lobby-notes-v1';
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(NOTE_KEY) || '[]'); } catch (e) { notes = []; }
  const saveNotes = () => { try { localStorage.setItem(NOTE_KEY, JSON.stringify(notes)); } catch (e) { /* 無法儲存時只在這次顯示 */ } };
  const noteLayer = document.createElement('div');
  noteLayer.className = 'notes';
  stage.appendChild(noteLayer);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function addNoteAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(bodyDepth, false)[0];
    if (!hit) { L.toast('請點在身體上'); return; }
    const text = window.prompt('標注內容', '');
    if (!text) return;
    const n = hit.face ? hit.face.normal.clone().transformDirection(bodyDepth.matrixWorld) : new THREE.Vector3(0, 0, 1);
    if (n.dot(ray.ray.direction) > 0) n.negate();
    notes.push({ p: hit.point.toArray().map(v => +v.toFixed(3)), n: n.toArray().map(v => +v.toFixed(3)), text: text.slice(0, 40) });
    saveNotes();
    renderNotes();
  }
  function renderNotes() {
    noteLayer.innerHTML = '';
    notes.forEach((nt, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'note';
      el.textContent = nt.text;
      el.addEventListener('click', () => {
        if (window.confirm(`刪除標注「${nt.text}」？`)) { notes.splice(i, 1); saveNotes(); renderNotes(); }
      });
      nt.el = el;
      nt.pv = new THREE.Vector3().fromArray(nt.p);
      nt.nv = new THREE.Vector3().fromArray(nt.n);
      noteLayer.appendChild(el);
    });
  }
  renderNotes();
  L.hooks.frame.push(() => {
    if (!notes.length) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    notes.forEach(nt => {
      const facing = _w.subVectors(camera.position, nt.pv).normalize().dot(nt.nv);
      _v.copy(nt.pv).project(camera);
      const vis = _v.z < 1 && facing > -0.1;
      nt.el.style.display = vis ? '' : 'none';
      if (vis) nt.el.style.transform = `translate(${((_v.x + 1) / 2 * W).toFixed(1)}px,${((1 - _v.y) / 2 * H).toFixed(1)}px)`;
    });
  });

  L.tools = { setMode };
})();

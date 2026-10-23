/* =========================================================
 * 中醫方證資料庫・大廳（經絡銅人）
 * Three.js r128 · OrbitControls
 *
 * - 半透明銅色身體（只畫最外層表面，接縫不會透出來）
 * - 經絡平時偏暗；滑鼠移上去或點一下：柔光亮起
 * - 點兩下：進入資訊介面（預留，尚未加入）→ window 事件 'tcm:open-meridian'
 * - 像地圖一樣分層顯示：全身只見經絡線 → 放大出現經絡名、主要穴位 → 再放大出現全部穴位與穴名
 * 穴位位置為示意：依經絡走向在骨度標記點之間平均分布
 * ========================================================= */
(() => {
  'use strict';

  const VERSION = 'v2.6.0';
  const UPDATED = '2026/10/23 18:46';
  const FIX_NO = 16;

  const $ = id => document.getElementById(id);
  const stage = $('stage'), wrap = $('canvas-wrap'), labelsEl = $('labels');
  const tipEl = $('tip'), selEl = $('sel'), toastEl = $('toast'), hintEl = $('hint'), chipsEl = $('chips');
  $('ver').textContent = `${VERSION} 預覽・${UPDATED}・第 ${FIX_NO} 次修正`;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  hintEl.textContent = coarse
    ? '單指旋轉 · 雙指縮放 · 點一下亮起 · 點兩下進入'
    : '拖曳旋轉 · 滾輪縮放 · 右鍵平移 · 點一下亮起 · 點兩下進入';

  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp01 = x => Math.min(1, Math.max(0, x));
  // e0 > e1 也可以（距離越近越大）
  const ss = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  /* ---------- 場景 ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  wrap.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 456;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 210, 10, 128, 230, 300);
    grd.addColorStop(0, '#221a12');
    grd.addColorStop(0.45, '#110d09');
    grd.addColorStop(1, '#050403');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 456);
    return new THREE.CanvasTexture(c);
  })();

  const camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.05, 2000);
  const HOME_POS = V3(0, 0.4, 33);
  const HOME_TARGET = V3(0, -0.3, 0);
  camera.position.copy(HOME_POS);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.copy(HOME_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.panSpeed = 0.8;
  controls.screenSpacePanning = true;
  controls.enableZoom = false;            // 滾輪、雙指改由下面「往手指／游標方向縮放」處理
  controls.minDistance = 2.2;
  controls.maxDistance = 60;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI - 0.15;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  /* ---------- 銅人身體 ---------- */
  // 以中軸路徑＋每段橢圓截面 [左右, 前後] 掃出身體各部位
  function prof(list) {
    return { path: list.map(r => [0, r[0], r[3]]), radii: list.map(r => [r[1], r[2]]) };
  }
  const BODY_PARTS = [
    { name: 'torso', rings: 64, ...prof([
      // [y, 左右半徑, 前後半徑, 中心 z]
      [-1.52, 0.55, 0.45, -0.02], [-1.3, 1.15, 0.78, -0.05], [-0.8, 1.52, 0.95, -0.08],
      [-0.1, 1.55, 0.92, -0.02], [0.7, 1.3, 0.82, 0.02], [1.7, 1.36, 0.86, 0.04],
      [2.7, 1.52, 0.95, 0.04], [3.6, 1.62, 1.02, 0.02], [4.3, 1.72, 0.92, -0.02],
      [4.75, 1.55, 0.72, -0.06], [5.05, 1.0, 0.58, -0.08], [5.35, 0.52, 0.48, -0.08]
    ]) },
    { name: 'neck', rings: 12,
      path: [[0, 5.2, -0.1], [0, 5.8, -0.06], [0, 6.4, -0.02]],
      radii: [[0.5, 0.5], [0.45, 0.46], [0.44, 0.44]] },
    { name: 'head', rings: 30, ...prof([
      [6.0, 0.12, 0.1, 0.5], [6.15, 0.42, 0.42, 0.42], [6.45, 0.62, 0.68, 0.26],
      [6.8, 0.72, 0.86, 0.1], [7.15, 0.8, 0.94, 0.03], [7.55, 0.82, 0.95, -0.02],
      [7.9, 0.7, 0.82, -0.05], [8.12, 0.42, 0.52, -0.05], [8.22, 0.06, 0.08, -0.05]
    ]) },
    { name: 'nose', rings: 8,
      path: [[0, 7.1, 0.9], [0, 6.88, 1.08], [0, 6.74, 1.1]],
      radii: [[0.07, 0.06], [0.12, 0.1], [0.07, 0.05]] },
    { name: 'ear', rings: 8, mirror: true, noSnap: true,
      path: [[0.8, 7.32, -0.06], [0.84, 7.08, -0.08], [0.82, 6.82, -0.04]],
      radii: [[0.05, 0.12], [0.09, 0.2], [0.06, 0.12]] },
    { name: 'shoulder', rings: 12, mirror: true,
      path: [[1.1, 4.9, -0.06], [1.72, 4.6, -0.02], [1.95, 4.1, 0]],
      radii: [[0.42, 0.42], [0.56, 0.56], [0.5, 0.5]] },
    { name: 'arm', rings: 52, mirror: true,
      path: [[1.88, 4.45, 0], [2.05, 3.0, 0], [2.28, 1.65, 0.02], [2.5, 0.4, 0.08], [2.68, -0.8, 0.12]],
      radii: [[0.5, 0.5], [0.47, 0.46], [0.38, 0.36], [0.36, 0.32], [0.25, 0.18]] },
    { name: 'hand', rings: 16, mirror: true,
      path: [[2.69, -0.78, 0.12], [2.79, -1.3, 0.14], [2.86, -1.85, 0.14], [2.9, -2.22, 0.12]],
      radii: [[0.24, 0.13], [0.33, 0.14], [0.3, 0.11], [0.1, 0.05]] },
    { name: 'thumb', rings: 8, mirror: true,
      path: [[2.92, -0.95, 0.2], [3.05, -1.25, 0.26], [3.12, -1.55, 0.3]],
      radii: [[0.1, 0.09], [0.08, 0.07], [0.04, 0.04]] },
    { name: 'leg', rings: 70, mirror: true,
      path: [[0.8, -1.0, 0], [0.84, -2.8, 0.02], [0.8, -4.6, 0.08], [0.79, -5.5, -0.06], [0.77, -6.8, -0.04], [0.74, -8.5, 0]],
      radii: [[0.82, 0.84], [0.68, 0.7], [0.45, 0.5], [0.52, 0.6], [0.38, 0.42], [0.25, 0.27]] },
    { name: 'foot', rings: 14, mirror: true,
      path: [[0.74, -8.55, -0.32], [0.76, -8.62, 0.2], [0.8, -8.68, 0.8], [0.82, -8.7, 1.08]],
      radii: [[0.24, 0.22], [0.3, 0.2], [0.3, 0.12], [0.1, 0.06]] }
  ];

  function interpRadii(radii, u) {
    const f = u * (radii.length - 1);
    const i = Math.min(Math.floor(f), radii.length - 2);
    const k = f - i;
    return [
      radii[i][0] + (radii[i + 1][0] - radii[i][0]) * k,
      radii[i][1] + (radii[i + 1][1] - radii[i][1]) * k
    ];
  }

  const AX_Z = V3(0, 0, 1), AX_Y = V3(0, 1, 0);
  const SNAP_RINGS = [];   // 給經絡貼皮膚用
  const bodyPos = [], bodyNor = [], bodyIdx = [];

  function addPart(part, side) {
    const pts = part.path.map(p => V3(p[0] * side, p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const N = part.rings, S = 40;
    const pos = [], idx = [];
    const frames = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const c = curve.getPoint(u);
      const t = curve.getTangent(u).normalize();
      const n1 = new THREE.Vector3().crossVectors(t, AX_Z);
      if (n1.lengthSq() < 0.05) n1.crossVectors(t, AX_Y);
      n1.normalize();
      const n2 = new THREE.Vector3().crossVectors(n1, t).normalize();
      const [rx, rz] = interpRadii(part.radii, u);
      frames.push({ c, t, n1, n2, rx, rz });
      for (let k = 0; k < S; k++) {
        const a = (k / S) * Math.PI * 2;
        const v = c.clone().addScaledVector(n1, Math.cos(a) * rx).addScaledVector(n2, Math.sin(a) * rz);
        pos.push(v.x, v.y, v.z);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < S; k++) {
        const a = i * S + k, b = i * S + (k + 1) % S, c = (i + 1) * S + k, d = (i + 1) * S + (k + 1) % S;
        idx.push(a, c, b, b, c, d);
      }
    }
    // 兩端封口（獨立頂點，法線不會和側面互相抵消）
    [[0, -1], [N, 1]].forEach(([ri, dir]) => {
      const base = pos.length / 3;
      const f = frames[ri];
      pos.push(f.c.x, f.c.y, f.c.z);
      for (let k = 0; k < S; k++) {
        const j = (ri * S + k) * 3;
        pos.push(pos[j], pos[j + 1], pos[j + 2]);
      }
      for (let k = 0; k < S; k++) {
        const a = base + 1 + k, b = base + 1 + (k + 1) % S;
        if (dir > 0) idx.push(base, a, b); else idx.push(base, b, a);
      }
    });

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const off = bodyPos.length / 3;
    const nor = g.getAttribute('normal').array;
    for (let i = 0; i < pos.length; i++) { bodyPos.push(pos[i]); bodyNor.push(nor[i]); }
    idx.forEach(i => bodyIdx.push(i + off));
    g.dispose();

    if (!part.noSnap) frames.forEach(f => SNAP_RINGS.push(f));
  }
  BODY_PARTS.forEach(p => {
    addPart(p, 1);
    if (p.mirror) addPart(p, -1);
  });

  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(bodyPos, 3));
  bodyGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bodyNor, 3));
  bodyGeo.setIndex(bodyIdx);

  // 先只寫深度：之後只畫最外層皮膚，內部重疊的接縫不會透出
  const bodyDepth = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({
    colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  bodyDepth.renderOrder = 1;

  const bodyMat = new THREE.ShaderMaterial({
    uniforms: {
      uBronze: { value: new THREE.Color(0xcf9455) },
      uRim: { value: new THREE.Color(0xffdcaa) }
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uBronze; uniform vec3 uRim;
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 n = normalize(vN); vec3 v = normalize(vV);
        float f = 1.0 - abs(dot(n, v));
        float rim = pow(f, 2.4);
        float lam = abs(dot(n, normalize(vec3(-0.45, 0.75, 0.6))));
        vec3 col = uBronze * (0.1 + 0.26 * lam) + uBronze * rim * 1.3 + uRim * pow(f, 7.0) * 0.6;
        float a = 0.13 + 0.1 * lam + 0.66 * rim;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth
  });
  const bodyShell = new THREE.Mesh(bodyGeo, bodyMat);
  bodyShell.renderOrder = 2;
  scene.add(bodyDepth, bodyShell);

  // 底座光環
  const ringGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2;
      return V3(Math.cos(a), 0, Math.sin(a));
    })
  );
  const pedestal = new THREE.Group();
  [1.6, 2.5, 3.5].forEach((r, i) => {
    const l = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({
      color: 0xd6a66b, transparent: true, opacity: 0.22 - i * 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    l.scale.set(r, 1, r);
    pedestal.add(l);
  });
  pedestal.position.y = -8.95;
  scene.add(pedestal);

  // 浮塵
  const dust = (() => {
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 4 + Math.random() * 16, a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -10 + Math.random() * 22;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xd9b07a, size: 0.06, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  })();
  scene.add(dust);

  /* ---------- 貼皮膚：把任一點投到最近的身體表面 ---------- */
  const _d = new THREE.Vector3();
  function snapToSkin(p, off) {
    let best = null, bs = Infinity, ba = 0, bb = 0, bh = 0, bq = 1;
    for (const r of SNAP_RINGS) {
      _d.subVectors(p, r.c);
      const h = _d.dot(r.t), a = _d.dot(r.n1), b = _d.dot(r.n2);
      const q = Math.sqrt((a / r.rx) ** 2 + (b / r.rz) ** 2);
      const reff = (r.rx + r.rz) / 2;
      const s = h * h + ((q - 1) * reff) ** 2;
      if (s < bs) { bs = s; best = r; ba = a; bb = b; bh = h; bq = q; }
    }
    const r = best;
    if (bq < 1e-4) return { p: p.clone(), n: r.t.clone() };
    const out = r.c.clone().addScaledVector(r.t, bh)
      .addScaledVector(r.n1, ba / bq).addScaledVector(r.n2, bb / bq);
    const n = new THREE.Vector3()
      .addScaledVector(r.n1, (ba / bq) / (r.rx * r.rx))
      .addScaledVector(r.n2, (bb / bq) / (r.rz * r.rz)).normalize();
    out.addScaledVector(n, off);
    return { p: out, n };
  }

  /* ---------- 經絡與穴位 ----------
   * strokes：每條經絡一筆或數筆，頂點 [x, y, z, 穴號]（右側座標，左側自動鏡像）
   * 有穴號的頂點是定位點；兩定位點之間的穴位依長度平均分布
   * 穴名前加 * ＝ 常用要穴（中距離就先顯示）
   */
  const MERIDIANS = [
    { id: 'LU', short: '肺', name: '手太陰肺經', bilateral: true,
      points: '*中府 雲門 天府 俠白 *尺澤 孔最 *列缺 經渠 *太淵 魚際 *少商',
      strokes: [[[1.4, 4.35, 0.72, 1], [1.55, 4.7, 0.55, 2], [2.15, 3.6, 0.38, 3], [2.45, 1.65, 0.3, 5], [2.62, 0.5, 0.25], [2.8, -0.65, 0.2, 8], [2.82, -0.8, 0.18, 9], [2.95, -1.15, 0.2, 10], [3.12, -1.55, 0.28, 11]]] },
    { id: 'LI', short: '大腸', name: '手陽明大腸經', bilateral: true,
      points: '商陽 二間 三間 *合谷 陽谿 偏歷 溫溜 下廉 上廉 手三里 *曲池 肘髎 手五里 臂臑 *肩髃 巨骨 天鼎 扶突 口禾髎 *迎香',
      strokes: [[[2.98, -2.15, 0.0, 1], [2.95, -1.2, 0.02, 4], [2.86, -0.82, -0.02, 5], [2.5, 1.65, -0.12, 11], [2.4, 2.0, -0.2, 12], [2.15, 3.4, -0.15, 14], [1.98, 4.55, 0.1, 15], [1.15, 5.0, -0.2, 16], [0.45, 5.6, 0.25, 17], [0.42, 5.95, 0.32, 18], [0.14, 6.65, 0.95, 19], [0.17, 6.82, 0.95, 20]]] },
    { id: 'ST', short: '胃', name: '足陽明胃經', bilateral: true,
      points: '承泣 四白 巨髎 *地倉 大迎 *頰車 下關 頭維 人迎 水突 氣舍 缺盆 氣戶 庫房 屋翳 膺窗 乳中 乳根 不容 承滿 梁門 關門 太乙 滑肉門 *天樞 外陵 大巨 水道 歸來 氣衝 髀關 伏兔 陰市 梁丘 犢鼻 *足三里 上巨虛 條口 下巨虛 *豐隆 解谿 衝陽 陷谷 *內庭 厲兌',
      strokes: [
        [[0.32, 7.05, 0.92, 1], [0.32, 6.92, 0.95, 2], [0.3, 6.75, 0.95, 3], [0.25, 6.5, 0.92, 4], [0.45, 6.2, 0.6, 5], [0.62, 6.45, 0.35, 6], [0.72, 6.95, 0.4, 7], [0.55, 7.8, 0.62, 8]],
        [[0.4, 5.9, 0.38, 9], [0.42, 5.4, 0.42], [0.55, 5.05, 0.55, 11], [0.75, 5.0, 0.62, 12], [0.85, 4.7, 0.72, 13], [0.85, 3.6, 1.0, 17], [0.85, 3.2, 1.0, 18], [0.65, 2.6, 0.98, 19], [0.45, 0.75, 0.86, 25], [0.48, -0.95, 0.88, 30], [0.95, -1.6, 0.75, 31], [0.92, -2.9, 0.72, 32], [0.95, -4.15, 0.48, 34], [0.9, -4.65, 0.5, 35], [0.95, -5.3, 0.5, 36], [0.76, -8.3, 0.3, 41], [0.8, -8.55, 0.6, 42], [0.72, -8.64, 0.95, 44], [0.74, -8.68, 1.08, 45]]
      ] },
    { id: 'SP', short: '脾', name: '足太陰脾經', bilateral: true,
      points: '*隱白 大都 太白 *公孫 商丘 *三陰交 漏谷 地機 *陰陵泉 *血海 箕門 衝門 府舍 腹結 大橫 腹哀 食竇 天谿 胸鄉 周榮 大包',
      strokes: [[[0.6, -8.68, 1.0, 1], [0.55, -8.62, 0.45, 4], [0.5, -8.3, 0.12, 5], [0.47, -7.25, 0.05, 6], [0.38, -5.0, 0.12, 9], [0.42, -4.0, 0.32, 10], [0.38, -2.8, 0.38, 11], [0.72, -1.05, 0.82, 12], [1.0, 0.75, 0.78, 15], [1.1, 1.9, 0.82, 16], [1.35, 3.0, 0.7, 17], [1.42, 4.15, 0.68, 20], [1.55, 2.6, 0.1, 21]]] },
    { id: 'HT', short: '心', name: '手少陰心經', bilateral: true,
      points: '*極泉 青靈 *少海 靈道 通里 陰郄 *神門 少府 少衝',
      strokes: [[[1.72, 4.0, 0.12, 1], [1.85, 2.8, 0.2, 2], [1.98, 1.65, 0.18, 3], [2.42, -0.45, 0.12, 4], [2.5, -0.8, 0.1, 7], [2.6, -1.4, 0.12, 8], [2.6, -2.0, 0.06, 9]]] },
    { id: 'SI', short: '小腸', name: '手太陽小腸經', bilateral: true,
      points: '少澤 前谷 *後谿 腕骨 陽谷 養老 支正 *小海 肩貞 臑俞 *天宗 秉風 曲垣 肩外俞 肩中俞 天窗 天容 顴髎 *聽宮',
      strokes: [[[2.6, -2.0, -0.04, 1], [2.58, -1.2, -0.06, 3], [2.5, -0.85, -0.1, 5], [2.45, -0.6, -0.14, 6], [1.98, 1.65, -0.22, 8], [1.65, 3.9, -0.55, 9], [1.3, 4.4, -0.75, 10], [0.95, 3.8, -0.95, 11], [1.05, 4.7, -0.6, 12], [0.75, 4.8, -0.65, 13], [0.55, 5.05, -0.6, 14], [0.45, 5.25, -0.45, 15], [0.45, 6.0, -0.12, 16], [0.55, 6.3, 0.2, 17], [0.55, 6.85, 0.75, 18], [0.75, 7.0, 0.22, 19]]] },
    { id: 'BL', short: '膀胱', name: '足太陽膀胱經', bilateral: true,
      points: '*睛明 攢竹 眉衝 曲差 五處 承光 通天 絡卻 玉枕 *天柱 大杼 風門 *肺俞 厥陰俞 *心俞 督俞 膈俞 *肝俞 膽俞 *脾俞 胃俞 三焦俞 *腎俞 氣海俞 大腸俞 關元俞 小腸俞 膀胱俞 中膂俞 白環俞 上髎 次髎 中髎 下髎 會陽 承扶 殷門 浮郄 委陽 *委中 附分 魄戶 膏肓 神堂 譩譆 膈關 魂門 陽綱 意舍 胃倉 肓門 志室 胞肓 秩邊 合陽 承筋 *承山 飛揚 跗陽 *崑崙 僕參 申脈 金門 京骨 束骨 足通谷 *至陰',
      strokes: [
        [[0.13, 7.2, 0.92, 1], [0.2, 7.42, 0.92, 2], [0.22, 7.9, 0.68, 4], [0.25, 8.15, 0.2, 7], [0.24, 7.85, -0.55, 8], [0.22, 7.45, -0.85, 9], [0.22, 6.6, -0.55, 10], [0.42, 5.2, -0.55, 11], [0.42, 4.6, -0.85, 13], [0.42, 3.2, -1.0, 17], [0.42, 0.75, -0.82, 23], [0.42, -0.65, -0.95, 30], [0.3, -0.85, -0.95, 31], [0.18, -1.2, -0.8, 34], [0.12, -1.35, -0.65, 35], [0.8, -1.5, -0.72, 36], [0.82, -2.8, -0.72, 37], [0.95, -4.4, -0.4, 39], [0.8, -4.6, -0.45, 40]],
        [[0.85, 5.1, -0.6, 41], [0.85, 4.55, -0.85, 42], [0.85, 3.1, -1.0, 46], [0.85, 0.75, -0.82, 52], [0.85, -0.6, -0.95, 54], [0.85, -2.8, -0.75], [0.8, -5.0, -0.55, 55], [0.8, -6.05, -0.6, 57], [0.9, -6.8, -0.45, 58], [0.95, -8.3, -0.2, 60], [0.97, -8.55, 0.0, 62], [0.98, -8.65, 0.5, 64], [0.98, -8.68, 0.95, 67]]
      ] },
    { id: 'KI', short: '腎', name: '足少陰腎經', bilateral: true,
      points: '*湧泉 然谷 *太谿 大鐘 水泉 照海 *復溜 交信 築賓 陰谷 橫骨 大赫 氣穴 四滿 中注 肓俞 商曲 石關 陰都 腹通谷 幽門 步廊 神封 靈墟 神藏 彧中 俞府',
      strokes: [[[0.72, -8.87, 0.45, 1], [0.52, -8.6, 0.3, 2], [0.5, -8.3, -0.12, 3], [0.5, -7.4, -0.15, 7], [0.45, -6.5, -0.05, 9], [0.4, -4.6, -0.25, 10], [0.3, -2.8, -0.05], [0.18, -0.85, 0.88, 11], [0.16, 0.75, 0.86, 16], [0.16, 2.45, 0.95, 21], [0.62, 3.0, 1.0, 22], [0.58, 4.8, 0.75, 27]]] },
    { id: 'PC', short: '心包', name: '手厥陰心包經', bilateral: true,
      points: '天池 天泉 *曲澤 郄門 間使 *內關 *大陵 *勞宮 中衝',
      strokes: [[[1.05, 3.6, 0.98, 1], [1.7, 4.0, 0.4, 2], [2.28, 1.65, 0.38, 3], [2.5, 0.0, 0.27, 5], [2.62, -0.55, 0.22, 6], [2.68, -0.8, 0.18, 7], [2.82, -1.4, 0.16, 8], [2.88, -2.2, 0.08, 9]]] },
    { id: 'SJ', short: '三焦', name: '手少陽三焦經', bilateral: true,
      points: '關衝 液門 中渚 陽池 *外關 *支溝 會宗 三陽絡 四瀆 天井 清冷淵 消濼 臑會 肩髎 天髎 天牖 *翳風 瘈脈 顱息 角孫 耳門 耳和髎 *絲竹空',
      strokes: [[[2.78, -2.1, -0.05, 1], [2.75, -1.3, -0.1, 3], [2.68, -0.82, -0.17, 4], [2.6, -0.5, -0.22, 5], [2.32, 1.7, -0.38, 10], [2.05, 3.6, -0.42, 13], [1.95, 4.4, -0.4, 14], [0.95, 4.9, -0.4, 15], [0.55, 6.1, -0.3, 16], [0.7, 6.65, -0.15, 17], [0.82, 7.2, -0.35, 19], [0.8, 7.55, -0.05, 20], [0.75, 7.1, 0.2, 21], [0.65, 7.15, 0.5, 22], [0.55, 7.35, 0.8, 23]]] },
    { id: 'GB', short: '膽', name: '足少陽膽經', bilateral: true,
      points: '瞳子髎 聽會 上關 頷厭 懸顱 懸釐 曲鬢 率谷 天衝 浮白 頭竅陰 完骨 本神 陽白 頭臨泣 目窗 正營 承靈 腦空 *風池 *肩井 淵腋 輒筋 日月 京門 帶脈 五樞 維道 居髎 *環跳 *風市 中瀆 膝陽關 *陽陵泉 陽交 外丘 光明 陽輔 *懸鐘 丘墟 *足臨泣 地五會 俠谿 足竅陰',
      strokes: [[[0.55, 7.18, 0.75, 1], [0.75, 6.9, 0.25, 2], [0.75, 7.1, 0.45, 3], [0.72, 7.65, 0.38, 4], [0.78, 7.35, 0.25, 7], [0.75, 7.75, -0.1, 8], [0.7, 7.5, -0.4, 10], [0.65, 6.75, -0.4, 12], [0.5, 7.85, 0.6, 13], [0.35, 7.45, 0.88, 14], [0.35, 7.95, 0.6, 15], [0.42, 8.05, -0.2, 18], [0.4, 7.0, -0.75, 19], [0.4, 6.7, -0.62, 20], [0.95, 5.0, -0.25, 21], [1.55, 3.8, 0.0, 22], [1.4, 3.4, 0.35, 23], [0.95, 2.6, 0.92, 24], [1.4, 1.6, -0.3, 25], [1.35, 0.9, 0.15, 26], [1.4, -0.5, 0.25, 29], [1.3, -0.95, -0.5, 30], [1.45, -2.8, 0.0, 31], [1.25, -4.4, 0.0, 33], [1.2, -5.0, 0.0, 34], [1.05, -7.6, 0.0, 39], [0.95, -8.35, 0.15, 40], [0.95, -8.6, 0.6, 41], [0.9, -8.68, 0.98, 44]]] },
    { id: 'LR', short: '肝', name: '足厥陰肝經', bilateral: true,
      points: '大敦 行間 *太衝 中封 蠡溝 中都 膝關 *曲泉 陰包 足五里 陰廉 急脈 *章門 *期門',
      strokes: [[[0.66, -8.66, 1.02, 1], [0.66, -8.64, 0.85, 2], [0.66, -8.55, 0.55, 3], [0.55, -8.3, 0.25, 4], [0.48, -7.0, 0.2, 5], [0.38, -4.6, 0.0, 8], [0.36, -1.6, 0.5, 11], [0.4, -1.1, 0.8, 12], [1.4, 2.2, 0.4, 13], [0.85, 2.85, 0.95, 14]]] },
    { id: 'REN', short: '任脈', name: '任脈', bilateral: false,
      points: '會陰 曲骨 中極 *關元 石門 *氣海 陰交 *神闕 水分 下脘 建里 *中脘 上脘 巨闕 鳩尾 中庭 *膻中 玉堂 紫宮 華蓋 璇璣 天突 廉泉 *承漿',
      strokes: [[[0, -1.48, 0.1, 1], [0, -0.88, 0.88, 2], [0, -0.25, 0.9, 4], [0, 0.75, 0.85, 8], [0, 1.75, 0.9, 12], [0, 2.9, 0.98, 15], [0, 3.6, 1.04, 17], [0, 5.15, 0.5, 22], [0, 5.8, 0.4, 23], [0, 6.3, 0.85, 24]]] },
    { id: 'DU', short: '督脈', name: '督脈', bilateral: false,
      points: '*長強 腰俞 腰陽關 *命門 懸樞 脊中 中樞 筋縮 至陽 靈台 神道 身柱 陶道 *大椎 啞門 *風府 腦戶 強間 後頂 *百會 前頂 囟會 上星 神庭 素髎 *水溝 兌端 齦交',
      strokes: [[[0, -1.38, -0.6, 1], [0, -0.5, -0.95, 2], [0, 0.7, -0.82, 4], [0, 2.6, -0.95, 9], [0, 5.3, -0.55, 14], [0, 6.45, -0.45, 15], [0, 6.6, -0.6, 16], [0, 7.6, -0.82, 18], [0, 8.21, 0, 20], [0, 7.95, 0.6, 22], [0, 7.55, 0.9, 24], [0, 6.88, 1.2, 25], [0, 6.62, 0.98, 26], [0, 6.52, 0.96, 27], [0, 6.45, 0.94, 28]]] }
  ];
  const byId = Object.fromEntries(MERIDIANS.map(m => [m.id, m]));

  const SUB = 14;          // 每段定位點之間的取樣數
  const SKIN_OFF = 0.045;  // 經絡浮在皮膚上的距離

  // 一筆經絡：定位點貼皮 → 曲線取樣 → 每個取樣再貼皮 → 平滑
  function traceStroke(stroke) {
    const anchors = stroke.map(v => snapToSkin(V3(v[0], v[1], v[2]), SKIN_OFF).p);
    const curve = new THREE.CatmullRomCurve3(anchors, false, 'centripetal');
    const M = (anchors.length - 1) * SUB;
    const ps = [], ns = [];
    for (let i = 0; i <= M; i++) {
      const s = snapToSkin(curve.getPoint(i / M), SKIN_OFF);
      ps.push(s.p); ns.push(s.n);
    }
    for (let pass = 0; pass < 3; pass++) {
      const prev = ps.map(p => p.clone());
      for (let i = 1; i < M; i++) {
        ps[i].copy(prev[i]).multiplyScalar(0.5).addScaledVector(prev[i - 1], 0.25).addScaledVector(prev[i + 1], 0.25);
      }
    }
    const cum = [0];
    for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + ps[i].distanceTo(ps[i - 1]));
    return { ps, ns, cum, anchorNos: stroke.map(v => v[3]) };
  }

  function atLength(tr, L) {
    const { ps, ns, cum } = tr;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < L) i++;
    const k = clamp01((L - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]));
    return {
      p: ps[i - 1].clone().lerp(ps[i], k),
      n: ns[i - 1].clone().lerp(ns[i], k).normalize()
    };
  }

  const mirror = v => V3(-v.x, v.y, v.z);

  const meridianGroup = new THREE.Group();
  scene.add(meridianGroup);

  const merVS = `
    attribute vec3 surfN; attribute float along;
    uniform float uRadius;
    varying float vFace; varying float vEdge; varying float vAlong;
    void main() {
      vec3 c = (modelMatrix * vec4(position, 1.0)).xyz;
      float d = distance(cameraPosition, c);
      float r = uRadius * clamp(d / 22.0, 0.04, 1.35);
      vec3 wn = normalize(mat3(modelMatrix) * normal);
      vec3 v = normalize(cameraPosition - c);
      vFace = smoothstep(-0.2, 0.25, dot(normalize(surfN), v));
      vEdge = abs(dot(wn, v));
      vAlong = along;
      gl_Position = projectionMatrix * viewMatrix * vec4(c + wn * r, 1.0);
    }`;
  const merFS = `
    uniform vec3 uColor; uniform float uOpacity; uniform float uBack; uniform float uSoft;
    uniform float uTime; uniform float uFlow;
    varying float vFace; varying float vEdge; varying float vAlong;
    void main() {
      float a = uOpacity * mix(uBack, 1.0, vFace);
      a *= mix(1.0, pow(vEdge, 1.6), uSoft);
      float wave = pow(0.5 + 0.5 * sin(vAlong * 2.6 - uTime * 2.2), 6.0);
      a *= 1.0 + uFlow * 0.6 * wave;
      gl_FragColor = vec4(uColor, a);
    }`;
  function merMat(radius, soft) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x7fd6c4) },
        uOpacity: { value: 0.3 },
        uBack: { value: 0.3 },
        uSoft: { value: soft },
        uRadius: { value: radius },
        uTime: { value: 0 },
        uFlow: { value: 0 }
      },
      vertexShader: merVS,
      fragmentShader: merFS,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
  }

  function tubeFor(ps, ns, cum, m) {
    const curve = new THREE.CatmullRomCurve3(ps, false, 'centripetal');
    const segs = ps.length - 1, radial = 6;
    const geo = new THREE.TubeGeometry(curve, segs, 0.001, radial, false);
    const count = geo.getAttribute('position').count;
    const surfN = new Float32Array(count * 3), along = new Float32Array(count);
    const total = cum[cum.length - 1];
    let j = 1;
    for (let i = 0; i <= segs; i++) {
      const L = (i / segs) * total;
      while (j < cum.length - 1 && cum[j] < L) j++;
      const n = ns[j];
      for (let r = 0; r <= radial; r++) {
        const vi = i * (radial + 1) + r;
        surfN[vi * 3] = n.x; surfN[vi * 3 + 1] = n.y; surfN[vi * 3 + 2] = n.z;
        along[vi] = L;
      }
    }
    geo.setAttribute('surfN', new THREE.BufferAttribute(surfN, 3));
    geo.setAttribute('along', new THREE.BufferAttribute(along, 1));
    const core = new THREE.Mesh(geo, m.coreMat);
    const halo = new THREE.Mesh(geo, m.haloMat);
    core.renderOrder = 4; halo.renderOrder = 3;
    meridianGroup.add(halo, core);
  }

  // 穴位（全部畫在同一組點裡）
  const PT = [];  // { m, no, name, major, p, n }
  MERIDIANS.forEach((m, mi) => {
    m.index = mi;
    m.coreMat = merMat(0.03, 0.5);
    m.haloMat = merMat(0.17, 1.0);
    m.haloMat.uniforms.uOpacity.value = 0;
    m.glow = 0;
    m.pick = [];
    m.ptNames = m.points.split(/\s+/).map(s => ({ name: s.replace('*', ''), major: s.startsWith('*') }));

    const sides = m.bilateral ? [1, -1] : [1];
    m.strokes.forEach(stroke => {
      const tr = traceStroke(stroke);
      // 這一筆裡的穴位
      const local = [];
      let prevNo = null, prevL = 0;
      tr.anchorNos.forEach((no, vi) => {
        if (no == null) return;
        const L = tr.cum[vi * SUB];
        if (prevNo != null) {
          for (let k = prevNo + 1; k < no; k++) {
            local.push({ no: k, at: atLength(tr, prevL + ((k - prevNo) / (no - prevNo)) * (L - prevL)) });
          }
        }
        local.push({ no, at: { p: tr.ps[vi * SUB].clone(), n: tr.ns[vi * SUB].clone() } });
        prevNo = no; prevL = L;
      });

      sides.forEach(s => {
        const ps = s > 0 ? tr.ps : tr.ps.map(mirror);
        const ns = s > 0 ? tr.ns : tr.ns.map(mirror);
        tubeFor(ps, ns, tr.cum, m);
        for (let i = 0; i < ps.length; i += 2) m.pick.push({ p: ps[i], n: ns[i] });
        local.forEach(({ no, at }) => {
          const info = m.ptNames[no - 1];
          if (!info) return;
          PT.push({
            m, no, name: info.name, major: info.major,
            p: s > 0 ? at.p : mirror(at.p), n: s > 0 ? at.n : mirror(at.n)
          });
        });
      });
    });
    const got = new Set(PT.filter(p => p.m === m).map(p => p.no));
    if (got.size !== m.ptNames.length) console.warn('[銅人] 穴位數不符', m.id, got.size, m.ptNames.length);
  });

  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.Float32BufferAttribute(PT.flatMap(o => [o.p.x, o.p.y, o.p.z]), 3));
  ptGeo.setAttribute('surfN', new THREE.Float32BufferAttribute(PT.flatMap(o => [o.n.x, o.n.y, o.n.z]), 3));
  ptGeo.setAttribute('aMer', new THREE.Float32BufferAttribute(PT.map(o => o.m.index), 1));
  ptGeo.setAttribute('aMajor', new THREE.Float32BufferAttribute(PT.map(o => (o.major ? 1 : 0)), 1));
  const ptMat = new THREE.ShaderMaterial({
    uniforms: {
      uMajor: { value: 0 }, uAll: { value: 0 },
      uHiMer: { value: -1 }, uHiMajor: { value: 0 }, uHiAll: { value: 0 },
      uScale: { value: 1000 },
      uColor: { value: new THREE.Color(0xf3e3c6) },
      uHiColor: { value: new THREE.Color(0xffd79a) }
    },
    vertexShader: `
      attribute vec3 surfN; attribute float aMer; attribute float aMajor;
      uniform float uMajor; uniform float uAll; uniform float uHiMer; uniform float uHiMajor; uniform float uHiAll; uniform float uScale;
      varying float vA; varying float vHi;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 v = normalize(cameraPosition - position);
        float face = smoothstep(-0.2, 0.3, dot(normalize(surfN), v));
        float hi = 1.0 - step(0.5, abs(aMer - uHiMer));
        float vis = aMajor > 0.5 ? max(uMajor, uAll) : uAll;
        vis = max(vis, hi * (aMajor > 0.5 ? max(uHiMajor, uHiAll) : uHiAll));
        vA = vis * mix(0.12, 1.0, face);
        vHi = hi;
        float s = (aMajor > 0.5 ? 0.12 : 0.09) * uScale / -mv.z;
        gl_PointSize = vA < 0.01 ? 0.0 : clamp(s, 2.0, 16.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uHiColor;
      varying float vA; varying float vHi;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r = length(q);
        if (r > 1.0) discard;
        float core = smoothstep(0.55, 0.2, r);
        float a = vA * (core * 0.9 + (1.0 - r) * 0.35);
        gl_FragColor = vec4(mix(uColor, uHiColor, vHi) * (0.75 + 0.4 * core), a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(ptGeo, ptMat);
  points.renderOrder = 5;
  scene.add(points);

  /* ---------- 選單 ---------- */
  const chipEls = {};
  let lastChip = null;
  MERIDIANS.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = m.short;
    b.title = m.name;
    b.addEventListener('click', () => {
      const now = performance.now();
      if (lastChip && lastChip.id === m.id && now - lastChip.t < 350) {
        lastChip = null;
        select(m.id);
        openMeridian(m.id);
        return;
      }
      lastChip = { id: m.id, t: now };
      select(selectedId === m.id ? null : m.id);
    });
    chipsEl.appendChild(b);
    chipEls[m.id] = b;
  });

  /* ---------- 點亮 / 進入 ---------- */
  let selectedId = null, hoveredId = null;

  function select(id) {
    selectedId = id || null;
    Object.entries(chipEls).forEach(([k, b]) => b.classList.toggle('active', k === selectedId));
    if (selectedId && chipEls[selectedId]) {
      chipEls[selectedId].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    const m = byId[selectedId];
    if (m) {
      selEl.innerHTML = '';
      selEl.append(m.name);
      const sm = document.createElement('small');
      sm.textContent = '點兩下進入';
      selEl.appendChild(sm);
      selEl.classList.add('show');
      controls.autoRotate = false;
    } else {
      selEl.classList.remove('show');
    }
  }

  // 資訊介面：先預留，之後接上
  let toastTimer = null;
  function openMeridian(id) {
    const m = byId[id];
    if (!m) return;
    window.dispatchEvent(new CustomEvent('tcm:open-meridian', { detail: { id, name: m.name } }));
    toastEl.textContent = `${m.name}・資訊介面預留中`;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  function resetView() {
    select(null);
    fly.active = true;
  }
  $('btn-reset').addEventListener('click', resetView);

  /* ---------- 螢幕座標挑選經絡 ---------- */
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function pickMeridian(cx, cy, tol) {
    const r = canvas.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    let best = null, bd = tol;
    for (const m of MERIDIANS) {
      for (const s of m.pick) {
        _v.copy(s.p).project(camera);
        if (_v.z > 1) continue;
        const sx = (_v.x + 1) / 2 * r.width, sy = (1 - _v.y) / 2 * r.height;
        let dd = Math.hypot(sx - x, sy - y);
        if (_w.subVectors(camera.position, s.p).dot(s.n) < 0) dd += tol * 0.5;  // 背面的稍微不優先
        if (dd < bd) { bd = dd; best = m.id; }
      }
    }
    return best;
  }

  function setHover(id, e) {
    hoveredId = id;
    wrap.classList.toggle('is-hover', !!id);
    if (id && e && id !== selectedId) {
      const r = stage.getBoundingClientRect();
      tipEl.textContent = byId[id].name;
      tipEl.style.left = `${e.clientX - r.left}px`;
      tipEl.style.top = `${e.clientY - r.top}px`;
      tipEl.classList.add('show');
    } else {
      tipEl.classList.remove('show');
    }
  }

  /* ---------- 點一下／點兩下 ---------- */
  const downs = new Set();
  let gesture = null, lastTap = null;
  canvas.addEventListener('pointerdown', e => {
    downs.add(e.pointerId);
    if (downs.size === 1) gesture = { x: e.clientX, y: e.clientY, t: performance.now(), multi: false };
    else if (gesture) gesture.multi = true;
  });
  canvas.addEventListener('pointerup', e => {
    downs.delete(e.pointerId);
    if (!gesture || downs.size > 0) return;
    const g = gesture;
    gesture = null;
    if (g.multi) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8 || performance.now() - g.t > 500) return;
    onTap(e.clientX, e.clientY, e.pointerType);
  });
  canvas.addEventListener('pointercancel', e => { downs.delete(e.pointerId); gesture = null; });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) { if (hoveredId) setHover(null); return; }
    setHover(pickMeridian(e.clientX, e.clientY, 14), e);
  });
  canvas.addEventListener('pointerleave', () => setHover(null));

  function onTap(x, y, type) {
    const id = pickMeridian(x, y, type === 'touch' ? 26 : 16);
    const now = performance.now();
    if (id && lastTap && lastTap.id === id && now - lastTap.t < 380 && Math.hypot(x - lastTap.x, y - lastTap.y) < 36) {
      lastTap = null;
      select(id);
      openMeridian(id);
      return;
    }
    lastTap = { t: now, x, y, id };
    select(id);
  }

  /* ---------- 縮放：往游標／雙指中心縮放（像地圖） ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane();
  const _dir = new THREE.Vector3(), _P = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const BOX = new THREE.Box3(V3(-4, -9.5, -2.5), V3(4, 8.8, 2.5));
  const _cl = new THREE.Vector3(), _corr = new THREE.Vector3();

  function clampTarget() {
    BOX.clampPoint(controls.target, _cl);
    _corr.subVectors(_cl, controls.target);
    controls.target.add(_corr);
    camera.position.add(_corr);
  }

  function zoomAt(cx, cy, k) {
    const d = camera.position.distanceTo(controls.target);
    const nd = Math.min(controls.maxDistance, Math.max(controls.minDistance, d * k));
    k = nd / d;
    if (Math.abs(k - 1) < 1e-5) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    camera.getWorldDirection(_dir);
    plane.setFromNormalAndCoplanarPoint(_dir, controls.target);
    if (!ray.ray.intersectPlane(plane, _P)) return;
    camera.position.sub(_P).multiplyScalar(k).add(_P);
    controls.target.sub(_P).multiplyScalar(k).add(_P);
    clampTarget();
    userActed();
  }

  function panBy(dx, dy) {
    const d = camera.position.distanceTo(controls.target);
    const wpp = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / canvas.clientHeight;
    _a.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-dx * wpp);
    _b.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(dy * wpp);
    _a.add(_b);
    camera.position.add(_a);
    controls.target.add(_a);
    clampTarget();
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  // 雙指：自己處理縮放＋平移，單指交給 OrbitControls 旋轉
  let pinch = null;
  const touchState = e => {
    const a = e.touches[0], b = e.touches[1];
    return {
      cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2,
      d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    };
  };
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length >= 2) {
      e.preventDefault(); e.stopPropagation();
      pinch = touchState(e);
      userActed();
    }
  }, { capture: true, passive: false });
  wrap.addEventListener('touchmove', e => {
    if (e.touches.length >= 2 && pinch) {
      e.preventDefault(); e.stopPropagation();
      const s = touchState(e);
      if (s.d > 10 && pinch.d > 10) zoomAt(s.cx, s.cy, pinch.d / s.d);
      panBy(s.cx - pinch.cx, s.cy - pinch.cy);
      pinch = s;
    }
  }, { capture: true, passive: false });
  wrap.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { capture: true });

  /* ---------- 閒置自轉、提示 ---------- */
  let idleTimer = null;
  const fly = { active: false };
  function userActed() {
    controls.autoRotate = false;
    fly.active = false;
    hintEl.classList.add('hidden');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!selectedId && camera.position.distanceTo(controls.target) > 26) controls.autoRotate = true;
    }, 10000);
  }
  controls.addEventListener('start', userActed);
  setTimeout(() => hintEl.classList.add('hidden'), 7000);

  /* ---------- 尺寸 ---------- */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ptMat.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  /* ---------- 標籤（地圖式：放大才出現，互不重疊） ---------- */
  const labelMap = new Map();
  let frameNo = 0;
  function labelEl(key, text, cls) {
    let o = labelMap.get(key);
    if (!o) {
      const el = document.createElement('div');
      el.className = 'lbl ' + cls;
      el.textContent = text;
      labelsEl.appendChild(el);
      o = { el, frame: 0, cls };
      labelMap.set(key, o);
    }
    if (o.cls !== cls) { o.el.className = 'lbl ' + cls; o.cls = cls; }
    return o;
  }
  function toScreen(p, W, H) {
    _v.copy(p).project(camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H];
  }
  const facing = (p, n) => _w.subVectors(camera.position, p).normalize().dot(n);

  function updateLabels(lod) {
    frameNo++;
    const W = stage.clientWidth, H = stage.clientHeight;
    const cx = W / 2, cy = H / 2;
    const placed = [];
    const fits = (x, y, w, h) => {
      if (x < 4 || y < 64 || x + w > W - 4 || y + h > H - 100) return false;
      for (const r of placed) {
        if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false;
      }
      placed.push([x, y, w, h]);
      return true;
    };

    // 經絡名：在畫面中最靠中央的那一段
    const merList = [];
    MERIDIANS.forEach(m => {
      const a = m.id === selectedId ? Math.max(lod.mer, lod.hiMer) : lod.mer;
      if (a < 0.03) return;
      let best = null, bd = Infinity;
      for (const s of m.pick) {
        if (facing(s.p, s.n) < 0.15) continue;
        const sc = toScreen(s.p, W, H);
        if (!sc || sc[0] < 30 || sc[0] > W - 30 || sc[1] < 80 || sc[1] > H - 110) continue;
        const dd = Math.hypot(sc[0] - cx, sc[1] - cy);
        if (dd < bd) { bd = dd; best = sc; }
      }
      if (best) merList.push({ m, sc: best, a, pri: m.id === selectedId ? -1 : bd });
    });
    merList.sort((p, q) => p.pri - q.pri);
    merList.forEach(({ m, sc, a }) => {
      const fs = 12, w = m.name.length * (fs + 2) + 4, h = fs * 1.5;
      const x = sc[0] - w / 2, y = sc[1] - h - 6;
      if (!fits(x, y, w, h)) return;
      const o = labelEl('m:' + m.id, m.name, 'mer' + (m.id === selectedId ? ' hi' : ''));
      o.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      o.el.style.opacity = a.toFixed(3);
      o.frame = frameNo;
    });

    // 穴名
    const cand = [];
    PT.forEach((o, i) => {
      const hi = o.m.id === selectedId;
      let a = o.major ? Math.max(lod.lblMajor, lod.lblAll) : lod.lblAll;
      if (hi) a = Math.max(a, o.major ? Math.max(lod.hiLblMajor, lod.hiLblAll) : lod.hiLblAll);
      if (a < 0.03) return;
      if (facing(o.p, o.n) < 0.1) return;
      const sc = toScreen(o.p, W, H);
      if (!sc) return;
      const dd = Math.hypot(sc[0] - cx, sc[1] - cy);
      cand.push({ o, i, sc, a, hi, pri: (hi ? 0 : 2e4) + (o.major ? 0 : 1e4) + dd });
    });
    cand.sort((p, q) => p.pri - q.pri);
    let n = 0;
    for (const c of cand) {
      if (n >= 70) break;
      const fs = 11, w = c.o.name.length * (fs + 1) + 4, h = fs * 1.4;
      const x = c.sc[0] + 7, y = c.sc[1] - h / 2;
      if (!fits(x, y, w, h)) continue;
      const el = labelEl('p:' + c.i, c.o.name, (c.o.major ? 'major' : '') + (c.hi ? ' hi' : ''));
      el.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      el.el.style.opacity = c.a.toFixed(3);
      el.frame = frameNo;
      n++;
    }

    labelMap.forEach((o, key) => {
      if (o.frame === frameNo) return;
      if (o.el.style.opacity !== '0') o.el.style.opacity = '0';
      if (frameNo - o.frame > 40) { o.el.remove(); labelMap.delete(key); }
    });
  }

  /* ---------- 動畫 ---------- */
  const clock = new THREE.Clock();
  const COL_IDLE = new THREE.Color(0x7fd6c4);
  const COL_LIT = new THREE.Color(0xffe6c2);
  const COL_HALO = new THREE.Color(0xffd29a);

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const dist = camera.position.distanceTo(controls.target);

    // 依距離分層顯示
    const lod = {
      mer: ss(25, 19, dist),
      hiMer: ss(40, 30, dist),
      lblMajor: ss(15, 11.5, dist),
      lblAll: ss(8.5, 6.5, dist),
      hiLblMajor: ss(22, 17, dist),
      hiLblAll: ss(14, 10.5, dist)
    };
    ptMat.uniforms.uMajor.value = ss(22, 16, dist);
    ptMat.uniforms.uAll.value = ss(13, 9.5, dist);
    ptMat.uniforms.uHiMer.value = selectedId ? byId[selectedId].index : -1;
    ptMat.uniforms.uHiMajor.value = ss(42, 32, dist);
    ptMat.uniforms.uHiAll.value = ss(26, 19, dist);

    // 經絡：平時暗；滑過／點一下 → 柔光亮起
    const zoomIn = ss(30, 12, dist);
    const anySel = !!selectedId;
    MERIDIANS.forEach(m => {
      const target = (m.id === selectedId || m.id === hoveredId) ? 1 : 0;
      m.glow += (target - m.glow) * 0.12;
      const g = m.glow;
      const dim = anySel && m.id !== selectedId ? 0.55 : 1;
      const cu = m.coreMat.uniforms, hu = m.haloMat.uniforms;
      cu.uColor.value.copy(COL_IDLE).lerp(COL_LIT, g);
      cu.uOpacity.value = (0.13 + 0.17 * zoomIn) * dim * (1 - g) + 0.6 * g;
      cu.uBack.value = 0.35 + 0.2 * g;
      cu.uTime.value = t;
      cu.uFlow.value = g;
      hu.uColor.value.copy(COL_IDLE).lerp(COL_HALO, g);
      hu.uOpacity.value = 0.22 * g * (0.9 + 0.1 * Math.sin(t * 1.6));
      hu.uBack.value = 0.3;
      hu.uTime.value = t;
      hu.uFlow.value = g;
    });

    dust.rotation.y = t * 0.01;
    pedestal.rotation.y = t * 0.1;

    // 回到全身
    if (fly.active) {
      controls.target.lerp(HOME_TARGET, 0.08);
      camera.position.lerp(HOME_POS, 0.08);
      if (camera.position.distanceTo(HOME_POS) < 0.05) { fly.active = false; controls.autoRotate = true; }
    }

    if (controls.autoRotate && dist < 26) controls.autoRotate = false;
    controls.update();
    renderer.render(scene, camera);
    updateLabels(lod);
  }
  animate();

  window.TCMLobby = { select, open: openMeridian, reset: resetView, meridians: MERIDIANS, points: PT, version: VERSION };
})();

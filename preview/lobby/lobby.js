/* =========================================================
 * 中醫方證資料庫・大廳（經絡銅人）
 * Three.js r128 · OrbitControls
 *
 * - 半透明真人皮膚（只畫最外層表面），可切換不透明
 * - 經絡平時偏暗；滑鼠移上去或點一下：柔光亮起
 * - 點兩下：進入資訊介面（預留，尚未加入）→ window 事件 'tcm:open-meridian'
 * - 像地圖一樣分層顯示：全身只見經絡線 → 放大出現經絡名、主要穴位 → 再放大出現全部穴位與穴名
 * 人體：BodyParts3D 真實解剖模型（CC BY 4.0）；穴位依骨度分寸與骨性標誌定位
 * ========================================================= */
(() => {
  'use strict';

  const VERSION = 'v2.11.0';
  const UPDATED = '10/28 15:52';
  const FIX_NO = 22;

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

  /* ---------- 真人身體（BodyParts3D）---------- */
  // 皮膚、耳、唇、眼合成一個外殼；骨骼與臟腑交給 anatomy.js
  const MODEL = window.TCM_MODEL;
  const SHELL_KEYS = ['skin', 'ear', 'lip', 'eye', 'iris'];
  const shellParts = SHELL_KEYS.flatMap(k => MODEL.meshes[k] || []);
  const bodyGeo = (() => {
    let nv = 0, ni = 0;
    shellParts.forEach(m => { nv += m.vn; ni += m.i_n; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    const c = new THREE.Color();
    shellParts.forEach(m => {
      pos.set(m.geo.attributes.position.array, vo * 3);
      nor.set(m.geo.attributes.normal.array, vo * 3);
      c.setHex(m.color);
      for (let i = 0; i < m.vn; i++) col.set([c.r, c.g, c.b], (vo + i) * 3);
      const src = m.geo.index.array;
      for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
      vo += m.vn; io += src.length;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  })();

  // 先只寫深度：之後只畫最外層皮膚，內部重疊的接縫不會透出
  const bodyDepth = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({
    colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    side: THREE.DoubleSide
  }));
  bodyDepth.renderOrder = 1;

  // 皮膚：透明時像一層薄膜（邊緣較亮），不透時是有光影的真人膚色
  const bodyMat = new THREE.ShaderMaterial({
    uniforms: {
      uRim: { value: new THREE.Color(0xffe2cc) },
      uOpaque: { value: 0 }   // 0 = 透明，1 = 不透
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vN; varying vec3 vV; varying vec3 vC;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        vC = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uRim; uniform float uOpaque;
      varying vec3 vN; varying vec3 vV; varying vec3 vC;
      void main() {
        vec3 n = normalize(vN); vec3 v = normalize(vV);
        if (!gl_FrontFacing) n = -n;
        float f = 1.0 - abs(dot(n, v));
        float rim = pow(f, 2.2);
        vec3 L1 = normalize(vec3(-0.45, 0.75, 0.6)), L2 = normalize(vec3(0.6, 0.2, -0.5));
        float d1 = max(dot(n, L1), 0.0), d2 = max(dot(n, L2), 0.0);
        // 透明：淡淡膚色薄膜
        vec3 glass = vC * (0.12 + 0.22 * d1) + vC * rim * 0.9 + uRim * pow(f, 6.0) * 0.35;
        float a = 0.07 + 0.06 * d1 + 0.55 * rim;
        // 不透：半蘭伯特＋次表面的暖色＋高光
        float wrap = d1 * 0.5 + 0.5;
        vec3 sss = vec3(0.9, 0.35, 0.25) * pow(1.0 - wrap, 2.0) * 0.18;
        vec3 h = normalize(L1 + v);
        float spec = pow(max(dot(n, h), 0.0), 24.0) * 0.08;
        vec3 solid = vC * (0.22 + 0.78 * wrap * wrap) + vC * d2 * 0.18 + sss + spec + uRim * pow(f, 3.0) * 0.12;
        gl_FragColor = vec4(mix(glass, solid, uOpaque), mix(a, 1.0, uOpaque));
      }`,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    side: THREE.DoubleSide
  });
  const bodyShell = new THREE.Mesh(bodyGeo, bodyMat);
  bodyShell.renderOrder = 2;
  scene.add(bodyDepth, bodyShell);
  // 骨骼、臟腑用的光
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a2c22, 0.85));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.65);
  keyLight.position.set(-4, 8, 10);
  scene.add(keyLight);

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
  pedestal.position.y = -8.75;
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

  /* ---------- 貼皮膚：把任一點投到最近的皮膚表面 ----------
   * 皮膚三角形放進 0.3 單位的格子，查詢時由近到遠找格子 */
  const skinIndex = (() => {
    const m = MODEL.meshes.skin[0];
    const P = m.geo.attributes.position.array, N = m.geo.attributes.normal.array, I = m.geo.index.array;
    const CS = 0.3;
    const box = new THREE.Box3().setFromBufferAttribute(m.geo.attributes.position);
    const o = box.min, nx = Math.ceil((box.max.x - o.x) / CS) + 1, ny = Math.ceil((box.max.y - o.y) / CS) + 1, nz = Math.ceil((box.max.z - o.z) / CS) + 1;
    const cells = new Map();
    for (let t = 0; t < I.length; t += 3) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const j = I[t + k] * 3;
        x0 = Math.min(x0, P[j]); x1 = Math.max(x1, P[j]);
        y0 = Math.min(y0, P[j + 1]); y1 = Math.max(y1, P[j + 1]);
        z0 = Math.min(z0, P[j + 2]); z1 = Math.max(z1, P[j + 2]);
      }
      for (let a = Math.floor((x0 - o.x) / CS); a <= Math.floor((x1 - o.x) / CS); a++)
        for (let b = Math.floor((y0 - o.y) / CS); b <= Math.floor((y1 - o.y) / CS); b++)
          for (let c = Math.floor((z0 - o.z) / CS); c <= Math.floor((z1 - o.z) / CS); c++) {
            const key = (a * ny + b) * nz + c;
            let arr = cells.get(key);
            if (!arr) cells.set(key, arr = []);
            arr.push(t);
          }
    }
    return { P, N, I, CS, o, nx, ny, nz, cells };
  })();

  // 三角形上離 p 最近的點（Ericson《Real-Time Collision Detection》5.1.5），回傳重心座標
  const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _ap = new THREE.Vector3(), _bp = new THREE.Vector3(), _cp = new THREE.Vector3();
  const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3();
  function closestBary(p, a, b, c, out) {
    _ab.subVectors(b, a); _ac.subVectors(c, a); _ap.subVectors(p, a);
    const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap);
    if (d1 <= 0 && d2 <= 0) return out.set(1, 0, 0);
    _bp.subVectors(p, b);
    const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp);
    if (d3 >= 0 && d4 <= d3) return out.set(0, 1, 0);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return out.set(1 - v, v, 0); }
    _cp.subVectors(p, c);
    const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp);
    if (d6 >= 0 && d5 <= d6) return out.set(0, 0, 1);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return out.set(1 - w, 0, w); }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return out.set(0, 1 - w, w); }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
    return out.set(1 - v - w, v, w);
  }

  const _bary = new THREE.Vector3(), _q = new THREE.Vector3();
  function snapToSkin(p, off) {
    const S = skinIndex, P = S.P, I = S.I;
    const ca = Math.floor((p.x - S.o.x) / S.CS), cb = Math.floor((p.y - S.o.y) / S.CS), cc = Math.floor((p.z - S.o.z) / S.CS);
    let best = Infinity, bt = -1, bu = 0, bv = 0, bw = 0;
    const seen = new Set();
    for (let r = 0; r < 12; r++) {
      for (let a = ca - r; a <= ca + r; a++)
        for (let b = cb - r; b <= cb + r; b++)
          for (let c = cc - r; c <= cc + r; c++) {
            if (Math.max(Math.abs(a - ca), Math.abs(b - cb), Math.abs(c - cc)) !== r) continue;
            if (a < 0 || b < 0 || c < 0 || a >= S.nx || b >= S.ny || c >= S.nz) continue;
            const arr = S.cells.get((a * S.ny + b) * S.nz + c);
            if (!arr) continue;
            for (const t of arr) {
              if (seen.has(t)) continue;
              seen.add(t);
              const i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3;
              _A.set(P[i0], P[i0 + 1], P[i0 + 2]); _B.set(P[i1], P[i1 + 1], P[i1 + 2]); _C.set(P[i2], P[i2 + 1], P[i2 + 2]);
              closestBary(p, _A, _B, _C, _bary);
              _q.set(0, 0, 0).addScaledVector(_A, _bary.x).addScaledVector(_B, _bary.y).addScaledVector(_C, _bary.z);
              const d = _q.distanceToSquared(p);
              if (d < best) { best = d; bt = t; bu = _bary.x; bv = _bary.y; bw = _bary.z; }
            }
          }
      // 已找到，且沒有更近的格子可能藏著更近的點
      if (bt >= 0 && Math.sqrt(best) <= r * S.CS) break;
    }
    const N = S.N;
    const i0 = I[bt] * 3, i1 = I[bt + 1] * 3, i2 = I[bt + 2] * 3;
    const out = new THREE.Vector3(
      P[i0] * bu + P[i1] * bv + P[i2] * bw,
      P[i0 + 1] * bu + P[i1 + 1] * bv + P[i2 + 1] * bw,
      P[i0 + 2] * bu + P[i1 + 2] * bv + P[i2 + 2] * bw);
    const n = new THREE.Vector3(
      N[i0] * bu + N[i1] * bv + N[i2] * bw,
      N[i0 + 1] * bu + N[i1 + 1] * bv + N[i2 + 1] * bw,
      N[i0 + 2] * bu + N[i1 + 2] * bv + N[i2 + 2] * bw).normalize();
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
      points: '*中府 雲門 天府 俠白 *尺澤 孔最 *列缺 經渠 *太淵 魚際 *少商' },
    { id: 'LI', short: '大腸', name: '手陽明大腸經', bilateral: true,
      points: '商陽 二間 三間 *合谷 陽谿 偏歷 溫溜 下廉 上廉 手三里 *曲池 肘髎 手五里 臂臑 *肩髃 巨骨 天鼎 扶突 口禾髎 *迎香' },
    { id: 'ST', short: '胃', name: '足陽明胃經', bilateral: true,
      points: '承泣 四白 巨髎 *地倉 大迎 *頰車 下關 頭維 人迎 水突 氣舍 缺盆 氣戶 庫房 屋翳 膺窗 乳中 乳根 不容 承滿 梁門 關門 太乙 滑肉門 *天樞 外陵 大巨 水道 歸來 氣衝 髀關 伏兔 陰市 梁丘 犢鼻 *足三里 上巨虛 條口 下巨虛 *豐隆 解谿 衝陽 陷谷 *內庭 厲兌' },
    { id: 'SP', short: '脾', name: '足太陰脾經', bilateral: true,
      points: '*隱白 大都 太白 *公孫 商丘 *三陰交 漏谷 地機 *陰陵泉 *血海 箕門 衝門 府舍 腹結 大橫 腹哀 食竇 天谿 胸鄉 周榮 大包' },
    { id: 'HT', short: '心', name: '手少陰心經', bilateral: true,
      points: '*極泉 青靈 *少海 靈道 通里 陰郄 *神門 少府 少衝' },
    { id: 'SI', short: '小腸', name: '手太陽小腸經', bilateral: true,
      points: '少澤 前谷 *後谿 腕骨 陽谷 養老 支正 *小海 肩貞 臑俞 *天宗 秉風 曲垣 肩外俞 肩中俞 天窗 天容 顴髎 *聽宮' },
    { id: 'BL', short: '膀胱', name: '足太陽膀胱經', bilateral: true,
      points: '*睛明 攢竹 眉衝 曲差 五處 承光 通天 絡卻 玉枕 *天柱 大杼 風門 *肺俞 厥陰俞 *心俞 督俞 膈俞 *肝俞 膽俞 *脾俞 胃俞 三焦俞 *腎俞 氣海俞 大腸俞 關元俞 小腸俞 膀胱俞 中膂俞 白環俞 上髎 次髎 中髎 下髎 會陽 承扶 殷門 浮郄 委陽 *委中 附分 魄戶 膏肓 神堂 譩譆 膈關 魂門 陽綱 意舍 胃倉 肓門 志室 胞肓 秩邊 合陽 承筋 *承山 飛揚 跗陽 *崑崙 僕參 申脈 金門 京骨 束骨 足通谷 *至陰' },
    { id: 'KI', short: '腎', name: '足少陰腎經', bilateral: true,
      points: '*湧泉 然谷 *太谿 大鐘 水泉 照海 *復溜 交信 築賓 陰谷 橫骨 大赫 氣穴 四滿 中注 肓俞 商曲 石關 陰都 腹通谷 幽門 步廊 神封 靈墟 神藏 彧中 俞府' },
    { id: 'PC', short: '心包', name: '手厥陰心包經', bilateral: true,
      points: '天池 天泉 *曲澤 郄門 間使 *內關 *大陵 *勞宮 中衝' },
    { id: 'SJ', short: '三焦', name: '手少陽三焦經', bilateral: true,
      points: '關衝 液門 中渚 陽池 *外關 *支溝 會宗 三陽絡 四瀆 天井 清冷淵 消濼 臑會 肩髎 天髎 天牖 *翳風 瘈脈 顱息 角孫 耳門 耳和髎 *絲竹空' },
    { id: 'GB', short: '膽', name: '足少陽膽經', bilateral: true,
      points: '瞳子髎 聽會 上關 頷厭 懸顱 懸釐 曲鬢 率谷 天衝 浮白 頭竅陰 完骨 本神 陽白 頭臨泣 目窗 正營 承靈 腦空 *風池 *肩井 淵腋 輒筋 日月 京門 帶脈 五樞 維道 居髎 *環跳 *風市 中瀆 膝陽關 *陽陵泉 陽交 外丘 光明 陽輔 *懸鐘 丘墟 *足臨泣 地五會 俠谿 足竅陰' },
    { id: 'LR', short: '肝', name: '足厥陰肝經', bilateral: true,
      points: '大敦 行間 *太衝 中封 蠡溝 中都 膝關 *曲泉 陰包 足五里 陰廉 急脈 *章門 *期門' },
    { id: 'REN', short: '任脈', name: '任脈', bilateral: false,
      points: '會陰 曲骨 中極 *關元 石門 *氣海 陰交 *神闕 水分 下脘 建里 *中脘 上脘 巨闕 鳩尾 中庭 *膻中 玉堂 紫宮 華蓋 璇璣 天突 廉泉 *承漿' },
    { id: 'DU', short: '督脈', name: '督脈', bilateral: false,
      points: '*長強 腰俞 腰陽關 *命門 懸樞 脊中 中樞 筋縮 至陽 靈台 神道 身柱 陶道 *大椎 啞門 *風府 腦戶 強間 後頂 *百會 前頂 囟會 上星 神庭 素髎 *水溝 兌端 齦交' }
  ];
  // 穴位座標：model/points.json（由骨度分寸＋骨性標誌算出，見 tools/acupoints.py）
  MERIDIANS.forEach(m => { m.strokes = window.TCM_POINTS.strokes[m.id]; });
  const byId = Object.fromEntries(MERIDIANS.map(m => [m.id, m]));

  const STEP = 0.06;        // 經絡取樣間距
  const SKIN_OFF = 0.045;  // 經絡浮在皮膚上的距離

  // 一筆經絡：定位點貼皮 → 曲線取樣（依距離決定取樣數）→ 每個取樣再貼皮 → 平滑（穴位本身不動）
  function traceStroke(stroke) {
    const anchors = stroke.map(v => snapToSkin(V3(v[0], v[1], v[2]), SKIN_OFF).p);
    const curve = new THREE.CatmullRomCurve3(anchors, false, 'centripetal');
    const segs = anchors.length - 1;
    const ps = [], ns = [], anchorIdx = [], fixed = new Set();
    for (let k = 0; k < segs; k++) {
      const n = Math.max(2, Math.min(20, Math.ceil(anchors[k].distanceTo(anchors[k + 1]) / STEP)));
      anchorIdx.push(ps.length); fixed.add(ps.length);
      ps.push(anchors[k].clone()); ns.push(snapToSkin(anchors[k], 0).n);
      for (let j = 1; j < n; j++) {
        const s = snapToSkin(curve.getPoint((k + j / n) / segs), SKIN_OFF);
        ps.push(s.p); ns.push(s.n);
      }
    }
    anchorIdx.push(ps.length); fixed.add(ps.length);
    ps.push(anchors[segs].clone()); ns.push(snapToSkin(anchors[segs], 0).n);
    const M = ps.length - 1;
    for (let pass = 0; pass < 3; pass++) {
      const prev = ps.map(p => p.clone());
      for (let i = 1; i < M; i++) {
        if (fixed.has(i)) continue;
        ps[i].copy(prev[i]).multiplyScalar(0.5).addScaledVector(prev[i - 1], 0.25).addScaledVector(prev[i + 1], 0.25);
      }
    }
    const cum = [0];
    for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + ps[i].distanceTo(ps[i - 1]));
    return { ps, ns, cum, anchorIdx, anchorNos: stroke.map(v => v[3]) };
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
  // 主線用一般混色（疊在白色骨骼上也看得到），外圍柔光用加亮混色
  function merMat(radius, soft, additive) {
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
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
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
    m.coreMat = merMat(0.03, 0.5, false);
    m.haloMat = merMat(0.17, 1.0, true);
    m.haloMat.uniforms.uOpacity.value = 0;
    m.glow = 0;
    m.pick = [];
    m.traces = [];   // 右側（x > 0）的體表走向，循行動畫用
    m.ptL = {};      // 穴號 → { tr, L }：在哪一筆、離起點多長
    m.ptNames = m.points.split(/\s+/).map(s => ({ name: s.replace('*', ''), major: s.startsWith('*') }));

    const sides = m.bilateral ? [1, -1] : [1];
    m.strokes.forEach(stroke => {
      const tr = traceStroke(stroke);
      m.traces.push(tr);
      // 這一筆裡的穴位
      const local = [];
      let prevNo = null, prevL = 0;
      tr.anchorNos.forEach((no, vi) => {
        if (no == null) return;
        const L = tr.cum[tr.anchorIdx[vi]];
        if (prevNo != null) {
          for (let k = prevNo + 1; k < no; k++) {
            const Lk = prevL + ((k - prevNo) / (no - prevNo)) * (L - prevL);
            local.push({ no: k, at: atLength(tr, Lk) });
            m.ptL[k] = { tr, L: Lk };
          }
        }
        local.push({ no, at: { p: tr.ps[tr.anchorIdx[vi]].clone(), n: tr.ns[tr.anchorIdx[vi]].clone() } });
        m.ptL[no] = { tr, L };
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
            m, no, name: info.name, major: info.major, side: s,
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
      uHiMer: { value: -1 }, uHiMajor: { value: 0 }, uHiAll: { value: 0 }, uBackPt: { value: 0.12 },
      uScale: { value: 1000 },
      uColor: { value: new THREE.Color(0xf2e6c8) },
      uHiColor: { value: new THREE.Color(0xffd23c) }
    },
    vertexShader: `
      attribute vec3 surfN; attribute float aMer; attribute float aMajor;
      uniform float uMajor; uniform float uAll; uniform float uHiMer; uniform float uHiMajor; uniform float uHiAll; uniform float uScale; uniform float uBackPt;
      varying float vA; varying float vHi;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 v = normalize(cameraPosition - position);
        float face = smoothstep(-0.2, 0.3, dot(normalize(surfN), v));
        float hi = 1.0 - step(0.5, abs(aMer - uHiMer));
        float vis = aMajor > 0.5 ? max(uMajor, uAll) : uAll;
        vis = max(vis, hi * (aMajor > 0.5 ? max(uHiMajor, uHiAll) : uHiAll));
        vA = vis * mix(uBackPt, 1.0, face);
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
        gl_FragColor = vec4(mix(uColor, uHiColor, vHi) * (0.8 + 0.3 * core), min(1.0, a * 1.2));
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
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
    b.addEventListener('click', () => {   // 點一下或兩下都直接進入這條經的資訊
      const now = performance.now();
      if (lastChip && lastChip.id === m.id && now - lastChip.t < 600) return;   // 點兩下的第二下：已經打開了
      lastChip = { id: m.id, t: now };
      select(m.id);
      openMeridian(m.id);
      collapseChips();
    });
    chipsEl.appendChild(b);
    chipEls[m.id] = b;
  });

  // 右上的 ›：展開／收起經絡按鈕
  const chipTog = $('chip-tog');
  // « 放在左上工具列 › 的正下方，經絡按鈕在它右邊展開
  stage.appendChild(chipTog); stage.appendChild(chipsEl); chipsEl.classList.add('chips-left');
  if (chipEls.SI) { const br = document.createElement('i'); br.className = 'chip-br'; chipEls.SI.after(br); }   // 小腸之後換行：膀胱～督脈排第二列
  // 下方的經絡名稱：點一下或兩下也進入資訊
  selEl.addEventListener('click', () => { if (selectedId) openMeridian(selectedId); });
  let chipT = 0;
  function collapseChips() { stage.classList.remove('chips-open'); chipTog.setAttribute('aria-expanded', 'false'); }
  canvas.addEventListener('pointerdown', collapseChips);   // 點畫面其他地方也收合
  // « 下面再放兩顆：🌿 直接到藥物總表、👩🏻‍⚕️ 直接到全部病證
  [['sheet', '🌿', '藥物總表'], ['zz', '👩🏻‍⚕️', '全部病證']].forEach(([go, ic, t], i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip-tog lb-jump lb-jump' + i; b.textContent = ic; b.title = t; b.setAttribute('aria-label', t);
    b.addEventListener('click', () => { if (window.parent !== window) window.parent.postMessage({ type: 'tcm-enter', go, bz: false }, '*'); });
    stage.appendChild(b);
  });
  chipTog.addEventListener('click', () => {
    chipTog.setAttribute('aria-expanded', String(chipTog.closest('.stage').classList.toggle('chips-open')));
  });

  /* ---------- 外掛模組（骨骼臟腑、循行、工具列）用的掛勾 ---------- */
  const hooks = { frame: [], select: [], tap: [], hover: [], open: [] };
  const view = { opaque: 0, opaqueTarget: 0, tourGlow: 1, showMeridians: true, showPoints: true, showPointNames: false };   // 預設：皮膚、經絡、穴點；穴道名從圖層打開

  /* ---------- 點亮 / 進入 ---------- */
  let selectedId = null, hoveredId = null;

  function select(id) {
    selectedId = id || null;
    Object.entries(chipEls).forEach(([k, b]) => b.classList.toggle('active', k === selectedId));
    if (selectedId && chipEls[selectedId]) {
      // 經絡按鈕改在左上展開，不用捲動
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
    hooks.select.forEach(fn => fn(selectedId));
  }

  // 資訊介面：先預留，之後接上
  let toastTimer = null;
  function showToast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1600);
  }
  function openMeridian(id) {
    const m = byId[id];
    if (!m) return;
    window.dispatchEvent(new CustomEvent('tcm:open-meridian', { detail: { id, name: m.name } }));
    if (hooks.open.length) { hooks.open.forEach(fn => fn(id)); return; }   // 資訊介面（info.js）
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

  // 進入資料庫：在 App 裡（iframe）通知外層；單獨開啟時回到資料庫頁
  $('btn-enter').addEventListener('click', () => {
    if (window.parent !== window) window.parent.postMessage({ type: 'tcm-enter' }, '*');
    else location.href = '../';
  });

  /* ---------- 螢幕座標挑選經絡 ---------- */
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function pickMeridian(cx, cy, tol) {
    const r = canvas.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    let best = null, bd = tol;
    if (!view.showMeridians) return null;
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
    for (const fn of hooks.hover) if (fn(e)) { if (hoveredId) setHover(null); return; }
    setHover(pickMeridian(e.clientX, e.clientY, 14), e);
  });
  canvas.addEventListener('pointerleave', () => setHover(null));

  function onTap(x, y, type) {
    for (const fn of hooks.tap) if (fn(x, y, type)) return;   // 工具模式（光標、標注）優先
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
    if (view.lockOrbit) return;   // 病證區域：只能左右轉
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
    if (view.lockOrbit) return;
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

  const SHOW_MER_NAMES = false;   // 經絡名（青色字）不顯示
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
    if (SHOW_MER_NAMES) MERIDIANS.forEach(m => {
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
    if (view.showPoints && view.showPointNames) PT.forEach((o, i) => {
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
      el.el.dataset.pt = c.i;   // 滑鼠移到穴名上：顯示穴位小卡（xue.js）
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
  const COL_IDLE = new THREE.Color(0x5fc7b4);
  const COL_LIT = new THREE.Color(0xff7433);   // 亮起：橘紅（參考解剖經絡圖的配色）
  const COL_HALO = new THREE.Color(0xffa25a);

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

    // 透明 ↔ 不透（平滑切換）
    view.opaque += (view.opaqueTarget - view.opaque) * 0.15;
    bodyMat.uniforms.uOpaque.value = view.opaque;
    ptMat.uniforms.uBackPt.value = 0.12 * (1 - view.opaque);

    // 經絡：平時暗；滑過／點一下 → 柔光亮起
    const zoomIn = ss(30, 12, dist);
    const anySel = !!selectedId;
    MERIDIANS.forEach(m => {
      const target = (m.id === selectedId ? view.tourGlow : m.id === hoveredId ? 1 : 0);
      m.glow += (target - m.glow) * 0.12;
      const g = m.glow;
      const dim = anySel && m.id !== selectedId ? 0.5 : 1;   // 選了一條經絡：其他經絡透明 50%
      const cu = m.coreMat.uniforms, hu = m.haloMat.uniforms;
      cu.uColor.value.copy(COL_IDLE).lerp(COL_LIT, g);
      // 藍綠色（沒選到）的經絡線再透明 50%
      cu.uOpacity.value = 0.5 * (anySel && m.id !== selectedId ? 0.5 * 0.3 : (0.3 + 0.25 * zoomIn) * dim) * (1 - g) + 0.9 * g;
      cu.uBack.value = (0.35 * (1 - g) * 0.5 + 0.55 * g) * (1 - view.opaque) * (anySel && m.id !== selectedId ? 0.5 : 1);
      cu.uTime.value = t;
      cu.uFlow.value = 0;
      cu.uRadius.value = 0.03 * (1 + 0.9 * g);
      hu.uColor.value.copy(COL_IDLE).lerp(COL_HALO, g);
      hu.uOpacity.value = 0.16 * g * (0.9 + 0.1 * Math.sin(t * 1.6));
      hu.uBack.value = 0.3 * (1 - view.opaque);
      hu.uTime.value = t;
      hu.uFlow.value = 0;
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
    hooks.frame.forEach(fn => fn(t, dist));
    controls.update();
    renderer.render(scene, camera);
    updateLabels(lod);
  }
  animate();

  window.TCMLobby = {
    select, open: openMeridian, reset: resetView, meridians: MERIDIANS, byId, points: PT, version: VERSION,
    get selected() { return selectedId; },
    scene, camera, controls, renderer, canvas, stage, labelsEl, toast: showToast,
    snapToSkin, atLength, mirror, SKIN_OFF, bodyDepth, bodyShell, meridianGroup, pointsObj: points, hooks, view, userActed,
    model: MODEL, landmarks: window.TCM_POINTS.landmarks
  };
})();

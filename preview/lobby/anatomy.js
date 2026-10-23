/* =========================================================
 * 經絡銅人・骨骼、臟腑、骨度分寸（圖層）
 * 骨骼、臟腑：BodyParts3D 真實解剖模型（© DBCLS, CC BY 4.0）
 *   肺、肝的實質在原始資料中沒有獨立模型，以支氣管樹／肝內管道的外包絡近似
 * 座標：面向 +z；人的「右邊」在 x < 0
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { scene, snapToSkin, model } = L;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function meshesOf(keys, matFor) {
    const out = [];
    keys.forEach(k => (model.meshes[k] || []).forEach(m => out.push(new THREE.Mesh(m.geo, matFor(m)))));
    return out;
  }

  /* ---------- 骨骼 ---------- */
  const skeleton = new THREE.Group();
  skeleton.name = 'skeleton';
  const boneMat = c => new THREE.MeshPhongMaterial({ color: c, specular: 0x2a2620, shininess: 18 });
  meshesOf(['bone', 'cart'], m => boneMat(m.color)).forEach(o => skeleton.add(o));

  /* ---------- 顱面骨、咽喉（常駐顯示，不跟骨骼一起隱藏） ---------- */
  const face = new THREE.Group();
  face.name = 'face';
  meshesOf(['skull', 'teeth'], m => boneMat(m.color)).forEach(o => face.add(o));
  meshesOf(['gum', 'larynx', 'pharynx', 'tongue'], m => new THREE.MeshPhongMaterial({ color: m.color, specular: 0x3a2622, shininess: 30 })).forEach(o => face.add(o));

  /* ---------- 臟腑 ---------- */
  const organs = new THREE.Group();
  organs.name = 'organs';
  const ORGAN_KEYS = {
    肺: ['lungR', 'lungL', 'trachea'], 心: ['heart'], 肝: ['liver'], 膽: ['gall'], 胃: ['stomach', 'esoph'],
    脾: ['spleen', 'pancreas'], 腎: ['kidney', 'ureter'], 膀胱: ['bladder'], 小腸: ['sint'], 大腸: ['lint'], 腦: ['brain']
  };
  // 臟腑質感：濕潤、柔軟（柔和反光＋邊緣透光的暖色＋細微的組織紋理）
  const envMap = (() => {
    const pm = new THREE.PMREMGenerator(L.renderer);
    const room = new THREE.Scene();
    room.background = new THREE.Color(0x1a1210);
    const lamp = (c, x, y, z, w, h) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m);
    };
    lamp(0xfff3e6, -3, 4, 4, 4, 2.5);
    lamp(0xffd9c2, 4, 2, 2, 2, 3);
    lamp(0x8a6a60, 0, -4, 0, 6, 6);
    lamp(0xffffff, 0, 5, -3, 3, 1.5);
    const rt = pm.fromScene(room, 0.04);
    pm.dispose();
    return rt.texture;
  })();
  const tissue = mat => {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vObjPos;
          float hsh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float vnoise(vec3 p) {
            vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hsh(i), hsh(i + vec3(1,0,0)), f.x), mix(hsh(i + vec3(0,1,0)), hsh(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(hsh(i + vec3(0,0,1)), hsh(i + vec3(1,0,1)), f.x), mix(hsh(i + vec3(0,1,1)), hsh(i + vec3(1,1,1)), f.x), f.y), f.z);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float tn = vnoise(vObjPos * 9.0) * 0.6 + vnoise(vObjPos * 23.0) * 0.4;
          diffuseColor.rgb *= 0.88 + 0.22 * tn;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.55, 0.45) * fr * 0.45;`);
    };
    return mat;
  };
  const ORGAN = {};
  Object.entries(ORGAN_KEYS).forEach(([zh, keys]) => {
    ORGAN[zh] = meshesOf(keys, m => tissue(new THREE.MeshPhysicalMaterial({
      color: m.color, roughness: 0.55, metalness: 0, envMap, envMapIntensity: 0.32,
      clearcoat: 0.25, clearcoatRoughness: 0.45,
      emissive: new THREE.Color(m.color).multiplyScalar(0.06),
      transparent: zh === '肺', opacity: zh === '肺' ? 0.38 : 1, depthWrite: zh !== '肺'
    })));
    ORGAN[zh].forEach(o => { o.name = zh; organs.add(o); });
  });
  ORGAN.心包 = ORGAN.心;

  // 臟腑、骨骼都在皮膚深度遮擋之前畫（才不會被透明皮膚擋掉）
  [skeleton, organs, face].forEach(g => g.traverse(o => { if (o.isMesh) o.renderOrder = o.material.transparent ? 0.5 : 0; }));
  skeleton.visible = false;   // 預設只有皮膚、經絡、穴點；骨骼、臟腑、顱面骨・咽喉都從圖層打開
  organs.visible = false;
  face.visible = false;
  scene.add(skeleton, organs, face);

  /* ---------- 骨度分寸尺 ---------- */
  const rulers = new THREE.Group();
  rulers.name = 'rulers';
  rulers.visible = false;
  const RULER_COLOR = '#8fdc9a';
  const lineMat = new THREE.LineBasicMaterial({ color: 0x8fdc9a, transparent: true, opacity: 0.85, depthTest: false });
  const texCache = {};
  function textTex(text, w) {
    const key = text + '|' + w;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = w; c.height = 64;
    const g = c.getContext('2d');
    g.font = '500 40px "Noto Serif TC", "PingFang TC", serif';
    g.fillStyle = RULER_COLOR;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.9)';
    g.shadowBlur = 6;
    g.fillText(text, w / 2, 34);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return (texCache[key] = t);
  }
  function textSprite(text, w, h) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(text, w), transparent: true, depthTest: false }));
    sp.scale.set(h * (w / 64), h, 1);
    sp.renderOrder = 6;
    return sp;
  }

  // 尺的沿途點由 tools/acupoints.py 依骨性標誌算出
  const RULERS = window.TCM_POINTS.rulers;
  const OFF = 0.09;
  function buildRuler(r, s) {
    const anchors = r.pts.map(p => snapToSkin(V3(p[0] * s, p[1], p[2]), OFF).p);
    const curve = anchors.length > 1 ? new THREE.CatmullRomCurve3(anchors, false, 'centripetal') : null;
    const N = 80, ps = [], ns = [];
    for (let i = 0; i <= N; i++) {
      const q = snapToSkin(curve.getPoint(i / N), OFF);
      ps.push(q.p); ns.push(q.n);
    }
    const cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + ps[i].distanceTo(ps[i - 1]));
    const total = cum[N];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ps), lineMat);
    line.renderOrder = 5;
    rulers.add(line);
    const tickVerts = [];
    for (let c = 0; c <= r.cun; c++) {
      const Lc = (c / r.cun) * total;
      let i = 1;
      while (i < N && cum[i] < Lc) i++;
      const k = (Lc - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      const p = ps[i - 1].clone().lerp(ps[i], k);
      const n = ns[i - 1].clone().lerp(ns[i], k).normalize();
      const tan = ps[i].clone().sub(ps[i - 1]).normalize();
      const perp = new THREE.Vector3().crossVectors(tan, n).normalize();
      const len = c === 0 || c === r.cun ? 0.14 : 0.08;
      tickVerts.push(p.x, p.y, p.z, p.x + perp.x * len, p.y + perp.y * len, p.z + perp.z * len);
      const num = textSprite(String(c), 64, 0.16);
      num.position.copy(p).addScaledVector(perp, 0.2).addScaledVector(n, 0.04);
      rulers.add(num);
    }
    const ticks = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
    ticks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tickVerts, 3));
    ticks.renderOrder = 5;
    rulers.add(ticks);
    const title = textSprite(r.name, 64 + r.name.length * 40, 0.2);
    title.position.copy(ps[0]).addScaledVector(ns[0], 0.25).add(V3(0, 0.18, 0));
    rulers.add(title);
  }
  RULERS.forEach(r => (r.both ? [1, -1] : [1]).forEach(s => buildRuler(r, s)));
  scene.add(rulers);

  /* ---------- 點選經絡時，臟腑淡到 30%（看清楚經絡走進哪裡）；病證模式可讓某些臟腑保持原樣並發光 ---------- */
  const organEntries = [];
  organs.traverse(o => {
    if (o.isMesh) organEntries.push({ o, m: o.material, base: o.material.opacity, emi: o.material.emissive.clone(), a: 1 });
  });
  const _c = new THREE.Color();
  L.organLook = { fade: 1, keep: null, glow: null };   // keep：保持原樣的臟腑名；glow：發光顏色
  L.hooks.select.push(id => { L.organLook.fade = id ? 0.3 : 1; });
  let lastT = 0;
  L.hooks.frame.push(t => {
    const { fade, keep, glow } = L.organLook;
    const k = 1 - Math.exp(-Math.min(0.1, Math.max(0, t - lastT)) * 8);   // 依時間平滑（慢的手機也一樣快）
    lastT = t;
    organEntries.forEach(e => {
      const on = keep && keep.has(e.o.name);
      const goal = on ? 1 : fade;
      e.a += (goal - e.a) * k;
      if (Math.abs(goal - e.a) < 0.002) e.a = goal;
      e.m.opacity = e.base * e.a;
      const tr = e.base < 1 || e.a < 1;
      if (e.m.transparent !== tr) { e.m.transparent = tr; e.m.depthWrite = !tr; e.o.renderOrder = tr ? 0.5 : 0; e.m.needsUpdate = true; }
      _c.copy(e.emi);
      if (on && glow) _c.lerp(glow, 0.28 + 0.1 * Math.sin(t * 2.4));
      e.m.emissive.lerp(_c, k);
    });
  });

  L.layers = { skeleton, organs, face, rulers };
  L.organs = ORGAN;
})();

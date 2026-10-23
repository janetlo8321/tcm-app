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
  meshesOf(['bone', 'teeth', 'cart'], m => boneMat(m.color)).forEach(o => skeleton.add(o));

  /* ---------- 臟腑 ---------- */
  const organs = new THREE.Group();
  organs.name = 'organs';
  const ORGAN_KEYS = {
    肺: ['lungR', 'lungL', 'trachea'], 心: ['heart'], 肝: ['liver'], 膽: ['gall'], 胃: ['stomach', 'esoph'],
    脾: ['spleen', 'pancreas'], 腎: ['kidney', 'ureter'], 膀胱: ['bladder'], 小腸: ['sint'], 大腸: ['lint'], 腦: ['brain']
  };
  const ORGAN = {};
  Object.entries(ORGAN_KEYS).forEach(([zh, keys]) => {
    ORGAN[zh] = meshesOf(keys, m => new THREE.MeshPhongMaterial({
      color: m.color, specular: 0x3a2622, shininess: 34,
      transparent: zh === '肺', opacity: zh === '肺' ? 0.82 : 1
    }));
    ORGAN[zh].forEach(o => { o.name = zh; organs.add(o); });
  });
  ORGAN.心包 = ORGAN.心;

  // 臟腑、骨骼都在皮膚深度遮擋之前畫（才不會被透明皮膚擋掉）
  [skeleton, organs].forEach(g => g.traverse(o => { if (o.isMesh) o.renderOrder = o.material.transparent ? 0.5 : 0; }));
  scene.add(skeleton, organs);

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

  L.layers = { skeleton, organs, rulers };
  L.organs = ORGAN;
})();

/* =========================================================
 * 經絡銅人・骨骼、臟腑、骨度分寸（圖層）
 * 全部用程式產生的簡化模型（示意，不是解剖精確模型）
 * 座標：銅人面向 +z；銅人的「右邊」在 x < 0
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { scene, snapToSkin, mirror } = L;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------- 共用 ---------- */
  const boneMat = new THREE.MeshLambertMaterial({ color: 0xe9e1cf });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x15100c });

  function ellipsoid(group, mat, c, s, rot) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
    m.position.set(c[0], c[1], c[2]);
    m.scale.set(s[0], s[1], s[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    group.add(m);
    return m;
  }
  function tube(group, mat, pts, r, closed) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])), !!closed, 'centripetal');
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), r, 10, !!closed), mat);
    group.add(m);
    return m;
  }
  // 長骨：骨幹＋兩端關節頭
  function bone(group, a, b, r, knobA, knobB) {
    const va = V3(a[0], a[1], a[2]), vb = V3(b[0], b[1], b[2]);
    const len = va.distanceTo(vb);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, len, 12), boneMat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), vb.clone().sub(va).normalize());
    group.add(m);
    if (knobA) ellipsoid(group, boneMat, a, [knobA, knobA, knobA]);
    if (knobB) ellipsoid(group, boneMat, b, [knobB, knobB, knobB]);
  }
  // 左右對稱：右側定義一次，自動做出鏡像
  function both(fn) { fn(1); fn(-1); }
  const sx = (p, s) => [p[0] * s, p[1], p[2]];

  /* ---------- 骨骼 ---------- */
  const skeleton = new THREE.Group();
  skeleton.name = 'skeleton';

  // 頭骨
  ellipsoid(skeleton, boneMat, [0, 7.4, -0.05], [0.7, 0.78, 0.84]);
  ellipsoid(skeleton, boneMat, [0, 6.75, 0.3], [0.5, 0.42, 0.55]);
  ellipsoid(skeleton, boneMat, [0, 6.38, 0.42], [0.36, 0.2, 0.36]);           // 下頷
  both(s => ellipsoid(skeleton, darkMat, [0.27 * s, 7.18, 0.66], [0.15, 0.13, 0.08]));   // 眼眶
  ellipsoid(skeleton, darkMat, [0, 6.86, 0.8], [0.07, 0.1, 0.05]);           // 鼻孔
  ellipsoid(skeleton, boneMat, [0, 6.62, 0.72], [0.3, 0.07, 0.08]);           // 上排牙
  ellipsoid(skeleton, boneMat, [0, 6.5, 0.7], [0.27, 0.06, 0.08]);            // 下排牙

  // 脊柱
  const spine = new THREE.CatmullRomCurve3([
    V3(0, 6.25, -0.12), V3(0, 5.3, -0.28), V3(0, 3.8, -0.6), V3(0, 2.0, -0.55), V3(0, 0.8, -0.4), V3(0, -0.35, -0.48)
  ], false, 'centripetal');
  for (let i = 0; i < 24; i++) {
    const u = i / 23;
    const p = spine.getPoint(u), t = spine.getTangent(u);
    const r = i < 7 ? 0.11 : i < 19 ? 0.13 : 0.16;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.17, 10), boneMat);
    v.position.copy(p);
    v.quaternion.setFromUnitVectors(V3(0, 1, 0), t.normalize());
    skeleton.add(v);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.2), boneMat);   // 棘突
    sp.position.copy(p).add(V3(0, -0.02, -0.17));
    skeleton.add(sp);
  }
  ellipsoid(skeleton, boneMat, [0, -0.85, -0.5], [0.42, 0.5, 0.18], [0.35, 0, 0]);   // 薦骨

  // 肋骨（12 對）、胸骨、鎖骨、肩胛
  for (let i = 0; i < 12; i++) {
    const y0 = 4.72 - i * 0.215;
    const rx = Math.min(1.35, 0.78 + i * 0.12) - Math.max(0, i - 7) * 0.05;
    const rz = 0.82;
    const maxPhi = i < 7 ? Math.PI * 0.86 : i < 10 ? Math.PI * (0.78 - (i - 7) * 0.05) : Math.PI * 0.42;
    both(s => {
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const phi = 0.12 + (maxPhi - 0.12) * (k / 14);
        pts.push([s * rx * Math.sin(phi), y0 - 0.55 * (phi / Math.PI), -rz * Math.cos(phi) + 0.06]);
      }
      tube(skeleton, boneMat, pts, 0.045);
    });
  }
  const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.5, 0.08), boneMat);
  sternum.position.set(0, 3.72, 0.9);
  sternum.rotation.x = -0.12;
  skeleton.add(sternum);
  both(s => {
    tube(skeleton, boneMat, [sx([0.14, 4.98, 0.62], s), sx([0.85, 5.05, 0.5], s), sx([1.6, 4.85, 0.05], s)], 0.06);
    ellipsoid(skeleton, boneMat, sx([0.95, 4.05, -0.82], s), [0.5, 0.7, 0.06], [0.15, s * 0.35, s * 0.15]);
  });

  // 骨盆
  both(s => ellipsoid(skeleton, boneMat, sx([0.85, -0.35, -0.12], s), [0.55, 0.58, 0.12], [0, s * 0.7, s * -0.15]));
  const pubic = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 10, 40), boneMat);
  pubic.position.set(0, -0.85, 0.2);
  pubic.rotation.x = 1.25;
  skeleton.add(pubic);

  // 四肢
  both(s => {
    // 上肢
    ellipsoid(skeleton, boneMat, sx([1.75, 4.48, 0], s), [0.2, 0.2, 0.2]);
    bone(skeleton, sx([1.8, 4.4, 0], s), sx([2.25, 1.75, 0], s), 0.1, 0, 0.15);
    bone(skeleton, sx([2.32, 1.6, 0.1], s), sx([2.82, -0.72, 0.16], s), 0.06, 0.08, 0.08);   // 橈骨
    bone(skeleton, sx([2.2, 1.62, -0.08], s), sx([2.6, -0.76, 0.02], s), 0.06, 0.09, 0.06);  // 尺骨
    ellipsoid(skeleton, boneMat, sx([2.7, -0.92, 0.1], s), [0.2, 0.1, 0.08]);                // 腕骨
    for (let f = 0; f < 4; f++) {
      const x0 = 2.6 + f * 0.085, x1 = 2.66 + f * 0.09;
      const yTip = -2.05 - (f === 1 || f === 2 ? 0.12 : 0);
      tube(skeleton, boneMat, [sx([x0, -1.0, 0.12], s), sx([x1, -1.55, 0.14], s), sx([x1 + 0.02, yTip, 0.12], s)], 0.03);
    }
    tube(skeleton, boneMat, [sx([2.82, -0.95, 0.16], s), sx([3.0, -1.25, 0.24], s), sx([3.1, -1.52, 0.28], s)], 0.035);  // 拇指

    // 下肢
    ellipsoid(skeleton, boneMat, sx([0.62, -1.02, 0.05], s), [0.17, 0.17, 0.17]);
    bone(skeleton, sx([0.62, -1.02, 0.05], s), sx([0.98, -1.15, 0], s), 0.08, 0, 0.13);
    bone(skeleton, sx([0.95, -1.15, 0], s), sx([0.8, -4.42, 0.05], s), 0.1, 0, 0);
    ellipsoid(skeleton, boneMat, sx([0.8, -4.52, 0.02], s), [0.24, 0.16, 0.22]);
    ellipsoid(skeleton, boneMat, sx([0.8, -4.55, 0.38], s), [0.12, 0.16, 0.06]);   // 髕骨
    bone(skeleton, sx([0.74, -4.72, 0.08], s), sx([0.66, -8.18, 0.05], s), 0.09, 0.16, 0.1);   // 脛骨
    bone(skeleton, sx([1.0, -4.8, -0.06], s), sx([0.94, -8.24, -0.06], s), 0.045, 0.07, 0.08); // 腓骨
    ellipsoid(skeleton, boneMat, sx([0.74, -8.55, -0.22], s), [0.16, 0.14, 0.2]);   // 跟骨
    for (let f = 0; f < 5; f++) {
      const x = 0.58 + f * 0.085;
      tube(skeleton, boneMat, [sx([0.74, -8.45, 0.05], s), sx([x, -8.62, 0.6], s), sx([x, -8.7, 0.95 - f * 0.06], s)], 0.03);
    }
  });

  /* ---------- 臟腑 ---------- */
  const organs = new THREE.Group();
  organs.name = 'organs';
  const om = c => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.12 });
  const ORGAN = {};

  // 肺（左右）
  ORGAN.肺 = [
    ellipsoid(organs, om(0xd38c90), [0.72, 3.75, 0.0], [0.6, 1.05, 0.68]),
    ellipsoid(organs, om(0xd38c90), [-0.75, 3.75, 0.0], [0.62, 1.05, 0.68])
  ];
  tube(organs, om(0xd9c2b8), [[0, 5.7, 0.18], [0, 4.6, 0.12], [0, 4.25, 0.08]], 0.08);   // 氣管
  tube(organs, om(0xd9c2b8), [[0, 4.25, 0.08], [0.35, 4.0, 0.05], [0.6, 3.85, 0.02]], 0.05);
  tube(organs, om(0xd9c2b8), [[0, 4.25, 0.08], [-0.35, 4.0, 0.05], [-0.6, 3.85, 0.02]], 0.05);
  // 心、心包
  ORGAN.心 = [ellipsoid(organs, om(0xa83a3c), [0.22, 3.3, 0.38], [0.4, 0.48, 0.36], [0, 0, -0.5])];
  ORGAN.心包 = [ellipsoid(organs, new THREE.MeshLambertMaterial({ color: 0xe8b0a0, transparent: true, opacity: 0.35, depthWrite: false }), [0.22, 3.3, 0.38], [0.5, 0.58, 0.45], [0, 0, -0.5])];
  // 肝、膽
  ORGAN.肝 = [ellipsoid(organs, om(0x8a3b30), [-0.4, 2.45, 0.22], [1.0, 0.42, 0.62], [0, 0, 0.18])];
  ORGAN.膽 = [ellipsoid(organs, om(0x5e8a3c), [-0.62, 2.02, 0.56], [0.12, 0.2, 0.12], [0, 0, 0.4])];
  // 胃、脾
  ORGAN.胃 = [tube(organs, om(0xd99a84), [[0.22, 2.95, 0.25], [0.7, 2.62, 0.4], [0.68, 2.12, 0.5], [0.3, 1.92, 0.56], [-0.12, 2.08, 0.5]], 0.24)];
  tube(organs, om(0xd9b3a3), [[0.02, 5.3, -0.05], [0.08, 4.0, -0.15], [0.22, 2.95, 0.25]], 0.05);   // 食道
  ORGAN.脾 = [ellipsoid(organs, om(0x7a2f42), [1.0, 2.45, -0.38], [0.28, 0.42, 0.18], [0, 0, -0.3])];
  // 腎、膀胱
  ORGAN.腎 = [
    ellipsoid(organs, om(0x8b3530), [0.62, 1.4, -0.5], [0.24, 0.38, 0.18]),
    ellipsoid(organs, om(0x8b3530), [-0.62, 1.32, -0.5], [0.24, 0.38, 0.18])
  ];
  tube(organs, om(0xe3d0c4), [[0.55, 1.1, -0.45], [0.35, 0.2, -0.2], [0.18, -0.75, 0.35]], 0.025);
  tube(organs, om(0xe3d0c4), [[-0.55, 1.02, -0.45], [-0.35, 0.2, -0.2], [-0.18, -0.75, 0.35]], 0.025);
  ORGAN.膀胱 = [ellipsoid(organs, om(0xd9a0a3), [0, -0.82, 0.45], [0.32, 0.28, 0.28])];
  // 大腸（升結腸在右 x<0 → 橫結腸 → 降結腸在左 → 乙狀結腸 → 直腸）
  ORGAN.大腸 = [tube(organs, om(0xc9877b), [
    [-0.9, -0.45, 0.3], [-0.98, 0.5, 0.32], [-0.95, 1.5, 0.35], [-0.55, 1.72, 0.55], [0, 1.55, 0.62],
    [0.55, 1.72, 0.55], [0.95, 1.55, 0.35], [1.0, 0.5, 0.32], [0.92, -0.45, 0.3], [0.5, -0.72, 0.32],
    [0.1, -0.62, 0.05], [0, -1.15, -0.35]
  ], 0.17)];
  // 小腸：盤在腹中
  const coil = [];
  for (let row = 0; row < 7; row++) {
    const y = 1.2 - row * 0.26;
    const dir = row % 2 ? -1 : 1;
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const x = dir * (-0.6 + 1.2 * u);
      coil.push([x + 0.06 * Math.sin(k * 2.1 + row), y + 0.07 * Math.sin(k * 1.7 + row * 2), 0.38 + 0.14 * Math.sin(k * 1.3 + row)]);
    }
  }
  ORGAN.小腸 = [tube(organs, om(0xe0a092), coil, 0.095)];

  // 臟腑都在身體深度遮擋之前畫（才不會被透明皮膚擋掉）
  [skeleton, organs].forEach(g => g.traverse(o => { if (o.isMesh) o.renderOrder = o.material.transparent ? 2 : 0; }));
  skeleton.visible = false;
  organs.visible = false;
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

  const RULERS = [
    { name: '歧骨至臍 8寸', cun: 8, pts: [[0.16, 2.9, 1.0], [0.16, 1.8, 0.95], [0.16, 0.75, 0.9]] },
    { name: '臍至恥骨 5寸', cun: 5, pts: [[0.16, 0.75, 0.9], [0.16, -0.88, 0.9]] },
    { name: '兩乳間 8寸', cun: 8, pts: [[-0.85, 3.78, 1.0], [0, 3.88, 1.05], [0.85, 3.78, 1.0]] },
    { name: '前後髮際 12寸', cun: 12, pts: [[0.12, 7.75, 0.85], [0.12, 8.25, 0.05], [0.12, 7.4, -0.85], [0.12, 6.75, -0.62]] },
    { name: '腋前紋至肘 9寸', cun: 9, both: true, pts: [[1.85, 3.95, 0.35], [2.1, 2.8, 0.4], [2.3, 1.65, 0.38]] },
    { name: '肘至腕 12寸', cun: 12, both: true, pts: [[2.3, 1.65, 0.38], [2.5, 0.4, 0.33], [2.7, -0.8, 0.2]] },
    { name: '恥骨至股骨內上髁 18寸', cun: 18, both: true, pts: [[0.3, -1.0, 0.6], [0.35, -2.8, 0.45], [0.38, -4.5, 0.2]] },
    { name: '脛骨內側髁至內踝 13寸', cun: 13, both: true, pts: [[0.4, -4.85, 0.15], [0.42, -6.5, 0.15], [0.5, -8.3, 0.05]] },
    { name: '大轉子至膕橫紋 19寸', cun: 19, both: true, pts: [[1.5, -0.95, 0.0], [1.45, -2.8, 0.0], [1.25, -4.6, -0.1]] },
    { name: '膕橫紋至外踝 16寸', cun: 16, both: true, pts: [[1.25, -4.6, -0.1], [1.2, -6.5, 0.0], [1.0, -8.3, 0.05]] },
    { name: '肩胛內緣至脊 3寸', cun: 3, both: true, pts: [[0.02, 4.1, -1.0], [0.95, 4.1, -0.95]] }
  ];
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

/* =========================================================
 * 十二經筋（左半身）
 *   依《十二正經》講義人形圖上藍色片狀的經筋範圍：沿各經的體表走向，在皮膚上鋪一層灰白半透明的膜
 *   只畫在左半身（x > 0）；四肢窄、軀幹寬、頭面再窄一些
 *   選到某條經絡時，那條經的經筋亮一點，其他的淡下去
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { scene, meridians: MERIDIANS, view } = L;
  const JING12 = ['LU', 'LI', 'ST', 'SP', 'HT', 'SI', 'BL', 'KI', 'PC', 'SJ', 'GB', 'LR'];
  const geo = L.model.meshes.skin[0].geo;
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, I = geo.index.array;
  const nv = P.length / 3;

  // 皮膚頂點的格子索引（找路徑附近的頂點）
  const CS = 0.4, grid = new Map();
  const key = (a, b, c) => (a * 4096 + b) * 4096 + c;
  for (let i = 0; i < nv; i++) {
    if (P[i * 3] < -0.05) continue;   // 只要左半身
    const k = key(Math.floor(P[i * 3] / CS) + 2048, Math.floor(P[i * 3 + 1] / CS) + 2048, Math.floor(P[i * 3 + 2] / CS) + 2048);
    let arr = grid.get(k);
    if (!arr) grid.set(k, arr = []);
    arr.push(i);
  }
  // 片狀的半寬：四肢窄、軀幹寬、頭面窄（模型單位約 10 公分）
  function halfWidth(p) {
    if (p.y > 6.4) return 0.38;                       // 頭面
    if (p.y < -0.6 || Math.abs(p.x) > 1.75) return 0.42;   // 腿、手臂
    return 0.62;                                       // 軀幹、頸肩
  }

  const group = new THREE.Group();
  group.renderOrder = 2;
  scene.add(group);
  const mat = op => new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: op } },
    vertexShader: `
      attribute float aW;
      varying float vW; varying vec3 vN; varying vec3 vV;
      void main() {
        vW = aW;
        vec4 mv = modelViewMatrix * vec4(position + normal * 0.018, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying float vW; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 c = mix(vec3(0.72, 0.74, 0.76), vec3(0.97), 0.35 + 0.65 * f);   // 灰到白，邊緣亮，像一層膜
        gl_FragColor = vec4(c, uOpacity * vW * (0.55 + 0.6 * f));
      }`,
    transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.FrontSide
  });

  const sheets = {};
  JING12.forEach(id => {
    const m = L.byId[id];
    if (!m || !m.traces) return;
    const w = new Float32Array(nv);
    const _p = new THREE.Vector3(), _n = new THREE.Vector3();
    m.traces.forEach(tr => {
      for (let s = 0; s < tr.ps.length; s++) {
        const p = tr.ps[s], n = tr.ns[s];
        if (p.x < -0.05) continue;
        const hw = halfWidth(p), r = Math.ceil(hw / CS);
        const a0 = Math.floor(p.x / CS) + 2048, b0 = Math.floor(p.y / CS) + 2048, c0 = Math.floor(p.z / CS) + 2048;
        for (let a = a0 - r; a <= a0 + r; a++)
          for (let b = b0 - r; b <= b0 + r; b++)
            for (let c = c0 - r; c <= c0 + r; c++) {
              const arr = grid.get(key(a, b, c));
              if (!arr) continue;
              for (const i of arr) {
                _p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
                const d = _p.distanceTo(p);
                if (d >= hw) continue;
                _n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
                if (_n.dot(n) < 0.15) continue;   // 只鋪在同一面，不繞到四肢另一側
                const v = 1 - d / hw, k = v * v * (3 - 2 * v);   // 邊緣柔和
                if (k > w[i]) w[i] = k;
              }
            }
      }
    });
    const idx = [];
    for (let t = 0; t < I.length; t += 3) if (w[I[t]] > 0.02 || w[I[t + 1]] > 0.02 || w[I[t + 2]] > 0.02) idx.push(I[t], I[t + 1], I[t + 2]);
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geo.attributes.position);
    g.setAttribute('normal', geo.attributes.normal);
    g.setAttribute('aW', new THREE.BufferAttribute(w, 1));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat(0.26));
    mesh.renderOrder = 2;
    group.add(mesh);
    sheets[id] = mesh;
  });

  // 選到經絡：那條的經筋亮、其他淡；不透明皮膚時看不到
  L.hooks.frame.push(() => {
    if (!group.visible) return;
    const sel = L.selected;
    Object.entries(sheets).forEach(([id, mesh]) => {
      const target = (sel ? (id === sel ? 0.75 : 0.07) : 0.26) * (1 - view.opaque * 0.6);
      const u = mesh.material.uniforms.uOpacity;
      u.value += (target - u.value) * 0.12;
    });
  });

  L.layers.jingjin = group;
})();

/* =========================================================
 * 擬真人體模型載入
 * 資料：BodyParts3D, © The Database Center for Life Science, CC BY 4.0
 * model/body.json 說明每一塊（皮膚、骨骼、各臟腑）在 body.bin.gz 裡的位置
 * 座標：公尺 × 10，腳底 y = -8.7，面向 +z，人的右邊在 x < 0
 * ========================================================= */
(() => {
  'use strict';

  async function gunzip(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf;           // 伺服器已經解壓
    const ds = new DecompressionStream('gzip');
    return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
  }

  async function load(base, onProgress) {
    const meta = await (await fetch(base + 'body.json')).json();
    const res = await fetch(base + 'body.bin.gz');
    let buf;
    const total = +res.headers.get('content-length') || 0;
    if (res.body && total && onProgress) {
      const reader = res.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        onProgress(got / total);
      }
      buf = await new Blob(parts).arrayBuffer();
    } else {
      buf = await res.arrayBuffer();
    }
    buf = await gunzip(buf);

    const q = new Uint16Array(buf, 0, meta.verts * 3);
    const nq = new Int8Array(buf, meta.posBytes, meta.verts * 3);
    const idx = new Uint32Array(buf, meta.posBytes + meta.norBytes, meta.indices);
    const lo = meta.lo, span = meta.hi.map((h, i) => h - lo[i]);

    const meshes = {};
    meta.meshes.forEach(m => {
      const pos = new Float32Array(m.vn * 3), nor = new Float32Array(m.vn * 3);
      for (let i = 0; i < m.vn * 3; i++) {
        const k = m.v0 * 3 + i, a = i % 3;
        pos[i] = lo[a] + (q[k] / 65535) * span[a];
        nor[i] = nq[k] / 127;
      }
      const ix = new Uint32Array(m.i_n);
      for (let i = 0; i < m.i_n; i++) ix[i] = idx[m.i0 + i];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(new THREE.BufferAttribute(ix, 1));
      g.computeBoundingSphere();
      // 同一個 key 可能有兩塊（左右肺），合在一起
      (meshes[m.key] = meshes[m.key] || []).push({ ...m, geo: g });
    });
    return { meta, meshes };
  }

  window.TCMModel = { load };
})();

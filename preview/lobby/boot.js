/* 先載入真人模型與穴位資料，再依序啟動大廳各模組 */
(() => {
  'use strict';
  const el = document.getElementById('loading');
  const bar = el && el.querySelector('i');
  const say = t => { if (el) el.querySelector('span').textContent = t; };
  const SCRIPTS = ['lobby.js', 'anatomy.js', 'jingjin.js', 'tour.js', 'tools.js', 'zheng.js', 'info.js'];
  function run(i) {
    if (i >= SCRIPTS.length) { if (el) el.classList.add('done'); return; }
    const s = document.createElement('script');
    s.src = SCRIPTS[i] + (window.TCM_V ? '?v=' + window.TCM_V : '');
    s.onload = () => run(i + 1);
    s.onerror = () => say('載入失敗：' + SCRIPTS[i]);
    document.body.appendChild(s);
  }
  Promise.all([
    TCMModel.load('model/', f => { if (bar) bar.style.width = Math.round(f * 100) + '%'; }),
    fetch('model/points.json').then(r => r.json())
  ]).then(([model, pts]) => {
    window.TCM_MODEL = model;
    window.TCM_POINTS = pts;
    if (window.parent !== window) window.parent.postMessage({ type: 'tcm-lobby-loaded' }, '*');   // 外層這時才開始下載資料庫
    say('建立經絡…');
    setTimeout(() => run(0), 30);
  }).catch(e => { console.error(e); say('人體模型載入失敗，請重新整理'); });
})();

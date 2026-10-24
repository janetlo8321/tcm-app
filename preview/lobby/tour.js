/* =========================================================
 * 經絡銅人・循行動畫（依《靈樞・經脈》）
 * 點一下經絡 → 下方出現播放列：▶／❚❚、復位、進度、分享
 * 體表走向（紅橘）沿經絡線前進；體內走向（淡黃）穿過臟腑
 *
 * 每條經絡的 tour：[{ t: 字幕, parts: [...] }]
 *   { ext: [a, b] }   沿本經體表，從 a 穴走到 b 穴
 *   { skin: [...] }   貼著皮膚走過這些點
 *   { in: [...] }     體內走向（不貼皮）
 *   點可以是 [x, y, z]、'LU9'（右側穴位）、'-LI20'（對側穴位）
 * 畫在銅人的左側（x > 0）；路線為示意
 * ========================================================= */
(() => {
  'use strict';
  const L = window.TCMLobby;
  if (!L) return;
  const { scene, camera, stage, snapToSkin, atLength, SKIN_OFF, byId, points: PT, view } = L;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // 體內位置：取自真人模型的臟腑（model/points.json 的 landmarks）
  const LM = L.landmarks;
  const ptOf = code => { const m = code.match(/^([A-Z]+)(\d+)$/); const o = PT.find(p => p.m.id === m[1] && p.no === +m[2] && p.side > 0); return o.p; };
  const inside = (code, depth, dx = 0) => { const p = ptOf(code); return [p.x + dx, p.y, p.z - depth]; };
  const 中焦 = inside('REN12', 0.55, 0.1), 胃口 = LM.胃口, 胃 = LM.胃, 肺 = LM.肺;
  const 心 = LM.心, 心系 = [LM.心[0] - 0.05, LM.心[1] + 0.55, LM.心[2] - 0.1], 胸中 = inside('REN17', 0.55), 脾 = LM.脾;
  const 肝 = LM.肝, 膽 = LM.膽, 腎 = LM.腎, 膀胱 = LM.膀胱;
  const 小腸 = LM.小腸, 大腸 = LM.大腸, 三焦下 = inside('REN4', 0.6), 胞中 = inside('REN3', 0.75);

  // 路線裡直接寫的座標是照舊版示意身體寫的：依任脈各穴的高度對應到真人模型
  const OLD_Y = [-8.7, -0.88, 0.75, 2.9, 3.6, 5.15, 6.3, 8.21];
  const NEW_Y = [-8.7, ptOf('REN2').y, ptOf('REN8').y, ptOf('REN15').y, ptOf('REN17').y, ptOf('REN22').y, ptOf('REN24').y, ptOf('DU20').y];
  function remap(v) {
    const y = v[1];
    let i = 0;
    while (i < OLD_Y.length - 2 && y > OLD_Y[i + 1]) i++;
    const t = (y - OLD_Y[i]) / (OLD_Y[i + 1] - OLD_Y[i]);
    const ny = NEW_Y[i] + t * (NEW_Y[i + 1] - NEW_Y[i]);
    const torso = ny > NEW_Y[1] - 0.3 && ny < NEW_Y[5] + 0.3;
    return [v[0], ny, torso ? v[2] * 1.12 : v[2]];
  }
  const O = (x, y, z) => remap([x, y, z]);

  const TOURS = {
    LU: [
      { t: '起於中焦', parts: [{ in: [中焦, O(0.12, 1.95, 0.48)] }] },
      { t: '下絡大腸', parts: [{ in: [中焦, O(0.3, 1.2, 0.5), O(0.55, 1.62, 0.55)] }] },
      { t: '還循胃口', parts: [{ in: [O(0.55, 1.62, 0.55), O(0.3, 2.3, 0.4), 胃口] }] },
      { t: '上膈屬肺', parts: [{ in: [胃口, O(0.15, 3.4, 0.15), 肺] }] },
      { t: '從肺系橫出腋下', parts: [{ in: [肺, O(0.1, 4.5, 0.12), O(0.7, 4.45, 0.4), 'LU1'] }] },
      { t: '下循臑內，行少陰心主之前，下肘中', parts: [{ ext: [1, 5] }] },
      { t: '循臂內上骨下廉，入寸口', parts: [{ ext: [5, 9] }] },
      { t: '上魚，循魚際，出大指之端', parts: [{ ext: [9, 11] }] },
      { t: '其支者，從腕後直出次指內廉，出其端', parts: [{ skin: ['LU7', O(2.98, -1.3, 0.1), 'LI1'] }] }
    ],
    LI: [
      { t: '起於大指次指之端，出合谷兩骨之間', parts: [{ ext: [1, 4] }] },
      { t: '上入兩筋之中，循臂上廉，入肘外廉', parts: [{ ext: [4, 11] }] },
      { t: '上臑外前廉，上肩，出髃骨之前廉', parts: [{ ext: [11, 15] }] },
      { t: '上出於柱骨之會上', parts: [{ skin: ['LI15', 'LI16', O(0.4, 5.3, -0.45), 'DU14'] }] },
      { t: '下入缺盆，絡肺', parts: [{ in: ['DU14', O(0.5, 5.1, -0.1), 'ST12', 肺] }] },
      { t: '下膈，屬大腸', parts: [{ in: [肺, O(0.5, 2.6, 0.2), O(0.85, 1.2, 0.4), 大腸] }] },
      { t: '其支者，從缺盆上頸，貫頰', parts: [{ skin: ['ST12', 'LI17', 'LI18', O(0.45, 6.3, 0.55)] }] },
      { t: '入下齒中，還出挾口，交人中', parts: [{ in: [O(0.45, 6.3, 0.55), O(0.25, 6.45, 0.78)] }, { skin: [O(0.25, 6.5, 0.9), 'DU26'] }] },
      { t: '左之右，右之左，上挾鼻孔', parts: [{ skin: ['DU26', '-LI19', '-LI20'] }] }
    ],
    ST: [
      { t: '起於鼻，交頞中，旁納太陽之脈', parts: [{ skin: ['LI20', O(0.1, 7.05, 1.0), 'BL1'] }] },
      { t: '下循鼻外，入上齒中', parts: [{ skin: ['BL1', 'ST1'] }, { ext: [1, 3] }, { in: ['ST3', O(0.2, 6.6, 0.75)] }] },
      { t: '還出挾口環唇，下交承漿', parts: [{ skin: [O(0.22, 6.58, 0.9), 'ST4', 'REN24'] }] },
      { t: '卻循頤後下廉，出大迎，循頰車，上耳前', parts: [{ skin: ['REN24', 'ST5', 'ST6', 'ST7'] }] },
      { t: '過客主人，循髮際，至額顱', parts: [{ ext: [7, 8] }, { skin: ['ST8', 'DU24'] }] },
      { t: '其支者，從大迎前下人迎，循喉嚨，入缺盆', parts: [{ skin: ['ST5', 'ST9'] }, { ext: [9, 12] }] },
      { t: '下膈，屬胃，絡脾', parts: [{ in: ['ST12', O(0.4, 4.5, 0.2), O(0.3, 3.2, 0.2), 胃, 脾] }] },
      { t: '其直者，從缺盆下乳內廉', parts: [{ ext: [12, 18] }] },
      { t: '下挾臍，入氣街中', parts: [{ ext: [18, 30] }] },
      { t: '其支者，起於胃口，下循腹裡，至氣街中而合', parts: [{ in: [胃口, O(0.4, 1.0, 0.45), 'ST30'] }] },
      { t: '以下髀關，抵伏兔，下膝臏中', parts: [{ ext: [30, 35] }] },
      { t: '下循脛外廉，下足跗，入中指內間', parts: [{ ext: [35, 45] }] },
      { t: '其支者，下廉三寸而別，下入中指外間', parts: [{ skin: ['ST36', 'ST40', 'ST41', LM.中趾外間] }] },
      { t: '其支者，別跗上，入大指間，出其端', parts: [{ skin: ['ST42', 'SP1'] }] }
    ],
    SP: [
      { t: '起於大指之端，循指內側白肉際', parts: [{ ext: [1, 3] }] },
      { t: '上內踝前廉，上踹內，循脛骨後', parts: [{ ext: [3, 9] }] },
      { t: '上膝股內前廉', parts: [{ ext: [9, 12] }] },
      { t: '入腹，屬脾，絡胃', parts: [{ ext: [12, 15] }, { in: ['SP15', 脾, 胃] }] },
      { t: '上膈，挾咽，連舌本，散舌下', parts: [{ in: [胃, O(0.3, 3.5, 0.1), O(0.1, 5.4, 0.1), O(0.05, 6.2, 0.4), O(0, 6.4, 0.55)] }] },
      { t: '其支者，復從胃，別上膈，注心中', parts: [{ in: [胃, O(0.35, 2.9, 0.3), 心] }] },
      { t: '（體表）上行胸脅，終於大包', parts: [{ ext: [15, 21] }] }
    ],
    HT: [
      { t: '起於心中，出屬心系', parts: [{ in: [心, 心系] }] },
      { t: '下膈，絡小腸', parts: [{ in: [心系, O(0.15, 2.6, 0.3), 小腸] }] },
      { t: '其支者，從心系上挾咽，繫目系', parts: [{ in: [心系, O(0.1, 5.5, 0.1), O(0.15, 6.6, 0.4), O(0.3, 7.2, 0.6)] }] },
      { t: '其直者，復從心系卻上肺，下出腋下', parts: [{ in: [心系, 肺, 'HT1'] }] },
      { t: '下循臑內後廉，下肘內', parts: [{ ext: [1, 3] }] },
      { t: '循臂內後廉，抵掌後銳骨之端', parts: [{ ext: [3, 7] }] },
      { t: '入掌內後廉，循小指之內，出其端', parts: [{ ext: [7, 9] }] }
    ],
    SI: [
      { t: '起於小指之端，循手外側上腕，出踝中', parts: [{ ext: [1, 6] }] },
      { t: '直上循臂骨下廉，出肘內側兩筋之間', parts: [{ ext: [6, 8] }] },
      { t: '上循臑外後廉，出肩解，繞肩胛，交肩上', parts: [{ ext: [8, 15] }, { skin: ['SI15', 'DU14'] }] },
      { t: '入缺盆，絡心', parts: [{ in: ['DU14', O(0.5, 5.1, -0.1), 'ST12', 心] }] },
      { t: '循咽，下膈，抵胃，屬小腸', parts: [{ in: [心, O(0.05, 3.0, 0.0), 胃, 小腸] }] },
      { t: '其支者，從缺盆循頸上頰，至目銳眥', parts: [{ skin: ['ST12', 'SI16', 'SI17', 'SI18', 'GB1'] }] },
      { t: '卻入耳中', parts: [{ skin: ['GB1', 'SI19'] }, { in: ['SI19', LM.耳中] }] },
      { t: '其支者，別頰上䪼，抵鼻，至目內眥，斜絡於顴', parts: [{ skin: ['SI17', 'SI18', LM.鼻旁, 'BL1'] }, { skin: ['BL1', 'SI18'] }] }
    ],
    BL: [
      { t: '起於目內眥，上額交巔', parts: [{ ext: [1, 7] }, { skin: ['BL7', 'DU20'] }] },
      { t: '其支者，從巔至耳上角', parts: [{ skin: ['DU20', 'GB8'] }] },
      { t: '其直者，從巔入絡腦，還出別下項', parts: [{ in: ['DU20', O(0.05, 7.6, -0.1), 'BL10'] }] },
      { t: '循肩髆內，挾脊抵腰中', parts: [{ ext: [10, 23] }] },
      { t: '入循膂，絡腎，屬膀胱', parts: [{ in: ['BL23', 腎, O(0.3, 0.2, 0.0), 膀胱] }] },
      { t: '其支者，從腰中下挾脊，貫臀，入膕中', parts: [{ ext: [23, 40] }] },
      { t: '其支者，從髆內左右別下貫胛，挾脊內', parts: [{ skin: ['BL10', 'BL41'] }, { ext: [41, 54] }] },
      { t: '過髀樞，循髀外，從後廉下合膕中', parts: [{ skin: ['BL54', 'GB30', O(0.95, -2.8, -0.6), 'BL40'] }] },
      { t: '以下貫踹內，出外踝之後', parts: [{ skin: ['BL40', 'BL55'] }, { ext: [55, 60] }] },
      { t: '循京骨，至小指外側', parts: [{ ext: [60, 67] }] }
    ],
    KI: [
      { t: '起於小指之下，邪走足心', parts: [{ skin: ['BL67', 'KI1'] }] },
      { t: '出於然谷之下，循內踝之後，別入跟中', parts: [{ ext: [1, 7] }] },
      { t: '以上踹內，出膕內廉，上股內後廉', parts: [{ ext: [7, 10] }, { skin: ['KI10', O(0.3, -2.8, -0.1), 'DU1'] }] },
      { t: '貫脊，屬腎，絡膀胱', parts: [{ in: ['DU1', O(0.2, 0.3, -0.5), 腎, O(0.3, 0.2, 0.1), 膀胱] }] },
      { t: '其直者，從腎上貫肝膈，入肺中', parts: [{ in: [腎, 肝, O(0.15, 3.0, 0.1), 肺] }] },
      { t: '循喉嚨，挾舌本', parts: [{ in: [肺, O(0.1, 5.3, 0.15), O(0.05, 6.3, 0.5)] }] },
      { t: '其支者，從肺出絡心，注胸中', parts: [{ in: [肺, 心, 胸中] }] },
      { t: '（體表）從橫骨上行至俞府', parts: [{ ext: [11, 27] }] }
    ],
    PC: [
      { t: '起於胸中，出屬心包絡', parts: [{ in: [胸中, 心] }] },
      { t: '下膈，歷絡三焦', parts: [{ in: [心, O(0.1, 2.5, 0.4), O(0.1, 1.0, 0.5), 三焦下] }] },
      { t: '其支者，循胸出脅，下腋三寸', parts: [{ in: [胸中, 'PC1'] }] },
      { t: '上抵腋，下循臑內，入肘中', parts: [{ ext: [1, 3] }] },
      { t: '下臂，行兩筋之間，入掌中', parts: [{ ext: [3, 8] }] },
      { t: '循中指，出其端', parts: [{ ext: [8, 9] }] },
      { t: '其支者，別掌中，循小指次指出其端', parts: [{ skin: ['PC8', 'SJ1'] }] }
    ],
    SJ: [
      { t: '起於小指次指之端，上出兩指之間，循手表腕', parts: [{ ext: [1, 4] }] },
      { t: '出臂外兩骨之間，上貫肘', parts: [{ ext: [4, 10] }] },
      { t: '循臑外上肩，而交出足少陽之後', parts: [{ ext: [10, 15] }] },
      { t: '入缺盆，布膻中，散絡心包', parts: [{ in: ['SJ15', 'ST12', 胸中, 心] }] },
      { t: '下膈，循屬三焦', parts: [{ in: [心, O(0.1, 2.5, 0.4), O(0.1, 1.0, 0.5), 三焦下] }] },
      { t: '其支者，從膻中上出缺盆，上項，繫耳後', parts: [{ in: [胸中, 'ST12'] }, { skin: ['ST12', 'SJ16'] }, { ext: [16, 17] }] },
      { t: '直上出耳上角，以屈下頰至䪼', parts: [{ ext: [17, 20] }, { skin: ['SJ20', 'SI18'] }] },
      { t: '其支者，從耳後入耳中，出走耳前，至目銳眥', parts: [{ ext: [20, 23] }, { skin: ['SJ23', 'GB1'] }] }
    ],
    GB: [
      { t: '起於目銳眥，上抵頭角，下耳後', parts: [{ ext: [1, 12] }] },
      { t: '其支者，從耳後入耳中，出走耳前，至目銳眥後', parts: [{ skin: ['GB12', 'SJ17'] }, { in: ['SJ17', LM.耳中, 'SI19'] }, { skin: ['SI19', 'GB2', 'GB1'] }] },
      { t: '循頸，行手少陽之前，至肩上', parts: [{ ext: [12, 21] }] },
      { t: '入缺盆', parts: [{ skin: ['GB21', 'ST12'] }] },
      { t: '其支者，別銳眥，下大迎，合於手少陽，抵於䪼', parts: [{ skin: ['GB1', 'ST5', 'SI18'] }] },
      { t: '下加頰車，下頸，合缺盆', parts: [{ skin: ['SI18', 'ST6', 'SJ16', 'ST12'] }] },
      { t: '下頸合缺盆，以下胸中，貫膈，絡肝，屬膽', parts: [{ in: ['ST12', O(0.4, 4.2, 0.3), O(0.3, 3.0, 0.3), 肝, 膽] }] },
      { t: '循脅裡，出氣街，繞毛際，橫入髀厭中', parts: [{ in: [膽, O(0.5, 1.5, 0.5), 'ST30'] }, { skin: ['ST30', O(0.25, -1.05, 0.85), O(0.9, -1.2, 0.5), 'GB30'] }] },
      { t: '其直者，從缺盆下腋，循胸，過季脅', parts: [{ skin: ['ST12', 'GB22'] }, { ext: [22, 25] }] },
      { t: '下合髀厭中', parts: [{ ext: [25, 30] }] },
      { t: '以下循髀陽，出膝外廉', parts: [{ ext: [30, 33] }] },
      { t: '下外輔骨之前，直下抵絕骨之端', parts: [{ ext: [33, 39] }] },
      { t: '下出外踝之前，循足跗上，入小指次指之間', parts: [{ ext: [39, 44] }] },
      { t: '其支者，別跗上，入大指之間，出其端', parts: [{ skin: ['GB41', 'LR1'] }] }
    ],
    LR: [
      { t: '起於大指叢毛之際，上循足跗上廉，去內踝一寸', parts: [{ ext: [1, 4] }] },
      { t: '上踝八寸，交出太陰之後，上膕內廉', parts: [{ ext: [4, 8] }] },
      { t: '循股陰，入毛中，過陰器', parts: [{ ext: [8, 12] }, { in: ['LR12', O(0.15, -1.3, 0.55), O(0, -1.42, 0.4), O(-0.15, -1.3, 0.55), O(0.05, -1.05, 0.65)] }] },
      { t: '抵小腹，挾胃，屬肝，絡膽', parts: [{ in: [O(0.05, -1.05, 0.65), O(0.3, -0.3, 0.5), 胃, 肝, 膽] }] },
      { t: '上貫膈，布脅肋', parts: [{ in: [膽, O(0.3, 2.9, 0.4), 'LR14'] }, { skin: ['LR14', 'LR13'] }] },
      { t: '循喉嚨之後，上入頏顙，連目系', parts: [{ in: [O(0.3, 2.9, 0.3), O(0.05, 5.3, -0.05), O(0.1, 6.6, 0.2), O(0.3, 7.2, 0.6)] }] },
      { t: '上出額，與督脈會於巔', parts: [{ in: [O(0.3, 7.2, 0.6), O(0.25, 7.6, 0.7)] }, { skin: [O(0.25, 7.75, 0.75), 'DU20'] }] },
      { t: '其支者，從目系下頰裡，環唇內', parts: [{ in: [O(0.3, 7.2, 0.6), O(0.4, 6.6, 0.6), O(0.2, 6.45, 0.75), O(0, 6.42, 0.8), O(-0.2, 6.45, 0.75)] }] },
      { t: '其支者，復從肝，別貫膈，上注肺', parts: [{ in: [肝, O(0.4, 3.0, 0.2), 肺] }] }
    ],
    REN: [
      { t: '起於中極之下，出會陰', parts: [{ in: [胞中, 'REN1'] }] },
      { t: '上毛際，循腹裡，上關元', parts: [{ ext: [1, 4] }] },
      { t: '至咽喉', parts: [{ ext: [4, 22] }] },
      { t: '上頤，循面，入目', parts: [{ ext: [22, 24] }, { skin: ['REN24', 'ST4', 'ST1'] }] }
    ],
    DU: [
      { t: '起於少腹以下骨中央，出會陰', parts: [{ in: [胞中, 'REN1'] }] },
      { t: '繞篡後，循脊裡', parts: [{ skin: ['REN1', 'DU1'] }, { ext: [1, 14] }] },
      { t: '上至風府，入屬於腦', parts: [{ ext: [14, 16] }, { in: ['DU16', O(0, 7.4, -0.1)] }] },
      { t: '上巔，循額，至鼻柱', parts: [{ in: [O(0, 7.4, -0.1), 'DU18'] }, { ext: [18, 28] }] }
    ]
  };

  /* ---------- 路線建構 ---------- */
  function resolve(tok) {
    if (Array.isArray(tok)) return V3(tok[0], tok[1], tok[2]);
    const mirrorIt = tok[0] === '-';
    const code = mirrorIt ? tok.slice(1) : tok;
    const m = code.match(/^([A-Z]+)(\d+)$/);
    const o = m && PT.find(p => p.m.id === m[1] && p.no === +m[2] && p.side > 0);
    if (!o) { console.warn('[循行] 找不到穴位', tok); return V3(0, 0, 0); }
    const p = o.p.clone();
    if (mirrorIt) p.x = -p.x;
    return p;
  }
  function sampleCurve(pts, step) {
    if (pts.length < 2) return pts.map(p => p.clone());
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    let chord = 0;
    for (let i = 1; i < pts.length; i++) chord += pts[i].distanceTo(pts[i - 1]);
    const n = Math.max(4, Math.ceil(chord / step));
    return Array.from({ length: n + 1 }, (_, i) => curve.getPoint(i / n));
  }
  function skinPath(pts) {
    const ps = sampleCurve(pts, 0.05).map(p => snapToSkin(p, SKIN_OFF + 0.012).p);
    for (let pass = 0; pass < 2; pass++) {
      const prev = ps.map(p => p.clone());
      for (let i = 1; i < ps.length - 1; i++) ps[i].copy(prev[i]).multiplyScalar(0.5).addScaledVector(prev[i - 1], 0.25).addScaledVector(prev[i + 1], 0.25);
    }
    return ps;
  }
  function extPath(m, a, b) {
    const A = m.ptL[a], B = m.ptL[b];
    if (!A || !B) return [];
    if (A.tr !== B.tr) return [atLength(A.tr, A.L).p, atLength(B.tr, B.L).p];
    const out = [atLength(A.tr, A.L).p];
    const { ps, cum } = A.tr;
    for (let i = 0; i < ps.length; i++) if (cum[i] > A.L + 1e-4 && cum[i] < B.L - 1e-4) out.push(ps[i].clone());
    if (a !== b) out.push(atLength(B.tr, B.L).p);
    return out.map(p => p.clone().addScaledVector(snapToSkin(p, 0).n, 0.012));
  }

  const tourVS = `
    attribute float aU; attribute float aKind;
    uniform float uRadius;
    varying float vU; varying float vKind; varying float vEdge;
    void main() {
      vec3 c = (modelMatrix * vec4(position, 1.0)).xyz;
      float d = distance(cameraPosition, c);
      vec3 wn = normalize(mat3(modelMatrix) * normal);
      vEdge = abs(dot(wn, normalize(cameraPosition - c)));
      vU = aU; vKind = aKind;
      gl_Position = projectionMatrix * viewMatrix * vec4(c + wn * uRadius * clamp(d / 22.0, 0.05, 1.35), 1.0);
    }`;
  const tourFS = `
    uniform float uProg; uniform float uTotal; uniform float uTime; uniform float uOpaque;
    varying float vU; varying float vKind; varying float vEdge;
    void main() {
      // 體表：橘色；進入深層（臟腑）：深橘色，方便區分
      vec3 ext = vec3(0.98, 0.5, 0.2);
      vec3 inn = vec3(0.72, 0.2, 0.04);
      vec3 col = mix(inn, ext, vKind);
      float a = mix(0.95 * (1.0 - 0.4 * uOpaque), 0.92, vKind) * (0.55 + 0.45 * vEdge);
      gl_FragColor = vec4(col, a);
    }`;

  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,250,220,1)');
    grd.addColorStop(0.25, 'rgba(255,230,140,0.75)');
    grd.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const cache = {};
  function buildTour(m) {
    if (cache[m.id]) return cache[m.id];
    const steps = TOURS[m.id] || [];
    const pts = [], kinds = [], bounds = [];
    steps.forEach(step => {
      const i0 = pts.length;
      step.parts.forEach(part => {
        let seg, kind;
        if (part.ext) { seg = extPath(m, part.ext[0], part.ext[1]); kind = 1; }
        else if (part.skin) { seg = skinPath(part.skin.map(resolve)); kind = 1; }
        else { seg = sampleCurve(part.in.map(resolve), 0.05); kind = 0; }
        seg.forEach(p => {
          if (pts.length && p.distanceTo(pts[pts.length - 1]) < 0.012) return;
          pts.push(p); kinds.push(kind);
        });
      });
      bounds.push([i0, Math.max(i0, pts.length - 1)]);
    });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[cum.length - 1] || 1;

    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const segs = Math.min(3000, pts.length * 2), radial = 6;
    const geo = new THREE.TubeGeometry(curve, segs, 0.001, radial, false);
    const count = geo.getAttribute('position').count;
    const aU = new Float32Array(count), aKind = new Float32Array(count);
    let j = 1;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, Lu = u * total;
      while (j < cum.length - 1 && cum[j] < Lu) j++;
      for (let r = 0; r <= radial; r++) {
        aU[i * (radial + 1) + r] = u;
        aKind[i * (radial + 1) + r] = kinds[j];
      }
    }
    geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    geo.setAttribute('aKind', new THREE.BufferAttribute(aKind, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uTotal: { value: total }, uTime: { value: 0 }, uRadius: { value: 0.038 }, uOpaque: { value: 0 } },
      vertexShader: tourVS, fragmentShader: tourFS,
      transparent: true, depthWrite: false, depthTest: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 6;
    mesh.visible = false;
    scene.add(mesh);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    head.renderOrder = 7;
    head.visible = false;
    scene.add(head);
    const stepsL = bounds.map(([a, b], k) => ({ t: steps[k].t, L0: cum[a], L1: cum[b] }));
    return (cache[m.id] = { m, mesh, mat, head, curve, total, steps: stepsL });
  }

  /* ---------- 循行面板 ----------
   * 選到經絡時：體表＋入臟腑的整條橘線直接顯示
   * 右下角一個小圓點：點開才出現面板（▶ 讓一點柔光沿經絡不斷循環、字幕、分享） */
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'pl-dot';
  dot.setAttribute('aria-label', '循行');
  dot.innerHTML = '<i></i>';
  stage.appendChild(dot);

  const player = document.createElement('div');
  player.className = 'player';
  player.innerHTML = `
    <div class="pl-name"></div>
    <div class="pl-cap"></div>
    <div class="pl-bar">
      <button type="button" class="pl-play" aria-label="循行">▶</button>
      <input type="range" class="pl-range" min="0" max="1000" value="0" aria-label="光點位置">
      <button type="button" class="pl-share">分享</button>
    </div>`;
  stage.appendChild(player);
  const $p = s => player.querySelector(s);

  /* 播放循行時，左側毛玻璃方框顯示整段「循行」經文，正在走的那一句會亮起來 */
  const trp = document.createElement('div');
  trp.className = 'ip tr-ip';
  trp.innerHTML = '<div class="ip-glass"></div><div class="ip-body"></div>';
  stage.appendChild(trp);
  const trBody = trp.querySelector('.ip-body');
  let JING = null, trFor = null, trK = -1;
  fetch('model/jing.json').then(r => r.json()).then(d => { JING = d; if (cur) trRender(); }).catch(() => {});
  const PUNC = /[，。、；：！？●（）()\s「」]/;
  const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function trRender() {
    trFor = cur && cur.m.id; trK = -1;
    const html = cur && trHtml(cur.m);
    trBody.innerHTML = html ? `<section><h3>循行<small>${esc(cur.m.name)}</small></h3><p class="ip-p">${html}</p></section>` : '';
  }
  function trHtml(m) {   // 循行經文，每一句字幕對到的範圍包成 .tr-s
    const j = JING && JING[m.id];
    const sec = j && (j.secs || []).find(x => x.h === '循行');
    if (!sec || !TOURS[m.id]) return '';
    const steps = buildTour(m).steps;
    const text = sec.p.join('\n');
    // 去掉標點後比對每一句字幕，找出它在經文裡的範圍
    // 字幕和講義用字略有出入（裏／裡、別目銳眥／別銳眥…），所以用句首、句尾幾個字當錨點
    const VAR = { '裏': '裡', '脇': '脅', '䪼': '頔', '顑': '頔', '于': '於' };
    const nz = c => VAR[c] || c;
    const pos = [], norm = [];
    for (let i = 0; i < text.length; i++) if (!PUNC.test(text[i])) { pos.push(i); norm.push(nz(text[i])); }
    const N = norm.join('');
    const find = (q, from, head) => {
      for (let n = Math.min(4, q.length); n >= 2; n--) {
        const at = N.indexOf(head ? q.slice(0, n) : q.slice(-n), from);
        if (at >= 0) return head ? at : at + n;
      }
      return -1;
    };
    const marks = [];
    let from = 0;
    steps.forEach((st, k) => {
      const q = st.t.split('').filter(c => !PUNC.test(c)).map(nz).join('');
      if (!q) return;
      let a = find(q, from, true);
      if (a < 0) a = find(q, Math.max(0, from - 12), true);
      if (a < 0) return;
      const e = find(q, a + 1, false);
      if (e < 0 || e - a > q.length * 2 + 4) return;
      marks.push({ k, a: pos[a], b: pos[e - 1] + 1 });
      from = e;
    });
    marks.sort((x, y) => x.a - y.a);
    let html = '', i = 0;
    for (const mk of marks) {
      if (mk.a < i) mk.a = i;
      if (mk.b <= mk.a) continue;
      html += esc(text.slice(i, mk.a)) + `<span class="tr-s" data-k="${mk.k}">${esc(text.slice(mk.a, mk.b))}</span>`;
      i = mk.b;
    }
    html += esc(text.slice(i));
    return html.replace(/●/g, '<br>●').replace(/\n/g, '<br>').replace(/^<br>/, '');
  }
  function trStep(st) {
    if (!cur || !st) return;
    if (trFor !== cur.m.id) trRender();
    const k = cur.steps.indexOf(st);
    if (k === trK) return;
    trK = k;
    document.querySelectorAll(`.tr-s[data-m="${cur.m.id}"], .tr-ip .tr-s`).forEach(el => {
      const hit = +el.dataset.k === k; el.classList.toggle('on', hit);
      if (!hit) return;
      const box = el.closest('.ip-body'); if (!box || !box.offsetParent) return;
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (r.top < b.top + 40 || r.bottom > b.bottom - 40) box.scrollTo({ top: box.scrollTop + r.top - b.top - b.height / 3, behavior: 'smooth' });
    });
  }
  const nameEl = $p('.pl-name'), capEl = $p('.pl-cap'), playBtn = $p('.pl-play'), range = $p('.pl-range');

  let cur = null, playing = false, prog = 0, open = false;
  const SPEED = 1.3;   // 光點每秒前進的長度

  function setOpen(on) {
    open = on;
    player.classList.toggle('show', on && !!cur);
    dot.classList.toggle('on', on);
    stage.classList.toggle('has-player', on && !!cur);
    trp.classList.toggle('show', on && !!cur);
    if (on && cur) trStep(stepAt(prog * cur.total) || cur.steps[0]);
  }
  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? '❚❚' : '▶';
    if (typeof syncBtn === 'function') syncBtn();
    if (!on && cur) cur.head.visible = false;
  }
  function stepAt(L0) {
    if (!cur) return null;
    let s = cur.steps[0];
    for (const st of cur.steps) if (L0 >= st.L0 - 1e-3) s = st;
    return s;
  }
  function show(id) {
    if (cur) { cur.mesh.visible = false; cur.head.visible = false; }
    const m = id && L.byId[id];
    if (!m || !TOURS[m.id]) { cur = null; setPlaying(false); setOpen(false); dot.classList.remove('show'); return; }
    cur = buildTour(m);
    cur.mesh.visible = true;
    prog = 0; range.value = 0;
    nameEl.innerHTML = '';
    nameEl.append(m.name);
    capEl.textContent = cur.steps.length ? cur.steps[0].t : '';
    dot.classList.add('show');
    setOpen(open);
    if (playing) setPlaying(true);
  }
  L.hooks.select.push(show);

  dot.addEventListener('click', () => {
    setOpen(!open);
    if (open && !playing) setPlaying(true);   // 展開就開始循行
    if (!open) setPlaying(false);
  });
  playBtn.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => {
    prog = range.value / 1000;
    const st = stepAt(prog * (cur ? cur.total : 0));
    if (st) { capEl.textContent = st.t; trStep(st); }
  });
  $p('.pl-share').addEventListener('click', async () => {
    if (!cur) return;
    const url = location.href.split('#')[0] + '#' + cur.m.id;
    const text = `${cur.m.name}循行：` + cur.steps.map(s => s.t).join('，');
    try {
      if (navigator.share) { await navigator.share({ title: cur.m.name + '循行', text, url }); return; }
      await navigator.clipboard.writeText(text + '\n' + url);
      L.toast('已複製循行文字與連結');
    } catch (e) { /* 使用者取消分享 */ }
  });

  const _hp = new THREE.Vector3();
  let lastT = 0;
  L.hooks.frame.push((t, dist) => {
    const dt = Math.min(0.1, t - lastT);
    lastT = t;
    if (!cur) return;
    cur.mat.uniforms.uOpaque.value = view.opaque;
    if (!playing) return;
    prog += (SPEED / cur.total) * dt;
    if (prog >= 1) prog -= 1;                     // 走完一圈從頭再來
    range.value = Math.round(prog * 1000);
    cur.curve.getPointAt(prog, _hp);
    cur.head.position.copy(_hp);
    const s = Math.min(0.7, Math.max(0.1, dist * 0.018)) * (0.92 + 0.08 * Math.sin(t * 3));
    cur.head.scale.set(s, s, 1);
    cur.head.visible = true;
    const st = stepAt(prog * cur.total);
    if (st && capEl.textContent !== st.t) { capEl.textContent = st.t; trStep(st); }
  });

  // 分享連結：#LU 之類，開啟時直接點亮該經
  const h = (location.hash || '').slice(1).toUpperCase();
  if (L.byId[h]) setTimeout(() => L.select(h), 300);

  /* 經絡資訊面板（點兩下經絡）：「循行」標題旁一顆小亮點，按了光點沿經絡跑，面板裡的經文跟著一句句亮起來 */
  function infoHook() {
    const body = document.querySelector('.ip:not(.tr-ip):not(.ip-left) .ip-body');
    if (!body) return false;
    const deco = () => {
      const id = L.info && L.info.openId, m = id && L.byId[id];
      if (!m || !TOURS[m.id]) return;
      const html = trHtml(m); if (!html) return;
      body.querySelectorAll('.ip-sec').forEach(sec => {
        const h = sec.querySelector('h3');
        if (!h || h.textContent.trim().replace('●', '') !== '循行' || sec.dataset.tr) return;
        sec.dataset.tr = 1;
        sec.querySelectorAll('.ip-p').forEach((p, i) => { if (i) p.remove(); });
        const p = sec.querySelector('.ip-p'); if (!p) return;
        p.innerHTML = html.replace(/class="tr-s"/g, `class="tr-s" data-m="${m.id}"`);
        if (L.xue && L.xue.linkify) L.xue.linkify(p);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ip-play'; b.dataset.m = m.id; b.setAttribute('aria-label', '播放循行'); b.innerHTML = '<i></i>';
        h.appendChild(b);
        syncBtn();
      });
      trK = -1;
    };
    new MutationObserver(deco).observe(body, { childList: true });
    body.addEventListener('click', e => {
      const b = e.target.closest('.ip-play'); if (!b) return;
      e.stopPropagation();
      if (!cur || cur.m.id !== b.dataset.m) L.select(b.dataset.m);
      if (playing) { setPlaying(false); }
      else { if (!open) setOpen(true); setPlaying(true); trK = -1; trStep(stepAt(prog * cur.total)); }
      syncBtn();
    });
    deco();
    return true;
  }
  function syncBtn() { document.querySelectorAll('.ip-play').forEach(b => b.classList.toggle('on', playing && cur && cur.m.id === b.dataset.m)); }
  (function wait(n) { if (!infoHook() && n < 100) setTimeout(() => wait(n + 1), 200); })(0);

  L.tour = { TOURS, show, play: () => { if (!cur) return; setOpen(true); setPlaying(true); } };
})();

# 依《當代針灸大成》取法（骨度分寸＋骨性標誌）在 BodyParts3D 真人模型上定位十四經穴
# 全部在人的左側（x > 0）計算，前端再鏡像到右側
import sys, json, numpy as np
sys.path.insert(0, '/tmp/claude-0/work')
from lm import *

def unit(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
def lerp(a, b, t): return np.asarray(a, float) + (np.asarray(b, float) - np.asarray(a, float)) * t
X, Y, Z = np.eye(3)
SV = SKIN.vertices

def slice_center(y):
    zf = cast([0, y, 10], -Z)[2]; zb = cast([0, y, -10], Z)[2]
    return (zf + zb) / 2

def ring(y, xoff, front=True, zc=None):
    """軀幹／頸／面：從中軸往外，找出離正中線 xoff 的體表點"""
    zc = slice_center(y) if zc is None else zc
    o = np.array([0, y, zc])
    lo, hi = (0.0, 89.0) if front else (180.0, 91.0)
    if xoff <= 1e-6: return cast(o, Z if front else -Z)
    for _ in range(40):
        mid = (lo + hi) / 2
        a = np.radians(mid)
        p = cast(o, [np.sin(a), 0, np.cos(a)])
        if p[0] < xoff: lo = mid
        else: hi = mid
    return p

def angle_cast(y, deg, zc=None):
    zc = slice_center(y) if zc is None else zc
    a = np.radians(deg)
    return cast([0, y, zc], [np.sin(a), 0, np.cos(a)])

def toward(t, y=None):
    t = np.asarray(t, float); y = t[1] if y is None else y
    o = np.array([0, y, slice_center(y)])
    return cast(o, t - o)

# ---------- 骨性標誌 ----------
hum = B('Left humerus'); rad = B('Left radius'); uln = B('Left ulna')
fem = B('Left femur'); tib = B('Left tibia'); fib = B('Left fibula')
sca = B('Left scapula')
H_top = ext(hum, Y)
hum_head = hum[hum[:, 1] > H_top[1] - 0.45].mean(0)
med_epi = ext(hum, (-1, -0.3, 0)); lat_epi = ext(hum, (1, -0.3, 0))
ELB = (med_epi + lat_epi) / 2
rad_sty = ext(rad, (0.3, -1, 0)); uln_sty = ext(uln, (-0.3, -1, 0))
WRI = (rad_sty + uln_sty) / 2 + Y * 0.08          # 腕橫紋略高於莖突尖
olecranon = ext(uln, (0, 0.6, -1))
acromion = ext(sca, (1, 0.4, 0.2))
inf_angle = ext(sca, -Y); sup_angle = ext(sca, (-0.3, 1, -0.3))
fold_y = H_top[1] - 1.1                             # 腋前紋頭
CUN_UA = (fold_y - ELB[1]) / 9                      # 腋前紋頭至肘橫紋 9 寸
CUN_FA = np.linalg.norm(ELB - WRI) / 12             # 肘橫紋至腕橫紋 12 寸

fem_head = ext(fem, (-0.6, 1, 0))
GT = ext(fem, (1, 0.3, 0))                          # 股骨大轉子
f_low = fem[fem[:, 1] < -3.4]
f_med_epi = ext(f_low, -X); f_lat_epi = ext(f_low, X)
patella = B('Left patella'); pat_top = ext(patella, Y); pat_bot = ext(patella, -Y)
KNEE = np.array([(f_med_epi[0] + f_lat_epi[0]) / 2, pat_bot[1] - 0.05, (f_med_epi[2] + f_lat_epi[2]) / 2])
med_mall = ext(tib, (-1, -0.2, 0)); lat_mall = ext(fib, (1, -0.2, 0))
ANK = (med_mall + lat_mall) / 2
fib_head = ext(fib, (0.3, 1, 0))
tib_med_cond_y = KNEE[1] - 0.25
CUN_LL_LAT = (KNEE[1] - lat_mall[1]) / 16           # 膕橫紋至外踝尖 16 寸
CUN_LL_MED = (tib_med_cond_y - med_mall[1]) / 13    # 脛骨內側髁下緣至內踝尖 13 寸

hip = B('Left hip bone'); hips = B('Left hip bone', 'Right hip bone')
pf = hips[(np.abs(hips[:, 0]) < 0.15) & (hips[:, 2] > 0)]
PUB_TOP = ext(pf, Y); PUB_BOT = ext(pf, -Y)
ASIS = ext(hip, (0.3, 0.2, 1))
CUN_TH = (PUB_TOP[1] - (f_med_epi[1] + 0.2)) / 18   # 恥骨聯合上緣至股骨內上髁上緣 18 寸

XIPH = ext(B('Body of sternum'), (0, -1, 0.2))      # 歧骨（胸劍聯合）
MANU = ext(B('Manubrium'), (0, 1, 0.3))             # 胸骨上窩
# 臍：正中線前面的凹陷
best = None
for y in np.arange(1.0, 2.6, 0.02):
    b = SV[(np.abs(SV[:, 0]) < 0.05) & (np.abs(SV[:, 1] - y) < 0.03) & (SV[:, 2] > 0.5)]
    if len(b):
        z = b[:, 2].max()
        if best is None or z < best[1] - 0.0: pass
best_y, best_d = None, 0
prof = []
for y in np.arange(1.0, 2.6, 0.02):
    b = SV[(np.abs(SV[:, 0]) < 0.05) & (np.abs(SV[:, 1] - y) < 0.025) & (SV[:, 2] > 0.5)]
    prof.append((y, b[:, 2].max() if len(b) else np.nan))
prof = np.array(prof)
for i in range(5, len(prof) - 5):
    d = (prof[i - 5, 1] + prof[i + 5, 1]) / 2 - prof[i, 1]
    if d > best_d: best_d, best_y = d, prof[i, 0]
NAVEL_Y = best_y
CUN_ABD_LO = (NAVEL_Y - PUB_TOP[1]) / 5             # 臍至恥骨聯合上緣 5 寸
CUN_ABD_HI = (XIPH[1] - NAVEL_Y) / 8                # 歧骨至臍 8 寸
CUN_X = 0.85 / 4                                    # 兩乳間 8 寸（乳頭線約 x = 0.85）
def abd(c):  # 臍上 c 寸（負值為臍下）的高度
    return NAVEL_Y + (c * CUN_ABD_HI if c >= 0 else c * CUN_ABD_LO)

# 肋骨與肋間隙
ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
RIBV = {}
for k, o in enumerate(ORD, 1):
    names = [f'Left {o} rib'] + ([f'Left {o} costal cartilage'] if k <= 7 else [])
    RIBV[k] = np.vstack([B(n) for n in names if any(p['name'] == n for p in PARTS)])
def rib_y0(k, x0):
    v = RIBV[k]; s = v[(np.abs(v[:, 0] - x0) < 0.06) & (v[:, 2] > 0.1)]
    if len(s) == 0: return None
    top = s[s[:, 2] > s[:, 2].max() - 0.25]
    return top[:, 1].mean()
def rib_y(k, x0, strict=False):
    if strict: return rib_y0(k, x0)
    for dx in np.arange(0, 0.8, 0.05):
        for x in (x0 - dx, x0 + dx):
            y = rib_y0(k, x)
            if y is not None: return y
    return None
def ics(k, x0):
    a, b = rib_y(k, x0), rib_y(k + 1, x0)
    if a is None or b is None: raise ValueError(f'ICS {k} at {x0}')
    return (a + b) / 2
def rib_lat_y(k):
    v = RIBV[k]; return ext(v, X)[1]

# 椎骨棘突下緣
VERT = {}
for i, o in enumerate(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'], 1):
    VERT[f'C{i}'] = f'{o.capitalize()} cervical vertebra'
for i, o in enumerate(ORD, 1):
    VERT[f'T{i}'] = f'{o.capitalize()} thoracic vertebra'
for i, o in enumerate(['first', 'second', 'third', 'fourth', 'fifth'], 1):
    VERT[f'L{i}'] = f'{o.capitalize()} lumbar vertebra'
def spin(code):
    v = B(VERT[code]); tip = ext(v, -Z)
    s = v[v[:, 2] < tip[2] + 0.12]
    return ext(s, -Y)[1]
SAC = B('Sacrum'); sac_top = SAC[:, 1].max(); sac_bot = SAC[:, 1].min()
def sac_y(n): return sac_top - (sac_top - sac_bot) * (0.12 + 0.19 * (n - 1))   # 第 n 骶後孔
HIATUS_Y = sac_bot + 0.12
COCCYX_Y = sac_bot - 0.2
SCAP_MED_X = sca[(sca[:, 1] > 4.4) & (sca[:, 1] < 5.0)][:, 0].min()
CUN_BACK = SCAP_MED_X / 3                           # 肩胛骨內緣至後正中線 3 寸
def back(xc, y): return ring(y, xc * CUN_BACK, front=False)
def front(xc, y): return ring(y, xc * CUN_X)

# ---------- 四肢 ----------
def limb_dir(axis, deg):
    a = unit(axis)
    f = unit(Z - a * (Z @ a))
    l = unit(X - a * (X @ a) - f * (X @ f))
    t = np.radians(deg)
    return np.cos(t) * f + np.sin(t) * l
def upper(c, deg):   # 肘橫紋上 c 寸
    ax = unit(hum_head - ELB)
    return cast(ELB + ax * c * CUN_UA, limb_dir(ax, deg))
def fore(c, deg):    # 腕橫紋上 c 寸
    ax = unit(ELB - WRI)
    return cast(WRI + ax * c * CUN_FA, limb_dir(ax, deg))
def thigh_at_y(y, deg):
    ax = unit(fem_head - KNEE); t = (y - KNEE[1]) / ax[1]
    return cast(KNEE + ax * t, limb_dir(ax, deg))
def lowleg(y, deg):
    ax = unit(KNEE - ANK); t = (y - ANK[1]) / ax[1]
    return cast(ANK + ax * t, limb_dir(ax, deg))
lat_y = lambda c: lat_mall[1] + c * CUN_LL_LAT      # 外踝尖上 c 寸
med_y = lambda c: med_mall[1] + c * CUN_LL_MED      # 內踝尖上 c 寸

def bone_ends(name, toward):
    v = B(name); c = v.mean(0); u, s, w = np.linalg.svd(v - c); a = w[0]; t = (v - c) @ a
    p0, p1 = c + a * t.min(), c + a * t.max()
    return (p0, p1) if np.linalg.norm(p0 - toward) < np.linalg.norm(p1 - toward) else (p1, p0)
def on_bone(name, t, toward):
    p, d = bone_ends(name, toward); return lerp(p, d, t)

# 手的方向
MC = {i: f'Left {o} metacarpal bone' for i, o in enumerate(['first', 'second', 'third', 'fourth', 'fifth'], 1)}
FING = {2: 'index finger', 3: 'middle finger', 4: 'ring finger', 5: 'little finger'}
def ph(seg, f): return f'{seg} phalanx of left {FING[f]}' if f > 1 else f'{seg} phalanx of left thumb'
R_H = unit(B(MC[2]).mean(0) - B(MC[5]).mean(0))
F_H = unit(np.subtract(*bone_ends(MC[3], WRI)[::-1]))
P_H = unit(np.cross(F_H, R_H))
if P_H[2] < 0: P_H = -P_H
def hand(p, d): return cast(p, unit(d))

# 足的方向
MT = {i: f'Left {o} metatarsal bone' for i, o in enumerate(['first', 'second', 'third', 'fourth', 'fifth'], 1)}
TOE = {1: 'big toe', 2: 'second toe', 3: 'third toe', 4: 'fourth toe', 5: 'little toe'}
def tp(seg, t): return f'{seg} phalanx of left {TOE[t]}'
L_F = unit(B(MT[5]).mean(0) - B(MT[1]).mean(0))
T_F = unit(np.subtract(*bone_ends(MT[2], ANK)[::-1]))
D_F = unit(np.cross(T_F, L_F))
if D_F[1] < 0: D_F = -D_F
HEEL = ext(B('Left calcaneus'), -Z)

# ---------- 頭面 ----------
skull = B('Frontal bone', 'Occipital bone', 'Left parietal bone', 'Right parietal bone')
HC = (skull.min(0) + skull.max(0)) / 2; HC[0] = 0
hair = B('Hair of head')
hm = hair[np.abs(hair[:, 0]) < 0.06]
FH = ext(hm[hm[:, 2] > HC[2] + 0.3], -Y)            # 前髮際正中
BH = ext(hm[hm[:, 2] < HC[2] - 0.3], -Y)            # 後髮際正中
def mid_dir(a): return np.array([0, np.sin(a), np.cos(a)])
def _try(a):
    try: return cast(HC, mid_dir(a))
    except ValueError: return None
_arc = [(a, _try(a)) for a in np.radians(np.arange(-30, 250, 0.5))]
_arc = [(a, p) for a, p in _arc if p is not None]
AL = np.array([a for a, p in _arc]); ARC = np.array([p for a, p in _arc])
S_ARC = np.r_[0, np.cumsum(np.linalg.norm(np.diff(ARC, axis=0), axis=1))]
def arc_s(p):
    d = unit(p - HC); a = np.arctan2(d[1], d[2]);
    if a < np.radians(-30): a += 2 * np.pi
    return np.interp(a, AL, S_ARC)
S_FH, S_BH = arc_s(FH), arc_s(BH)
CUN_HEAD = (S_BH - S_FH) / 12                        # 前後髮際 12 寸
def arc_alpha(d): return np.interp(S_FH + d * CUN_HEAD, S_ARC, AL)
LAT_DEG = None
def head(d, lat):
    """前髮際後 d 寸（負值在髮際前）、旁開 lat 寸"""
    a = arc_alpha(d)
    v = mid_dir(a)
    t = np.array([0, np.cos(a), -np.sin(a)])         # 沿正中線往後的切線
    th = np.radians(lat * LAT_DEG)
    # 以切線為軸，把方向往 +x 轉
    w = v * np.cos(th) + np.cross(t, v) * np.sin(th) + t * (t @ v) * (1 - np.cos(th))
    if lat > 0 and w[0] < 0: w[0] = -w[0]
    return cast(HC, w)
def headto(p): return cast(HC, np.asarray(p, float) - HC)

cornea = B('Left cornea'); PUPIL = ext(cornea, Z)
sclera = B('Left sclera'); OC = ext(sclera, (1, 0, -0.3)); IC = ext(sclera, (-1, 0, 0.2))
# 瞳孔直上 2.25 寸：用來換算頭部旁開的角度
LAT_DEG = np.degrees(np.arctan2(PUPIL[0], PUPIL[2] - HC[2])) / 2.25
brow = B('Eyebrow'); brow = brow[brow[:, 0] > 0]
BROW_IN = ext(brow, -X); BROW_OUT = ext(brow, X)
ear = B('External ear'); ear = ear[ear[:, 0] > 0]
E_AP = ext(ear, Y); E_LB = ext(ear, -Y); E_BK = ext(ear, -Z)
ear_mid = ear[np.abs(ear[:, 1] - (E_AP[1] + E_LB[1]) / 2) < 0.12]
TRAGUS = ext(ear_mid, Z)
mand = B('Mandible'); mL = mand[mand[:, 0] > 0]
GONION = ext(mL, (1, -1, -1))
temporal = B('Left temporal bone'); MASTOID = ext(temporal[temporal[:, 2] < TRAGUS[2] - 0.1], (0.3, -1, -0.4))
lip = B('Lip'); MOUTH = ext(lip[lip[:, 0] > 0], X); LIP_TOP = ext(lip[np.abs(lip[:, 0]) < 0.05], Y); LIP_BOT = ext(lip[np.abs(lip[:, 0]) < 0.05], -Y)
alar = B('Left major alar cartilage'); ALAR = ext(alar, X); ALAR_BOT = ext(alar, -Y)
nose = SV[(np.abs(SV[:, 0]) < 0.04) & (SV[:, 1] > 6.7) & (SV[:, 1] < 7.3)]
NOSE_TIP = ext(nose, Z)
colu = SV[(np.abs(SV[:, 0]) < 0.03) & (SV[:, 1] > LIP_TOP[1]) & (SV[:, 1] < NOSE_TIP[1]) & (SV[:, 2] > NOSE_TIP[2] - 0.25)]
NOSE_BASE_Y = colu[np.argmin(colu[:, 2] - 0 * colu[:, 1])][1] if len(colu) else (LIP_TOP[1] + NOSE_TIP[1]) / 2
thy = B('Thyroid cartilage'); ADAM = ext(thy, (0, 0.3, 1))
hyoid = B('Hyoid bone'); HYOID = ext(hyoid, (0, 0.3, 1))
zyg = B('Left zygomatic bone')
gum = ext(B('Gingiva of upper jaw'), Z)
clav = B('Left clavicle')
def clav_top(x0): s = clav[np.abs(clav[:, 0] - x0) < 0.08]; return s[:, 1].max()
def clav_bot(x0): s = clav[np.abs(clav[:, 0] - x0) < 0.08]; return s[:, 1].min()
C7 = spin('C7'); T1 = spin('T1')
AXILLA_Y = fold_y - 0.05

P = {}   # 'LU1': xyz
def put(code, p): P[code] = np.asarray(p, float)

# ===== 手太陰肺經 =====
put('LU2', front(6, clav_bot(1.275) - 0.08))
put('LU1', front(6, P['LU2'][1] - CUN_ABD_HI))
put('LU3', upper(6, 50)); put('LU4', upper(5, 50))
put('LU5', upper(0, 35))
put('LU6', fore(7, 65)); put('LU7', fore(1.5, 85)); put('LU8', fore(1, 70)); put('LU9', fore(0, 62))
put('LU10', hand(on_bone(MC[1], 0.5, WRI), R_H + 0.5 * P_H))
put('LU11', hand(on_bone(ph('Distal', 1), 0.6, WRI), R_H + 0.3 * P_H))
# ===== 手陽明大腸經 =====
put('LI1', hand(on_bone(ph('Distal', 2), 0.7, WRI), R_H - 0.5 * P_H))
put('LI2', hand(on_bone(ph('Proximal', 2), 0.15, WRI), R_H - 0.1 * P_H))
put('LI3', hand(on_bone(MC[2], 0.85, WRI), R_H - 0.1 * P_H))
put('LI4', hand(lerp(on_bone(MC[2], 0.5, WRI), on_bone(MC[1], 0.7, WRI), 0.35), -P_H + 0.3 * R_H))
put('LI5', fore(0, 110))
put('LI6', fore(3, 115)); put('LI7', fore(5, 118))
put('LI11', upper(0, 80))
put('LI8', fore(8, 115)); put('LI9', fore(9, 112)); put('LI10', fore(10, 105))
put('LI12', upper(1, 115)); put('LI13', upper(3, 100)); put('LI14', upper(7, 95))
put('LI15', cast(hum_head, (0.75, 0.25, 0.6)))
put('LI16', cast(lerp(acromion, sup_angle, 0.35) - Y * 0.2, (0.1, 1, 0.1)))
put('LI18', angle_cast(ADAM[1], 72)); put('LI17', angle_cast(ADAM[1] - 0.28, 82))
GV26_Y = NOSE_BASE_Y - (NOSE_BASE_Y - LIP_TOP[1]) / 3
put('LI19', ring(GV26_Y, 0.14))
put('LI20', ring((ALAR[1] + ALAR_BOT[1]) / 2, ALAR[0] + 0.07))
# ===== 足陽明胃經 =====
put('ST1', ring(PUPIL[1] - 0.22, PUPIL[0])); put('ST2', ring(PUPIL[1] - 0.34, PUPIL[0]))
put('ST3', ring(ALAR_BOT[1], PUPIL[0])); put('ST4', ring(MOUTH[1], MOUTH[0] + 0.1))
low = mL[np.abs(mL[:, 2] - (GONION[2] + 0.45)) < 0.05]
put('ST5', headto(ext(low, -Y) + np.array([0.05, 0.02, 0])))
put('ST6', headto(GONION + np.array([0.02, 0.28, 0.28])))
put('ST7', headto(TRAGUS + np.array([-0.06, -0.05, 0.42])))
put('ST8', head(0.5, 4.5))
put('ST9', angle_cast(ADAM[1], 38))
put('ST11', ring(clav_top(0.3) + 0.06, 0.3))
put('ST10', (P['ST9'] + P['ST11']) / 2); put('ST10', closest(P['ST10'] + unit(P['ST10'] - [0, P['ST10'][1], slice_center(P['ST10'][1])]) * 0.05))
put('ST12', ring(clav_top(0.85) + 0.1, 0.85)); put('ST13', ring(clav_bot(0.85) - 0.06, 0.85))
for k, n in zip(range(1, 6), range(14, 19)): put(f'ST{n}', front(4, ics(k, 0.85)))
for i, n in enumerate(range(19, 31)): put(f'ST{n}', front(2, abd(6 - i)))
put('ST31', thigh_at_y(PUB_BOT[1] - 0.1, 22))
put('ST32', thigh_at_y(pat_top[1] + 6 * CUN_TH, 25)); put('ST33', thigh_at_y(pat_top[1] + 3 * CUN_TH, 35))
put('ST34', thigh_at_y(pat_top[1] + 2 * CUN_TH, 42))
put('ST35', lowleg(KNEE[1] - 0.02, 32))
for n, c, d in [(36, 3, 18), (37, 6, 15), (38, 8, 15), (39, 9, 15), (40, 8, 35)]:
    put(f'ST{n}', lowleg(P['ST35'][1] - c * CUN_LL_LAT, d))
put('ST41', cast(ANK + Y * 0.12, unit(Z + 0.15 * Y)))
put('ST42', hand(lerp(on_bone(MT[2], 0.15, ANK), on_bone(MT[3], 0.15, ANK), 0.5), D_F))
put('ST43', hand(lerp(on_bone(MT[2], 0.75, ANK), on_bone(MT[3], 0.75, ANK), 0.5), D_F))
put('ST44', hand(lerp(on_bone(tp('Proximal', 2), 0.15, ANK), on_bone(tp('Proximal', 3), 0.15, ANK), 0.5), D_F + 0.3 * T_F))
put('ST45', hand(on_bone(tp('Distal', 2), 0.6, ANK), L_F + 0.5 * D_F))
# ===== 足太陰脾經 =====
put('SP1', hand(on_bone(tp('Distal', 1), 0.55, ANK), -L_F + 0.4 * D_F))
put('SP2', hand(on_bone(tp('Proximal', 1), 0.15, ANK), -L_F - 0.2 * D_F))
put('SP3', hand(on_bone(MT[1], 0.82, ANK), -L_F - 0.3 * D_F))
put('SP4', hand(on_bone(MT[1], 0.12, ANK), -L_F - 0.3 * D_F))
put('SP5', cast(ANK - Y * 0.12, limb_dir(Y, -45)))
put('SP6', lowleg(med_y(3), -110)); put('SP7', lowleg(med_y(6), -110))
put('SP9', lowleg(tib_med_cond_y - 0.05, -105)); put('SP8', lowleg(P['SP9'][1] - 3 * CUN_LL_MED, -108))
put('SP10', thigh_at_y(pat_top[1] + 2 * CUN_TH, -62))
put('SP11', thigh_at_y(pat_top[1] + 8 * CUN_TH, -55))
put('SP12', ring(PUB_TOP[1] + 0.03, 3.5 * CUN_X))
put('SP13', front(4, abd(-4) + 0.7 * CUN_ABD_LO))
put('SP14', front(4, abd(-1.3))); put('SP15', front(4, abd(0))); put('SP16', front(4, abd(3)))
for k, n in zip([5, 4, 3, 2], range(17, 21)): put(f'SP{n}', front(6, ics(k, 1.2)))
ics6_lat = (rib_lat_y(6) + rib_lat_y(7)) / 2
put('SP21', angle_cast(ics6_lat, 90))
# ===== 手少陰心經 =====
put('HT1', angle_cast(AXILLA_Y, 92))
put('HT2', upper(3, -72)); put('HT3', upper(0, -95))
for n, c in [(4, 1.5), (5, 1), (6, 0.5), (7, 0)]: put(f'HT{n}', fore(c, -58))
put('HT8', hand(lerp(on_bone(MC[4], 0.75, WRI), on_bone(MC[5], 0.75, WRI), 0.5), P_H))
put('HT9', hand(on_bone(ph('Distal', 5), 0.6, WRI), R_H - 0.5 * P_H))
# ===== 手太陽小腸經 =====
put('SI1', hand(on_bone(ph('Distal', 5), 0.6, WRI), -R_H - 0.5 * P_H))
put('SI2', hand(on_bone(ph('Proximal', 5), 0.15, WRI), -R_H))
put('SI3', hand(on_bone(MC[5], 0.82, WRI), -R_H + 0.15 * P_H))
put('SI4', hand(on_bone(MC[5], 0.04, WRI), -R_H))
put('SI5', fore(0, -112)); put('SI6', fore(1, -150)); put('SI7', fore(5, -125))
put('SI8', upper(0, -145))
put('SI9', toward([1.45, AXILLA_Y + 0.2, -0.75]))
put('SI10', toward([1.4, acromion[1] - 0.55, -0.85]))
sp_mid = lerp([SCAP_MED_X, 5.05, -0.9], acromion, 0.45)
put('SI11', toward(lerp(sp_mid, inf_angle, 1 / 3) - Z * 0.3))
put('SI12', toward(sp_mid + Y * 0.22 - Z * 0.3))
put('SI13', toward([SCAP_MED_X + 0.15, sp_mid[1] + 0.12, -0.9]))
put('SI14', back(3, T1)); put('SI15', back(2, C7))
put('SI16', angle_cast(ADAM[1], 112)); put('SI17', headto(GONION + np.array([0.02, -0.05, -0.18])))
zl = zyg[np.abs(zyg[:, 0] - OC[0]) < 0.06]
put('SI18', ring(zl[:, 1].min() - 0.03, OC[0] - 0.02))
put('SI19', headto(TRAGUS + np.array([-0.05, 0, 0.14])))
# ===== 足太陽膀胱經 =====
put('BL1', headto(IC + np.array([-0.05, 0.03, 0.02])))
put('BL2', headto(BROW_IN + np.array([0, 0, 0.02])))
put('BL3', head(0.5, 0.75)); put('BL4', head(0.5, 1.5)); put('BL5', head(1, 1.5)); put('BL6', head(2.5, 1.5))
put('BL7', head(4, 1.5)); put('BL8', head(5.5, 1.5)); put('BL9', head(9.5, 1.3)); put('BL10', head(11.5, 1.3))
inner = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5']
for n, v in zip(range(11, 27), inner): put(f'BL{n}', back(1.5, spin(v)))
for n, s in zip(range(27, 31), range(1, 5)): put(f'BL{n}', back(1.5, sac_y(s)))
for n, s in zip(range(31, 35), range(1, 5)): put(f'BL{n}', back(1.0 - 0.12 * (s - 1), sac_y(s)))
put('BL35', back(0.5, COCCYX_Y))
GLUT_Y = PUB_BOT[1] - 0.55
put('BL36', thigh_at_y(GLUT_Y, 180)); put('BL37', thigh_at_y(GLUT_Y - 6 * CUN_TH, 180))
put('BL39', thigh_at_y(KNEE[1] + 0.05, 140)); put('BL38', thigh_at_y(KNEE[1] + 0.05 + CUN_TH, 145))
put('BL40', thigh_at_y(KNEE[1] + 0.05, 180))
outer = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2']
for n, v in zip(range(41, 53), outer): put(f'BL{n}', back(3, spin(v)))
put('BL53', back(3, sac_y(2))); put('BL54', back(3, sac_y(4)))
put('BL55', lowleg(KNEE[1] - 2 * CUN_LL_LAT, 180)); put('BL56', lowleg(KNEE[1] - 5 * CUN_LL_LAT, 180))
put('BL57', lowleg(KNEE[1] - 8 * CUN_LL_LAT, 180))
put('BL58', lowleg(lat_y(7), 150)); put('BL59', lowleg(lat_y(3), 150))
put('BL60', cast(ANK, limb_dir(Y, 140)))
put('BL61', cast(ANK - Y * 0.32, limb_dir(Y, 150)))
put('BL62', cast(ANK - Y * 0.24, limb_dir(Y, 95)))
cub = B('Left cuboid bone'); put('BL63', hand(ext(cub, (1, 0, 0.3)) - X * 0.05, X - 0.3 * Y))
put('BL64', hand(on_bone(MT[5], 0.05, ANK), L_F - 0.4 * D_F))
put('BL65', hand(on_bone(MT[5], 0.85, ANK), L_F - 0.3 * D_F))
put('BL66', hand(on_bone(tp('Proximal', 5), 0.2, ANK), L_F - 0.2 * D_F))
put('BL67', hand(on_bone(tp('Distal', 5), 0.6, ANK), L_F + 0.5 * D_F))
# ===== 足少陰腎經 =====
put('KI1', hand(lerp(on_bone(MT[2], 0.8, ANK), on_bone(MT[3], 0.8, ANK), 0.5), -D_F))
nav = B('Navicular bone of left foot'); NAV = ext(nav, -X)
put('KI2', hand(NAV + X * 0.08 - Y * 0.08, -X - 0.6 * Y))
put('KI3', cast(ANK, limb_dir(Y, -140)))
put('KI4', cast(ANK - Y * 0.16, limb_dir(Y, -160)))
put('KI5', cast(ANK - Y * 0.27, limb_dir(Y, -145)))
put('KI6', cast(ANK - Y * 0.27, limb_dir(Y, -88)))
put('KI7', lowleg(med_y(2), -150)); put('KI8', lowleg(med_y(2), -118)); put('KI9', lowleg(med_y(5), -145))
put('KI10', thigh_at_y(KNEE[1] + 0.05, -150))
for i, n in enumerate(range(11, 16)): put(f'KI{n}', front(0.5, abd(-5 + i)))
put('KI16', front(0.5, abd(0) + 0.02))
for i, n in enumerate(range(17, 22)): put(f'KI{n}', front(0.5, abd(2 + i)))
for k, n in zip([5, 4, 3, 2, 1], range(22, 27)): put(f'KI{n}', front(2, ics(k, 0.45)))
put('KI27', front(2, clav_bot(0.45) - 0.05))
# ===== 手厥陰心包經 =====
put('PC1', front(5, ics(4, 1.06)))
put('PC2', upper(7, 0)); put('PC3', upper(0, -12))
for n, c in [(4, 5), (5, 3), (6, 2), (7, 0)]: put(f'PC{n}', fore(c, 0))
put('PC8', hand(lerp(on_bone(MC[2], 0.72, WRI), on_bone(MC[3], 0.72, WRI), 0.55), P_H))
put('PC9', hand(bone_ends(ph('Distal', 3), WRI)[1] - F_H * 0.03, F_H + 0.3 * P_H))
# ===== 手少陽三焦經 =====
put('SJ1', hand(on_bone(ph('Distal', 4), 0.6, WRI), -R_H - 0.5 * P_H))
put('SJ2', hand(lerp(on_bone(ph('Proximal', 4), 0.1, WRI), on_bone(ph('Proximal', 5), 0.1, WRI), 0.5), -P_H))
put('SJ3', hand(lerp(on_bone(MC[4], 0.7, WRI), on_bone(MC[5], 0.7, WRI), 0.5), -P_H))
put('SJ4', fore(0, 180)); put('SJ5', fore(2, 180)); put('SJ6', fore(3, 180)); put('SJ7', fore(3, -150))
put('SJ8', fore(4, 178)); put('SJ9', fore(7, 178))
put('SJ10', upper(1, 180)); put('SJ11', upper(2, 180))
c13 = (acromion[1] - 3 * CUN_UA - ELB[1]) / CUN_UA
put('SJ13', upper(c13, 165)); put('SJ12', upper((c13 + 2) / 2, 172))
put('SJ14', cast(hum_head, (0.6, 0.25, -0.75)))
put('SJ15', toward(sup_angle + np.array([0.05, 0.1, 0.1])))
put('SJ16', angle_cast(GONION[1], 128))
put('SJ17', headto([E_LB[0] - 0.05, E_LB[1] - 0.02, E_LB[2] - 0.1]))
put('SJ18', headto([E_BK[0] - 0.08, E_LB[1] + 0.33 * (E_AP[1] - E_LB[1]), E_BK[2] - 0.04]))
put('SJ19', headto([E_BK[0] - 0.08, E_LB[1] + 0.66 * (E_AP[1] - E_LB[1]), E_BK[2] - 0.02]))
put('SJ20', headto(E_AP + np.array([-0.12, 0.12, 0])))
put('SJ21', headto(TRAGUS + np.array([-0.05, 0.16, 0.13])))
put('SJ22', headto([TRAGUS[0] - 0.05, E_AP[1] - 0.12, TRAGUS[2] + 0.28]))
put('SJ23', headto(BROW_OUT + np.array([0, 0, 0.0])))
# ===== 足少陽膽經 =====
put('GB1', headto(OC + np.array([0.1, 0, -0.05])))
put('GB2', headto(TRAGUS + np.array([-0.05, -0.16, 0.13])))
put('GB3', headto(TRAGUS + np.array([-0.06, 0.25, 0.42])))
put('GB7', headto([TRAGUS[0] - 0.02, E_AP[1], TRAGUS[2] + 0.3]))
put('GB4', headto(lerp(P['ST8'], P['GB7'], 0.25)))
put('GB8', headto(E_AP + np.array([-0.15, 0.42, 0])))
put('GB9', headto(E_AP + np.array([-0.15, 0.4, -0.28])))
put('GB12', headto(MASTOID + np.array([0, 0.05, -0.12])))
put('GB10', headto(E_AP + np.array([-0.12, 0.08, -0.42])))
put('GB11', headto(lerp(P['GB10'], P['GB12'], 0.5) - X * 0.05))
put('GB13', head(0.5, 3)); put('GB14', head(-2, 2.25)); put('GB15', head(0.5, 2.25))
put('GB16', head(1.5, 2.25)); put('GB17', head(2.5, 2.25)); put('GB18', head(4, 2.25))
put('GB19', head(9.5, 2.25)); put('GB20', head(11, 2.25))
put('GB21', cast(np.array([acromion[0] / 2, 5.3, -0.35]), Y))
put('GB22', angle_cast(AXILLA_Y - 3 * CUN_X * 1.1, 92))
put('GB23', angle_cast(AXILLA_Y - 3 * CUN_X * 1.1 - 0.05, 72))
put('GB24', front(4, ics(7, 0.85)))
r11 = ext(RIBV[11], (0.3, -0.2, 1)); r12 = ext(RIBV[12], (0.3, -0.2, 1))
put('GB25', toward(r12 + np.array([0, -0.05, 0])))
put('GB26', toward([r11[0], NAVEL_Y, r11[2]]))
put('GB27', toward([ASIS[0] - 0.08, abd(-3), ASIS[2] + 0.1]))
put('GB28', toward([ASIS[0] - 0.12, abd(-3) - 0.12, ASIS[2] + 0.18]))
put('GB29', toward(lerp(ASIS, GT, 0.5)))
put('GB30', toward(lerp(GT, [0, HIATUS_Y, -0.8], 1 / 3)))
put('GB31', thigh_at_y(KNEE[1] + 7 * CUN_TH, 90)); put('GB32', thigh_at_y(KNEE[1] + 5 * CUN_TH, 90))
put('GB33', thigh_at_y(f_lat_epi[1] + 0.25, 95))
put('GB34', lowleg(fib_head[1] - 0.25, 62))
put('GB35', lowleg(lat_y(7), 122)); put('GB36', lowleg(lat_y(7), 88)); put('GB37', lowleg(lat_y(5), 82))
put('GB38', lowleg(lat_y(4), 84)); put('GB39', lowleg(lat_y(3), 88))
put('GB40', cast(ANK - Y * 0.12 + Z * 0.08, limb_dir(Y, 55)))
put('GB41', hand(lerp(on_bone(MT[4], 0.2, ANK), on_bone(MT[5], 0.2, ANK), 0.5), D_F))
put('GB42', hand(lerp(on_bone(MT[4], 0.78, ANK), on_bone(MT[5], 0.78, ANK), 0.5), D_F))
put('GB43', hand(lerp(on_bone(tp('Proximal', 4), 0.15, ANK), on_bone(tp('Proximal', 5), 0.15, ANK), 0.5), D_F + 0.3 * T_F))
put('GB44', hand(on_bone(tp('Distal', 4), 0.6, ANK), L_F + 0.5 * D_F))
# ===== 足厥陰肝經 =====
put('LR1', hand(on_bone(tp('Distal', 1), 0.55, ANK), L_F + 0.5 * D_F))
put('LR2', hand(lerp(on_bone(tp('Proximal', 1), 0.1, ANK), on_bone(tp('Proximal', 2), 0.1, ANK), 0.5), D_F + 0.3 * T_F))
put('LR3', hand(lerp(on_bone(MT[1], 0.25, ANK), on_bone(MT[2], 0.25, ANK), 0.5), D_F))
put('LR4', cast(ANK + Y * 0.02, limb_dir(Y, -25)))
put('LR5', lowleg(med_y(5), -78)); put('LR6', lowleg(med_y(7), -80))
put('LR7', lowleg(P['SP9'][1], -135))
put('LR8', thigh_at_y(KNEE[1] + 0.12, -125))
put('LR9', thigh_at_y(f_med_epi[1] + 4 * CUN_TH, -100))
put('LR10', thigh_at_y(PUB_TOP[1] - 3 * CUN_TH, -48))
put('LR11', thigh_at_y(PUB_TOP[1] - 2 * CUN_TH, -40))
put('LR12', ring(PUB_BOT[1] + 0.12, 2.5 * CUN_X))
put('LR13', toward(r11))
put('LR14', front(4, ics(6, 0.85)))
# ===== 任脈 =====
put('REN1', cast([0, PUB_BOT[1] - 0.3, -0.25], -Y))
for i, n in enumerate(range(2, 9)):
    c = [-5, -4, -3, -2, -1.5, -1, 0][i]; put(f'REN{n}', front(0, abd(c)))
for i, n in enumerate(range(9, 16)): put(f'REN{n}', front(0, abd(1 + i)))
put('REN16', front(0, XIPH[1]))
for k, n in zip([4, 3, 2, 1], range(17, 21)): put(f'REN{n}', front(0, ics(k, 0.3)))
put('REN22', ring(MANU[1] + 0.06, 0)); put('REN21', front(0, MANU[1] - 0.28))
put('REN23', ring(HYOID[1] + 0.04, 0))
put('REN24', ring(LIP_BOT[1] - 0.14, 0))
# ===== 督脈 =====
put('DU1', cast([0, COCCYX_Y - 0.1, -0.5], unit(-Y - 0.8 * Z)))
put('DU2', back(0, HIATUS_Y))
for n, v in [(3, 'L4'), (4, 'L2'), (5, 'L1'), (6, 'T11'), (7, 'T10'), (8, 'T9'), (9, 'T7'), (10, 'T6'), (11, 'T5'), (12, 'T3'), (13, 'T1'), (14, 'C7')]:
    put(f'DU{n}', back(0, spin(v)))
for n, d in [(15, 11.5), (16, 11), (17, 9.5), (18, 8), (19, 6.5), (20, 5), (21, 3.5), (22, 2), (23, 1), (24, 0.5)]:
    put(f'DU{n}', head(d, 0))
put('DU25', NOSE_TIP + Z * 0.0)
put('DU26', ring(GV26_Y, 0)); put('DU27', ring(LIP_TOP[1] - 0.02, 0))
put('DU28', gum + Z * 0.02)

# ---------- 經絡筆畫 ----------
COUNT = dict(LU=11, LI=20, ST=45, SP=21, HT=9, SI=19, BL=67, KI=27, PC=9, SJ=23, GB=44, LR=14, REN=24, DU=28)
def nums(m, a, b): return [[*P[f'{m}{i}'], i] for i in range(a, b + 1) if f'{m}{i}' in P]
def via(p): return [*np.asarray(p, float)]
STROKES = {}
for m, n in COUNT.items(): STROKES[m] = [nums(m, 1, n)]
STROKES['ST'] = [nums('ST', 1, 8), [via(P['ST5'])] + nums('ST', 9, 45)]
STROKES['BL'] = [nums('BL', 1, 40),
                 nums('BL', 41, 54) + [via(thigh_at_y(-2.2, 155)), via(P['BL40'])] + nums('BL', 55, 67)]

# ---------- 給循行動畫、骨度尺用的位置 ----------
import gzip
LM = {}
def organ_centroid(pred):
    v, f = merge(parts(pred)); return toScene(v).mean(0)
LM['肺'] = organ_centroid(lambda p: p['system'] == 'respiratory' and p['name'].startswith('Left') and 'bronchial' in p['name'])
LM['心'] = organ_centroid(lambda p: p['system'] == 'cardiac' and p['name'].startswith('Wall of'))
LM['胃'] = organ_centroid(lambda p: p['name'] == 'Stomach')
LM['脾'] = organ_centroid(lambda p: p['name'] == 'Spleen')
LM['腎'] = organ_centroid(lambda p: p['name'] == 'Left kidney')
LM['膀胱'] = organ_centroid(lambda p: p['name'] == 'Urinary bladder')
LM['膽'] = organ_centroid(lambda p: p['name'] == 'Gallbladder')
LM['大腸'] = organ_centroid(lambda p: p['name'] == 'Descending colon')
LM['小腸'] = organ_centroid(lambda p: 'jejunum' in p['name'])
LM['肝'] = organ_centroid(lambda p: p['name'] == 'Caudate lobe of liver') + np.array([-0.3, 0.1, 0.15])
esoph = toScene(merge(parts(lambda p: p['name'] == 'Esophagus'))[0])
LM['胃口'] = ext(esoph, -Y)
trach = toScene(merge(parts(lambda p: p['name'] == 'Trachea'))[0])
LM['肺系'] = trach.mean(0)
LM['咽'] = ext(trach, Y)
LM['舌本'] = toScene(merge(parts(lambda p: p['name'] == 'Tongue'))[0]).mean(0)
LM['目系'] = PUPIL - Z * 0.35
LM['腦'] = HC
for k in ('pubTop', 'navel', 'xiph'): pass
LM['臍'] = P['REN8']; LM['膻中'] = P['REN17']
LM['中趾外間'] = hand(lerp(on_bone(tp('Proximal', 3), 0.2, ANK), on_bone(tp('Proximal', 4), 0.2, ANK), 0.5), D_F + 0.3 * T_F)
LM['耳中'] = TRAGUS - X * 0.12 - Z * 0.1
LM['鼻旁'] = ring((NOSE_TIP[1] + IC[1]) / 2, 0.12)
print({k: np.round(v, 2).tolist() for k, v in LM.items()})

def surf(p): return np.asarray(p, float)
RULERS = [   # (名稱, [沿途點], 寸, 左右都畫)
    ('歧骨至臍 8寸', [P['REN16'] + X * 0.32, P['REN12'] + X * 0.32, P['REN8'] + X * 0.32], 8, False),
    ('臍至恥骨聯合上緣 5寸', [P['REN8'] + X * 0.32, P['REN4'] + X * 0.32, P['REN2'] + X * 0.32], 5, False),
    ('兩乳頭之間 8寸', [P['ST17'] * [-1, 1, 1], P['REN17'] + Y * 0.0, P['ST17']], 8, False),
    ('前後髮際 12寸', [head(0, 0.6), head(3, 0.6), head(6, 0.6), head(9, 0.6), head(12, 0.6)], 12, False),
    ('腋前紋頭至肘橫紋 9寸', [upper(9, 20), upper(4.5, 20), upper(0, 20)], 9, True),
    ('肘橫紋至腕橫紋 12寸', [fore(12, 20), fore(6, 20), fore(0, 20)], 12, True),
    ('恥骨聯合上緣至股骨內上髁上緣 18寸', [ring(PUB_TOP[1], 0.45), thigh_at_y(PUB_TOP[1] - 0.6, -75), thigh_at_y(-2.0, -80), thigh_at_y(f_med_epi[1] + 0.2, -85)], 18, True),
    ('脛骨內側髁下緣至內踝尖 13寸', [lowleg(tib_med_cond_y, -95), lowleg(-6.2, -95), lowleg(med_mall[1], -95)], 13, True),
    ('股骨大轉子至膕橫紋 19寸', [toward(GT), thigh_at_y(-2.2, 95), thigh_at_y(KNEE[1], 100)], 19, True),
    ('膕橫紋至外踝尖 16寸', [lowleg(KNEE[1], 100), lowleg(-6.2, 100), lowleg(lat_mall[1], 100)], 16, True),
    ('肩胛骨內緣至後正中線 3寸', [back(0, 4.7), back(1.5, 4.7), back(3, 4.7)], 3, True),
]

r3 = lambda v: [round(float(x), 3) for x in v]
out = dict(
    note='穴位依《當代針灸大成》取法（骨度分寸＋骨性標誌）於 BodyParts3D 模型上計算；人的左側（x>0），右側鏡像',
    strokes={m: [[r3(v[:3]) + ([int(v[3])] if len(v) > 3 else []) for v in s] for s in ss] for m, ss in STROKES.items()},
    landmarks={k: r3(v) for k, v in LM.items()},
    rulers=[dict(name=n, pts=[r3(p) for p in ps], cun=c, both=bo) for n, ps, c, bo in RULERS],
    scale=dict(navelY=round(NAVEL_Y, 3), cunAbd=round(CUN_ABD_HI, 3), cunX=round(CUN_X, 3), cunHead=round(CUN_HEAD, 3)),
)
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False)
print('points', len(P), 'cun', dict(UA=CUN_UA, FA=CUN_FA, TH=CUN_TH, LLlat=CUN_LL_LAT, LLmed=CUN_LL_MED, ABDhi=CUN_ABD_HI, ABDlo=CUN_ABD_LO, X=CUN_X, BACK=CUN_BACK, HEAD=CUN_HEAD, LATDEG=LAT_DEG))
print('navel', NAVEL_Y, 'FH', FH, 'BH', BH, 'HC', HC)

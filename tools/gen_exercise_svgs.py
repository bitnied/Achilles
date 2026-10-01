#!/usr/bin/env python3
"""gen_exercise_svgs.py — gera as ilustrações (assets/exercises/*.svg) dos exercícios.

NÃO é etapa de build: é um gerador offline de assets (os SVGs ficam versionados).
Rode depois de mexer nas poses:   python3 tools/gen_exercise_svgs.py
Só validar as poses (sem escrever):  python3 tools/gen_exercise_svgs.py --check

Padrão visual (igual em todas as ilustrações):
  - Cada linha é uma VISTA (lateral, de frente ou de cima), com o nome no canto.
  - Dois quadros por linha: ① início  ›  ② fim. No ② aparece o "fantasma" da posição ①
    e a seta laranja segue a TRAJETÓRIA REAL da articulação (interpolando os ângulos),
    então dá para ver se o braço sobe para frente, abre para o lado ou faz um arco.
  - Exercícios em que a direção do movimento fica ambígua de lado ganham uma 2ª vista.
  - Isometria (prancha, ponte): ✗ o erro mais comum  |  ✓ a posição certa, com a linha guia.

As poses são ÂNGULOS validados por skeleton.py, que recusa joelho/cotovelo/tornozelo em
ângulo impossível. Este script também recusa pose que atravessa o chão e confere os pontos
que precisam encostar no chão (`touch`) ou ficar parados entre ① e ② (`fixed`).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skeleton import Figure, PoseError, BONES, normalize, lerp_pose, POSE_KEYS  # noqa: E402
import draw as D                                                                # noqa: E402
from draw import C, Panel                                                       # noqa: E402

W = 380
RH = 212                  # altura de uma linha (vista)
PANEL_CX = (95.0, 285.0)
FIG_TOP = 22.0            # topo da área do boneco (relativo à linha)
GROUND = 184.0            # chão (relativo à linha)
LABEL_Y = 203.0
PANEL_W = 172.0
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'exercises')

# ---------------------------------------------------------------- poses-base
LEGS_STAND = {'near': (3, 0, 92), 'far': (-2, -4, 88)}
ARMS_HANG = {'near': (3, 5, 6), 'far': (-1, 1, 6)}


def stand(**kw):
    p = dict(lean=3, legs=LEGS_STAND, arms=ARMS_HANG)
    p.update(kw)
    return p


def seated(**kw):
    """Sentado: coxa à frente na horizontal, canela para baixo."""
    p = dict(lean=4, legs={'near': (86, -2, 90), 'far': (86, -2, 90)}, arms=ARMS_HANG)
    p.update(kw)
    return p


# Deitado de costas (cabeça à direita) / de bruços (cabeça à direita). Ângulos de tela:
# 0 = para baixo, 90 = direita (cabeça), -90 = esquerda (pés), 180 = para cima.
SUP = dict(face=-1, rot=90, world=True)
LEGS_SUP_BENT = {'near': (-140, -14, -90), 'far': (-140, -14, -90)}   # joelhos dobrados, pés no chão
LEGS_BENCH = {'near': (-84.5, -5, -90), 'far': (-84.5, -5, -90)}      # deitado no banco, pés no chão
LEGS_SUP_STRAIGHT = {'near': (-90, -90, 180), 'far': (-90, -90, 180)}


def prone(rot, **kw):
    p = dict(face=1, rot=rot, world=True)
    p.update(kw)
    return p


# ---------------------------------------------------------------- equipamentos
# Cada função recebe o Panel (boneco + vista) e devolve (atrás, na frente, segurado).
# "segurado" também é desenhado, apagado, junto do fantasma da posição ①.
def P_none(P):
    return [], [], []


def P_dumbbells(grip=(0, 0, 1), sides=('far', 'near')):
    def fn(P):
        held = []
        for sd in sides:
            w, e = P.p(f'wrist_{sd}'), P.p(f'elbow_{sd}')
            k = P.s * (1.0 if sd == 'near' else 0.92)
            if P.view == 'side':
                held += D.dumbbell2d(w, D.unit(e, w) if D.dist(e, w) > 2 else (0, 1), k)
            else:
                held += D.dumbbell_axis(P, w, P.f.wdir(grip), k)
        return [], [], held
    return fn


def P_one_dumbbell_vertical(P):
    """Um halter na vertical, seguro pelas duas mãos (goblet / tríceps francês)."""
    a, b = P.p('wrist_near'), P.p('wrist_far')
    c = D.mid(a, b)
    k = P.s
    held = [D.rect(c[0] - 3 * k, c[1] - 9 * k, 6 * k, 18 * k, C['equip'], rx=2),
            D.rect(c[0] - 8 * k, c[1] + 4 * k, 16 * k, 9 * k, C['equip'], rx=3),
            D.rect(c[0] - 8 * k, c[1] - 13 * k, 16 * k, 9 * k, C['equip'], rx=3)]
    return [], [], held


def P_triceps(P):
    """Halter seguro pelas duas mãos, na linha do antebraço."""
    w, e = P.p('wrist_near'), P.p('elbow_near')
    u = D.unit(e, w)
    k = P.s
    c = (w[0] + u[0] * 5 * k, w[1] + u[1] * 5 * k)
    a = (c[0] - u[0] * 9 * k, c[1] - u[1] * 9 * k)
    b = (c[0] + u[0] * 9 * k, c[1] + u[1] * 9 * k)
    pu = (-u[1], u[0])
    held = [D.line(a, b, C['equip'], 4.5 * k)]
    for q in (a, b):
        held.append(D.line((q[0] - pu[0] * 7 * k, q[1] - pu[1] * 7 * k),
                           (q[0] + pu[0] * 7 * k, q[1] + pu[1] * 7 * k), C['equip'], 8 * k))
    return [], [], held


def P_kettlebell(P):
    w = D.mid(P.p('wrist_near'), P.p('wrist_far'))
    e = D.mid(P.p('elbow_near'), P.p('elbow_far'))
    return [], [], D.kettlebell(w, D.unit(e, w), P.s)


def _bar_center(P):
    a, b = P.f.w('wrist_near'), P.f.w('wrist_far')
    return tuple((x + y) / 2 for x, y in zip(a, b))


def P_barbell(P):
    """Barra pelas duas mãos. De lado a barra aponta para a câmera: aparece a anilha."""
    if P.view == 'side':
        return [], [], D.plate(P.proj(_bar_center(P)), 14, P.s)
    return [], [], D.barbell_front(P.p('wrist_far'), P.p('wrist_near'), P.s)


def P_barbell_back(P):
    """Barra apoiada no alto das costas. De lado, a anilha fica atrás da cabeça."""
    if P.view == 'side':
        c = _bar_center(P)
        back = P.f.trunk_dir((-1, 0, 0))  # um pouco para trás: a barra fica nas costas, não no pescoço
        c = (c[0] + back[0] * 8, c[1] + back[1] * 8 - 2, c[2])
        return D.plate(P.proj(c), 14, P.s), [], []
    return P_barbell(P)


def _wpt(P, x, y, z=0.0):
    return P.proj((x, y, z))


def P_bench_supine(barbell=False):
    def fn(P):
        hp, hd = P.f.w('hip'), P.f.w('head')
        top = max(hp[1], P.f.w('shoulder')[1]) + 7
        x0, x1 = min(hp[0], hd[0]) - 14, max(hp[0], hd[0]) + 4
        a, b = _wpt(P, x0, top), _wpt(P, x1, top)
        behind = D.bench(a[0], b[0], a[1], P.gy, h=8 * P.s)
        held = P_barbell(P)[2] if barbell else P_dumbbells()(P)[2]
        return behind, [], held
    return fn


def P_hipthrust(P):
    sh = P.f.w('shoulder')
    # banco de lado (fixo): o meio das costas apoia na quina
    x0, x1 = sh[0] - 6, sh[0] + 26
    top = -40.0
    a, b = _wpt(P, x0, top), _wpt(P, x1, top)
    behind = D.bench(a[0], b[0], a[1], P.gy, h=8 * P.s)
    hp = P.f.w('hip')
    ant = P.f.trunk_dir((1, 0, 0))
    c = P.proj((hp[0] + ant[0] * 11, hp[1] + ant[1] * 11, 0))
    return behind, [], D.plate(c, 8.5, P.s)


def P_mat(P):
    if P.view == 'top':  # colchonete visto de cima: um retângulo embaixo do corpo
        c = P.proj((0, 0, 0))
        return [D.rect(P.cx - 86, c[1] - 34 * P.s, 172, 68 * P.s, C['divider'], rx=8,
                       stroke=C['frame'], sw=1.5)], [], []
    return D.mat(P.cx - 84, P.cx + 84, P.gy + 1), [], []


def P_pulldown(P):
    s = P.s
    hp, kn = P.f.w('hip'), P.f.w('knee_near')
    behind, front = [], []
    if P.view == 'side':
        a, b = _wpt(P, hp[0] - 16, hp[1] + 7), _wpt(P, hp[0] + 20, hp[1] + 7)
        behind += [D.rect(a[0], a[1], b[0] - a[0], 7 * s, C['frame'], rx=3)]
        behind += D.post((a[0] + b[0]) / 2, a[1] + 7 * s, P.gy, w=6 * s)
        col_x = _wpt(P, hp[0] + 68, 0)[0]
        behind += D.post(col_x, P.top + 26, P.gy, w=8 * s)
        bar = P.proj(_bar_center(P))
        pul = (bar[0] + 4 * s, P.top + 30)
        behind += [D.line((col_x, P.top + 28), pul, C['frame'], 5 * s)]
        behind += [D.circ(pul, 5 * s, C['frame'])]
        behind += D.cable(pul, bar)
        front += [D.circ(P.proj((kn[0] - 5, kn[1] - 10, kn[2])), 6.5 * s, C['equip2'])]
        held = [D.circ(bar, 4.2 * s, C['equip'])]
    else:
        a, b = _wpt(P, 0, hp[1] + 7, -24), _wpt(P, 0, hp[1] + 7, 24)
        behind += [D.rect(a[0], a[1], b[0] - a[0], 7 * s, C['frame'], rx=3)]
        behind += D.post(P.cx, a[1] + 7 * s, P.gy, w=6 * s)
        wa, wb = P.p('wrist_far'), P.p('wrist_near')
        bar_c = D.mid(wa, wb)
        pul = (bar_c[0], P.top + 30)
        behind += D.cable(pul, bar_c)
        behind += [D.circ(pul, 5 * s, C['frame'])]
        u = D.unit(wa, wb)
        ea = (wa[0] - u[0] * 14 * s, wa[1] - u[1] * 14 * s + 6 * s)
        eb = (wb[0] + u[0] * 14 * s, wb[1] + u[1] * 14 * s + 6 * s)
        held = [f'<polyline points="{ea[0]:.1f},{ea[1]:.1f} {wa[0]-u[0]*10*s:.1f},{wa[1]:.1f} '
                f'{wb[0]+u[0]*10*s:.1f},{wb[1]:.1f} {eb[0]:.1f},{eb[1]:.1f}" fill="none" '
                f'stroke="{C["equip"]}" stroke-width="{4*s:.1f}" stroke-linecap="round" stroke-linejoin="round"/>']
        ka, kb = P.p('knee_far'), P.p('knee_near')
        front += [D.line((ka[0] - 8 * s, ka[1] - 9 * s), (kb[0] + 8 * s, kb[1] - 9 * s), C['equip2'], 9 * s)]
    return behind, front, held


def P_chest_machine(P):
    s = P.s
    hp, sh = P.f.w('hip'), P.f.w('shoulder')
    SW = BONES['shoulder_w']
    behind, front, held = [], [], []
    if P.view == 'front':
        a, b = _wpt(P, 0, hp[1] + 7, -26), _wpt(P, 0, hp[1] + 7, 26)
        behind += [D.rect(a[0], a[1], b[0] - a[0], 7 * s, C['frame'], rx=3)]
        behind += D.post(P.cx, a[1] + 7 * s, P.gy, w=6 * s)
        t0, t1 = _wpt(P, 0, sh[1] - 22, -20), _wpt(P, 0, hp[1] + 2, 20)
        behind += [D.rect(t0[0], t0[1], t1[0] - t0[0], t1[1] - t0[1], C['frame'], rx=5, op=0.8)]
        for sg, sd in ((-1, 'far'), (1, 'near')):
            pv = P.proj((sh[0] - 4, sh[1] - 26, sg * (SW + 3)))
            w = P.p(f'wrist_{sd}')
            behind += [D.circ(pv, 4.5 * s, C['frame'])]
            held += [D.line(pv, w, C['equip2'], 3.5 * s),
                     D.rect(w[0] - 3.2 * s, w[1] - 9 * s, 6.4 * s, 18 * s, C['equip'], rx=3)]
    else:  # de cima
        x0, x1 = hp[0] - 14, P.f.w('knee_near')[0] - 2
        a, b = _wpt(P, x0, 0, -24), _wpt(P, x1, 0, 24)
        behind += [D.rect(a[0], a[1], b[0] - a[0], b[1] - a[1], C['frame'], rx=4, op=0.75)]
        r0, r1 = _wpt(P, sh[0] - 16, 0, -26), _wpt(P, sh[0] - 9, 0, 26)
        behind += [D.rect(r0[0], r0[1], r1[0] - r0[0], r1[1] - r0[1], C['frame'], rx=3)]
        for sg, sd in ((-1, 'far'), (1, 'near')):
            pv = P.proj((sh[0] - 4, sh[1] - 26, sg * (SW + 3)))
            w = P.p(f'wrist_{sd}')
            behind += [D.circ(pv, 4.5 * s, C['frame'])]
            held += [D.line(pv, w, C['equip2'], 3.5 * s), D.circ(w, 5 * s, C['equip'])]
    return behind, front, held


def P_leg_ext(P):
    s = P.s
    hp, kn, an = P.f.w('hip'), P.f.w('knee_near'), P.f.w('ankle_near')
    a, b = _wpt(P, hp[0] - 18, hp[1] + 7), _wpt(P, kn[0] - 6, hp[1] + 7)
    behind = [D.rect(a[0], a[1], b[0] - a[0], 7 * s, C['frame'], rx=3)]
    behind += D.post((a[0] + b[0]) / 2 - 4 * s, a[1] + 7 * s, P.gy, w=6 * s)
    sh = P.f.w('shoulder')
    r0, r1 = _wpt(P, hp[0] - 24, sh[1] - 6), _wpt(P, hp[0] - 17, hp[1] + 7)
    behind += [D.rect(r0[0], r0[1], r1[0] - r0[0], r1[1] - r0[1], C['frame'], rx=3)]
    k2, a2 = P.proj(kn), P.proj(an)
    u = D.unit(k2, a2)
    n = (-u[1], u[0]) if -u[1] > 0 else (u[1], -u[0])
    roll = (a2[0] + n[0] * 8 * s, a2[1] + n[1] * 8 * s)
    pv = (k2[0] + 5 * s, k2[1])
    front = [D.line(pv, roll, C['equip2'], 3.5 * s), D.circ(pv, 3.5 * s, C['frame']),
             D.circ(roll, 6.5 * s, C['equip'])]
    return behind, front, []


def P_pullup(P):
    s = P.s
    if P.view == 'side':
        bar = P.proj(_bar_center(P))
        px = bar[0] - 46 * s
        behind = D.post(px, bar[1] - 4 * s, P.gy, w=7 * s)
        behind += [D.line((px, bar[1]), bar, C['frame'], 5 * s)]
        return behind, [], [D.circ(bar, 4.5 * s, C['equip'])]
    wa, wb = P.p('wrist_far'), P.p('wrist_near')
    u = D.unit(wa, wb)
    a = (wa[0] - u[0] * 30 * s, wa[1])
    b = (wb[0] + u[0] * 30 * s, wb[1])
    behind = D.post(a[0], a[1], P.gy, w=7 * s) + D.post(b[0], b[1], P.gy, w=7 * s)
    return behind, [], [D.line(a, b, C['equip'], 5 * s)]


def P_trx(P):
    s = P.s
    A = P.pair[0]
    wa = A.w('wrist_near')
    sa = A.w('shoulder_near')
    ux, uy = wa[0] - sa[0], wa[1] - sa[1]
    n = math.hypot(ux, uy)
    an = P.proj((wa[0] + ux / n * 70, wa[1] + uy / n * 70, 0))
    a0 = P.proj(wa)
    if an[1] < P.top + 30:  # mantém a ancoragem dentro do quadro
        k = (a0[1] - (P.top + 30)) / max(1.0, a0[1] - an[1])
        an = (a0[0] + (an[0] - a0[0]) * k, P.top + 30)
    w = P.p('wrist_near')
    behind = [D.rect(an[0] - 20 * s, an[1] - 6 * s, 30 * s, 6 * s, C['frame'], rx=2), D.circ(an, 3 * s, C['equip2'])]
    held = [D.line(an, w, C['equip2'], 2.5 * s), D.rect(w[0] - 3 * s, w[1] - 5 * s, 6 * s, 10 * s, C['equip'], rx=2)]
    return behind, [], held


def P_caneleira(P):
    an = P.p('ankle_near')
    k = P.s
    return P_mat(P)[0], [], [D.rect(an[0] - 7 * k, an[1] - 6 * k, 14 * k, 12 * k, C['equip2'], rx=4)]


def P_bike(P):
    s = P.s
    an1, an2 = P.p('ankle_near'), P.p('ankle_far')
    bb = D.mid(an1, an2)
    r = D.dist(an1, an2) / 2
    hp, wr = P.p('hip'), P.p('wrist_near')
    rear = (bb[0] - 44 * s, P.gy - 17 * s)
    front_w = (wr[0] + 10 * s, P.gy - 17 * s)
    behind = [D.circ(rear, 17 * s, 'none', C['frame'], 3 * s),
              D.circ(front_w, 17 * s, 'none', C['frame'], 3 * s),
              D.line(rear, bb, C['frame'], 3.5 * s),
              D.line(bb, (hp[0], hp[1] + 8 * s), C['frame'], 4 * s),
              D.line((hp[0], hp[1] + 8 * s), (wr[0] + 2 * s, wr[1] + 4 * s), C['frame'], 3.5 * s),
              D.line((wr[0] + 2 * s, wr[1] + 4 * s), front_w, C['frame'], 3.5 * s),
              D.rect(hp[0] - 13 * s, hp[1] + 5 * s, 28 * s, 7 * s, C['frame'], rx=3),
              D.circ(bb, r, 'none', C['frame'], 1.5 * s, op=0.9)]
    front = [D.line((wr[0] - 6 * s, wr[1] + 4 * s), (wr[0] + 10 * s, wr[1] + 4 * s), C['equip'], 4 * s),
             D.circ(bb, 4 * s, C['frame']), D.line(bb, an1, C['equip2'], 3 * s)]
    if P.idx == 1:  # seta no círculo do pedal (sentido do pedal)
        pts = [(bb[0] + r * 1.35 * math.cos(math.radians(a)), bb[1] + r * 1.35 * math.sin(math.radians(a)))
               for a in range(-150, 60, 10)]
        front += D.path_arrow(pts, trim0=0, trim1=2)
    return behind, front, []


def P_bob(P):
    s = P.s
    x = P.p('hip')[0] + 74 * s
    ytop = P.p('head')[1] + 4 * s
    o = [D.circ((x, ytop), 13 * s, C['equip2'])]
    o.append(f'<path d="M{x-15*s:.1f},{ytop+10*s:.1f} q{15*s:.1f},{-4*s:.1f} {30*s:.1f},0 l{6*s:.1f},{44*s:.1f} '
             f'q{-21*s:.1f},{7*s:.1f} {-42*s:.1f},0 z" fill="{C["equip2"]}" opacity="0.9"/>')
    o.append(D.rect(x - 5 * s, ytop + 54 * s, 10 * s, P.gy - ytop - 60 * s, C['frame'], rx=3))
    o.append(f'<path d="M{x-24*s:.1f},{P.gy:.1f} q{24*s:.1f},{-16*s:.1f} {48*s:.1f},0 z" fill="{C["frame"]}"/>')
    return o, [], []


# ---------------------------------------------------------------- tabela de poses
# Campos: A/B = poses; labels = {vista: (rótulo ①, rótulo ②)}; anchor = articulação que
# fica parada (e `y` = altura fixa dela; sem `y`, o ponto mais baixo encosta no chão);
# trace = articulações cuja trajetória vira seta; iso = isometria (✗ erro | ✓ certo);
# align = linha guia da isometria; touch = pontos que precisam tocar o chão;
# fixed = pontos que não podem sair do lugar entre ① e ②; slope = chão inclinado.
EX = {
    # ---- pernas / glúteos ----
    'agachamento-goblet': dict(
        labels={'side': ('Em pé, halter no peito', 'Coxas paralelas ao chão')},
        A=stand(arms={'near': (12, 150, 8, -8)}),
        B=stand(lean=30, legs={'near': (86, -28, 94), 'far': (84, -30, 92)},
                arms={'near': (22, 160, 8, -8)}),
        prop=P_one_dumbbell_vertical, trace=['hip'], fixed=['toe_near']),
    'agachamento-barra': dict(
        labels={'side': ('Barra nas costas', 'Quadril para trás e para baixo')},
        A=stand(arel=True, arms={'near': (-35, 164, 50, 15)}),
        B=stand(arel=True, lean=40, legs={'near': (86, -30, 94), 'far': (84, -32, 92)},
                arms={'near': (-35, 164, 50, 15)}),
        prop=P_barbell_back, trace=['hip'], fixed=['toe_near']),
    'afundo-halteres': dict(
        labels={'side': ('Em pé', 'Passo à frente, joelhos a 90°')},
        A=stand(),
        B=stand(lean=4, legs={'near': (80, -4, 92), 'far': (-4, -105, 10)}),
        anchor=dict(j='toe_far'), prop=P_dumbbells(), trace=['hip'], touch=['toe_far', 'toe_near']),
    'terra-romeno-halteres': dict(
        labels={'side': ('Em pé, halteres nas coxas', 'Quadril para trás, costas retas')},
        A=stand(arms={'near': (6, 6, 6), 'far': (2, 2, 6)}),
        B=stand(lean=64, legs={'near': (26, 6, 94), 'far': (24, 4, 92)},
                arms={'near': (-4, -4, 6), 'far': (-6, -6, 6)}),
        prop=P_dumbbells(), trace=['hip', 'wrist_near'], fixed=['toe_near']),
    'cadeira-extensora': dict(
        labels={'side': ('Joelhos dobrados', 'Pernas estendidas')},
        A=seated(legs={'near': (86, -10, 80), 'far': (86, -10, 80)}, arms={'near': (-8, 40), 'far': (-8, 40)}),
        B=seated(legs={'near': (86, 78, 160), 'far': (86, 78, 160)}, arms={'near': (-8, 40), 'far': (-8, 40)}),
        anchor=dict(j='hip', y=50), prop=P_leg_ext, trace=['ankle_near']),
    'panturrilha-halteres': dict(
        labels={'side': ('Pés apoiados', 'Na ponta dos pés')},
        A=stand(),
        B=stand(legs={'near': (3, 0, 52), 'far': (-2, -4, 48)}),
        anchor=dict(j='toe_near'), prop=P_dumbbells(),
        trace=[dict(j='heel_near', off=(-14, 2), ext=2.6)], fixed=['toe_near']),
    'elevacao-pelvica-halter': dict(
        labels={'side': ('Quadril embaixo', 'Tronco paralelo ao chão')},
        A=dict(SUP, rot=60, legs={'near': (-123, -19, -90), 'far': (-123, -19, -90)},
               arms={'near': (-60, -80)}),
        B=dict(SUP, rot=90, legs={'near': (-90, 0, -90), 'far': (-90, 0, -90)},
               arms={'near': (-95, -115)}),
        anchor=dict(j='shoulder', y=42), prop=P_hipthrust, trace=['hip'],
        touch=['heel_near'], fixed=['toe_near']),
    'ponte-gluteo-isometrica': dict(
        iso=True,
        labels={'side': ('Evite: quadril baixo', 'Quadril alto, linha reta')},
        A=dict(SUP, rot=96, legs={'near': (-131.6, -6.6, -90), 'far': (-131.6, -6.6, -90)},
               arms={'near': (-86, -86)}),
        B=dict(SUP, rot=111.3, legs={'near': (-111.3, 0, -90), 'far': (-111.3, 0, -90)},
               arms={'near': (-86, -86)}),
        anchor=dict(j='shoulder', y=7), prop=P_mat, align=('shoulder', 'hip', 'knee_near'),
        touch=['heel_near']),
    'coice-gluteo-caneleira': dict(
        labels={'side': ('Joelho a 90°, coxa para baixo', 'Coxa alinhada ao tronco')},
        A=prone(75.7, legs={'near': (0, -114, 0), 'far': (0, -114, 0)}, arms={'near': (0, 0, 4)}),
        B=prone(75.7, legs={'near': (-76, -166, -76), 'far': (0, -114, 0)}, arms={'near': (0, 0, 4)}),
        anchor=dict(j='wrist_near', y=0), prop=P_caneleira, trace=['ankle_near'], touch=['knee_far', 'wrist_near']),
    'kettlebell-swing': dict(
        labels={'side': ('Kettlebell entre as pernas', 'Quadril à frente, sobe ao peito')},
        A=stand(lean=62, legs={'near': (24, 6, 94), 'far': (22, 4, 92)},
                arms={'near': (-26, -26, 4), 'far': (-28, -28, 4)}),
        B=stand(lean=2, arms={'near': (84, 86, 4), 'far': (82, 84, 4)}),
        prop=P_kettlebell, trace=['wrist_near'], fixed=['toe_near']),

    # ---- peito / ombros / braços ----
    'supino-halteres': dict(
        labels={'side': ('Halteres ao lado do peito', 'Braços estendidos')},
        A=dict(SUP, legs=LEGS_BENCH, arms={'near': (-20, 180, 55, 0)}),
        B=dict(SUP, legs=LEGS_BENCH, arms={'near': (172, 178, 8, 0)}),
        anchor=dict(j='hip', y=46), prop=P_bench_supine(), trace=['wrist_near'], touch=['heel_near']),
    'supino-reto-barra': dict(
        labels={'side': ('Barra no meio do peito', 'Braços estendidos')},
        A=dict(SUP, legs=LEGS_BENCH, arms={'near': (-20, 180, 62, 0)}),
        B=dict(SUP, legs=LEGS_BENCH, arms={'near': (172, 178, 14, 4)}),
        anchor=dict(j='hip', y=46), prop=P_bench_supine(barbell=True), trace=['wrist_near'], touch=['heel_near']),
    'voador-maquina': dict(
        views=('front', 'top'),
        labels={'front': ('Braços abertos', 'Mãos se encontram à frente'),
                'top': ('Abertos para os lados', 'Fecham num arco à frente')},
        A=seated(arms={'near': (90, 90, 82, 62)}),
        B=seated(arms={'near': (88, 90, 4, -24)}),
        anchor=dict(j='hip', y=48), prop=P_chest_machine,
        trace={'front': ['wrist_near', 'wrist_far'], 'top': ['wrist_near', 'wrist_far']}),
    'flexao-bracos': dict(
        labels={'side': ('Peito perto do chão', 'Braços estendidos')},
        A=prone(86, legs={'near': (-86, -86, 0)}, arms={'near': (-77.6, 35.2, 45, 0)}),
        B=prone(73.7, legs={'near': (-73.7, -73.7, 0)}, arms={'near': (0, 0, 12)}),
        anchor=dict(j='toe_near', y=0), prop=P_mat, trace=['shoulder'],
        touch=['toe_near', 'wrist_near'], fixed=['toe_near', 'wrist_near']),
    'desenvolvimento-ombro-halteres': dict(
        views=('side', 'front'),
        labels={'side': ('Halteres na altura dos ombros', 'Acima da cabeça'),
                'front': ('Cotovelos abertos para os lados', 'Braços estendidos')},
        A=stand(arms={'near': (80, 180, 70, 0)}),
        B=stand(arms={'near': (178, 180, 16, 2)}),
        prop=P_dumbbells(grip=(0, 0, 1)), trace=['wrist_near'],
        trace_front=['wrist_near', 'wrist_far'], fixed=['toe_near']),
    'elevacao-lateral': dict(
        views=('front',),
        labels={'front': ('Braços ao lado do corpo', 'Abrem até a linha dos ombros')},
        A=stand(arms={'near': (4, 8, 8, 14)}),
        B=stand(arms={'near': (40, 50, 82, 86)}),
        prop=P_dumbbells(grip=(1, 0, 0)), trace=['wrist_near', 'wrist_far']),
    'rosca-direta-halteres': dict(
        labels={'side': ('Braços estendidos', 'Cotovelo parado, sobe o halter')},
        A=stand(arms={'near': (3, 6), 'far': (-1, 2)}),
        B=stand(arms={'near': (5, 145), 'far': (1, 140)}),
        prop=P_dumbbells(), trace=['wrist_near'], fixed=['toe_near']),
    'triceps-frances-halter': dict(
        labels={'side': ('Halter atrás da cabeça', 'Braços estendidos')},
        A=stand(arms={'near': (172, 320, 10, 10)}),
        B=stand(arms={'near': (174, 178, 10, 6)}),
        prop=P_triceps, trace=['wrist_near'], fixed=['toe_near']),
    'puxada-alta-maquina': dict(
        views=('side', 'front'),
        labels={'side': ('Braços estendidos acima', 'Barra no alto do peito'),
                'front': ('Pegada aberta', 'Cotovelos descem ao lado')},
        A=seated(lean=-8, arms={'near': (170, 176, 24, 20)}),
        B=seated(lean=-12, arms={'near': (-15, 147, 55, 16)}),
        anchor=dict(j='hip', y=48), prop=P_pulldown, trace=['wrist_near'],
        trace_front=['elbow_near', 'elbow_far']),
    'remada-curvada-halteres': dict(
        labels={'side': ('Braços estendidos', 'Cotovelos para trás')},
        A=stand(lean=50, legs={'near': (28, 6, 94), 'far': (26, 4, 92)},
                arms={'near': (3, 3, 4), 'far': (0, 0, 4)}),
        B=stand(lean=50, legs={'near': (28, 6, 94), 'far': (26, 4, 92)},
                arms={'near': (-92, 0, 4), 'far': (-94, -2, 4)}),
        prop=P_dumbbells(), trace=['elbow_near'], fixed=['toe_near']),
    'barra-fixa': dict(
        views=('side', 'front'),
        labels={'side': ('Pendurado, braços estendidos', 'Queixo acima da barra'),
                'front': ('Pegada aberta', 'Cotovelos descem e abrem')},
        A=stand(lean=0, legs={'near': (-8, -24, 70), 'far': (-12, -28, 66)},
                arms={'near': (180, 180, 20, 20)}),
        B=stand(lean=0, legs={'near': (-8, -24, 70), 'far': (-12, -28, 66)},
                arms={'near': (10, 180, 45, 12)}),
        anchor=dict(j='wrist_near', y=196), prop=P_pullup, trace=['head'],
        trace_front=['elbow_near', 'elbow_far']),
    'remada-trx': dict(
        labels={'side': ('Corpo reto, braços estendidos', 'Peito sobe até as mãos')},
        A=dict(lean=0, rot=-32, legs={'near': (0, 0, 90), 'far': (0, 0, 90)},
               arms={'near': (100, 100, 6)}),
        B=dict(lean=0, rot=-16, legs={'near': (0, 0, 90), 'far': (0, 0, 90)},
               arms={'near': (-60, 90, 10, 0)}),
        anchor=dict(j='heel_near'), prop=P_trx, trace=['shoulder'], fixed=['heel_near']),

    # ---- abdômen / core ----
    'abdominal-crunch': dict(
        labels={'side': ('Deitado, joelhos dobrados', 'Ombros saem do chão')},
        A=dict(SUP, legs=LEGS_SUP_BENT, arel=True, arms={'near': (15, 168)}),
        B=dict(SUP, lean=32, legs=LEGS_SUP_BENT, arel=True, arms={'near': (15, 168)}),
        anchor=dict(j='hip', y=7), prop=P_mat, trace=['head'], touch=['heel_near']),
    'prancha': dict(
        iso=True,
        labels={'side': ('Evite: quadril caído', 'Ombro, quadril e pé em linha')},
        A=prone(90.1, lean=-16, legs={'near': (-91, -91, 0)}, arms={'near': (0, 90, 6)}),
        B=prone(84.7, legs={'near': (-84.7, -84.7, 0)}, arms={'near': (0, 90, 6)}),
        anchor=dict(j='toe_near', y=0), prop=P_mat, align=('shoulder', 'hip', 'ankle_near'),
        touch=['toe_near', 'elbow_near']),
    'prancha-lateral': dict(
        iso=True, views=('front',),
        labels={'front': ('Evite: quadril afundado', 'Corpo reto, quadril alto')},
        A=dict(roll=-85.4, bend=-24, legs={'near': (2, 0, 92), 'far': (2, 0, 92)},
               arms={'near': (90, 92, 84, 0), 'far': (0, 0, 2)}),
        B=dict(roll=-76.3, legs={'near': (2, 0, 92), 'far': (2, 0, 92)},
               arms={'near': (90, 92, 84, 0), 'far': (0, 0, 2)}),
        anchor=dict(j='ankle_near', y=3), touch=['elbow_near'], align=('shoulder', 'hip', 'ankle_near'), prop=P_mat),
    'abdominal-elevacao-pernas': dict(
        labels={'side': ('Pernas esticadas', 'Sobem até apontar para o teto')},
        A=dict(SUP, legs={'near': (-92, -92, 178), 'far': (-92, -92, 178)}, arms={'near': (-90, -90)}),
        B=dict(SUP, legs={'near': (178, 178, 90), 'far': (178, 178, 90)}, arms={'near': (-90, -90)}),
        anchor=dict(j='hip', y=7), prop=P_mat, trace=['ankle_near']),
    'abdominal-bicicleta': dict(
        views=('side', 'top'),
        labels={'side': ('Joelho vem ao peito', 'Troca de perna'),
                'top': ('Cotovelo vai ao joelho oposto', 'Gira para o outro lado')},
        A=dict(SUP, lean=34, twist=34, arel=True,
               legs={'near': (160, -90, 180, -12), 'far': (-100, -100, 180)},
               arms={'near': (150, 280, 70, 40)}),
        B=dict(SUP, lean=34, twist=-34, arel=True,
               legs={'near': (-100, -100, 180), 'far': (160, -90, 180, -12)},
               arms={'near': (150, 280, 70, 40)}),
        anchor=dict(j='hip', y=7), prop=P_mat, trace=['knee_far'],
        trace_top=['elbow_far', 'knee_far']),
    'abdominal-mountain-climber': dict(
        labels={'side': ('Joelho direito ao peito', 'Troca: joelho esquerdo')},
        A=prone(73.7, legs={'near': (62, -88, -40), 'far': (-73.7, -73.7, 0)}, arms={'near': (0, 0, 12)}),
        B=prone(73.7, legs={'near': (-73.7, -73.7, 0), 'far': (62, -88, -40)}, arms={'near': (0, 0, 12)}),
        anchor=dict(j='wrist_near', y=0), prop=P_mat, trace=['knee_far'], touch=['wrist_near']),

    # ---- cardio ----
    'caminhada': dict(
        labels={'side': ('Pisa com o calcanhar', 'Impulso com o pé de trás')},
        A=stand(lean=5, legs={'near': (24, 8, 104), 'far': (-16, -24, 76)},
                arms={'near': (-20, 30), 'far': (22, 70)}),
        B=stand(lean=5, legs={'near': (-16, -24, 76), 'far': (24, 8, 104)},
                arms={'near': (22, 70), 'far': (-20, 30)}),
        anchor=dict(j='hip'), prop=P_none, trace=['ankle_far'], ghost=False),
    'caminhada-inclinada': dict(
        labels={'side': ('Tronco levemente à frente', 'Passos curtos na subida')},
        A=stand(lean=12, legs={'near': (30, 4, 104), 'far': (-12, -18, 74)},
                arms={'near': (-20, 30), 'far': (22, 70)}),
        B=stand(lean=12, legs={'near': (-12, -18, 74), 'far': (30, 4, 104)},
                arms={'near': (22, 70), 'far': (-20, 30)}),
        anchor=dict(j='hip'), slope=8, prop=P_none, trace=['ankle_far'], ghost=False),
    'corrida': dict(
        labels={'side': ('Pé apoia embaixo do quadril', 'Joelho à frente, impulso')},
        A=stand(lean=10, legs={'near': (14, -6, 96), 'far': (-24, -100, 10)},
                arms={'near': (-34, 56), 'far': (36, 126)}),
        B=stand(lean=10, legs={'near': (-30, -60, 40), 'far': (60, 6, 96)},
                arms={'near': (36, 126), 'far': (-34, 56)}),
        anchor=dict(j='hip'), prop=P_none, trace=['knee_far'], ghost=False),
    'bike-cardio': dict(
        labels={'side': ('Pé embaixo: joelho quase reto', 'Pé em cima')},
        A=dict(lean=24, legs={'near': (36, 8, 96), 'far': (98, 0, 92)},
               arms={'near': (66, 76), 'far': (64, 74)}),
        B=dict(lean=24, legs={'near': (98, 0, 92), 'far': (36, 8, 96)},
               arms={'near': (66, 76), 'far': (64, 74)}),
        anchor=dict(j='hip', y=88), prop=P_bike, ghost=False),
    'boxe-bob': dict(
        labels={'side': ('Guarda alta', 'Jab: soco reto')},
        A=stand(lean=6, legs={'near': (18, 2, 96), 'far': (-20, -26, 70)},
                arms={'near': (26, 150), 'far': (20, 144)}),
        B=stand(lean=8, legs={'near': (18, 2, 96), 'far': (-20, -26, 70)},
                arms={'near': (86, 90), 'far': (22, 146)}),
        prop=P_bob, trace=['wrist_near'], fixed=['toe_near']),
}

# aliases: mesmo desenho, outro id de exercício
ALIAS = {
    'caminhada-rapida': 'caminhada',
    'caminhada-intervalada': 'caminhada',
}

CONTACT_SKIP = ('head', 'neck', 'shoulder', 'hip')


# ---------------------------------------------------------------- montagem
def make_fig(spec, name, anchor, slope=0.0, check=True):
    f = Figure(name=name, **{k: v for k, v in spec.items() if k in POSE_KEYS})
    j = anchor.get('j', 'ankle_near')
    p = f.w(j)
    f.translate(-p[0], 0, -p[2])
    t = math.tan(math.radians(slope))
    if anchor.get('y') is not None:
        f.translate(0, -anchor['y'] - f.w(j)[1])
    else:
        low = max(q[1] + t * q[0] for k, q in f.J.items() if k not in CONTACT_SKIP)
        f.translate(0, -low)
    # nada atravessa o chão
    for k, q in (f.J.items() if check else ()):
        if k in ('head', 'neck'):
            continue
        if q[1] + t * q[0] > 1.5:
            raise PoseError(f'{name}: {k} atravessa o chão ({q[1] + t * q[0]:.0f})')
    return f


def check_pair(ex_id, spec, a, b):
    t = math.tan(math.radians(spec.get('slope', 0)))
    for f, tag in ((a, 'A'), (b, 'B')):
        for j in spec.get('touch', []):
            q = f.w(j)
            gap = -(q[1] + t * q[0])
            if gap > 5:
                raise PoseError(f'{ex_id}/{tag}: {j} deveria tocar o chão (está {gap:.0f} acima)')
    for j in spec.get('fixed', []):
        pa, pb = a.w(j), b.w(j)
        d = math.dist(pa[:2], pb[:2])
        if d > 4:
            raise PoseError(f'{ex_id}: {j} sai do lugar entre ① e ② ({d:.0f})')


def views_of(spec):
    return spec.get('views', ('side',))


def traces_for(spec, view):
    tr = spec.get('trace', [])
    if isinstance(tr, dict):
        return tr.get(view, [])
    return spec.get(f'trace_{view}', tr)


def project_bbox(f, view):
    xs, ys = [], []
    r = BONES['head_r']
    for k, q in f.J.items():
        (x, y), _ = D.VIEWS[view](q)
        rr = r if k == 'head' else 6
        xs += [x - rr, x + rr]
        ys += [y - rr, y + rr]
    return min(xs), min(ys), max(xs), max(ys)


def gen_one(ex_id, spec):
    anchor = spec.get('anchor', {})
    slope = spec.get('slope', 0.0)
    pa, pb = normalize(spec['A']), normalize(spec['B'])
    a = make_fig(pa, ex_id + '/A', anchor, slope)
    b = make_fig(pb, ex_id + '/B', anchor, slope)
    check_pair(ex_id, spec, a, b)
    views = views_of(spec)
    # escala única para a ilustração inteira (todas as vistas com o mesmo tamanho de boneco)
    scale = spec.get('scale', 1.0)
    boxes = {}
    for v in views:
        ba, bb = project_bbox(a, v), project_bbox(b, v)
        ub = (min(ba[0], bb[0]), min(ba[1], bb[1]), max(ba[2], bb[2]), max(ba[3], bb[3]))
        boxes[v] = ub
        wdt = ub[2] - ub[0]
        if v == 'top':
            hgt = ub[3] - ub[1]
        else:
            hgt = max(0.0, -ub[1])
        scale = min(scale, PANEL_W / wdt, (GROUND - FIG_TOP) / max(1.0, hgt))
    # trajetórias (interpolação das poses)
    steps = [i / 16 for i in range(17)]
    mids = [make_fig(lerp_pose(pa, pb, t), f'{ex_id}/t{t:.2f}', anchor, slope, check=False) for t in steps]

    parts = []
    H = RH * len(views)
    for ri, v in enumerate(views):
        top = ri * RH
        ub = boxes[v]
        if ri:
            parts.append(D.line((10, top), (W - 10, top), C['divider'], 1.2, cap='butt'))
        gy = top + GROUND
        if v == 'top':
            oy = top + (FIG_TOP + GROUND) / 2 - (ub[1] + ub[3]) / 2 * scale
        else:
            oy = gy
        # chão
        if v != 'top':
            if slope:
                t = math.tan(math.radians(slope))
                for cx in PANEL_CX:
                    ox = cx - (ub[0] + ub[2]) / 2 * scale
                    x0, x1 = cx - 88, cx + 88
                    parts.append(D.line((x0, oy - t * (x0 - ox)), (x1, oy - t * (x1 - ox)), C['ground'], 2, cap='butt'))
            else:
                parts.append(D.line((8, gy), (W - 8, gy), C['ground'], 2, cap='butt'))
        parts.append(D.line((W / 2, top + 26), (W / 2, (gy - 4) if v != 'top' else top + GROUND), C['divider'], 1.2,
                            cap='butt', dash='3 4'))
        parts.append(D.text((10, top + 14), D.VIEW_TAG[v], size=9, anchor='start', color=C['tag'], weight='700',
                            extra=' letter-spacing="0.8"'))
        pair = (a, b)
        for idx, (f, cx) in enumerate(zip(pair, PANEL_CX)):
            ox = cx - (ub[0] + ub[2]) / 2 * scale
            P = Panel(f, v, scale, ox, oy, gy)
            P.cx, P.top, P.idx, P.pair = cx, top, idx, pair
            behind, front, held = (spec.get('prop') or P_none)(P)
            parts += behind
            if idx == 1 and not spec.get('iso') and spec.get('ghost', True):
                G = Panel(a, v, scale, ox, oy, gy)
                G.cx, G.top, G.idx, G.pair = cx, top, 0, pair
                ghost = D.body(G, ghost=True) + (spec.get('prop') or P_none)(G)[2]
                parts += D.group(ghost, op=0.3)
            parts += D.body(P)
            parts += held + front
            if spec.get('iso') and spec.get('align'):
                j0, _, j2 = spec['align']
                col = C['ok'] if idx == 1 else C['bad']
                ideal = b if idx == 1 else b  # a linha certa é sempre a da pose ✓
                Q = Panel(ideal, v, scale, ox, oy, gy)
                p0, p2 = Q.p(j0), Q.p(j2)
                u = D.unit(p0, p2)
                p0 = (p0[0] - u[0] * 14, p0[1] - u[1] * 14)
                p2 = (p2[0] + u[0] * 14, p2[1] + u[1] * 14)
                parts.append(D.line(p0, p2, col, 2.2, dash='6 5', op=0.95))
            if idx == 1 and not spec.get('iso'):
                for tr in traces_for(spec, v):
                    tr = tr if isinstance(tr, dict) else dict(j=tr)
                    pts = []
                    for m in mids:
                        M = Panel(m, v, scale, ox, oy, gy)
                        pts.append(M.p(tr['j']))
                    ext = tr.get('ext', 1.0)
                    plen = sum(D.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
                    if 'ext' not in tr and 3 < plen < 24:  # movimento curto: seta maior para ser vista
                        ext = 24 / plen
                    if ext != 1.0:
                        c0 = D.mid(pts[0], pts[-1])
                        pts = [(c0[0] + (p[0] - c0[0]) * ext, c0[1] + (p[1] - c0[1]) * ext) for p in pts]
                    dx, dy = tr.get('off', (0, 0))
                    pts = [(p[0] + dx, p[1] + dy) for p in pts]
                    plen = sum(D.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
                    parts += D.path_arrow(pts, trim0=tr.get('trim0', min(7, plen * 0.12)),
                                          trim1=tr.get('trim1', min(9, plen * 0.16)))
        # rótulos com selo
        labels = spec['labels'][v]
        for idx, (lab, cx) in enumerate(zip(labels, PANEL_CX)):
            lo, hi = (8, W / 2 - 9) if idx == 0 else (W / 2 + 9, W - 8)
            size = min(10.5, (hi - lo - 21) / (len(lab) * 0.52))
            tw = len(lab) * size * 0.52
            x0 = min(max(cx - (tw + 21) / 2, lo), hi - tw - 21)
            if spec.get('iso'):
                parts += D.badge((x0 + 8, top + LABEL_Y - 3.5), 'ok' if idx else 'bad')
            else:
                parts += D.badge((x0 + 8, top + LABEL_Y - 3.5), 'n', str(idx + 1))
            parts.append(D.text((x0 + 21, top + LABEL_Y), lab, size=size, anchor='start', color='#cbd5e1'))
        if not spec.get('iso'):
            y = top + LABEL_Y - 3.5
            parts.append(f'<path d="M{W/2-2.5:.1f},{y-4.5:.1f} L{W/2+2.5:.1f},{y:.1f} L{W/2-2.5:.1f},{y+4.5:.1f}" '
                         f'fill="none" stroke="{C["tag"]}" stroke-width="1.8" stroke-linecap="round" '
                         f'stroke-linejoin="round"/>')
    return D.svg(W, H, parts, title=ex_id)


SHEET_CSS = ('body{background:#0f172a;color:#e2e8f0;font:14px -apple-system,Arial;margin:10px}'
             'figure{margin:0;background:#0b1220;border:1px solid #ffffff18;border-radius:10px;padding:2px}'
             'figcaption{color:#fb923c;font-weight:700;font-size:11px;padding:2px 6px}'
             'svg{width:100%;height:auto;display:block}'
             '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;align-items:start}')


def write_sheet(path, svgs):
    # Folha de contato para revisar TODAS as ilustrações de uma vez no navegador.
    figs = ''.join('<figure><figcaption>%s</figcaption>%s</figure>' % (k, v.split('?>', 1)[-1])
                   for k, v in svgs.items())
    with open(path, 'w') as fh:
        fh.write('<!doctype html><meta charset=utf-8><title>Ilustracoes Achilles</title><style>'
                 + SHEET_CSS + '</style><div class=grid>' + figs + '</div>')
    print('folha de contato:', path)


SW = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'service-worker.js')


def sync_service_worker(ids):
    # Mantém a lista de ilustrações pré-cacheadas do service worker em sincronia,
    # senão o PWA (offline) não mostra as imagens.
    try:
        s = open(SW, encoding='utf-8').read()
    except OSError:
        return
    ini, fim = '// <ilustracoes>', '// </ilustracoes>'
    if ini not in s or fim not in s:
        print('aviso: marcadores <ilustracoes> não encontrados em service-worker.js')
        return
    lista = '\n'.join(f"  'assets/exercises/{i}.svg'," for i in sorted(ids))
    novo = s[:s.index(ini) + len(ini)] + '\n' + lista + '\n  ' + s[s.index(fim):]
    if novo != s:
        open(SW, 'w', encoding='utf-8').write(novo)
        print('service-worker.js: lista de ilustrações atualizada')


def main():
    global OUT
    check = '--check' in sys.argv
    for a in sys.argv[1:]:
        if a.startswith('--out='):  # revisar em outra pasta sem mexer nos assets
            OUT = a.split('=', 1)[1]
    only = [a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--only=')]
    errs = []
    made = 0
    svgs = {}
    for ex_id, spec in EX.items():
        if only and ex_id not in only[0].split(','):
            continue
        try:
            s = gen_one(ex_id, spec)
        except PoseError as e:
            errs.append(str(e))
            continue
        svgs[ex_id] = s
        if not check:
            with open(os.path.join(OUT, ex_id + '.svg'), 'w') as fh:
                fh.write(s)
            for alias, src in ALIAS.items():
                if src == ex_id:
                    with open(os.path.join(OUT, alias + '.svg'), 'w') as fh:
                        fh.write(s.replace(f'>{ex_id}<', f'>{alias}<'))
        made += 1
    if not check and not only and OUT.endswith('exercises'):
        sync_service_worker(list(svgs.keys()) + list(ALIAS.keys()))
    for a in sys.argv[1:]:
        if a.startswith('--sheet'):
            write_sheet(a.split('=', 1)[1] if '=' in a else '/tmp/achilles-ilustracoes.html', svgs)
    for e in errs:
        print('ERRO ANATÔMICO:', e)
    total = len(only[0].split(',')) if only else len(EX)
    print(f'{made}/{total} poses válidas' + ('' if check else f' — SVGs escritos em {os.path.relpath(OUT)}'))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())

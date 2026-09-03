#!/usr/bin/env python3
"""gen_exercise_svgs.py — gera as ilustrações (assets/exercises/*.svg) dos exercícios.

NÃO é etapa de build: é um gerador offline de assets (os SVGs ficam versionados).
Rode depois de mexer nas poses:   python3 tools/gen_exercise_svgs.py
Só validar as poses (sem escrever):  python3 tools/gen_exercise_svgs.py --check

Cada exercício tem 2 poses (início → fim). As poses são ÂNGULOS validados por
skeleton.py, que recusa joelho/cotovelo/tornozelo em ângulo impossível.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skeleton import Figure, PoseError, BONES          # noqa: E402
import draw as D                                        # noqa: E402
from draw import C, GROUND                             # noqa: E402

W, H = 380, 212
CXA, CXB = 98, 282
LBL_Y = 204
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'exercises')

# ---------------------------------------------------------------- poses padrão
STAND = dict(lean=4, legs={'near': (4, 0, 94), 'far': (-4, -7, 90)}, arms={'near': (2, 4), 'far': (-2, 0)})


def pose(**kw):
    p = dict(STAND)
    p.update(kw)
    return p


def seated(**kw):
    """Sentado: coxa à frente na horizontal, canela para baixo."""
    p = dict(lean=6, legs={'near': (84, -4, 94), 'far': (80, -10, 92)}, arms={'near': (2, 4), 'far': (-2, 0)})
    p.update(kw)
    return p


SUPINE = dict(face=-1, rot=90)      # de barriga para cima, cabeça à direita
PRONE = dict(face=1, rot=90)        # de bruços, cabeça à direita
LEGS_BENT_FLOOR = {'near': (0, -90, 0), 'far': (-6, -84, 4)}   # deitado, joelhos dobrados, pés no chão
LEGS_STRAIGHT = {'near': (2, 0, 90), 'far': (-3, -3, 88)}
ARMS_HEAD = {'near': (160, 250), 'far': (150, 244)}            # mãos atrás da cabeça (deitado)
ARMS_SIDE = {'near': (2, 4), 'far': (-4, -2)}

# ---------------------------------------------------------------- equipamentos
def P_none(a, b):
    return [], []


def P_dumbbells(a, b, sides=('far', 'near')):
    return [], D.dumbbells(a, sides) + D.dumbbells(b, sides)


def P_dumbbells_near(a, b):
    return P_dumbbells(a, b, sides=('near',))


def P_goblet(a, b):
    """Um halter na vertical, segurado junto ao peito pelas duas mãos."""
    front = []
    for f in (a, b):
        w = f.p('wrist_near')
        front += [D.rect(w[0] - 5, w[1] - 4, 10, 5, C['equip'], rx=2),
                  D.rect(w[0] - 8, w[1] + 1, 16, 11, C['equip'], rx=3),
                  D.rect(w[0] - 8, w[1] - 14, 16, 11, C['equip'], rx=3)]
    return [], front


def P_kettlebell(a, b):
    return [], D.kettlebell(a.p('wrist_near')) + D.kettlebell(b.p('wrist_near'))


def P_barbell_hands(a, b):
    out = []
    for f in (a, b):
        w = f.p('wrist_near')
        out += D.barbell((w[0] - 1, w[1]), (w[0] + 1, w[1]))
    return [], out


def P_barbell_back(a, b):
    """Barra apoiada nos trapézios (agachamento)."""
    out = []
    for f in (a, b):
        s = f.p('shoulder')
        y = s[1] - 4
        out += D.barbell((s[0] - 2, y), (s[0] + 2, y))
    return [], out


def _bench_under(f, pad=16, w=None):
    # Banco embaixo do tronco: do quadril até a cabeça.
    hp, hd = f.p('hip'), f.p('head')
    cx = (hp[0] + hd[0]) / 2
    width = w or (abs(hd[0] - hp[0]) + 2 * pad)
    return D.bench(cx, max(hp[1], hd[1]) + 8, w=width)


def P_bench_flat(a, b):
    behind = _bench_under(a) + _bench_under(b)
    return behind, D.dumbbells(a, ('near',)) + D.dumbbells(b, ('near',))


def P_bench_barbell(a, b):
    return _bench_under(a) + _bench_under(b), P_barbell_hands(a, b)[1]


def P_hipthrust(a, b):
    behind, front = [], []
    for f in (a, b):
        sh = f.p('shoulder')
        behind += D.bench((sh[0] + f.p('head')[0]) / 2 + 4, max(sh[1], f.p('head')[1]) + 7, w=62)
        hp = f.p('hip')
        front += [D.rect(hp[0] - 13, hp[1] - 12, 26, 9, C['equip'], rx=3),
                  D.rect(hp[0] - 17, hp[1] - 14, 5, 13, C['equip2'], rx=2),
                  D.rect(hp[0] + 12, hp[1] - 14, 5, 13, C['equip2'], rx=2)]
    return behind, front


def P_mat(a, b):
    return D.mat(CXA - 62, CXA + 62) + D.mat(CXB - 62, CXB + 62), []


def P_pulldown(a, b):
    behind, front = [], []
    for f in (a, b):
        x = f.p('hip')[0] + 66
        behind += D.frame_post(x, y1=16)
        behind += D.seat(f.p('hip')[0] + 2, f.p('hip')[1] + 8)
        top = (x - 4, 22)
        w = f.p('wrist_near')
        behind += D.cable(top, w)
        front += D.barbell((w[0], w[1] - 1), (w[0], w[1] + 1), plates=False)
    return behind, front


def P_chest_machine(a, b):
    behind, front = [], []
    for f in (a, b):
        hp = f.p('hip')
        behind += D.seat(hp[0] + 2, hp[1] + 8)
        behind += D.frame_post(hp[0] - 26, y1=hp[1] - 60)
        w = f.p('wrist_near')
        front += [D.rect(w[0] - 4, w[1] - 12, 8, 24, C['equip'], rx=3)]
        behind += D.cable((hp[0] - 26, hp[1] - 52), w)
    return behind, front


def P_leg_ext(a, b):
    behind, front = [], []
    for f in (a, b):
        hp = f.p('hip')
        behind += D.seat(hp[0], hp[1] + 8, w=48)
        behind += D.frame_post(hp[0] - 22, y1=hp[1] - 46)
        an = f.p('ankle_near')
        front += [D.circ((an[0] + 4, an[1]), 7, C['equip'])]
    return behind, front


def P_pullup(a, b):
    behind = []
    for f in (a, b):
        w = f.p('wrist_near')
        behind += [D.line((w[0] - 46, w[1] - 2), (w[0] + 46, w[1] - 2), C['equip'], 5)]
        behind += D.frame_post(f.p('hip')[0] + 52, y1=w[1] - 2)
    return behind, []


def P_trx(a, b):
    behind = []
    for f in (a, b):
        w = f.p('wrist_near')
        top = (f.p('hip')[0] + 66, 18)
        behind += [D.line(top, w, C['equip2'], 2.5),
                   D.line((top[0] - 40, 18), (top[0] + 8, 18), C['frame'], 4)]
    return behind, []


def P_caneleira(a, b):
    front = []
    for f in (a, b):
        an = f.p('ankle_near')
        front += [D.rect(an[0] - 7, an[1] - 6, 14, 12, C['equip2'], rx=4)]
    return D.mat(CXA - 58, CXA + 58) + D.mat(CXB - 58, CXB + 58), front


def P_bike(a, b):
    # Bicicleta montada a partir das juntas: eixo do pedal entre os tornozelos.
    behind = []
    for f in (a, b):
        an1, an2 = f.p('ankle_near'), f.p('ankle_far')
        bb = ((an1[0] + an2[0]) / 2, (an1[1] + an2[1]) / 2)
        hp, wr = f.p('hip'), f.p('wrist_near')
        rear = (bb[0] - 40, GROUND - 17)
        front_w = (wr[0] + 8, GROUND - 17)
        behind += [D.circ(rear, 17, 'none', C['frame'], 3),
                   D.circ(front_w, 17, 'none', C['frame'], 3),
                   D.line(rear, (bb[0], bb[1]), C['frame'], 3.5),
                   D.line((bb[0], bb[1]), (hp[0], hp[1] + 6), C['frame'], 4),
                   D.line((hp[0], hp[1] + 6), (wr[0] + 2, wr[1] + 4), C['frame'], 3.5),
                   D.line((wr[0] + 2, wr[1] + 4), front_w, C['frame'], 3.5),
                   D.rect(hp[0] - 13, hp[1] + 4, 28, 7, C['frame'], rx=3),
                   D.line((wr[0] - 6, wr[1] + 4), (wr[0] + 10, wr[1] + 4), C['equip'], 4),
                   D.circ(bb, 4, C['frame']),
                   D.line(bb, an1, C['equip2'], 3),
                   D.line(bb, an2, C['equip2'], 3)]
    return behind, []


def P_bob(a, b):
    behind = []
    for f in (a, b):
        behind += D.bob_dummy(f.p('hip')[0] + 78, ytop=f.p('head')[1] + 6)
    return behind, []


def P_ramp(a, b):
    out = []
    for cx in (CXA, CXB):
        out += D.ramp(cx - 70, cx + 70, GROUND + 2, GROUND - 34)
    return out, []


def P_align(a, b):
    """Linha de alinhamento (isometria): ombro → tornozelo."""
    f = b
    return [], [D.line(f.p('shoulder'), f.p('ankle_near'), C['arrow'], 2, dash='5 5', op=0.9)]


# ---------------------------------------------------------------- tabela de poses
EX = {
    # ---- pernas / glúteos ----
    'agachamento-goblet': dict(
        labels=('Em pé', 'Agachado (coxa paralela)'),
        A=pose(arms={'near': (14, 132), 'far': (10, 128)}),
        B=pose(lean=26, legs={'near': (62, -26, 94), 'far': (58, -30, 92)},
               arms={'near': (14, 132), 'far': (10, 128)}),
        prop=P_goblet, arrow='hip'),
    'agachamento-barra': dict(
        labels=('Em pé (barra nas costas)', 'Agachado'),
        A=pose(arms={'near': (-150, -60), 'far': (-146, -56)}),
        B=pose(lean=24, legs={'near': (60, -28, 94), 'far': (56, -32, 92)},
               arms={'near': (-150, -60), 'far': (-146, -56)}),
        prop=P_barbell_back, arrow='hip'),
    'afundo-halteres': dict(
        labels=('Em pé', 'Passo à frente (joelhos ~90°)'),
        A=pose(arms={'near': (2, 3), 'far': (-2, -1)}),
        B=pose(lean=8, legs={'near': (60, 0, 94), 'far': (-20, -72, 18)},
               arms={'near': (2, 3), 'far': (-2, -1)}),
        prop=P_dumbbells, arrow='hip'),
    'terra-romeno-halteres': dict(
        labels=('Em pé', 'Quadril para trás (costas retas)'),
        A=pose(arms={'near': (2, 3), 'far': (-2, -1)}),
        B=pose(lean=66, legs={'near': (-12, -16, 94), 'far': (-16, -20, 92)},
               arms={'near': (2, 4), 'far': (-2, 0)}),
        prop=P_dumbbells, arrow='wrist_near'),
    'cadeira-extensora': dict(
        labels=('Joelhos dobrados', 'Pernas estendidas'),
        A=seated(legs={'near': (84, -6, 94), 'far': (80, -10, 92)}, arms={'near': (-30, 20), 'far': (-34, 16)}),
        B=seated(legs={'near': (84, 78, 168), 'far': (80, 74, 164)}, arms={'near': (-30, 20), 'far': (-34, 16)}),
        prop=P_leg_ext, arrow='ankle_near'),
    'panturrilha-halteres': dict(
        labels=('Pés no chão', 'Nas pontas dos pés'),
        A=pose(),
        B=pose(legs={'near': (4, 0, 56), 'far': (-4, -7, 50)}),
        prop=P_dumbbells, arrow='head'),
    'elevacao-pelvica-halter': dict(
        labels=('Quadril embaixo', 'Quadril no alto (linha reta)'),
        A=dict(SUPINE, rot=72, lean=0, legs=LEGS_BENT_FLOOR, arms=ARMS_SIDE),
        B=dict(SUPINE, rot=90, lean=0, legs=LEGS_BENT_FLOOR, arms=ARMS_SIDE),
        prop=P_hipthrust, arrow='hip', anchor=('shoulder', GROUND - 52)),
    'ponte-gluteo-isometrica': dict(
        labels=('Deitado', 'Quadril no alto (segure)'),
        A=dict(SUPINE, rot=90, lean=0, legs=LEGS_BENT_FLOOR, arms=ARMS_SIDE),
        B=dict(SUPINE, rot=112, lean=0, legs=LEGS_BENT_FLOOR, arms=ARMS_SIDE),
        prop=P_mat, arrow='hip', anchor=('shoulder', GROUND - 10)),
    'coice-gluteo-caneleira': dict(
        labels=('Joelho dobrado', 'Perna para trás (glúteo)'),
        A=dict(PRONE, lean=6, legs={'near': (88, 2, 52), 'far': (92, 6, 56)},
               arms={'near': (90, 92), 'far': (86, 88)}),
        B=dict(PRONE, lean=6, legs={'near': (2, 0, 56), 'far': (92, 6, 56)},
               arms={'near': (90, 92), 'far': (86, 88)}),
        prop=P_caneleira, arrow='ankle_near'),
    'kettlebell-swing': dict(
        labels=('Balanço entre as pernas', 'Altura do peito'),
        A=pose(lean=62, legs={'near': (-10, -20, 94), 'far': (-14, -24, 92)},
               arms={'near': (-24, -22), 'far': (-28, -26)}),
        B=pose(lean=2, arms={'near': (86, 88), 'far': (82, 84)}),
        prop=P_kettlebell, arrow='wrist_near'),

    # ---- peito / ombros / braços ----
    'supino-halteres': dict(
        labels=('Halteres na altura do peito', 'Braços estendidos'),
        A=dict(SUPINE, lean=0, legs=LEGS_BENT_FLOOR, arms={'near': (8, 106), 'far': (4, 102)}),
        B=dict(SUPINE, lean=0, legs=LEGS_BENT_FLOOR, arms={'near': (88, 90), 'far': (84, 86)}),
        prop=P_bench_flat, arrow='wrist_near', anchor=('hip', GROUND - 58)),
    'supino-reto-barra': dict(
        labels=('Barra no peito', 'Braços estendidos'),
        A=dict(SUPINE, lean=0, legs=LEGS_BENT_FLOOR, arms={'near': (8, 106), 'far': (4, 102)}),
        B=dict(SUPINE, lean=0, legs=LEGS_BENT_FLOOR, arms={'near': (88, 90), 'far': (84, 86)}),
        prop=P_bench_barbell, arrow='wrist_near', anchor=('hip', GROUND - 58)),
    'voador-maquina': dict(
        labels=('Braços abertos', 'Braços à frente'),
        A=seated(arms={'near': (74, 124), 'far': (70, 120)}),
        B=seated(arms={'near': (86, 88), 'far': (82, 84)}),
        prop=P_chest_machine, arrow='wrist_near'),
    'flexao-bracos': dict(
        labels=('Peito perto do chão', 'Braços estendidos'),
        A=dict(PRONE, lean=0, legs=LEGS_STRAIGHT, arms={'near': (38, 126), 'far': (34, 122)}),
        B=dict(PRONE, lean=0, legs=LEGS_STRAIGHT, arms={'near': (90, 92), 'far': (86, 88)}),
        prop=P_mat, arrow='shoulder'),
    'desenvolvimento-ombro-halteres': dict(
        labels=('Halteres nos ombros', 'Acima da cabeça'),
        A=pose(arms={'near': (12, 140), 'far': (8, 136)}),
        B=pose(arms={'near': (172, 174), 'far': (168, 170)}),
        prop=P_dumbbells, arrow='wrist_near'),
    'elevacao-lateral': dict(
        labels=('Braços ao lado do corpo', 'Braços na altura dos ombros'),
        A=dict(lean=0, frontal=True, legs={'near': (8, 4, 100), 'far': (-8, -12, -104)},
               arms={'near': (8, 12), 'far': (-8, -12)}),
        B=dict(lean=0, frontal=True, legs={'near': (8, 4, 100), 'far': (-8, -12, -104)},
               arms={'near': (84, 88), 'far': (-84, -88)}),
        prop=P_dumbbells, arrow='wrist_near'),
    'rosca-direta-halteres': dict(
        labels=('Braços estendidos', 'Halteres na altura do peito'),
        A=pose(arms={'near': (2, 4), 'far': (-2, 0)}),
        B=pose(arms={'near': (8, 130), 'far': (4, 126)}),
        prop=P_dumbbells, arrow='wrist_near'),
    'triceps-frances-halter': dict(
        labels=('Halter atrás da cabeça', 'Braços estendidos'),
        A=pose(arms={'near': (174, 288), 'far': (170, 284)}),
        B=pose(arms={'near': (176, 178), 'far': (172, 174)}),
        prop=P_dumbbells_near, arrow='wrist_near'),
    'puxada-alta-maquina': dict(
        labels=('Barra no alto', 'Barra na altura do peito'),
        A=seated(arms={'near': (148, 152), 'far': (144, 148)}),
        B=seated(arms={'near': (20, 118), 'far': (16, 114)}),
        prop=P_pulldown, arrow='wrist_near'),
    'remada-curvada-halteres': dict(
        labels=('Braços estendidos', 'Halteres nas costelas'),
        A=pose(lean=64, legs={'near': (-8, -14, 94), 'far': (-12, -18, 92)},
               arms={'near': (2, 4), 'far': (-2, 0)}),
        B=pose(lean=64, legs={'near': (-8, -14, 94), 'far': (-12, -18, 92)},
               arms={'near': (-52, 28), 'far': (-56, 24)}),
        prop=P_dumbbells, arrow='wrist_near'),
    'barra-fixa': dict(
        labels=('Pendurado (braços estendidos)', 'Queixo na altura da barra'),
        A=pose(lean=0, legs={'near': (-14, -26, 94), 'far': (-18, -30, 92)},
               arms={'near': (176, 178), 'far': (172, 174)}),
        B=pose(lean=0, legs={'near': (-14, -26, 94), 'far': (-18, -30, 92)},
               arms={'near': (140, 198), 'far': (136, 194)}),
        prop=P_pullup, arrow='head', anchor=('wrist_near', 30)),
    'remada-trx': dict(
        labels=('Braços estendidos', 'Peito perto das alças'),
        A=dict(lean=0, rot=-32, legs={'near': (2, 0, 94), 'far': (-2, -4, 92)},
               arms={'near': (88, 90), 'far': (84, 86)}),
        B=dict(lean=0, rot=-32, legs={'near': (2, 0, 94), 'far': (-2, -4, 92)},
               arms={'near': (10, 108), 'far': (6, 104)}),
        prop=P_trx, arrow='shoulder'),

    # ---- abdômen / core ----
    'abdominal-crunch': dict(
        labels=('Deitado', 'Ombros sobem (só o tronco)'),
        A=dict(SUPINE, lean=0, legs=LEGS_BENT_FLOOR, arms=ARMS_HEAD),
        B=dict(SUPINE, lean=38, legs=LEGS_BENT_FLOOR, arms=ARMS_HEAD),
        prop=P_mat, arrow='head', anchor=('hip', GROUND - 12)),
    'prancha': dict(
        labels=('Apoio nos antebraços', 'Ombro, quadril e pé em linha'),
        A=dict(PRONE, lean=0, legs=LEGS_STRAIGHT, arms={'near': (90, 178), 'far': (86, 174)}),
        B=dict(PRONE, lean=0, legs=LEGS_STRAIGHT, arms={'near': (90, 178), 'far': (86, 174)}),
        prop=P_align, arrow=None),
    'prancha-lateral': dict(
        labels=('Apoio no antebraço', 'Quadril alinhado'),
        A=dict(rot=68, lean=0, legs={'near': (2, 0, 90), 'far': (-2, -3, 88)},
               arms={'near': (70, 158), 'far': (-110, -108)}),
        B=dict(rot=68, lean=0, legs={'near': (2, 0, 90), 'far': (-2, -3, 88)},
               arms={'near': (70, 158), 'far': (-110, -108)}),
        prop=P_align, arrow=None),
    'abdominal-elevacao-pernas': dict(
        labels=('Pernas esticadas no chão', 'Pernas sobem (90°)'),
        A=dict(SUPINE, lean=0, legs={'near': (2, 0, 92), 'far': (-2, -4, 88)}, arms=ARMS_SIDE),
        B=dict(SUPINE, lean=0, legs={'near': (88, 86, 134), 'far': (84, 82, 130)}, arms=ARMS_SIDE),
        prop=P_mat, arrow='ankle_near', anchor=('hip', GROUND - 12)),
    'abdominal-bicicleta': dict(
        labels=('Cotovelo esquerdo ↔ joelho direito', 'Troca: cada lado conta 1 rep'),
        A=dict(SUPINE, lean=30, legs={'near': (96, 26, 76), 'far': (-4, -6, 88)}, arms=ARMS_HEAD),
        B=dict(SUPINE, lean=30, legs={'near': (-4, -6, 88), 'far': (96, 26, 76)}, arms=ARMS_HEAD),
        prop=P_mat, arrow='knee_near', anchor=('hip', GROUND - 12)),
    'abdominal-mountain-climber': dict(
        labels=('Joelho direito à frente', 'Troca: cada lado conta 1 rep'),
        A=dict(PRONE, lean=4, legs={'near': (66, 0, 56), 'far': (2, 0, 90)},
               arms={'near': (90, 92), 'far': (86, 88)}),
        B=dict(PRONE, lean=4, legs={'near': (2, 0, 90), 'far': (66, 0, 56)},
               arms={'near': (90, 92), 'far': (86, 88)}),
        prop=P_mat, arrow='knee_near'),

    # ---- cardio ----
    'caminhada': dict(
        labels=('Passo com o calcanhar', 'Impulso com o pé de trás'),
        A=pose(lean=6, legs={'near': (22, 8, 108), 'far': (-16, -22, 88)},
               arms={'near': (-22, 42), 'far': (24, 88)}),
        B=pose(lean=6, legs={'near': (-6, -12, 66), 'far': (24, 12, 106)},
               arms={'near': (18, 84), 'far': (-20, 40)}),
        prop=P_none, arrow='hip'),
    'caminhada-inclinada': dict(
        labels=('Subida (inclinação)', 'Passo seguinte'),
        A=pose(lean=12, rot=-8, legs={'near': (26, 10, 108), 'far': (-14, -20, 84)},
               arms={'near': (-20, 44), 'far': (26, 90)}),
        B=pose(lean=12, rot=-8, legs={'near': (-4, -10, 62), 'far': (28, 14, 104)},
               arms={'near': (20, 86), 'far': (-18, 42)}),
        prop=P_ramp, arrow='hip'),
    'corrida': dict(
        labels=('Fase de apoio', 'Impulso (joelho à frente)'),
        A=pose(lean=10, legs={'near': (32, 4, 96), 'far': (-26, -76, 14)},
               arms={'near': (-32, 58), 'far': (38, 128)}),
        B=pose(lean=12, legs={'near': (-20, -84, 8), 'far': (46, 20, 104)},
               arms={'near': (34, 124), 'far': (-30, 56)}),
        prop=P_none, arrow='hip'),
    'bike-cardio': dict(
        labels=('Pedal embaixo', 'Pedal em cima'),
        A=dict(lean=22, legs={'near': (74, 6, 96), 'far': (98, 66, 150)},
               arms={'near': (72, 76), 'far': (68, 72)}),
        B=dict(lean=22, legs={'near': (98, 66, 150), 'far': (74, 6, 96)},
               arms={'near': (72, 76), 'far': (68, 72)}),
        prop=P_bike, arrow='knee_near', anchor=('hip', GROUND - 68)),
    'boxe-bob': dict(
        labels=('Guarda alta', 'Jab (soco reto)'),
        A=pose(lean=6, legs={'near': (18, 2, 96), 'far': (-20, -26, 70)},
               arms={'near': (26, 146), 'far': (20, 140)}),
        B=pose(lean=8, legs={'near': (18, 2, 96), 'far': (-20, -26, 70)},
               arms={'near': (86, 90), 'far': (22, 142)}),
        prop=P_bob, arrow='wrist_near'),
}

# aliases: mesmo desenho, outro id de exercício
ALIAS = {
    'caminhada-rapida': 'caminhada',
    'caminhada-intervalada': 'caminhada',
}


TOP = 9.0
BOTTOM = 190.0


def build_fig(spec, cx, name, anchor=None, scale=1.0):
    kw = {k: v for k, v in spec.items() if k in ('lean', 'legs', 'arms', 'face', 'rot', 'frontal')}
    f = Figure(name=name, scale=scale * spec.get('scale', 1.0), **kw)
    if anchor:
        f.place(cx, anchor=(anchor[0], anchor[1]))
    else:
        f.place(cx, ground=GROUND - 3)
    return f


def build_pair(ex_id, spec):
    # Monta as duas poses; se algo sair do quadro, reduz a escala (igual nas duas).
    anchor = spec.get('anchor')
    scale = 1.0
    a = b = None
    for _ in range(5):
        a = build_fig(spec['A'], CXA, ex_id + '/A', anchor, scale)
        b = build_fig(spec['B'], CXB, ex_id + '/B', anchor, scale)
        boxes = [a.bbox(), b.bbox()]
        top = min(x[1] for x in boxes)
        bot = max(x[3] for x in boxes)
        base = anchor[1] if anchor else GROUND - 3
        need = 1.0
        if top < TOP:
            need = min(need, (base - TOP) / max(1.0, base - top))
        if bot > BOTTOM:
            need = min(need, (BOTTOM - TOP) / max(1.0, bot - top))
        if need > 0.995:
            break
        scale *= need * 0.98
    return a, b


def gen_one(ex_id, spec):
    a, b = build_pair(ex_id, spec)
    behind, front = (spec.get('prop') or P_none)(a, b)
    parts = []
    parts += D.ground_line(W)
    parts += behind
    parts += D.body(a)
    parts += D.body(b)
    parts += front
    if spec.get('arrow'):
        j = spec['arrow']
        p1, p2 = a.p(j), b.p(j)
        p1 = (p1[0] + 16, min(max(p1[1], 24), 170))
        p2 = (p2[0] - 16, min(max(p2[1], 24), 170))
        bow = 30 if (p1[1] + p2[1]) / 2 > 96 else -26
        if min(p1[1], p2[1]) + bow < 14:
            bow = 26
        parts += D.arrow(p1, p2, bow=bow)
    la, lb = spec['labels']
    parts.append(D.text((CXA, LBL_Y), la, size=11))
    parts.append(D.text((CXB, LBL_Y), lb, size=11))
    return D.svg(W, H, parts, title=ex_id)


SHEET_CSS = ('body{background:#0f172a;color:#e2e8f0;font:14px -apple-system,Arial;margin:10px}'
             'figure{margin:0;background:#0b1220;border:1px solid #ffffff18;border-radius:10px;padding:2px}'
             'figcaption{color:#fb923c;font-weight:700;font-size:11px;padding:2px 6px}'
             'svg{width:100%;display:block}'
             '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}')


def write_sheet(path, svgs):
    # Folha de contato para revisar TODAS as ilustrações de uma vez no navegador.
    figs = ''.join('<figure><figcaption>%s</figcaption>%s</figure>' % (k, v) for k, v in svgs.items())
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
    check = '--check' in sys.argv
    errs = []
    made = 0
    svgs = {}
    for ex_id, spec in EX.items():
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
    if not check:
        sync_service_worker(list(svgs.keys()) + list(ALIAS.keys()))
    for a in sys.argv[1:]:
        if a.startswith('--sheet'):
            write_sheet(a.split('=', 1)[1] if '=' in a else '/tmp/achilles-ilustracoes.html', svgs)
    for e in errs:
        print('ERRO ANATÔMICO:', e)
    print(f'{made}/{len(EX)} poses válidas' + ('' if check else f' — SVGs escritos em {os.path.relpath(OUT)}'))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())

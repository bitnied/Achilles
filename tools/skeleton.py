"""skeleton.py — modelo de esqueleto (boneco de palito) com VALIDAÇÃO ANATÔMICA.

Por que existe: as ilustrações antigas eram coordenadas soltas, então dava para desenhar
um joelho dobrando para o lado errado (foi o bug relatado). Aqui a pose é descrita por
ÂNGULOS de segmento no referencial do corpo, e o script FALHA se a articulação dobrar
para um lado impossível.

Convenções (referencial do corpo, antes de espelhar/rotacionar):
  - eixo y aponta para BAIXO (como no SVG); o corpo está de pé, olhando para +x.
  - ângulo de um segmento: 0 = para baixo, 90 = para frente (+x), 180 = para cima,
    -90 = para trás. dir(a) = (sin a, cos a).
  - flexão do JOELHO   = ang_coxa - ang_canela   ∈ [0, 155]   (calcanhar vai ao glúteo)
  - flexão do COTOVELO = ang_antebraco - ang_braco ∈ [0, 155]  (mão vai ao ombro)
  - tornozelo: ang_pe - ang_canela ∈ [45, 135]    (0 = pé alinhado à canela)
  - tronco: `lean` = inclinação da coluna para frente (0 = ereto).
Depois de montar, aplica-se `face` (espelho anteroposterior) e `rot` (rotação no plano),
para poses deitadas/pronas — assim as regras acima continuam valendo sempre.
"""
import math

BONES = dict(torso=58.0, upper=30.0, fore=27.0, thigh=44.0, shin=42.0, foot=17.0,
             head_r=11.5, neck=7.0)

KNEE_MAX = 155.0
ELBOW_MAX = 158.0
TOL = 0.6  # tolerância em graus para hiperextensão (0 = perfeitamente reto)


class PoseError(Exception):
    pass


def dirv(a):
    r = math.radians(a)
    return (math.sin(r), math.cos(r))


def add(p, v, k=1.0):
    return (p[0] + v[0] * k, p[1] + v[1] * k)


class Figure:
    """Uma pose. Ângulos em graus, no referencial do corpo (ver docstring)."""

    def __init__(self, lean=0.0, legs=None, arms=None, face=1, rot=0.0, scale=1.0, name='?',
                 frontal=False):
        self.name = name
        self.frontal = frontal  # vista de frente: braços/pés abrem para os dois lados
        self.lean = lean
        self.face = face
        self.rot = rot
        self.scale = scale
        # (coxa, canela, pe) — pe é ângulo absoluto do pé
        d_leg = (4.0, 0.0, 94.0)
        d_arm = (4.0, 6.0)
        legs = legs or {}
        arms = arms or {}
        self.legs = {'near': legs.get('near', d_leg), 'far': legs.get('far', legs.get('near', d_leg))}
        self.arms = {'near': arms.get('near', d_arm), 'far': arms.get('far', arms.get('near', d_arm))}
        self.J = {}
        self._build()
        self._validate()
        self._transform()

    # ---- construção no referencial do corpo ----
    def _build(self):
        B = BONES
        hip = (0.0, 0.0)
        up = dirv(180 - self.lean)          # do quadril para o tronco (para cima, inclinado)
        neck = add(hip, up, B['torso'])
        shoulder = add(hip, up, B['torso'] * 0.90)
        head = add(neck, up, B['neck'] + B['head_r'] * 0.55)
        J = {'hip': hip, 'neck': neck, 'shoulder': shoulder, 'head': head}
        for side in ('far', 'near'):
            t, s, f = self.legs[side]
            knee = add(hip, dirv(t), B['thigh'])
            ankle = add(knee, dirv(s), B['shin'])
            toe = add(ankle, dirv(f), B['foot'])
            heel = add(ankle, dirv(f - 180), B['foot'] * 0.35)
            J[f'knee_{side}'] = knee
            J[f'ankle_{side}'] = ankle
            J[f'toe_{side}'] = toe
            J[f'heel_{side}'] = heel
            u, fo = self.arms[side]
            elbow = add(shoulder, dirv(u), B['upper'])
            wrist = add(elbow, dirv(fo), B['fore'])
            J[f'elbow_{side}'] = elbow
            J[f'wrist_{side}'] = wrist
        self.J = J

    # ---- validação anatômica ----
    def _validate(self):
        for side in ('near', 'far'):
            t, s, f = self.legs[side]
            knee = t - s
            if knee < -TOL:
                raise PoseError(f'{self.name}: joelho {side} dobra para o lado ERRADO '
                                f'(flexão {knee:.0f}°; coxa {t}°, canela {s}°)')
            if knee > KNEE_MAX:
                raise PoseError(f'{self.name}: joelho {side} dobra demais ({knee:.0f}° > {KNEE_MAX:.0f}°)')
            ank = abs(f - s) if self.frontal else (f - s)
            if not (45 - 8 <= ank <= 135 + 8):
                raise PoseError(f'{self.name}: tornozelo {side} em ângulo impossível ({ank:.0f}°)')
            u, fo = self.arms[side]
            el = abs(fo - u) if self.frontal else (fo - u)
            if el < -TOL:
                raise PoseError(f'{self.name}: cotovelo {side} dobra para o lado ERRADO '
                                f'(flexão {el:.0f}°; braço {u}°, antebraço {fo}°)')
            if el > ELBOW_MAX:
                raise PoseError(f'{self.name}: cotovelo {side} dobra demais ({el:.0f}°)')
        if abs(self.lean) > 100:
            raise PoseError(f'{self.name}: coluna inclinada demais ({self.lean}°)')

    # ---- espelho + rotação + escala ----
    def _transform(self):
        c = math.cos(math.radians(self.rot))
        s = math.sin(math.radians(self.rot))
        out = {}
        for k, (x, y) in self.J.items():
            x *= self.face * self.scale
            y *= self.scale
            out[k] = (x * c - y * s, x * s + y * c)
        self.J = out

    # ---- utilidades ----
    def translate(self, dx, dy):
        self.J = {k: (p[0] + dx, p[1] + dy) for k, p in self.J.items()}
        return self

    def bbox(self):
        xs = [p[0] for p in self.J.values()]
        ys = [p[1] for p in self.J.values()]
        r = BONES['head_r'] * self.scale
        return min(xs) - r, min(ys) - r, max(xs) + r, max(ys) + r

    def place(self, cx, ground=None, anchor=None):
        """Centraliza em cx e apoia a parte mais baixa no chão (ou usa um âncora)."""
        x0, y0, x1, y1 = self.bbox()
        self.translate(cx - (x0 + x1) / 2, 0)
        if anchor:
            jname, ty = anchor
            self.translate(0, ty - self.J[jname][1])
        elif ground is not None:
            low = max(p[1] for k, p in self.J.items()
                      if k.startswith(('toe', 'heel', 'ankle', 'knee', 'wrist', 'hip')))
            self.translate(0, ground - low)
        return self

    def p(self, name):
        return self.J[name]

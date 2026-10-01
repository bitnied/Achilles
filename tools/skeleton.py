"""skeleton.py — esqueleto 3D (boneco de palito) com VALIDAÇÃO ANATÔMICA.

Por que existe: as ilustrações antigas eram coordenadas soltas, então dava para desenhar
um joelho dobrando para o lado errado (foi o bug relatado). Aqui a pose é descrita por
ÂNGULOS de segmento e o script FALHA se a articulação dobrar para um lado impossível.

Por que 3D: num boneco 2D (só de lado) não existe "abrir o braço para o lado". Elevação
lateral, voador, desenvolvimento e puxada ficavam ambíguos. Agora cada membro tem também
um ângulo de abertura lateral e a mesma pose pode ser vista de LADO, de FRENTE ou de CIMA.

Convenções (referencial do corpo, antes de espelhar/rotacionar):
  - x = para frente, y = para BAIXO (como no SVG), z = lado "perto" da câmera lateral.
  - ângulo sagital `a` de um segmento: 0 = para baixo, 90 = para frente, 180 = para cima,
    -90 = para trás.  Abertura lateral `b`: 0 = no plano do corpo, 90 = apontando para o
    lado daquele membro (o braço "perto" abre para +z, o "longe" para -z).
    direção = (sin a·cos b, cos a·cos b, lado·sin b)
  - perna = (coxa, canela, pé[, abertura]);  braço = (braço, antebraço[, abert. braço[, abert. antebraço]])
  - flexão do JOELHO   = a_coxa - a_canela      ∈ [0, 155]   (calcanhar vai ao glúteo)
  - flexão do COTOVELO = a_antebraço - a_braço  ∈ [0, 158]   (mão vai ao ombro)
    com o braço aberto para o lado a rotação do ombro libera o plano: vale o ângulo 3D ≤ 158.
  - tornozelo: a_pé - a_canela ∈ [37, 143]  (90 = pé em ângulo reto com a canela)
  - tronco: `lean` = inclinação para frente, `bend` = inclinação lateral, `twist` = giro dos ombros.
Depois de montar: `face` (espelho frente/trás), `roll` (deita de lado) e `rot` (gira no plano
lateral, para poses deitadas/pronas). Com `world=True` os ângulos dos membros são dados já
no referencial da tela (0 = para baixo, 90 = direita), o que facilita apoiar pés/mãos no chão.
Com `arel=True` os braços acompanham o tronco (lean/bend/twist).
"""
import math

BONES = dict(torso=58.0, upper=30.0, fore=27.0, thigh=44.0, shin=42.0, foot=17.0,
             head_r=11.5, neck=7.0, shoulder_w=15.0, hip_w=8.0)

KNEE_MAX = 155.0
ELBOW_MAX = 158.0
TOL = 0.6  # tolerância em graus para hiperextensão (0 = perfeitamente reto)
SIDES = (('near', 1), ('far', -1))


class PoseError(Exception):
    pass


def vec(a, b=0.0, side=1):
    ra, rb = math.radians(a), math.radians(b)
    return (math.sin(ra) * math.cos(rb), math.cos(ra) * math.cos(rb), side * math.sin(rb))


def add(p, v, k=1.0):
    return (p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k)


def wrap(d):
    """Diferença de ângulos em (-180, 180] (270° e -90° são a mesma direção)."""
    return (d + 180.0) % 360.0 - 180.0


def angle3(u, v):
    d = sum(x * y for x, y in zip(u, v))
    nu = math.sqrt(sum(x * x for x in u)) or 1
    nv = math.sqrt(sum(x * x for x in v)) or 1
    return math.degrees(math.acos(max(-1.0, min(1.0, d / (nu * nv)))))


def rot_x(v, deg):     # bend/roll: gira o plano y-z
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c)


def rot_y(v, deg):     # twist: o ombro "perto" (+z) vai para frente (+x)
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def rot_z(v, deg):     # lean: dir(a) -> dir(a + deg) no plano x-y
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2])


def _leg(t):
    t = tuple(t)
    return t + (0.0,) * (4 - len(t))


def _arm(t):
    t = tuple(t)
    if len(t) == 2:
        return t + (0.0, 0.0)
    if len(t) == 3:
        return t + (t[2],)
    return t


D_LEG = (2.0, 0.0, 92.0)
D_ARM = (2.0, 4.0)
POSE_KEYS = ('lean', 'bend', 'twist', 'legs', 'arms', 'face', 'rot', 'roll', 'world', 'arel')


def normalize(spec):
    """Pose completa (todos os campos), para poder interpolar entre duas poses."""
    legs = spec.get('legs') or {}
    arms = spec.get('arms') or {}
    ln = legs.get('near', D_LEG)
    an = arms.get('near', D_ARM)
    return dict(
        lean=float(spec.get('lean', 0.0)), bend=float(spec.get('bend', 0.0)),
        twist=float(spec.get('twist', 0.0)),
        legs={'near': _leg(ln), 'far': _leg(legs.get('far', ln))},
        arms={'near': _arm(an), 'far': _arm(arms.get('far', an))},
        face=spec.get('face', 1), rot=float(spec.get('rot', 0.0)), roll=float(spec.get('roll', 0.0)),
        world=bool(spec.get('world', False)), arel=bool(spec.get('arel', False)))


def lerp_pose(pa, pb, t):
    """Interpola duas poses normalizadas (para desenhar a trajetória real do movimento)."""
    L = lambda x, y: x + (y - x) * t                                   # noqa: E731
    out = dict(pa)
    A = lambda x, y: x + wrap(y - x) * t                               # noqa: E731  (caminho mais curto)
    for k in ('lean', 'bend', 'twist'):
        out[k] = L(pa[k], pb[k])
    for k in ('rot', 'roll'):
        out[k] = A(pa[k], pb[k])
    n_ang = {'legs': 3, 'arms': 2}
    for limb in ('legs', 'arms'):
        out[limb] = {s: tuple((A if i < n_ang[limb] else L)(x, y)
                              for i, (x, y) in enumerate(zip(pa[limb][s], pb[limb][s])))
                     for s in ('near', 'far')}
    return out


class Figure:
    """Uma pose em 3D. Ângulos em graus (ver docstring do módulo)."""

    def __init__(self, name='?', **spec):
        self.name = name
        p = normalize(spec)
        self.__dict__.update(p)
        if self.world:
            if self.roll:
                raise PoseError(f'{name}: world=True não combina com roll')
            # ângulo de tela W = face·a - rot  ->  a = face·(W + rot)
            conv = lambda w: self.face * (w + self.rot)                # noqa: E731
            self.legs = {s: (conv(v[0]), conv(v[1]), conv(v[2]), v[3]) for s, v in self.legs.items()}
            if not self.arel:  # braços relativos ao tronco não usam o referencial da tela
                self.arms = {s: (conv(v[0]), conv(v[1]), v[2], v[3]) for s, v in self.arms.items()}
        self._validate()
        self._build()
        self._transform()

    # ---- referencial do tronco ----
    def _trunk(self, v):
        return rot_z(rot_x(rot_y(v, self.twist), self.bend), -self.lean)

    # ---- construção no referencial do corpo ----
    def _build(self):
        B = BONES
        hip = (0.0, 0.0, 0.0)
        up = self._trunk((0.0, -1.0, 0.0))
        neck = add(hip, up, B['torso'])
        sh_c = add(hip, up, B['torso'] * 0.90)
        head = add(neck, up, B['neck'] + B['head_r'] * 0.55)
        J = {'hip': hip, 'neck': neck, 'shoulder': sh_c, 'head': head}
        for side, sg in SIDES:
            hp = (0.0, 0.0, sg * B['hip_w'])
            t, s, f, b = self.legs[side]
            knee = add(hp, vec(t, b, sg), B['thigh'])
            ankle = add(knee, vec(s, b, sg), B['shin'])
            J[f'hip_{side}'] = hp
            J[f'knee_{side}'] = knee
            J[f'ankle_{side}'] = ankle
            J[f'toe_{side}'] = add(ankle, vec(f, 0, sg), B['foot'])
            J[f'heel_{side}'] = add(ankle, vec(f - 180, 0, sg), B['foot'] * 0.35)
            sh = add(sh_c, self._trunk((0.0, 0.0, sg * B['shoulder_w'])))
            u, fo, ub, fb = self.arms[side]
            vu, vf = vec(u, ub, sg), vec(fo, fb, sg)
            if self.arel:
                vu, vf = self._trunk(vu), self._trunk(vf)
            elbow = add(sh, vu, B['upper'])
            J[f'shoulder_{side}'] = sh
            J[f'elbow_{side}'] = elbow
            J[f'wrist_{side}'] = add(elbow, vf, B['fore'])
        self.J = J

    # ---- validação anatômica ----
    def _validate(self):
        n = self.name
        for side, sg in SIDES:
            t, s, f, b = self.legs[side]
            knee = wrap(t - s)
            if knee < -TOL:
                raise PoseError(f'{n}: joelho {side} dobra para o lado ERRADO '
                                f'(flexão {knee:.0f}°; coxa {t:.0f}°, canela {s:.0f}°)')
            if knee > KNEE_MAX:
                raise PoseError(f'{n}: joelho {side} dobra demais ({knee:.0f}° > {KNEE_MAX:.0f}°)')
            ank = wrap(f - s)
            if not (45 - 8 <= ank <= 135 + 8):
                raise PoseError(f'{n}: tornozelo {side} em ângulo impossível ({ank:.0f}°)')
            if not (-35 <= b <= 60):
                raise PoseError(f'{n}: perna {side} aberta demais ({b:.0f}°)')
            u, fo, ub, fb = self.arms[side]
            if abs(ub) < 0.01 and abs(fb) < 0.01:
                el = wrap(fo - u)
                if el < -TOL:
                    raise PoseError(f'{n}: cotovelo {side} dobra para o lado ERRADO '
                                    f'(flexão {el:.0f}°; braço {u:.0f}°, antebraço {fo:.0f}°)')
            else:
                el = angle3(vec(u, ub, sg), vec(fo, fb, sg))
            if el > ELBOW_MAX:
                raise PoseError(f'{n}: cotovelo {side} dobra demais ({el:.0f}°)')
        if abs(self.lean) > 100:
            raise PoseError(f'{n}: coluna inclinada demais ({self.lean}°)')
        if abs(self.bend) > 40 or abs(self.twist) > 50:
            raise PoseError(f'{n}: tronco torcido/inclinado de lado demais')

    # ---- espelho + deitar de lado + rotação no plano ----
    def wdir(self, v):
        """Converte um vetor do referencial do corpo para o mundo (para orientar equipamentos)."""
        x, y, z = v
        x *= self.face
        x, y, z = rot_x((x, y, z), -self.roll)
        c, s = math.cos(math.radians(self.rot)), math.sin(math.radians(self.rot))
        return (x * c - y * s, x * s + y * c, z)

    def trunk_dir(self, v):
        return self.wdir(self._trunk(v))

    def _transform(self):
        self.J = {k: self.wdir(p) for k, p in self.J.items()}

    def translate(self, dx, dy, dz=0.0):
        self.J = {k: (p[0] + dx, p[1] + dy, p[2] + dz) for k, p in self.J.items()}
        return self

    def w(self, name):
        return self.J[name]

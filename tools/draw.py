"""draw.py — desenho SVG do boneco + equipamentos (usado por gen_exercise_svgs.py)."""
import math
from skeleton import BONES

C = dict(
    ground='#334155', far='#64748b', near='#cbd5e1', head='#e2e8f0',
    equip='#e5e7eb', equip2='#94a3b8', arrow='#fb923c', label='#94a3b8',
    frame='#475569', accent='#f97316', ghost='#94a3b8', ok='#22c55e', bad='#ef4444',
    tag='#64748b', divider='#1e293b',
)


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def line(p1, p2, color, w, cap='round', op=1.0, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' opacity="{op}"' if op != 1.0 else ''
    return (f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" '
            f'stroke="{color}" stroke-width="{w:.1f}" stroke-linecap="{cap}"{o}{d}/>')


def circ(p, r, fill, stroke=None, w=2, op=1.0):
    s = f' stroke="{stroke}" stroke-width="{w:.1f}"' if stroke else ''
    o = f' opacity="{op}"' if op != 1.0 else ''
    return f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r:.1f}" fill="{fill}"{s}{o}/>'


def rect(x, y, w, h, fill, rx=2, op=1.0, stroke=None, sw=2):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    o = f' opacity="{op}"' if op != 1.0 else ''
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx:.1f}" fill="{fill}"{s}{o}/>'


def poly(pts, fill, stroke=None, w=0, op=1.0):
    d = ' '.join(f'{p[0]:.1f},{p[1]:.1f}' for p in pts)
    s = f' stroke="{stroke}" stroke-width="{w:.1f}" stroke-linejoin="round"' if stroke else ''
    o = f' opacity="{op}"' if op != 1.0 else ''
    return f'<polygon points="{d}" fill="{fill}"{s}{o}/>'


def text(p, s, size=12, anchor='middle', color=None, weight='400', extra=''):
    return (f'<text x="{p[0]:.1f}" y="{p[1]:.1f}" fill="{color or C["label"]}" '
            f'font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>')


def group(parts, op=1.0):
    if not parts:
        return []
    return [f'<g opacity="{op}">'] + parts + ['</g>']


def unit(p1, p2):
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    n = math.hypot(dx, dy) or 1
    return dx / n, dy / n


def mid(p1, p2, k=0.5):
    return (p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k)


def dist(p1, p2):
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


# ---------------- câmeras ----------------
# side  = de lado (x para a direita, y para baixo; profundidade = z)
# front = de frente (z para a direita; profundidade = x, quem está à frente fica por cima)
# top   = de cima (x para a direita, z para baixo; profundidade = altura)
VIEWS = {
    'side': lambda p: ((p[0], p[1]), p[2]),
    'front': lambda p: ((p[2], p[1]), p[0]),
    'top': lambda p: ((p[0], p[2]), -p[1]),
}
VIEW_TAG = {'side': 'VISTA LATERAL', 'front': 'VISTA DE FRENTE', 'top': 'VISTA DE CIMA'}


class Panel:
    """Liga um boneco já posicionado (mundo 3D) a um quadro da tela."""

    def __init__(self, fig, view, s, ox, oy, gy):
        self.f, self.view, self.s, self.ox, self.oy, self.gy = fig, view, s, ox, oy, gy

    def proj(self, p):
        (x, y), _ = VIEWS[self.view](p)
        return (self.ox + x * self.s, self.oy + y * self.s)

    def depth(self, p):
        return VIEWS[self.view](p)[1]

    def p(self, name):
        return self.proj(self.f.w(name))

    def dir2(self, v):
        """Projeção de um vetor (mundo) na tela, sem translação."""
        (x, y), _ = VIEWS[self.view](v)
        return (x, y)


# ---------------- corpo ----------------
SEG = [  # (de, até, largura)
    ('hip_{s}', 'knee_{s}', 11), ('knee_{s}', 'ankle_{s}', 9.5), ('heel_{s}', 'toe_{s}', 7),
    ('shoulder_{s}', 'elbow_{s}', 9.5), ('elbow_{s}', 'wrist_{s}', 8),
]


def body(P, ghost=False):
    """Boneco ordenado por profundidade (o que está atrás é desenhado antes e mais escuro)."""
    f, s, J = P.f, P.s, P.f.J
    items = []
    torso_q = [J['shoulder_far'], J['shoulder_near'], J['hip_near'], J['hip_far']]
    td = sum(P.depth(q) for q in torso_q) / 4
    for side in ('near', 'far'):
        k = 1.0 if side == 'near' else 0.92
        for a, b, w in SEG:
            pa, pb = J[a.format(s=side)], J[b.format(s=side)]
            d = (P.depth(pa) + P.depth(pb)) / 2
            if P.view == 'side':
                col = C['near'] if side == 'near' else C['far']
            else:
                col = C['near'] if d >= td - 7 else C['far']
            items.append((d, 'seg', (P.proj(pa), P.proj(pb), w * k * s, col)))
    pts = [P.proj(q) for q in torso_q]
    items.append((td, 'torso', pts))
    items.append((P.depth(J['head']) + 0.5, 'head', (P.proj(J['shoulder']), P.proj(J['head']))))
    items.sort(key=lambda it: it[0])
    out = []
    for _, kind, data in items:
        if kind == 'seg':
            a, b, w, col = data
            if dist(a, b) < 2.5:
                out.append(circ(a, w * 0.55, C['ghost'] if ghost else col))
            else:
                out.append(line(a, b, C['ghost'] if ghost else col, w))
        elif kind == 'torso':
            out.append(poly(data, C['ghost'] if ghost else C['near'], C['ghost'] if ghost else C['near'], 14 * s))
        else:
            sh, hd = data
            col = C['ghost'] if ghost else C['near']
            out.append(line(sh, hd, col, 8 * s))
            out.append(circ(hd, BONES['head_r'] * s, C['ghost'] if ghost else C['head']))
    return out


# ---------------- equipamentos ----------------
def dumbbell2d(p, along, k=1.0):
    """Halter visto de lado: barra perpendicular ao antebraço (lê melhor que o halter de ponta)."""
    u = (-along[1], along[0])
    a = (p[0] - u[0] * 9 * k, p[1] - u[1] * 9 * k)
    b = (p[0] + u[0] * 9 * k, p[1] + u[1] * 9 * k)
    o = [line(a, b, C['equip'], 4.5 * k)]
    for q in (a, b):
        o.append(rect(q[0] - 4 * k, q[1] - 6 * k, 8 * k, 12 * k, C['equip'], rx=2.5 * k))
    return o


def dumbbell_axis(P, p, axis_w, k=1.0):
    """Halter orientado pelo eixo 3D real da pegada (vistas de frente/de cima)."""
    ax = P.dir2(axis_w)
    n = math.hypot(*ax)
    if n < 0.35:  # de ponta: aparece o disco
        return [circ(p, 7.5 * k, C['equip']), circ(p, 2.6 * k, C['equip2'])]
    u = (ax[0] / n, ax[1] / n)
    L = 10 * k * n
    a = (p[0] - u[0] * L, p[1] - u[1] * L)
    b = (p[0] + u[0] * L, p[1] + u[1] * L)
    pu = (-u[1], u[0])
    o = [line(a, b, C['equip'], 4.5 * k)]
    for q in (a, b):
        o.append(line((q[0] - pu[0] * 6.5 * k, q[1] - pu[1] * 6.5 * k),
                      (q[0] + pu[0] * 6.5 * k, q[1] + pu[1] * 6.5 * k), C['equip'], 8 * k, cap='round'))
    return o


def plate(p, r, k=1.0):
    """Anilha vista de frente (barra apontando para a câmera)."""
    return [circ(p, r * k, C['equip2'], C['frame'], 2 * k), circ(p, r * 0.32 * k, C['equip'])]


def barbell_front(p1, p2, k=1.0, ext=30):
    u = unit(p1, p2)
    a = (p1[0] - u[0] * ext * k, p1[1] - u[1] * ext * k)
    b = (p2[0] + u[0] * ext * k, p2[1] + u[1] * ext * k)
    o = [line(a, b, C['equip'], 4 * k)]
    pu = (-u[1], u[0])
    for q, sg in ((a, 1), (b, -1)):
        for off in (2, 9):
            c = (q[0] + u[0] * off * sg * k, q[1] + u[1] * off * sg * k)
            o.append(line((c[0] - pu[0] * 13 * k, c[1] - pu[1] * 13 * k),
                          (c[0] + pu[0] * 13 * k, c[1] + pu[1] * 13 * k), C['equip2'], 5.5 * k))
    return o


def kettlebell(p, along, k=1.0):
    c = (p[0] + along[0] * 13 * k, p[1] + along[1] * 13 * k)
    return [line(p, c, C['equip'], 3.5 * k), circ(c, 10 * k, C['equip2'], C['equip'], 1.5 * k)]


def mat(x0, x1, y):
    return [rect(x0, y - 4, x1 - x0, 5, C['frame'], rx=2.5)]


def bench(x0, x1, top, ground, legs=True, h=8):
    o = [rect(x0, top, x1 - x0, h, C['frame'], rx=3.5)]
    if legs:
        for x in (x0 + 6, x1 - 12):
            o.append(rect(x, top + h, 6, ground - top - h, C['frame'], rx=2))
    return o


def post(x, y0, y1, w=7):
    return [rect(x - w / 2, min(y0, y1), w, abs(y1 - y0), C['frame'], rx=3)]


def cable(p1, p2, color=None, w=2):
    return [line(p1, p2, color or C['equip2'], w)]


# ---------------- setas / marcas ----------------
def path_arrow(pts, w=3, trim0=6, trim1=8, color=None, dash=None):
    """Seta que segue a trajetória (lista de pontos), com cabeça no fim."""
    pts = _trim(pts, trim0, trim1)
    if len(pts) < 2 or _plen(pts) < 6:
        return []
    d = f'M{pts[0][0]:.1f},{pts[0][1]:.1f} ' + ' '.join(f'L{p[0]:.1f},{p[1]:.1f}' for p in pts[1:])
    ds = f' stroke-dasharray="{dash}"' if dash else ''
    return [f'<path d="{d}" fill="none" stroke="{color or C["arrow"]}" stroke-width="{w}" '
            f'stroke-linecap="round" stroke-linejoin="round" marker-end="url(#ah)"{ds}/>']


def _plen(pts):
    return sum(dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def _trim(pts, a, b):
    def cut(ps, d):
        acc = 0.0
        for i in range(len(ps) - 1):
            seg = dist(ps[i], ps[i + 1])
            if acc + seg >= d:
                k = (d - acc) / (seg or 1)
                return [mid(ps[i], ps[i + 1], k)] + ps[i + 1:]
            acc += seg
        return ps[-1:]
    if _plen(pts) <= a + b + 4:
        return pts
    pts = cut(pts, a)
    return list(reversed(cut(list(reversed(pts)), b)))


def badge(p, kind, n=''):
    """Selo do quadro: número da etapa (1, 2), ✓ (certo) ou ✗ (evite)."""
    x, y = p
    if kind == 'ok':
        return [circ(p, 8, C['ok']),
                f'<path d="M{x-3.6:.1f},{y+0.2:.1f} L{x-1:.1f},{y+2.8:.1f} L{x+3.8:.1f},{y-2.6:.1f}" '
                f'fill="none" stroke="#0b1220" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>']
    if kind == 'bad':
        return [circ(p, 8, C['bad']),
                line((x - 3, y - 3), (x + 3, y + 3), '#0b1220', 2.2),
                line((x - 3, y + 3), (x + 3, y - 3), '#0b1220', 2.2)]
    return [circ(p, 8, C['accent']),
            text((x, y + 3.6), n, size=10.5, color='#0b1220', weight='700')]


DEFS = (f'<defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" '
        f'markerHeight="4.2" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" '
        f'fill="{C["arrow"]}"/></marker></defs>')


def svg(w, h, parts, title=''):
    t = f'<title>{esc(title)}</title>' if title else ''
    # width/height explícitos + prolog XML: sem isso o iOS/Safari pode não dimensionar
    # o SVG dentro de <img> (a ilustração some) e o acento pode quebrar sem charset.
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet" role="img" '
            f'aria-label="{esc(title)}">{t}{DEFS}' + ''.join(parts) + '</svg>')

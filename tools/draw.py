"""draw.py — desenho SVG do boneco + equipamentos (usado por gen_exercise_svgs.py)."""
import math
from skeleton import Figure, BONES

C = dict(
    ground='#334155', far='#64748b', near='#cbd5e1', head='#e2e8f0',
    equip='#e5e7eb', equip2='#94a3b8', arrow='#fb923c', label='#94a3b8',
    frame='#475569', accent='#f97316',
)
GROUND = 178.0


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def line(p1, p2, color, w, cap='round', op=1.0, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' opacity="{op}"' if op != 1.0 else ''
    return (f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" '
            f'stroke="{color}" stroke-width="{w}" stroke-linecap="{cap}"{o}{d}/>')


def circ(p, r, fill, stroke=None, w=2, op=1.0):
    s = f' stroke="{stroke}" stroke-width="{w}"' if stroke else ''
    o = f' opacity="{op}"' if op != 1.0 else ''
    return f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r:.1f}" fill="{fill}"{s}{o}/>'


def rect(x, y, w, h, fill, rx=2, op=1.0, stroke=None, sw=2):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    o = f' opacity="{op}"' if op != 1.0 else ''
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}"{s}{o}/>'


def text(p, s, size=12, anchor='middle', color=None, weight='400'):
    return (f'<text x="{p[0]:.1f}" y="{p[1]:.1f}" fill="{color or C["label"]}" '
            f'font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{esc(s)}</text>')


def unit(p1, p2):
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    n = math.hypot(dx, dy) or 1
    return dx / n, dy / n


def perp(p1, p2):
    u = unit(p1, p2)
    return -u[1], u[0]


def mid(p1, p2, k=0.5):
    return (p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k)


# ---------------- corpo ----------------
def body(fig, hl=(), sides=('far', 'near')):
    """Desenha o boneco. hl = segmentos em laranja (ex.: ('arm',) ou ('leg',))."""
    J = fig.J
    s = fig.scale
    out = []
    hl_arm = 'arm' in hl
    hl_leg = 'leg' in hl

    def limb(side, color, k):
        o = []
        lc = C['accent'] if (hl_leg and side == 'near') else color
        ac = C['accent'] if (hl_arm and side == 'near') else color
        o.append(line(J['hip'], J[f'knee_{side}'], lc, 11 * k * s))
        o.append(line(J[f'knee_{side}'], J[f'ankle_{side}'], lc, 9.5 * k * s))
        o.append(line(J[f'heel_{side}'], J[f'toe_{side}'], lc, 7 * k * s))
        o.append(line(J['shoulder'], J[f'elbow_{side}'], ac, 9.5 * k * s))
        o.append(line(J[f'elbow_{side}'], J[f'wrist_{side}'], ac, 8 * k * s))
        return o

    if 'far' in sides:
        out += limb('far', C['far'], 0.92)
    # tronco + cabeça
    out.append(line(J['hip'], J['neck'], C['near'], 15 * s))
    out.append(line(J['neck'], J['head'], C['near'], 8 * s))
    out.append(circ(J['head'], BONES['head_r'] * s, C['head']))
    if 'near' in sides:
        out += limb('near', C['near'], 1.0)
    return out


# ---------------- equipamentos ----------------
def dumbbell(p, along, k=1.0):
    """Halter no punho, barra perpendicular ao antebraço (along = vetor do antebraço)."""
    u = (-along[1], along[0])
    a = (p[0] - u[0] * 9 * k, p[1] - u[1] * 9 * k)
    b = (p[0] + u[0] * 9 * k, p[1] + u[1] * 9 * k)
    o = [line(a, b, C['equip'], 4.5 * k)]
    for q in (a, b):
        o.append(rect(q[0] - 4 * k, q[1] - 6 * k, 8 * k, 12 * k, C['equip'], rx=2.5))
    return o


def dumbbells(fig, sides=('far', 'near')):
    o = []
    for s in sides:
        w = fig.p(f'wrist_{s}')
        e = fig.p(f'elbow_{s}')
        o += dumbbell(w, unit(e, w), 1.0 if s == 'near' else 0.9)
    return o


def kettlebell(p, k=1.0):
    return [f'<path d="M{p[0]-7:.1f},{p[1]+2:.1f} q0,-11 7,-11 q7,0 7,11" fill="none" '
            f'stroke="{C["equip"]}" stroke-width="3.5"/>',
            circ((p[0], p[1] + 12), 10.5 * k, C['equip2'])]


def barbell(p1, p2, plates=True):
    """Barra pelos dois punhos, estendida além deles."""
    u = unit(p1, p2)
    a = (p1[0] - u[0] * 34, p1[1] - u[1] * 34)
    b = (p2[0] + u[0] * 34, p2[1] + u[1] * 34)
    o = [line(a, b, C['equip'], 4)]
    if plates:
        pu = (-u[1], u[0])
        for q, sgn in ((a, 1), (b, -1)):
            for off in (0, 8):
                cx = q[0] + u[0] * off * sgn
                cy = q[1] + u[1] * off * sgn
                o.append(f'<line x1="{cx - pu[0]*11:.1f}" y1="{cy - pu[1]*11:.1f}" '
                         f'x2="{cx + pu[0]*11:.1f}" y2="{cy + pu[1]*11:.1f}" stroke="{C["equip2"]}" '
                         f'stroke-width="5" stroke-linecap="round"/>')
    return o


def ground_line(w, y=GROUND, color=None):
    return [line((8, y), (w - 8, y), color or C['ground'], 2, cap='butt')]


def mat(x0, x1, y=GROUND):
    return [rect(x0, y - 5, x1 - x0, 6, C['frame'], rx=3)]


def bench(cx, top, w=96, legs=True, incline=0):
    o = [rect(cx - w / 2, top, w, 9, C['frame'], rx=4)]
    if legs:
        for x in (cx - w / 2 + 7, cx + w / 2 - 13):
            o.append(rect(x, top + 9, 6, GROUND - top - 9, C['frame'], rx=2))
    return o


def frame_post(x, y0=GROUND, y1=20, w=8):
    return [rect(x - w / 2, y1, w, y0 - y1, C['frame'], rx=3)]


def cable(p1, p2, color=None):
    return [line(p1, p2, color or C['equip2'], 2)]


def seat(cx, top, w=44):
    return [rect(cx - w / 2, top, w, 8, C['frame'], rx=3),
            rect(cx - 4, top + 8, 8, GROUND - top - 8, C['frame'], rx=2)]


def ramp(x0, x1, y0, y1):
    return [f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" stroke="{C["frame"]}" '
            f'stroke-width="4" stroke-linecap="round"/>']


def bob_dummy(x, ytop=58):
    """Boneco de golpes (Bob): torso + base."""
    o = [circ((x, ytop), 13, C['equip2'])]
    o.append(f'<path d="M{x-15:.1f},{ytop+10:.1f} q15,-4 30,0 l6,44 q-21,7 -42,0 z" '
             f'fill="{C["equip2"]}" opacity="0.9"/>')
    o.append(rect(x - 5, ytop + 54, 10, GROUND - ytop - 62, C['frame'], rx=3))
    o.append(f'<path d="M{x-24:.1f},{GROUND:.1f} q24,-16 48,0 z" fill="{C["frame"]}"/>')
    return o


def bike(cx, wheel_y=GROUND - 16):
    o = []
    o.append(circ((cx - 34, wheel_y), 16, 'none', C['frame'], 3))
    o.append(circ((cx + 34, wheel_y), 16, 'none', C['frame'], 3))
    o.append(line((cx - 34, wheel_y), (cx + 6, wheel_y - 44), C['frame'], 4))
    o.append(line((cx + 34, wheel_y), (cx + 6, wheel_y - 44), C['frame'], 4))
    o.append(line((cx + 6, wheel_y - 44), (cx + 6, wheel_y), C['frame'], 4))
    return o


def arrow(p1, p2, bow=26, w=3):
    """Seta curva de A para B."""
    mx, my = mid(p1, p2)
    u = unit(p1, p2)
    nx, ny = -u[1], u[0]
    cx, cy = mx + nx * bow, my + ny * bow
    return [f'<path d="M{p1[0]:.1f},{p1[1]:.1f} Q{cx:.1f},{cy:.1f} {p2[0]:.1f},{p2[1]:.1f}" '
            f'fill="none" stroke="{C["arrow"]}" stroke-width="{w}" marker-end="url(#ah)" opacity="0.95"/>']


DEFS = (f'<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" '
        f'markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" '
        f'fill="{C["arrow"]}"/></marker></defs>')


def svg(w, h, parts, title=''):
    t = f'<title>{esc(title)}</title>' if title else ''
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'aria-label="{esc(title)}">{t}{DEFS}' + ''.join(parts) + '</svg>')

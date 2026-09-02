// ui.js — helpers de DOM, feedback (som/vibração), modal e toast.

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };

export function toast(msg, ms = 2200) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = h('div', { id: 'toast-host' });
    document.body.appendChild(host);
  }
  const t = h('div', { class: 'toast', text: msg });
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export function modal(title, contentNode, actions = []) {
  const overlay = h('div', { class: 'modal-overlay' });
  const close = () => overlay.remove();
  const card = h('div', { class: 'modal-card' }, [
    h('div', { class: 'modal-head' }, [
      h('h3', { text: title }),
      h('button', { class: 'icon-btn', text: '✕', onClick: close, 'aria-label': 'Fechar' }),
    ]),
    h('div', { class: 'modal-body' }, [contentNode]),
    actions.length ? h('div', { class: 'modal-actions' }, actions) : null,
  ]);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  return close;
}

export function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const close = modal(title, h('p', { text: message, class: 'muted' }), [
      h('button', { class: 'btn ghost', text: 'Cancelar', onClick: () => { close(); resolve(false); } }),
      h('button', { class: 'btn danger', text: 'Confirmar', onClick: () => { close(); resolve(true); } }),
    ]);
  });
}

// Feedback sonoro (WebAudio) + vibração
let audioCtx = null;
const feedback = { som: true, vibrar: true };
export function setFeedback(s = {}) { feedback.som = s.som !== false; feedback.vibrar = s.vibrar !== false; }
export function beep(freq = 880, durMs = 180, type = 'sine') {
  if (!feedback.som) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durMs / 1000);
    o.start();
    o.stop(audioCtx.currentTime + durMs / 1000);
  } catch (_) { /* silencioso */ }
}

export function vibrate(pattern = 40) {
  if (!feedback.vibrar) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
}

export function ding() { beep(880, 140); setTimeout(() => beep(1175, 220), 150); vibrate([60, 40, 120]); }

// Formatação
export const fmtKg = (n) => (n === 0 || n == null ? '—' : `${(+n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`);
export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fmtDateBR = (iso) => {
  try { return new Date(iso + (iso.length <= 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); }
  catch (_) { return iso; }
};

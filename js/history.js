// history.js — histórico de treinos, recordes (PRs) e gráficos de evolução.
import { h, clear, modal, fmtKg, fmtTime, fmtDateBR, confirmDialog } from './ui.js';
import * as store from './store.js';
import { suggestNext } from './progression.js';

function collectExercises(ctx, hist) {
  const ids = new Set();
  for (const s of hist) for (const it of s.itens || []) if ((it.series || []).some((x) => x.feito)) ids.add(it.exerciseId);
  return [...ids].map((id) => ({ id, ex: ctx.exercise(id), serie: store.getExerciseSeries(ctx.userId, id) }))
    .filter((x) => x.serie.length)
    .sort((a, b) => (b.serie.at(-1)?.data || '').localeCompare(a.serie.at(-1)?.data || ''));
}

export function renderHistory(view, ctx, exId) {
  const hist = store.getHistory(ctx.userId);
  if (exId) return renderExerciseProgress(view, ctx, exId);

  if (!hist.length) {
    view.appendChild(h('div', { class: 'empty' }, [
      h('div', { class: 'big-emoji', text: '📈' }),
      h('p', { class: 'lead', text: 'Nenhum treino registrado ainda.' }),
      h('p', { class: 'muted', text: 'Faça um treino, ou registre um que você já fez.' }),
      h('button', { class: 'btn primary', text: '+ Registrar treino feito', onClick: () => ctx.navigate('#/register') }),
    ]));
    return;
  }

  view.appendChild(h('div', { class: 'row between center' }, [
    h('h2', { text: 'Histórico' }),
    h('button', { class: 'btn primary sm', text: '+ Registrar', onClick: () => ctx.navigate('#/register') }),
  ]));

  // Resumo
  const totalVol = hist.reduce((a, s) => a + (s.itens || []).reduce((b, it) => b + it.series.filter((x) => x.feito).reduce((c, x) => c + (+x.peso || 0) * (+x.reps || 0), 0), 0), 0);
  view.appendChild(h('div', { class: 'stats-row' }, [
    stat(hist.length, 'treinos'),
    stat(Math.round(totalVol).toLocaleString('pt-BR'), 'kg total'),
    stat(collectExercises(ctx, hist).length, 'exercícios'),
  ]));

  // Progresso por exercício
  const exs = collectExercises(ctx, hist);
  view.appendChild(h('h3', { class: 'section-title', text: 'Progresso por exercício' }));
  const grid = h('div', { class: 'ex-progress-grid' });
  for (const { id, ex, serie } of exs) {
    const timed = ex?.tipo === 'tempo';
    const ultimo = serie.at(-1);
    const best = timed ? Math.max(...serie.map((p) => p.maxTempo)) : Math.max(...serie.map((p) => p.maxPeso));
    grid.appendChild(h('button', { class: 'card ex-progress-item', onClick: () => ctx.navigate('#/history/' + id) }, [
      h('div', { class: 'row between center' }, [
        h('strong', { text: ex?.nome || id }),
        sparkline(serie.map((p) => (timed ? p.maxTempo : p.maxPeso))),
      ]),
      h('div', { class: 'muted tiny', text: timed ? `Recorde: ${best}s · último: ${ultimo.maxTempo}s` : `Recorde: ${fmtKg(best)} · último: ${fmtKg(ultimo.maxPeso)}` }),
    ]));
  }
  view.appendChild(grid);

  // Histórico de sessões
  view.appendChild(h('h3', { class: 'section-title', text: 'Treinos recentes' }));
  const listEl = h('div', { class: 'session-list' });
  [...hist].reverse().forEach((s) => {
    const sets = (s.itens || []).reduce((a, it) => a + it.series.filter((x) => x.feito).length, 0);
    listEl.appendChild(h('button', { class: 'card session-item', onClick: () => showSession(ctx, s) }, [
      h('div', {}, [h('strong', { text: s.planNome || 'Treino' }), h('div', { class: 'muted tiny', text: `${s.diaNome || ''} · ${sets} séries · ${(s.itens || []).length} exercícios` })]),
      h('div', { class: 'date-pill', text: fmtDateBR(s.data) }),
    ]));
  });
  view.appendChild(listEl);
}

function showSession(ctx, s) {
  const body = h('div', {}, (s.itens || []).map((it) => {
    const feitas = it.series.filter((x) => x.feito);
    if (!feitas.length) return null;
    return h('div', { class: 'sess-ex' }, [
      h('strong', { text: it.nome }),
      h('div', { class: 'muted tiny', text: feitas.map((x) => it.tipo === 'tempo'
        ? (x.tempoSeg >= 120 ? `${Math.round(x.tempoSeg / 60)} min` : `${x.tempoSeg}s`) + (x.distanciaKm ? ` / ${x.distanciaKm} km` : '')
        : `${x.reps}×${fmtKg(x.peso)}`).join('  ·  ') }),
    ]);
  }));
  const close = modal(fmtDateBR(s.data) + ' — ' + (s.planNome || 'Treino'), body, [
    h('button', { class: 'btn danger ghost', text: 'Excluir', onClick: async () => {
      if (await confirmDialog('Excluir treino', 'Remover este treino do histórico?')) {
        store.deleteSession(ctx.userId, s.id); close(); ctx.navigate('#/history'); ctx.refresh();
      }
    } }),
    h('button', { class: 'btn primary', text: 'Editar', onClick: () => { close(); ctx.navigate('#/register/' + s.id); } }),
  ]);
}

function renderExerciseProgress(view, ctx, exId) {
  const ex = ctx.exercise(exId);
  const serie = store.getExerciseSeries(ctx.userId, exId);
  const timed = ex?.tipo === 'tempo';
  view.appendChild(h('button', { class: 'btn ghost sm back', text: '← Voltar', onClick: () => ctx.navigate('#/history') }));
  view.appendChild(h('h2', { text: ex?.nome || exId }));

  if (!serie.length) { view.appendChild(h('p', { class: 'muted', text: 'Sem registros ainda.' })); return; }

  const best = timed ? Math.max(...serie.map((p) => p.maxTempo)) : Math.max(...serie.map((p) => p.maxPeso));
  const bestVol = Math.max(...serie.map((p) => p.volume));
  view.appendChild(h('div', { class: 'stats-row' }, [
    stat(timed ? best + 's' : fmtKg(best), 'recorde'),
    stat(serie.length, 'sessões'),
    !timed ? stat(Math.round(bestVol).toLocaleString('pt-BR'), 'vol. máx.') : stat(serie.at(-1).maxTempo + 's', 'último'),
  ]));

  const entries = store.getRecentEntriesForExercise(ctx.userId, exId, 2);
  const sug = suggestNext(ex, entries, { objetivo: ctx.perfil() && ctx.perfil().objetivo, perfil: ctx.perfil() });
  view.appendChild(h('div', { class: 'card sugestao-card' }, [h('div', { class: 'sugestao', html: `💡 ${sug.texto}` })]));

  view.appendChild(h('h3', { class: 'section-title', text: timed ? 'Tempo (s) por sessão' : 'Carga máxima (kg) por sessão' }));
  view.appendChild(lineChart(serie.map((p) => ({ x: p.data, y: timed ? p.maxTempo : p.maxPeso }))));

  if (!timed) {
    view.appendChild(h('h3', { class: 'section-title', text: 'Volume (kg) por sessão' }));
    view.appendChild(lineChart(serie.map((p) => ({ x: p.data, y: p.volume }))));
  }

  view.appendChild(h('h3', { class: 'section-title', text: 'Registros' }));
  const rows = h('div', { class: 'session-list' });
  [...serie].reverse().forEach((p) => {
    rows.appendChild(h('div', { class: 'card row between center' }, [
      h('span', { text: fmtDateBR(p.data) }),
      h('strong', { text: timed ? `${p.maxTempo}s` : `${fmtKg(p.maxPeso)} · vol ${Math.round(p.volume)}` }),
    ]));
  });
  view.appendChild(rows);
}

// ---- Gráficos SVG simples ----
function lineChart(points) {
  const W = 320, H = 140, P = 24;
  if (points.length === 1) points = [{ x: points[0].x, y: points[0].y }, points[0]];
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const stepX = (W - 2 * P) / (points.length - 1);
  const px = (i) => P + i * stepX;
  const py = (v) => H - P - ((v - min) / span) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const area = `${d} L${px(points.length - 1).toFixed(1)},${H - P} L${px(0).toFixed(1)},${H - P} Z`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="none">
    <path d="${area}" fill="var(--accent-soft)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="3" fill="var(--accent)"/>`).join('')}
    <text x="${P}" y="14" class="chart-lbl">${max}</text>
    <text x="${P}" y="${H - 6}" class="chart-lbl">${min}</text>
  </svg>`;
  return h('div', { class: 'chart-wrap', html: svg });
}

function sparkline(vals) {
  if (!vals.length) return h('span');
  const W = 72, H = 24;
  if (vals.length === 1) vals = [vals[0], vals[0]];
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const stepX = W / (vals.length - 1);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${(i * stepX).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`).join(' ');
  return h('span', { class: 'spark', html: `<svg viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` });
}

function stat(v, l) { return h('div', { class: 'stat' }, [h('div', { class: 'stat-v', text: v }), h('div', { class: 'stat-l', text: l })]); }

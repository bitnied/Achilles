// workout.js — MODO TREINO: registrar séries, check, timer de descanso e timer por tempo.
import { h, clear, modal, toast, ding, beep, vibrate, fmtTime, fmtKg, todayISO, confirmDialog } from './ui.js';
import * as store from './store.js';
import { suggestNext } from './progression.js';
import { mensagemFinal, volumeSemanal } from './motivation.js';

let restTimer = null;   // { id, restante, total }
let timedTimer = null;  // countdown de exercício por tempo
let tickCleanup = null; // atualiza duração no header

function stopAllTimers() {
  if (restTimer) { clearInterval(restTimer.id); restTimer = null; }
  if (timedTimer) { clearInterval(timedTimer.id); timedTimer = null; }
  if (tickCleanup) { clearInterval(tickCleanup); tickCleanup = null; }
}

export function cleanupWorkout() { stopAllTimers(); }

function isTimed(ex, pe) { return !!(pe.porTempo || ex?.tipo === 'tempo'); }

// Equipamentos disponíveis (para filtrar substituições e sugestões).
export function availableEquip(ctx) {
  const s = new Set();
  for (const eq of (ctx.data.equipment && ctx.data.equipment.equipamentos) || []) if (eq.disponivel) s.add(eq.id);
  s.add('peso_corporal');
  return s;
}
export function usableExercise(ex, avail) {
  const eq = ex.equipamento || [];
  return eq.length === 0 || eq.some((x) => avail.has(x));
}

// Monta um "item" de treino (com séries pré-preenchidas e sugestão de progressão) a partir de um
// exercício do plano (pe). Reutilizado pelo montador do treino, pela sugestão do dia e pela troca.
export function buildItem(ctx, pe) {
  const ex = ctx.exercise(pe.exerciseId) || { id: pe.exerciseId, nome: pe.exerciseId, tipo: 'reps', grupos: [] };
  const timed = isTimed(ex, pe);
  const last = store.getLastEntryForExercise(ctx.userId, pe.exerciseId);
  const sug = suggestNext(ex, last);
  const nSeries = pe.series || 3;
  // A carga inicial nunca fica abaixo da última que você usou (progressão + memória de carga).
  const lastW = store.getLastWeight(ctx.userId, pe.exerciseId) || 0;
  const pesoInicial = Math.max(lastW, sug.pesoSugerido != null ? sug.pesoSugerido : (pe.pesoAlvo || 0));
  const series = [];
  for (let i = 0; i < nSeries; i++) {
    series.push({
      peso: timed ? 0 : pesoInicial,
      reps: timed ? 0 : (pe.repsAlvo || 0),
      repsAlvo: pe.repsAlvo || 0,
      tempoSeg: timed ? (sug.tempoSugerido || pe.tempoSeg || ex.tempoPadraoSeg || 30) : 0,
      feito: false, esforco: null,
    });
  }
  return {
    exerciseId: pe.exerciseId, nome: ex.nome, tipo: ex.tipo || 'reps', timed,
    cardio: timed && (ex.grupos || []).includes('cardio') && !/aquec/i.test(pe.obs || ''),
    descansoSeg: pe.descansoSeg || ex.descansoPadraoSeg || 60,
    sugestao: sug.texto, series,
  };
}

function buildSession(ctx, plan, dayIdx) {
  const day = plan.dias[dayIdx];
  const itens = (day.exercicios || []).map((pe) => buildItem(ctx, pe));
  const session = { planId: plan.id, planNome: plan.nome, dayIdx, diaNome: day.nome, iniciadoEm: Date.now(),
    tempoDisponivelMin: (ctx.perfil() && ctx.perfil().duracaoAlvoMin) || 30, itens };
  applyTimeBudget(session);
  return session;
}

// Estima o tempo da musculação (séries × execução + descanso), ignorando o bloco de cardio.
export function estimateStrengthSec(session) {
  let s = 0;
  for (const it of session.itens) {
    if (it.cardio) continue;
    for (const set of it.series) s += (it.timed ? (set.tempoSeg || 30) : 40) + (it.descansoSeg || 0);
  }
  return s;
}

// Ajusta a duração do(s) exercício(s) de cardio para caber no tempo disponível escolhido.
export function applyTimeBudget(session) {
  const cardioItems = session.itens.filter((it) => it.cardio);
  if (!cardioItems.length) { session._estTotalSec = estimateStrengthSec(session); return; }
  const budget = (session.tempoDisponivelMin || 30) * 60;
  const remaining = budget - estimateStrengthSec(session);
  const round60 = (v) => Math.max(60, Math.round(v / 60) * 60);
  const per = remaining > 0 ? Math.min(round60(remaining / cardioItems.length), 1800) : 300;
  for (const it of cardioItems) for (const set of it.series) set.tempoSeg = per;
  session._estTotalSec = estimateStrengthSec(session) + cardioItems.reduce((a, it) => a + it.series.reduce((b, s) => b + (s.tempoSeg || 0), 0), 0);
}

export function renderWorkout(view, ctx, planId, dayIdx) {
  stopAllTimers();
  dayIdx = +dayIdx || 0;

  // Retomar sessão em andamento (inclui treinos "sugeridos" que não vêm de um plano fixo).
  let session = store.getCurrent(ctx.userId);
  const resuming = session && session.planId === planId && session.dayIdx === dayIdx;
  if (!resuming) {
    const plan = ctx.allPlans().find((p) => p.id === planId);
    if (!plan || !plan.dias[dayIdx]) { view.appendChild(h('p', { class: 'muted', text: 'Treino não encontrado.' })); return; }
    session = buildSession(ctx, plan, dayIdx);
  }
  const persist = () => store.setCurrent(ctx.userId, session);
  const rerender = () => ctx.navigate(`#/workout/${planId}/${dayIdx}`);
  persist();

  const totalSets = () => session.itens.reduce((a, it) => a + it.series.length, 0);
  const doneSets = () => session.itens.reduce((a, it) => a + it.series.filter((s) => s.feito).length, 0);

  const progressBar = h('div', { class: 'progress' }, [h('div', { class: 'progress-fill' })]);
  const progressLabel = h('span', { class: 'progress-label' });
  const durLabel = h('span', { class: 'dur muted' });
  const updateProgress = () => {
    const d = doneSets(), t = totalSets();
    progressBar.firstChild.style.width = `${t ? (d / t) * 100 : 0}%`;
    progressLabel.textContent = `${d}/${t} séries`;
  };
  tickCleanup = setInterval(() => {
    durLabel.textContent = '⏱ ' + fmtTime((Date.now() - session.iniciadoEm) / 1000);
  }, 1000);

  const cbs = { persist, updateProgress, rerender };
  const list = h('div', { class: 'workout-list' });
  session.itens.forEach((item, idx) => list.appendChild(renderExerciseCard(ctx, session, item, idx, cbs)));

  // Adicionar exercício ao treino em andamento
  const addExBtn = h('button', { class: 'btn ghost block', text: '+ Adicionar exercício', onClick: () => addExerciseToSession(ctx, session, cbs) });

  const finishBtn = h('button', { class: 'btn primary big grow', text: 'Finalizar treino', onClick: () => finishWorkout(ctx, session) });
  const cancelBtn = h('button', { class: 'btn ghost danger', text: 'Cancelar', onClick: () => cancelWorkout(ctx) });

  // Seletor "tempo de hoje" — divide o tempo entre musculação e o cardio do fim.
  let timeRow = null;
  if (session.itens.some((it) => it.cardio)) {
    const opts = (ctx.perfil() && ctx.perfil().duracaoOpcoesMin) || [20, 30, 45, 60];
    if (!session.tempoDisponivelMin) session.tempoDisponivelMin = 30;
    const estLabel = h('span', { class: 'tiny' });
    const est = Math.round((session._estTotalSec || 0) / 60);
    const meta = session.tempoDisponivelMin;
    estLabel.textContent = `≈ ${est} min` + (est > meta + 2 ? ` (acima de ${meta})` : '');
    estLabel.className = 'tiny ' + (est > meta + 2 ? 'warn' : 'muted');
    const chips = h('div', { class: 'time-chips' });
    opts.forEach((m) => chips.appendChild(h('button', { class: 'chip' + (session.tempoDisponivelMin === m ? ' sel' : ''), text: m + 'min',
      onClick: () => { session.tempoDisponivelMin = m; applyTimeBudget(session); persist(); rerender(); } })));
    timeRow = h('div', { class: 'time-row row between center' }, [
      h('div', { class: 'row center gap' }, [h('span', { class: 'muted tiny', text: 'Tempo de hoje:' }), chips]),
      estLabel,
    ]);
  }

  view.appendChild(h('div', { class: 'workout-head' }, [
    h('div', { class: 'row between center' }, [
      h('div', {}, [h('h2', { text: session.planNome }), h('div', { class: 'muted', text: session.diaNome })]),
      durLabel,
    ]),
    h('div', { class: 'row center gap', }, [progressBar, progressLabel]),
    timeRow,
  ]));
  view.appendChild(list);
  view.appendChild(addExBtn);
  view.appendChild(h('div', { class: 'workout-footer' }, [h('div', { class: 'row gap' }, [cancelBtn, finishBtn])]));
  updateProgress();
}

function stepper(getVal, setVal, { step = 1, min = 0, suffix = '', decimals = 0 } = {}) {
  const input = h('input', { class: 'stepper-input', type: 'number', inputmode: 'decimal', value: getVal(), step, min });
  const apply = (v) => { v = Math.max(min, +(+v).toFixed(decimals)); setVal(v); input.value = v; };
  input.addEventListener('change', () => apply(input.value || 0));
  const wrap = h('div', { class: 'stepper' }, [
    h('button', { class: 'step-btn', text: '−', onClick: () => apply((+input.value || 0) - step) }),
    input,
    suffix ? h('span', { class: 'step-suffix', text: suffix }) : null,
    h('button', { class: 'step-btn', text: '+', onClick: () => apply((+input.value || 0) + step) }),
  ]);
  return wrap;
}

function renderExerciseCard(ctx, session, item, idx, cbs) {
  const ex = ctx.exercise(item.exerciseId);
  const setsBox = h('div', { class: 'sets' });

  const rebuildSet = (set, si) => {
    const row = h('div', { class: 'set-row' + (set.feito ? ' done' : '') });
    row.appendChild(h('div', { class: 'set-n', text: si + 1 }));

    if (item.timed) {
      const tLabel = h('span', { class: 'set-time', text: fmtTime(set.tempoSeg) });
      row.appendChild(h('div', { class: 'set-fields' }, [
        stepper(() => set.tempoSeg, (v) => { set.tempoSeg = v; tLabel.textContent = fmtTime(v); cbs.persist(); }, { step: 5, min: 5, suffix: 's' }),
        h('button', { class: 'btn ghost sm', text: '▶ Iniciar', onClick: () => startTimed(set.tempoSeg, () => markDone(set, si)) }),
      ]));
    } else {
      row.appendChild(h('div', { class: 'set-fields' }, [
        h('label', { class: 'field' }, [h('span', { class: 'flabel', text: 'kg' }),
          stepper(() => set.peso, (v) => { set.peso = v; store.setLastWeight(ctx.userId, item.exerciseId, v); cbs.persist(); }, { step: ex?.incrementoKg || 1, min: 0, decimals: 1 })]),
        h('label', { class: 'field' }, [h('span', { class: 'flabel', text: 'reps' }),
          stepper(() => set.reps, (v) => { set.reps = v; cbs.persist(); }, { step: 1, min: 0 })]),
      ]));
    }

    const check = h('button', { class: 'check-btn' + (set.feito ? ' on' : ''), text: set.feito ? '✓' : '', 'aria-label': 'Concluir série' });
    const markDone = (s = set, i = si) => {
      s.feito = !s.feito;
      check.classList.toggle('on', s.feito);
      check.textContent = s.feito ? '✓' : '';
      row.classList.toggle('done', s.feito);
      cbs.persist(); cbs.updateProgress();
      if (s.feito) {
        beep(880, 120); vibrate(40);
        askEsforco(s, esfChip);
        if (item.descansoSeg > 0) startRest(item.descansoSeg, item.nome);
      }
    };
    check.addEventListener('click', () => markDone());
    row.appendChild(check);

    const esfChip = h('div', { class: 'esforco' + (set.feito ? '' : ' hidden') });
    renderEsforco(set, esfChip, cbs.persist);

    return h('div', { class: 'set-wrap' }, [row, esfChip]);

    function startTimed(sec, onDone) { runTimedOverlay(sec, item.nome, onDone); }
  };

  item.series.forEach((set, si) => setsBox.appendChild(rebuildSet(set, si)));

  const addSet = h('button', { class: 'btn ghost sm', text: '+ série', onClick: () => {
    const base = item.series[item.series.length - 1] || { peso: 0, reps: 0, repsAlvo: 0, tempoSeg: 30 };
    const ns = { peso: base.peso, reps: base.reps, repsAlvo: base.repsAlvo, tempoSeg: base.tempoSeg, feito: false, esforco: null };
    item.series.push(ns);
    setsBox.appendChild(rebuildSet(ns, item.series.length - 1));
    cbs.persist(); cbs.updateProgress();
  }});
  const delSet = h('button', { class: 'btn ghost sm', text: '− série', onClick: () => {
    if (item.series.length <= 1) return;
    item.series.pop(); cbs.persist(); cbs.rerender();
  }});

  return h('div', { class: 'card exercise-card' }, [
    h('div', { class: 'row between center' }, [
      h('h3', { class: 'ex-title', text: `${idx + 1}. ${item.nome}` }),
      h('div', { class: 'row gap' }, [
        h('button', { class: 'icon-btn', text: '⇄', 'aria-label': 'Substituir exercício', onClick: () => substituteExercise(ctx, session, idx, cbs) }),
        h('button', { class: 'icon-btn info', text: 'ⓘ', 'aria-label': 'Instruções', onClick: () => showInstructions(ex) }),
        h('button', { class: 'icon-btn', text: '🗑', 'aria-label': 'Remover exercício', onClick: () => { session.itens.splice(idx, 1); applyTimeBudget(session); cbs.persist(); cbs.rerender(); } }),
      ]),
    ]),
    item.sugestao ? h('div', { class: 'sugestao', html: `💡 ${item.sugestao}` }) : null,
    setsBox,
    h('div', { class: 'row gap' }, [addSet, delSet]),
  ]);
}

function renderEsforco(set, host, persist) {
  clear(host);
  const opts = ['Fácil', 'Médio', 'Difícil', 'Falhou'];
  host.appendChild(h('span', { class: 'muted tiny', text: 'Como foi?' }));
  for (const o of opts) {
    host.appendChild(h('button', { class: 'chip' + (set.esforco === o ? ' sel' : ''), text: o,
      onClick: () => { set.esforco = set.esforco === o ? null : o; renderEsforco(set, host, persist); persist && persist(); } }));
  }
}
function askEsforco(set, host) { host.classList.remove('hidden'); }

// ---- Substituir / adicionar exercício ----
function equivalentes(ctx, item) {
  const cur = ctx.exercise(item.exerciseId);
  const grupos = new Set((cur && cur.grupos) || []);
  const avail = availableEquip(ctx);
  return [...ctx.data.exercises.values()].filter((e) => e.id !== item.exerciseId
    && (e.grupos || []).some((g) => grupos.has(g))
    && usableExercise(e, avail)
    && (item.cardio ? (e.grupos || []).includes('cardio') : e.tipo !== 'tempo' || (cur && cur.tipo === 'tempo')));
}

function substituteExercise(ctx, session, idx, cbs) {
  const item = session.itens[idx];
  const opts = equivalentes(ctx, item);
  if (!opts.length) { toast('Sem exercícios equivalentes disponíveis.'); return; }
  const doSwap = (e) => {
    const timed = e.tipo === 'tempo';
    session.itens[idx] = buildItem(ctx, { exerciseId: e.id, series: item.series.length,
      repsAlvo: (item.series[0] && item.series[0].repsAlvo) || 12, pesoAlvo: 0,
      descansoSeg: e.descansoPadraoSeg, porTempo: timed, tempoSeg: e.tempoPadraoSeg });
    applyTimeBudget(session); cbs.persist(); cbs.rerender();
  };
  const cur = ctx.exercise(item.exerciseId);
  const body = h('div', { class: 'picker' }, [
    h('p', { class: 'muted tiny', text: `Trocar por um equivalente (${((cur && cur.grupos) || []).join(', ')}):` }),
    h('div', { class: 'picker-list' }, opts.map((e) => h('button', { class: 'picker-item', onClick: () => { close(); doSwap(e); } }, [
      h('span', { text: e.nome }), h('span', { class: 'muted tiny', text: (e.equipamento || []).join(', ') }),
    ]))),
  ]);
  const close = modal('Substituir exercício', body);
}

function addExerciseToSession(ctx, session, cbs) {
  const avail = availableEquip(ctx);
  const all = [...ctx.data.exercises.values()].filter((e) => usableExercise(e, avail));
  const search = h('input', { class: 'text-input', placeholder: 'Buscar exercício...' });
  const listEl = h('div', { class: 'picker-list' });
  const draw = (term = '') => {
    clear(listEl);
    all.filter((e) => e.nome.toLowerCase().includes(term.toLowerCase())).forEach((e) => listEl.appendChild(
      h('button', { class: 'picker-item', onClick: () => {
        close();
        const timed = e.tipo === 'tempo';
        session.itens.push(buildItem(ctx, { exerciseId: e.id, series: 3, repsAlvo: timed ? 1 : 12, pesoAlvo: 0, descansoSeg: e.descansoPadraoSeg, porTempo: timed, tempoSeg: e.tempoPadraoSeg }));
        applyTimeBudget(session); cbs.persist(); cbs.rerender();
      } }, [h('span', { text: e.nome }), h('span', { class: 'muted tiny', text: (e.grupos || []).join(', ') })])));
  };
  search.addEventListener('input', () => draw(search.value));
  draw();
  const close = modal('Adicionar exercício', h('div', { class: 'picker' }, [search, listEl]));
}

// ---- Timer de descanso (barra flutuante) ----
function startRest(sec, label) {
  if (restTimer) clearInterval(restTimer.id);
  let el = document.getElementById('rest-timer');
  if (!el) { el = h('div', { id: 'rest-timer' }); document.body.appendChild(el); }
  restTimer = { restante: sec, total: sec, id: null };

  const draw = () => {
    clear(el);
    const pct = (restTimer.restante / restTimer.total) * 100;
    el.appendChild(h('div', { class: 'rest-inner' }, [
      h('div', { class: 'rest-bar' }, [h('div', { class: 'rest-fill', style: `width:${pct}%` })]),
      h('div', { class: 'row between center' }, [
        h('div', {}, [h('strong', { text: `Descanso ${fmtTime(restTimer.restante)}` }), h('div', { class: 'muted tiny', text: label })]),
        h('div', { class: 'row gap' }, [
          h('button', { class: 'btn ghost sm', text: '+15s', onClick: () => { restTimer.restante += 15; restTimer.total = Math.max(restTimer.total, restTimer.restante); draw(); } }),
          h('button', { class: 'btn sm', text: 'Pular', onClick: endRest }),
        ]),
      ]),
    ]));
  };
  const endRest = () => { clearInterval(restTimer.id); restTimer = null; el.remove(); };
  draw();
  restTimer.id = setInterval(() => {
    restTimer.restante--;
    if (restTimer.restante <= 0) { ding(); endRest(); return; }
    if (restTimer.restante <= 3) beep(660, 90);
    draw();
  }, 1000);
}

// ---- Timer de exercício por tempo (tela cheia) ----
function runTimedOverlay(sec, label, onDone) {
  if (timedTimer) clearInterval(timedTimer.id);
  const restante = { v: sec };
  const big = h('div', { class: 'timed-num', text: fmtTime(restante.v) });
  const overlay = h('div', { class: 'timed-overlay' }, [
    h('div', { class: 'timed-card' }, [
      h('div', { class: 'muted', text: label }),
      big,
      h('div', { class: 'row gap center' }, [
        h('button', { class: 'btn ghost', text: '+10s', onClick: () => { restante.v += 10; big.textContent = fmtTime(restante.v); } }),
        h('button', { class: 'btn danger', text: 'Parar', onClick: () => finish(false) }),
      ]),
    ]),
  ]);
  document.body.appendChild(overlay);
  const finish = (completo) => {
    clearInterval(timedTimer.id); timedTimer = null; overlay.remove();
    if (completo) { ding(); onDone && onDone(); }
  };
  timedTimer = { id: setInterval(() => {
    restante.v--;
    big.textContent = fmtTime(Math.max(0, restante.v));
    if (restante.v <= 0) return finish(true);
    if (restante.v <= 3) beep(700, 100);
  }, 1000) };
}

// ---- Instruções didáticas ----
export function showInstructions(ex) {
  if (!ex) { toast('Sem instruções para este exercício.'); return; }
  const ins = ex.instrucoes || {};
  const body = h('div', { class: 'instructions' }, [
    ins.resumo ? h('p', { class: 'lead', text: ins.resumo }) : null,
    ex.grupos ? h('div', { class: 'tags' }, ex.grupos.map((g) => h('span', { class: 'tag', text: g }))) : null,
    section('Passo a passo', ins.passos, 'ol'),
    section('Dicas', ins.dicas, 'ul', '✅ '),
    section('Erros comuns', ins.errosComuns, 'ul', '⚠️ '),
    ex.videoUrl ? h('a', { class: 'btn ghost block', href: ex.videoUrl, target: '_blank', rel: 'noopener', text: '▶ Ver vídeo' }) : null,
  ]);
  modal(ex.nome, body);
}
function section(titulo, itens, tipo = 'ul', prefix = '') {
  if (!itens || !itens.length) return null;
  const listEl = h(tipo, { class: 'inst-list' }, itens.map((t) => h('li', { text: prefix + t })));
  return h('div', { class: 'inst-sec' }, [h('h4', { text: titulo }), listEl]);
}

// ---- Cancelar ----
async function cancelWorkout(ctx) {
  const ok = await confirmDialog('Cancelar treino', 'Descartar este treino em andamento? O que você marcou não será salvo.');
  if (ok) { stopAllTimers(); document.getElementById('rest-timer')?.remove(); store.clearCurrent(ctx.userId); ctx.navigate('#/home'); }
}

// ---- Finalizar ----
async function finishWorkout(ctx, session) {
  const feitas = session.itens.reduce((a, it) => a + it.series.filter((s) => s.feito).length, 0);
  if (feitas === 0) {
    const ok = await confirmDialog('Nenhuma série marcada', 'Você não marcou nenhuma série. Sair sem salvar este treino?');
    if (ok) { store.clearCurrent(ctx.userId); stopAllTimers(); ctx.navigate('#/home'); }
    return;
  }
  stopAllTimers();
  document.getElementById('rest-timer')?.remove();
  const record = {
    id: String(session.iniciadoEm),
    data: todayISO(),
    userId: ctx.userId,
    planId: session.planId,
    planNome: session.planNome,
    diaNome: session.diaNome,
    duracaoSeg: Math.round((Date.now() - session.iniciadoEm) / 1000),
    itens: session.itens.map((it) => ({
      exerciseId: it.exerciseId, nome: it.nome, tipo: it.tipo,
      series: it.series.map((s) => ({ peso: s.peso, reps: s.reps, repsAlvo: s.repsAlvo, tempoSeg: s.tempoSeg, feito: s.feito, esforco: s.esforco })),
    })),
  };
  store.addSession(ctx.userId, record);
  store.clearCurrent(ctx.userId);

  const hist = store.getHistory(ctx.userId);
  const vol = volumeSemanal(hist);
  const body = h('div', { class: 'finish' }, [
    h('div', { class: 'big-emoji', text: '🎉' }),
    h('p', { class: 'lead', text: mensagemFinal(hist) }),
    h('div', { class: 'stats-row' }, [
      stat(feitas, 'séries'),
      stat(fmtTime(record.duracaoSeg), 'tempo'),
      stat(vol.toLocaleString('pt-BR'), 'kg na semana'),
    ]),
    h('p', { class: 'muted tiny center', text: 'Lembre-se de exportar um backup de vez em quando (aba Config).' }),
  ]);
  const close = modal('Treino concluído!', body, [
    h('button', { class: 'btn ghost', text: 'Ver histórico', onClick: () => { close(); ctx.navigate('#/history'); } }),
    h('button', { class: 'btn primary', text: 'Início', onClick: () => { close(); ctx.navigate('#/home'); } }),
  ]);
}

function stat(v, l) { return h('div', { class: 'stat' }, [h('div', { class: 'stat-v', text: v }), h('div', { class: 'stat-l', text: l })]); }

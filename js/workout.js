// workout.js — MODO TREINO.
// Interface: você preenche o PESO e as REPETIÇÕES uma única vez por exercício e só dá
// check em cada série (as séries viram bolhas). Exercício concluído colapsa, para a tela
// ficar curta. Sem cronômetro de sessão (quem conta o tempo é o Apple Watch).
import { h, clear, modal, toast, ding, beep, vibrate, fmtTime, fmtKg, todayISO, confirmDialog, alertDialog } from './ui.js';
import * as store from './store.js';
import { suggestNext, cargaInicial } from './progression.js';
import { mensagemFinal } from './motivation.js';
import { faixaFC, zonaDoExercicio, textoFaixa, explicacaoFC } from './hr.js';
import { caloriasSessao, volumeDe, volumeDidatico } from './metrics.js';

let restTimer = null;   // { id, restante, total }
let timedTimer = null;  // countdown de exercício por tempo
let tickTimer = null;   // cronômetro geral (opcional, ver perfil.cronometro)

function stopAllTimers() {
  if (restTimer) { clearInterval(restTimer.id); restTimer = null; }
  if (timedTimer) { clearInterval(timedTimer.id); timedTimer = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
export function cleanupWorkout() { stopAllTimers(); }

const ESFORCOS = ['Fácil', 'Médio', 'Difícil', 'Falhou'];
const ESFORCO_PADRAO = 'Médio';

function isTimed(ex, pe) { return !!(pe.porTempo || ex?.tipo === 'tempo'); }
const isCardioEx = (ex) => !!ex && (ex.grupos || []).includes('cardio');
const esforcoModo = (ctx) => ((ctx.perfil() || {}).esforcoModo) || 'exercicio';
const usarDescanso = (ctx) => (ctx.perfil() || {}).descansoTimer !== false;
const usarCronometro = (ctx) => (ctx.perfil() || {}).cronometro === true;

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

// Monta um "item" de treino a partir de um exercício do plano (pe).
export function buildItem(ctx, pe) {
  const ex = ctx.exercise(pe.exerciseId) || { id: pe.exerciseId, nome: pe.exerciseId, tipo: 'reps', grupos: [] };
  const timed = isTimed(ex, pe);
  const perfil = ctx.perfil() || {};
  const entries = store.getRecentEntriesForExercise(ctx.userId, pe.exerciseId, 2);
  const sug = suggestNext(ex, entries, { objetivo: perfil.objetivo, perfil });
  const nSeries = pe.series || 3;
  const repsAlvo = pe.repsAlvo || sug.repsSugerido || 12;
  // A carga inicial nunca fica abaixo da última que você usou (progressão + memória de carga).
  const lastW = store.getLastWeight(ctx.userId, pe.exerciseId) || 0;
  const pesoAlvo = timed ? 0 : Math.max(lastW, sug.pesoSugerido != null ? sug.pesoSugerido : (pe.pesoAlvo || 0));
  const tempoAlvo = timed ? (sug.tempoSugerido || pe.tempoSeg || ex.tempoPadraoSeg || 30) : 0;
  const cardio = timed && isCardioEx(ex) && !/aquec/i.test(pe.obs || '');
  const series = [];
  for (let i = 0; i < nSeries; i++) {
    series.push({ peso: pesoAlvo, reps: timed ? 0 : repsAlvo, repsAlvo: timed ? 0 : repsAlvo,
      tempoSeg: tempoAlvo, distanciaKm: 0, feito: false, esforco: null });
  }
  return {
    exerciseId: pe.exerciseId, nome: ex.nome, tipo: ex.tipo || 'reps', timed, cardio,
    descansoSeg: pe.descansoSeg != null ? pe.descansoSeg : (ex.descansoPadraoSeg || 60),
    pesoAlvo, repsAlvo, tempoAlvo,
    unidadeCarga: (ex.cargaInicial && ex.cargaInicial.unidade) || null,
    semCarga: !ex.cargaInicial && (ex.incrementoKg === 0 || ex.incrementoKg == null) && !timed,
    porLado: ex.contagem === 'por_lado' || ex.contagem === 'tempo_lado',
    fcZona: zonaDoExercicio(ex), acessorios: ex.acessorios || [],
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
  const per = remaining > 0 ? Math.min(round60(remaining / cardioItems.length), 2700) : 300;
  for (const it of cardioItems) {
    it.tempoAlvo = per;
    for (const set of it.series) if (!set.feito) set.tempoSeg = per;
    // A dica precisa combinar com o tempo que sobrou de verdade.
    it.sugestao = `${Math.round(per / 60)} min para fechar os ${session.tempoDisponivelMin || 30} min de hoje. `
      + 'Dose o ritmo pela faixa de batimentos: abaixo dela, acelere; acima, alivie.';
  }
  session._estTotalSec = estimateStrengthSec(session) + cardioItems.reduce((a, it) => a + it.series.reduce((b, s) => b + (s.tempoSeg || 0), 0), 0);
}

// ---------------------------------------------------------------- tela
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
  const updateProgress = () => {
    const d = doneSets(), t = totalSets();
    progressBar.firstChild.style.width = `${t ? (d / t) * 100 : 0}%`;
    progressLabel.textContent = `${d}/${t} séries`;
  };

  const cbs = { persist, updateProgress, rerender, ctx, session };
  const list = h('div', { class: 'workout-list' });
  session.itens.forEach((item, idx) => list.appendChild(renderExerciseCard(ctx, session, item, idx, cbs)));

  const addExBtn = h('button', { class: 'btn ghost block', text: '+ Adicionar exercício', onClick: () => addExerciseToSession(ctx, session, cbs) });
  const finishBtn = h('button', { class: 'btn primary big grow', text: 'Finalizar treino', onClick: () => finishWorkout(ctx, session) });
  const cancelBtn = h('button', { class: 'btn ghost danger', text: 'Cancelar', onClick: () => cancelWorkout(ctx) });

  // Seletor "tempo de hoje" — divide o tempo entre musculação e o cardio.
  let timeRow = null;
  if (session.itens.some((it) => it.cardio)) {
    const opts = (ctx.perfil() && ctx.perfil().duracaoOpcoesMin) || [20, 30, 45, 60];
    if (!session.tempoDisponivelMin) session.tempoDisponivelMin = 30;
    const est = Math.round((session._estTotalSec || 0) / 60);
    const meta = session.tempoDisponivelMin;
    const estLabel = h('span', { class: 'tiny ' + (est > meta + 2 ? 'warn' : 'muted'),
      text: `≈ ${est} min` + (est > meta + 2 ? ` (acima de ${meta})` : '') });
    const chips = h('div', { class: 'time-chips' });
    opts.forEach((m) => chips.appendChild(h('button', { class: 'chip' + (session.tempoDisponivelMin === m ? ' sel' : ''), text: m + 'min',
      onClick: () => { session.tempoDisponivelMin = m; applyTimeBudget(session); persist(); rerender(); } })));
    timeRow = h('div', { class: 'time-row row between center' }, [
      h('div', { class: 'row center gap' }, [h('span', { class: 'muted tiny', text: 'Tempo de hoje:' }), chips]),
      estLabel,
    ]);
  }

  // Cronômetro geral: opcional (Config). Conta do início da sessão; se você pausar o
  // treino de verdade, o tempo certo é o do Apple Watch.
  let durLabel = null;
  if (usarCronometro(ctx)) {
    durLabel = h('span', { class: 'dur muted tiny' });
    const pinta = () => { durLabel.textContent = '⏱ ' + fmtTime(Math.max(0, (Date.now() - session.iniciadoEm) / 1000)); };
    pinta();
    tickTimer = setInterval(pinta, 1000);
  }
  view.appendChild(h('div', { class: 'workout-head' }, [
    h('div', { class: 'row between center' }, [
      h('div', {}, [h('h2', { text: session.planNome }), h('div', { class: 'muted tiny', text: session.diaNome })]),
      durLabel,
    ]),
    h('div', { class: 'row center gap' }, [progressBar, progressLabel]),
    timeRow,
  ]));
  view.appendChild(list);
  view.appendChild(addExBtn);
  view.appendChild(h('div', { class: 'workout-footer' }, [h('div', { class: 'row gap' }, [cancelBtn, finishBtn])]));
  updateProgress();

  // Avisos de início (uma vez por treino): Apple Watch e luvas (boneco).
  if (!session._avisado) {
    session._avisado = true;
    persist();
    avisosDeInicio(ctx, session, cbs).then(() => { session.iniciadoEm = Date.now(); persist(); });
  }
}

// Alternativa sem acessório (luvas) para o mesmo objetivo do exercício.
function alternativaSemAcessorio(ctx, item) {
  const cur = ctx.exercise(item.exerciseId) || {};
  const grupos = new Set(cur.grupos || []);
  const avail = availableEquip(ctx);
  const pool = [...ctx.data.exercises.values()].filter((e) => e.id !== item.exerciseId
    && usableExercise(e, avail) && !(e.acessorios || []).length
    && (item.cardio ? (e.grupos || []).includes('cardio') : (e.grupos || []).some((g) => grupos.has(g))));
  return pool.sort((a, b) => (b.prioridadeCardio || 0) - (a.prioridadeCardio || 0)
    || (a.impacto === 'baixo' ? -1 : 0))[0] || null;
}

async function avisosDeInicio(ctx, session, cbs) {
  const perfil = ctx.perfil() || {};
  const idxLuva = session.itens.findIndex((it) => (it.acessorios || []).includes('luvas'));
  if (idxLuva >= 0) {
    const item = session.itens[idxLuva];
    const alt = alternativaSemAcessorio(ctx, item);
    const semLuvas = await new Promise((resolve) => {
      const close = modal('🥊 Leve as luvas', h('div', {}, [
        h('div', { class: 'big-emoji center', text: '🥊' }),
        h('p', { text: `Este treino tem ${item.nome}.` }),
        h('p', { text: 'Coloque a bandagem e as luvas antes de começar: bater sem proteção machuca o punho.' }),
      ]), [
        alt ? h('button', { class: 'btn ghost block', text: `Estou sem luvas (trocar por ${alt.nome})`,
          onClick: () => { close(); resolve(true); } }) : null,
        h('button', { class: 'btn primary block big', text: 'Estou de luvas', onClick: () => { close(); resolve(false); } }),
      ], { travado: true });
    });
    if (semLuvas && alt) {
      const tempo = item.tempoAlvo || (item.series[0] && item.series[0].tempoSeg) || alt.tempoPadraoSeg;
      const timed = alt.tipo === 'tempo';
      session.itens[idxLuva] = buildItem(ctx, { exerciseId: alt.id, series: item.series.length,
        repsAlvo: item.repsAlvo || 12, descansoSeg: alt.descansoPadraoSeg, porTempo: timed, tempoSeg: tempo });
      applyTimeBudget(session);
      if (cbs) { cbs.persist(); cbs.rerender(); }
      toast(`Trocado para ${alt.nome}.`);
      return;   // a tela vai ser redesenhada: o aviso do relógio aparece lá
    }
  }
  if (perfil.avisoWatch !== false) {
    const r = await alertDialog('⌚ Inicie no Apple Watch', [
      'Abra o app Treino no relógio e inicie a atividade (Musculação ou Caminhada) ANTES de começar.',
      'O relógio conta o tempo, os batimentos e as calorias. Aqui você registra as cargas e as séries.',
    ], { emoji: '⌚', botao: 'Já iniciei, pode começar', naoMostrar: true });
    if (r.naoMostrar) {
      const base = ctx.perfil() || {};
      const merged = { ...base, avisoWatch: false };
      delete merged._override;
      store.setPerfilOverride(ctx.userId, merged);
    }
  }
}

// ---------------------------------------------------------------- steppers
function stepper(getVal, setVal, { step = 1, min = 0, suffix = '', decimals = 0, big = false } = {}) {
  const input = h('input', { class: 'stepper-input' + (big ? ' big' : ''), type: 'number', inputmode: 'decimal', value: getVal(), step, min });
  const apply = (v) => { v = Math.max(min, +(+v).toFixed(decimals)); setVal(v); input.value = v; };
  input.addEventListener('change', () => apply(input.value || 0));
  return h('div', { class: 'stepper' + (big ? ' big' : '') }, [
    h('button', { class: 'step-btn', text: '−', onClick: () => apply((+input.value || 0) - step) }),
    input,
    suffix ? h('span', { class: 'step-suffix', text: suffix }) : null,
    h('button', { class: 'step-btn', text: '+', onClick: () => apply((+input.value || 0) + step) }),
  ]);
}

const minStepper = (get, set) => stepper(() => Math.round(get() / 60), (v) => set(Math.max(1, v) * 60), { step: 1, min: 1, suffix: 'min', big: true });

// ---------------------------------------------------------------- card do exercício
function renderExerciseCard(ctx, session, item, idx, cbs) {
  const ex = ctx.exercise(item.exerciseId);
  const perfil = ctx.perfil() || {};
  const modo = esforcoModo(ctx);
  const todasFeitas = () => item.series.length > 0 && item.series.every((s) => s.feito);
  if (item.colapsado == null) item.colapsado = todasFeitas();

  const card = h('div', { class: 'card exercise-card' });
  const redraw = () => { clear(card); build(); };

  const aplicarAlvo = () => {
    for (const s of item.series) {
      if (s.feito) continue;
      if (item.timed) s.tempoSeg = item.tempoAlvo;
      else { s.peso = item.pesoAlvo; s.reps = item.repsAlvo; s.repsAlvo = item.repsAlvo; }
    }
  };

  function resumoTexto() {
    const feitas = item.series.filter((s) => s.feito);
    if (item.timed) {
      const t = feitas.reduce((a, s) => a + (+s.tempoSeg || 0), 0);
      const km = feitas.reduce((a, s) => a + (+s.distanciaKm || 0), 0);
      return `${feitas.length}x · ${Math.round(t / 60) || Math.round(t)}${t >= 60 ? ' min' : ' s'}` + (km ? ` · ${km} km` : '');
    }
    return `${feitas.length}×${item.repsAlvo} ${item.pesoAlvo ? '@ ' + item.pesoAlvo + ' kg' : '(peso do corpo)'}`;
  }

  function build() {
    // --- cabeçalho
    const titulo = h('div', { class: 'grow', onClick: () => { item.colapsado = !item.colapsado; cbs.persist(); redraw(); }, style: 'cursor:pointer' }, [
      h('h3', { class: 'ex-title', text: `${todasFeitas() ? '✓ ' : ''}${idx + 1}. ${item.nome}` }),
      h('div', { class: 'muted tiny', text: item.colapsado ? resumoTexto() : (item.porLado ? 'conta por lado' : '') }),
    ]);
    card.classList.toggle('done', todasFeitas());
    card.appendChild(h('div', { class: 'row between center' }, [
      titulo,
      h('div', { class: 'row gap' }, [
        h('button', { class: 'icon-btn', text: '⇄', 'aria-label': 'Substituir exercício', onClick: () => substituteExercise(ctx, session, idx, cbs) }),
        h('button', { class: 'icon-btn info', text: 'ⓘ', 'aria-label': 'Instruções', onClick: () => showInstructions(ex, perfil) }),
        h('button', { class: 'icon-btn', text: '🗑', 'aria-label': 'Remover exercício', onClick: async () => {
          if (!await confirmDialog('Remover exercício', `Tirar "${item.nome}" deste treino?`)) return;
          session.itens.splice(idx, 1); applyTimeBudget(session); cbs.persist(); cbs.rerender();
        } }),
      ]),
    ]));
    if (item.colapsado) return;

    // --- dica de progressão (fechável)
    if (item.sugestao && !item.dicaFechada) {
      card.appendChild(h('div', { class: 'sugestao' }, [
        h('span', { class: 'grow', text: '💡 ' + item.sugestao }),
        h('button', { class: 'card-close', text: '×', 'aria-label': 'Fechar dica', onClick: () => { item.dicaFechada = true; cbs.persist(); redraw(); } }),
      ]));
    }

    // --- faixa de batimentos (cardio)
    if (item.fcZona) {
      const f = faixaFC(perfil, item.fcZona);
      card.appendChild(h('button', { class: 'fc-box', onClick: () => modal('Batimentos no ' + item.nome,
        h('div', { class: 'instructions' }, [h('ul', { class: 'inst-list' }, explicacaoFC(f, perfil).map((t) => h('li', { text: t })))])) }, [
        h('span', { text: '🫀' }),
        h('span', { class: 'grow', text: f ? `Alvo: ${textoFaixa(f)} (${f.zona.toLowerCase()})` : 'Preencha seu nascimento no Perfil para ver a faixa de batimentos' }),
        h('span', { class: 'muted tiny', text: 'ⓘ' }),
      ]));
    }

    // --- alvo único do exercício (preenche todas as séries)
    const alvo = h('div', { class: 'alvo-box' });
    if (item.timed) {
      const cardioMin = item.cardio || item.tempoAlvo >= 300;
      alvo.appendChild(h('label', { class: 'field' }, [
        h('span', { class: 'flabel', text: cardioMin ? 'tempo' : 'segundos' }),
        cardioMin
          ? minStepper(() => item.tempoAlvo, (v) => { item.tempoAlvo = v; aplicarAlvo(); cbs.persist(); })
          : stepper(() => item.tempoAlvo, (v) => { item.tempoAlvo = v; aplicarAlvo(); cbs.persist(); }, { step: 5, min: 5, suffix: 's', big: true }),
      ]));
      if (ex && ex.permiteDistancia) {
        const km = h('input', { class: 'mini-num', type: 'number', step: '0.1', min: 0, inputmode: 'decimal',
          value: item.series[0] && item.series[0].distanciaKm ? item.series[0].distanciaKm : '' });
        km.addEventListener('change', () => { const v = +km.value || 0; item.series.forEach((s) => { if (!s.feito || item.series.length === 1) s.distanciaKm = v; }); cbs.persist(); });
        alvo.appendChild(h('label', { class: 'field' }, [h('span', { class: 'flabel', text: 'km (opcional)' }), km]));
      }
    } else {
      const kgLabel = item.unidadeCarga === 'halter' ? 'kg (cada halter)' : item.unidadeCarga === 'maquina' ? 'kg (pilha)' : 'kg';
      if (item.semCarga) {
        alvo.appendChild(h('div', { class: 'field' }, [h('span', { class: 'flabel', text: 'carga' }), h('div', { class: 'muted tiny', text: 'peso do corpo' })]));
      } else {
        alvo.appendChild(h('label', { class: 'field' }, [
          h('span', { class: 'flabel', text: kgLabel }),
          stepper(() => item.pesoAlvo, (v) => { item.pesoAlvo = v; store.setLastWeight(ctx.userId, item.exerciseId, v); aplicarAlvo(); cbs.persist(); }, { step: 1, min: 0, decimals: 1, big: true }),
        ]));
      }
      alvo.appendChild(h('label', { class: 'field' }, [
        h('span', { class: 'flabel', text: item.porLado ? 'reps (cada lado)' : 'reps' }),
        stepper(() => item.repsAlvo, (v) => { item.repsAlvo = v; aplicarAlvo(); cbs.persist(); }, { step: 1, min: 0, big: true }),
      ]));
    }
    card.appendChild(alvo);

    // --- séries (bolhas de check)
    const bolhas = h('div', { class: 'serie-row' });
    const marcar = (si) => {
      const s = item.series[si];
      if (!s.feito) {
        if (item.timed) s.tempoSeg = s.tempoSeg || item.tempoAlvo;
        else { s.peso = item.pesoAlvo; s.reps = item.repsAlvo; s.repsAlvo = item.repsAlvo; }
      }
      s.feito = !s.feito;
      if (s.feito) {
        beep(880, 120); vibrate(40);
        if (modo === 'serie') s.esforco = s.esforco || ESFORCO_PADRAO;
        if (item.descansoSeg > 0 && usarDescanso(ctx) && !todasFeitas()) startRest(item.descansoSeg, item.nome);
        if (todasFeitas()) {
          if (modo === 'exercicio') item.esforco = item.esforco || ESFORCO_PADRAO;
          item.colapsado = modo !== 'exercicio';
        }
      } else {
        item.colapsado = false;
      }
      cbs.persist(); cbs.updateProgress(); redraw();
    };
    item.series.forEach((s, si) => {
      const b = h('button', { class: 'serie-bolha' + (s.feito ? ' on' : ''), onClick: () => marcar(si) }, [
        h('span', { class: 'sb-n', text: s.feito ? '✓' : String(si + 1) }),
        h('span', { class: 'sb-v', text: s.feito ? (item.timed ? fmtTime(s.tempoSeg) : `${s.reps}x${s.peso || '-'}`) : '' }),
      ]);
      bolhas.appendChild(b);
      if (item.timed && !s.feito) {
        bolhas.appendChild(h('button', { class: 'btn ghost sm play-btn', text: '▶', 'aria-label': 'Iniciar tempo',
          onClick: () => runTimedOverlay(s.tempoSeg || item.tempoAlvo, item.nome, (segundos) => {
            s.tempoSeg = segundos; item.tempoAlvo = Math.max(item.tempoAlvo, segundos);
            cbs.persist(); marcar(si);
          }) }));
      }
    });
    bolhas.appendChild(h('button', { class: 'serie-add', text: '+', 'aria-label': 'Adicionar série', onClick: () => {
      item.series.push({ peso: item.pesoAlvo, reps: item.repsAlvo, repsAlvo: item.repsAlvo, tempoSeg: item.tempoAlvo, distanciaKm: 0, feito: false, esforco: null });
      cbs.persist(); cbs.updateProgress(); redraw();
    } }));
    if (item.series.length > 1) {
      bolhas.appendChild(h('button', { class: 'serie-add', text: '−', 'aria-label': 'Remover série', onClick: () => {
        const i = item.series.map((s) => s.feito).lastIndexOf(false);
        item.series.splice(i >= 0 ? i : item.series.length - 1, 1);
        cbs.persist(); cbs.updateProgress(); redraw();   // sem recarregar a tela: não perde a rolagem
      } }));
    }
    card.appendChild(h('div', { class: 'row between center' }, [
      h('span', { class: 'flabel', text: 'séries' }), h('span', { class: 'muted tiny', text: `${item.series.filter((s) => s.feito).length}/${item.series.length}` }),
    ]));
    card.appendChild(bolhas);

    // --- "como foi?" conforme a preferência
    if (modo === 'serie') {
      item.series.forEach((s, si) => {
        if (!s.feito) return;
        card.appendChild(esforcoRow(`Série ${si + 1}`, () => s.esforco, (v) => { s.esforco = v; cbs.persist(); redraw(); }));
      });
    } else if (modo === 'exercicio' && todasFeitas()) {
      // Sem toggle: tocar em qualquer opção confirma e recolhe o exercício (já vem "Médio").
      card.appendChild(esforcoRow('Como foi este exercício?', () => item.esforco, (v) => {
        item.esforco = v || ESFORCO_PADRAO; item.colapsado = true; cbs.persist(); redraw();
      }, { toggle: false }));
      card.appendChild(h('p', { class: 'muted tiny', text: 'Toque em uma opção para confirmar e recolher o exercício.' }));
    }

    // --- ajuste série a série (exceções)
    if (item.series.some((s) => s.feito)) {
      card.appendChild(h('button', { class: 'btn ghost sm', text: item.detalhe ? 'Esconder ajuste por série' : 'Ajustar série a série',
        onClick: () => { item.detalhe = !item.detalhe; cbs.persist(); redraw(); } }));
      if (item.detalhe) card.appendChild(detalheSeries(item, cbs));
    }
  }

  build();
  return card;
}

function esforcoRow(titulo, get, set, { toggle = true } = {}) {
  const host = h('div', { class: 'esforco' }, [h('span', { class: 'muted tiny', text: titulo })]);
  for (const o of ESFORCOS) {
    host.appendChild(h('button', { class: 'chip' + (get() === o ? ' sel' : ''), text: o,
      onClick: () => set(toggle && get() === o ? null : o) }));
  }
  return host;
}

function detalheSeries(item, cbs) {
  const box = h('div', { class: 'sets' });
  item.series.forEach((s, si) => {
    const num = (get, setV, step = 1) => {
      const inp = h('input', { class: 'mini-num', type: 'number', inputmode: 'decimal', min: 0, step, value: get() });
      inp.addEventListener('change', () => { setV(+inp.value || 0); cbs.persist(); });
      return inp;
    };
    box.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-n', text: si + 1 }),
      h('div', { class: 'set-fields' }, item.timed
        ? [h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'seg' }), num(() => s.tempoSeg, (v) => s.tempoSeg = v, 5)])]
        : [h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'kg' }), num(() => s.peso, (v) => s.peso = v)]),
           h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'reps' }), num(() => s.reps, (v) => s.reps = v)])]),
      h('span', { class: 'muted tiny', text: s.feito ? '✓' : '-' }),
    ]));
  });
  return box;
}

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
  const cur = ctx.exercise(item.exerciseId);
  const eqIds = new Set(equivalentes(ctx, item).map((e) => e.id));
  const avail = availableEquip(ctx);
  const all = [...ctx.data.exercises.values()].filter((e) => e.id !== item.exerciseId && usableExercise(e, avail));
  all.sort((a, b) => (eqIds.has(b.id) ? 1 : 0) - (eqIds.has(a.id) ? 1 : 0) || a.nome.localeCompare(b.nome));

  const doSwap = (e) => {
    const timed = e.tipo === 'tempo';
    session.itens[idx] = buildItem(ctx, { exerciseId: e.id, series: item.series.length,
      repsAlvo: item.repsAlvo || 12, pesoAlvo: 0,
      descansoSeg: e.descansoPadraoSeg, porTempo: timed, tempoSeg: e.tempoPadraoSeg });
    applyTimeBudget(session); cbs.persist(); cbs.rerender();
  };

  const search = h('input', { class: 'text-input', placeholder: 'Buscar qualquer exercício...' });
  const listEl = h('div', { class: 'picker-list' });
  const draw = (term = '') => {
    clear(listEl);
    const t = term.toLowerCase();
    const filt = all.filter((e) => e.nome.toLowerCase().includes(t));
    let hEq = false, hOut = false;
    filt.forEach((e) => {
      const eq = eqIds.has(e.id);
      if (eq && !hEq) { listEl.appendChild(h('div', { class: 'picker-group', text: `✅ Equivalentes (${((cur && cur.grupos) || []).join(', ')})` })); hEq = true; }
      if (!eq && !hOut) { listEl.appendChild(h('div', { class: 'picker-group', text: 'Outros exercícios' })); hOut = true; }
      listEl.appendChild(h('button', { class: 'picker-item', onClick: () => { close(); doSwap(e); } }, [
        h('span', {}, [h('span', { text: e.nome }), eq ? h('span', { class: 'badge', text: 'equivalente' }) : null]),
        h('span', { class: 'muted tiny', text: (e.equipamento || []).join(', ') }),
      ]));
    });
    if (!filt.length) listEl.appendChild(h('p', { class: 'muted tiny', text: 'Nada encontrado.' }));
  };
  search.addEventListener('input', () => draw(search.value));
  draw();
  const close = modal('Substituir exercício', h('div', { class: 'picker' }, [
    h('p', { class: 'muted tiny', text: `Trocar "${item.nome}". Os equivalentes (mesmo grupo muscular) aparecem primeiro, mas você pode escolher qualquer exercício.` }),
    search, listEl,
  ]));
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
        session.itens.push(buildItem(ctx, { exerciseId: e.id, series: timed ? 1 : 3, repsAlvo: timed ? 1 : 12, pesoAlvo: 0, descansoSeg: e.descansoPadraoSeg, porTempo: timed, tempoSeg: e.tempoPadraoSeg }));
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
// onDone recebe os SEGUNDOS realmente feitos (com o que você somou em "+10s"), para
// que o tempo registrado seja o tempo real.
function runTimedOverlay(sec, label, onDone) {
  if (timedTimer) clearInterval(timedTimer.id);
  const st = { restante: sec, total: sec };
  const big = h('div', { class: 'timed-num', text: fmtTime(st.restante) });
  const sub = h('div', { class: 'muted tiny', text: `alvo: ${fmtTime(st.total)}` });
  const overlay = h('div', { class: 'timed-overlay' }, [
    h('div', { class: 'timed-card' }, [
      h('div', { class: 'muted', text: label }),
      big, sub,
      h('div', { class: 'row gap center' }, [
        h('button', { class: 'btn ghost', text: '+10s', onClick: () => { st.restante += 10; st.total += 10; big.textContent = fmtTime(st.restante); sub.textContent = `alvo: ${fmtTime(st.total)}`; } }),
        h('button', { class: 'btn danger', text: 'Parar', onClick: () => finish(false) }),
      ]),
    ]),
  ]);
  document.body.appendChild(overlay);
  const finish = (completo) => {
    if (timedTimer) clearInterval(timedTimer.id);
    timedTimer = null; overlay.remove();
    const feitos = completo ? st.total : Math.max(1, st.total - Math.max(0, st.restante));
    if (completo) ding();
    onDone && onDone(feitos);
  };
  timedTimer = { id: setInterval(() => {
    st.restante--;
    big.textContent = fmtTime(Math.max(0, st.restante));
    if (st.restante <= 0) return finish(true);
    if (st.restante <= 3) beep(700, 100);
  }, 1000) };
}

// ---- Instruções didáticas ----
export function showInstructions(ex, perfil) {
  if (!ex) { toast('Sem instruções para este exercício.'); return; }
  const ins = ex.instrucoes || {};
  // Ilustração: se falhar (offline com cache antigo), tenta de novo sem cache e só
  // depois mostra um aviso, em vez de desaparecer sem explicação.
  const illusBox = h('div', { class: 'illus-box' });
  const illus = h('img', { class: 'ex-illus', src: `assets/exercises/${ex.id}.svg`, alt: `Ilustração do exercício ${ex.nome}` });
  let tentou = false;
  illus.addEventListener('error', () => {
    if (!tentou) { tentou = true; illus.src = `assets/exercises/${ex.id}.svg?r=${Date.now()}`; return; }
    illus.remove();
    illusBox.appendChild(h('p', { class: 'muted tiny center', text: 'Ilustração não disponível offline. Abra o app conectado uma vez para baixá-la.' }));
  });
  illusBox.appendChild(illus);
  const q = ex.videoBusca || `${ex.nome} execução correta`;
  const videoHref = ex.videoUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const zona = zonaDoExercicio(ex);
  const f = zona ? faixaFC(perfil || {}, zona) : null;
  const body = h('div', { class: 'instructions' }, [
    illusBox,
    ins.resumo ? h('p', { class: 'lead', text: ins.resumo }) : null,
    ex.grupos ? h('div', { class: 'tags' }, ex.grupos.map((g) => h('span', { class: 'tag', text: g }))) : null,
    ex.contagemTexto ? h('div', { class: 'sugestao', text: '🔢 ' + ex.contagemTexto }) : null,
    (ex.acessorios || []).length ? h('div', { class: 'sugestao', text: '🧤 Use: ' + ex.acessorios.join(', ') }) : null,
    section('Passo a passo', ins.passos, 'ol'),
    zona ? section('Batimentos (Apple Watch)', explicacaoFC(f, perfil || {}), 'ul', '🫀 ') : null,
    section('Dicas', ins.dicas, 'ul', '✅ '),
    section('Erros comuns', ins.errosComuns, 'ul', '⚠️ '),
    h('a', { class: 'btn ghost block', href: videoHref, target: '_blank', rel: 'noopener', text: '▶ Ver vídeos de execução' }),
    h('p', { class: 'muted tiny center', text: 'Ilustração esquemática. Na dúvida sobre a execução, procure orientação profissional.' }),
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

  // "Como foi?" só no fim (preferência do usuário)
  if (esforcoModo(ctx) === 'fim') {
    const pendentes = session.itens.filter((it) => it.series.some((s) => s.feito));
    if (pendentes.length) await perguntarEsforcoFinal(pendentes);
  }

  const perfil = ctx.perfil() || {};
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
      series: it.series.map((s) => ({ peso: s.peso, reps: s.reps, repsAlvo: s.repsAlvo, tempoSeg: s.tempoSeg,
        distanciaKm: s.distanciaKm || 0, feito: s.feito, esforco: s.esforco || it.esforco || null })),
    })),
  };
  store.addSession(ctx.userId, record);
  store.clearCurrent(ctx.userId);

  const kcal = caloriasSessao(record.itens, perfil.pesoAtual, (id) => ctx.exercise(id));
  const volTreino = volumeDe([record]);
  const didatico = volumeDidatico(volTreino, perfil.pesoAtual);
  const hist = store.getHistory(ctx.userId);
  const proxLuvas = perfil.dummi && !session.itens.some((it) => (it.acessorios || []).includes('luvas'));

  const body = h('div', { class: 'finish' }, [
    h('div', { class: 'big-emoji', text: '🎉' }),
    h('p', { class: 'lead', text: mensagemFinal(hist) }),
    h('div', { class: 'stats-row' }, [
      stat(feitas, 'séries'),
      stat(kcal.toLocaleString('pt-BR'), 'kcal (estim.)'),
      stat(volTreino.toLocaleString('pt-BR'), 'kg movidos'),
    ]),
    didatico ? h('p', { class: 'center tiny' }, [h('span', { class: 'label-accent', text: '💪 ' }), h('span', { text: `Você moveu ${volTreino.toLocaleString('pt-BR')} kg somando todas as séries, ${didatico}.` })]) : null,
    h('p', { class: 'muted tiny center', text: 'Calorias são estimativa (METs). O valor do Apple Watch, que usa seus batimentos, é mais preciso.' }),
    proxLuvas ? h('p', { class: 'sugestao', text: '🥊 No próximo treino eu posso incluir o boneco (Bob). Deixe as luvas e a bandagem separadas.' }) : null,
  ]);
  const close = modal('Treino concluído!', body, [
    h('button', { class: 'btn ghost', text: 'Ver histórico', onClick: () => { close(); ctx.navigate('#/history'); } }),
    h('button', { class: 'btn primary', text: '✓ Concluir e voltar à Home', onClick: () => { close(); ctx.navigate('#/home'); } }),
  ]);
}

function perguntarEsforcoFinal(itens) {
  return new Promise((resolve) => {
    const box = h('div', {}, itens.map((it) => {
      const row = h('div', { class: 'esf-item' });
      const draw = () => {
        clear(row);
        row.appendChild(h('div', { class: 'tiny', text: it.nome }));
        const chips = h('div', { class: 'esforco' });
        ESFORCOS.forEach((o) => chips.appendChild(h('button', { class: 'chip' + ((it.esforco || ESFORCO_PADRAO) === o ? ' sel' : ''), text: o,
          onClick: () => { it.esforco = o; draw(); } })));
        row.appendChild(chips);
      };
      draw();
      return row;
    }));
    const close = modal('Como foi cada exercício?', h('div', {}, [
      h('p', { class: 'muted tiny', text: 'Isso calibra a sugestão de carga da próxima vez. Já vem marcado "Médio".' }), box,
    ]), [h('button', { class: 'btn primary block', text: 'Salvar treino', onClick: () => {
      itens.forEach((it) => { it.esforco = it.esforco || ESFORCO_PADRAO; });
      close(); resolve();
    } })], { travado: true });
  });
}

function stat(v, l) { return h('div', { class: 'stat' }, [h('div', { class: 'stat-v', text: v }), h('div', { class: 'stat-l', text: l })]); }

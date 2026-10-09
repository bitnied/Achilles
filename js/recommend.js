// recommend.js — "Treino do dia": pergunta tempo + modalidade e sugere um treino
// considerando o histórico (variedade/recuperação) e o objetivo/foco de cada pessoa.
import { h, toast } from './ui.js';
import * as store from './store.js';
import { buildItem, applyTimeBudget, estimateStrengthSec, availableEquip, usableExercise, seriesPadrao, tempoPadrao } from './workout.js';
import { repRangeFromObjetivo } from './progression.js';
import { metaExercicios } from './motivation.js';

// Variedade: "desgaste" de cada exercício e grupo nos últimos treinos. O último treino pesa 6,
// o anterior 5... até o 6º (peso 1). Quanto maior, menos o exercício/grupo é sugerido hoje.
const JANELA = 6;
export function usoRecente(ctx, hist) {
  const ex = new Map(), grupo = new Map();
  (hist || []).slice(-JANELA).reverse().forEach((s, i) => {
    const w = JANELA - i;
    for (const it of s.itens || []) {
      ex.set(it.exerciseId, (ex.get(it.exerciseId) || 0) + w);
      for (const g of (ctx.exercise(it.exerciseId) || {}).grupos || []) grupo.set(g, (grupo.get(g) || 0) + w);
    }
  });
  return { ex, grupo };
}

// Desempate estável no dia: o mesmo dia gera o mesmo treino, dias diferentes variam.
function sorteio(seed, id) {
  let x = 2166136261;
  for (const c of seed + id) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return ((x >>> 0) % 1000) / 1000;
}

export function metaDoDia(ctx) {
  const isCardio = (id) => ((ctx.exercise(id) || {}).grupos || []).includes('cardio');
  // Sem meta no perfil, o "Tempo livre" usa 4 exercícios por treino como referência.
  const perfil = ctx.perfil() || {};
  return metaExercicios(store.getHistory(ctx.userId), { ...perfil, exerciciosMinDia: perfil.exerciciosMinDia || 4 }, isCardio);
}

// Nível de experiência a partir do histórico (usado para escolher caminhada x corrida).
export function nivelUsuario(hist, perfil) {
  if (perfil && perfil.nivelCardio) return perfil.nivelCardio;
  const n = (hist || []).length;
  if (n < 12) return 'iniciante';
  if (n < 40) return 'intermediario';
  return 'avancado';
}

// Escolhe o exercício de cardio: iniciante caminha (baixo impacto), e só entra o boneco
// se a pessoa ligou essa opção (precisa de luvas).
export function escolherCardio(ctx, { nivel, perfil, cardioPool, hist = [], evitar = new Set(), uso = null }) {
  const pref = (perfil.cardio && perfil.cardio.preferencia) || [];
  // Boneco (Bob) ligado: entra de forma rotativa, a cada 2 treinos, para variar o cardio.
  if (perfil.dummi) {
    const bob = cardioPool.find((e) => (e.acessorios || []).includes('luvas'));
    if (bob && !evitar.has(bob.id) && hist.length >= 1) {
      const desde = [...hist].reverse().findIndex((s) => (s.itens || []).some((i) => i.exerciseId === bob.id));
      if (desde === -1 || desde >= 2) return bob;
    }
  }
  const pool = cardioPool.filter((e) => {
    if ((e.acessorios || []).length) return false;         // só entra pela regra acima
    if (evitar.has(e.id)) return false;
    if (nivel === 'iniciante' && (e.impacto === 'alto' || e.nivel === 'intermediario')) return false;
    return true;
  });
  const base = pool.length ? pool : cardioPool.filter((e) => !(e.acessorios || []).length);
  // prioridadeCardio (data/exercises.json) coloca a caminhada na frente para quem começa.
  const score = (e) => (e.prioridadeCardio || 0)
    + (e.nivel === 'iniciante' ? 2 : 0)
    + ((e.equipamento || []).some((x) => pref.includes(x)) ? 2 : 0)
    + (e.impacto === 'baixo' ? 1 : 0)
    - (uso ? (uso.ex.get(e.id) || 0) * 0.3 : 0); // feito há pouco: cede a vez a outro da mesma faixa
  return [...base].sort((a, b) => score(b) - score(a))[0] || null;
}

// "Incluir hoje": itens que o usuário pode marcar para ENTRAR no treino de qualquer jeito.
// cardio: true -> substitui o bloco de cardio automático.
export const EXTRAS = [
  { id: 'bob', label: '🥊 Boneco de golpes (artes marciais)', exerciseId: 'boxe-bob', cardio: true },
  { id: 'corrida', label: '🏃 Corrida na rua', exerciseId: 'corrida', cardio: true },
  { id: 'caminhada', label: '🚶 Caminhada', exerciseId: 'caminhada', cardio: true },
  { id: 'bike', label: '🚲 Bike', exerciseId: 'bike-cardio', cardio: true },
  { id: 'gaiola', label: '🏋️ Barra livre na gaiola', exerciseId: 'agachamento-barra' },
  { id: 'barra-fixa', label: '🤸 Barra fixa', exerciseId: 'barra-fixa' },
  { id: 'kettlebell', label: '🔔 Kettlebell', exerciseId: 'kettlebell-swing' },
  { id: 'trx', label: '🪢 TRX', exerciseId: 'remada-trx' },
  { id: 'abdominal', label: '🧘 Abdominal / core', grupos: ['abdômen', 'core'] },
];

// Extras que fazem sentido oferecer (equipamento disponível e exercício existente).
export function extrasDisponiveis(ctx) {
  const avail = availableEquip(ctx);
  return EXTRAS.filter((x) => {
    if (x.exerciseId) {
      const e = ctx.exercise(x.exerciseId);
      return !!e && usableExercise(e, avail);
    }
    return [...ctx.data.exercises.values()].some((e) => (e.grupos || []).some((g) => (x.grupos || []).includes(g)) && usableExercise(e, avail));
  });
}

function exercicioDoExtra(ctx, extra, taken, ordenar) {
  if (extra.exerciseId) return ctx.exercise(extra.exerciseId) || null;
  const avail = availableEquip(ctx);
  const cands = [...ctx.data.exercises.values()].filter((e) => (e.grupos || []).some((g) => (extra.grupos || []).includes(g))
    && usableExercise(e, avail) && !taken.has(e.id));
  return ordenar(cands)[0] || null;
}

// meta: nº de exercícios de musculação pedido (opção "meta da semana"); sem ela, vale o tempo.
function recommendDay(ctx, { tempoMin, modalidade, extras = [], meta = null }) {
  const avail = availableEquip(ctx);
  const perfil = ctx.perfil() || {};
  // evitarExercicios (data/perfis.json): exercícios que não entram na sugestão (ex.: por lesão).
  const evitarPerfil = new Set(perfil.evitarExercicios || []);
  const all = [...ctx.data.exercises.values()].filter((e) => usableExercise(e, avail) && !evitarPerfil.has(e.id));
  const isCardio = (e) => (e.grupos || []).includes('cardio');
  const strengthPool = all.filter((e) => !isCardio(e));
  const cardioPool = all.filter(isCardio);
  const foco = perfil.foco || [];

  // Variedade: quem foi feito há pouco (e com frequência) vai para o fim da fila.
  const hist = store.getHistory(ctx.userId);
  const uso = usoRecente(ctx, hist);
  const seed = new Date().toISOString().slice(0, 10) + ':' + hist.length;
  const custo = (e) => (uso.ex.get(e.id) || 0) + sorteio(seed, e.id) * 2;
  const ordenar = (cands) => [...cands].sort((a, b) => custo(a) - custo(b));

  const pick = (grupos, taken) => {
    const cands = strengthPool.filter((e) => (e.grupos || []).some((g) => grupos.includes(g)) && !taken.has(e.id));
    return ordenar(cands)[0] || null;
  };

  // Foco do perfil vira slots extras (ex.: braços → bíceps + tríceps; abdômen → core).
  const focoGrupos = [];
  for (const f of foco) {
    if (f === 'corpo todo') continue;
    if (f === 'braços') { focoGrupos.push(['bíceps'], ['tríceps']); }
    else if (f === 'abdômen') { focoGrupos.push(['abdômen', 'core']); }
    else focoGrupos.push([f]);
  }

  // Ordem dos grupos: compostos base + o 1º grupo de foco cedo (para caber mesmo em treinos curtos),
  // depois posterior, os demais focos, core e panturrilha.
  // Depois, os grupos menos treinados nos últimos treinos sobem na fila (a ordem acima é o
  // desempate). Panturrilha fica sempre por último.
  const ordemBase = [
    ['pernas', 'glúteos'], ['peito', 'ombros'], ['costas'],
    ...(focoGrupos[0] ? [focoGrupos[0]] : []),
    ['posterior', 'glúteos'],
    ...focoGrupos.slice(1),
    ['abdômen', 'core'],
  ];
  const cansaco = (gs) => gs.reduce((a, g) => a + (uso.grupo.get(g) || 0), 0) / gs.length;
  const slots = [
    ...ordemBase.map((gs, i) => ({ gs, i, c: cansaco(gs) })).sort((a, b) => a.c - b.c || a.i - b.i).map((x) => x.gs),
    ['panturrilha'],
  ];

  // Mínimo de exercícios de musculação por treino (perfil.exerciciosMinDia; sem ele, 3).
  const minEx = perfil.exerciciosMinDia || 3;
  const series = !meta && tempoMin <= 20 ? 2 : 3;
  const rmax = repRangeFromObjetivo(perfil.objetivo)[1]; // reps-alvo conforme o objetivo
  const reserveCardio = modalidade === 'musc_cardio' ? 8 : 0;
  const perExercicioMin = 8;
  const alvo = modalidade === 'so_cardio' ? 0
    : meta || Math.max(minEx, Math.min(slots.length, Math.floor((tempoMin - reserveCardio) / perExercicioMin)));
  // O abdominal fixo (sempreAbdominal) entra depois e conta no alvo.
  const nStrength = Math.max(0, alvo - (perfil.sempreAbdominal ? 1 : 0));

  const taken = new Set();
  const itens = [];
  const addEx = (e) => {
    taken.add(e.id);
    const timed = e.tipo === 'tempo';
    itens.push(buildItem(ctx, { exerciseId: e.id, series: seriesPadrao(e) === 1 ? 1 : series,
      repsAlvo: timed ? 1 : rmax, pesoAlvo: 0,
      descansoSeg: e.descansoPadraoSeg, porTempo: timed, tempoSeg: tempoPadrao(e) }));
  };

  // Extras marcados pelo usuário entram primeiro (garantidos no treino).
  const marcados = extras.map((id) => EXTRAS.find((x) => x.id === id)).filter(Boolean);
  const extrasCardio = marcados.filter((x) => x.cardio);
  for (const x of marcados.filter((e) => !e.cardio)) {
    const e = exercicioDoExtra(ctx, x, taken, ordenar);
    if (e && !taken.has(e.id)) addEx(e);
  }

  for (const groups of slots) {
    if (itens.length >= nStrength) break;
    const e = pick(groups, taken);
    if (e) addEx(e);
  }

  // Sempre incluir abdominal (opção do perfil), independente do tempo.
  if (modalidade !== 'so_cardio' && perfil.sempreAbdominal) {
    const temAbd = itens.some((it) => ((ctx.exercise(it.exerciseId) || {}).grupos || []).includes('abdômen'));
    if (!temAbd) {
      const abd = ordenar(strengthPool.filter((e) => (e.grupos || []).includes('abdômen') && !taken.has(e.id)));
      if (abd[0]) addEx(abd[0]);
    }
  }

  // Garante o alvo (mínimo do perfil ou a meta do dia): completa com o que estiver mais
  // "descansado", preferindo grupos que ainda não entraram hoje.
  const nMusc = () => itens.filter((it) => !it.cardio).length;
  if (alvo && nMusc() < alvo) {
    const gruposHoje = new Set(itens.flatMap((it) => (ctx.exercise(it.exerciseId) || {}).grupos || []));
    const resto = ordenar(strengthPool.filter((e) => !taken.has(e.id)))
      .sort((a, b) => ((a.grupos || []).some((g) => gruposHoje.has(g)) ? 1 : 0) - ((b.grupos || []).some((g) => gruposHoje.has(g)) ? 1 : 0));
    for (const e of resto) { if (nMusc() >= alvo) break; addEx(e); }
  }

  // Cardio: antes ou depois da musculação, conforme a preferência (padrão: depois).
  // Se o usuário marcou cardio em "incluir hoje", é ele que entra (no lugar do automático).
  if (modalidade !== 'so_musc') {
    const nivel = nivelUsuario(hist, perfil);
    const quando = perfil.cardioQuando || (perfil.cardio && perfil.cardio.quando) || 'fim';
    const escolhidos = [];
    if (extrasCardio.length) {
      for (const x of extrasCardio) {
        const e = ctx.exercise(x.exerciseId);
        if (e && !escolhidos.some((c) => c.id === e.id)) escolhidos.push(e);
      }
    } else if (cardioPool.length) {
      const cardio = escolherCardio(ctx, { nivel, perfil, cardioPool, hist, uso });
      if (cardio) escolhidos.push(cardio);
      // Só cardio e sobra tempo: sugere um segundo bloco diferente (variedade).
      if (cardio && modalidade === 'so_cardio' && tempoMin >= 40) {
        const outro = escolherCardio(ctx, { nivel, perfil, cardioPool, hist, uso, evitar: new Set([cardio.id]) });
        if (outro) escolhidos.push(outro);
      }
    }
    for (const e of escolhidos) {
      const bloco = buildItem(ctx, { exerciseId: e.id, series: 1, porTempo: true, tempoSeg: tempoPadrao(e), descansoSeg: e.descansoPadraoSeg || 0 });
      if (quando === 'inicio' && modalidade === 'musc_cardio') itens.splice(escolhidos.indexOf(e), 0, bloco);
      else itens.push(bloco);
    }
  }

  const nomeMod = modalidade === 'so_cardio' ? 'Cardio' : modalidade === 'so_musc' ? 'Musculação' : 'Musculação + Cardio';
  const session = { planId: 'sugerido', planNome: 'Treino do dia', dayIdx: 0, diaNome: nomeMod,
    iniciadoEm: Date.now(), tempoDisponivelMin: tempoMin, tempoEscolhido: true, itens };
  // Meta por número de exercícios: o tempo sai do treino (musculação estimada + 10 min de cardio).
  if (meta) {
    const min = estimateStrengthSec(session) / 60 + (itens.some((it) => it.cardio) ? 10 : 0);
    session.tempoDisponivelMin = Math.max(20, Math.ceil(min / 5) * 5);
    session.metaExercicios = meta;
    session.diaNome = `${nomeMod} · meta de ${meta} exercícios`;
  }
  applyTimeBudget(session);
  return session;
}

export function renderStart(view, ctx) {
  const perfil = ctx.perfil() || {};
  const metaSem = metaDoDia(ctx);
  // Quem definiu a meta no perfil e está atrasado já abre no "Tempo livre", que recupera o atraso.
  const state = { tempoMin: perfil.duracaoAlvoMin || 30, modalidade: 'musc_cardio', extras: [],
    meta: perfil.exerciciosMinDia && metaSem && metaSem.alvoHoje > metaSem.min ? metaSem.alvoHoje : null };
  const tempos = perfil.duracaoOpcoesMin || [20, 30, 45, 60];

  view.appendChild(h('h2', { text: 'Treino do dia' }));
  view.appendChild(h('p', { class: 'muted', text: 'Monto um treino sob medida com base no seu tempo, na modalidade e no seu histórico e objetivos.' }));

  // 1) Tempo
  const tempoChips = h('div', { class: 'time-chips' });
  let metaInfo = null;
  const drawTempo = () => {
    [...tempoChips.children].forEach((c) => c.classList.toggle('sel',
      c.dataset.meta ? !!state.meta : !state.meta && +c.dataset.m === state.tempoMin));
    if (metaInfo) metaInfo.hidden = !state.meta;
  };
  tempos.forEach((m) => tempoChips.appendChild(h('button', { class: 'chip big-chip', text: m + ' min', dataset: { m }, onClick: () => { state.tempoMin = m; state.meta = null; drawTempo(); } })));
  // "Tempo livre": o tempo não importa, o treino sai do ritmo da semana (perfil.exerciciosMinDia).
  if (metaSem) {
    const n = metaSem.alvoHoje;
    tempoChips.appendChild(h('button', { class: 'chip big-chip', text: `♾️ Tempo livre (${n} exerc.)`, dataset: { meta: '1' },
      onClick: () => { state.meta = n; if (state.modalidade === 'so_cardio') { state.modalidade = 'musc_cardio'; drawMod(); } drawTempo(); } }));
    const semana = `Semana: ${metaSem.feitos} de ${metaSem.metaSemana} exercícios (meta de ${metaSem.min} por treino, ${metaSem.freq}x/sem).`;
    const hoje = metaSem.atraso > metaSem.min
      ? ` Você está ${metaSem.atraso - metaSem.min} atrás do ritmo: hoje com ${n} você ${n >= metaSem.atraso ? 'zera o atraso' : 'recupera parte'}.`
      : ` Você está em dia: ${n} exercícios mantêm o ritmo.`;
    metaInfo = h('p', { class: 'muted tiny', text: 'Tempo livre: o treino segue o ritmo da sua semana, não o relógio. ' + semana + hoje });
  }
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'tiny label-accent', text: '1 · Quanto tempo você tem hoje?' }),
    tempoChips,
    metaInfo,
  ].filter(Boolean)));
  drawTempo();

  // 2) Modalidade
  const mods = [
    { id: 'musc_cardio', nome: 'Musculação + Cardio', desc: 'Força + um bloco de cardio (antes ou depois, como você escolheu em Config)' },
    { id: 'so_musc', nome: 'Só musculação', desc: 'Foco total em força/hipertrofia' },
    { id: 'so_cardio', nome: 'Só cardio', desc: 'Caminhada, bike ou corrida pelo tempo escolhido' },
  ];
  const modBox = h('div', { class: 'mod-list' });
  const drawMod = () => [...modBox.children].forEach((c) => c.classList.toggle('sel', c.dataset.id === state.modalidade));
  mods.forEach((m) => modBox.appendChild(h('button', { class: 'mod-item', dataset: { id: m.id }, onClick: () => {
    state.modalidade = m.id;
    if (m.id === 'so_cardio' && state.meta) { state.meta = null; drawTempo(); } // a meta conta musculação
    drawMod();
  } }, [
    h('strong', { text: m.nome }), h('div', { class: 'muted tiny', text: m.desc }),
  ])));
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'tiny label-accent', text: '2 · O que você quer treinar?' }),
    modBox,
  ]));
  drawMod();

  // 3) Incluir hoje (marque o que NÃO pode faltar)
  const extras = extrasDisponiveis(ctx);
  if (extras.length) {
    const lista = h('div', {});
    extras.forEach((x) => {
      const inp = h('input', { type: 'checkbox' });
      inp.addEventListener('change', () => {
        const i = state.extras.indexOf(x.id);
        if (inp.checked && i < 0) state.extras.push(x.id);
        if (!inp.checked && i >= 0) state.extras.splice(i, 1);
      });
      lista.appendChild(h('label', { class: 'row between center switch-row' }, [h('span', { text: x.label }), inp]));
    });
    view.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'tiny label-accent', text: '3 · Incluir hoje (opcional)' }),
      h('p', { class: 'muted tiny', text: 'O que você marcar entra no treino de qualquer forma. Marcar um cardio substitui a sugestão automática.' }),
      lista,
    ]));
  }

  view.appendChild(h('div', { class: 'workout-footer' }, [
    h('button', { class: 'btn primary block big', text: '⚡ Gerar treino do dia', onClick: () => {
      const session = recommendDay(ctx, state);
      if (!session.itens.length) { toast('Não consegui montar um treino com o que está disponível.'); return; }
      store.setCurrent(ctx.userId, session);
      ctx.navigate('#/workout/sugerido/0');
    } }),
  ]));
}

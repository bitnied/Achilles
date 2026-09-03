// recommend.js — "Treino do dia": pergunta tempo + modalidade e sugere um treino
// considerando o histórico (variedade/recuperação) e o objetivo/foco de cada pessoa.
import { h, toast } from './ui.js';
import * as store from './store.js';
import { buildItem, applyTimeBudget, availableEquip, usableExercise } from './workout.js';
import { repRangeFromObjetivo } from './progression.js';

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
export function escolherCardio(ctx, { nivel, perfil, cardioPool, hist = [], evitar = new Set() }) {
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
    + (e.impacto === 'baixo' ? 1 : 0);
  return [...base].sort((a, b) => score(b) - score(a))[0] || null;
}

function recommendDay(ctx, { tempoMin, modalidade }) {
  const avail = availableEquip(ctx);
  const all = [...ctx.data.exercises.values()].filter((e) => usableExercise(e, avail));
  const isCardio = (e) => (e.grupos || []).includes('cardio');
  const strengthPool = all.filter((e) => !isCardio(e));
  const cardioPool = all.filter(isCardio);
  const perfil = ctx.perfil() || {};
  const foco = perfil.foco || [];

  // Recência: evita repetir os exercícios do último treino (favorece variedade).
  const hist = store.getHistory(ctx.userId);
  const last = hist[hist.length - 1];
  const usados = new Set(((last && last.itens) || []).map((it) => it.exerciseId));

  const pick = (grupos, taken) => {
    const cands = strengthPool.filter((e) => (e.grupos || []).some((g) => grupos.includes(g)) && !taken.has(e.id));
    if (!cands.length) return null;
    cands.sort((a, b) => (usados.has(a.id) ? 1 : 0) - (usados.has(b.id) ? 1 : 0)); // prioriza não-usados
    return cands[0];
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
  const slots = [
    ['pernas', 'glúteos'], ['peito', 'ombros'], ['costas'],
    ...(focoGrupos[0] ? [focoGrupos[0]] : []),
    ['posterior', 'glúteos'],
    ...focoGrupos.slice(1),
    ['abdômen', 'core'], ['panturrilha'],
  ];

  const series = tempoMin <= 20 ? 2 : 3;
  const rmax = repRangeFromObjetivo(perfil.objetivo)[1]; // reps-alvo conforme o objetivo
  const reserveCardio = modalidade === 'musc_cardio' ? 8 : 0;
  const perExercicioMin = 8;
  const nStrength = modalidade === 'so_cardio' ? 0
    : Math.max(3, Math.min(slots.length, Math.floor((tempoMin - reserveCardio) / perExercicioMin)));

  const taken = new Set();
  const itens = [];
  const addEx = (e) => {
    taken.add(e.id);
    const timed = e.tipo === 'tempo';
    itens.push(buildItem(ctx, { exerciseId: e.id, series, repsAlvo: timed ? 1 : rmax, pesoAlvo: 0,
      descansoSeg: e.descansoPadraoSeg, porTempo: timed, tempoSeg: e.tempoPadraoSeg }));
  };
  for (const groups of slots) {
    if (itens.length >= nStrength) break;
    const e = pick(groups, taken);
    if (e) addEx(e);
  }

  // Sempre incluir abdominal (opção do perfil), independente do tempo.
  if (modalidade !== 'so_cardio' && perfil.sempreAbdominal) {
    const temAbd = itens.some((it) => ((ctx.exercise(it.exerciseId) || {}).grupos || []).includes('abdômen'));
    if (!temAbd) {
      const abd = strengthPool.filter((e) => (e.grupos || []).includes('abdômen') && !taken.has(e.id));
      abd.sort((a, b) => (usados.has(a.id) ? 1 : 0) - (usados.has(b.id) ? 1 : 0));
      if (abd[0]) addEx(abd[0]);
    }
  }

  // Cardio: antes ou depois da musculação, conforme a preferência (padrão: depois).
  if (modalidade !== 'so_musc' && cardioPool.length) {
    const nivel = nivelUsuario(hist, perfil);
    const cardio = escolherCardio(ctx, { nivel, perfil, cardioPool, hist });
    if (cardio) {
      const bloco = buildItem(ctx, { exerciseId: cardio.id, series: 1, porTempo: true, tempoSeg: 600, descansoSeg: 0 });
      const quando = perfil.cardioQuando || (perfil.cardio && perfil.cardio.quando) || 'fim';
      if (quando === 'inicio' && modalidade === 'musc_cardio') itens.unshift(bloco);
      else itens.push(bloco);
      // Só cardio e sobra tempo: sugere um segundo bloco diferente (variedade).
      if (modalidade === 'so_cardio' && tempoMin >= 40) {
        const outro = escolherCardio(ctx, { nivel, perfil, cardioPool, hist, evitar: new Set([cardio.id]) });
        if (outro) itens.push(buildItem(ctx, { exerciseId: outro.id, series: 1, porTempo: true, tempoSeg: 600, descansoSeg: 0 }));
      }
    }
  }

  const nomeMod = modalidade === 'so_cardio' ? 'Cardio' : modalidade === 'so_musc' ? 'Musculação' : 'Musculação + Cardio';
  const session = { planId: 'sugerido', planNome: 'Treino do dia', dayIdx: 0, diaNome: nomeMod,
    iniciadoEm: Date.now(), tempoDisponivelMin: tempoMin, itens };
  applyTimeBudget(session);
  return session;
}

export function renderStart(view, ctx) {
  const perfil = ctx.perfil() || {};
  const state = { tempoMin: perfil.duracaoAlvoMin || 30, modalidade: 'musc_cardio' };
  const tempos = perfil.duracaoOpcoesMin || [20, 30, 45, 60];

  view.appendChild(h('h2', { text: 'Treino do dia' }));
  view.appendChild(h('p', { class: 'muted', text: 'Monto um treino sob medida com base no seu tempo, na modalidade e no seu histórico e objetivos.' }));

  // 1) Tempo
  const tempoChips = h('div', { class: 'time-chips' });
  const drawTempo = () => { [...tempoChips.children].forEach((c) => c.classList.toggle('sel', +c.dataset.m === state.tempoMin)); };
  tempos.forEach((m) => tempoChips.appendChild(h('button', { class: 'chip big-chip', text: m + ' min', dataset: { m }, onClick: () => { state.tempoMin = m; drawTempo(); } })));
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'tiny label-accent', text: '1 · Quanto tempo você tem hoje?' }),
    tempoChips,
  ]));
  drawTempo();

  // 2) Modalidade
  const mods = [
    { id: 'musc_cardio', nome: 'Musculação + Cardio', desc: 'Força + um bloco de cardio (antes ou depois, como você escolheu em Config)' },
    { id: 'so_musc', nome: 'Só musculação', desc: 'Foco total em força/hipertrofia' },
    { id: 'so_cardio', nome: 'Só cardio', desc: 'Caminhada, bike ou corrida pelo tempo escolhido' },
  ];
  const modBox = h('div', { class: 'mod-list' });
  const drawMod = () => [...modBox.children].forEach((c) => c.classList.toggle('sel', c.dataset.id === state.modalidade));
  mods.forEach((m) => modBox.appendChild(h('button', { class: 'mod-item', dataset: { id: m.id }, onClick: () => { state.modalidade = m.id; drawMod(); } }, [
    h('strong', { text: m.nome }), h('div', { class: 'muted tiny', text: m.desc }),
  ])));
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'tiny label-accent', text: '2 · O que você quer treinar?' }),
    modBox,
  ]));
  drawMod();

  view.appendChild(h('div', { class: 'workout-footer' }, [
    h('button', { class: 'btn primary block big', text: '⚡ Gerar treino do dia', onClick: () => {
      const session = recommendDay(ctx, state);
      if (!session.itens.length) { toast('Não consegui montar um treino com o que está disponível.'); return; }
      store.setCurrent(ctx.userId, session);
      ctx.navigate('#/workout/sugerido/0');
    } }),
  ]));
}

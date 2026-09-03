// progression.js — sugestão de carga/reps (dupla progressão), sensível ao objetivo de cada pessoa,
// ao histórico (confirma o aumento após sessões boas) e ao ponto de partida.
// A primeira vez agora sai em KG (estimativa por peso corporal + exercício), com piso e teto
// de segurança vindos de data/exercises.json (campo cargaInicial).
import { idadeDe } from './hr.js';

const RANK = { 'Fácil': 1, 'Médio': 2, 'Difícil': 3, 'Falhou': 4 };

const roundToInc = (v, inc) => {
  if (!inc || inc <= 0) return Math.round(v * 2) / 2;
  return Math.round(v / inc) * inc;
};

// Faixa de repetições conforme o objetivo da pessoa.
export function repRangeFromObjetivo(objetivo) {
  const s = (objetivo || '').toLowerCase();
  if (/for[çc]a/.test(s)) return [5, 8];
  if (/massa|t[ôo]nus|hipertrof/.test(s)) return [8, 12];
  if (/defin|firm/.test(s)) return [10, 15];
  if (/condicion|resist/.test(s)) return [12, 20];
  return [10, 15]; // saúde / padrão
}

const SUPERIOR = ['peito', 'ombros', 'bíceps', 'tríceps', 'costas'];

// Estimativa de carga para a PRIMEIRA vez (ou quando não há histórico).
// Conservadora de propósito: é melhor começar leve e subir na sessão seguinte.
export function cargaInicial(exercise, perfil) {
  const ci = exercise && exercise.cargaInicial;
  if (!ci || !ci.fator) return null;
  const pc = +(perfil && perfil.pesoAtual) || 0;
  const fem = /^f/i.test((perfil && perfil.sexo) || '');
  const superior = (exercise.grupos || []).some((g) => SUPERIOR.includes(g));
  const fSexo = fem ? (superior ? 0.62 : 0.78) : 1;
  const idade = idadeDe(perfil || {});
  const fIdade = idade && idade >= 55 ? 0.9 : 1;
  const inc = exercise.incrementoKg || 2;
  let kg = (pc || 72) * ci.fator * fSexo * fIdade;
  kg = Math.round(kg / inc) * inc;
  kg = Math.max(ci.min || inc, Math.min(ci.max || 999, kg));
  const un = ci.unidade || 'total';
  let texto;
  if (un === 'halter') texto = `comece com ~${kg} kg em CADA halter`;
  else if (un === 'maquina') texto = `comece com ~${kg} kg na pilha de peso`;
  else if (un === 'barra') texto = kg <= 20 ? 'comece com a barra vazia (~20 kg)'
    : `comece com ~${kg} kg no total (barra de 20 kg + ${kg - 20} kg de anilhas)`;
  else texto = `comece com ~${kg} kg`;
  if (!pc) texto += ' (informe seu peso no Perfil para eu calibrar melhor)';
  return { kg, unidade: un, texto, min: ci.min, max: ci.max };
}

const ehCardio = (ex) => !!ex && (ex.grupos || []).includes('cardio');
const fmtSeg = (t) => (t >= 120 ? `${Math.round(t / 60)} min` : `${t}s`);

const feitasDe = (entry) => ((entry && entry.item && entry.item.series) || []).filter((s) => s.feito);
const piorEsforco = (fs) => Math.max(...fs.map((s) => RANK[s.esforco] || 2));

// exercise: objeto da biblioteca. entries: array (mais recente primeiro) de { item, data }.
// opts.repRange OU opts.objetivo. Também aceita uma única entry (compat).
export function suggestNext(exercise, entries, opts = {}) {
  entries = Array.isArray(entries) ? entries.filter(Boolean) : (entries ? [entries] : []);
  const [rmin, rmax] = opts.repRange || repRangeFromObjetivo(opts.objetivo);
  const inc = exercise && exercise.incrementoKg != null ? exercise.incrementoKg : 2;
  const tipo = (exercise && exercise.tipo) || 'reps';

  // ---- Sem histórico: começa leve, com reps guiadas pelo objetivo ----
  if (!entries.length || !entries[0].item) {
    if (tipo === 'tempo') {
      const t = (exercise && exercise.tempoPadraoSeg) || 30;
      if (ehCardio(exercise)) {
        return { tipo: 'novo', tempoSugerido: t,
          texto: `Comece com ${Math.round(t / 60)} min em ritmo confortável e use a faixa de batimentos para dosar: `
               + 'se estiver abaixo, acelera; se passar, alivia. Aumente 2-5 min por semana.' };
      }
      return { tipo: 'novo', tempoSugerido: t, texto: `Primeira vez: segure ${fmtSeg(t)} com boa forma (ou o tempo que conseguir) e aumente aos poucos.` };
    }
    if (inc === 0) {
      return { tipo: 'novo', repsSugerido: rmax, texto: `Primeira vez: faça ${rmin}-${rmax} repetições com boa forma. Se ficar fácil, aumente as reps ou a dificuldade.` };
    }
    const ci = cargaInicial(exercise, opts.perfil);
    if (ci) {
      return { tipo: 'novo', repsSugerido: rmax, pesoSugerido: ci.kg, cargaInicial: ci,
        texto: `Primeira vez: ${ci.texto}. Meta de ${rmin}-${rmax} reps com boa forma, sobrando 1-2 no fim. `
             + `Se as ${rmax} saírem fáceis, sobe ${inc} kg na próxima.` };
    }
    return { tipo: 'novo', repsSugerido: rmax, texto: `Primeira vez: comece leve: um peso que você faça ${rmin}-${rmax} reps com boa forma e ainda sobrando 1-2. Ajuste nas próximas séries.` };
  }

  const fs = feitasDe(entries[0]);
  if (!fs.length) return { tipo: 'novo', texto: 'Sem registros concluídos ainda.' };
  const worst = piorEsforco(fs);

  // ---- Tempo: cardio (minutos) e isometria (segundos) ----
  if (tipo === 'tempo') {
    const maxT = Math.max(...fs.map((s) => +s.tempoSeg || 0));
    if (ehCardio(exercise)) {
      const mais = Math.min(maxT + 180, 3600);
      if (worst <= 2 && maxT > 0) return { tipo: 'tempo', tempoSugerido: mais, ultimo: maxT,
        texto: `Última vez: ${fmtSeg(maxT)}. Tente ${fmtSeg(mais)} hoje mantendo os batimentos na faixa.` };
      return { tipo: 'tempo', tempoSugerido: maxT, ultimo: maxT,
        texto: `Repita ${fmtSeg(maxT)} no mesmo ritmo. Quando ficar tranquilo, a gente aumenta o tempo ou a intensidade.` };
    }
    if (worst <= 2 && maxT > 0) return { tipo: 'tempo', tempoSugerido: maxT + 10, ultimo: maxT, texto: `Segurou ${maxT}s com controle: tente ${maxT + 10}s.` };
    return { tipo: 'tempo', tempoSugerido: maxT, ultimo: maxT, texto: `Mantenha ${maxT}s e melhore a firmeza antes de aumentar o tempo.` };
  }

  const base = Math.max(...fs.map((s) => +s.peso || 0));
  const reps = Math.min(...fs.map((s) => +s.reps || 0)); // pior série
  const alvo = Math.max(...fs.map((s) => +s.repsAlvo || 0)) || rmax;
  const bateuTopo = reps >= rmax;
  const bateuAlvo = reps >= Math.min(alvo, rmax);

  // ---- Peso corporal / sem carga: progride em repetições ----
  if (inc === 0 || base === 0) {
    if (bateuTopo && worst <= 2) return { tipo: 'reps', texto: `Fechou ${reps} reps com folga: aumente a dificuldade (mais reps, pausa maior ou versão mais difícil).` };
    if (bateuAlvo) return { tipo: 'reps', texto: 'Bom! Some 1-2 repetições por série na próxima.' };
    return { tipo: 'reps', texto: 'Mantenha as repetições e capriche na execução.' };
  }

  // ---- Com carga: dupla progressão, confirmando o aumento em ~2 sessões boas ----
  const segundaBoa = (() => {
    const f2 = feitasDe(entries[1]);
    if (!f2.length) return false;
    const w2 = piorEsforco(f2);
    const r2 = Math.min(...f2.map((s) => +s.reps || 0));
    const b2 = Math.max(...f2.map((s) => +s.peso || 0));
    return b2 >= base && r2 >= rmax && w2 <= 2;
  })();
  const novo = roundToInc(base + inc, inc);

  if (bateuTopo && (worst === 1 || segundaBoa)) {
    return { tipo: 'peso', pesoSugerido: novo, ultimo: base, repsSugerido: rmin,
      texto: `Fechou ${reps} reps a ${base}kg${worst === 1 ? ' com folga' : ' (2 sessões boas)'} → suba para ${novo}kg e volte para ~${rmin} reps.` };
  }
  if (bateuTopo) {
    return { tipo: 'peso', pesoSugerido: base, ultimo: base, repsSugerido: rmax,
      texto: `Chegou a ${rmax} reps a ${base}kg. Repita esse peso; se vier fácil de novo, subimos para ${novo}kg.` };
  }
  if (bateuAlvo && worst <= 2) {
    const meta = Math.min(reps + 1, rmax);
    return { tipo: 'peso', pesoSugerido: base, ultimo: base, repsSugerido: meta,
      texto: `Boa! Mantenha ${base}kg e busque ${meta} reps (meta: ${rmax}).` };
  }
  if (worst >= 4) {
    return { tipo: 'peso', pesoSugerido: base, ultimo: base, texto: `Falhou em alguma série: repita ${base}kg para consolidar antes de subir.` };
  }
  return { tipo: 'peso', pesoSugerido: base, ultimo: base, texto: `Mantenha ${base}kg e complete todas as repetições (meta: ${rmax}).` };
}

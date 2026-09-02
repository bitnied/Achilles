// progression.js — sugestão de sobrecarga progressiva (transparente e editável).
// Regra inspirada no Fitbod: bateu as reps alvo com folga → sobe a carga;
// bateu no limite → mantém e tenta +1 rep; falhou → mantém/reduz para consolidar.

const RANK = { 'Fácil': 1, 'Médio': 2, 'Difícil': 3, 'Falhou': 4 };

const roundToInc = (v, inc) => {
  if (!inc || inc <= 0) return Math.round(v * 2) / 2; // 0,5 em 0,5
  return Math.round(v / inc) * inc;
};

// exercise: objeto da biblioteca. lastEntry: { item, data } de store.getLastEntryForExercise.
export function suggestNext(exercise, lastEntry) {
  if (!lastEntry || !lastEntry.item) {
    return { tipo: 'novo', texto: 'Primeira vez neste exercício — comece com uma carga confortável e foque na execução.' };
  }
  const feitas = (lastEntry.item.series || []).filter((s) => s.feito);
  if (!feitas.length) return { tipo: 'novo', texto: 'Sem registros concluídos ainda.' };

  const worst = Math.max(...feitas.map((s) => RANK[s.esforco] || 2));
  const inc = exercise?.incrementoKg ?? 2;
  const tipo = exercise?.tipo || 'reps';

  // Exercícios por tempo (prancha, ponte): progressão em segundos.
  if (tipo === 'tempo') {
    const maxTempo = Math.max(...feitas.map((s) => +s.tempoSeg || 0));
    if (worst <= 2 && maxTempo > 0) {
      const novo = maxTempo + 10;
      return { tipo: 'tempo', tempoSugerido: novo, ultimo: maxTempo,
        texto: `Segurou ${maxTempo}s com controle — tente ${novo}s desta vez.` };
    }
    return { tipo: 'tempo', tempoSugerido: maxTempo, ultimo: maxTempo,
      texto: `Mantenha ${maxTempo}s e melhore a firmeza antes de aumentar o tempo.` };
  }

  const base = Math.max(...feitas.map((s) => +s.peso || 0));
  const alvo = Math.max(...feitas.map((s) => +s.repsAlvo || 0)) || null;
  const bateuAlvo = alvo ? feitas.every((s) => (+s.reps || 0) >= alvo) : worst <= 2;

  // Exercícios de peso corporal (sem carga): progride em repetições.
  if (inc === 0 || base === 0) {
    if (bateuAlvo && worst <= 2) {
      return { tipo: 'reps', texto: `Mandou bem! Tente +2 repetições por série${alvo ? ` (alvo anterior: ${alvo})` : ''}.` };
    }
    return { tipo: 'reps', texto: 'Mantenha as repetições e capriche na execução antes de aumentar.' };
  }

  // Exercícios com carga.
  if (bateuAlvo && worst <= 2) {
    const novo = roundToInc(base + inc, inc);
    return { tipo: 'peso', pesoSugerido: novo, ultimo: base,
      texto: `Completou as ${alvo || ''} reps com folga a ${base} kg → suba para ${novo} kg.` };
  }
  if (bateuAlvo && worst === 3) {
    return { tipo: 'peso', pesoSugerido: base, ultimo: base,
      texto: `Bateu o alvo, mas foi difícil — mantenha ${base} kg e tente +1 rep antes de subir.` };
  }
  if (worst >= 4) {
    return { tipo: 'peso', pesoSugerido: base, ultimo: base,
      texto: `Falhou em alguma série — repita ${base} kg para consolidar antes de aumentar.` };
  }
  return { tipo: 'peso', pesoSugerido: base, ultimo: base,
    texto: `Faltou fechar o alvo — mantenha ${base} kg e busque completar todas as repetições.` };
}

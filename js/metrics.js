// metrics.js — estimativas didáticas: calorias do treino e leitura do volume levantado.
// Calorias por METs (kcal/min = MET × 3,5 × peso(kg) / 200). É ESTIMATIVA: o Apple Watch,
// que usa seus batimentos reais, é mais preciso — aqui serve para dar noção de grandeza.

const MET_FORCA = 5.0;            // musculação com esforço moderado/vigoroso
const MET_CARDIO = { leve: 3.5, moderado: 5.5, vigoroso: 8.5, intervalado: 7.0 };
const PESO_PADRAO = 72;

export function metDoItem(item, ex) {
  if (item.cardio || (ex && (ex.grupos || []).includes('cardio'))) {
    const z = (ex && ex.fcZona) || 'moderado';
    return MET_CARDIO[z] || MET_CARDIO.moderado;
  }
  return MET_FORCA;
}

// Segundos "ativos + descanso" de um item (estimativa, não usa cronômetro).
export function segundosDoItem(item) {
  const feitas = item.series.filter((s) => s.feito !== false);
  if (item.timed) return feitas.reduce((a, s) => a + (+s.tempoSeg || 0), 0);
  return feitas.length * (40 + Math.min(item.descansoSeg || 60, 120));
}

export function caloriasSessao(itens, pesoKg, exerciseOf = () => null) {
  const peso = +pesoKg > 0 ? +pesoKg : PESO_PADRAO;
  let kcal = 0;
  for (const it of itens || []) {
    const feitas = (it.series || []).filter((s) => s.feito);
    if (!feitas.length) continue;
    const item = { ...it, series: feitas };
    const min = segundosDoItem(item) / 60;
    kcal += metDoItem(item, exerciseOf(it.exerciseId)) * 3.5 * peso / 200 * min;
  }
  return Math.round(kcal);
}

// Volume (kg × reps) de uma lista de sessões.
export function volumeDe(sessoes) {
  let v = 0;
  for (const s of sessoes || []) {
    for (const it of s.itens || []) {
      for (const set of it.series || []) if (set.feito) v += (+set.peso || 0) * (+set.reps || 0);
    }
  }
  return Math.round(v);
}

// Leitura didática do volume: "o mesmo que levantar você mesmo 12 vezes".
export function volumeDidatico(kg, pesoCorporal) {
  if (!kg) return null;
  const peso = +pesoCorporal > 0 ? +pesoCorporal : 0;
  if (peso) {
    const vezes = kg / peso;
    if (vezes >= 1) return `equivale a erguer você mesmo ${vezes.toFixed(vezes < 10 ? 1 : 0)}×`;
  }
  const refs = [
    [1200, 'um carro popular'], [500, 'uma moto grande'], [180, 'uma geladeira'],
    [80, 'um saco de cimento (×2)'], [20, 'um galão de água'],
  ];
  for (const [v, nome] of refs) {
    if (kg >= v) return `≈ ${(kg / v).toFixed(kg / v < 10 ? 1 : 0)}× ${nome}`;
  }
  return null;
}

export const fmtKcal = (k) => `${k.toLocaleString('pt-BR')} kcal`;

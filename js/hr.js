// hr.js — frequência cardíaca (FC): faixas-alvo por exercício e por pessoa.
// Base: FCmáx estimada por Tanaka (208 − 0,7 × idade), faixas do ACSM em %FCmáx,
// e método de Karvonen (%FC de reserva) quando a pessoa informa a FC de repouso
// (o Apple Watch mostra isso). Nada aqui é diagnóstico: é orientação de intensidade.
//
// IMPORTANTE (segurança): quem usa medicação que mexe nos batimentos (vários remédios de
// pressão, como os betabloqueadores) pode ter a FCmáx BEM menor que a estimada. Nesse caso
// a intensidade é guiada pela percepção/teste da fala e a faixa aparece só como referência.

export const ZONAS = {
  leve:        { nome: 'Leve',            pctMax: [0.50, 0.63], pctHRR: [0.30, 0.40], fala: 'dá para conversar tranquilo' },
  moderado:    { nome: 'Moderado',        pctMax: [0.64, 0.76], pctHRR: [0.40, 0.59], fala: 'dá para falar frases curtas' },
  vigoroso:    { nome: 'Vigoroso',        pctMax: [0.77, 0.90], pctHRR: [0.60, 0.79], fala: 'só palavras soltas' },
  intervalado: { nome: 'Intervalado',     pctMax: [0.64, 0.88], pctHRR: [0.40, 0.75], fala: 'alterna forte e leve' },
};

export function idadeDe(perfil) {
  const nasc = perfil && perfil.nascimento;
  if (!nasc) return null;
  const d = new Date(nasc + 'T12:00:00');
  if (isNaN(d)) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a > 0 && a < 110 ? a : null;
}

export const fcMaxEstimada = (idade) => Math.round(208 - 0.7 * idade);

// Faixa-alvo em bpm para uma zona. Retorna null se não houver idade no perfil.
export function faixaFC(perfil, zonaId = 'moderado') {
  const z = ZONAS[zonaId] || ZONAS.moderado;
  const idade = idadeDe(perfil);
  if (!idade) return null;
  const fcMax = fcMaxEstimada(idade);
  const rep = +(perfil && perfil.fcRepouso) || 0;
  let min, max, metodo;
  if (rep > 30 && rep < 110) {
    min = Math.round(rep + (fcMax - rep) * z.pctHRR[0]);
    max = Math.round(rep + (fcMax - rep) * z.pctHRR[1]);
    metodo = 'FC de reserva (Karvonen)';
  } else {
    min = Math.round(fcMax * z.pctMax[0]);
    max = Math.round(fcMax * z.pctMax[1]);
    metodo = '%FC máxima estimada';
  }
  const cautela = !!(perfil && perfil.fcMedicacao);
  if (cautela) { // medicação que altera a FC: puxa a faixa para baixo e prioriza percepção
    min = Math.round(min * 0.88);
    max = Math.round(max * 0.88);
  }
  return { min, max, fcMax, zona: z.nome, zonaId, fala: z.fala, metodo, cautela, idade };
}

// Zona sugerida para um exercício (usa ex.fcZona; padrão: moderado no cardio).
export function zonaDoExercicio(ex) {
  if (!ex) return null;
  if (ex.fcZona) return ex.fcZona;
  return (ex.grupos || []).includes('cardio') ? 'moderado' : null;
}

// Texto curto para mostrar no card do exercício.
export function textoFaixa(f) {
  if (!f) return '';
  return `${f.min}–${f.max} bpm`;
}

// Explicação completa (modal de instruções).
export function explicacaoFC(f, perfil) {
  if (!f) {
    return ['Preencha sua data de nascimento no Perfil para eu calcular a faixa de batimentos ideal.'];
  }
  const out = [
    `Faixa-alvo (${f.zona.toLowerCase()}): ${f.min}–${f.max} bpm — acompanhe no Apple Watch durante o exercício.`,
    `Se estiver ABAIXO de ${f.min}, acelere um pouco; se passar de ${f.max}, diminua até voltar para a faixa.`,
    `Teste da fala (funciona sem relógio): nesse ritmo ${f.fala}.`,
    `Cálculo: ${f.metodo} (FCmáx estimada ≈ ${f.fcMax} bpm para ${f.idade} anos).`,
  ];
  if (f.cautela) {
    out.push('⚠️ Você marcou uso de medicação que pode alterar os batimentos (ex.: remédio de pressão). '
      + 'A FCmáx estimada pode não valer para você: use a faixa apenas como referência, guie-se pela '
      + 'percepção de esforço e confirme os limites com seu médico.');
  }
  out.push('Pare e procure ajuda se sentir dor no peito, falta de ar desproporcional, tontura ou palpitação.');
  return out;
}

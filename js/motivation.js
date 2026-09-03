// motivation.js — frases, streak (constância) e resumo de volume semanal.

// Dicas práticas com embasamento (fisiologia do exercício, saúde e psicologia do hábito).
// Objetivo: orientar, não só inspirar. Não substituem avaliação profissional.
const DICAS = [
  'Descanse ~48h antes de treinar o mesmo músculo: a síntese proteica fica elevada por 24-48h após o estímulo.',
  'Em exercícios compostos, descanse 2-3 min entre séries — preserva força e volume melhor que 60s.',
  'Leve as séries a 1-3 repetições da falha (RIR 1-3): forte estímulo com menos risco de lesão.',
  'Distribua proteína pelo dia (~1,6-2,2 g/kg): é o principal nutriente para construir músculo.',
  'Durma 7-9h. Boa parte da recuperação e da liberação de GH acontece no sono profundo.',
  'Aqueça 5-10 min antes: eleva a temperatura muscular e reduz o risco de lesão.',
  'Use amplitude completa: gera mais hipertrofia que meio movimento com carga alta.',
  'Progrida aos poucos (~2,5-5% por vez). Sobrecarga progressiva é o motor do ganho.',
  'Controle a descida (2-3s): a fase excêntrica é ótima para força e hipertrofia.',
  'Hidrate-se: perder ~2% de água já reduz força e desempenho.',
  'Constância vence intensidade: 3 treinos médios por semana rendem mais que 1 treino perfeito.',
  'Regra dos 2 dias: evite faltar dois treinos seguidos — protege o hábito (psicologia do comportamento).',
  'Defina "quando e onde" vai treinar (intenção de implementação): aumenta muito a adesão.',
  'Expire na força (subida) e inspire na descida; evite prender o ar em cargas pesadas.',
  'Dor muscular 24-72h (DOMS) é normal. Dor articular aguda não é — pare e ajuste.',
  'Cardio leve regular melhora a saúde do coração e ajuda a recuperar entre treinos de força.',
  'Após treinar, uma refeição com proteína + carboidrato ajuda a repor energia e reconstruir músculo.',
  'Registrar os treinos e ver a evolução é um dos maiores motivadores comprovados.',
  'Foque no processo (aparecer e executar bem), não só no resultado: reduz desânimo e frustração.',
  'Mantenha a coluna neutra e o core firme em agachamento e terra para proteger a lombar.',
  'No cardio, guie a intensidade pelos batimentos do Apple Watch: dentro da faixa-alvo você treina o coração com segurança.',
  'Iniciante: caminhada rápida ou inclinada dá quase o mesmo benefício cardiovascular da corrida, com muito menos impacto.',
  'Inicie a atividade no Apple Watch antes do treino: o tempo e as calorias reais ficam lá; aqui ficam as cargas e a evolução.',
  'Entre as séries, espere os batimentos caírem um pouco antes da próxima: a força volta melhor.',
  'Se estiver em dúvida se pode aumentar a carga, aumente as repetições primeiro — a dupla progressão é mais segura.',
  'Musculação antes, cardio depois: começar pelo cardio pesado tira força do treino de musculação.',
];

export function dicaDoDia() {
  const dia = Math.floor(Date.now() / 86400000); // muda a cada dia
  return DICAS[dia % DICAS.length];
}
export const fraseDoDia = dicaDoDia; // compat

// datas de treino (strings ISO YYYY-MM-DD) → nº de semanas/dias de constância.
function toDate(iso) { return new Date((iso || '').slice(0, 10) + 'T12:00:00'); }

// Streak = dias consecutivos com treino OU dias distintos nesta semana. Aqui: sequência de dias
// de calendário com pelo menos um treino, contando para trás a partir de hoje/ontem.
export function computeStreak(history) {
  const dias = new Set((history || []).map((s) => (s.data || '').slice(0, 10)));
  if (!dias.size) return 0;
  let streak = 0;
  const d = new Date(); d.setHours(12, 0, 0, 0);
  // tolera não ter treinado hoje ainda: começa checando hoje; se não houver, começa de ontem.
  const iso = (x) => x.toISOString().slice(0, 10);
  if (!dias.has(iso(d))) d.setDate(d.getDate() - 1);
  while (dias.has(iso(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

export function treinosNaSemana(history) {
  const agora = new Date();
  const inicio = new Date(agora); inicio.setDate(agora.getDate() - ((agora.getDay() + 6) % 7)); // segunda
  inicio.setHours(0, 0, 0, 0);
  const dias = new Set();
  for (const s of history || []) {
    const d = toDate(s.data);
    if (d >= inicio) dias.add((s.data || '').slice(0, 10));
  }
  return dias.size;
}

// Sessões da semana corrente (segunda a domingo).
export function sessoesDaSemana(history) {
  const agora = new Date();
  const inicio = new Date(agora); inicio.setDate(agora.getDate() - ((agora.getDay() + 6) % 7));
  inicio.setHours(0, 0, 0, 0);
  return (history || []).filter((s) => toDate(s.data) >= inicio);
}

export function volumeSemanal(history) {
  let vol = 0;
  for (const s of sessoesDaSemana(history)) {
    for (const it of s.itens || []) {
      for (const set of it.series || []) {
        if (set.feito) vol += (+set.peso || 0) * (+set.reps || 0);
      }
    }
  }
  return Math.round(vol);
}

export function totalTreinos(history) { return (history || []).length; }

// Mensagem de parabéns ao terminar um treino, variando conforme a constância.
export function mensagemFinal(history) {
  const streak = computeStreak(history);
  const semana = treinosNaSemana(history);
  if (streak >= 3) return `🔥 ${streak} dias seguidos! Você está pegando o ritmo.`;
  if (semana >= 3) return `👏 ${semana}º treino da semana. Consistência de campeão!`;
  return 'Treino concluído! Mais um degrau na sua evolução. 💪';
}

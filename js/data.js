// data.js — carrega os arquivos JSON de conteúdo (exercícios, planos, equipamentos, usuários).
// O app é "data-driven": tudo aqui pode ser editado pelo Claude sem tocar no código.

async function getJSON(path) {
  // cache: 'no-cache' garante que o app pegue a versão mais nova após um deploy.
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Falha ao carregar ${path} (${res.status})`);
  return res.json();
}

export async function loadAppData() {
  const [exData, usersData, equipData, planIndex, perfisData] = await Promise.all([
    getJSON('data/exercises.json'),
    getJSON('data/users.json'),
    getJSON('data/equipment.json'),
    getJSON('data/plans/index.json'),
    getJSON('data/perfis.json').catch(() => ({ perfis: {} })),
  ]);

  const exercises = new Map();
  for (const ex of exData.exercicios || []) exercises.set(ex.id, ex);

  const planFiles = planIndex.planos || [];
  const planResults = await Promise.allSettled(planFiles.map((f) => getJSON(`data/plans/${f}`)));
  const plans = [];
  planResults.forEach((r, i) => {
    if (r.status === 'fulfilled') plans.push({ ...r.value, _origem: 'repo', _arquivo: planFiles[i] });
    else console.warn('Plano não carregado:', planFiles[i], r.reason);
  });

  return {
    exercises,
    plans,
    equipment: equipData,
    users: usersData.usuarios || [],
    perfis: (perfisData && perfisData.perfis) || {},
  };
}

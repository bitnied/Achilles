// store.js — camada de armazenamento (localStorage) + export/import de backup.
// Este é o ÚNICO módulo que fala com o localStorage. Para trocar por sync em nuvem
// no futuro (ex.: git/token), basta reimplementar estas funções.

const NS = 'achilles:';
const K = {
  activeUser: NS + 'activeUser',
  history: (u) => `${NS}history:${u}`,
  current: (u) => `${NS}current:${u}`,
  customPlans: NS + 'customPlans',
  settings: NS + 'settings',
  lastBackup: NS + 'lastBackup',
};

const read = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
  catch (_) { return fallback; }
};
const write = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { console.error('localStorage cheio ou indisponível', e); return false; }
};

// ---- Usuário ativo ----
export const getActiveUser = () => read(K.activeUser, null);
export const setActiveUser = (id) => write(K.activeUser, id);

// ---- Histórico (sessões concluídas) ----
export const getHistory = (userId) => read(K.history(userId), []);
export function addSession(userId, session) {
  const hist = getHistory(userId);
  hist.push(session);
  write(K.history(userId), hist);
  return hist;
}
export function deleteSession(userId, sessionId) {
  const hist = getHistory(userId).filter((s) => s.id !== sessionId);
  write(K.history(userId), hist);
  return hist;
}
export function updateSession(userId, session) {
  const hist = getHistory(userId);
  const i = hist.findIndex((s) => s.id === session.id);
  if (i >= 0) hist[i] = session; else hist.push(session);
  hist.sort((a, b) => (a.data < b.data ? -1 : 1));
  write(K.history(userId), hist);
  return hist;
}

// Último registro concluído de um exercício (para progressão) — busca do mais recente ao mais antigo.
export function getLastEntryForExercise(userId, exerciseId) {
  const hist = getHistory(userId);
  for (let i = hist.length - 1; i >= 0; i--) {
    const item = (hist[i].itens || []).find((it) => it.exerciseId === exerciseId && (it.series || []).some((s) => s.feito));
    if (item) return { item, data: hist[i].data };
  }
  return null;
}

// Últimas N sessões concluídas de um exercício (mais recente primeiro) — para a progressão.
export function getRecentEntriesForExercise(userId, exerciseId, n = 2) {
  const hist = getHistory(userId);
  const out = [];
  for (let i = hist.length - 1; i >= 0 && out.length < n; i--) {
    const item = (hist[i].itens || []).find((it) => it.exerciseId === exerciseId && (it.series || []).some((s) => s.feito));
    if (item) out.push({ item, data: hist[i].data });
  }
  return out;
}

// Todas as sessões que contêm um exercício (para gráficos) — ordem cronológica.
export function getExerciseSeries(userId, exerciseId) {
  const out = [];
  for (const s of getHistory(userId)) {
    const item = (s.itens || []).find((it) => it.exerciseId === exerciseId);
    if (!item) continue;
    const feitas = (item.series || []).filter((x) => x.feito);
    if (!feitas.length) continue;
    const maxPeso = Math.max(...feitas.map((x) => +x.peso || 0));
    const volume = feitas.reduce((a, x) => a + (+x.peso || 0) * (+x.reps || 0), 0);
    const maxTempo = Math.max(...feitas.map((x) => +x.tempoSeg || 0));
    out.push({ data: s.data, maxPeso, volume, maxTempo, reps: feitas.reduce((a, x) => a + (+x.reps || 0), 0) });
  }
  return out;
}

// ---- Sessão em andamento (para retomar) ----
export const getCurrent = (userId) => read(K.current(userId), null);
export const setCurrent = (userId, data) => write(K.current(userId), data);
export const clearCurrent = (userId) => localStorage.removeItem(K.current(userId));

// ---- Planos personalizados (criados no app) ----
export const getCustomPlans = () => read(K.customPlans, []);
export function saveCustomPlan(plan) {
  const plans = getCustomPlans();
  const i = plans.findIndex((p) => p.id === plan.id);
  if (i >= 0) plans[i] = plan; else plans.push(plan);
  write(K.customPlans, plans);
  return plans;
}
export function deleteCustomPlan(planId) {
  write(K.customPlans, getCustomPlans().filter((p) => p.id !== planId));
}

// ---- Configurações ----
export const getSettings = () => read(K.settings, { som: true, vibrar: true, mostrarDica: true, mostrarObjetivo: true });
export const setSettings = (s) => write(K.settings, s);

// ---- Última carga usada por exercício (para não reduzir o peso nas próximas sessões) ----
export const getLastWeight = (userId, exId) => (read(`${NS}weights:${userId}`, {}) || {})[exId];
export function setLastWeight(userId, exId, peso) {
  if (!(peso > 0)) return;
  const k = `${NS}weights:${userId}`;
  const m = read(k, {}) || {};
  m[exId] = peso;
  write(k, m);
}

// ---- Perfil de treino: override editável no app (sobrepõe data/perfis.json) ----
export const getPerfilOverride = (userId) => read(`${NS}perfil:${userId}`, null);
export const setPerfilOverride = (userId, p) => write(`${NS}perfil:${userId}`, p);
export const clearPerfilOverride = (userId) => localStorage.removeItem(`${NS}perfil:${userId}`);

// ---- Backup: export / import de TODOS os dados locais ----
export function exportAll() {
  const dump = { app: 'achilles', versao: 1, exportadoEm: new Date().toISOString(), dados: {} };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(NS)) dump.dados[key] = localStorage.getItem(key);
  }
  return dump;
}

export function importAll(dump, { substituir = false } = {}) {
  if (!dump || dump.app !== 'achilles' || !dump.dados) throw new Error('Arquivo de backup inválido.');
  if (substituir) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(NS)) localStorage.removeItem(key);
    }
  }
  let historyMerged = false;
  for (const [key, val] of Object.entries(dump.dados)) {
    // Ao mesclar (não substituir), une históricos por id de sessão para não duplicar.
    if (!substituir && key.includes(':history:')) {
      const atual = read(key, []);
      let incoming;
      try { incoming = JSON.parse(val); } catch (_) { incoming = []; }
      const byId = new Map(atual.map((s) => [s.id, s]));
      for (const s of incoming) byId.set(s.id, s);
      const merged = [...byId.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
      write(key, merged);
      historyMerged = true;
    } else {
      try { localStorage.setItem(key, val); } catch (_) {}
    }
  }
  return { historyMerged };
}

export const getLastBackup = () => read(K.lastBackup, null);
export const markBackup = () => write(K.lastBackup, new Date().toISOString());

// Baixa um objeto como arquivo JSON (para salvar na pasta do iCloud).
export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

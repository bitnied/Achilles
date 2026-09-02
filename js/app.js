// app.js — inicialização, roteamento (hash) e telas Home / Seleção de usuário / Config.
import { loadAppData } from './data.js';
import * as store from './store.js';
import { h, clear, toast, modal, fmtTime, fmtDateBR, setFeedback, confirmDialog } from './ui.js';
import { renderWorkout, cleanupWorkout } from './workout.js';
import { renderHistory } from './history.js';
import { renderPlans, renderPlanDetail, renderBuilder } from './plans.js';
import { renderStart } from './recommend.js';
import { renderRegister } from './session-edit.js';
import { renderPerfilHome, renderObjetivo } from './perfil.js';
import { dicaDoDia, computeStreak, treinosNaSemana, volumeSemanal, totalTreinos } from './motivation.js';
import { APP_VERSION, CHANGELOG } from './version.js';

const App = { data: null, userId: null, user: null };

const ctx = {
  get data() { return App.data; },
  get userId() { return App.userId; },
  get user() { return App.user; },
  exercise: (id) => App.data.exercises.get(id),
  perfil: () => {
    const override = store.getPerfilOverride(App.userId);
    if (override) return { ...override, _override: true };
    return (App.data.perfis && App.data.perfis[App.userId]) || null;
  },
  allPlans: () => [...App.data.plans, ...store.getCustomPlans().map((p) => ({ ...p, _origem: 'custom' }))],
  navigate: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  refresh: () => route(),
};

const view = () => document.getElementById('view');

async function init() {
  const settings = store.getSettings();
  setFeedback(settings);
  try {
    App.data = await loadAppData();
  } catch (e) {
    view().innerHTML = `<div class="empty"><p class="lead">Erro ao carregar os dados.</p><p class="muted">${e.message}</p></div>`;
    return;
  }
  App.userId = store.getActiveUser();
  App.user = App.data.users.find((u) => u.id === App.userId) || null;
  if (!App.user) App.userId = null;

  window.addEventListener('hashchange', route);
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.addEventListener('click', () => { if (backBtn.dataset.parent) ctx.navigate(backBtn.dataset.parent); });
  buildTabbar();
  if (!location.hash || location.hash === '#/') location.hash = App.userId ? '#/home' : '#/select';
  else route();
}

function buildTabbar() {
  const tabs = [
    { hash: '#/home', label: 'Início', icon: '🏠' },
    { hash: '#/plans', label: 'Treinos', icon: '📋' },
    { hash: '#/history', label: 'Histórico', icon: '📈' },
    { hash: '#/perfil', label: 'Perfil', icon: '👤' },
    { hash: '#/settings', label: 'Config', icon: '⚙️' },
  ];
  const nav = document.getElementById('tabbar');
  clear(nav);
  for (const t of tabs) {
    nav.appendChild(h('button', { class: 'tab', dataset: { hash: t.hash }, onClick: () => ctx.navigate(t.hash) }, [
      h('span', { class: 'tab-ico', text: t.icon }), h('span', { class: 'tab-lbl', text: t.label }),
    ]));
  }
}

function setHeader() {
  const chip = document.getElementById('user-chip');
  clear(chip);
  if (App.user) {
    chip.appendChild(h('button', { class: 'user-chip', style: `--uc:${App.user.cor}`, onClick: () => ctx.navigate('#/select') }, [
      h('span', { text: App.user.emoji || '👤' }), h('span', { text: App.user.nome }),
    ]));
  }
}

function route() {
  cleanupWorkout();
  document.getElementById('rest-timer')?.remove();
  const hash = location.hash || '#/home';
  const parts = hash.replace(/^#\//, '').split('/');
  const root = parts[0] || 'home';

  // exige usuário selecionado (exceto na própria tela de seleção)
  if (!App.userId && root !== 'select') { location.hash = '#/select'; return; }

  const v = view();
  clear(v);
  const immersive = ['workout', 'build', 'start', 'register', 'objetivo'].includes(root);
  document.body.classList.toggle('immersive', immersive);
  setHeader();
  setBack(root, parts);

  switch (root) {
    case 'select': userSelect(v); break;
    case 'home': home(v); break;
    case 'start': renderStart(v, ctx); break;
    case 'plans': renderPlans(v, ctx); break;
    case 'plan': renderPlanDetail(v, ctx, parts[1]); break;
    case 'workout': renderWorkout(v, ctx, parts[1], parts[2]); break;
    case 'history': renderHistory(v, ctx, parts[1]); break;
    case 'register': renderRegister(v, ctx, parts[1]); break;
    case 'perfil': renderPerfilHome(v, ctx); break;
    case 'objetivo': renderObjetivo(v, ctx); break;
    case 'build': renderBuilder(v, ctx, parts[1]); break;
    case 'settings': settings(v); break;
    default: home(v);
  }

  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.hash === `#/${root}`));
  window.scrollTo(0, 0);
}

// Botão voltar do cabeçalho: mostra o "pai" da tela atual.
function parentOf(root, parts) {
  switch (root) {
    case 'workout': case 'start': return '#/home';
    case 'objetivo': return '#/perfil';
    case 'plan': case 'build': return '#/plans';
    case 'register': return '#/history';
    case 'history': return parts[1] ? '#/history' : null;
    default: return null;
  }
}
function setBack(root, parts) {
  const btn = document.getElementById('back-btn');
  if (!btn) return;
  const parent = parentOf(root, parts);
  btn.dataset.parent = parent || '';
  btn.classList.toggle('hidden', !parent);
}

// ---------------- Seleção de usuário ----------------
function userSelect(v) {
  v.appendChild(h('div', { class: 'select-screen' }, [
    h('div', { class: 'brand-big' }, [h('div', { class: 'logo', text: '🏋️' }), h('h1', { text: 'Achilles' }), h('p', { class: 'muted', text: 'Quem vai treinar?' })]),
    h('div', { class: 'user-grid' }, App.data.users.map((u) =>
      h('button', { class: 'user-card', style: `--uc:${u.cor}`, onClick: () => {
        App.userId = u.id; App.user = u; store.setActiveUser(u.id); ctx.navigate('#/home');
      } }, [
        h('div', { class: 'user-emoji', text: u.emoji || '👤' }),
        h('strong', { text: u.nome }),
        h('span', { class: 'muted tiny', text: `${totalTreinos(store.getHistory(u.id))} treinos` }),
      ]))),
  ]));
}

// ---------------- Home / Dashboard ----------------
function home(v) {
  const hist = store.getHistory(App.userId);
  const settings = store.getSettings();
  const hideCard = (chave) => { const s = store.getSettings(); s[chave] = false; store.setSettings(s); ctx.refresh(); };

  // Controle de versão (topo) — abre as novidades
  v.appendChild(h('button', { class: 'ver-pill', onClick: showChangelog, title: 'Ver novidades' }, [
    h('span', { class: 'ver-num', text: `Achilles v${APP_VERSION}` }),
    h('span', { class: 'muted', text: ' · novidades' }),
  ]));

  v.appendChild(h('div', { class: 'greet' }, [h('h2', { text: `Olá, ${App.user.nome}! ${App.user.emoji || ''}` })]));

  // Dica do dia (fechável; ligável/desligável em Config)
  if (settings.mostrarDica !== false) {
    v.appendChild(h('div', { class: 'dica' }, [
      h('span', { class: 'dica-tag', text: '💡 Dica' }),
      h('span', { class: 'dica-txt', text: dicaDoDia() }),
      h('button', { class: 'card-close', text: '×', 'aria-label': 'Fechar dica', onClick: () => hideCard('mostrarDica') }),
    ]));
  }

  // Ação principal: montar o treino do dia (pergunta tempo + modalidade)
  v.appendChild(h('button', { class: 'btn primary block big cta-dia', onClick: () => ctx.navigate('#/start') }, [
    h('span', { text: '⚡ Montar treino do dia' }),
  ]));

  // Objetivo (fechável; ligável/desligável em Config)
  const perfil = ctx.perfil();
  const temObjetivo = perfil && perfil.objetivo && !/a definir/i.test(perfil.objetivo);
  if (settings.mostrarObjetivo !== false) {
    const meta = [];
    if (temObjetivo) {
      if (perfil.foco && perfil.foco.length) meta.push('Foco: ' + perfil.foco.join(', '));
      if (perfil.duracaoAlvoMin) meta.push(`${perfil.duracaoAlvoMin} min`);
      if (perfil.frequenciaSemana) meta.push(`${perfil.frequenciaSemana}x/sem`);
    }
    const card = h('div', { class: 'card focus-card' }, [
      h('div', { class: 'grow', onClick: () => temObjetivo ? showPerfil(perfil) : ctx.navigate('#/objetivo'), style: 'cursor:pointer' }, [
        h('div', { class: 'tiny label-accent', text: '🎯 ' + (temObjetivo ? 'Seu objetivo' : 'Objetivo') }),
        h('strong', { text: temObjetivo ? perfil.objetivo : 'Definir meu objetivo' }),
        h('div', { class: 'muted tiny', text: temObjetivo ? meta.join(' · ') : 'Responda um questionário rápido' }),
      ]),
      h('div', { class: 'row gap center' }, [
        h('button', { class: 'go-btn', text: temObjetivo ? '✎' : '›', 'aria-label': 'Objetivo', onClick: () => ctx.navigate('#/objetivo') }),
        h('button', { class: 'card-close', text: '×', 'aria-label': 'Fechar objetivo', onClick: () => hideCard('mostrarObjetivo') }),
      ]),
    ]);
    v.appendChild(card);
  }

  // Continuar treino em andamento
  const cur = store.getCurrent(App.userId);
  if (cur) {
    const done = (cur.itens || []).reduce((a, it) => a + it.series.filter((s) => s.feito).length, 0);
    const tot = (cur.itens || []).reduce((a, it) => a + it.series.length, 0);
    v.appendChild(h('div', { class: 'card resume-card' }, [
      h('div', {}, [h('strong', { text: '▶ Continuar treino' }), h('div', { class: 'muted tiny', text: `${cur.planNome} · ${done}/${tot} séries` })]),
      h('div', { class: 'row gap' }, [
        h('button', { class: 'btn ghost danger sm', text: 'Cancelar', onClick: async () => {
          const ok = await confirmDialog('Cancelar treino', 'Descartar este treino em andamento?');
          if (ok) { store.clearCurrent(App.userId); ctx.refresh(); }
        } }),
        h('button', { class: 'btn primary', text: 'Retomar', onClick: () => ctx.navigate(`#/workout/${cur.planId}/${cur.dayIdx}`) }),
      ]),
    ]));
  }

  // Estatísticas de constância
  v.appendChild(h('div', { class: 'stats-row' }, [
    stat(computeStreak(hist), 'dias seguidos'),
    stat(treinosNaSemana(hist), 'treinos/semana'),
    stat(volumeSemanal(hist).toLocaleString('pt-BR'), 'kg na semana'),
  ]));

  // Iniciar treino (planos)
  v.appendChild(h('div', { class: 'row between center' }, [
    h('h3', { class: 'section-title', text: 'Começar um treino' }),
    h('button', { class: 'btn ghost sm', text: 'Ver todos', onClick: () => ctx.navigate('#/plans') }),
  ]));
  const plans = ctx.allPlans().slice(0, 4);
  if (!plans.length) v.appendChild(h('p', { class: 'muted', text: 'Nenhum plano. Crie um na aba Treinos.' }));
  const quick = h('div', { class: 'plan-list' });
  for (const plan of plans) {
    quick.appendChild(h('button', { class: 'card plan-quick', onClick: () => {
      if ((plan.dias || []).length <= 1) ctx.navigate(`#/workout/${plan.id}/0`);
      else ctx.navigate('#/plan/' + plan.id);
    } }, [
      h('div', {}, [h('strong', { text: plan.nome }), h('div', { class: 'muted tiny', text: `${(plan.dias || []).length} dia(s)` })]),
      h('span', { class: 'go', text: '▶' }),
    ]));
  }
  v.appendChild(quick);
}

function showChangelog() {
  const body = h('div', { class: 'changelog' }, CHANGELOG.map((c) => h('div', { class: 'cl-entry' }, [
    h('div', { class: 'row between center' }, [
      h('strong', { text: `v${c.v}` + (c.titulo ? ` — ${c.titulo}` : '') }),
      h('span', { class: 'muted tiny', text: fmtDateBR(c.data) }),
    ]),
    h('ul', { class: 'inst-list' }, (c.itens || []).map((t) => h('li', { text: t }))),
  ])));
  modal(`Novidades · Achilles v${APP_VERSION}`, body);
}

function showPerfil(perfil) {
  const body = h('div', { class: 'instructions' }, [
    h('p', { class: 'lead', text: perfil.objetivo }),
    (perfil.foco && perfil.foco.length) ? h('div', { class: 'tags' }, perfil.foco.map((f) => h('span', { class: 'tag', text: f }))) : null,
    h('div', { class: 'muted tiny', text: [perfil.duracaoAlvoMin ? `${perfil.duracaoAlvoMin} min/treino` : null, perfil.frequenciaSemana ? `${perfil.frequenciaSemana}x por semana` : null].filter(Boolean).join(' · ') }),
    (perfil.consideracoesTreino && perfil.consideracoesTreino.length)
      ? h('div', { class: 'inst-sec' }, [h('h4', { text: 'Considerações no treino' }), h('ul', { class: 'inst-list' }, perfil.consideracoesTreino.map((c) => h('li', { text: c })))])
      : null,
    perfil.avaliacaoMedica ? h('p', { class: 'muted tiny', text: '⚕️ ' + perfil.avaliacaoMedica }) : null,
  ]);
  const close = modal('Seu perfil de treino', body, [
    h('button', { class: 'btn primary', text: '✎ Editar objetivo', onClick: () => { close(); ctx.navigate('#/objetivo'); } }),
  ]);
}

// ---------------- Configurações / Backup ----------------
function settings(v) {
  v.appendChild(h('h2', { text: 'Configurações' }));

  // Perfil
  v.appendChild(h('div', { class: 'card' }, [
    h('h3', { text: 'Perfil' }),
    h('div', { class: 'row between center' }, [
      h('span', { text: `${App.user.emoji || ''} ${App.user.nome}` }),
      h('button', { class: 'btn ghost sm', text: 'Trocar usuário', onClick: () => ctx.navigate('#/select') }),
    ]),
    h('div', { class: 'row between center switch-row' }, [
      h('span', { text: '👤 Perfil e objetivo' }),
      h('button', { class: 'btn ghost sm', text: 'Abrir', onClick: () => ctx.navigate('#/perfil') }),
    ]),
  ]));

  // Feedback
  const s = store.getSettings();
  const toggle = (label, key) => {
    const inp = h('input', { type: 'checkbox', ...(s[key] ? { checked: 'checked' } : {}) });
    inp.addEventListener('change', () => { s[key] = inp.checked; store.setSettings(s); setFeedback(s); });
    return h('label', { class: 'row between center switch-row' }, [h('span', { text: label }), inp]);
  };
  const toggleDefaultOn = (label, key) => {
    const inp = h('input', { type: 'checkbox', ...(s[key] !== false ? { checked: 'checked' } : {}) });
    inp.addEventListener('change', () => { s[key] = inp.checked; store.setSettings(s); });
    return h('label', { class: 'row between center switch-row' }, [h('span', { text: label }), inp]);
  };
  v.appendChild(h('div', { class: 'card' }, [
    h('h3', { text: 'Durante o treino' }),
    toggle('Som nos timers', 'som'),
    toggle('Vibração', 'vibrar'),
  ]));

  v.appendChild(h('div', { class: 'card' }, [
    h('h3', { text: 'Tela inicial' }),
    toggleDefaultOn('Mostrar dica do dia', 'mostrarDica'),
    toggleDefaultOn('Mostrar objetivo', 'mostrarObjetivo'),
  ]));

  // Toggle por usuário (salvo no perfil): sempre incluir abdominal no Treino do dia
  const perfilToggle = (label, key) => {
    const cur = ctx.perfil() || {};
    const inp = h('input', { type: 'checkbox', ...(cur[key] ? { checked: 'checked' } : {}) });
    inp.addEventListener('change', () => {
      const base = ctx.perfil() || {};
      const merged = { ...base, [key]: inp.checked };
      delete merged._override;
      store.setPerfilOverride(App.userId, merged);
    });
    return h('label', { class: 'row between center switch-row' }, [h('span', { text: label }), inp]);
  };
  v.appendChild(h('div', { class: 'card' }, [
    h('h3', { text: 'Treino do dia' }),
    perfilToggle('Sempre incluir abdominal (qualquer tempo)', 'sempreAbdominal'),
  ]));

  // Backup / Sincronização
  const last = store.getLastBackup();
  v.appendChild(h('div', { class: 'card' }, [
    h('h3', { text: 'Backup e sincronização' }),
    h('p', { class: 'muted tiny', text: 'Seus dados ficam salvos neste aparelho. Atualizações do app NÃO apagam o histórico. Para levar para outro celular (ou deixar o Claude ler e sugerir evolução), exporte um backup e salve na pasta do iCloud do projeto.' }),
    last ? h('p', { class: 'tiny', text: `Último backup: ${fmtDateBR(last.slice(0, 10))}` }) : h('p', { class: 'tiny warn', text: '⚠️ Você ainda não fez backup.' }),
    h('div', { class: 'row gap wrap' }, [
      h('button', { class: 'btn primary', text: '⬇ Exportar backup', onClick: exportBackup }),
      h('button', { class: 'btn ghost', text: '⬆ Importar backup', onClick: importBackup }),
    ]),
    h('button', { class: 'btn ghost block', text: '📋 Copiar histórico (p/ o Claude)', onClick: copyHistory }),
  ]));

  v.appendChild(h('p', { class: 'muted tiny center', text: 'Achilles · webapp de musculação · dados locais no navegador' }));
}

function exportBackup() {
  const dump = store.exportAll();
  const nome = (App.user?.nome || 'user').toLowerCase();
  store.downloadJSON(dump, `achilles-backup-${nome}-${new Date().toISOString().slice(0, 10)}.json`);
  store.markBackup();
  toast('Backup exportado. Salve na pasta do iCloud.');
  setTimeout(() => ctx.refresh(), 300);
}

function importBackup() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', () => {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dump = JSON.parse(reader.result);
        store.importAll(dump, { substituir: false });
        toast('Backup importado e mesclado!');
        App.userId = store.getActiveUser() || App.userId;
        App.user = App.data.users.find((u) => u.id === App.userId) || App.user;
        ctx.refresh();
      } catch (e) { toast('Falha: ' + e.message); }
    };
    reader.readAsText(file);
  });
  document.body.appendChild(input); input.click(); input.remove();
}

async function copyHistory() {
  const data = { usuario: App.user?.nome, historico: store.getHistory(App.userId) };
  const txt = JSON.stringify(data, null, 2);
  try { await navigator.clipboard.writeText(txt); toast('Histórico copiado! Cole no Claude.'); }
  catch (_) { modal('Histórico (copie manualmente)', h('textarea', { class: 'text-input', rows: 12, readonly: 'readonly' }, [txt])); }
}

function stat(v, l) { return h('div', { class: 'stat' }, [h('div', { class: 'stat-v', text: v }), h('div', { class: 'stat-l', text: l })]); }

// Registra o service worker (PWA) e inicia.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
init();

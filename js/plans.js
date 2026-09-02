// plans.js — lista de planos, detalhe do plano e montador de treinos personalizados.
import { h, clear, modal, toast, confirmDialog } from './ui.js';
import * as store from './store.js';
import { showInstructions } from './workout.js';

const uid = () => 'custom-' + Math.random().toString(36).slice(2, 8);

function startPlan(ctx, plan) {
  if ((plan.dias || []).length <= 1) return ctx.navigate(`#/workout/${plan.id}/0`);
  const body = h('div', { class: 'day-choose' }, plan.dias.map((d, i) =>
    h('button', { class: 'btn block', text: d.nome || `Dia ${i + 1}`, onClick: () => { close(); ctx.navigate(`#/workout/${plan.id}/${i}`); } })));
  const close = modal('Escolha o dia', body);
}

export function renderPlans(view, ctx) {
  view.appendChild(h('div', { class: 'row between center' }, [
    h('h2', { text: 'Treinos' }),
    h('button', { class: 'btn primary sm', text: '+ Criar', onClick: () => ctx.navigate('#/build') }),
  ]));

  const plans = ctx.allPlans();
  if (!plans.length) { view.appendChild(h('p', { class: 'muted', text: 'Nenhum plano ainda. Crie um ou gere pelo Claude.' })); return; }

  const listEl = h('div', { class: 'plan-list' });
  for (const plan of plans) {
    const nDias = (plan.dias || []).length;
    const nEx = (plan.dias || []).reduce((a, d) => a + (d.exercicios || []).length, 0);
    listEl.appendChild(h('div', { class: 'card plan-card' }, [
      h('div', { class: 'row between center' }, [
        h('div', {}, [
          h('strong', { text: plan.nome }),
          plan._origem === 'custom' ? h('span', { class: 'badge', text: 'meu' }) : null,
        ]),
        h('span', { class: 'muted tiny', text: `${nDias} dia(s) · ${nEx} ex.` }),
      ]),
      plan.descricao ? h('p', { class: 'muted tiny', text: plan.descricao }) : null,
      h('div', { class: 'row gap' }, [
        h('button', { class: 'btn primary', text: '▶ Iniciar', onClick: () => startPlan(ctx, plan) }),
        h('button', { class: 'btn ghost', text: 'Detalhes', onClick: () => ctx.navigate('#/plan/' + plan.id) }),
      ]),
    ]));
  }
  view.appendChild(listEl);
}

export function renderPlanDetail(view, ctx, planId) {
  const plan = ctx.allPlans().find((p) => p.id === planId);
  if (!plan) { view.appendChild(h('p', { class: 'muted', text: 'Plano não encontrado.' })); return; }

  view.appendChild(h('button', { class: 'btn ghost sm back', text: '← Voltar', onClick: () => ctx.navigate('#/plans') }));
  view.appendChild(h('div', { class: 'row between center' }, [
    h('h2', { text: plan.nome }),
    plan._origem === 'custom' ? h('div', { class: 'row gap' }, [
      h('button', { class: 'icon-btn', text: '✎', 'aria-label': 'Editar', onClick: () => ctx.navigate('#/build/' + plan.id) }),
      h('button', { class: 'icon-btn', text: '🗑', 'aria-label': 'Excluir', onClick: async () => {
        if (await confirmDialog('Excluir plano', `Remover "${plan.nome}"?`)) { store.deleteCustomPlan(plan.id); ctx.navigate('#/plans'); ctx.refresh(); }
      } }),
    ]) : null,
  ]));
  if (plan.descricao) view.appendChild(h('p', { class: 'muted', text: plan.descricao }));

  (plan.dias || []).forEach((day, i) => {
    view.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'row between center' }, [
        h('h3', { text: day.nome || `Dia ${i + 1}` }),
        h('button', { class: 'btn primary sm', text: '▶ Iniciar', onClick: () => ctx.navigate(`#/workout/${plan.id}/${i}`) }),
      ]),
      h('div', { class: 'ex-mini-list' }, (day.exercicios || []).map((pe) => {
        const ex = ctx.exercise(pe.exerciseId);
        const timed = pe.porTempo || ex?.tipo === 'tempo';
        const meta = timed ? `${pe.series}× ${pe.tempoSeg || ex?.tempoPadraoSeg || 30}s` : `${pe.series}× ${pe.repsAlvo} reps · ${pe.pesoAlvo || 0}kg`;
        return h('div', { class: 'ex-mini row between center' }, [
          h('div', {}, [h('span', { text: ex?.nome || pe.exerciseId }), h('div', { class: 'muted tiny', text: meta })]),
          h('button', { class: 'icon-btn info', text: 'ⓘ', onClick: () => showInstructions(ex) }),
        ]);
      })),
    ]));
  });
}

// ---------------- Montador de treinos ----------------
export function renderBuilder(view, ctx, planId) {
  const editing = planId ? store.getCustomPlans().find((p) => p.id === planId) : null;
  const plan = editing ? JSON.parse(JSON.stringify(editing))
    : { id: uid(), nome: '', descricao: '', _origem: 'custom', dias: [{ nome: 'Treino', exercicios: [] }] };

  view.appendChild(h('button', { class: 'btn ghost sm back', text: '← Voltar', onClick: () => ctx.navigate('#/plans') }));
  view.appendChild(h('h2', { text: editing ? 'Editar treino' : 'Criar treino' }));

  const nome = h('input', { class: 'text-input', placeholder: 'Nome do treino', value: plan.nome });
  const desc = h('input', { class: 'text-input', placeholder: 'Descrição (opcional)', value: plan.descricao || '' });
  view.appendChild(h('div', { class: 'card' }, [
    h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Nome' }), nome]),
    h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Descrição' }), desc]),
  ]));

  const daysHost = h('div', {});
  const renderDays = () => {
    clear(daysHost);
    plan.dias.forEach((day, di) => daysHost.appendChild(renderDay(ctx, plan, day, di, renderDays)));
  };
  renderDays();
  view.appendChild(daysHost);

  view.appendChild(h('button', { class: 'btn ghost block', text: '+ Adicionar dia', onClick: () => {
    plan.dias.push({ nome: `Treino ${String.fromCharCode(65 + plan.dias.length)}`, exercicios: [] }); renderDays();
  } }));

  view.appendChild(h('div', { class: 'workout-footer' }, [
    h('button', { class: 'btn primary block big', text: 'Salvar treino', onClick: () => {
      plan.nome = nome.value.trim(); plan.descricao = desc.value.trim();
      if (!plan.nome) return toast('Dê um nome ao treino.');
      if (!plan.dias.some((d) => (d.exercicios || []).length)) return toast('Adicione ao menos um exercício.');
      store.saveCustomPlan(plan); toast('Treino salvo!'); ctx.refresh(); ctx.navigate('#/plan/' + plan.id);
    } }),
  ]));
}

function renderDay(ctx, plan, day, di, rerender) {
  const nomeInput = h('input', { class: 'text-input sm', value: day.nome, onChange: (e) => { day.nome = e.target.value; } });
  const exHost = h('div', { class: 'ex-mini-list' });
  const drawEx = () => {
    clear(exHost);
    day.exercicios.forEach((pe, ei) => exHost.appendChild(renderBuilderEx(ctx, day, pe, ei, drawEx)));
    if (!day.exercicios.length) exHost.appendChild(h('p', { class: 'muted tiny', text: 'Nenhum exercício. Toque em "+ Exercício".' }));
  };
  drawEx();

  return h('div', { class: 'card' }, [
    h('div', { class: 'row between center' }, [
      h('label', { class: 'field-col grow' }, [h('span', { class: 'flabel', text: 'Dia' }), nomeInput]),
      plan.dias.length > 1 ? h('button', { class: 'icon-btn', text: '🗑', onClick: () => { plan.dias.splice(di, 1); rerender(); } }) : null,
    ]),
    exHost,
    h('button', { class: 'btn ghost sm', text: '+ Exercício', onClick: () => pickExercise(ctx, (exId) => {
      const ex = ctx.exercise(exId); const timed = ex?.tipo === 'tempo';
      day.exercicios.push({ exerciseId: exId, series: 3, repsAlvo: timed ? 1 : 12, pesoAlvo: 0,
        descansoSeg: ex?.descansoPadraoSeg || 60, porTempo: timed, tempoSeg: timed ? (ex.tempoPadraoSeg || 30) : undefined });
      drawEx();
    }) }),
  ]);
}

function renderBuilderEx(ctx, day, pe, ei, rerender) {
  const ex = ctx.exercise(pe.exerciseId);
  const timed = pe.porTempo || ex?.tipo === 'tempo';
  const num = (label, get, set, step = 1) => {
    const inp = h('input', { class: 'mini-num', type: 'number', inputmode: 'numeric', value: get(), min: 0, step,
      onChange: (e) => set(+e.target.value || 0) });
    return h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: label }), inp]);
  };
  return h('div', { class: 'builder-ex' }, [
    h('div', { class: 'row between center' }, [
      h('strong', { class: 'tiny', text: ex?.nome || pe.exerciseId }),
      h('button', { class: 'icon-btn', text: '✕', onClick: () => { day.exercicios.splice(ei, 1); rerender(); } }),
    ]),
    h('div', { class: 'mini-fields' }, [
      num('séries', () => pe.series, (v) => pe.series = v),
      timed ? num('tempo(s)', () => pe.tempoSeg || 30, (v) => pe.tempoSeg = v, 5)
            : num('reps', () => pe.repsAlvo, (v) => pe.repsAlvo = v),
      !timed ? num('kg', () => pe.pesoAlvo || 0, (v) => pe.pesoAlvo = v) : null,
      num('desc.(s)', () => pe.descansoSeg || 60, (v) => pe.descansoSeg = v, 15),
    ]),
  ]);
}

function pickExercise(ctx, onPick) {
  const all = [...ctx.data.exercises.values()];
  const grupos = {};
  for (const ex of all) for (const g of (ex.grupos || ['outros'])) (grupos[g] = grupos[g] || []).push(ex);
  const body = h('div', { class: 'picker' });
  const search = h('input', { class: 'text-input', placeholder: 'Buscar exercício...' });
  const listEl = h('div', { class: 'picker-list' });
  const draw = (term = '') => {
    clear(listEl);
    const seen = new Set();
    for (const [g, exs] of Object.entries(grupos)) {
      const matches = exs.filter((e) => e.nome.toLowerCase().includes(term.toLowerCase()) && !seen.has(e.id));
      if (!matches.length) continue;
      listEl.appendChild(h('div', { class: 'picker-group', text: g }));
      for (const e of matches) {
        seen.add(e.id);
        listEl.appendChild(h('button', { class: 'picker-item', onClick: () => { close(); onPick(e.id); } }, [
          h('span', { text: e.nome }),
          h('span', { class: 'muted tiny', text: e.tipo === 'tempo' ? 'tempo' : (e.equipamento || []).join(', ') }),
        ]));
      }
    }
  };
  search.addEventListener('input', () => draw(search.value));
  draw();
  body.appendChild(search); body.appendChild(listEl);
  const close = modal('Adicionar exercício', body);
}

// session-edit.js — registrar um treino já feito e editar/excluir sessões do histórico.
import { h, clear, modal, toast, todayISO, confirmDialog } from './ui.js';
import * as store from './store.js';
import { availableEquip, usableExercise, isCardioEx, usaMinutos, seriesPadrao, tempoPadrao } from './workout.js';

const mkSet = (timed, tempoSeg = 0) => ({ peso: 0, reps: timed ? 0 : 10, repsAlvo: timed ? 0 : 10,
  tempoSeg: timed ? tempoSeg : 0, distanciaKm: 0, feito: true, esforco: null });

function newItem(ex) {
  const timed = ex.tipo === 'tempo';
  // Caminhada/corrida/bike são um bloco só: 3 séries não fazem sentido aqui.
  const n = seriesPadrao(ex);
  const t = timed ? tempoPadrao(ex) : 0;
  return { exerciseId: ex.id, nome: ex.nome, tipo: ex.tipo || 'reps', timed,
    cardio: isCardioEx(ex), emMinutos: timed && usaMinutos(ex, t),
    series: Array.from({ length: n }, () => mkSet(timed, t)) };
}

const somaTempos = (sess) => sess.itens.reduce((a, it) => a + it.series.reduce((b, s) => b + (+s.tempoSeg || 0), 0), 0);
// Só faz sentido calcular a duração sozinho quando o treino inteiro é cardio (caminhada,
// bike, corrida): aí a duração É a soma dos blocos. Prancha de 3x30s não é um treino de 2 min.
const soCardio = (sess) => sess.itens.length > 0 && sess.itens.every((it) => it.cardio);

export function renderRegister(view, ctx, sessionId) {
  const hist = store.getHistory(ctx.userId);
  const editing = sessionId ? hist.find((s) => s.id === sessionId) : null;
  const sess = editing ? JSON.parse(JSON.stringify(editing))
    : { id: null, data: todayISO(), planNome: 'Treino registrado', diaNome: '', duracaoSeg: 0, itens: [] };
  sess.itens.forEach((it) => {
    const ex = ctx.exercise(it.exerciseId);
    it.timed = it.timed || it.tipo === 'tempo';
    if (it.cardio == null) it.cardio = isCardioEx(ex);
    if (it.emMinutos == null) it.emMinutos = it.timed && usaMinutos(ex, (it.series[0] || {}).tempoSeg);
  });

  view.appendChild(h('h2', { text: editing ? 'Editar treino' : 'Registrar treino feito' }));
  view.appendChild(h('p', { class: 'muted tiny', text: 'Anote um treino que você já fez (data, exercícios, séries). Fica no histórico e conta para os recordes e a progressão. No cardio, o campo principal é o TEMPO (minutos) e a distância é opcional. Se você registrou distância antes, pode corrigir aqui.' }));

  const dataInput = h('input', { class: 'text-input', type: 'date', value: sess.data });
  const nomeInput = h('input', { class: 'text-input', value: sess.planNome || '', placeholder: 'Nome (ex.: Treino A, Corrida)' });
  const minInput = h('input', { class: 'text-input', type: 'number', min: 0, value: sess.duracaoSeg ? Math.round(sess.duracaoSeg / 60) : '', placeholder: 'opcional' });
  // Quando o treino é só tempo (caminhada, bike, corrida), a duração É o tempo dos blocos:
  // perguntar de novo aqui em cima seria a mesma pergunta duas vezes.
  const durRow = h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Duração (min), opcional' }), minInput]);
  const durAuto = h('div', { class: 'muted tiny' });
  view.appendChild(h('div', { class: 'card' }, [
    h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Data' }), dataInput]),
    h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Nome do treino' }), nomeInput]),
    durRow, durAuto,
  ]));

  const itensHost = h('div', {});
  const drawItens = () => {
    clear(itensHost);
    if (!sess.itens.length) itensHost.appendChild(h('p', { class: 'muted tiny', text: 'Nenhum exercício ainda. Toque em "+ Exercício".' }));
    sess.itens.forEach((it, i) => itensHost.appendChild(renderItem(ctx, sess, it, i, drawItens)));
    const auto = soCardio(sess);
    durRow.hidden = auto;
    durAuto.textContent = auto ? `Duração: ${Math.round(somaTempos(sess) / 60)} min (o tempo que você anotou nos blocos abaixo).` : '';
  };
  drawItens();
  view.appendChild(itensHost);

  view.appendChild(h('button', { class: 'btn ghost block', text: '+ Exercício', onClick: () => pickExercise(ctx, (ex) => { sess.itens.push(newItem(ex)); drawItens(); }) }));

  view.appendChild(h('div', { class: 'workout-footer' }, [
    h('button', { class: 'btn primary block big', text: 'Salvar no histórico', onClick: () => {
      if (!sess.itens.length) return toast('Adicione ao menos um exercício.');
      const record = {
        id: sess.id || String(Date.now()),
        data: dataInput.value || todayISO(),
        userId: ctx.userId,
        planId: sess.planId || 'manual',
        planNome: nomeInput.value.trim() || 'Treino registrado',
        diaNome: sess.diaNome || '',
        duracaoSeg: soCardio(sess) ? somaTempos(sess) : ((+minInput.value || 0) * 60 || sess.duracaoSeg || 0),
        itens: sess.itens.map((it) => ({
          exerciseId: it.exerciseId, nome: it.nome, tipo: it.tipo,
          series: it.series.map((s) => ({ peso: +s.peso || 0, reps: +s.reps || 0, repsAlvo: +s.repsAlvo || 0,
            tempoSeg: +s.tempoSeg || 0, distanciaKm: +s.distanciaKm || 0, feito: true, esforco: s.esforco || null })),
        })),
      };
      if (editing) store.updateSession(ctx.userId, record); else store.addSession(ctx.userId, record);
      toast(editing ? 'Treino atualizado!' : 'Treino registrado!');
      ctx.navigate('#/history');
    } }),
  ]));
}

function renderItem(ctx, sess, it, idx, rerender) {
  const ex = ctx.exercise(it.exerciseId) || {};
  const emMin = it.emMinutos != null ? it.emMinutos : (it.timed && usaMinutos(ex));
  const tPad = it.timed ? ((it.series[0] && it.series[0].tempoSeg) || tempoPadrao(ex)) : 0;
  const box = h('div', { class: 'sets' });
  const num = (get, set, step = 1) => {
    const inp = h('input', { class: 'mini-num', type: 'number', inputmode: 'decimal', min: 0, step, value: get() });
    inp.addEventListener('change', () => set(+inp.value || 0));
    return inp;
  };
  it.series.forEach((s, si) => {
    box.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-n', text: si + 1 }),
      h('div', { class: 'set-fields' }, it.timed
        ? [emMin
             ? h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'min' }),
                 num(() => Math.round((s.tempoSeg || 0) / 60), (v) => s.tempoSeg = Math.max(0, v) * 60, 1)])
             : h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'seg' }),
                 num(() => s.tempoSeg || 0, (v) => s.tempoSeg = Math.max(0, v), 5)]),
           ex.permiteDistancia ? h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'km (opc.)' }),
             num(() => s.distanciaKm || 0, (v) => s.distanciaKm = v, 0.1)]) : null]
        : [
            h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'kg' }), num(() => s.peso, (v) => s.peso = v)]),
            h('label', { class: 'mini-field' }, [h('span', { class: 'flabel', text: 'reps' }), num(() => s.reps, (v) => { s.reps = v; s.repsAlvo = v; })]),
          ]),
      h('button', { class: 'icon-btn', text: '✕', 'aria-label': 'Remover série', onClick: () => { it.series.splice(si, 1); if (!it.series.length) it.series.push(mkSet(it.timed, tPad)); rerender(); } }),
    ]));
  });
  return h('div', { class: 'card' }, [
    h('div', { class: 'row between center' }, [
      h('strong', { text: it.nome }),
      h('button', { class: 'icon-btn', text: '🗑', 'aria-label': 'Remover exercício', onClick: () => { sess.itens.splice(idx, 1); rerender(); } }),
    ]),
    box,
    h('button', { class: 'btn ghost sm', text: it.cardio ? '+ bloco' : '+ série', onClick: () => { it.series.push(mkSet(it.timed, tPad)); rerender(); } }),
  ]);
}

function pickExercise(ctx, onPick) {
  const avail = availableEquip(ctx);
  const all = [...ctx.data.exercises.values()].filter((e) => usableExercise(e, avail));
  const search = h('input', { class: 'text-input', placeholder: 'Buscar exercício...' });
  const listEl = h('div', { class: 'picker-list' });
  const draw = (term = '') => {
    clear(listEl);
    all.filter((e) => e.nome.toLowerCase().includes(term.toLowerCase())).forEach((e) => listEl.appendChild(
      h('button', { class: 'picker-item', onClick: () => { close(); onPick(e); } }, [
        h('span', { text: e.nome }), h('span', { class: 'muted tiny', text: (e.grupos || []).join(', ') }),
      ])));
  };
  search.addEventListener('input', () => draw(search.value));
  draw();
  const close = modal('Adicionar exercício', h('div', { class: 'picker' }, [search, listEl]));
}

// perfil.js — tela de Perfil (dados do usuário + objetivo) e o questionário de objetivo.
// Tudo é salvo como "override" por usuário no localStorage (sobrepõe data/perfis.json).
import { h, clear, toast, confirmDialog, modal } from './ui.js';
import * as store from './store.js';
import { faixaFC, idadeDe, fcMaxEstimada, ZONAS, explicacaoFC } from './hr.js';

const OBJETIVOS = [
  'Emagrecer / reduzir gordura',
  'Ganhar massa e tônus muscular',
  'Definir e firmar o corpo',
  'Melhorar o condicionamento (cardio)',
  'Saúde e disposição no dia a dia',
  'Ganhar força',
];
const FOCOS = ['corpo todo', 'braços', 'abdômen', 'glúteos', 'pernas', 'costas', 'peito', 'ombros'];

// ---------- Perfil (visão geral + dados editáveis) ----------
export function renderPerfilHome(view, ctx) {
  const base = ctx.perfil() || {};
  view.appendChild(h('div', { class: 'row between center' }, [
    h('h2', { text: 'Perfil' }),
    h('button', { class: 'btn ghost sm', text: 'Trocar usuário', onClick: () => ctx.navigate('#/select') }),
  ]));

  // Identidade
  view.appendChild(h('div', { class: 'card row center gap' }, [
    h('div', { class: 'user-emoji sm', text: ctx.user.emoji || '👤' }),
    h('div', {}, [h('strong', { text: ctx.user.nome }), idadeDe(base) != null ? h('div', { class: 'muted tiny', text: idadeDe(base) + ' anos' }) : null]),
  ]));

  // Dados editáveis
  const altura = h('input', { class: 'text-input', type: 'number', step: '0.01', min: 0, value: base.altura || '', placeholder: 'ex.: 1.76' });
  const peso = h('input', { class: 'text-input', type: 'number', step: '0.1', min: 0, value: base.pesoAtual || '', placeholder: 'ex.: 72' });
  const nasc = h('input', { class: 'text-input', type: 'date', value: base.nascimento || '' });
  const fcRep = h('input', { class: 'text-input', type: 'number', min: 30, max: 110, value: base.fcRepouso || '', placeholder: 'ex.: 62 (veja no Apple Watch)' });
  const obs = h('textarea', { class: 'text-input', rows: 3, placeholder: 'Ex.: lesões, preferências, restrições relevantes ao treino' }, [base.observacoes || '']);
  const sexoState = { v: base.sexo || '' };
  const sexoChips = chipRow([{ v: 'M', t: 'Masculino' }, { v: 'F', t: 'Feminino' }], () => sexoState.v, (v) => sexoState.v = v);
  view.appendChild(h('div', { class: 'card' }, [
    h('h3', { text: 'Meus dados' }),
    h('div', { class: 'row gap' }, [
      h('label', { class: 'field-col grow' }, [h('span', { class: 'flabel', text: 'Altura (m)' }), altura]),
      h('label', { class: 'field-col grow' }, [h('span', { class: 'flabel', text: 'Peso (kg)' }), peso]),
    ]),
    h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Nascimento' }), nasc]),
    h('div', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Sexo (calibra a sugestão de carga)' }), sexoChips]),
    h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'FC de repouso (bpm) — opcional' }), fcRep]),
    h('label', { class: 'field-col' }, [h('span', { class: 'flabel', text: 'Observações' }), obs]),
    h('button', { class: 'btn primary block', text: 'Salvar dados', onClick: () => {
      const merged = { ...base, altura: +altura.value || null, pesoAtual: +peso.value || null,
        nascimento: nasc.value || base.nascimento || '', sexo: sexoState.v || base.sexo || '',
        fcRepouso: +fcRep.value || null, observacoes: obs.value.trim() };
      delete merged._override;
      store.setPerfilOverride(ctx.userId, merged);
      toast('Dados salvos!'); ctx.refresh();
    } }),
  ]));

  // Batimentos (faixas-alvo) — usado no cardio e nas dicas
  const idadeAtual = idadeDe(base);
  const linhas = [];
  for (const id of ['leve', 'moderado', 'vigoroso']) {
    const f = faixaFC(base, id);
    if (f) linhas.push(h('div', { class: 'row between center switch-row' }, [
      h('span', { text: ZONAS[id].nome }), h('strong', { text: `${f.min}–${f.max} bpm` }),
    ]));
  }
  const medInp = h('input', { type: 'checkbox', ...(base.fcMedicacao ? { checked: 'checked' } : {}) });
  medInp.addEventListener('change', () => {
    const merged = { ...base, fcMedicacao: medInp.checked };
    delete merged._override;
    store.setPerfilOverride(ctx.userId, merged);
    toast(medInp.checked ? 'Faixas ajustadas para baixo (segurança).' : 'Faixas voltaram ao cálculo padrão.');
    ctx.refresh();
  });
  view.appendChild(h('div', { class: 'card' }, [
    h('h3', { text: '🫀 Batimentos no cardio' }),
    idadeAtual ? h('p', { class: 'muted tiny', text: `FC máxima estimada: ${fcMaxEstimada(idadeAtual)} bpm (${idadeAtual} anos)` + (base.fcRepouso ? ' · calculado por FC de reserva' : '') })
          : h('p', { class: 'warn tiny', text: 'Preencha o nascimento acima para eu calcular as faixas.' }),
    ...linhas,
    h('label', { class: 'row between center switch-row' }, [
      h('span', { text: 'Uso medicação que altera os batimentos' }), medInp,
    ]),
    h('p', { class: 'muted tiny', text: 'Marque se você toma remédio para pressão/coração (ex.: betabloqueador). As faixas ficam mais conservadoras e a intensidade passa a ser guiada pela percepção de esforço.' }),
    base.fcMedicacao == null ? h('p', { class: 'warn tiny', text: '⚠️ Responda essa pergunta acima — ela muda a faixa recomendada. Fica salvo só neste aparelho.' }) : null,
    h('button', { class: 'btn ghost sm', text: 'Como usar no Apple Watch', onClick: () => modal('Batimentos no treino',
      h('div', { class: 'instructions' }, [h('ul', { class: 'inst-list' }, explicacaoFC(faixaFC(base, 'moderado'), base).map((t) => h('li', { text: t })))])) }),
  ]));

  // Objetivo (resumo + editar)
  const temObjetivo = base.objetivo && !/a definir/i.test(base.objetivo);
  const meta = [];
  if (base.foco && base.foco.length) meta.push('Foco: ' + base.foco.join(', '));
  if (base.duracaoAlvoMin) meta.push(`${base.duracaoAlvoMin} min`);
  if (base.frequenciaSemana) meta.push(`${base.frequenciaSemana}x/sem`);
  view.appendChild(h('div', { class: 'card focus-card', style: 'cursor:default' }, [
    h('div', {}, [
      h('div', { class: 'tiny label-accent', text: '🎯 Objetivo' }),
      h('strong', { text: temObjetivo ? base.objetivo : 'Ainda não definido' }),
      meta.length ? h('div', { class: 'muted tiny', text: meta.join(' · ') }) : null,
    ]),
    h('button', { class: 'btn primary sm', text: temObjetivo ? 'Editar' : 'Definir', onClick: () => ctx.navigate('#/objetivo') }),
  ]));

  // Considerações de treino (do perfil clínico não-sensível), se houver
  if (base.consideracoesTreino && base.consideracoesTreino.length) {
    view.appendChild(h('div', { class: 'card' }, [
      h('h3', { text: 'Considerações no treino' }),
      h('ul', { class: 'inst-list' }, base.consideracoesTreino.map((c) => h('li', { text: c }))),
      base.avaliacaoMedica ? h('p', { class: 'muted tiny', text: '⚕️ ' + base.avaliacaoMedica }) : null,
    ]));
  }

  if (base._override) {
    view.appendChild(h('button', { class: 'btn ghost danger block', text: 'Restaurar perfil padrão', onClick: async () => {
      if (await confirmDialog('Restaurar padrão', 'Voltar ao perfil padrão do app (apaga suas edições de perfil)?')) { store.clearPerfilOverride(ctx.userId); toast('Perfil restaurado.'); ctx.refresh(); }
    } }));
  }
}

// ---------- Questionário de objetivo ----------
export function renderObjetivo(view, ctx) {
  const base = ctx.perfil() || {};
  const objetivoAtual = base.objetivo && !/a definir/i.test(base.objetivo) ? base.objetivo : '';
  const state = {
    objetivo: objetivoAtual,
    foco: [...(base.foco || [])],
    duracaoAlvoMin: base.duracaoAlvoMin || 30,
    frequenciaSemana: base.frequenciaSemana || 3,
    cardioIncluir: base.cardio ? base.cardio.incluir !== false : true,
    cardioQuando: base.cardioQuando || (base.cardio && base.cardio.quando) || 'fim',
  };

  view.appendChild(h('h2', { text: 'Meu objetivo' }));
  view.appendChild(h('p', { class: 'muted tiny', text: 'Isso guia o "Treino do dia" e o que aparece na Home.' }));

  const objInput = h('input', { class: 'text-input', value: state.objetivo, placeholder: 'Escreva ou escolha abaixo' });
  objInput.addEventListener('input', () => { state.objetivo = objInput.value; drawObj(); });
  const objChips = h('div', { class: 'chip-wrap' });
  const drawObj = () => [...objChips.children].forEach((c) => c.classList.toggle('sel', c.textContent === state.objetivo));
  OBJETIVOS.forEach((o) => objChips.appendChild(h('button', { class: 'chip', text: o, onClick: () => { state.objetivo = o; objInput.value = o; drawObj(); } })));
  view.appendChild(h('div', { class: 'card' }, [h('div', { class: 'tiny label-accent', text: '1 · Objetivo principal' }), h('label', { class: 'field-col' }, [objInput]), objChips]));
  drawObj();

  const focoChips = h('div', { class: 'chip-wrap' });
  const drawFoco = () => [...focoChips.children].forEach((c) => c.classList.toggle('sel', state.foco.includes(c.dataset.f)));
  FOCOS.forEach((f) => focoChips.appendChild(h('button', { class: 'chip', dataset: { f }, text: f, onClick: () => {
    const i = state.foco.indexOf(f); if (i >= 0) state.foco.splice(i, 1); else state.foco.push(f); drawFoco();
  } })));
  view.appendChild(h('div', { class: 'card' }, [h('div', { class: 'tiny label-accent', text: '2 · Foco muscular (pode escolher mais de um)' }), focoChips]));
  drawFoco();

  const durChips = chipRow([20, 30, 45, 60].map((m) => ({ v: m, t: m + ' min' })), () => state.duracaoAlvoMin, (v) => state.duracaoAlvoMin = v);
  view.appendChild(h('div', { class: 'card' }, [h('div', { class: 'tiny label-accent', text: '3 · Tempo por treino (padrão)' }), durChips]));

  const freqChips = chipRow([2, 3, 4, 5, 6].map((n) => ({ v: n, t: n + 'x' })), () => state.frequenciaSemana, (v) => state.frequenciaSemana = v);
  view.appendChild(h('div', { class: 'card' }, [h('div', { class: 'tiny label-accent', text: '4 · Treinos por semana' }), freqChips]));

  const cardioBox = h('div', {});
  const drawCardio = () => {
    clear(cardioBox);
    cardioBox.appendChild(chipRow([{ v: true, t: 'Sim' }, { v: false, t: 'Não' }], () => state.cardioIncluir, (v) => { state.cardioIncluir = v; drawCardio(); }));
    if (state.cardioIncluir) {
      cardioBox.appendChild(h('div', { class: 'tiny muted', text: 'Quando fazer o cardio:' }));
      cardioBox.appendChild(chipRow([
        { v: 'fim', t: 'No fim do treino' },
        { v: 'inicio', t: 'Antes da musculação' },
        { v: 'separado', t: 'Em dias separados' },
      ], () => state.cardioQuando, (v) => state.cardioQuando = v));
      cardioBox.appendChild(h('p', { class: 'muted tiny', text: 'Para força/massa, o cardio no fim rende mais. Antes, prefira só 5-10 min leves de aquecimento.' }));
    }
  };
  drawCardio();
  view.appendChild(h('div', { class: 'card' }, [h('div', { class: 'tiny label-accent', text: '5 · Cardio' }), cardioBox]));

  view.appendChild(h('div', { class: 'workout-footer' }, [
    h('button', { class: 'btn primary block big', text: 'Salvar objetivo', onClick: () => {
      if (!state.objetivo.trim()) return toast('Escreva ou escolha um objetivo.');
      const merged = {
        ...base,
        objetivo: state.objetivo.trim(),
        foco: state.foco.filter((f) => f !== 'corpo todo'),
        duracaoAlvoMin: state.duracaoAlvoMin,
        duracaoOpcoesMin: base.duracaoOpcoesMin || [20, 30, 45, 60],
        frequenciaSemana: state.frequenciaSemana,
        cardio: { ...(base.cardio || {}), incluir: state.cardioIncluir, quando: state.cardioQuando },
        cardioQuando: state.cardioQuando,
      };
      delete merged._override;
      store.setPerfilOverride(ctx.userId, merged);
      toast('Objetivo salvo!'); ctx.navigate('#/perfil');
    } }),
  ]));
}

function chipRow(opts, get, set) {
  const wrap = h('div', { class: 'chip-wrap' });
  const draw = () => [...wrap.children].forEach((c, i) => c.classList.toggle('sel', opts[i].v === get()));
  opts.forEach((o) => wrap.appendChild(h('button', { class: 'chip', text: o.t, onClick: () => { set(o.v); draw(); } })));
  draw();
  return wrap;
}

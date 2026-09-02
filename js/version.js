// version.js — controle de versão do app + histórico de novidades (changelog).
// AO FAZER UM UPDATE: suba o APP_VERSION e acrescente uma entrada no topo do CHANGELOG.
// (E lembre de subir a VERSION em service-worker.js para renovar o cache dos celulares.)

export const APP_VERSION = '1.9';

export const CHANGELOG = [
  {
    v: '1.9', data: '2026-09-02', titulo: 'Treinos mais inteligentes',
    itens: [
      'Trocar um exercício por QUALQUER outro (os equivalentes aparecem destacados).',
      'Ajuste de peso de 1 em 1 kg.',
      'Opção "sempre incluir abdominal" no Treino do dia (ligada por padrão para o Tiago).',
      'Sugestão de carga e repetições conforme o seu objetivo e histórico (sobe a carga só depois de sessões boas).',
      '4 variações de abdominal (prancha lateral, elevação de pernas, bicicleta, escalador).',
    ],
  },
  {
    v: '1.8', data: '2026-09-02', titulo: 'Perfil e personalização',
    itens: [
      'Aba Perfil com seus dados editáveis + questionário de objetivo.',
      'A dica e o objetivo na Home podem ser fechados (e ligados/desligados em Config).',
      'A carga não reduz sozinha entre sessões (memória de carga).',
    ],
  },
  {
    v: '1.7', data: '2026-09-02', titulo: 'Ilustrações',
    itens: ['Ilustração do movimento (início → fim) em todos os exercícios, nas instruções.'],
  },
  {
    v: '1.6', data: '2026-09-01', titulo: 'Treino do dia e histórico',
    itens: [
      'Treino do dia: escolhe tempo + modalidade e monta o treino pra você.',
      'Substituir e cancelar treino; registrar e editar treinos no histórico.',
      'Dicas práticas com embasamento no lugar das frases motivacionais.',
    ],
  },
  {
    v: '1.0', data: '2026-09-01', titulo: 'Primeira versão',
    itens: ['Modo treino com check e timers, instruções, histórico e progressão, backup e PWA.'],
  },
];

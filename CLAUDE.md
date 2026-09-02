# Achilles — Guia do Projeto (para o Claude e para o Tiago)

> **Este é o arquivo-mestre.** Se você abrir o projeto em outra máquina ou em outro login do Claude,
> comece lendo aqui. Ele explica o que é o app, como está organizado, como rodar/publicar e o que
> já foi feito / o que falta.

## O que é
Webapp (PWA) responsivo, **mobile-first**, para controle de musculação de **duas pessoas sem login**
(Tiago e esposa). Hospedado no **GitHub Pages**. Sem backend e **sem build** — HTML + CSS + JavaScript
vanilla (ES modules). O app é **movido por JSON**: treinos e exercícios são arquivos em `data/`, então
**criar/editar treino = editar JSON** (o código não muda).

## Princípios de arquitetura (importante manter)
- **Sem etapa de build.** Nada de bundler/npm. O Pages serve os arquivos direto e qualquer arquivo é
  editável pelo Claude sem pipeline. Não introduza um passo de build sem necessidade real.
- **Dados separados do código.** Conteúdo em `data/*.json` (versionado no git, editável pelo Claude).
  Uso/histórico em `localStorage` (por usuário), com backup export/import.
- **`js/store.js` é a única camada de armazenamento.** Para trocar por sync em nuvem (ex.: git/token)
  no futuro, reimplemente só esse módulo.

## Mapa de arquivos
```
index.html            Shell (header, view, tabbar) + registro do service worker
manifest.json         PWA
service-worker.js     Offline (cache-first no app, network-first em data/). Bump VERSION ao mudar o app.
assets/css/styles.css Tema escuro, mobile-first, safe-area (notch)
assets/icons/         icon.svg + PNGs (gerados por scratchpad/gen_icons.py)
js/
  app.js         Init, roteador (hash), telas Home / Seleção de usuário / Config+Backup
  data.js        Carrega os JSON de data/
  store.js       localStorage + export/import de backup (única camada de dados)
  ui.js          Helpers de DOM, modal, toast, som/vibração, formatação
  workout.js     MODO TREINO: séries, check, timers, instruções, cancelar, substituir/±exercício, finalizar
  recommend.js   "Treino do dia": pergunta tempo + modalidade e sugere o treino (histórico + objetivos)
  session-edit.js Registrar um treino já feito e editar/excluir sessões do histórico
  perfil.js       Aba Perfil (dados editáveis do usuário) + questionário de objetivo (override no localStorage)
  history.js     Histórico, recordes (PR), gráficos SVG, progresso por exercício
  plans.js       Lista/detalhe de planos + montador de treinos personalizados
  progression.js Sugestão de sobrecarga progressiva (estilo Fitbod)
  motivation.js  Dicas práticas (técnicas/médicas/psicológicas), streak, volume semanal
data/
  exercises.json      Biblioteca (instruções didáticas PT-BR)
  equipment.json      Equipamentos reais (Academia Euroville + pista na rua + bike em casa)
  perfis.json         Perfil de TREINO por usuário (objetivo, foco, duração, considerações) — NÃO clínico
  users.json          Tiago + Elisa
  plans/index.json    Lista de planos a carregar (adicione novos aqui!)
  plans/*.json        Planos de treino
docs/
  SCHEMA.md               Contrato de todos os JSON
  PROMPT-CRIAR-TREINOS.md Como montar o Projeto no Claude.ai que gera treinos no formato do app
```

## Como rodar localmente
Service worker/ES modules exigem servidor http (não abra via `file://`):
```bash
cd "$(dirname CLAUDE.md)"   # a pasta do projeto
python3 -m http.server 8000
# abra http://localhost:8000
```

## Como publicar no GitHub Pages
O usuário tem conta no GitHub, ainda **sem repositório**. Passos (ver `README.md` para detalhes):
1. `git init && git add -A && git commit -m "Achilles"` na pasta do projeto.
2. Criar repo (ex.: `gh repo create achilles --public --source=. --push`) ou pelo site e dar push.
3. GitHub → **Settings → Pages → Deploy from branch → `main` / root**.
4. Abrir `https://bitnied.github.io/Achilles/` no celular e “Adicionar à tela de início”.
5. Ao atualizar o app: **suba `APP_VERSION` e adicione uma entrada no `CHANGELOG` em `js/version.js`**
   (aparece no topo da Home como "novidades") **e suba a `VERSION` em `service-worker.js`** para forçar
   o cache novo nos celulares.

## Privacidade / dados de saúde (IMPORTANTE)
As fichas clínicas (pasta `Fichas Clinicas/`) contêm dados sensíveis (medicações, saúde mental,
histórico familiar). Elas estão no `.gitignore` e **nunca** devem ir para o repositório público nem
para treinos publicados. Para o app e o gerador, use apenas `data/perfis.json` (objetivo, foco,
duração, considerações de execução — sem dados clínicos). Se quiser versionar a ficha, use um
repositório **privado**. Nada aqui é aconselhamento médico: recomende avaliação profissional.

## Modelo de dados
Resumo em `docs/SCHEMA.md`. Chave: exercícios têm `tipo` (`reps`/`tempo`/`peso_corporal`); planos têm
`dias[].exercicios[]`; histórico fica no `localStorage` por usuário; `esforco` por série alimenta a
progressão.

## Backup / sincronização (decisão do projeto)
Sync escolhido: **local (localStorage) + backup manual**. Atualizar o app **não apaga** o histórico
(mesma origem). Para trocar de aparelho ou deixar o Claude analisar a evolução: aba **Config → Exportar
backup** (salva um JSON — coloque na pasta do iCloud do projeto) e **Importar** no outro aparelho
(mescla sem duplicar). Botão **“Copiar histórico”** copia o JSON para colar no Claude.
Limitação assumida: os históricos dos dois celulares **não** sincronizam sozinhos entre si.

## Como criar/editar treinos (3 formas)
1. **No app**: aba Treinos → “+ Criar” (montador). Fica salvo no `localStorage` daquele aparelho.
2. **Editando JSON** em `data/plans/` e registrando o arquivo em `data/plans/index.json` (fica no git,
   vale para todos os aparelhos após deploy).
3. **Pelo Claude** (aqui ou no Projeto do Claude.ai de `docs/PROMPT-CRIAR-TREINOS.md`): peça o treino,
   salve o JSON em `data/plans/` e atualize o `index.json`.

## Estado atual (2026-09-02)
✅ **Concluído e testado ponta a ponta** (seleção de usuário, home, modo treino com check, timer de
descanso, timer por tempo, instruções, finalizar+salvar, histórico com gráficos/PR, progressão,
montador de treinos, backup export/import, PWA, ícones).
✅ **Rodada UX/features**: botão voltar no cabeçalho; **"Treino do dia"** (pergunta tempo → modalidade
musc/cardio → sugere o treino a partir do histórico e do objetivo/foco, com o cardio ajustado ao tempo);
**substituir** exercício por equivalente e **adicionar/remover** exercícios/séries no treino; **cancelar**
treino (no modo treino e no card de retomar); **registrar treino já feito** e **editar/excluir** sessões
do histórico; frases motivacionais trocadas por **dicas práticas com embasamento**.
✅ **Rodada Perfil/UX**: **aba Perfil** (5ª aba) com dados editáveis do usuário (altura, peso, nascimento,
observações) + o objetivo; destaques da Home (dica e objetivo) **fecháveis** e com liga/desliga em Config
(**Tela inicial**); **memória de carga** — ao alterar o peso de um exercício, ele vira o piso da próxima
sessão (a carga nunca reduz sozinha). Perfil editado é salvo como override por usuário (`achilles:perfil:<id>`),
preservando as considerações clínicas do perfil base; última carga em `achilles:weights:<id>`.
Equipamentos reais da Academia Euroville já
mapeados em `data/equipment.json` (a partir das fotos em `Aparelhos da Academia Euroville/`), com
exercícios de máquina/barra/cardio na biblioteca e o plano `euroville-full-body`. Falta apenas:
**criar o repo e publicar no Pages** (passo do usuário).

## Ideias para evoluir (backlog)
- Sync automático opcional via token do GitHub (novo adaptador em `store.js`).
- Mais exercícios/planos (usar o Projeto do Claude.ai).
- Superséries, aquecimento/drop set como tipos de série.
- Gráfico de volume por grupo muscular; metas semanais.
- Vídeos de execução (`videoUrl` já suportado em exercises.json).

# 🏋️ Achilles

Webapp de controle de musculação — treinos personalizados, checklist durante o treino, timers,
instruções didáticas, evolução de carga e motivação. Mobile-first, funciona offline (PWA), sem login,
para duas pessoas. Sem backend e sem build: HTML + CSS + JavaScript puro, pronto para o **GitHub Pages**.

## Funciona assim
- **Escolha o perfil** (você ou sua esposa) — cada um tem seu histórico.
- **Inicie um treino**: marque cada série, ajuste peso/reps na hora, use o **timer de descanso** e o
  **cronômetro** para exercícios por tempo (prancha, ponte). Toque em **ⓘ** para ver as instruções.
- **Acompanhe a evolução**: histórico, recordes e gráficos por exercício, com **sugestão de carga**.
- **Monte seus treinos** no app ou peça ao Claude (veja `docs/PROMPT-CRIAR-TREINOS.md`).
- **Backup**: exporte/importe seus dados (aba Config) — salve o arquivo na pasta do iCloud.

## Rodar localmente
```bash
python3 -m http.server 8000
# abra http://localhost:8000
```
(Precisa de servidor http por causa do service worker e dos módulos JS — não abra por `file://`.)

## Publicar no GitHub Pages
1. Na pasta do projeto:
   ```bash
   git init && git add -A && git commit -m "Achilles: primeira versão"
   ```
2. Crie o repositório e faça push. Com o GitHub CLI:
   ```bash
   gh repo create achilles --public --source=. --push
   ```
   (ou crie pelo site github.com e siga as instruções de `git remote add` / `git push`.)
3. No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**.
4. Aguarde ~1 min e acesse `https://SEU-USUARIO.github.io/achilles/`.
5. No celular, use **Compartilhar → Adicionar à Tela de Início** para instalar como app.

> Ao atualizar o app, suba a `VERSION` em `service-worker.js` para o cache renovar nos aparelhos.

## Estrutura
Veja **[CLAUDE.md](CLAUDE.md)** para o guia completo (arquitetura, modelo de dados, como continuar em
outra máquina) e **[docs/SCHEMA.md](docs/SCHEMA.md)** para o formato dos dados.

## Personalizar
- **Equipamentos**: edite `data/equipment.json` para refletir a sua academia.
- **Perfis**: edite `data/users.json`.
- **Exercícios/treinos**: edite `data/exercises.json` e `data/plans/` (registre novos planos em
  `data/plans/index.json`), ou gere pelo Claude.

Feito para ser atualizado e evoluído com o Claude. 💪

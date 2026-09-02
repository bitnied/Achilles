# Como continuar o app Achilles em outro Mac (passo a passo)

> Guia simples, sem jargão. Objetivo: abrir o projeto no **outro computador**, em **outra conta do Claude**,
> e seguir trabalhando com a ajuda do Claude Code, usando o **git** para manter tudo em dia.

## Ideia geral (leia isto primeiro)
- **"Projeto no Claude" = abrir esta pasta no Claude Code.** Ao abrir a pasta, o Claude Code **lê sozinho**
  o arquivo **`CLAUDE.md`** (na raiz), que é o "manual" do projeto. Não precisa criar mais nada.
- A pasta está no **iCloud** e os dois Macs usam a **mesma conta Apple**, então ela **já aparece** no outro
  Mac (inclusive o histórico do git).
- Para o **código**, confie no **git** (não no iCloud). O GitHub é a "fonte da verdade".

## Regra de ouro (evita 99% dos problemas)
1. **Sempre `git pull` antes de começar** (pega a versão mais nova).
2. **Sempre `git push` ao terminar** (salva e publica).
3. **Nunca edite nos dois Macs ao mesmo tempo.** Termine num, dê `push`, e só então trabalhe no outro com `pull`.
> Você pode simplesmente pedir ao Claude Code: **"Faça git pull"** e, no fim, **"Faça commit e push"**.

## Passo a passo no outro Mac
1. **Instale o Claude Code** e entre com a sua outra conta.
2. No **Finder → iCloud Drive → Projetos → Achilles**, confirme que a pasta está **baixada**
   (se tiver ícone de nuvem ☁️ nos arquivos, clique com o botão direito na pasta → **Baixar agora**).
3. Abra o **Terminal** e entre na pasta (copie e cole):
   ```bash
   cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/Projetos/Achilles
   ```
4. Puxe a versão mais recente do GitHub:
   ```bash
   git pull
   ```
5. **Abra o Claude Code nessa pasta.** Ele lê o `CLAUDE.md` automaticamente. Para garantir, sua primeira
   mensagem pode ser:
   > **"Leia o CLAUDE.md e me diga o estado atual do projeto e o que falta."**
6. Trabalhem normalmente. Ao terminar, peça ao Claude:
   > **"Faça commit e push das mudanças."**
   Isso publica no GitHub e atualiza o site (GitHub Pages) em ~1 minuto.

## Se a pasta NÃO estiver no outro Mac (plano B)
Se por algum motivo a pasta não aparecer via iCloud, dá para baixar direto do GitHub. No Terminal:
```bash
git clone https://github.com/bitnied/Achilles.git ~/Achilles
```
Depois abra `~/Achilles` no Claude Code. (Aqui o projeto fica **fora** do iCloud — tudo bem, o git cuida da sincronização.)

## Publicar uma atualização (depois de mexer no app)
1. Peça ao Claude: **"Faça commit e push"** (ou rode `git push`).
2. O GitHub Pages **republica sozinho**. Se o Claude mexeu no `service-worker.js`, ele sobe a `VERSION`
   para o cache dos celulares renovar — é só recarregar o app no celular.

## Importante: dados dos celulares NÃO estão aqui
Mexer no app pelo outro Mac altera o **código/conteúdo** (via git). O **histórico de treinos** de cada
pessoa fica **no celular dela** (não no git). Para levar/analisar esse histórico, use os backups —
veja **`BACKUP-E-SINCRONIZACAO-CELULAR.md`**.

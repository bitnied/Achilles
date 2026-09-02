# Backup: subir os dados do celular para a nuvem (iCloud)

> Os dados de uso do app (histórico de treinos, pesos, objetivo editado) ficam **só no celular** de cada
> pessoa — não vão para nenhum servidor. Para guardar em segurança, trocar de aparelho ou deixar o Claude
> analisar a evolução, exporte um **backup** e salve na pasta do iCloud do projeto. Faça isso de vez em
> quando (ex.: 1x por semana).

## Por que fazer backup
- Se você limpar o Safari, trocar de celular ou ficar dias sem abrir o app, o iPhone **pode apagar** os
  dados do site. O backup protege contra isso.
- Cada pessoa faz no **seu próprio** celular (o do Tiago e o da Elisa são separados).
- **Dica:** no celular, use **Compartilhar → Adicionar à Tela de Início** para instalar o app. Assim os
  dados ficam mais duráveis.

## Exportar do iPhone e salvar no iCloud (passo a passo)
1. No app (celular), abra a aba **⚙️ Config**.
2. Toque em **⬇ Exportar backup**. O iPhone baixa um arquivo com nome tipo
   `achilles-backup-tiago-2026-09-02.json` (ou `...-elisa-...`).
3. O arquivo vai para o app **Arquivos (Files) → Downloads**. (No Safari, também aparece a setinha de
   download ⤓ perto da barra de endereço — toque nela para achar o arquivo.)
4. Abra o app **Arquivos** → **Downloads** → **segure o dedo** no arquivo `achilles-backup-...json` →
   **Mover** → escolha **iCloud Drive → Projetos → Achilles → backups**.
   - Se não existir a pasta **backups**, crie uma (toque nos "…" → Nova Pasta) dentro de **Achilles**.
5. Pronto! Como está no iCloud, o arquivo aparece nos seus Macs — e o Claude consegue ler para analisar
   a evolução e sugerir aumento de carga.

## Restaurar / trocar de aparelho (importar)
1. No app do outro aparelho: **Config → ⬆ Importar backup**.
2. Escolha o arquivo `.json` (navegue até **iCloud Drive → Projetos → Achilles → backups**).
3. Ele **mescla** com o que já existe, **sem duplicar** treinos.

## O botão "📋 Copiar histórico (p/ o Claude)"
Esse botão **não** faz upload de nada. Ele apenas **copia o seu histórico de treinos como texto** para a
área de transferência (o "copiar" do celular). Serve para você **colar** esse texto direto numa conversa
com o Claude, para ele **ler os seus números reais** (pesos, repetições, datas, esforço) e sugerir a
progressão — sem precisar mandar arquivo.

**Como usar:**
1. Config → toque em **📋 Copiar histórico (p/ o Claude)**.
2. Abra uma conversa com o Claude (app ou site) e **cole** (segure o dedo → Colar).
3. Escreva algo como: *"Analise minha evolução e sugira os próximos pesos."*

**Diferença para o backup:**
- **Exportar backup** = arquivo completo com **tudo** (para guardar/restaurar/trocar de aparelho).
- **Copiar histórico** = só o histórico, como **texto**, para **colar no Claude** e analisar. Não serve
  para restaurar dados.

## Limitação assumida
Os históricos dos dois celulares **não** sincronizam sozinhos entre si. O backup (export → iCloud →
import) é a ponte manual. No futuro dá para ligar sincronização automática via GitHub — a arquitetura
já está preparada (é só pedir ao Claude).

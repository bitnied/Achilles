# Schema dos dados — Achilles

Fonte da verdade dos formatos JSON usados pelo app e pelo gerador de treinos.
Todos os arquivos de conteúdo ficam em `data/`. O app carrega tudo em `js/data.js`.

## `data/exercises.json`
Biblioteca de exercícios (com instruções didáticas).
```jsonc
{
  "exercicios": [
    {
      "id": "agachamento-goblet",          // único, kebab-case
      "nome": "Agachamento Goblet (com halter)",
      "grupos": ["pernas", "glúteos"],      // grupos musculares
      "equipamento": ["halteres"],          // ids de equipment.json
      "tipo": "reps",                        // "reps" | "tempo" | "peso_corporal"
      "descansoPadraoSeg": 90,
      "tempoPadraoSeg": 30,                  // só quando tipo = "tempo"
      "incrementoKg": 2,                     // menor salto de carga (0 = peso corporal)
      "videoUrl": "https://...",             // opcional (link direto)
      "videoBusca": "agachamento goblet execução correta",  // termo de busca no YouTube (fallback estável)

      // --- carga inicial em kg (v2.0): usado quando NÃO há histórico ---
      "cargaInicial": {
        "fator": 0.15,        // fração do peso corporal
        "unidade": "total",   // "halter" (por halter) | "total" | "maquina" | "barra"
        "min": 6, "max": 20   // piso e teto de segurança para a 1ª vez
      },

      // --- contagem de repetições (exercícios alternados) ---
      "contagem": "por_lado",        // "por_lado" | "ambos" | "tempo_lado" | "tempo"
      "unilateral": true,
      "contagemTexto": "As repetições contam POR PERNA: 10 reps = 10 de cada lado.",
      "acessorios": ["luvas"],        // o app avisa antes do treino

      // --- cardio ---
      "nivel": "iniciante",           // "iniciante" | "intermediario"
      "impacto": "baixo",             // "baixo" | "moderado" | "alto"
      "metrica": "tempo",             // métrica principal (o padrão do app é tempo)
      "permiteDistancia": true,       // habilita o campo km (opcional)
      "fcZona": "moderado",           // "leve" | "moderado" | "vigoroso" | "intervalado"
      "prioridadeCardio": 6,          // maior = preferido na sugestão (caminhada > corrida)

      "instrucoes": {
        "resumo": "string",
        "passos": ["string", "..."],
        "dicas": ["string", "..."],
        "errosComuns": ["string", "..."]
      }
    }
  ]
}
```

## `data/plans/<arquivo>.json`
Um plano de treino (um ou vários dias).
```jsonc
{
  "id": "full-body-a",                 // único
  "nome": "Full Body A",
  "descricao": "string",
  "nivel": "iniciante",                // livre
  "dias": [
    {
      "nome": "Treino A",
      "exercicios": [
        {
          "exerciseId": "agachamento-goblet",  // deve existir em exercises.json
          "series": 3,
          "repsAlvo": 12,
          "pesoAlvo": 10,                        // kg inicial (0 = peso corporal)
          "descansoSeg": 90,
          "porTempo": false,                     // true para isometria (prancha, ponte)
          "tempoSeg": 30                         // usado quando porTempo = true
        }
      ]
    }
  ]
}
```

## `data/plans/index.json`
Lista de arquivos de plano que o app deve carregar. **Ao adicionar um plano novo, inclua o nome do arquivo aqui.**
```json
{ "planos": ["exemplo-full-body-a.json", "exemplo-full-body-b.json"] }
```

## `data/equipment.json`
Equipamentos disponíveis (restringe o que os treinos podem usar).
```jsonc
{
  "local": "Academia de condomínio",
  "equipamentos": [
    { "id": "halteres", "nome": "Halteres", "detalhe": "1-20kg", "disponivel": true }
  ],
  "incrementoPadraoKg": 2
}
```

## `data/users.json`
Perfis (sem login).
```json
{ "usuarios": [ { "id": "tiago", "nome": "Tiago", "cor": "#f97316", "emoji": "🔥" } ] }
```

## localStorage (gerado pelo app — não editar à mão)
- `achilles:activeUser` → id do usuário ativo.
- `achilles:history:<userId>` → array de sessões concluídas.
- `achilles:current:<userId>` → sessão em andamento (para retomar).
- `achilles:customPlans` → planos criados dentro do app.
- `achilles:settings` → `{ som, vibrar, mostrarDica, mostrarObjetivo }` (do aparelho).
- `achilles:perfil:<userId>` → override do perfil de treino (sobrepõe `data/perfis.json`).
  Guarda também as preferências POR USUÁRIO: `descansoTimer`, `avisoWatch`, `esforcoModo`
  (`serie|exercicio|fim`), `dummi`, `cardioQuando` (`fim|inicio|separado`), `cardioMetrica`,
  `sempreAbdominal`, `sexo`, `pesoAtual`, `altura`, `nascimento`, `fcRepouso` e `fcMedicacao`.
  **`fcRepouso`/`fcMedicacao`/peso são dados de saúde: ficam SÓ no aparelho (nunca em `data/`).**
- `achilles:weights:<userId>` → última carga usada por exercício (memória de carga).
- `achilles:lastBackup` → data do último backup.

### Sessão (item do histórico)
```jsonc
{
  "id": "1693591234567",
  "data": "2026-09-01",
  "userId": "tiago",
  "planId": "full-body-a",
  "planNome": "Full Body A",
  "diaNome": "Treino A",
  "duracaoSeg": 2400,
  "itens": [
    {
      "exerciseId": "agachamento-goblet",
      "nome": "Agachamento Goblet (com halter)",
      "tipo": "reps",
      "series": [
        { "peso": 10, "reps": 12, "repsAlvo": 12, "tempoSeg": 0, "distanciaKm": 0, "feito": true, "esforco": "Médio" }
      ]
    }
  ]
}
```
`esforco` ∈ `Fácil | Médio | Difícil | Falhou` — alimenta a sugestão de progressão em `js/progression.js`.
Vem pré-marcado como `Médio`; a pergunta acontece por série, por exercício (padrão) ou só no fim,
conforme `esforcoModo` no perfil. `distanciaKm` é opcional (cardio) — a métrica principal é o tempo.
`duracaoSeg` é apenas informativo: o app **não** usa cronômetro de sessão (quem conta o tempo é o
Apple Watch); as calorias estimadas saem de METs × peso × tempo estimado (`js/metrics.js`).

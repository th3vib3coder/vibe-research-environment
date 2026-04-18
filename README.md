# Vibe Research Environment

**When you do research with AI, the work disappears into chat.**
Analyses get lost, experiments stop being reproducible, claims become hard to
verify, and drafts mix facts with speculation. After a few days, nobody knows
what was done, with which data, and what can actually be defended.

VRE solves that by keeping research work on disk in a way that stays
inspectable, resumable, and safe to package.

---

### What It Does

VRE is an **operational shell** you put around AI-assisted research work
(Claude Code, Codex, Gemini CLI, or similar agentic environments). It:

- **tracks literature and experiments** with explicit state
- **stores results and artifacts** in structured on-disk bundles
- **manages memory** through readable mirrors and explicit refresh
- **prepares writing handoff and advisor-facing packs** without mixing verified
  content and speculation
- **coordinates work** through a visible queue, explicit lanes, and honest
  recovery/escalation
- **does not invent truth**: it does not write scientific truth, does not
  auto-capture preferences from chat, and does not run hidden background work

---

### Who It Is For

- Researchers using AI for data-driven work such as bioinformatics, scRNA-seq,
  omics, and adjacent domains
- People who need AI-assisted work to stay **auditable and resumable**, instead
  of being buried in chat history
- Anyone preparing outputs for advisors, co-authors, or thesis work without
  blurring real results and hallucinated content

It is **not** aimed at someone looking for a generic chatbot or a point-and-
click dashboard.

---

### Where It Runs

VRE is local Node.js code. It is not a cloud service.

It works with:

- **Claude Code**
- **Codex**
- **Any agentic environment** that can read files and execute JS modules

The core system under [`environment/`](environment/) is not tied to one model
provider. The files under [`commands/`](commands/) are command contracts for an
agent to follow; they are **not** a polished standalone CLI dispatcher.

---

### How You Use It Today

1. Clone the repo
2. Run `npm install`
3. Run `npm run check` and make sure everything is green (`507/508` tests,
   `12` validators — one declared skip for the live-kernel probe, activated by
   `VRE_KERNEL_PATH` pointing at a sibling `vibe-science` checkout)
4. Keep a sibling checkout of `vibe-science` if you want kernel-backed
   projections; without it, many surfaces still work but degrade honestly in
   workspace-first mode
5. Open the repo in your agentic environment
6. Start from [`/flow-status`](commands/flow-status.md)
7. Register a paper with [`/flow-literature`](commands/flow-literature.md) or
   an experiment with [`/flow-experiment`](commands/flow-experiment.md)
8. Package results with [`/flow-results`](commands/flow-results.md)
9. Prepare a writing handoff with [`/flow-writing`](commands/flow-writing.md)
10. Inspect the state and artifacts written under
    [`.vibe-science-environment/`](.vibe-science-environment/)

For the orchestrator:

- [`/orchestrator-run`](commands/orchestrator-run.md) routes one objective into
  the queue
- [`/orchestrator-status`](commands/orchestrator-status.md) shows queue state,
  lanes, escalations, and the next recommended action

---

### How It Helps Data-Driven Research

VRE does **not** do statistics, QC, or modeling for you. It is not a
scientific engine. It is the **operating system around the science**.

In a workflow like scRNA-seq, its value looks like this:

| Real problem | What VRE gives you |
|--------------|--------------------|
| “What analysis did I run last week?” | Session and attempt state saved on disk |
| “Where did this result come from?” | Outputs linked to experiments and artifacts |
| “Can I send this draft to my advisor?” | Export eligibility separates verified from speculative |
| “The agent did things without telling me” | Visible queue, explicit escalation, honest recovery |
| “I lost context after closing the chat” | Memory mirrors and continuity profile |
| “A reviewer asked for the underlying material” | Bundles with structured artifacts and manifests |

The right formula is:

**real analytical pipelines + scientific kernel + VRE as the coordination shell**

Not: VRE instead of scientific methodology.

---

### Architecture At A Glance

```text
┌──────────────────────────────────────────────────┐
│  AI Agent (Claude Code / Codex / Gemini CLI)    │
├──────────────────────────────────────────────────┤
│  Local Orchestrator (Phase 5 MVP)               │
│  queue · lanes · review · recovery · continuity │
├──────────────────────────────────────────────────┤
│  VRE Operational Shell                          │
│  flows · packaging · memory · connectors        │
├──────────────────────────────────────────────────┤
│  Vibe Science Kernel                            │
│  truth · claims · citations · gates             │
└──────────────────────────────────────────────────┘
```

- The **kernel** owns scientific truth
- **VRE** owns workflow, packaging, export, and memory
- The **orchestrator** coordinates work through queue/lane/review/recovery
- The **agent** is the human-facing interface
- No layer is allowed to redefine the truth owned by the layer below it
- The **kernel bridge** (Phase 6+) serves live projections from the kernel
  with explicit `dbAvailable` / `sourceMode` / `degradedReason` metadata, so
  a degraded read can never masquerade as "verified zero"
- **Real provider CLI bindings** (Codex, Claude) produce adversarial review
  evidence marked with provider-specific `evidenceMode` contracts
  (`real-cli-binding-codex`, `real-cli-binding-claude`) that can be
  distinguished from mocked or smoke runs at the artifact level

---

### What Is In The Repo

| Directory | Purpose |
|-----------|---------|
| `environment/control/` | control plane, middleware, sessions, attempts, decisions |
| `environment/flows/` | literature, experiments, results, writing, digests |
| `environment/memory/` | mirrors, freshness, marks |
| `environment/orchestrator/` | shipped Phase 5 coordinator MVP |
| `environment/connectors/` | filesystem/Obsidian export substrate |
| `environment/automation/` | reviewable automations |
| `environment/domain-packs/` | domain presets such as `omics` |
| `environment/tests/` | schema, runtime, integration, eval, and CI coverage |
| `commands/` | command contracts for the agent |
| `blueprints/` | specs, implementation plans, closeout dossiers |
| `.vibe-science-environment/` | on-disk machine state; during development it contains both runtime state and saved evidence |

---

### How To Verify The Repo Actually Works

```bash
npm install
npm run check
```

If you want concrete proof instead of claims, start here:

- [Implementation plan index](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
  — current phase state at a glance
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
  — local orchestrator MVP (queue, lanes, review lineage with real provider
  evidence)
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md)
  — kernel bridge + real provider CLI waves + historical Outcome B
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md)
  — Gate 17 hook-runtime probe (no synthetic hook arrays) + `dbAvailable` /
  `sourceMode` honesty + real Codex `cwd: projectPath` contract
- [Kernel governance probe test](environment/tests/compatibility/kernel-governance-probe.test.js)
  — run with `VRE_KERNEL_PATH=<path to vibe-science>` for a live bidirectional
  probe against the sibling kernel
- [Saved-artifact eval tests](environment/tests/evals/saved-artifacts.test.js)
  — enforces `evidenceMode: "real-cli-binding-codex"` + durable
  `externalReview` record for the Phase 5 Gate 3 lineage artifact
- [Operator-validation artifacts](.vibe-science-environment/operator-validation/)

---

### What It Is Not

- Not a generic agent platform
- Not a SaaS dashboard
- Not an automatic paper generator
- Not a hidden memory layer that invents continuity from chat
- Not a replacement for the scientific kernel
- Not a replacement for scientific methodology

It is a **work shell** for serious AI-assisted research where state, packaging,
review, and recovery must remain inspectable.

---

### Entry Points

- [Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Implementation Plan](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md) — kernel bridge + real provider CLI
- [Phase 6.1 Closeout](blueprints/definitive-spec/implementation-plan/phase6_1-closeout.md) — follow-up closure
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md) — hook runtime verification + envelope honesty
- [Orchestrator Spec](blueprints/definitive-spec/surface-orchestrator/00-index.md)

---
=========================================================================================
## Italiano

**Quando fai ricerca con l'AI, il lavoro sparisce nella chat.**
Analisi perse, esperimenti non ripetibili, claim non verificabili, draft che
mescolano fatti e speculazioni. Nessuno sa cosa è stato fatto, con quali dati,
e cosa si può davvero affermare.

VRE risolve questo: tiene traccia di tutto il lavoro di ricerca su disco, in
modo ispezionabile, riprendibile e sicuro da impacchettare.

---

### Cosa fa in pratica

VRE è un **guscio operativo** che metti attorno alla tua ricerca quando lavori
con un agente AI (Claude Code, Codex, Gemini CLI, o qualsiasi altro ambiente
agentico). Il guscio:

- **registra letteratura e esperimenti** con stato tracciabile
- **salva risultati e artefatti** in pacchetti strutturati su disco
- **gestisce la memoria** con mirror leggibili e sincronia esplicita
- **produce handoff di scrittura e pacchetti per advisor** separando fatti
  verificati da speculazioni
- **coordina il lavoro** con una coda visibile, lane esplicite, e recovery o
  escalation oneste
- **non inventa niente**: non scrive verità scientifica, non cattura
  preferenze dalla chat, non fa lavoro nascosto

---

### A chi serve

- Ricercatori che usano AI per analisi dati come bioinformatica, scRNA-seq,
  omics, e domini affini
- Chi ha bisogno che il lavoro fatto con l'agente resti **auditabile e
  riprendibile**, invece di essere perso nella cronologia chat
- Chi vuole preparare output per advisor, co-autori o tesi senza confondere
  risultati veri e allucinazioni

Non serve a chi vuole un chatbot generico o un dashboard point-and-click.

---

### Dove gira

VRE è codice Node.js locale. Non è un servizio cloud.

Funziona su:

- **Claude Code**
- **Codex**
- **Qualsiasi ambiente agentico** che può leggere file e chiamare moduli JS

Il cuore del sistema sotto [`environment/`](environment/) non dipende da un
provider specifico. I file sotto [`commands/`](commands/) sono contratti
comando che l'agente segue; **non** sono una CLI standalone rifinita.

---

### Come si usa oggi

1. Clona il repo
2. Esegui `npm install`
3. Esegui `npm run check` e verifica che tutto sia verde (`507/508` test,
   `12` validator — uno skip dichiarato per il probe live-kernel, attivato
   con `VRE_KERNEL_PATH` puntato a un checkout sibling di `vibe-science`)
4. Tieni un checkout sibling di `vibe-science` se vuoi le proiezioni
   kernel-backed; senza, molte superfici funzionano lo stesso ma degradano
   onestamente in modalità workspace-first
5. Apri il repo nel tuo ambiente agentico
6. Parti da [`/flow-status`](commands/flow-status.md)
7. Registra un paper con [`/flow-literature`](commands/flow-literature.md) o un
   esperimento con [`/flow-experiment`](commands/flow-experiment.md)
8. Impacchetta i risultati con [`/flow-results`](commands/flow-results.md)
9. Prepara un handoff di scrittura con [`/flow-writing`](commands/flow-writing.md)
10. Ispeziona lo stato e gli artefatti scritti sotto
    [`.vibe-science-environment/`](.vibe-science-environment/)

Per l'orchestratore:

- [`/orchestrator-run`](commands/orchestrator-run.md) lancia un obiettivo nella
  coda
- [`/orchestrator-status`](commands/orchestrator-status.md) mostra stato della
  coda, lane, escalation e prossima azione consigliata

---

### Come aiuta nella ricerca data-driven

VRE **non** fa statistica, QC o modellazione al posto tuo. Non è un motore
scientifico. È il **sistema operativo attorno alla scienza**.

In un workflow come scRNA-seq, il valore è questo:

| Problema reale | Cosa ti dà VRE |
|----------------|----------------|
| “Quale analisi avevo fatto la settimana scorsa?” | Stato di sessione e tentativi salvato su disco |
| “Da dove arriva questo risultato?” | Output collegati a esperimenti e artefatti |
| “Posso mandare questo draft all'advisor?” | Export eligibility separa verificato da speculativo |
| “L'agente ha fatto cose senza dirmelo” | Coda visibile, escalation esplicite, recovery onesto |
| “Ho perso il contesto chiudendo la chat” | Memory mirror e continuity profile |
| “Un reviewer mi ha chiesto il materiale sottostante” | Bundle con artefatti e manifest strutturati |

La formula giusta è:

**pipeline analitiche vere + kernel scientifico + VRE come guscio di coordinamento**

Non: VRE al posto della metodologia scientifica.

---

### Architettura in breve

```text
┌──────────────────────────────────────────────────┐
│  Agente AI (Claude Code / Codex / Gemini CLI)   │
├──────────────────────────────────────────────────┤
│  Orchestratore locale (Phase 5 MVP)             │
│  coda · lane · review · recovery · continuity   │
├──────────────────────────────────────────────────┤
│  Guscio operativo VRE                           │
│  flow · packaging · memory · connectors         │
├──────────────────────────────────────────────────┤
│  Kernel Vibe Science                            │
│  truth · claim · citazioni · gate               │
└──────────────────────────────────────────────────┘
```

- Il **kernel** possiede la verità scientifica
- **VRE** possiede workflow, packaging, export e memoria
- L'**orchestratore** coordina il lavoro tramite coda/lane/review/recovery
- L'**agente** è l'interfaccia verso l'operatore
- Nessun livello può ridefinire la verità posseduta dal livello sottostante
- Il **kernel bridge** (Phase 6+) serve proiezioni live dal kernel con
  metadata espliciti `dbAvailable` / `sourceMode` / `degradedReason`, quindi
  una lettura degradata non può mai spacciarsi per "verified zero"
- I **binding reali dei provider CLI** (Codex, Claude) producono evidenza di
  review avversaria marcata con contratti `evidenceMode` provider-specifici
  (`real-cli-binding-codex`, `real-cli-binding-claude`), distinguibili da
  esecuzioni mock o smoke a livello di artefatto

---

### Cosa c'è nel repo

| Directory | Scopo |
|-----------|-------|
| `environment/control/` | control plane, middleware, sessioni, tentativi, decisioni |
| `environment/flows/` | letteratura, esperimenti, risultati, writing, digest |
| `environment/memory/` | mirror, freshness, marks |
| `environment/orchestrator/` | coordinatore MVP di Phase 5 |
| `environment/connectors/` | substrate di export verso filesystem/Obsidian |
| `environment/automation/` | automazioni reviewabili |
| `environment/domain-packs/` | preset di dominio come `omics` |
| `environment/tests/` | copertura schema, runtime, integration, eval e CI |
| `commands/` | contratti comando per l'agente |
| `blueprints/` | spec, piani di implementazione, closeout |
| `.vibe-science-environment/` | stato macchina su disco; durante lo sviluppo contiene sia runtime state sia evidence salvata |

---

### Come verificare che il repo funziona davvero

```bash
npm install
npm run check
```

Se vuoi prova concreta invece di promesse, parti da qui:

- [Indice del piano di implementazione](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
  — stato delle fasi correnti a colpo d'occhio
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
  — MVP dell'orchestratore locale (coda, lane, review lineage con evidenza
  real-provider)
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md)
  — wave kernel bridge + provider CLI reali + Outcome B storico
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md)
  — probe runtime degli hook per Gate 17 (niente più array sintetici) +
  onestà `dbAvailable` / `sourceMode` + contratto Codex reale
  `cwd: projectPath`
- [Test probe governance kernel](environment/tests/compatibility/kernel-governance-probe.test.js)
  — eseguibile con `VRE_KERNEL_PATH=<percorso a vibe-science>` per un probe
  bidirezionale live contro il kernel sibling
- [Test eval degli artifact salvati](environment/tests/evals/saved-artifacts.test.js)
  — impone `evidenceMode: "real-cli-binding-codex"` + record durable
  `externalReview` per l'artifact di lineage del Phase 5 Gate 3
- [Artifact operator-validation](.vibe-science-environment/operator-validation/)

---

### Cosa non è

- Non è una piattaforma agente generica
- Non è un dashboard SaaS
- Non è un generatore automatico di paper
- Non è una memoria nascosta che inventa continuità dalla chat
- Non è un sostituto del kernel scientifico
- Non è un sostituto della metodologia scientifica

È un **guscio di lavoro** per ricerca seria con AI dove stato, packaging,
review e recovery devono restare ispezionabili.

---

### Entry point

- [Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Piano di implementazione](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md) — kernel bridge + provider CLI reali
- [Phase 6.1 Closeout](blueprints/definitive-spec/implementation-plan/phase6_1-closeout.md) — chiusura follow-up
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md) — verifica runtime hook + onestà dell'envelope
- [Orchestrator Spec](blueprints/definitive-spec/surface-orchestrator/00-index.md)

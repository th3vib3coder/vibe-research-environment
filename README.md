# Vibe Research Environment (VRE)

**When you do research with AI, the work disappears into chat.**
Analyses get lost, experiments stop being reproducible, claims become hard to
verify, and drafts mix facts with speculation. After a few days, nobody knows
what was done, with which data, and what can actually be defended.

VRE is a **file-backed operational shell** around an AI agent (Claude Code,
Codex, Gemini CLI). It keeps research work on disk — inspectable, resumable,
packaged for advisors — and it pairs with the **Vibe Science kernel** to keep
scientific truth under hard discipline (claims, citations, gates, adversarial
review).

VRE does **not** do statistics, QC, or modeling. It is not a scientific
engine. It is the **operating system around the science**, and it exists
because the failure mode "the agent did things and then the chat context
erased it" is real.

---

## Who This Is For

- Researchers using AI for data-driven work (bioinformatics, scRNA-seq, omics,
  adjacent domains) who already have real analytical pipelines and now want
  the AI layer to stop losing state.
- People who need AI-assisted work to stay **auditable and resumable**, with
  evidence anchored to files, not chat history.
- People preparing outputs for advisors, co-authors, or thesis work without
  blurring verified results and hallucinated content.

This is **not** a generic chatbot wrapper or a point-and-click dashboard. The
discipline it imposes is the point; without a workflow that benefits from
that discipline, the overhead is not worth it.

---

## The Two-Repo Model

VRE is most useful when paired with the **Vibe Science** kernel. They are
separate repositories with separate responsibilities:

| Repo | Role | What it owns |
|------|------|-----------------------------|
| [`vibe-science`](https://github.com/th3vib3coder/vibe-science) | Scientific kernel (Claude Code plugin) | Claims, citations, gates, governance hooks, adversarial review (R2), judge agent (R3), serendipity scanner, SQLite DB of scientific truth |
| [`vibe-research-environment`](https://github.com/th3vib3coder/vibe-research-environment) (this repo) | Operational shell (local Node.js tool) | Flow state, literature/experiment/results/writing flows, memory mirrors, queue/lane orchestrator, connectors, export packaging |

The kernel holds scientific truth. VRE holds workflow state. They
communicate through an explicit **kernel bridge** (`resolveKernelReader` in
`environment/lib/kernel-bridge.js`) that reads kernel projections with
`dbAvailable` / `sourceMode` / `degradedReason` metadata, so a missing kernel
can never silently impersonate "verified zero".

---

## Setup

### 1. Check out both repos side by side

```bash
mkdir -p research-os && cd research-os
git clone https://github.com/th3vib3coder/vibe-science.git
git clone https://github.com/th3vib3coder/vibe-research-environment.git
```

After this you should have:

```
research-os/
  vibe-science/                        # the kernel (also installable as a Claude Code plugin)
  vibe-research-environment/           # VRE (this repo)
```

VRE auto-detects the sibling kernel when they share a parent directory. No
environment variable needed for the default layout.

### 2. Install VRE dependencies

```bash
cd vibe-research-environment
npm install
```

### 3. Initialize the project

```bash
node bin/vre init
```

Expected output:

```
vre init:
  project root: research-os/vibe-research-environment
  state root:   .vibe-science-environment/ (created)
  kernel:       OK — sibling-auto-discovery at research-os/vibe-science

next steps:
  vre flow-status             # show current operator state
  vre orchestrator-status     # show queue / lane state
  vre sync-memory             # refresh markdown mirrors from kernel

agent-only commands (follow the markdown contracts in commands/ via Claude Code):
  /flow-literature /flow-experiment /flow-results /flow-writing /orchestrator-run
  /automation-status /export-warning-digest /stale-memory-reminder /weekly-digest
```

If `kernel:` reports `degraded`, you either don't have a sibling checkout of
`vibe-science` or it's somewhere non-standard. Point at it explicitly:

```bash
export VRE_KERNEL_PATH=/absolute/path/to/vibe-science
node bin/vre init
```

VRE also works standalone (degraded mode) — most surfaces still function,
they just cannot read kernel truth.

### 4. Verify

```bash
npm run check
```

Should print `ℹ pass 525` (or higher), `ℹ fail 0`, and `OK` for all 12
validators. The one declared skip is the live-kernel probe; it activates when
you run with `VRE_KERNEL_PATH=../vibe-science` set.

---

## Using VRE Day to Day

VRE has two surfaces: a small **CLI dispatcher** for read-only state queries
and a larger set of **agent-driven flows** that a Claude Code (or other
agent) session executes by reading the command contracts in `commands/`.

### CLI commands (runnable directly)

```bash
vre init                  # create state tree, verify kernel wiring, print next steps
vre flow-status           # show current session/flow state + blockers
vre orchestrator-status   # queue / lane / escalation / next recommended action
vre sync-memory           # refresh .vibe-science-environment/memory/ mirrors from kernel
```

Set `VRE_VERBOSE=1` to get a per-command `kernel-bridge active|degraded` line
on stderr.

### Agent-driven flows (Claude Code + the vibe-science plugin)

Open the project in Claude Code with the `vibe-science` plugin active. Then
invoke the `/flow-*` commands — the agent reads the markdown contract in
`commands/<name>.md` and executes the helper in `environment/flows/`.

Typical research loop:

1. `/flow-status` — understand current state
2. `/flow-literature --register` — register a paper you've read, link to an
   existing claim or file a new one
3. `/flow-experiment --register` — create a manifest for an analysis you're
   about to run (parameters, code ref, related claims)
4. Run the actual analysis (whatever pipeline you use — VRE does not do the
   science; it tracks that the science happened)
5. `/flow-results --package EXP-042` — package the output bundle against
   the manifest
6. `/flow-writing --handoff C-017` — prepare an advisor-ready export
   separating claim-backed from speculative content
7. `/orchestrator-run` / `/orchestrator-status` — route work through a
   visible queue + lane + review + recovery model
8. `/sync-memory` at the end of the session — refresh the readable markdown
   mirrors against the latest kernel state

---

## Coexistence With the Vibe Science Plugin

VRE and the `vibe-science` Claude Code plugin run **side by side, in the
same Claude Code session**, without stepping on each other.

| Component | State directory | Who owns it |
|-----------|-----------------|-------------|
| `vibe-science` plugin | Kernel DB + claim ledger + R2 reports (inside the plugin install) | The plugin's hooks (SessionStart, PreToolUse, PostToolUse, Stop, etc.) |
| VRE | `.vibe-science-environment/` under the VRE repo | VRE middleware, flows, orchestrator |

The plugin's hooks enforce scientific discipline (claim promotion gates,
governance events, R2 adversarial review, serendipity scanning). VRE
middleware enforces workflow discipline (attempt lifecycle, snapshot
publication, budget advisories, export eligibility). They share no writes.

VRE reads kernel truth through the bridge (`plugin/scripts/core-reader-cli.js`
on the kernel side, `environment/lib/kernel-bridge.js` on the VRE side), which
exposes 8 projections and honest degraded-mode metadata.

---

## Architecture at a Glance

```text
┌──────────────────────────────────────────────────┐
│  AI Agent (Claude Code / Codex / Gemini CLI)    │
├──────────────────────────────────────────────────┤
│  VRE Operational Shell                          │
│    bin/vre dispatcher (3 wired + agent-only)    │
│    flows: literature / experiment / results /   │
│           writing / session-digest              │
│    orchestrator: queue / lanes / review /       │
│                  recovery / continuity          │
│    packaging, memory mirrors, connectors        │
├──────────────────────────────────────────────────┤
│  Kernel Bridge (live projections, fail-closed)  │
│    dbAvailable / sourceMode / degradedReason    │
├──────────────────────────────────────────────────┤
│  Vibe Science Kernel (Claude Code plugin)       │
│    claims · citations · gates · hooks ·         │
│    R2 adversarial review · R3 judge ·           │
│    serendipity scanner · governance events      │
└──────────────────────────────────────────────────┘
```

Rules that hold across layers:

- The **kernel** owns scientific truth. Claim promotion requires an
  R2_REVIEWED event; gates block unverified work.
- **VRE** owns workflow, packaging, export, and memory. It never writes
  kernel truth directly.
- The **kernel bridge** serves live projections with explicit
  `dbAvailable` / `sourceMode` / `degradedReason`; a degraded read can
  never masquerade as "verified zero".
- **Real provider CLI bindings** (Codex, Claude) produce adversarial
  review evidence marked `evidenceMode: "real-cli-binding-codex"` or
  `"real-cli-binding-claude"` — distinguishable from mocks or smoke runs
  at the artifact level.
- No layer may redefine the truth owned by the layer below it.

---

## What Is Shipped vs Aspirational (honest)

This is not a finished product. It's a discipline container that has been
through repeated honesty corrections.

### Shipped and working today

- Phase 1-5 operational baseline (flow state, literature/experiment/writing
  flows, orchestrator MVP, bounded failure recovery)
- Phase 5.5 audit hardening (export-snapshot immutability, signal
  provenance, boundary corrections, closeout-honesty validator)
- Phase 6 kernel bridge + real provider CLI bindings (Codex verified,
  Claude CLI scaffolded)
- Phase 6.1 / 6.2 honesty corrections on Gate 17 (kernel hook runtime
  probe replaces synthetic hook arrays; `dbAvailable` / `sourceMode`
  metadata prevents silent-zero pathology)
- Phase 7 Wave 1A execution surface expansion (3 new task kinds:
  `experiment-flow-register`, `writing-export-finalize`,
  `results-bundle-discover`)

### Partial or deferred

- Phase 7 Wave 1B (two review-lane task kinds
  `contrarian-claim-review` / `citation-verification-review`) deferred
  behind FU-7-001 (review-lane generalization for non-execution-lineage
  review tasks). Wave 1 is NOT closed until 1A + 1B both ship.
- 9 of the 12 `/flow-*` / orchestrator command surfaces are markdown
  contracts for agents to follow, not standalone CLI commands. This
  repo deliberately pushes the CLI dispatcher expansion to Phase 7
  Wave 2 rather than overclaim today.
- Three-tier writing (claim-backed / artifact-backed / free) is
  markdown-header-level today; schema-enforced tier metadata lands in
  Phase 7 Wave 3.
- Obsidian connector copies two markdown files. It is scheduled for an
  honest rename to `vault-target-export` in Phase 7 Wave 4, not a deep
  Obsidian API integration.
- Zotero ingress is a Phase 8+ candidate (kernel-side citation import
  prerequisite).
- Automation scheduling uses an ISO-week idempotency key; a GitHub
  Actions scheduled workflow lands in Phase 7 Wave 4.

### Current dogfood gate

Phase 7 Wave 1A is committed locally but pushed only after **Dogfood
Sprint 0** — a 3-5 day pass of real scRNA-seq work through VRE to
confirm the machine bites real science before more machine is built.
Once the sprint produces a mini-dossier (dataset, question, claim,
evidence, limits, confounder, adversarial review), Wave 1B / Wave 2
scope is re-validated against the frictions the real workflow
exposed.

---

## How to Verify the Repo Actually Works

```bash
npm install
npm run check
```

Should report `pass 525+`, `fail 0`, `12/12 validators OK`, one declared
live-kernel skip.

Activate the live-kernel probe too:

```bash
VRE_KERNEL_PATH=../vibe-science node --test \
  environment/tests/compatibility/kernel-governance-probe.test.js
```

This runs 8 bidirectional probes against the real kernel, including
`listGateChecks hooks must exactly equal the required non-negotiable set`
and `schema_file_protection must not be synthetic`.

Concrete evidence to inspect:

- [Implementation plan index](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md) — current phase state at a glance
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md) — local orchestrator MVP baseline
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md) — kernel bridge + real provider CLI waves
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md) — hook runtime probe + envelope honesty
- [Phase 7 Wave 1 spec](blueprints/definitive-spec/implementation-plan/phase7-02-wave-1-execution-surface-expansion.md) — Wave 1A shipped / Wave 1B deferred split
- [Kernel governance probe test](environment/tests/compatibility/kernel-governance-probe.test.js)
- [Saved-artifact eval tests](environment/tests/evals/saved-artifacts.test.js) — enforces `real-cli-binding-codex` + durable `externalReview` record
- [Operator-validation artifacts](.vibe-science-environment/operator-validation/)

---

## What It Is Not

- Not a generic agent platform
- Not a SaaS dashboard
- Not an automatic paper generator
- Not a hidden memory layer that invents continuity from chat
- Not a replacement for the scientific kernel
- Not a replacement for scientific methodology

It is a **work shell** for serious AI-assisted research where state,
packaging, review, and recovery must remain inspectable.

---

## Entry Points

- [Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Implementation Plan](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md) — kernel bridge + real provider CLI
- [Phase 6.1 Closeout](blueprints/definitive-spec/implementation-plan/phase6_1-closeout.md) — follow-up closure
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md) — hook runtime verification + envelope honesty
- [Phase 7 Wave 1 spec (1A shipped / 1B deferred)](blueprints/definitive-spec/implementation-plan/phase7-02-wave-1-execution-surface-expansion.md)
- [Orchestrator Spec](blueprints/definitive-spec/surface-orchestrator/00-index.md)

---
=========================================================================================
## Italiano

# Vibe Research Environment (VRE)

**Quando fai ricerca con l'AI, il lavoro sparisce nella chat.**
Analisi perse, esperimenti non ripetibili, claim non verificabili, draft che
mescolano fatti e speculazioni. Dopo pochi giorni nessuno sa cosa è stato
fatto, con quali dati, e cosa si può davvero difendere.

VRE è un **guscio operativo file-backed** attorno a un agente AI (Claude
Code, Codex, Gemini CLI). Tiene il lavoro di ricerca su disco — ispezionabile,
riprendibile, impacchettabile per advisor — e si affianca al **kernel Vibe
Science** che tiene la verità scientifica sotto disciplina dura (claim,
citazioni, gate, review avversaria).

VRE **non** fa statistica, QC o modellazione. Non è un motore scientifico.
È il **sistema operativo attorno alla scienza**, ed esiste perché il failure
mode "l'agente ha fatto cose e poi il contesto chat le ha cancellate" è
reale.

---

## A chi serve

- Ricercatori che usano AI per analisi data-driven (bioinformatica,
  scRNA-seq, omics, domini affini) che hanno già pipeline analitiche vere e
  vogliono che il layer AI smetta di perdere stato.
- Chi ha bisogno che il lavoro fatto con l'agente resti **auditabile e
  riprendibile**, con evidenza ancorata a file, non alla cronologia chat.
- Chi prepara output per advisor, co-autori o tesi senza confondere
  risultati veri e allucinazioni.

Non serve a chi vuole un chatbot generico o un dashboard point-and-click.
La disciplina che impone È il punto; senza un workflow che beneficia di
quella disciplina, l'overhead non vale.

---

## Il modello two-repo

VRE è più utile affiancato al kernel **Vibe Science**. Sono due repo
separati con responsabilità separate:

| Repo | Ruolo | Cosa possiede |
|------|-------|-----------------------------|
| [`vibe-science`](https://github.com/th3vib3coder/vibe-science) | Kernel scientifico (plugin Claude Code) | Claim, citazioni, gate, governance hook, review avversaria (R2), judge agent (R3), serendipity scanner, DB SQLite della verità scientifica |
| [`vibe-research-environment`](https://github.com/th3vib3coder/vibe-research-environment) (questo repo) | Guscio operativo (tool Node.js locale) | Stato flow, flow literature/experiment/results/writing, mirror memoria, orchestratore coda/lane, connector, export packaging |

Il kernel ha la verità scientifica. VRE ha lo stato del workflow.
Comunicano tramite un **kernel bridge** esplicito (`resolveKernelReader` in
`environment/lib/kernel-bridge.js`) che legge proiezioni kernel con
metadata `dbAvailable` / `sourceMode` / `degradedReason`, così un kernel
mancante non può mai spacciarsi per "verified zero".

---

## Setup

### 1. Fai il checkout dei due repo affiancati

```bash
mkdir -p research-os && cd research-os
git clone https://github.com/th3vib3coder/vibe-science.git
git clone https://github.com/th3vib3coder/vibe-research-environment.git
```

Dopo dovresti avere:

```
research-os/
  vibe-science/                        # il kernel (installabile anche come plugin Claude Code)
  vibe-research-environment/           # VRE (questo repo)
```

VRE auto-detecta il kernel sibling quando condividono la stessa directory
parent. Nessuna variabile d'ambiente necessaria per il layout di default.

### 2. Installa le dipendenze VRE

```bash
cd vibe-research-environment
npm install
```

### 3. Inizializza il progetto

```bash
node bin/vre init
```

Output atteso:

```
vre init:
  project root: research-os/vibe-research-environment
  state root:   .vibe-science-environment/ (created)
  kernel:       OK — sibling-auto-discovery at research-os/vibe-science

next steps:
  vre flow-status             # show current operator state
  vre orchestrator-status     # show queue / lane state
  vre sync-memory             # refresh markdown mirrors from kernel

agent-only commands (follow the markdown contracts in commands/ via Claude Code):
  /flow-literature /flow-experiment /flow-results /flow-writing /orchestrator-run
  /automation-status /export-warning-digest /stale-memory-reminder /weekly-digest
```

Se `kernel:` riporta `degraded`, o non hai un checkout sibling di
`vibe-science` o è in un percorso non standard. Puntalo esplicitamente:

```bash
export VRE_KERNEL_PATH=/absolute/path/to/vibe-science
node bin/vre init
```

VRE funziona anche standalone (modalità degraded) — la maggior parte delle
superfici funziona comunque, semplicemente non può leggere verità kernel.

### 4. Verifica

```bash
npm run check
```

Dovrebbe stampare `ℹ pass 525` (o più), `ℹ fail 0`, e `OK` per tutti i 12
validator. L'unico skip dichiarato è il probe live-kernel; si attiva
eseguendo con `VRE_KERNEL_PATH=../vibe-science` impostata.

---

## Usare VRE giorno per giorno

VRE ha due superfici: un piccolo **dispatcher CLI** per query di stato
read-only, e un set più ampio di **flow agent-driven** che una sessione
Claude Code (o altro agente) esegue leggendo i contratti comando in
`commands/`.

### Comandi CLI (eseguibili direttamente)

```bash
vre init                  # crea state tree, verifica kernel wiring, stampa prossimi passi
vre flow-status           # stato sessione/flow corrente + blocker
vre orchestrator-status   # coda / lane / escalation / prossima azione consigliata
vre sync-memory           # refresh dei mirror .vibe-science-environment/memory/ dal kernel
```

Imposta `VRE_VERBOSE=1` per avere una riga `kernel-bridge active|degraded`
su stderr per comando.

### Flow agent-driven (Claude Code + plugin vibe-science)

Apri il progetto in Claude Code con il plugin `vibe-science` attivo. Poi
invoca i comandi `/flow-*` — l'agente legge il contratto markdown in
`commands/<name>.md` ed esegue l'helper in `environment/flows/`.

Loop di ricerca tipico:

1. `/flow-status` — capire lo stato corrente
2. `/flow-literature --register` — registra un paper che hai letto, link a
   un claim esistente o apri un claim nuovo
3. `/flow-experiment --register` — crea un manifest per un'analisi che stai
   per lanciare (parametri, code ref, claim collegati)
4. Lancia l'analisi vera (qualunque pipeline usi — VRE non fa la scienza;
   traccia che la scienza è stata fatta)
5. `/flow-results --package EXP-042` — impacchetta l'output bundle contro
   il manifest
6. `/flow-writing --handoff C-017` — prepara un export advisor-ready
   separando contenuto claim-backed da speculativo
7. `/orchestrator-run` / `/orchestrator-status` — ruota il lavoro attraverso
   un modello coda + lane + review + recovery visibile
8. `/sync-memory` a fine sessione — refresha i mirror markdown leggibili
   contro l'ultimo stato kernel

---

## Coesistenza con il plugin Vibe Science

VRE e il plugin Claude Code `vibe-science` girano **affiancati, nella stessa
sessione Claude Code**, senza pestarsi i piedi.

| Componente | Directory stato | Chi la possiede |
|-----------|-----------------|-------------|
| Plugin `vibe-science` | DB kernel + claim ledger + report R2 (dentro l'install del plugin) | Gli hook del plugin (SessionStart, PreToolUse, PostToolUse, Stop, etc.) |
| VRE | `.vibe-science-environment/` sotto il repo VRE | Middleware VRE, flow, orchestratore |

Gli hook del plugin impongono disciplina scientifica (gate promozione
claim, governance events, review avversaria R2, serendipity scanner). Il
middleware VRE impone disciplina workflow (lifecycle attempt, snapshot
publication, budget advisory, export eligibility). Non condividono scrittura.

VRE legge verità kernel tramite il bridge (`plugin/scripts/core-reader-cli.js`
lato kernel, `environment/lib/kernel-bridge.js` lato VRE), che espone 8
proiezioni e metadata onesti di modalità degraded.

---

## Architettura in breve

```text
┌──────────────────────────────────────────────────┐
│  Agente AI (Claude Code / Codex / Gemini CLI)   │
├──────────────────────────────────────────────────┤
│  Guscio Operativo VRE                           │
│    dispatcher bin/vre (3 wired + agent-only)    │
│    flow: literature / experiment / results /    │
│          writing / session-digest               │
│    orchestratore: coda / lane / review /        │
│                   recovery / continuity         │
│    packaging, mirror memoria, connector         │
├──────────────────────────────────────────────────┤
│  Kernel Bridge (proiezioni live, fail-closed)   │
│    dbAvailable / sourceMode / degradedReason    │
├──────────────────────────────────────────────────┤
│  Kernel Vibe Science (plugin Claude Code)       │
│    claim · citazioni · gate · hook ·            │
│    review avversaria R2 · judge R3 ·            │
│    serendipity scanner · governance events      │
└──────────────────────────────────────────────────┘
```

Regole che reggono trasversalmente:

- Il **kernel** possiede la verità scientifica. La promozione claim
  richiede un evento R2_REVIEWED; i gate bloccano il lavoro non verificato.
- **VRE** possiede workflow, packaging, export e memoria. Non scrive mai
  verità kernel direttamente.
- Il **kernel bridge** serve proiezioni live con metadata espliciti
  `dbAvailable` / `sourceMode` / `degradedReason`; una lettura degradata
  non può mai spacciarsi per "verified zero".
- I **binding reali dei provider CLI** (Codex, Claude) producono evidenza
  di review avversaria marcata `evidenceMode: "real-cli-binding-codex"` o
  `"real-cli-binding-claude"` — distinguibile da mock o smoke a livello di
  artefatto.
- Nessun livello può ridefinire la verità posseduta dal livello sottostante.

---

## Cosa è shipped vs aspirazionale (onesto)

Questo non è un prodotto finito. È un container di disciplina passato
attraverso ripetute correzioni di onestà.

### Shipped e funzionante oggi

- Baseline operativa Phase 1-5 (flow state, flow
  literature/experiment/writing, orchestratore MVP, recovery fallimenti
  bounded)
- Hardening audit Phase 5.5 (immutabilità export-snapshot, provenance
  signals, correzioni di boundary, validator closeout-honesty)
- Kernel bridge Phase 6 + binding reali provider CLI (Codex verificato,
  Claude CLI scaffoldato)
- Correzioni di onestà Phase 6.1 / 6.2 su Gate 17 (probe runtime hook
  kernel sostituisce array hook sintetici; metadata `dbAvailable` /
  `sourceMode` previene la patologia silent-zero)
- Phase 7 Wave 1A espansione superficie execution (3 nuovi task kind:
  `experiment-flow-register`, `writing-export-finalize`,
  `results-bundle-discover`)

### Parziale o deferito

- Phase 7 Wave 1B (due review-lane task kind
  `contrarian-claim-review` / `citation-verification-review`) deferita
  dietro FU-7-001 (generalizzazione review-lane per review task
  non-execution-lineage). Wave 1 NON è chiusa finché 1A + 1B non
  shipano entrambi.
- 9 delle 12 superfici comando `/flow-*` / orchestrator sono contratti
  markdown che l'agente segue, non comandi CLI standalone. Questo repo
  spinge deliberatamente l'espansione dispatcher CLI a Phase 7 Wave 2
  invece di overclaimare oggi.
- Three-tier writing (claim-backed / artifact-backed / free) è
  markdown-header oggi; metadata tier enforced da schema arriva in
  Phase 7 Wave 3.
- Connector Obsidian copia due file markdown. È schedulato per un
  rename onesto a `vault-target-export` in Phase 7 Wave 4, non per
  un'integrazione API Obsidian profonda.
- Zotero ingress è un candidato Phase 8+ (prerequisito kernel-side
  per import citation).
- Scheduling automation usa una idempotency key ISO-week; un workflow
  schedulato GitHub Actions arriva in Phase 7 Wave 4.

### Gate dogfood corrente

Phase 7 Wave 1A è committata localmente ma pushata solo dopo
**Dogfood Sprint 0** — un pass di 3-5 giorni di lavoro scRNA-seq reale
attraverso VRE per confermare che la macchina morda scienza vera prima di
costruire altra macchina. Quando lo sprint produce un mini-dossier
(dataset, domanda, claim, evidenza, limiti, confounder, review avversaria),
lo scope Wave 1B / Wave 2 è ri-validato contro le frizioni che il
workflow reale espone.

---

## Come verificare che il repo funziona davvero

```bash
npm install
npm run check
```

Dovrebbe riportare `pass 525+`, `fail 0`, `12/12 validators OK`, uno skip
dichiarato live-kernel.

Attiva anche il probe live-kernel:

```bash
VRE_KERNEL_PATH=../vibe-science node --test \
  environment/tests/compatibility/kernel-governance-probe.test.js
```

Esegue 8 probe bidirezionali contro il kernel reale, incluso
`listGateChecks hooks must exactly equal the required non-negotiable set`
e `schema_file_protection must not be synthetic`.

Evidenza concreta da ispezionare:

- [Indice del piano di implementazione](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md) — stato delle fasi correnti a colpo d'occhio
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md) — baseline MVP orchestratore locale
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md) — wave kernel bridge + provider CLI reali
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md) — probe runtime hook + onestà envelope
- [Phase 7 Wave 1 spec](blueprints/definitive-spec/implementation-plan/phase7-02-wave-1-execution-surface-expansion.md) — split Wave 1A shipped / Wave 1B deferita
- [Test probe governance kernel](environment/tests/compatibility/kernel-governance-probe.test.js)
- [Test eval degli artifact salvati](environment/tests/evals/saved-artifacts.test.js) — impone `real-cli-binding-codex` + record durable `externalReview`
- [Artifact operator-validation](.vibe-science-environment/operator-validation/)

---

## Cosa non è

- Non è una piattaforma agente generica
- Non è un dashboard SaaS
- Non è un generatore automatico di paper
- Non è una memoria nascosta che inventa continuità dalla chat
- Non è un sostituto del kernel scientifico
- Non è un sostituto della metodologia scientifica

È un **guscio di lavoro** per ricerca seria con AI dove stato, packaging,
review e recovery devono restare ispezionabili.

---

## Entry point

- [Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Piano di implementazione](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [Phase 6 Closeout](blueprints/definitive-spec/implementation-plan/phase6-closeout.md) — kernel bridge + provider CLI reali
- [Phase 6.1 Closeout](blueprints/definitive-spec/implementation-plan/phase6_1-closeout.md) — chiusura follow-up
- [Phase 6.2 Closeout](blueprints/definitive-spec/implementation-plan/phase6_2-closeout.md) — verifica runtime hook + onestà dell'envelope
- [Phase 7 Wave 1 spec (1A shipped / 1B deferita)](blueprints/definitive-spec/implementation-plan/phase7-02-wave-1-execution-surface-expansion.md)
- [Orchestrator Spec](blueprints/definitive-spec/surface-orchestrator/00-index.md)

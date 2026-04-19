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

VRE has two surfaces:

- **4 CLI commands** (runnable directly from the terminal) — diagnostics
  and housekeeping. They don't create scientific content.
- **9 agent-driven commands** (invoked inside Claude Code as `/flow-*`,
  `/orchestrator-*`, etc.) — the research work itself. An agent reads the
  markdown contract in `commands/<name>.md` and executes the helper in
  `environment/flows/`.

### All 4 CLI commands

```bash
node bin/vre init                 # bootstrap: state tree + kernel wiring + next-steps
node bin/vre flow-status          # current session, active flow, blockers, budget, kernel state
node bin/vre orchestrator-status  # queue, lane runs, escalations, next recommended action
node bin/vre sync-memory          # regenerate .vibe-science-environment/memory/*.md mirrors from kernel
```

`VRE_VERBOSE=1` opts in to a per-command `kernel-bridge active|degraded`
line on stderr.

### All 9 agent-driven commands (with subcommands)

| Command | Subcommand | What it does |
|---------|------------|--------------|
| `/flow-literature` | `--register` | Register a paper (title, DOI, authors), optionally link to a claim |
| `/flow-literature` | `--list` | List registered papers |
| `/flow-literature` | `--link-claim` | Connect an existing paper to an existing claim |
| `/flow-experiment` | `--register` | Create an experiment manifest (title, objective, parameters, codeRef) |
| `/flow-experiment` | `--update <EXP-id>` | Update an existing manifest (e.g. add outputArtifacts) |
| `/flow-experiment` | `--blockers` | Show current blockers for open experiments |
| `/flow-results` | `--package <EXP-id>` | Package an experiment's outputs into a bundle with manifest |
| `/flow-results` | `--list` | List existing result bundles |
| `/flow-writing` | `--handoff <C-id>` | Generate an export separating claim-backed content from speculation |
| `/flow-writing` | `--advisor-pack` | Advisor-oriented export variant |
| `/flow-writing` | `--rebuttal-pack` | Reviewer-rebuttal export variant |
| `/orchestrator-run` | `<objective>` | Route an objective into the queue → execution lane → review lane |
| `/automation-status` | — | State of scheduled automations |
| `/export-warning-digest` | — | Aggregate export alerts (claims promoted/demoted after export) |
| `/stale-memory-reminder` | — | Flag markdown mirrors that drifted from kernel |
| `/weekly-digest` | — | Weekly summary of research state |

---

## Coexistence With the Vibe Science Plugin

### The mental model

VRE and the vibe-science plugin **run side by side in the same Claude Code
session**:

- **`vibe-science` plugin** = Claude Code lifecycle hooks (SessionStart,
  PreToolUse, PostToolUse, Stop, …). While active, it watches every tool
  call the agent makes and enforces governance gates — e.g. a claim
  cannot be written to the ledger without a `confounder_status` field,
  a session cannot close with unreviewed claims. It writes to the
  **kernel SQLite DB** (claims, citations, gate checks, governance
  events).
- **VRE** = local Node.js tool. Its own middleware manages workflow state
  (attempts, snapshots, budget). It writes to
  **`.vibe-science-environment/`** (flow state, experiment manifests,
  result bundles, writing exports). It reads from the kernel through
  `environment/lib/kernel-bridge.js` — **read-only**, never writes kernel
  truth.

They don't collide because they write to disjoint directories.

### Concrete 10-step research loop

**1. Activate the plugin in Claude Code.** If you installed `vibe-science`
from the plugin marketplace, it should already be active. To verify: in a
Claude Code session, type `/vibe` and check you get a response.

**2. Open the project folder in Claude Code.** Open the
`vibe-research-environment` checkout as the project. The plugin
SessionStart hook bootstraps the kernel DB automatically if it's missing.

**3. First action: see current state.**

In Claude Code chat:
```
/flow-status
```

The agent executes VRE's `getOperatorStatus` helper, also reading kernel
state through the bridge. You get session info, active flow (none yet),
promoted claims (probably zero), budget spent, any blockers.

**4. Register the first paper from your bibliography.**

```
/flow-literature --register
```

The agent asks for title / DOI / authors, creates a paper with an ID
(`PAP-001`), then asks whether to link it to an existing claim or file a
new one (`C-001`). The paper lands in
`.vibe-science-environment/flows/literature.json`. The claim lands in the
kernel DB via the plugin.

**5. Register a real experiment.**

```
/flow-experiment --register
```

The agent asks: title, objective, parameters
(e.g. `{minCellsPerGene: 3, minGenesPerCell: 200}`), `codeRef` (path to
your Python/R script), `relatedClaims` (the `C-001` from step 4). Creates
`EXP-001` at
`.vibe-science-environment/experiments/manifests/EXP-001.json`.

**6. Run the actual analysis outside VRE.** VRE does not execute your
scanpy/Seurat/DESeq2 pipeline. You run it yourself (or the agent runs
your `.py` via the Bash tool). Outputs go wherever you decide — you link
them to the manifest.

**7. Package the results.**

```
/flow-results --package EXP-001
```

VRE collects `outputArtifacts` from the manifest and creates a bundle
under `.vibe-science-environment/results/bundles/EXP-001/`.

**8. During all this, the plugin acts as a brake.** If you try to
promote a claim without an R2 review, the plugin's PreToolUse hook
blocks the write. If you try to close the session with unreviewed
claims, the Stop hook blocks. These are not VRE errors — they are the
kernel's discipline protecting you.

**9. Prepare an advisor handoff.**

```
/flow-writing --handoff C-001
```

VRE generates a markdown export with claim-backed content (only promoted
claims with verified citations) kept explicitly separate from
speculation.

**10. End of session: refresh memory.**

```
/sync-memory
```

or from the terminal:

```bash
node bin/vre sync-memory
```

Regenerates readable markdown mirrors of kernel state at
`.vibe-science-environment/memory/*.md`. Useful for opening a new
session later with continuity.

### Debug checklist

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `kernel: degraded` in `vre init` | sibling `vibe-science` moved / renamed | `set VRE_KERNEL_PATH=<absolute-path-to-vibe-science>` (Windows: `set`; Linux/macOS: `export`) |
| `/flow-*` not recognized in Claude Code | `vibe-science` plugin not installed OR VRE not opened as the project | Check with `/help` in Claude Code that the vibe commands are listed |
| Claim won't promote | Plugin PreToolUse blocks for missing `confounder_status` | Add confounder_status to the claim ledger entry before retrying |
| `vre flow-status` warns about budget | `VRE_BUDGET_MAX_USD` exceeded | Clear the env var or close the active flow |
| Session won't close | Stop hook blocks on unreviewed claims | Run an R2 review, or mark the claim DISPUTED explicitly |
| Kernel DB looks empty | Plugin SessionStart hook didn't run (fresh project) | Run any plugin command once; or rerun `vre init` and check `kernel:` line |

### Why this exists

The plugin and VRE together give you this: **every time the agent does
something scientific, the system forces you to make it explicit,
verifiable, and reproducible.** It is not magic. It is not even
comfortable. It is a **structural brake** that exists because, without
it, an enthusiastic agent gets you to declare results that don't hold up
to review.

The real point of dogfooding: take a real paper from your bibliography,
register it with `/flow-literature`, then take an analysis you **want**
to run (not one already done), register it as a manifest, run it, and
see where the system forces you to slow down. Where it slows you down
usefully, keep it. Where it slows you down for no reason, come back and
say so.

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

- [Kernel governance probe test](environment/tests/compatibility/kernel-governance-probe.test.js) — 8 bidirectional probes against the real sibling kernel
- [Saved-artifact eval tests](environment/tests/evals/saved-artifacts.test.js) — enforces `real-cli-binding-codex` + durable `externalReview` record
- [Operator-validation artifacts](.vibe-science-environment/operator-validation/) — saved benchmark repeats and context baselines

*Internal planning artifacts (phase closeouts, implementation plan, spec index) are not published to the public repo. They drive development locally but contain design context that's not open-source yet.*

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

- [Research Agent Protocol](.claude/skills/vibe-research-agent/SKILL.md) — the skill an agent loads when doing research in this project (paper registration, claim ledger, manifest discipline, R2 review)
- [CLAUDE.md](CLAUDE.md) — auto-loaded project context for Claude Code
- [Runtime flow helpers](environment/flows/) — `literature.js`, `experiment.js`, `writing.js`, `results-discovery.js`, `session-digest.js`
- [Orchestrator](environment/orchestrator/) — queue, execution lane, review lane, task registry
- [Kernel bridge](environment/lib/kernel-bridge.js) — read-only bridge to the `vibe-science` kernel sibling

*Detailed phase closeouts, implementation plans, and spec indexes are kept in local planning docs not published here.*

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

VRE ha due superfici:

- **4 comandi CLI** (eseguibili direttamente dal terminale) — diagnostici
  e housekeeping. Non creano contenuto scientifico.
- **9 comandi agent-driven** (invocati dentro Claude Code come `/flow-*`,
  `/orchestrator-*`, etc.) — il lavoro di ricerca vero. Un agente legge il
  contratto markdown in `commands/<nome>.md` ed esegue l'helper in
  `environment/flows/`.

### Tutti i 4 comandi CLI

```bash
node bin/vre init                 # bootstrap: state tree + kernel wiring + prossimi passi
node bin/vre flow-status          # sessione corrente, flow attivo, blocker, budget, stato kernel
node bin/vre orchestrator-status  # coda, lane run, escalation, prossima azione consigliata
node bin/vre sync-memory          # rigenera mirror .vibe-science-environment/memory/*.md dal kernel
```

`VRE_VERBOSE=1` attiva una riga `kernel-bridge active|degraded` su stderr
per comando.

### Tutti i 9 comandi agent-driven (con subcommand)

| Comando | Subcommand | Cosa fa |
|---------|------------|---------|
| `/flow-literature` | `--register` | Registra un paper (titolo, DOI, autori), opzionalmente linkato a un claim |
| `/flow-literature` | `--list` | Lista paper registrati |
| `/flow-literature` | `--link-claim` | Collega un paper esistente a un claim esistente |
| `/flow-experiment` | `--register` | Crea un manifest di esperimento (titolo, objective, parametri, codeRef) |
| `/flow-experiment` | `--update <EXP-id>` | Aggiorna un manifest esistente (es. aggiungere outputArtifacts) |
| `/flow-experiment` | `--blockers` | Mostra blocker correnti per esperimenti aperti |
| `/flow-results` | `--package <EXP-id>` | Impacchetta output di un esperimento in un bundle con manifest |
| `/flow-results` | `--list` | Lista bundle risultati esistenti |
| `/flow-writing` | `--handoff <C-id>` | Genera export separando contenuto claim-backed da speculazione |
| `/flow-writing` | `--advisor-pack` | Variante export per advisor |
| `/flow-writing` | `--rebuttal-pack` | Variante export per rebuttal reviewer |
| `/orchestrator-run` | `<objective>` | Ruota un objective nella coda → execution lane → review lane |
| `/automation-status` | — | Stato automazioni schedulate |
| `/export-warning-digest` | — | Aggrega alert di export (claim promossi/demossi dopo export) |
| `/stale-memory-reminder` | — | Segnala mirror markdown stantii vs kernel |
| `/weekly-digest` | — | Digest settimanale dello stato ricerca |

---

## Coesistenza con il plugin Vibe Science

### Il modello mentale

VRE e il plugin `vibe-science` **girano affiancati nella stessa sessione
Claude Code**:

- **Plugin `vibe-science`** = hook lifecycle Claude Code (SessionStart,
  PreToolUse, PostToolUse, Stop, …). Quando attivo, monitora ogni tool
  call dell'agente e impone gate di governance — es. un claim non può
  essere scritto nel ledger senza un campo `confounder_status`, una
  sessione non può chiudere con claim non reviewati. Scrive sul
  **DB SQLite kernel** (claim, citazioni, gate checks, governance
  events).
- **VRE** = tool Node.js locale. Il suo middleware gestisce stato
  workflow (attempt, snapshot, budget). Scrive in
  **`.vibe-science-environment/`** (stato flow, manifest esperimenti,
  bundle risultati, export writing). Legge dal kernel tramite
  `environment/lib/kernel-bridge.js` — **sola lettura**, mai scrive
  verità kernel.

Non si pestano i piedi perché scrivono in directory disgiunte.

### Loop concreto di ricerca in 10 step

**1. Attiva il plugin in Claude Code.** Se hai installato `vibe-science`
dal marketplace plugin, dovrebbe essere già attivo. Per verificare: in
una sessione Claude Code digita `/vibe` e controlla di ricevere una
risposta.

**2. Apri la cartella progetto in Claude Code.** Apri il checkout
`vibe-research-environment` come progetto. L'hook SessionStart del
plugin bootstrappa il DB kernel automaticamente se manca.

**3. Prima azione: stato corrente.**

In chat Claude Code:
```
/flow-status
```

L'agente esegue l'helper VRE `getOperatorStatus`, leggendo anche lo
stato kernel via bridge. Ricevi info sessione, flow attivo (nessuno
ancora), claim promossi (probabilmente zero), budget speso, blocker
eventuali.

**4. Registra il primo paper della tua bibliografia.**

```
/flow-literature --register
```

L'agente chiede titolo / DOI / autori, crea un paper con ID
(`PAP-001`), poi chiede se linkarlo a un claim esistente o apre uno
nuovo (`C-001`). Il paper finisce in
`.vibe-science-environment/flows/literature.json`. Il claim finisce
nel DB kernel via plugin.

**5. Registra un esperimento reale.**

```
/flow-experiment --register
```

L'agente chiede: titolo, objective, parametri
(es. `{minCellsPerGene: 3, minGenesPerCell: 200}`), `codeRef` (path
al tuo script Python/R), `relatedClaims` (il `C-001` dello step 4).
Crea `EXP-001` in
`.vibe-science-environment/experiments/manifests/EXP-001.json`.

**6. Lancia l'analisi vera fuori da VRE.** VRE non esegue la tua
pipeline scanpy/Seurat/DESeq2. La lanci tu (o l'agente lancia il tuo
`.py` via Bash tool). Gli output vanno dove decidi tu — tu li linki
al manifest.

**7. Impacchetta i risultati.**

```
/flow-results --package EXP-001
```

VRE raccoglie `outputArtifacts` dal manifest e crea un bundle sotto
`.vibe-science-environment/results/bundles/EXP-001/`.

**8. Durante tutto questo, il plugin fa da freno.** Se provi a
promuovere un claim senza R2 review, l'hook PreToolUse del plugin
blocca la scrittura. Se provi a chiudere sessione con claim non
reviewati, l'hook Stop blocca. Non sono errori VRE — è la disciplina
del kernel che ti protegge.

**9. Prepara un handoff per advisor.**

```
/flow-writing --handoff C-001
```

VRE genera un export markdown con contenuto claim-backed (solo
claim promossi con citazioni verificate) tenuto esplicitamente
separato dalla speculazione.

**10. Fine sessione: refresh memoria.**

```
/sync-memory
```

oppure da terminale:

```bash
node bin/vre sync-memory
```

Rigenera mirror markdown leggibili dello stato kernel in
`.vibe-science-environment/memory/*.md`. Utile per aprire una nuova
sessione più tardi con continuità.

### Debug checklist

| Sintomo | Causa probabile | Fix |
|---------|-----------------|-----|
| `kernel: degraded` in `vre init` | sibling `vibe-science` spostato / rinominato | `set VRE_KERNEL_PATH=<path-assoluto-a-vibe-science>` (Windows: `set`; Linux/macOS: `export`) |
| `/flow-*` non riconosciuto in Claude Code | Plugin `vibe-science` non installato OPPURE VRE non aperto come progetto | Verifica con `/help` in Claude Code che i comandi vibe siano listati |
| Claim non promuove | Hook PreToolUse del plugin blocca per `confounder_status` mancante | Aggiungi confounder_status alla entry del claim ledger prima di riprovare |
| `vre flow-status` avvisa su budget | `VRE_BUDGET_MAX_USD` superato | Cancella la env var o chiudi il flow attivo |
| Sessione non si chiude | Hook Stop blocca su claim non reviewati | Fai una R2 review, o marca il claim DISPUTED esplicitamente |
| DB kernel sembra vuoto | Hook SessionStart del plugin non è partito (progetto fresco) | Esegui un comando plugin qualsiasi una volta; oppure rilancia `vre init` e controlla la riga `kernel:` |

### Perché esiste

Il plugin e VRE insieme ti danno questo: **ogni volta che l'agente fa
qualcosa di scientifico, il sistema ti costringe a renderlo esplicito,
verificabile e ripetibile.** Non è magia. Non è nemmeno comodo. È un
**freno strutturale** che esiste perché, senza, un agente entusiasta ti
fa dichiarare risultati che non reggono alla review.

Il punto vero del dogfooding: prendi un paper reale della tua
bibliografia, registralo con `/flow-literature`, poi prendi un'analisi
che **vuoi** fare (non una già fatta), registrala come manifest,
lanciala, e guarda dove il sistema ti costringe a rallentare. Dove
rallenta in modo utile, mantieni. Dove rallenta senza motivo, torna e
dimmelo.

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

- [Test probe governance kernel](environment/tests/compatibility/kernel-governance-probe.test.js) — 8 probe bidirezionali contro il kernel sibling reale
- [Test eval degli artifact salvati](environment/tests/evals/saved-artifacts.test.js) — impone `real-cli-binding-codex` + record durable `externalReview`
- [Artifact operator-validation](.vibe-science-environment/operator-validation/) — benchmark repeat salvati e baseline di contesto

*Gli artefatti interni di planning (closeout delle fasi, piano di implementazione, indice spec) non sono pubblicati sul repo pubblico. Guidano lo sviluppo in locale ma contengono contesto di design non ancora open-source.*

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

- [Protocollo agente di ricerca](.claude/skills/vibe-research-agent/SKILL.md) — la skill che un agente carica quando fa ricerca in questo progetto (registrazione paper, claim ledger, disciplina manifest, R2 review)
- [CLAUDE.md](CLAUDE.md) — contesto di progetto auto-caricato per Claude Code
- [Helper flow runtime](environment/flows/) — `literature.js`, `experiment.js`, `writing.js`, `results-discovery.js`, `session-digest.js`
- [Orchestratore](environment/orchestrator/) — coda, execution lane, review lane, task registry
- [Kernel bridge](environment/lib/kernel-bridge.js) — bridge read-only al kernel sibling `vibe-science`

*I closeout dettagliati delle fasi, i piani di implementazione e gli indici spec sono tenuti in doc di planning locali non pubblicati qui.*

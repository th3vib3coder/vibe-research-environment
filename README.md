# Vibe Research Environment (VRE)

VRE is a file-backed research operating shell for scientists who work with AI
agents.

If you use an AI agent for literature, experiments, results, and writing, the
default failure mode is brutal: the important work lives in chat, the chat gets
compacted, and after a few days nobody can tell which paper was read, which
experiment was run, which claim was reviewed, or which output is safe to put in
a draft.

VRE fixes that by moving the operational memory of research onto disk. It gives
the agent a disciplined workspace for objectives, papers, experiment manifests,
result bundles, writing handoffs, memory mirrors, queues, lane runs, scheduled
digests, and audit evidence.

VRE is usually paired with the **Vibe Science** kernel:

- **Vibe Science** owns scientific truth: claims, citations, gates,
  governance hooks, R2 adversarial review, R3 judge review, serendipity, and
  the kernel SQLite database.
- **VRE** owns research workflow state: what the agent is doing, what it has
  registered, what can be resumed, what was packaged, what needs review, and
  what evidence can be inspected.

VRE is not a statistics package, not a notebook engine, and not a chatbot UI.
It is the operating layer around research work: the place where an AI-assisted
research session becomes auditable, resumable, and harder to fool.

---

## Contents

- [Who VRE Is For](#who-vre-is-for)
- [What VRE Can Do Today](#what-vre-can-do-today)
- [Quick Start](#quick-start)
- [Friendly Usage Manual](#friendly-usage-manual)
- [Command Reference](#command-reference)
- [Architecture](#architecture)
- [Safety Model](#safety-model)
- [Technical Details](#technical-details)
- [Current Status](#current-status)
- [Italiano](#italiano)

---

## Who VRE Is For

VRE is for researchers, students, and research engineers who already use real
scientific tools and want AI assistance without losing the trail.

It is especially useful when:

- you are doing data-driven scientific work such as bioinformatics, scRNA-seq,
  omics, or adjacent computational research;
- you want an AI agent to help with papers, manifests, result packaging,
  writing handoffs, and review preparation;
- you need work to survive long gaps, chat compaction, or handoff to another
  agent;
- you care about separating verified claims from drafts, speculation, and
  operational notes;
- you want an agent that slows down at the right places, especially around
  claim promotion, R2 verdicts, destructive actions, and missing evidence.

VRE is probably too much if you only want a quick disposable chat. The point of
VRE is discipline: it adds structure so that research does not evaporate.

---

## What VRE Can Do Today

### Core Research Flows

VRE ships helpers and command contracts for the everyday research loop:

| Area | What VRE provides |
|---|---|
| Literature | Register papers, deduplicate by DOI, list papers, link papers to claims, surface citation gaps. |
| Experiments | Register schema-valid experiment manifests before analysis, update manifests, list experiments, surface blockers. |
| Results | Package completed experiment outputs into inspectable bundles with manifests and typed artifacts. |
| Writing | Build claim-aware handoffs, advisor packs, rebuttal packs, export snapshots, seeds, and deliverables. |
| Memory | Refresh markdown mirrors from kernel and workspace state, with freshness warnings. |
| Status | Report active flow, blockers, kernel bridge health, budget state, writing/results pointers, automation readiness, and latest attempts. |

### Phase 9 Objective Runtime

VRE also includes the newer Phase 9 objective layer:

| Area | What VRE provides |
|---|---|
| Objectives | `objective start/status/pause/resume/stop/doctor` with active-objective locking, budgets, wake policies, resume snapshots, and lifecycle events. |
| Bounded loop | `research-loop` runs a bounded objective loop with wake leases, queue replay, blocker handling, memory sync, digest writing, and strategic drift checks. |
| Sanctioned execution | `run-analysis` executes only a reviewed local script template from a schema-valid analysis manifest. |
| Scheduler support | `scheduler install/status/doctor/remove` integrates unattended wake support through Windows Task Scheduler. |
| Orchestrator | Durable queue, lane policies, execution/review lanes, provider gateway, recovery records, escalations, continuity profile, and task registry. |
| Review binding | Reviewer-2 verdicts can be bound to typed claim edges in the supported `REJECT + contradictedClaimId` case. |
| Audit evidence | `environment/audit/query.js` can build the Wave 6 evidence excerpt from governance events and claim edges. |

### Governance And Audit Surfaces

VRE is designed to make uncertainty visible:

- kernel bridge results carry availability/provenance metadata instead of
  silently pretending that missing data means zero;
- governance events are append-only on the kernel side;
- VRE objective events, queue records, lane runs, handoffs, claim edges, and
  audit outputs are durable files;
- R2 verdicts and claim-edge binding use narrow, reviewed pathways;
- `npm run validate`, `npm run test:phase9`, and CI enforce ledger, schema,
  surface-index, sandbox, personal-path, and closeout-honesty checks.

---

## Quick Start

### 1. Check Out Both Repositories Side By Side

```bash
mkdir research-os
cd research-os
git clone https://github.com/th3vib3coder/vibe-science.git
git clone https://github.com/th3vib3coder/vibe-research-environment.git
```

Recommended layout:

```text
research-os/
  vibe-science/                  # scientific kernel and Claude Code plugin
  vibe-research-environment/     # VRE, this repository
```

VRE auto-detects a sibling `vibe-science` checkout. If your kernel lives
elsewhere, set `VRE_KERNEL_PATH`.

```bash
export VRE_KERNEL_PATH=/absolute/path/to/vibe-science
```

PowerShell:

```powershell
$env:VRE_KERNEL_PATH = "C:\absolute\path\to\vibe-science"
```

### 2. Install Dependencies

```bash
cd vibe-research-environment
npm install
```

VRE requires Node.js 18 or newer. CI currently uses Node.js 20.

### 3. Initialize VRE

```bash
node bin/vre init
```

This creates or checks the local state tree:

```text
.vibe-science-environment/
  control/
  flows/
  memory/
  objectives/
  orchestrator/
```

If the kernel is found, `init` reports an active kernel bridge. If the kernel
is missing, VRE reports `kernel: degraded` and continues honestly. Many
workspace surfaces still work in degraded mode, but kernel truth such as
claims, citations, gate checks, and R2 state cannot be trusted as complete.

### 4. Verify The Repository

```bash
npm run check
```

`npm run check` runs the validators and the Node test suite. CI also runs the
named Phase 9 suite:

```bash
npm run test:phase9
```

---

## Friendly Usage Manual

This section is the "how do I actually use it?" version.

### Step 1. Ask VRE What State Exists

```bash
node bin/vre flow-status
node bin/vre orchestrator-status
```

Use `flow-status` for the operator view: active flow, blockers, memory
freshness, kernel availability, recent attempts, experiments, writing exports,
automation state, and result pointers.

Use `orchestrator-status` for the coordination view: objective, queue, lanes,
escalations, recoveries, continuity mode, and next recommended action.

### Step 2. Start An Objective

An objective is the durable shell around a research goal.

```bash
node bin/vre objective start \
  --title "PDAC T-cell exhaustion marker survey" \
  --question "Which exhaustion markers are defensible in PDAC scRNA-seq?" \
  --mode interactive \
  --budget "maxWallSeconds=3600,maxIterations=3,heartbeatIntervalSeconds=300"
```

For non-interactive modes, provide a wake policy:

```bash
node bin/vre objective start \
  --title "Overnight literature digest" \
  --question "Summarize recent PDAC scRNA-seq exhaustion evidence" \
  --mode unattended-batch \
  --budget "maxWallSeconds=7200,maxIterations=5,heartbeatIntervalSeconds=600" \
  --wake-policy "wakeOwner=windows-task-scheduler,leaseTtlSeconds=600,duplicateWakePolicy=no-op"
```

Useful objective commands:

```bash
node bin/vre objective status --objective OBJ-...
node bin/vre objective pause --objective OBJ-... --reason "waiting for user decision"
node bin/vre objective resume --objective OBJ-...
node bin/vre objective resume --objective OBJ-... --repair-snapshot
node bin/vre objective stop --objective OBJ-... --reason "completed"
node bin/vre objective doctor --objective OBJ-...
```

### Step 3. Let The Agent Register Papers And Experiments

When an AI agent reads papers or prepares an analysis, it should not leave
that work only in chat.

Agent-facing command contracts live in `commands/`:

```text
/flow-literature --register
/flow-experiment --register
/flow-results --package EXP-001
/flow-writing --handoff
/flow-writing --advisor-pack 2026-04-30
/flow-writing --rebuttal-pack SUBMISSION-001
```

The agent reads the markdown contract, calls the helper in `environment/`, and
lets VRE write the machine-owned files. The user should not have to type
clerical details such as DOI lists or manifest fields if the agent can extract
them from sources and files.

### Step 4. Run Analysis Only Through A Manifested Path

VRE does not replace Scanpy, Seurat, DESeq2, R, Python, or notebooks. It does,
however, require analysis work to be registered and bounded.

The current `run-analysis` surface supports a reviewed local Node-script
template from a schema-valid analysis manifest:

```bash
node bin/vre run-analysis --manifest path/to/analysis-manifest.json
```

Dry run:

```bash
node bin/vre run-analysis --manifest path/to/analysis-manifest.json --dry-run
```

The manifest must declare inputs, outputs, expected artifacts, a safe command
template, budgets, and safety flags. Network access is not allowed in the v1
reviewed template.

### Step 5. Run A Bounded Research Loop

Once an objective exists, VRE can run one bounded loop invocation:

```bash
node bin/vre research-loop --objective OBJ-... --json --max-iterations 1
```

Resume mode:

```bash
node bin/vre research-loop --objective OBJ-... --json --resume
```

Heartbeat / wake mode:

```bash
node bin/vre research-loop --objective OBJ-... --json --heartbeat --wake-id wake-001
```

The loop is intentionally bounded. It writes queue records, objective events,
snapshots, blockers, digests, and memory sync state. If evidence is ambiguous
or unsafe, it blocks or escalates instead of silently continuing.

### Step 6. Sync Memory Before Stopping

At the end of a research session:

```bash
node bin/vre sync-memory
```

This refreshes machine-owned memory mirrors under:

```text
.vibe-science-environment/memory/mirrors/
```

Mirrors are for resume and navigation. They do not replace kernel truth.

### Step 7. Build Human-Friendly Outputs

When experiments and claims are ready, use writing and digest surfaces:

```text
/flow-writing --handoff
/flow-writing --advisor-pack 2026-04-30
/flow-writing --rebuttal-pack SUBMISSION-001
/weekly-digest
/export-warning-digest
/stale-memory-reminder
```

These produce reviewable artifacts. They organize evidence and open issues,
but they do not promote claims or verify citations by themselves.

---

## Command Reference

### Direct CLI Commands

Run direct commands as:

```bash
node bin/vre <command>
```

| Command | Purpose |
|---|---|
| `init` | Create/check VRE state roots and report kernel bridge status. |
| `flow-status` | Operator-facing status summary. |
| `orchestrator-status` | Queue, lane, escalation, recovery, continuity, and objective status. |
| `sync-memory` | Refresh memory mirrors from allowed kernel/workspace projections. |
| `capabilities --json` | Generate and persist the Phase 9 capability handshake. |
| `capabilities doctor` | Inspect capability surface health. |
| `objective start` | Create and activate a new objective. |
| `objective status` | Inspect one objective. |
| `objective pause` | Pause an active objective with a reason. |
| `objective resume` | Resume a paused objective, optionally repairing the snapshot. |
| `objective stop` | Stop an objective with a reason. |
| `objective doctor` | Diagnose objective state, scheduler readiness, and resume artifacts. |
| `run-analysis` | Execute a reviewed analysis manifest through the sanctioned lane. |
| `research-loop` | Run or resume a bounded objective loop. |
| `scheduler install` | Install a Windows scheduled wake task for an objective. |
| `scheduler status` | Inspect scheduled wake state for an objective. |
| `scheduler doctor` | Diagnose scheduler configuration for an objective. |
| `scheduler remove` | Remove scheduled wake support for an objective. |

### Common CLI Options

| Command | Important options |
|---|---|
| `objective start` | `--title`, `--question`, `--mode`, `--reasoning-mode rule-only`, `--budget`, `--wake-policy` for non-interactive modes. |
| `objective status` | `--objective OBJ-...` |
| `objective pause` | `--objective OBJ-... --reason "..."` |
| `objective resume` | `--objective OBJ-...`, optional `--repair-snapshot` |
| `objective stop` | `--objective OBJ-... --reason "..."` |
| `run-analysis` | `--manifest path/to/manifest.json`, optional `--dry-run` |
| `research-loop` | `--objective OBJ-... --json`, optional `--resume`, `--heartbeat`, `--wake-id`, `--max-iterations`, `--max-wall-seconds`, `--mode` |
| `scheduler install/status/doctor/remove` | `--objective OBJ-...` |

`--budget` and `--wake-policy` may be inline `key=value` lists, inline JSON, or
paths to JSON files.

### Agent Command Contracts

These are markdown contracts for an AI agent, not all direct shell verbs:

| Contract | Purpose |
|---|---|
| `/flow-literature` | Register/list/link papers and surface literature gaps. |
| `/flow-experiment` | Register/update/list experiments and surface blockers. |
| `/flow-results` | Package completed experiment outputs. |
| `/flow-writing` | Build handoffs, advisor packs, rebuttal packs, and writing exports. |
| `/flow-status` | Agent-facing status contract for the same status surface. |
| `/sync-memory` | Agent-facing memory sync contract. |
| `/orchestrator-run` | Agent contract for creating/continuing routed orchestrator work. |
| `/orchestrator-status` | Agent-facing orchestrator status contract. |
| `/automation-status` | Show automation readiness and latest artifacts. |
| `/weekly-digest` | Create a reviewable weekly research digest artifact. |
| `/export-warning-digest` | Summarize export alerts. |
| `/stale-memory-reminder` | Summarize stale memory mirror state. |

### Task Kinds

The orchestrator task registry currently includes:

| Task kind | Lane | Purpose |
|---|---|---|
| `literature-flow-register` | execution | Register a paper. |
| `experiment-flow-register` | execution | Register an experiment manifest. |
| `results-bundle-discover` | execution | Discover result bundles. |
| `writing-export-finalize` | execution | Finalize a deliverable from an export snapshot. |
| `session-digest-export` | execution | Export a session summary. |
| `memory-sync-refresh` | execution | Refresh memory mirrors. |
| `session-digest-review` | review | Review a session digest through the review lane. |

---

## Architecture

```text
Human researcher
  |
  v
AI agent (Claude Code, Codex, Gemini CLI)
  |
  | reads command contracts and calls helpers
  v
VRE control plane
  |
  | attempts, events, decisions, capabilities, session snapshots
  v
VRE research runtime
  |
  | flows, objectives, orchestrator, queue, lanes, memory, automation
  v
.vibe-science-environment/ on disk

Vibe Science kernel/plugin
  |
  | claims, citations, gates, R2/R3, governance events, SQLite truth
  v
.vibe-science/ and kernel DB
```

### The Two-Repo Boundary

| Repository | Owns | Does not own |
|---|---|---|
| `vibe-science` | Scientific truth, plugin hooks, claims, citations, gates, R2/R3, serendipity, SQLite DB, governance events. | VRE workflow state and result packaging. |
| `vibe-research-environment` | Operational workflow state, objective runtime, flow helpers, manifests, result bundles, memory mirrors, scheduler, queue/lane orchestration, connectors, audit excerpts. | Kernel truth, claim promotion authority, citation truth, gate truth. |

VRE reads kernel truth through `environment/lib/kernel-bridge.js`. It does not
write kernel state directly.

### Main VRE Layers

| Layer | Key paths |
|---|---|
| CLI dispatcher | `bin/vre` |
| Command contracts | `commands/*.md` |
| Control plane | `environment/control/` |
| Research flows | `environment/flows/` |
| Objectives | `environment/objectives/` |
| Orchestrator | `environment/orchestrator/` |
| Memory | `environment/memory/` |
| Automation | `environment/automation/` |
| Connectors | `environment/connectors/` |
| Domain packs | `environment/domain-packs/` |
| Audit helpers | `environment/audit/query.js` |
| Schemas | `environment/schemas/` |
| Tests | `environment/tests/` |
| Runtime state | `.vibe-science-environment/` |

---

## Safety Model

VRE is opinionated because research automation without discipline is dangerous.

### 1. No Silent Zero

A missing kernel database is not the same as "zero claims" or "no blockers".
Kernel bridge envelopes carry `dbAvailable`, `sourceMode`, and degraded reason
metadata. If the bridge is degraded, VRE should say so.

### 2. File-Backed State

Attempts, decisions, events, manifests, bundles, queue records, lane runs,
handoffs, digests, and memory mirrors live on disk. The chat transcript is not
the source of truth.

### 3. Manifest Before Analysis

Experiments and sanctioned analysis runs must be described before execution.
The current `run-analysis` surface is narrow by design: schema-valid manifest,
reviewed command template, safe paths, bounded runtime, and no network access.

### 4. R2 Before Claim Promotion

Claim promotion belongs to the Vibe Science kernel and its review gates. VRE
can prepare evidence and route review work, but it does not silently promote
scientific claims.

### 5. Append-Only And Fail-Closed Where It Matters

Governance events and ledgers are designed to be inspectable. Many write paths
fail closed on invalid schema, missing metadata, duplicate conflicts, unsafe
paths, or unsupported templates.

### 6. Reviewable Automation

Scheduled digests and reminders create review artifacts. They do not replace
per-patch ledger discipline, do not decide gates, and do not mutate scientific
truth.

---

## Technical Details

### Local State Directory

VRE writes machine-owned state under:

```text
.vibe-science-environment/
  automation/
  claims/
  control/
  experiments/
  flows/
  memory/
  objectives/
  orchestrator/
  results/
  writing/
```

Do not edit these files by hand unless a specific maintenance task says so.
Use the helpers and command contracts.

### Environment Variables

| Variable | Purpose |
|---|---|
| `VRE_KERNEL_PATH` | Explicit path to `vibe-science`; overrides sibling auto-discovery. |
| `VRE_VERBOSE=1` | Print per-command kernel bridge active/degraded diagnostics to stderr. |
| `VRE_BUDGET_MAX_USD` | Middleware hard-stop spend limit. |
| `VRE_BUDGET_ESTIMATED_COST_USD` | Advisory cost threshold. |
| `VRE_CLAUDE_CLI` | Override path to the Claude CLI. On Windows, often `claude.cmd`. |
| `VRE_CODEX_CLI` | Override path to the Codex CLI. On Windows, often `codex.cmd`. |
| `VRE_REVIEW_EVIDENCE_MODE` | Test/review-lane evidence-mode override. |
| `VRE_EXTERNAL_WAKE_CALLER` | Identity for external `research-loop` wake calls. |
| `VRE_HEARTBEAT_PROBE_ONLY=1` | Exercise heartbeat probe mode without running the full loop. |
| `VRE_HEARTBEAT_MIN_INTERVAL_MS` | Process-local heartbeat governance rate limit. |
| `VRE_RUN_ANALYSIS_TIMEOUT_MS` | Operator cap for sanctioned analysis execution timeout. |
| `VIBE_SCIENCE_DB_PATH` | Used by plugin-owned bridge CLIs when an explicit DB path is needed. |
| `VIBE_SCIENCE_PLUGIN_ROOT` | Used by plugin-owned bridge CLIs when plugin root discovery needs help. |
| `VIBE_SCIENCE_AUDIT_QUERY_CLI` | Override path for the plugin audit-query CLI. |
| `ANTHROPIC_API_KEY` | Passed through to Claude CLI executor when needed. |
| `OPENAI_API_KEY` | Passed through to Codex CLI executor when needed. |
| `CLAUDE_CONFIG_DIR` | Passed through to Claude CLI executor when needed. |

### Validation And Tests

Useful commands:

```bash
npm run validate
npm run test:phase9
npm test
npm run check
npm run build:surface-index
npm run check:phase9-ledger
```

Current validator coverage includes counts, CI workflow, Phase 9 ledger rules,
surface index, write sandbox, no-personal-path checks, and closeout honesty.

### Current Surface Counts

At the current Wave 5 v2.1 evidence-side closeout, the VRE validators expect:

| Surface | Count |
|---|---:|
| Install bundle manifests | 11 |
| Schemas | 54 |
| Eval tasks | 25 |
| Eval metrics | 5 |
| Eval benchmarks | 5 |
| CI validators | 15 |

These counts are enforced by repository validators and should be updated only
with the code that changes the surface.

---

## Current Status

Wave 5 v2.1 is complete on the evidence side. The implementation trail for seq
`113-130` landed, R2 inline pending is zero, and seq `130` records `R2 inline
OK`.

The operator gate flip from `wave-5-implementation-allowed.status` to
`completed` is intentionally separate. Wave 6 is formally unlocked after that
operator action. The operating rule remains: Phase 10 does not begin before
Phase 9 is complete.

For live CI state, check GitHub Actions. This README describes the repository
surface, not a guarantee about every future commit.

---

# Italiano

# Vibe Research Environment (VRE)

VRE e' una shell operativa file-backed per fare ricerca con agenti AI.

Quando usi un agente AI per letteratura, esperimenti, risultati e scrittura, il
problema classico e' questo: il lavoro importante rimane nella chat, la chat
viene compattata, e dopo qualche giorno non e' piu' chiaro quali paper siano
stati letti, quale esperimento sia stato eseguito, quale claim sia stato
revisionato, o quale output sia abbastanza solido per entrare in una bozza.

VRE risolve questo problema spostando la memoria operativa della ricerca su
disco. Da' all'agente uno spazio disciplinato per obiettivi, paper, manifesti
di esperimento, bundle di risultati, handoff di scrittura, mirror di memoria,
code, lane run, digest schedulati ed evidenza auditabile.

VRE di solito lavora insieme al kernel **Vibe Science**:

- **Vibe Science** possiede la verita' scientifica: claim, citazioni, gate,
  hook di governance, review avversaria R2, judge review R3, serendipity e il
  database SQLite del kernel.
- **VRE** possiede lo stato operativo del workflow: cosa sta facendo l'agente,
  cosa ha registrato, cosa si puo' riprendere, cosa e' stato impacchettato,
  cosa richiede review, e quale evidenza si puo' ispezionare.

VRE non e' un pacchetto statistico, non e' un motore notebook, e non e' una UI
chatbot. E' il livello operativo intorno al lavoro di ricerca: il punto in cui
una sessione di ricerca assistita da AI diventa auditabile, riprendibile e piu'
difficile da falsare.

---

## Indice

- [A Chi Serve VRE](#a-chi-serve-vre)
- [Cosa Sa Fare VRE Oggi](#cosa-sa-fare-vre-oggi)
- [Quick Start](#quick-start-1)
- [Manuale Friendly](#manuale-friendly)
- [Reference Dei Comandi](#reference-dei-comandi)
- [Architettura](#architettura)
- [Modello Di Sicurezza](#modello-di-sicurezza)
- [Dettagli Tecnici](#dettagli-tecnici)
- [Stato Corrente](#stato-corrente)

---

## A Chi Serve VRE

VRE e' pensato per ricercatori, studenti e research engineer che usano gia'
strumenti scientifici reali e vogliono usare agenti AI senza perdere la traccia
del lavoro.

E' particolarmente utile quando:

- fai ricerca data-driven, per esempio bioinformatica, scRNA-seq, omics o aree
  computazionali vicine;
- vuoi che un agente AI aiuti con paper, manifesti, packaging dei risultati,
  handoff di scrittura e preparazione di review;
- vuoi che il lavoro sopravviva a pause lunghe, compattazione della chat o
  passaggi tra agenti;
- devi separare claim verificati, bozze, speculazione e note operative;
- vuoi un agente che rallenti nei punti giusti: promozione dei claim, verdetti
  R2, azioni distruttive e evidenza mancante.

VRE e' probabilmente troppo se vuoi solo una risposta usa-e-getta in chat. Il
punto di VRE e' la disciplina: aggiunge struttura per evitare che la ricerca
evapori.

---

## Cosa Sa Fare VRE Oggi

### Flussi Di Ricerca

VRE include helper e contratti di comando per il loop quotidiano di ricerca:

| Area | Cosa fornisce VRE |
|---|---|
| Letteratura | Registrazione paper, deduplica DOI, lista paper, link paper-claim, gap citazionali. |
| Esperimenti | Manifesti di esperimento schema-valid prima dell'analisi, update, lista, blocker. |
| Risultati | Packaging di output completati in bundle ispezionabili con manifesti e artifact tipizzati. |
| Scrittura | Handoff claim-aware, advisor pack, rebuttal pack, export snapshot, seed e deliverable. |
| Memoria | Mirror markdown aggiornati da kernel e workspace, con warning di freschezza. |
| Stato | Flow attivo, blocker, stato kernel bridge, budget, writing/results pointer, automazioni e tentativi recenti. |

### Runtime Obiettivi Phase 9

VRE include anche il livello moderno degli obiettivi Phase 9:

| Area | Cosa fornisce VRE |
|---|---|
| Obiettivi | `objective start/status/pause/resume/stop/doctor` con lock dell'obiettivo attivo, budget, wake policy, resume snapshot ed eventi lifecycle. |
| Loop bounded | `research-loop` con wake lease, replay della coda, blocker, memory sync, digest e strategic drift check. |
| Esecuzione autorizzata | `run-analysis` esegue solo template locali revisionati a partire da un analysis manifest valido. |
| Scheduler | `scheduler install/status/doctor/remove` integra wake unattended via Windows Task Scheduler. |
| Orchestrator | Coda durevole, lane policy, execution/review lane, provider gateway, recovery, escalation, continuity profile e task registry. |
| Review binding | I verdetti Reviewer-2 possono produrre typed claim edges nel caso supportato `REJECT + contradictedClaimId`. |
| Audit evidence | `environment/audit/query.js` costruisce l'evidence excerpt Wave 6 da governance events e claim edges. |

### Governance E Audit

VRE e' progettato per rendere visibile l'incertezza:

- il kernel bridge espone metadati di disponibilita' e provenienza, invece di
  fingere che dati mancanti significhino zero;
- gli eventi di governance sono append-only lato kernel;
- eventi obiettivo, queue records, lane run, handoff, claim edges e output
  audit sono file durevoli;
- verdetti R2 e claim-edge binding passano da percorsi stretti e revisionati;
- `npm run validate`, `npm run test:phase9` e CI controllano ledger, schemi,
  surface index, write sandbox, personal path e closeout honesty.

---

## Quick Start

### 1. Clona I Due Repository Affiancati

```bash
mkdir research-os
cd research-os
git clone https://github.com/th3vib3coder/vibe-science.git
git clone https://github.com/th3vib3coder/vibe-research-environment.git
```

Layout consigliato:

```text
research-os/
  vibe-science/                  # kernel scientifico e plugin Claude Code
  vibe-research-environment/     # VRE, questo repository
```

VRE auto-rileva un checkout sibling `vibe-science`. Se il kernel vive altrove,
imposta `VRE_KERNEL_PATH`.

```bash
export VRE_KERNEL_PATH=/absolute/path/to/vibe-science
```

PowerShell:

```powershell
$env:VRE_KERNEL_PATH = "C:\absolute\path\to\vibe-science"
```

### 2. Installa Le Dipendenze

```bash
cd vibe-research-environment
npm install
```

VRE richiede Node.js 18 o superiore. La CI usa Node.js 20.

### 3. Inizializza VRE

```bash
node bin/vre init
```

Questo crea o controlla l'albero di stato locale:

```text
.vibe-science-environment/
  control/
  flows/
  memory/
  objectives/
  orchestrator/
```

Se il kernel viene trovato, `init` segnala un kernel bridge attivo. Se manca,
VRE segnala `kernel: degraded` e continua in modo onesto. Molte superfici di
workspace funzionano ancora in degraded mode, ma claim, citazioni, gate e stato
R2 del kernel non vanno considerati completi.

### 4. Verifica Il Repository

```bash
npm run check
```

`npm run check` esegue validatori e test Node. La CI esegue anche la suite
Phase 9 nominata:

```bash
npm run test:phase9
```

---

## Manuale Friendly

Questa e' la versione "come lo uso davvero?".

### Step 1. Chiedi A VRE Quale Stato Esiste

```bash
node bin/vre flow-status
node bin/vre orchestrator-status
```

Usa `flow-status` per la vista operatore: flow attivo, blocker, freschezza
memoria, disponibilita' kernel, tentativi recenti, esperimenti, export di
scrittura, automazioni e pointer ai risultati.

Usa `orchestrator-status` per la vista coordinamento: obiettivo, coda, lane,
escalation, recovery, continuity mode e prossima azione raccomandata.

### Step 2. Apri Un Obiettivo

Un obiettivo e' il contenitore durevole intorno a una domanda di ricerca.

```bash
node bin/vre objective start \
  --title "PDAC T-cell exhaustion marker survey" \
  --question "Which exhaustion markers are defensible in PDAC scRNA-seq?" \
  --mode interactive \
  --budget "maxWallSeconds=3600,maxIterations=3,heartbeatIntervalSeconds=300"
```

Per modalita' non interattive, aggiungi una wake policy:

```bash
node bin/vre objective start \
  --title "Overnight literature digest" \
  --question "Summarize recent PDAC scRNA-seq exhaustion evidence" \
  --mode unattended-batch \
  --budget "maxWallSeconds=7200,maxIterations=5,heartbeatIntervalSeconds=600" \
  --wake-policy "wakeOwner=windows-task-scheduler,leaseTtlSeconds=600,duplicateWakePolicy=no-op"
```

Comandi utili per gli obiettivi:

```bash
node bin/vre objective status --objective OBJ-...
node bin/vre objective pause --objective OBJ-... --reason "waiting for user decision"
node bin/vre objective resume --objective OBJ-...
node bin/vre objective resume --objective OBJ-... --repair-snapshot
node bin/vre objective stop --objective OBJ-... --reason "completed"
node bin/vre objective doctor --objective OBJ-...
```

### Step 3. Lascia Che L'Agente Registri Paper Ed Esperimenti

Quando un agente AI legge paper o prepara un'analisi, quel lavoro non deve
restare solo in chat.

I contratti agent-facing stanno in `commands/`:

```text
/flow-literature --register
/flow-experiment --register
/flow-results --package EXP-001
/flow-writing --handoff
/flow-writing --advisor-pack 2026-04-30
/flow-writing --rebuttal-pack SUBMISSION-001
```

L'agente legge il contratto markdown, chiama l'helper in `environment/`, e VRE
scrive i file machine-owned. L'utente non dovrebbe digitare dettagli clericali
come liste DOI o campi manifesto se l'agente puo' estrarli da fonti e file.

### Step 4. Esegui Analisi Solo Attraverso Un Percorso Manifestato

VRE non sostituisce Scanpy, Seurat, DESeq2, R, Python o notebook. Pero'
richiede che il lavoro analitico sia registrato e bounded.

L'attuale superficie `run-analysis` supporta un template locale Node revisionato
da un analysis manifest schema-valido:

```bash
node bin/vre run-analysis --manifest path/to/analysis-manifest.json
```

Dry run:

```bash
node bin/vre run-analysis --manifest path/to/analysis-manifest.json --dry-run
```

Il manifesto deve dichiarare input, output, artifact attesi, template comando,
budget e safety flag. Nel template revisionato v1 la rete non e' consentita.

### Step 5. Esegui Un Research Loop Bounded

Quando esiste un obiettivo, VRE puo' eseguire una invocazione bounded del loop:

```bash
node bin/vre research-loop --objective OBJ-... --json --max-iterations 1
```

Resume mode:

```bash
node bin/vre research-loop --objective OBJ-... --json --resume
```

Heartbeat / wake mode:

```bash
node bin/vre research-loop --objective OBJ-... --json --heartbeat --wake-id wake-001
```

Il loop e' intenzionalmente bounded. Scrive queue record, eventi obiettivo,
snapshot, blocker, digest e stato di memory sync. Se l'evidenza e' ambigua o
insicura, blocca o fa escalation invece di continuare in silenzio.

### Step 6. Sincronizza La Memoria Prima Di Fermarti

Alla fine di una sessione di ricerca:

```bash
node bin/vre sync-memory
```

Questo aggiorna i mirror machine-owned sotto:

```text
.vibe-science-environment/memory/mirrors/
```

I mirror servono per resume e navigazione. Non sostituiscono la verita' del
kernel.

### Step 7. Costruisci Output Leggibili Da Umani

Quando esperimenti e claim sono pronti, usa le superfici di writing e digest:

```text
/flow-writing --handoff
/flow-writing --advisor-pack 2026-04-30
/flow-writing --rebuttal-pack SUBMISSION-001
/weekly-digest
/export-warning-digest
/stale-memory-reminder
```

Questi producono artifact revisionabili. Organizzano evidenza e questioni
aperte, ma non promuovono claim e non verificano citazioni da soli.

---

## Reference Dei Comandi

### Comandi CLI Diretti

Esegui i comandi diretti cosi':

```bash
node bin/vre <command>
```

| Comando | Scopo |
|---|---|
| `init` | Crea/controlla lo stato VRE e segnala lo stato del kernel bridge. |
| `flow-status` | Sommario operatore. |
| `orchestrator-status` | Stato di coda, lane, escalation, recovery, continuity e obiettivo. |
| `sync-memory` | Aggiorna i mirror di memoria da proiezioni consentite. |
| `capabilities --json` | Genera e persiste il capability handshake Phase 9. |
| `capabilities doctor` | Diagnostica la superficie capability. |
| `objective start` | Crea e attiva un nuovo obiettivo. |
| `objective status` | Ispeziona un obiettivo. |
| `objective pause` | Mette in pausa un obiettivo attivo con motivo. |
| `objective resume` | Riprende un obiettivo, con eventuale repair snapshot. |
| `objective stop` | Ferma un obiettivo con motivo. |
| `objective doctor` | Diagnostica stato obiettivo, scheduler e artifact di resume. |
| `run-analysis` | Esegue un analysis manifest revisionato tramite lane autorizzata. |
| `research-loop` | Esegue o riprende un loop bounded di obiettivo. |
| `scheduler install` | Installa una wake task Windows per un obiettivo. |
| `scheduler status` | Ispeziona lo stato scheduler di un obiettivo. |
| `scheduler doctor` | Diagnostica la configurazione scheduler. |
| `scheduler remove` | Rimuove il supporto scheduler per un obiettivo. |

### Opzioni Comuni

| Comando | Opzioni importanti |
|---|---|
| `objective start` | `--title`, `--question`, `--mode`, `--reasoning-mode rule-only`, `--budget`, `--wake-policy` per modalita' non interattive. |
| `objective status` | `--objective OBJ-...` |
| `objective pause` | `--objective OBJ-... --reason "..."` |
| `objective resume` | `--objective OBJ-...`, opzionale `--repair-snapshot` |
| `objective stop` | `--objective OBJ-... --reason "..."` |
| `run-analysis` | `--manifest path/to/manifest.json`, opzionale `--dry-run` |
| `research-loop` | `--objective OBJ-... --json`, opzionale `--resume`, `--heartbeat`, `--wake-id`, `--max-iterations`, `--max-wall-seconds`, `--mode` |
| `scheduler install/status/doctor/remove` | `--objective OBJ-...` |

`--budget` e `--wake-policy` possono essere liste inline `key=value`, JSON
inline, oppure path a file JSON.

### Contratti Agent-Driven

Questi sono contratti markdown per un agente AI, non necessariamente verbi
shell diretti:

| Contratto | Scopo |
|---|---|
| `/flow-literature` | Registra/lista/linka paper e mostra gap di letteratura. |
| `/flow-experiment` | Registra/aggiorna/lista esperimenti e mostra blocker. |
| `/flow-results` | Impacchetta output di esperimenti completati. |
| `/flow-writing` | Costruisce handoff, advisor pack, rebuttal pack ed export. |
| `/flow-status` | Contratto agent-facing per la stessa status surface. |
| `/sync-memory` | Contratto agent-facing per memory sync. |
| `/orchestrator-run` | Contratto per creare/continuare lavoro orchestrato. |
| `/orchestrator-status` | Contratto agent-facing per stato orchestrator. |
| `/automation-status` | Mostra readiness automazioni e ultimi artifact. |
| `/weekly-digest` | Crea un digest settimanale revisionabile. |
| `/export-warning-digest` | Riassume alert sugli export. |
| `/stale-memory-reminder` | Riassume stato stale dei mirror di memoria. |

### Task Kind

Il task registry dell'orchestrator include:

| Task kind | Lane | Scopo |
|---|---|---|
| `literature-flow-register` | execution | Registra un paper. |
| `experiment-flow-register` | execution | Registra un manifesto di esperimento. |
| `results-bundle-discover` | execution | Scopre bundle di risultati. |
| `writing-export-finalize` | execution | Finalizza un deliverable da export snapshot. |
| `session-digest-export` | execution | Esporta un sommario di sessione. |
| `memory-sync-refresh` | execution | Aggiorna mirror di memoria. |
| `session-digest-review` | review | Revisiona un digest tramite review lane. |

---

## Architettura

```text
Ricercatore umano
  |
  v
Agente AI (Claude Code, Codex, Gemini CLI)
  |
  | legge contratti comando e chiama helper
  v
Control plane VRE
  |
  | attempts, events, decisions, capabilities, session snapshots
  v
Runtime di ricerca VRE
  |
  | flows, objectives, orchestrator, queue, lanes, memory, automation
  v
.vibe-science-environment/ su disco

Kernel/plugin Vibe Science
  |
  | claims, citations, gates, R2/R3, governance events, SQLite truth
  v
.vibe-science/ e DB kernel
```

### Confine Tra I Due Repo

| Repository | Possiede | Non possiede |
|---|---|---|
| `vibe-science` | Verita' scientifica, hook plugin, claim, citazioni, gate, R2/R3, serendipity, DB SQLite, governance events. | Stato workflow e packaging risultati VRE. |
| `vibe-research-environment` | Stato operativo, objective runtime, flow helper, manifesti, result bundle, memory mirror, scheduler, queue/lane orchestration, connector, audit excerpt. | Verita' del kernel, autorita' di promozione claim, verita' citazionale, verita' dei gate. |

VRE legge la verita' del kernel tramite `environment/lib/kernel-bridge.js`. Non
scrive direttamente lo stato del kernel.

### Layer Principali

| Layer | Path principali |
|---|---|
| CLI dispatcher | `bin/vre` |
| Contratti comando | `commands/*.md` |
| Control plane | `environment/control/` |
| Flow di ricerca | `environment/flows/` |
| Obiettivi | `environment/objectives/` |
| Orchestrator | `environment/orchestrator/` |
| Memoria | `environment/memory/` |
| Automazione | `environment/automation/` |
| Connector | `environment/connectors/` |
| Domain pack | `environment/domain-packs/` |
| Helper audit | `environment/audit/query.js` |
| Schemi | `environment/schemas/` |
| Test | `environment/tests/` |
| Stato runtime | `.vibe-science-environment/` |

---

## Modello Di Sicurezza

VRE e' opinionated perche' l'automazione di ricerca senza disciplina e'
pericolosa.

### 1. No Silent Zero

Un database kernel mancante non significa "zero claim" o "nessun blocker". Gli
envelope del kernel bridge portano metadati `dbAvailable`, `sourceMode` e
degraded reason. Se il bridge e' degradato, VRE deve dirlo.

### 2. Stato Su File

Attempt, decisioni, eventi, manifesti, bundle, queue record, lane run, handoff,
digest e memory mirror vivono su disco. La chat non e' la fonte di verita'.

### 3. Manifesto Prima Dell'Analisi

Esperimenti ed esecuzioni autorizzate devono essere descritti prima
dell'esecuzione. L'attuale `run-analysis` e' stretto di proposito: manifest
schema-valido, template comando revisionato, path sicuri, runtime bounded e
niente accesso rete.

### 4. R2 Prima Della Promozione Claim

La promozione dei claim appartiene al kernel Vibe Science e ai suoi gate di
review. VRE puo' preparare evidenza e instradare lavoro di review, ma non
promuove claim scientifici in silenzio.

### 5. Append-Only E Fail-Closed Dove Conta

Eventi di governance e ledger sono progettati per essere ispezionabili. Molti
percorsi di scrittura falliscono su schema invalido, metadati mancanti,
duplicati in conflitto, path non sicuri o template non supportati.

### 6. Automazione Revisionabile

Digest schedulati e reminder creano artifact revisionabili. Non sostituiscono
la disciplina ledger per patch, non decidono gate e non mutano la verita'
scientifica.

---

## Dettagli Tecnici

### Directory Di Stato Locale

VRE scrive stato machine-owned sotto:

```text
.vibe-science-environment/
  automation/
  claims/
  control/
  experiments/
  flows/
  memory/
  objectives/
  orchestrator/
  results/
  writing/
```

Non modificare questi file a mano, salvo task di manutenzione specifici. Usa
helper e contratti comando.

### Variabili D'Ambiente

| Variabile | Scopo |
|---|---|
| `VRE_KERNEL_PATH` | Path esplicito a `vibe-science`; sovrascrive auto-discovery sibling. |
| `VRE_VERBOSE=1` | Stampa diagnostica active/degraded del kernel bridge su stderr. |
| `VRE_BUDGET_MAX_USD` | Limite hard-stop di spesa gestito dal middleware. |
| `VRE_BUDGET_ESTIMATED_COST_USD` | Soglia advisory di costo. |
| `VRE_CLAUDE_CLI` | Override path Claude CLI. Su Windows spesso `claude.cmd`. |
| `VRE_CODEX_CLI` | Override path Codex CLI. Su Windows spesso `codex.cmd`. |
| `VRE_REVIEW_EVIDENCE_MODE` | Override test/review-lane evidence mode. |
| `VRE_EXTERNAL_WAKE_CALLER` | Identita' per wake call esterne di `research-loop`. |
| `VRE_HEARTBEAT_PROBE_ONLY=1` | Testa heartbeat probe senza eseguire il loop completo. |
| `VRE_HEARTBEAT_MIN_INTERVAL_MS` | Rate limit process-local per eventi heartbeat. |
| `VRE_RUN_ANALYSIS_TIMEOUT_MS` | Cap operatore per timeout di esecuzione analisi. |
| `VIBE_SCIENCE_DB_PATH` | Usato dai bridge CLI plugin-owned quando serve un DB esplicito. |
| `VIBE_SCIENCE_PLUGIN_ROOT` | Usato dai bridge CLI plugin-owned quando serve scoprire il plugin root. |
| `VIBE_SCIENCE_AUDIT_QUERY_CLI` | Override path audit-query CLI del plugin. |
| `ANTHROPIC_API_KEY` | Passato al Claude CLI executor quando serve. |
| `OPENAI_API_KEY` | Passato al Codex CLI executor quando serve. |
| `CLAUDE_CONFIG_DIR` | Passato al Claude CLI executor quando serve. |

### Validazione E Test

Comandi utili:

```bash
npm run validate
npm run test:phase9
npm test
npm run check
npm run build:surface-index
npm run check:phase9-ledger
```

La validazione corrente copre counts, workflow CI, regole ledger Phase 9,
surface index, write sandbox, no-personal-path e closeout honesty.

### Conteggi Di Superficie Correnti

Alla chiusura evidence-side Wave 5 v2.1, i validatori VRE si aspettano:

| Superficie | Conteggio |
|---|---:|
| Install bundle manifests | 11 |
| Schemi | 54 |
| Eval tasks | 25 |
| Eval metrics | 5 |
| Eval benchmarks | 5 |
| CI validators | 15 |

Questi conteggi sono enforced dai validatori del repo e vanno aggiornati solo
insieme al codice che cambia la superficie.

---

## Stato Corrente

Wave 5 v2.1 e' completa lato evidenza. Il trail implementativo seq `113-130`
e' landed, `R2 inline pending` e' zero, e seq `130` registra `R2 inline OK`.

Il flip operatore da `wave-5-implementation-allowed.status` a `completed` resta
separato di proposito. Wave 6 si sblocca formalmente dopo quell'azione
operatore. La regola operativa resta: Phase 10 non inizia prima che Phase 9 sia
terminata.

Per lo stato CI live, controlla GitHub Actions. Questo README descrive la
superficie del repository, non garantisce lo stato di ogni commit futuro.

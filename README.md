# Vibe Research Environment

Vibe Research Environment (VRE) is a **local, file-backed research operating
system** built around the Vibe Science kernel.

The short version is:

- the **kernel** owns scientific truth
- **VRE** owns workflow, packaging, memory mirrors, writing handoff, and
  orchestration
- everything important stays **inspectable on disk**
- the project is meant for **AI-assisted research work that must stay auditable**

This repository is not a chatbot wrapper and not a generic agent platform.
It is the outer shell that makes research work resumable, reviewable, and safe
to package without letting the shell redefine truth.

## Who This Is For

The first real user of this repo is:

- a researcher using AI to drive literature, experiment, and writing work
- an operator who needs the work to stay resumable and auditable
- a developer/research engineer working inside the repo, not a casual end-user

Today VRE is primarily a **local runtime plus command-contract layer** for an
agentic environment such as Codex/Claude-style repo work. It is not yet a
consumer-facing desktop app or polished standalone CLI product.

## What This Project Is

VRE is the layer you put **around** a scientific kernel when you want to do
real work with AI without turning the system into a black box.

It gives you:

- a control plane for operator sessions
- literature and experiment workflows
- memory mirrors and session digests
- result packaging and export-safe writing handoff
- connectors, automations, and domain packs
- a local orchestrator MVP with queue, continuity, execution, and review

It does **not** own:

- claim truth
- citation truth
- gate outcomes
- governance truth

Those remain kernel-owned.

## What Problem It Solves

Without a shell like this, research work done with AI tends to break in the
same ways:

- the operator loses track of what was done
- literature and experiments are hard to resume
- writing exports blur validated and speculative content
- important state lives only in chat
- "automation" becomes hidden work with poor auditability

VRE solves that by keeping the workflow explicit and machine-owned:

- session and attempt state are saved
- experiment and writing artifacts are packaged on disk
- memory mirrors are refreshed explicitly
- warnings, blockers, and degraded states stay visible
- orchestrated work goes through a queue instead of disappearing into prompt fog

## What You Can Do With It Today

As of the shipped Phase 5 baseline, the repo supports five real layers of
behavior:

1. **Control plane and core flows**
   Track session state, attempts, decisions, events, literature work, and
   experiment work.
2. **Memory and results packaging**
   Refresh memory mirrors, package experiment outputs, and export session
   digests.
3. **Writing handoff**
   Build frozen export snapshots, claim-backed writing seeds, advisor packs,
   rebuttal packs, and post-export warning surfaces.
4. **Operational extensions**
   Run connectors, automations, and domain-pack presets without changing
   kernel truth.
5. **Local orchestration**
   Route one objective into a visible queue, execute bounded work, run
   execution-backed review, assemble bounded continuity context, and expose
   run/status runtime surfaces.

## How You Use It In Practice Today

This is the part that usually gets lost: **you do not use VRE today as a web
app or a CLI product with a polished dispatcher**.

You use it in an agentic coding/research environment against the repo itself.
The command surfaces in [`commands/`](commands/) are command contracts that the
agent follows against the real runtime helpers under [`environment/`](environment/).

The practical workflow today is:

1. open the repo in an agentic environment
2. ask for status or resume through [`/flow-status`](commands/flow-status.md)
3. register literature through [`/flow-literature`](commands/flow-literature.md)
4. register and update experiments through [`/flow-experiment`](commands/flow-experiment.md)
5. package outputs through [`/flow-results`](commands/flow-results.md)
6. build writing handoff or packs through [`/flow-writing`](commands/flow-writing.md)
7. refresh memory mirrors through [`/sync-memory`](commands/sync-memory.md)
8. use the orchestrator runtime when you want one objective routed, queued,
   executed, and optionally reviewed

There is no dashboard-first workflow, and there is no hidden background worker
loop pretending to be "autonomy".

## First Successful Use

If someone lands on the repo and wants to understand one successful path, this
is the simplest honest story:

1. clone `vibe-research-environment`
2. keep a sibling checkout of `vibe-science` if you want the kernel-backed
   projections; without it, many surfaces still work but degrade honestly
3. run `npm install`
4. run `npm run check` to verify the repo is healthy
5. open the repo in an agentic environment
6. start from [`/flow-status`](commands/flow-status.md) to see the operator
   status surface
7. register one paper with [`/flow-literature`](commands/flow-literature.md)
   or one experiment with [`/flow-experiment`](commands/flow-experiment.md)
8. package a completed experiment with [`/flow-results`](commands/flow-results.md)
   or create a writing handoff with [`/flow-writing`](commands/flow-writing.md)
9. inspect what was written under [`.vibe-science-environment/`](.vibe-science-environment/)

If that path works, you have understood the core product: VRE is a shell that
turns research work into explicit state and inspectable artifacts.

## What The Orchestrator Actually Does

The Phase 5 orchestrator MVP is a **local coordinator**, not a vague
"agent framework".

Given one operator objective, it can:

- classify the request into a mode
- create a visible queue task
- choose the proper lane under lane policy
- execute bounded work
- run execution-backed review
- write escalation and recovery state when things go wrong
- assemble bounded continuity context for the lane
- report back a resumable status surface

The key runtime pieces live in:

- [`environment/orchestrator/router.js`](environment/orchestrator/router.js)
- [`environment/orchestrator/queue.js`](environment/orchestrator/queue.js)
- [`environment/orchestrator/ledgers.js`](environment/orchestrator/ledgers.js)
- [`environment/orchestrator/execution-lane.js`](environment/orchestrator/execution-lane.js)
- [`environment/orchestrator/review-lane.js`](environment/orchestrator/review-lane.js)
- [`environment/orchestrator/continuity-profile.js`](environment/orchestrator/continuity-profile.js)
- [`environment/orchestrator/context-assembly.js`](environment/orchestrator/context-assembly.js)
- [`environment/orchestrator/runtime.js`](environment/orchestrator/runtime.js)

What it **does not** do yet:

- runnable reporting lane
- runnable monitoring lane
- runnable recover lane beyond bounded recovery records
- dashboard UI
- hosted supervision
- automatic preference capture
- invisible background autonomy

## How One Request Flows

One request through the orchestrator looks like this:

1. the operator gives an objective
2. VRE middleware opens an attempt and captures telemetry
3. the router classifies the objective and writes a queue task
4. the selected lane runs under explicit lane policy
5. queue updates, lane runs, escalations, recovery, and external review are
   written to disk
6. status is rebuilt from those files, not guessed from memory

That is the central design choice of the whole project:

**important workflow state must survive the conversation and remain visible on
disk.**

## What Gets Written On Disk

The machine-owned workspace state lives under:

- [`.vibe-science-environment/`](.vibe-science-environment/)

Important examples:

- control-plane state under [`.vibe-science-environment/control/`](.vibe-science-environment/control/)
- flow state under [`.vibe-science-environment/flows/`](.vibe-science-environment/flows/)
- experiment manifests under [`.vibe-science-environment/experiments/`](.vibe-science-environment/experiments/)
- results bundles under [`.vibe-science-environment/results/`](.vibe-science-environment/results/)
- memory mirrors under [`.vibe-science-environment/memory/`](.vibe-science-environment/memory/)
- orchestrator state under [`.vibe-science-environment/orchestrator/`](.vibe-science-environment/orchestrator/)
- saved operator-validation evidence under [`.vibe-science-environment/operator-validation/`](.vibe-science-environment/operator-validation/)

If you want to know whether the repo is "doing something" after use, these are
the first places to inspect:

- [`.vibe-science-environment/control/session.json`](.vibe-science-environment/control/session.json)
- [`.vibe-science-environment/flows/`](.vibe-science-environment/flows/)
- [`.vibe-science-environment/experiments/`](.vibe-science-environment/experiments/)
- [`.vibe-science-environment/results/`](.vibe-science-environment/results/)
- [`.vibe-science-environment/orchestrator/`](.vibe-science-environment/orchestrator/)

The repo is intentionally built so that shell-owned artifacts remain
operational and observational. They are not allowed to silently become a second
truth path.

## What Is In The Codebase

The most important top-level folders are:

- [`environment/control/`](environment/control/)
  control plane, middleware, attempts, decisions, events, capabilities,
  snapshots
- [`environment/flows/`](environment/flows/)
  literature, experiment, results, writing, packs, digests
- [`environment/memory/`](environment/memory/)
  mirrors, freshness tracking, marks
- [`environment/connectors/`](environment/connectors/)
  connector substrate and exports
- [`environment/automation/`](environment/automation/)
  automation substrate and built-in plans
- [`environment/domain-packs/`](environment/domain-packs/)
  domain-specific presets
- [`environment/orchestrator/`](environment/orchestrator/)
  the Phase 5 local coordinator MVP
- [`environment/tests/`](environment/tests/)
  runtime, schema, eval, integration, and CI validator coverage
- [`blueprints/`](blueprints/)
  definitive spec, implementation plans, and closeout dossiers

## How To Validate The Repo

Requirements:

- Node `18+`
- sibling checkout of `vibe-science` during incubation, because some eval and
  compatibility paths read kernel-owned files from `../vibe-science`

Install:

```bash
npm install
```

Main checks:

```bash
npm run validate
npm test
npm run check
```

## How To Inspect Proof Instead Of Trusting Claims

If you want to see whether the repo really does what it says, start here:

- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [`environment/tests/evals/saved-artifacts.test.js`](environment/tests/evals/saved-artifacts.test.js)
- [`.vibe-science-environment/operator-validation/`](.vibe-science-environment/operator-validation/)

The benchmark and artifact surfaces live under:

- [`environment/evals/benchmarks/`](environment/evals/benchmarks/)
- [`environment/evals/tasks/`](environment/evals/tasks/)
- [`.vibe-science-environment/operator-validation/artifacts/`](.vibe-science-environment/operator-validation/artifacts/)
- [`.vibe-science-environment/operator-validation/benchmarks/`](.vibe-science-environment/operator-validation/benchmarks/)

The current saved evidence covers:

- Phase 1 shell baseline
- Phase 2 memory and results packaging
- Phase 3 writing/export handoff
- Phase 4 connectors, automation, and domain-pack evidence
- Phase 5 orchestrator MVP evidence

## What This Repo Is Not

This repo is not:

- a generic agent platform
- a SaaS dashboard
- an autonomous paper generator
- a hidden memory layer that invents continuity from chat
- a replacement for the Vibe Science kernel

It is a **workflow shell** for serious AI-assisted research where state,
packaging, review, and recovery have to stay inspectable.

## Entry Points

- [Definitive Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Implementation Plan](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [Surface Orchestrator Layer](blueprints/definitive-spec/surface-orchestrator/00-index.md)

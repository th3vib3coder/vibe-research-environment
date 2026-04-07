# Surface Orchestrator Layer — Provider and Runtime Strategy

---

## Purpose

Define how the orchestrator should connect to LLM providers without making
third-party auth tricks or API-first billing its foundation.

This document exists because provider policy is now part of architecture, not a
minor implementation detail.

---

## Design Goal

The orchestrator should be **monthly-plan-first** where providers offer a
sanctioned first-party CLI or app login, and **API-fallback-only** when that
is strictly necessary.

This means:
- prefer first-party local CLIs authenticated by the operator
- avoid third-party gateways as the primary auth path
- use APIs only for capabilities that cannot be reached through the official
  local path

---

## Two Separate Axes

This document needs two independent decisions to stay separate.

### 1. Billing Strategy

How we prefer to pay:
- `plan-included`
- `usage-based`
- `mixed`

Our default preference is:
- monthly-plan-first when a provider supports it sanely

### 2. Integration Strategy

How the orchestrator actually talks to a provider-facing runtime:
- `local-cli`
- `sdk`
- `api`
- `cloud-task`

Our default preference is:
- local-first when the lane does not need strong live supervision

These axes are related, but they are not the same thing.

---

## What This Changes

We took useful inspiration from OpenClaw-style systems for:
- adapters
- gateway thinking
- routing and session continuity

But we should **not** make OpenClaw-style credential reuse the foundation of
our orchestrator.

Reason:
- provider policy can change
- subscription reuse through third-party gateways is the highest-churn part of
  the design
- the providers now expose more direct first-party paths than before

So our orchestrator should borrow the **control-plane shape**, not the
**auth/backend dependence**.

---

## Official First-Party Paths We Can Rely On

### Anthropic

Official Anthropic docs already support Claude Code as a first-party terminal
surface.

Relevant sources:
- [Claude Code quickstart](https://docs.anthropic.com/en/docs/claude-code/quickstart)
- [Use Claude Code with your Pro or Max plan](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- [Use Claude Code with your Team or Enterprise plan](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)

Important current facts:
- Anthropic documents subscription-backed terminal access for Pro, Max, Team,
  and Enterprise plans
- their help center explicitly says that if `ANTHROPIC_API_KEY` is set, Claude
  Code will use the API key instead of the subscription, causing API billing
- their help center also documents how to stay strictly within the plan by
  declining API-credit fallback

Architectural implication:
- our Anthropic path should use **first-party Claude Code login directly**
- we should not require a third-party gateway to reuse Claude credentials

### OpenAI

Official OpenAI docs now document Codex as included in ChatGPT plans and
available through first-party clients.

Relevant sources:
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [Codex docs](https://developers.openai.com/codex/cloud)

Important current facts:
- Codex is included with ChatGPT Plus, Pro, Business, and Enterprise/Edu plans
- the help article documents signing in with ChatGPT in the CLI, IDE extension,
  web, and app
- OpenAI explicitly documents how to switch from API-key usage back to
  subscription-based access

Architectural implication:
- Codex can be a first-class orchestrator lane without forcing API billing
- the orchestrator should treat Codex local/app surfaces as official first-party
  runtime options

### Google

Google now documents Gemini CLI access tied to consumer subscriptions.

Relevant source:
- [Get higher Gemini CLI and Gemini Code Assist limits](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-cli-code-assist-higher-limits/)

Important current fact:
- Google states that AI Pro and Ultra subscribers get Gemini CLI and Gemini
  Code Assist with higher limits

Architectural implication:
- Gemini CLI is a credible optional monthly-plan path
- but because its CLI and policy surface are not yet as central to our current
  workflow as Claude Code or Codex, it should be an optional lane, not the
  required first implementation path

---

## Default Runtime Pattern

The first orchestrator implementation should be:
- local
- operator-attached
- local-first in transport choice
- first-party-authenticated

That means the orchestrator prefers provider runtimes that execute in the
user's own authenticated environment, and uses the least complex integration
that still satisfies the lane's supervision needs.

Examples:
- Claude Code lane using the operator's first-party Claude login
- Codex lane using the operator's ChatGPT-backed Codex login
- Gemini CLI lane using the operator's Google subscription login where present

This keeps:
- billing ownership clear
- auth flow first-party
- runtime behavior inspectable
- policy drift lower than a remote gateway design

This pattern is sufficient for:
- reporting
- some review tasks
- bounded fire-and-return executions

It is not sufficient for every supervision pattern by itself.

---

## Provider-Lane Contract

Phase 0 should freeze a contract roughly like this for each lane binding.

| Field | Meaning |
|------|---------|
| `providerRef` | `anthropic/claude-code`, `openai/codex`, `google/gemini-cli`, or future ref |
| `transportKind` | `local-cli`, `cloud-task`, or `api` |
| `integrationKind` | `local-cli`, `sdk`, `api`, or `cloud-task` |
| `authMode` | `subscription`, `enterprise-seat`, `api-key`, or `cloud-iam` |
| `billingMode` | `plan-included`, `usage-based`, or `mixed` |
| `supervisionCapability` | `fire-and-forget`, `output-only`, `streaming`, or `programmatic` |
| `interactive` | whether the lane is suited to local interactive turns |
| `backgroundSafe` | whether it is suitable for durable always-on execution |
| `parallelAllowed` | whether we allow parallel runs of that lane |
| `reviewOnly` | whether the lane is limited to review/challenge work |

This contract matters because provider choice is not just "which model." It is
also:
- billing behavior
- auth behavior
- locality
- integration controllability
- retry semantics
- background suitability

---

## Recommended Day-One Policy

### Primary Path

For the first orchestrator runtime:
- keep the coordinator itself local
- prefer `local-cli + subscription` or `local-cli + enterprise-seat`
- treat provider CLIs as execution or review lanes

### Default Lane Strategy

- coordination lane: local orchestrator logic plus whichever first-party CLI is
  best suited to planning and supervision
- execution lane: first-party CLI lane with the strongest repo-task ergonomics
- review lane: a second first-party CLI lane or a provider-diverse lane when
  useful
- reporting lane: whichever lane is cheapest and safest for summaries, as long
  as it preserves uncertainty labels

### Supervision Rule

If a lane needs live supervision, interruption, or structured mid-run control,
then `local-cli` alone is not enough.

For those lanes, the orchestrator should prefer:
- SDK-based integrations when available
- direct APIs when an SDK is not available
- local CLI only when `output-only` supervision is sufficient

In other words:
- monthly-plan-first is a **billing preference**
- programmatic supervision is an **integration requirement**

The second may override the first for specific lanes.

### Billing Rule

If the goal is to stay inside the monthly plan, the lane must not silently
switch to API mode.

Provider switches and billing mode changes must be visible on disk and visible
to the operator.

---

## When API Use Is Allowed

API use is acceptable only when at least one of these is true:

1. there is no sanctioned first-party local runtime for the needed capability
2. we need a durable always-on background host and the provider's local CLI is
   not appropriate for that role
3. an enterprise deployment needs service-account or cloud-IAM control
4. the feature is available only through the API or SDK
5. the operator explicitly opts into an API-backed lane

Even then:
- API-backed lanes should remain optional
- they should be tagged distinctly in lane policy
- they should not be the only way to run the orchestrator core

---

## Transport Suitability By Lane

| Lane type | Minimum useful capability | Preferred integration |
|-----------|---------------------------|-----------------------|
| Reporting | `fire-and-forget` | local CLI is fine |
| Review | `fire-and-forget` or `output-only` | local CLI is often fine |
| Execution (bounded) | `output-only` | local CLI can work |
| Execution (supervised) | `streaming` or `programmatic` | SDK or API preferred |
| Coordination with live steering | `programmatic` | SDK or API preferred |

This is the main guardrail that prevents us from confusing subprocess launching
with full supervision capability.

---

## What We Explicitly Avoid

1. A third-party gateway that is the required path for subscription-backed
   access
2. Treating consumer subscription sessions as if they were stable server-side
   service accounts
3. Hiding a switch from plan billing to API billing
4. Making remote always-on orchestration the first implementation
5. Encoding provider auth assumptions directly into VRE or kernel contracts

---

## Final Recommendation

The first orchestrator should be built as a **local control plane above VRE**
that launches **first-party provider CLIs** in the operator's authenticated
environment.

That gives us the best immediate combination of:
- low billing friction
- monthly-plan-first operation
- strong provider-policy defensibility
- local inspectability
- minimal architectural regret

APIs still matter later, but they should be a fallback lane type, not the
foundation of the first orchestrator runtime.

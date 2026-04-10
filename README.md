# Vibe Research Environment

**Quando fai ricerca con l'AI, il lavoro sparisce nella chat.**
Analisi perse, esperimenti non ripetibili, claim non verificabili, draft che
mescolano fatti e speculazioni. Nessuno sa cosa è stato fatto, con quali dati,
e cosa si può davvero affermare.

VRE risolve questo: tiene traccia di tutto il lavoro di ricerca su disco, in
modo ispezionabile, riprendibile e sicuro da impacchettare.

---

## Cosa fa in pratica

VRE è un **guscio operativo** che metti attorno alla tua ricerca quando lavori
con un agente AI (Claude Code, Codex, Gemini CLI, o qualsiasi altro). Il
guscio:

- **registra letteratura e esperimenti** con stato tracciabile
- **salva risultati e artefatti** in pacchetti strutturati su disco
- **gestisce la memoria** con mirror leggibili e sincronia esplicita
- **produce draft e pacchetti per advisor** separando fatti verificati da
  speculazioni
- **coordina il lavoro** con una coda visibile, lane di esecuzione e review,
  recovery onesti
- **non inventa niente**: non scrive verità scientifica, non cattura preferenze
  dalla chat, non fa lavoro nascosto

---

## A chi serve

- Ricercatori che usano AI per analisi dati (bioinformatica, scRNA-seq, omics,
  ma non solo)
- Chi ha bisogno che il lavoro fatto con l'agente resti **auditabile e
  riprendibile**, non perso nella cronologia chat
- Chi vuole preparare output per advisor, co-autori, o tesi senza mescolare
  risultati veri e allucinazioni

Non serve a chi vuole un chatbot generico o un dashboard punto-e-clicca.

---

## Dove gira

VRE è codice Node.js locale. Non è un servizio cloud.

Funziona su:
- **Claude Code** (il primo host, nativo)
- **Codex** (OpenAI) — il runtime è lo stesso, i command contract funzionano
- **Qualsiasi ambiente agentico** che può leggere file e chiamare moduli JS

Il cuore del sistema (`environment/`) non dipende da nessun provider specifico.
I comandi in `commands/` sono scritti come contratti che l'agente segue — non
sono una CLI con un dispatcher proprio.

---

## Come si usa oggi

1. Clona il repo
2. `npm install`
3. `npm run check` — verifica che tutto sia verde (331 test, 9 validator)
4. Tieni anche un checkout sibling di `vibe-science` se vuoi le proiezioni
   kernel-backed; senza, molte superfici degradano onestamente ma funzionano
   in modalità workspace-first
5. Apri il repo nel tuo ambiente agentico
6. Parti da `/flow-status` per vedere lo stato
7. Registra un paper con `/flow-literature` o un esperimento con
   `/flow-experiment`
8. Impacchetta i risultati con `/flow-results`
9. Prepara un handoff di scrittura con `/flow-writing`
10. Ispeziona cosa è stato scritto sotto `.vibe-science-environment/`

Per l'orchestratore:
- `/orchestrator-run` — lancia un obiettivo nella coda
- `/orchestrator-status` — vedi coda, lane, escalation, prossima azione

---

## Come aiuta nella ricerca data-driven

VRE non fa statistica, non fa QC, non fa modellazione. Non è un motore
scientifico. È il **sistema operativo attorno alla scienza**.

In un progetto come scRNA-seq, il valore è:

| Problema reale | Cosa fa VRE |
|---------------|-------------|
| "Quale analisi avevo fatto la settimana scorsa?" | Stato e tentativi salvati su disco |
| "Questo risultato da dove viene?" | Ogni output è linkato a esperimento e parametri |
| "Posso mandare questo draft all'advisor?" | Export-eligibility separa verificato da speculativo |
| "L'agente ha fatto tutto da solo senza dirmi niente" | Coda visibile, escalation esplicite, recovery onesti |
| "Ho perso il contesto dopo aver chiuso la chat" | Memory mirror + continuity profile riprendibili |
| "Il reviewer mi ha chiesto i dati grezzi" | Bundle manifests con artefatti impacchettati |

La formula giusta è:

**pipeline analitiche + kernel scientifico + VRE come guscio di coordinamento**

Non: VRE al posto della metodologia.

---

## Architettura (in breve)

```
┌──────────────────────────────────────────────────┐
│  Agente AI (Claude Code / Codex / Gemini CLI)    │
├──────────────────────────────────────────────────┤
│  Orchestratore locale (Phase 5 MVP)              │
│  coda · lane · review · recovery · continuity    │
├──────────────────────────────────────────────────┤
│  VRE — guscio operativo                          │
│  flow · packaging · memory · connectors · domain │
├──────────────────────────────────────────────────┤
│  Kernel Vibe Science (truth, claims, gates)       │
└──────────────────────────────────────────────────┘
```

- Il **kernel** possiede la verità scientifica (claim, citazioni, gate)
- **VRE** possiede il workflow (flussi, packaging, export, memoria)
- L'**orchestratore** coordina il lavoro (coda, lane, review, recovery)
- L'**agente** è l'interfaccia umana
- Nessun livello può riscrivere la verità del livello sotto

---

## Cosa c'è nel repo

| Directory | Cosa contiene |
|-----------|--------------|
| `environment/control/` | Control plane, middleware, sessioni, tentativi, decisioni |
| `environment/flows/` | Letteratura, esperimenti, risultati, writing, digest |
| `environment/memory/` | Mirror leggibili, freshness, marks |
| `environment/orchestrator/` | Coordinatore MVP Phase 5 |
| `environment/connectors/` | Export verso filesystem, Obsidian, etc. |
| `environment/automation/` | Automazioni reviewabili |
| `environment/domain-packs/` | Preset per domini (omics, etc.) |
| `environment/tests/` | 331 test: schema, runtime, integration, eval, CI |
| `commands/` | Contratti comando per l'agente |
| `blueprints/` | Spec, piani di implementazione, closeout |
| `.vibe-science-environment/` | Stato macchina su disco; durante lo sviluppo contiene sia runtime state sia evidence salvata e versionata |

---

## Come verificare che il repo funziona davvero

```bash
npm install
npm run check   # 331 test, 9 validator, tutto deve essere verde
```

Se vuoi vedere l'evidenza concreta:
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [Test di evidenza salvata](environment/tests/evals/saved-artifacts.test.js)
- [Artefatti operator-validation](.vibe-science-environment/operator-validation/)

---

## Cosa NON è

- Non è una piattaforma agente generica
- Non è un dashboard SaaS
- Non è un generatore automatico di paper
- Non è una memoria nascosta che inventa continuità dalla chat
- Non sostituisce il kernel scientifico
- Non sostituisce la tua metodologia

È un **guscio di lavoro** per ricerca seria con AI dove stato, packaging,
review e recovery devono restare ispezionabili.

---

## Entry point

- [Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Piano di implementazione](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [Orchestrator Spec](blueprints/definitive-spec/surface-orchestrator/00-index.md)

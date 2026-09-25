# ADR-008: Autonomous Pipeline Orchestration & Internal Scheduling

## Context & Problem Statement

Phase 3A implemented automated research discovery and Phase 3B implemented the Writer Agent, Static Validator, Independent QA Reviewer, Policy Engine, and Quality Gate. Phase 3C requires unifying these distinct components into a single autonomous, budget-aware execution pipeline that runs deterministically on Cloudflare Worker Cron without manual intervention or risky concurrency races, while strictly obeying the 7,500 Neurons/day hard budget ceiling.

## Decision Drivers

1. **Zero-Cost & Hard Budget Invariant**: Daily ContentCreator Neuron usage must NEVER exceed 7,500 Neurons/day. Customer-facing AI has priority over ContentCreator.
2. **Concurrency & Locking Safety**: Prevent race conditions between scheduled Cron runs and manual admin execution.
3. **No Facebook Publishing**: The system produces internally approved and scheduled posts (`SCHEDULED` status). No publication to Facebook occurs in Phase 3.
4. **Idempotency & Topic Cooldown**: Prevent duplicate post generation and preserve topic diversity over time.

## Considered Options

* **Option A**: Allow separate recursive calls between services (Writer → QA → Policy → Quota → Writer).
* **Option B**: Single central `ContentOrchestrator` coordinating all workflow steps, managing execution locks in D1, conducting pre-flight workflow budget checks, and scheduling approved drafts.

## Decision Outcome

Chosen Option: **Option B (ContentOrchestrator)**.

### Architectural Blueprint

```text
Cloudflare Cron / Manual Trigger
              ↓
  ContentOrchestrator.runPipeline()
              ↓
   [Concurrency Lock Check] (D1 orchestrator_runs)
              ↓
  [Daily Post Count Limit Check] (Default: 1 post/day)
              ↓
   [Topic Selection & Cooldown Filter]
              ↓
   [Pre-flight Workflow Budget Check] (QuotaManager: Writer + QA = ~3,000 Neurons)
              ├───── (Exceeded) ──→ DEFERRED_NO_FREE_AI_CAPACITY (ZERO AI Calls)
              ↓
      ContentPlannerService
              │  ├── Writer AI
              │  ├── Static Validation
              │  ├── Independent QA Fact-Checker AI
              │  ├── Policy Review
              │  ├── Quality Gate Evaluation
              │  └── Bounded Regeneration (Max 2 retries)
              ↓
       [PASS Verdict]
              ↓
  Internal Scheduling Engine (D1 schedules table: status='pending')
              ↓
      Post Status = 'scheduled'
```

### Consequences

* **Positive**:
  - Strict pre-flight budget reservation prevents multi-step workflows from stopping halfway.
  - Concurrency locks in D1 prevent simultaneous cron and manual executions.
  - Clear separation of responsibilities: individual services remain focused while `ContentOrchestrator` manages execution flow.
  - Full auditability via `orchestrator_runs` and `audit_log`.

* **Negative**:
  - Workflows defer when remaining daily budget is less than 3,000 Neurons even if a single quick inference might fit.

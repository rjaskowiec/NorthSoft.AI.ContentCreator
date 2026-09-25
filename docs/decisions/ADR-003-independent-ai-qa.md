# ADR-003: Independent AI QA Before Publication

**Status**: Accepted  
**Date**: 2026-09-25  
**Author**: rjaskowiec

## Context

The system autonomously generates content and publishes it to a real Facebook Page. AI-generated content carries risks: hallucinations, factual errors, policy violations, brand damage, and spam.

## Decision

Implement **mandatory independent AI quality assurance** as a prerequisite for any publication. The content generation and quality review must be logically independent — a single AI inference must never both generate and approve its own output.

### Pipeline Architecture
```
Research Agent → Writer → Static Validation → AI QA → Policy Review → Quality Gate → Scheduler → Facebook
```

### Independence Requirements
1. Writer and QA use separate AI completion calls
2. QA receives content without knowledge that it's AI-generated
3. Critical check failures permanently block publication
4. Maximum 3 regeneration attempts before permanent BLOCKED status
5. Quality Gate decision is deterministic code, not AI opinion

### Critical Blocking Checks
These checks always block, regardless of overall score:
- Factual accuracy
- Hallucination detection
- Policy risk
- Copyright/IP risk
- Spam detection

## Consequences

### Positive
- Multiple layers of defense against harmful content
- Audit trail for every quality decision
- Deterministic final gate prevents AI "self-approval"
- Permanent blocking prevents infinite retry loops
- Admin visibility into why content was blocked

### Costs
- Additional AI API calls per post (writer + QA + policy = 3+ calls)
- Increased latency in content pipeline
- More complex error handling and retry logic

### Trade-offs
- AI QA is not perfect — it can miss issues or flag false positives
- The deterministic Quality Gate provides the final safety boundary
- Admin review is available for blocked content

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Single AI generates + approves | Self-approval defeats QA purpose |
| Human-only review | Defeats autonomous pipeline purpose |
| No QA (publish directly) | Unacceptable risk for brand and compliance |
| Score-only threshold | Score alone can miss critical failures |

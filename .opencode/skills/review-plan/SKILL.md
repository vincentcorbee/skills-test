---
name: review-plan
description: Review an implementation plan against its product spec and technical design for traceability, executable task boundaries, risks, and verification. Use when called by create-plan or when the user asks to review a plan.
user-invocable: true
---

# Review Plan

## Inputs

- **plan_path** (string, required) -- implementation plan to review
- **design_path** (string, required) -- approved technical design
- **requirements_summary** (string, required) -- concise goal and constraints
- **work_type** (string, optional) -- `bug`, `task`, or `small`
- **max_review_rounds** (integer, optional, default: 3)

## Workflow

### Phase 1: Load Contracts

Read the plan, design, and linked product spec. Confirm the design status is `approved`. Treat the spec as product truth and design as solution truth; review does not reopen either.

### Phase 2: Bounded Review

Evaluate every item in the [review checklist](references/review-checklist.md) as pass or fail. Report only actionable findings:

- **Critical** -- unsafe, impossible, outside the approved contract, or missing a requirement such that implementation must not start
- **Major** -- likely implementation failure, unverifiable behavior, broken task dependency, or unmitigated design risk
- **Minor** -- useful improvement that does not block implementation

Before assigning Critical or Major severity, state what evidence would make the finding non-blocking. Return at most the three highest-severity findings per round.

### Phase 3: Outcome

- Return `approved` when no Critical or Major findings remain.
- Return `revision_required` with concrete corrections when blocking findings remain and the round limit has not been reached.
- Return `scope_escalation` when a correction would alter product scope or a technical decision. Name the owning artifact and decision required.
- Return `review_exhausted` when blocking findings remain after `max_review_rounds`; do not approve by attrition.

## Returns

- **review_status** (enum) -- `approved`, `revision_required`, `scope_escalation`, or `review_exhausted`
- **findings** (list) -- severity, plan location, violated contract, and concrete correction
- **review_summary** (string) -- rounds completed and final outcome

## Rules

- Do not invent requirements or implementation decisions.
- Do not require extra tasks when an existing task can absorb the correction.
- Prefer the fewest tasks that remain independently verifiable and fit one implementation context.
- Do not approve a plan whose design is not explicitly approved.

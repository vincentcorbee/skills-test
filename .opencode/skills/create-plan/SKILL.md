---
name: create-plan
description: Takes a design document, turns it into an implementable tasks Use when the user says "create a implementation plan" or when referenced by other skills.
user-invocable: true
---

## Inputs

From user or calling skill:

- **design_path** (string, required) -- path to design document.
- **max_review_rounds** (integer, optional, default: 3)
- **auto_approve_plan** (boolean, optional, default: false)

## Workflow

### Phase 1: Read design document

Read the design document at `design_path`. Extract approach, constraints, risks, and success criteria.

### Phase 2: Create plan

Expand the design into a structured implementation plan using the following steps:

**Define tasks**

Every plan must contain at least one task. Each task must be a narrow but complete vertical slice through every required technical layer, deliver independently verifiable user-visible or system behavior, and fit within one implementation-agent context. Do not create separate database, API, or UI tasks.

Use a horizontal task only when no vertical slice can land with the codebase working and tests passing. For a wide mechanical change, sequence expand, migration batches, and contract so intermediate tasks remain green. Explain the exception in the task structure rationale.

Prefer the fewest, largest tasks that satisfy these constraints. Tasks must form a DAG; order blockers before the tasks that depend on them.

For each task, identify:

- The vertical slice it delivers
- Its concrete test boundary
- Its dependencies
- Its key files
- Its implementation todos

Write one line explaining why the chosen task boundaries are appropriate.

**Write plan**

Use the [task plan template](references/plan-templates.md#task-plan).

Ensure the plan:

- Maps every design risk to the task or todo that mitigates it
- Covers every success criterion from the design document
- Does not repeat the design document's "Decisions and tradeoffs" section; the `Related` header links to that context

### Phase 3: Review

Use /review-plan with:

- **plan_path** -- the plan file
- **work_type** -- passed through
- **requirements_summary** -- one paragraph restating goal and constraints
- **design_path** -- optional context so reviewers can see design decisions and rejected alternatives
- **max_review_rounds** -- passed through

Handle scope escalation: if review-plan returns `scope_escalation`, present to user -- proceed with expanded scope or defer.

### Phase 4: Present to user

If `auto_approve_plan` is true, present summary but proceed immediately.
Else show final plan with review summary, wait for confirmation.

### Output
Save the plan to `docs/plans/YYYY-MM-DD-<topic>.md` using the [metadata header template](references/plan-templates.md#metadata-header).

### Phase 5: Handoff

**When invoked directly by the user:** Offer to implement. If yes, use /develop with `confirmed_plan` to handle the rest. When called by another skill return and let the caller orchestrate.

## Returns

- **confirmed_plan** (string) -- path to the confirmed plan file
- **review_summary** (string) -- summary of review rounds and outcome

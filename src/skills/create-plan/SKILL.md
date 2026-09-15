---
name: create-plan
description: Turn an approved technical design into executable implementation tasks and verification steps. Use when the user says "create an implementation plan" or when referenced by other skills.
user-invocable: true
---

## Inputs

From user or calling skill:

- **design_path** (string, required) -- path to design document.
- **tracker_ref** (string, optional) -- tracker reference to update; otherwise obtain it from the linked spec
- **work_type** (string, optional) -- `bug`, `task`, or `small`; must match the design when provided
- **max_review_rounds** (integer, optional, default: 3)
- **auto_approve_plan** (boolean, optional, default: false)

## Workflow

### Phase 1: Read design document

Read the design document at `design_path`. Require metadata status `approved`. Extract its work type, chosen approach, technical constraints, risks, success criteria, verification boundaries, delivery phases, repository prior art, linked product spec, and tracker reference. Treat the design as solution truth and its linked spec as product truth. Use the design's work type for review; if the optional input conflicts, stop and report the mismatch.

Read `docs/agents/domain.md` when present and preserve its vocabulary. Read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` before any publication or readiness operation.

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
- Relevant implementation and test prior art
- The product acceptance criteria and design criteria it verifies
- Its implementation todos

Write one line explaining why the chosen task boundaries are appropriate.

**Write plan**

Use the [task plan template](references/plan-templates.md#task-plan).

Save the active draft to `docs/plans/YYYY-MM-DD-<topic>.md` using the [metadata header template](references/plan-templates.md#metadata-header) so review has a stable `plan_path`.

Ensure the plan:

- Maps every design risk to the task or todo that mitigates it
- Covers every success criterion from the design document
- Traces product acceptance criteria through the design to an implementation task and verification step
- Does not repeat the design document's "Decisions and tradeoffs" section; the `Related` header links to that context
- Does not invent product behavior or reopen technical decisions; report gaps to the owning spec or design instead
- Points to analogous implementation and test patterns where they reduce ambiguity

### Phase 3: Review

Use /review-plan with:

- **plan_path** -- the plan file
- **work_type** -- from the design
- **requirements_summary** -- one paragraph restating goal and constraints
- **design_path** -- approved design and rejected alternatives
- **max_review_rounds** -- passed through

If review returns `revision_required`, apply only corrections consistent with the spec and design, then rerun review up to `max_review_rounds`. If it returns `scope_escalation`, present the owning artifact and decision to the user. If it returns `review_exhausted`, stop; do not approve or publish.

### Phase 4: Present to user

If `auto_approve_plan` is true, present summary but proceed immediately.
Else show final plan with review summary, wait for confirmation.

### Output
After approval, set plan metadata status to `approved`. Only an approved plan may proceed to publication and readiness.

### Phase 5: Publish And Mark Ready

After approval under phase 4, update the configured tracker item's managed delivery section with links or identifiers for the approved spec, design, and plan plus a concise delivery summary. Preserve all content outside that section. If no `tracker_ref` exists, publish the item using the linked spec and retain the returned reference. `auto_approve_plan: true` counts as explicit programmatic approval.

Store a newly created tracker reference in the approved plan metadata before returning.

Resolve readiness roles through `docs/agents/triage-labels.md`. If the tracker item has the mapped `wontfix` value, stop and ask the user to reopen it; do not silently override that decision. Otherwise remove any currently applied values mapped from `needs-triage`, `needs-info`, or `ready-for-human`, then apply the mapped `ready-for-agent` value using the exact operations in `docs/agents/issue-tracker.md`.

If either configuration file is absent or incomplete, preserve the approved local plan, return `needs_setup`, and direct the user to /setup-skills. Do not guess tracker operations or report readiness as applied.

### Phase 6: Handoff

**When invoked directly by the user:** Offer to implement. If yes, use /develop with `confirmed_plan` to handle the rest. When called by another skill return and let the caller orchestrate.

## Returns

- **confirmed_plan** (string) -- path to the confirmed plan file
- **tracker_ref** (string, optional) -- updated tracker URL, identifier, or local feature directory
- **readiness_applied** (boolean) -- whether the configured `ready-for-agent` value was successfully applied
- **needs_setup** (boolean, optional) -- publication requires /setup-skills; the local plan remains approved
- **review_summary** (string) -- summary of review rounds and outcome

---
name: spec
description: Discover or synthesize a product PRD with users, scope, user stories, requirements, and acceptance criteria, then publish it to the configured tracker. Use when the user asks to "spec", "write a PRD", or break an idea into user stories.
user-invocable: true
---

# Spec

## Inputs

- **idea** (string, required) -- the product idea or problem to specify
- **context** (string, optional) -- research, tickets, feedback, analytics, constraints, or existing documentation
- **mode** (enum, optional, default: `discovery`) -- `discovery` interviews to resolve product ambiguity; `synthesis` converts established conversation and context without interviewing
- **tracker_ref** (string, optional) -- existing tracker item to update rather than creating one
- **auto_approve_spec** (boolean, optional, default: false) -- treat the generated PRD as approved after presenting its summary
- **interactive** (enum, optional, default: `collaborative`) -- consultation mode:
  - `auto` -- ask only when ambiguity would materially change the product contract
  - `collaborative` -- confirm the problem and proposed scope before writing the PRD
  - `silent` -- suppress questions and document every assumption

## Workflow

### Phase 0: Context And Mode

Read `docs/agents/domain.md` when present, then read the configured domain context and glossary. Use established actors, product rules, and terminology throughout the PRD.

In `synthesis` mode:

- Treat the current conversation and provided `context` as the complete source material
- Do not interview or invoke /grilling
- Do not invent answers for gaps
- Record non-material gaps under open questions
- Return `needs_clarification` without writing a final PRD when a gap would materially change the product contract

`interactive` gates apply only in `discovery` mode.

### Phase 1: Product Discovery

Define:

- Target users and their relevant context
- The user problem and current alternatives
- Desired user and business outcomes
- Product, policy, dependency, and ownership constraints
- Observable product success measures

Use provided `context` before gathering more. In `discovery` mode, use /grilling to resolve vague actors, outcomes, and scope. In `synthesis` mode, extract only what the source material supports. Do not select an implementation approach.

Use inverse prompting from the [deliberation protocol](../deliberation/SKILL.md#inverse-prompting) to expose ways the idea may be misunderstood.

**Interactive gate (`discovery` + `collaborative` only):** Present the problem, users, outcomes, assumptions, and constraints; wait for confirmation.

### Phase 2: Scope And Behavior

Define the minimum coherent product scope:

- In-scope capabilities and user-visible behavior
- The user-facing solution narrative
- Explicit non-goals
- Primary user journeys, including failure and recovery paths
- Business rules, permissions, and externally observable edge cases
- Dependencies and unresolved product questions

Do not add architecture, files, APIs, schemas, libraries, or implementation tasks. Capture externally required integrations as product constraints, not technical designs.

**Interactive gate (`discovery` + `collaborative` only):** Present the proposed scope and journeys; wait for confirmation.

### Phase 3: User Stories And Requirements

Write user stories only after scope is stable. Each story must:

- Name a specific actor, need, and outcome
- Represent an independently valuable behavior where possible
- Include testable acceptance criteria
- Cover relevant authorization, error, empty, and recovery behavior
- Link to a product success measure or state why it is foundational

Use `As a <user>, I want <capability>, so that <outcome>` when it improves clarity; do not force that syntax for system or policy requirements. Separate cross-cutting product requirements from user stories.

Check that every in-scope capability is covered by at least one story or requirement and that nothing out of scope appears in them.

### Phase 4: PRD Output

Save the PRD to `docs/specs/YYYY-MM-DD-<topic>.md` using the [PRD template](references/prd.md).

The local PRD is source truth. Do not create a tracker-only specification that can diverge from it.

Present the complete PRD for final approval. If `auto_approve_spec` is true, present a summary and proceed; otherwise wait for confirmation. Final approval is not product discovery and remains required in `synthesis` mode. After approval, set its metadata status to `approved`; do not publish an `active`, rejected, or unresolved PRD.

### Phase 5: Publish

Read `docs/agents/issue-tracker.md` and publish the approved PRD using its exact operations. Create a tracker item unless `tracker_ref` identifies one to update. When updating, preserve all content outside the configured managed delivery section. The published item must link or identify `spec_path` and contain the latest approved product summary.

If tracker configuration is absent or incomplete, preserve the local PRD and return `needs_setup` directing the user to /setup-skills. Never guess commands, repository targets, or labels.

Store the resulting reference in the PRD metadata and return it as `tracker_ref`. Do not apply `ready-for-agent`; design and planning are still incomplete.

## Returns

- **spec_path** (string) -- saved PRD path
- **tracker_ref** (string, optional) -- published tracker URL, identifier, or local feature directory
- **spec_summary** (string) -- brief downstream summary of users, scope, and outcomes
- **needs_clarification** (list, optional) -- product decisions required before a defensible PRD can be produced
- **needs_setup** (boolean, optional) -- tracker publication requires /setup-skills; the local PRD remains valid

## Rules

- **Own product truth.** Define who needs what behavior and why, not how the system implements it.
- **Do not validate ideas by default.** Reject unsupported scope or assumptions and state what evidence would make them acceptable.
- **Keep stories outcome-oriented.** Do not disguise technical tasks as user stories.
- **Make acceptance criteria externally observable.** Leave internal design and test implementation to downstream skills.
- **Do not invent priority.** Ask or record priority as unresolved when sequencing affects scope.
- **Stop on material ambiguity.** Return `needs_clarification` when different answers would produce different product contracts.
- **Publish without declaring readiness.** Only /create-plan may mark the tracker item `ready-for-agent`.

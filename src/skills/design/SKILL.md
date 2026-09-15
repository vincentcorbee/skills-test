---
name: design
description: Turn an approved product spec or concrete technical problem into a technical design by comparing approaches and stress-testing tradeoffs. Use when the user says "design" or "design a solution for X".
user-invocable: true
---

# Design

## Inputs

- **goal** (string, required) -- what needs to be designed
- **spec_path** (string, optional) -- approved PRD produced by /spec; expected for product features
- **context** (string, optional) -- technical context such as incidents, verification evidence, constraints, or pre-gathered codebase exploration
- **work_type** (string, optional) -- `bug`, `task`, or `small` (affects depth)
- **max_iterations** (integer, optional, default: 2) -- maximum propose-critique-reframe cycles in disputatio before surfacing unresolved ambiguity.
- **auto_approve_design** (boolean, optional, default: false)
- **interactive** (enum, optional, default: `collaborative`) -- consultation mode:
  - `auto` -- only conditional clarification gates fire.
  - `collaborative` -- mandatory user confirmation after phases 1, 2b, 3, and 4a. Do not skip even if path seems obvious.
  - `silent` -- suppress all gates including conditional ones. Document every assumption. Use only when no human interlocutor is reachable.

## Workflow

### Phase 1: Input Validation And Technical Context

**1a. Validate the product contract.**
If `spec_path` is provided, read it first and require metadata status `approved`. Extract scope, non-goals, user-visible behavior, acceptance criteria, constraints, and open questions. Do not rewrite or expand them.

For a product feature without a spec, determine whether the goal already provides an unambiguous product contract. If actors, scope, behavior, or acceptance criteria could materially change the design, stop and return `needs_specification` with concrete missing decisions. Recommend /spec rather than performing product discovery inside this skill.

For bugs and `small` technical changes, a concise problem statement may replace a PRD when expected behavior and success criteria are explicit.

**1b. Define the technical problem and constraints.**
Restate the technical goal. Surface system, performance, security, compatibility, dependency, migration, operability, and ownership constraints.

Use inverse prompting from the [deliberation protocol](../deliberation/SKILL.md#inverse-prompting).

**1c. Define technical success criteria.**
Translate the product contract into technical qualities and verification boundaries without changing product acceptance criteria. If technical success cannot be defined, return `needs_clarification`.

**1d. Gather implementation context.**
- Use provided `context` first and explore only technical gaps.
- Explore the codebase via subagents to identify relevant components, conventions, and constraints.
- Read `docs/agents/domain.md` when present, then read the relevant domain context and ADRs it identifies.
- Find analogous implementations and tests. Distinguish established conventions from proposed changes.

**Scope check:** If exploration reveals unmentioned areas, ask before expanding scope.

**Output:** Validated product contract, technical problem statement, assumptions, constraints, and technical success criteria.

**Interactive gate (`collaborative` only):** Present the technical framing and any product-spec gaps; wait for confirmation before phase 2.

### Phase 2: Risk Identification

Identify **3-5 pre-mortem risks** before selecting an approach: failure modes, regressions, false assumptions.

**`small` work type:** Identify 1-2 risks.

**Output:** Pre-mortem risks to be addressed by the chosen approach.

### Phase 2b: Verification Seams

Identify where each product acceptance criterion and technical success criterion can be verified through externally observable behavior.

- Prefer the highest practical seam that gives reliable feedback
- Prefer existing seams over introducing new ones
- Minimize the number of seams; justify every new seam
- Identify relevant test prior art in the repository

Do not prescribe individual test cases yet. Select verification boundaries that constrain approach selection.

**Interactive gate (`collaborative` only):** Present the proposed seams with the risk framing and confirm they match expectations before selecting an approach.

### Phase 3: Approach Selection
Use self-consistency sampling from the [deliberation protocol](../deliberation/SKILL.md#self-consistency-sampling).

Outline **2-3 alternatives**. For each:

- Strategy summary
- Key tradeoffs (complexity, risk, scope, maintainability)
- How it addresses or exposes the pre-mortem risks
- How it supports the selected verification seams

Select the strongest approach with brief justification. Specify consequential API, schema, interface, state-transition, and component-interaction contracts. For independently shippable milestones, use delivery phases with clear intermediate states; each phase must produce a working system and feed into its own plan/implement cycle.

**`small` work type:** Skip comparison. State the single obvious approach as the chosen approach.

**Interactive gate (`collaborative` only):** Present proposal before phase 4. Ask whether to adjust direction or add concerns for disputatio.

### Phase 4: Disputatio

Stress-test the chosen approach.

**4a. Videtur quod** ("It seems that...")
List objections with real arguments: failure modes, scaling issues, stronger alternatives, hidden costs.

**Interactive gate (`collaborative` only):** Before generating agent objections, ask what objections or concerns to include. Merge them with agent objections.

**4b. Sed contra** ("On the contrary...")
Present counter-arguments to the strongest objections.

**4c. Respondeo** ("I answer that...")
Resolve the disputation:
- **Defend** the approach by addressing the objections
- **Revise** the approach to incorporate valid objections
- **Reject** the approach if objections are fatal

**4d. Ad objectiones** ("To the objections...")
Answer every objection: concede, refute, or absorb into the design.

**Re-evaluation:** Check whether the critique changed the problem framing or invalidated phase 1 assumptions.
- If problem framing changed and iteration count <= `max_iterations`: return to phase 3 with revised framing. Carry forward what was learned.
- If iteration count > `max_iterations`: surface unresolved ambiguity. Do not force a decision.

**`small` work type:** Skip this phase entirely.

**Output:** Evaluated approach with all objections addressed or absorbed.

### Phase 5: Design Document Output

Save the design document to `docs/designs/YYYY-MM-DD-<topic>.md`.
Use the [design document template](references/design-document.md).

Present the final design after disputatio, including any revisions made after the phase 3 proposal. If `auto_approve_design` is true, present a summary and proceed; otherwise wait for confirmation. After approval, set its metadata status to `approved`; do not return an `active`, rejected, or unresolved design as solution truth.

## Returns

- **design_path** (string) -- saved design document path
- **design_summary** (string) -- brief downstream summary
- **needs_clarification** (list, optional) -- concrete questions that must be answered before a defensible design can be produced
- **needs_specification** (list, optional) -- missing product decisions that should be resolved by /spec

## Rules

- **Do not validate ideas by default.** Stress-test, not confirm.
- **Prefer rejecting bad ideas over refining them.** A rejected proposal forces a better one.
- **Every rejection must include an acceptance condition.** State concretely what would need to be true for an approach to pass.
- **Be concrete and technical.** Name files, functions, patterns, tradeoffs.
- **Ground decisions in the repository.** Record relevant ADRs, conventions, analogous implementations, and test prior art.
- **Prefer stable contracts over volatile detail.** Include code snippets only when a prototype encodes a decision more precisely than prose; trim them to the decision-bearing fragment.
- **Do not own product truth.** Reference the PRD for users, scope, stories, behavior, and acceptance criteria; never silently change it.
- **Escalate contract conflicts.** If technical discovery conflicts with the PRD, stop and request a spec decision rather than resolving it in the design.
- **No fake dialogue in agent mode.** Without a human interlocutor, use inverse prompting and self-consistency sampling instead of simulated Q&A.
- **Ask on ambiguity, not on schedule.** In `auto` mode, clarifying questions are conditional. Only stop when genuinely ambiguous.

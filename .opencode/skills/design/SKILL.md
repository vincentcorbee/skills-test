---
name: design
description: Produce a design document by clarifying the goal, owning context gathering, comparing approaches, and stress-testing tradeoffs. Use when the user says "design" or "design a solution for X".
user-invocable: true
---

# Design

## Inputs

- **goal** (string, required) -- what needs to be designed
- **context** (string, optional) -- source context such as ticket details, comments, verification evidence, docs, user-provided constraints, or pre-gathered codebase exploration. If provided, phase 1 uses it first and explores only scope gaps.
- **work_type** (string, optional) -- `bug`, `feature`, or `small` (affects depth)
- **max_iterations** (integer, optional, default: 2) -- maximum propose-critique-reframe cycles in disputatio before surfacing unresolved ambiguity.
- **interactive** (enum, optional, default: `collaborative`) -- consultation mode:
  - `auto` -- only conditional clarification gates fire.
  - `collaborative` -- mandatory user confirmation after phases 1, 3, and 4a. Do not skip even if path seems obvious.
  - `silent` -- suppress all gates including conditional ones. Document every assumption. Use only when no human interlocutor is reachable.

## Workflow

### Phase 1: Problem Clarification

**1a. Define the goal precisely.**
Restate the goal. Ask about vague scope, actors, constraints, or outcomes. Use /grilling to clarify the goal. If it cannot be stated concretely, it is not ready for design.

**1b. Expose assumptions and constraints.**
State assumptions and confirm they hold. Surface time, scope, technical, dependency, and ownership constraints.

Use inverse prompting from the [deliberation protocol](../deliberation/SKILL.md#inverse-prompting).

**1c. Define success criteria.**
Define measurable or observable "done" criteria. If success cannot be defined, say the goal is not ready for design.

**1d. Context gathering.**
- Use provided `context` first. Treat ticket details, comments, verification evidence, docs, and user constraints as source context for the design.
- If implementation/codebase context is needed, explore the codebase via subagents.

**Scope check:** If exploration reveals unmentioned areas, ask before expanding scope.

**Output:** Clear problem statement with explicit assumptions, constraints, and success criteria.

**Interactive gate (`collaborative` only):** Present the problem statement, assumptions, and success criteria; wait for confirmation before phase 2.

### Phase 2: Risk Identification

Identify **3-5 pre-mortem risks** before selecting an approach: failure modes, regressions, false assumptions.

**`small` work type:** Identify 1-2 risks.

**Output:** Pre-mortem risks to be addressed by the chosen approach.

### Phase 3: Approach Selection
Use self-consistency sampling from the [deliberation protocol](../deliberation/SKILL.md#self-consistency-sampling).

Outline **2-3 alternatives**. For each:

- Strategy summary
- Key tradeoffs (complexity, risk, scope, maintainability)
- How it addresses or exposes the pre-mortem risks

Select the strongest approach with brief justification. For independently shippable milestones, use delivery phases with clear intermediate states; each phase must produce a working system and feed into its own plan/implement cycle.

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

## Returns

- **design_path** (string) -- saved design document path
- **design_summary** (string) -- brief downstream summary
- **needs_clarification** (list, optional) -- concrete questions that must be answered before a defensible design can be produced

## Rules

- **Do not validate ideas by default.** Stress-test, not confirm.
- **Prefer rejecting bad ideas over refining them.** A rejected proposal forces a better one.
- **Every rejection must include an acceptance condition.** State concretely what would need to be true for an approach to pass.
- **Be concrete and technical.** Name files, functions, patterns, tradeoffs.
- **No fake dialogue in agent mode.** Without a human interlocutor, use inverse prompting and self-consistency sampling instead of simulated Q&A.
- **Ask on ambiguity, not on schedule.** In `auto` mode, clarifying questions are conditional. Only stop when genuinely ambiguous.

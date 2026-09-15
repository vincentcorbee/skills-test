---
name: deliberation
description: Reasoning protocol reference — inverse prompting, self-consistency sampling, review framing. Do NOT invoke directly, only when called by other skills.
user-invocable: false
---

# Deliberation Protocol

## Techniques

### Inverse Prompting

Articulate failure modes, constraints, or counter-evidence *before* producing the answer.

**Example — failure classification (verify-change step 5):**

> Before classifying this test failure, state what evidence would make it:
> - **implementation_failure**: the changed code likely broke expected behavior
> - **stale_check**: the intended behavior changed, so the check expectation likely needs updating
> - **environment_failure**: the failure depends on missing services, dependencies, network, or local machine state
> - **pre_existing_failure**: the same failure occurs outside the current change

### Self-Consistency Sampling

Generate multiple candidates and select the best. The selection step forces explicit comparison of tradeoffs.

**Example — approach selection (design phase 3):**

> Outline 2-3 alternative approaches:
> 1. Extend the existing hook with an optional parameter — low risk, but increases complexity of an already complex hook
> 2. Create a new dedicated hook — clean separation, but duplicates some shared logic
> 3. Extract shared logic into a base hook, compose both — cleanest, but largest scope
>
> Select approach 2: clean separation outweighs the minor duplication, and the scope stays manageable.

### Review Framing

Use bounded framings with natural stopping points instead of open-ended review.

| Framing | What you get |
|---------|-------------|
| "Review this critically" | Maximum criticism, always finds problems (unbounded) |
| "What's the biggest risk?" | One focused concern (bounded) |
| "Rate confidence 1-10" | A committed position with proportional caveats (bounded) |
| "Does this cover X, Y, Z?" | A checklist with clear pass/fail (bounded) |
| "Steelman this, then identify gaps" | Balanced evaluation (bounded) |

Prefer bounded framings. Combine with inverse prompting to prevent over-correction.

**Example — checklist-based plan review (create-plan phase 3):**

> Evaluate these checklist items as yes/no:
> 1. Does every requirement have a corresponding plan step?
> 2. Are all affected files identified?
> 3. Are error states addressed?
>
> After the checklist, flag any additional Critical issues found outside the checklist.
> Before marking anything Critical, state what evidence would make it NOT critical.

## When to Skip

Deliberate when the decision could cause a wrong-path implementation, a wasted review cycle, or a bad deploy recommendation.

Skip when the decision is reversible in under 30 seconds and affects no other files (e.g., file naming, import ordering, formatting, running a command).

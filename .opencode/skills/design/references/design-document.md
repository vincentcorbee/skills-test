# Design Document

Save design documents to `docs/designs/YYYY-MM-DD-<topic>.md`.

## Metadata Header

```markdown
# <Topic>

**Date:** YYYY-MM-DD
**Type:** design
**Status:** active
**Work type:** bug | task | small
**Tracker:** [tracker reference from spec, if it exists]
**Related:** [link to spec] | [link to plan, if it exists]
```

## Required Sections

- **Product contract** -- link to the PRD and summarize only the scope and acceptance criteria relevant to this design; for bugs or small technical work without a PRD, include the explicit expected behavior
- **Technical problem + constraints**
- **Technical success criteria and verification boundaries**
- **Repository context and prior art** -- relevant domain docs, ADRs, conventions, analogous implementations, and tests
- **Testing strategy and seams** -- selected behavioral seams, existing seams reused, new seams with justification, and criteria covered
- **Chosen approach + rationale**
- **Technical contracts** -- consequential APIs, schemas, interfaces, state transitions, and component interactions
- **Decisions and tradeoffs** -- approaches considered and rejected, with reasons (empty for `small`)
- **Residual risks** -- risks that survived disputatio. For `small`, carried directly from phase 2 pre-mortem.
- **Delivery phases** (when applicable) -- for independently shippable milestones, list each phase with what it delivers, the intermediate system state, and dependencies on prior phases. Each phase maps to its own plan/implement/PR cycle.

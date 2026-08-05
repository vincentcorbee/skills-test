# Design Document

Save design documents to `docs/designs/YYYY-MM-DD-<topic>.md`.

## Metadata Header

```markdown
# <Topic>

**Date:** YYYY-MM-DD
**Type:** design
**Status:** active
**Related:** [link to plan, if it exists]
```

## Required Sections

- **Problem statement + constraints**
- **Success criteria**
- **Chosen approach + rationale**
- **Decisions and tradeoffs** -- approaches considered and rejected, with reasons (empty for `small`)
- **Residual risks** -- risks that survived disputatio. For `small`, carried directly from phase 2 pre-mortem.
- **Delivery phases** (when applicable) -- for independently shippable milestones, list each phase with what it delivers, the intermediate system state, and dependencies on prior phases. Each phase maps to its own plan/implement/PR cycle.

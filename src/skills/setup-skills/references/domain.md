# Domain Documentation

## Layout

**Mode:** single-context

- Domain context and glossary: `CONTEXT.md`
- Architecture decision records: `docs/adr/`

For a multi-context repository, replace these entries with `CONTEXT-MAP.md` and the context-specific paths it indexes.

## Consumer Rules

- /spec uses domain vocabulary, actors, product rules, and established terminology. It does not infer technical requirements from ADRs.
- /design reads the relevant context and ADRs before selecting an approach, and records which decisions constrained the design.
- /create-plan uses the same vocabulary and points tasks to relevant prior art without reopening product or design decisions.
- When documentation conflicts with current approved requirements, surface the conflict to the owning skill instead of silently choosing one source.

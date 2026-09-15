# Issue Tracker: Custom

Setup must replace every angle-bracket placeholder. Do not save this document while placeholders remain.

**Target:** `<explicit tracker project or workspace>`

## Exact Operations

- **Publish:** `<safe command or tool operation>`
- **Read current content:** `<safe command or tool operation>`
- **Update managed content:** `<safe command or tool operation, or N/A when append-only>`
- **Append-only update:** `<safe command or tool operation, or N/A when managed updates are supported>`
- **Add readiness value:** `<safe command or tool operation>`
- **Remove readiness value:** `<safe command or tool operation>`

## Publication Contract

- Local files under `docs/specs/`, `docs/designs/`, and `docs/plans/` remain source truth.
- The tracker item stores a reference to each local artifact and the latest approved summaries.
- Updates preserve content outside a managed delivery section. When managed sections are unsupported, the configured append-only operation publishes a new delivery comment without replacing existing content.
- Multiline artifact content is passed without shell interpolation.
- The operation returns a stable `tracker_ref`.
- /spec publishes without readiness. /create-plan applies readiness only after review and approval.

# Issue Tracker: Local Markdown

Published delivery artifacts live under `.scratch/<feature-slug>/`.

## Layout

- Tracker summary: `.scratch/<feature-slug>/issue.md`
- Published spec snapshot: `.scratch/<feature-slug>/spec.md`
- Published design link: `.scratch/<feature-slug>/design.md`
- Published plan link: `.scratch/<feature-slug>/plan.md`
- Readiness state: a `Status:` line near the top of `issue.md`

## Publication Contract

- Local files under `docs/specs/`, `docs/designs/`, and `docs/plans/` remain source truth.
- Tracker files summarize or link source artifacts; do not create a second independently edited specification.
- Use the feature directory as `tracker_ref` in related artifacts.
- /create-plan sets `Status:` to the configured `ready-for-agent` value only after plan approval.

## Exact Operations

### Spec Publication

1. Create `.scratch/<feature-slug>/` when absent.
2. Write `.scratch/<feature-slug>/spec.md` from the template below, replacing an existing file only because the whole file is workflow-managed.
3. Create `issue.md` from its template when absent. When it exists, update only the Spec line and product summary inside the managed section; preserve existing Design and Plan lines, status, and all content outside the section.

```markdown
# <Feature>

Status: <current tracker value or unlabelled>

<!-- delivery-workflow:start -->
## Delivery

- Spec: `<spec_path>`
- Design: pending
- Plan: pending

<approved product summary>
<!-- delivery-workflow:end -->
```

```markdown
# Spec Publication

Source: `<spec_path>`

<approved product summary>
```

### Plan Publication

1. Write `design.md` with `Source: <design_path>` and a concise design summary.
2. Write `plan.md` with `Source: <confirmed_plan>` and a concise delivery summary.
3. Replace only the managed section in `issue.md` so all three source paths are current.
4. Replace the `Status:` value with the configured `ready-for-agent` tracker value after approval.

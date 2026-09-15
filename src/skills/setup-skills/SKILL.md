---
name: setup-skills
description: Configure a repository for the spec, design, and create-plan workflow by defining its issue tracker, readiness labels, and domain documentation. Use before first use or when changing those conventions.
user-invocable: true
---

# Setup Skills

Configure the repository conventions consumed by /spec, /design, and /create-plan. Explore first, present findings, confirm choices, then edit.

## Workflow

### Phase 1: Explore

Inspect without assuming:

- Git remotes and repository host
- Existing `AGENTS.md` and `CLAUDE.md`, including any `## Agent skills` section
- Existing `docs/agents/`, `CONTEXT.md`, `CONTEXT-MAP.md`, and ADR directories
- Existing issue-tracker conventions such as `.scratch/`
- Monorepo signals and package-level domain documentation

### Phase 2: Choose Issue Tracker

Recommend the tracker implied by existing repository configuration. If none exists, recommend local Markdown.

Supported choices:

- **GitHub** -- use `gh` and [the GitHub template](references/issue-tracker-github.md)
- **GitLab** -- use `glab` and [the GitLab template](references/issue-tracker-gitlab.md)
- **Local Markdown** -- use `.scratch/` and [the local template](references/issue-tracker-local.md)
- **Other** -- start from [the custom tracker template](references/issue-tracker-custom.md), ask for every required operation, and replace every placeholder

Ask one question only when repository evidence does not settle the choice or the user may want a different tracker. For hosted trackers, record and confirm one explicit repository or project target; never rely on ambiguous remote inference at publication time.

### Phase 3: Configure Readiness Vocabulary

Recommend the canonical labels from [the triage-label template](references/triage-labels.md). Ask whether existing tracker labels require different strings.

The `ready-for-agent` role is required because /create-plan applies it only after spec, design, plan, and review are complete. Configure the mapping even when no separate triage skill is installed.

### Phase 4: Configure Domain Documentation

Default to a single context with root `CONTEXT.md` and `docs/adr/`. Offer a multi-context layout only when exploration finds a substantial monorepo. Use [the domain template](references/domain.md).

### Phase 5: Confirm And Write

Before editing, present drafts of:

- The `## Agent skills` block from [the agent-instructions template](references/agent-instructions.md)
- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`

Update `CLAUDE.md` if it exists; otherwise update `AGENTS.md`. If neither exists, ask which one to create. Update an existing `## Agent skills` section in place and preserve surrounding content.

## Returns

- **issue_tracker_path** (string) -- `docs/agents/issue-tracker.md`
- **triage_labels_path** (string) -- `docs/agents/triage-labels.md`
- **domain_path** (string) -- `docs/agents/domain.md`

## Rules

- Do not guess tracker commands or label strings.
- Do not create both `AGENTS.md` and `CLAUDE.md`.
- Keep operational detail in `docs/agents/`; keep only short pointers in agent instructions.
- Re-running updates existing configuration without discarding user edits.

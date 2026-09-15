# Issue Tracker: GitHub

Issues and published delivery artifacts live in GitHub Issues.

**Repository:** `<owner>/<repo>`

Setup must replace this placeholder with a confirmed target. Pass `--repo <owner>/<repo>` to every command.

## Operations

- **Publish:** `gh issue create --repo <owner>/<repo> --title "..." --body-file <prepared-file>`
- **Read body:** `gh issue view <number> --repo <owner>/<repo> --json body --jq .body`
- **Update body:** `gh issue edit <number> --repo <owner>/<repo> --body-file <prepared-file>`
- **Comment:** `gh issue comment <number> --repo <owner>/<repo> --body-file <prepared-file>`
- **Add readiness label:** `gh issue edit <number> --repo <owner>/<repo> --add-label "<configured-label>"`
- **Remove readiness label:** `gh issue edit <number> --repo <owner>/<repo> --remove-label "<configured-label>"`

Use safe multiline input rather than shell-interpolating artifact content.

## Publication Contract

- Local files under `docs/specs/`, `docs/designs/`, and `docs/plans/` remain source truth.
- Publishing creates one delivery issue with a managed section delimited by `<!-- delivery-workflow:start -->` and `<!-- delivery-workflow:end -->`.
- Updating first reads the body, replaces only that managed section, or appends it when absent. Preserve all other content.
- Store the issue URL or number as `tracker_ref` in related artifacts.
- Never apply readiness during /spec or /design. /create-plan applies it only after plan approval.

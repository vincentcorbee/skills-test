# Issue Tracker: GitLab

Issues and published delivery artifacts live in GitLab Issues.

**Project:** `<host>/<group>/<project>`

Setup must replace this placeholder with a confirmed target. Pass `--repo <host>/<group>/<project>` to every command.

## Operations

- **Publish:** `glab issue create --repo <host>/<group>/<project> --title "..." --description "<prepared-content>"`
- **Read:** `glab issue view <number> --repo <host>/<group>/<project> --output json`
- **Update:** `glab issue update <number> --repo <host>/<group>/<project> --description "<prepared-content>"`
- **Comment:** `glab issue note <number> --repo <host>/<group>/<project> --message "<prepared-content>"`
- **Add readiness label:** `glab issue update <number> --repo <host>/<group>/<project> --label "<configured-label>"`
- **Remove readiness label:** `glab issue update <number> --repo <host>/<group>/<project> --unlabel "<configured-label>"`

Use safe multiline input rather than shell-interpolating artifact content.

## Publication Contract

- Local files under `docs/specs/`, `docs/designs/`, and `docs/plans/` remain source truth.
- Publishing creates one delivery issue with a managed section delimited by `<!-- delivery-workflow:start -->` and `<!-- delivery-workflow:end -->`.
- Updating first reads the description, replaces only that managed section, or appends it when absent. Preserve all other content.
- Store the issue URL or number as `tracker_ref` in related artifacts.
- Never apply readiness during /spec or /design. /create-plan applies it only after plan approval.

# Readiness Labels

Map workflow roles to the exact strings used by the configured tracker.

| Workflow role | Tracker value | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer evaluation required |
| `needs-info` | `needs-info` | Product or technical information required |
| `ready-for-agent` | `ready-for-agent` | Spec, design, plan, and review are complete |
| `ready-for-human` | `ready-for-human` | Implementation requires human ownership |
| `wontfix` | `wontfix` | Work will not be actioned |

Skills refer to workflow roles. Use the corresponding tracker value and never assume they are identical.

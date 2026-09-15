# Plan Review Checklist

Evaluate each item as pass or fail.

1. Every in-scope product acceptance criterion maps to a task and verification step.
2. Every technical success criterion and selected test seam is covered.
3. Every residual design risk has an explicit mitigation or verification step.
4. Tasks form an acyclic dependency graph and blockers precede dependents.
5. Each task is an independently verifiable vertical slice unless a justified horizontal migration is unavoidable.
6. Key files and relevant implementation and test prior art make each task executable without rediscovery.
7. Intermediate states keep the codebase working and checks passing.
8. The plan neither invents product behavior nor contradicts the chosen technical approach.
9. Error, authorization, migration, compatibility, and operational behavior from the source artifacts is covered where relevant.
10. The plan is concise enough to fit implementation-agent contexts without omitting necessary decisions.

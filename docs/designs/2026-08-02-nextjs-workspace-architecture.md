# Next.js Workspace Architecture

**Date:** 2026-08-02
**Type:** design
**Status:** active
**Related:** [Earlier repository architecture exploration](./2026-08-01-nextjs-repository-architecture.md)

## Problem Statement + Constraints

Choose between a flat Next.js repository and a pnpm workspace for one product containing:

- a Next.js App Router application organized internally with Feature-Sliced Design (FSD);
- a generic UI library with no application or business logic;
- an independently built and deployed Storybook;
- developer AI tooling containing canonical skills and agents, initially installed for OpenCode;
- a command-line configuration package that fetches external JSON and generates environment files, Zod schemas, TypeScript types, and application configuration.

Everything is initially used only by this product. No package needs independent publication or versioning. The repository nevertheless requires package-manager-enforced organizational boundaries rather than folder conventions alone.

The following constraints apply:

- `apps/web/app/` is the Next.js router; `apps/web/src/` contains the FSD layers.
- Steiger enforces FSD dependency rules inside the web application.
- Storybook builds and deploys independently from the web application and configuration generator.
- Workspace packages are private and use pnpm workspace dependencies.
- Start with pnpm workspaces and filtered scripts; do not introduce Turborepo initially.
- Generated configuration artifacts and installed AI-tool outputs are gitignored.
- Canonical skills and agents are committed under `packages/ai-tooling`.
- `pnpm setup` performs only setup required to run the product. AI-tool installation remains opt-in through `pnpm setup:skills`.
- Configuration can only be obtained from an external API or Docker-based provider. There is no offline fixture or checked-in fallback for local development.
- Configuration has the same shape in every environment, although values differ.
- Generated server environment output may contain secrets. Generated TypeScript application configuration must not contain secrets.
- Local environment overrides are development-only, allowlisted, and validated after merging.
- Initial deployment uses an environment-specific build. Cross-environment artifact promotion remains a future decision.
- GitLab CI is the intended CI/CD system, but its detailed pipeline is not part of the initial repository setup.

Three likely misunderstandings are explicitly ruled out:

- A workspace package does not imply that it must be published or independently versioned. Evidence: all packages start as `private: true`.
- A UI package does not require a compiled `dist/` directory. Evidence: Next.js and Storybook can compile its source while package exports still enforce its public API.
- Gitignored installed skills do not imply unversioned canonical content. Evidence: canonical agents and skills are committed in `packages/ai-tooling`; only OpenCode-specific installed output is ignored.

## Success Criteria

- A fresh checkout can run `pnpm setup` and then start the web application after external-provider authentication is available.
- Missing, stale, invalid, or structurally inconsistent generated configuration fails with actionable diagnostics.
- Web and Storybook have independent development, check, build, and deployment commands.
- Storybook builds without fetching application configuration.
- Consumers import UI components only through declared `@repo/ui` exports.
- React is supplied by consuming applications and is not duplicated by the UI package.
- Steiger rejects invalid FSD dependency direction inside `apps/web/src`.
- Setup tooling is absent from the Next.js runtime dependency graph.
- `pnpm setup:skills` installs only package-owned OpenCode files and never overwrites developer-owned AI configuration.
- No generated configuration, installed AI output, or secret value is committed, logged, cached, uploaded as a CI artifact, or exposed to a browser bundle.
- The repository can add another config-consuming application through another declarative generator recipe and root setup command without changing the generator implementation.

## Chosen Approach + Rationale

Use a selective pnpm workspace. Deployable applications live under `apps/`; modules with enforced dependency or executable boundaries live under `packages/`.

```text
.
|-- apps/
|   |-- web/
|   |   |-- app/                       # Next.js routes and layouts
|   |   |-- src/                       # FSD layers
|   |   |-- config/
|   |   |   `-- generator.json         # Committed generation recipe
|   |   |-- .generated/                # Ignored non-secret code artifacts
|   |   |-- .env.generated             # Ignored server environment output
|   |   `-- package.json
|   `-- storybook/
|       |-- .storybook/
|       `-- package.json
|-- packages/
|   |-- ui/
|   |   |-- src/
|   |   `-- package.json
|   |-- ai-tooling/
|   |   |-- skills/                    # Canonical, committed definitions
|   |   |-- agents/                    # Canonical, committed definitions
|   |   |-- src/installers/opencode/
|   |   `-- package.json
|   `-- config/
|       |-- src/
|       |   |-- providers/
|       |   |-- generators/
|       |   `-- cli.ts
|       `-- package.json
|-- package.json
|-- pnpm-workspace.yaml
`-- tsconfig.base.json
```

The workspace has four evidence-backed boundaries:

- `apps/web` is the runtime product and owns its configuration recipe and generated outputs.
- `apps/storybook` is an independent deployable consumer of the UI package.
- `packages/ui` has two consumers and needs a framework-light public API.
- `packages/config` and `packages/ai-tooling` are executable setup tools with dependencies that must not leak into the web runtime.

This is not a package-per-folder design. Application features, entities, widgets, and shared application code remain FSD slices inside `apps/web/src`.

### Dependency Direction

The allowed workspace graph is:

```text
apps/web       -> packages/ui
apps/storybook -> packages/ui
root scripts   -> packages/config
root scripts   -> packages/ai-tooling
```

The web application consumes generated artifacts but does not import `packages/config` or `packages/ai-tooling` at runtime. Packages cannot import from applications. Internal dependencies use `workspace:*`.

### Next.js and FSD

`apps/web/app/` contains thin route modules, layouts, metadata, and framework entry points. Business behavior remains in `apps/web/src/` and follows FSD dependency direction enforced by Steiger.

Generic components belong in `packages/ui`. Application-specific wrappers and compositions belong in the relevant FSD layer, for example:

```text
apps/web/src/shared/ui/       # Shared app-specific compositions
apps/web/src/entities/*/ui/   # Entity-aware UI
apps/web/src/features/*/ui/   # Feature UI
```

### UI and Storybook

`packages/ui` contains generic React components without business rules, Next.js dependencies, generated application configuration, or application aliases. React and React DOM are peer dependencies supplied by the web and Storybook applications.

Consumers import the package API, never source internals:

```ts
import { Button } from "@repo/ui";
```

The package export map points to TypeScript source. Next.js lists `@repo/ui` in `transpilePackages`; Storybook's builder compiles the same source. The UI package runs lint, type checks, unit tests, and story checks, but does not emit `dist/` initially.

Stories remain next to components in `packages/ui/src`. `apps/storybook` owns builder configuration, addons, preview decorators, static output, and deployment. Its build must not invoke config generation.

### Configuration Generation

`packages/config` is a private command-only package. It does not expose a programmatic TypeScript API and is not a web dependency. Its CLI owns fetching, bootstrap validation, classification, generation, redacted diagnostics, and atomic output replacement.

Each consumer owns a declarative recipe. For the web application this is `apps/web/config/generator.json`. It contains non-sensitive operational metadata such as output locations and override policy, not fetched values or credentials. Output paths are validated and constrained to approved workspace locations.

The generation lifecycle is:

1. Select and authenticate an external API or Docker provider.
2. Fetch a versioned JSON envelope without logging or persistently caching values.
3. Validate the envelope before trusting source-defined configuration.
4. Classify server environment values and non-secret application configuration.
5. Generate into a temporary directory.
6. Validate the complete generated result and cross-environment shape contract.
7. Atomically replace the consumer's ignored output files.

Secret values may appear only in server environment handling. They must never enter generated TypeScript modules, `NEXT_PUBLIC_*` variables, Next.js `env` configuration, logs, Storybook, or shared caches. Browser-visible values require an explicit non-secret allowlist.

Developer-owned `.env.local` values may override only allowlisted settings in development. The final merged environment is validated. Production builds reject local overrides.

There is no offline fallback. Missing output is a hard failure with an instruction to run setup. Generation is explicit rather than automatic on every development-server start:

```text
pnpm setup
pnpm setup:config:web
```

`pnpm setup` is the required aggregate bootstrap command and includes `setup:config:web`. If another consumer is added, it owns another recipe and receives a corresponding script such as `setup:config:worker`.

### AI Tooling

`packages/ai-tooling` owns canonical, committed developer AI skills and agents plus target installers. It does not own model clients, product AI behavior, inference, or application prompts.

OpenCode is the first target. Installation is explicit and optional:

```text
pnpm setup:skills
```

The installer writes only to a namespaced subtree under `.opencode`, records an ignored ownership manifest, and refuses to overwrite files it does not own. Gitignore rules target only generated package-owned paths, not a developer's complete `.opencode` configuration.

Do not create a generalized adapter framework until a second target has concrete requirements. Additional skills and agents fit the existing package; runtime product AI belongs elsewhere.

### Root Scripts

Representative root commands are:

```json
{
  "scripts": {
    "setup": "pnpm setup:config:web",
    "setup:config:web": "pnpm --filter @repo/config generate --config ../../apps/web/config/generator.json",
    "setup:skills": "pnpm --filter @repo/ai-tooling install:opencode",
    "dev:web": "pnpm --filter @repo/web dev",
    "dev:storybook": "pnpm --filter @repo/storybook dev",
    "build:web": "pnpm setup:config:web && pnpm --filter @repo/web build",
    "build:storybook": "pnpm --filter @repo/storybook build",
    "check": "pnpm -r --if-present check"
  }
}
```

Exact command syntax can change during implementation. The required properties are explicit per-consumer generation, optional AI installation, independent Storybook operation, and no implicit network fetch on every web-server restart.

### GitLab CI Direction

GitLab CI is added after workspace setup, but the repository design reserves independent jobs for UI checks, Storybook build/deployment, config-package fixture tests, AI-tool validation, and the web build.

The web build job runs `setup:config:web` for its target environment immediately before `next build`. It must disable shell tracing, redact values, exclude generated outputs from caches and artifacts, and clean temporary secret material. Docker-based builds must use temporary stages or BuildKit secrets so generated environment files do not persist in unrelated image layers.

The initial model produces an environment-specific web artifact. A later deployment design must decide whether server secrets move to container-startup injection to support promotion of one immutable artifact across environments.

## Decisions and Tradeoffs

### Flat Repository

A flat package minimizes manifests, workspace configuration, peer-dependency management, and filtered scripts. It is rejected because folder conventions do not satisfy the required hard boundaries. It would mix setup-tool dependencies into the web package and make Storybook and UI ownership less explicit.

Acceptance condition: use a flat repository if package-manager-enforced boundaries are no longer required and lint rules alone are accepted for UI, tooling, and Storybook isolation.

### Workspace with Compiled Packages

Compiling internal packages to `dist/` provides distributable artifacts and models external consumption. It also adds build ordering, declaration generation, watch coordination, stale output, and CI orchestration.

It is rejected initially because all consumers can compile TypeScript source and no package is published.

Acceptance condition: add package builds when a package is published, gains a consumer that cannot compile its source, needs compatibility testing against distributed output, or measured build performance justifies it.

### Selective Source-Consumed Workspace

The selected approach incurs extra package manifests, peer-dependency declarations, export maps, and workspace-aware tooling. That cost is accepted because the boundaries correspond to independent deployables, multiple consumers, or executable setup tools.

Source consumption avoids unnecessary build orchestration while export maps, workspace dependency declarations, lint rules, and Steiger enforce architectural APIs and dependency direction.

### Task Orchestration

Turborepo could add task graphs and remote caching. It is rejected initially because the workspace is small and secret-bearing generation makes cache policy sensitive.

Acceptance condition: introduce an orchestrator after measured CI duration or task coordination becomes a material problem and secret-bearing tasks are explicitly excluded from shared caching.

### Broad `ai` Package

`packages/ai` would leave room for future responsibilities but risks becoming a catch-all for runtime clients, experiments, product prompts, agents, and developer configuration. `packages/ai-tooling` accurately includes skills and agents while excluding application AI behavior.

Acceptance condition: rename or split the package when a second concrete responsibility does not fit developer tooling. Prefer focused packages such as `ai-runtime` or `ai-evaluation` over broadening the existing boundary without evidence.

## Residual Risks

- The external configuration protocol, authentication, source revision, rate limits, and Docker/API provider behavior remain unspecified and need a separate design before implementation.
- Environment-specific builds can retain secrets in Next.js output or container layers if the implementation violates the classification and cleanup rules. Production deployment needs security verification.
- Identical Git commits may produce different artifacts when the external source changes. The generator should record a non-secret immutable source revision and digest for traceability.
- No offline configuration source means external outages block fresh local setup and builds. This is an accepted constraint, not something the repository layout can solve.
- Gitignored generated types can be stale. The generator must emit and validate source revision metadata, and build commands must regenerate rather than trust existing output.
- pnpm export maps do not prevent arbitrary relative filesystem imports by themselves. Lint rules must reject imports that cross workspace package directories.
- Next.js and Storybook can process CSS, React directives, and package exports differently. Both production builds remain required verification targets.
- A future second AI-tool target may expose incompatible agent or skill capabilities. Do not claim vendor neutrality until that target is designed and tested.
- The initial environment-specific build may conflict with a later requirement to promote one immutable artifact. Keep server secrets out of generated TypeScript to preserve a migration path to runtime injection.

## Delivery Phases

### Phase 1: Workspace Skeleton

Create the pnpm workspace, private package manifests, root scripts, shared TypeScript and lint policy, package export rules, and the `apps/web`, `apps/storybook`, `packages/ui`, `packages/config`, and `packages/ai-tooling` boundaries.

Intermediate state: web and Storybook start through independent root commands, and forbidden cross-package imports fail checks.

### Phase 2: UI, Storybook, and FSD

Configure source transpilation for `@repo/ui`, React peer dependencies, co-located story discovery, Storybook static builds, and Steiger enforcement for the web FSD layers.

Intermediate state: web and Storybook consume the same UI public API, and both build independently.

Depends on Phase 1.

### Phase 3: Configuration Lifecycle

Implement `apps/web/config/generator.json`, provider interfaces, bootstrap validation, classification, atomic generation, redaction, allowlisted local overrides, stale-output detection, and `setup:config:web`.

Intermediate state: authenticated developers can run `pnpm setup` and start the web application; missing or invalid external configuration fails closed.

Depends on Phase 1. Real provider integration depends on a separate external-protocol design.

### Phase 4: AI Tooling

Add canonical skill and agent definitions, OpenCode installation, ownership manifests, namespaced ignored output, validation, and `setup:skills`.

Intermediate state: developers can opt into reproducible project AI tooling without modifying unowned OpenCode files.

Depends on Phase 1 and can be delivered independently of Phases 2 and 3.

### Phase 5: GitLab CI/CD

Add independent checks and builds, Storybook deployment, environment-specific web generation and build, secret-safe cache/artifact rules, and generated-output cleanup. Verify built web and container artifacts for secret leakage.

Intermediate state: Storybook and web deploy independently, configuration failures stop web builds, and generated secrets are absent from GitLab artifacts and unintended Docker layers.

Depends on Phases 2 and 3. The production deployment model requires a separate security and runtime-configuration decision.

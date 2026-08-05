# Next.js Repository Architecture

**Date:** 2026-08-01
**Type:** design
**Status:** active
**Related:** None

## Problem Statement + Constraints

Choose a repository structure for one Next.js product with:

- a Next.js App Router application organized internally with Feature-Sliced Design (FSD);
- a UI library whose stories are co-located with its components;
- an independently built and deployed Storybook;
- an agentic engineering platform with agents, skills, plugins, and adapters for tools such as Claude, Codex, and OpenCode;
- a generator that obtains JSON configuration from an external application and emits environment files, Zod schemas, and TypeScript configuration artifacts.

The decision is between one flat package and a pnpm workspace. No library needs to be published outside this repository in the next 12 months. Internal modules should nevertheless be independently testable and reasonably easy to extract later.

The following constraints apply:

- `apps/web/app/` is the Next.js App Router. `apps/web/src/` contains the FSD layers.
- Storybook is a separate deployment target, regardless of whether Chromatic is selected.
- Generated artifacts are reproducible and never committed.
- Production builds fetch current configuration and fail closed if the external source is unavailable or invalid.
- The config source transport, authentication mechanism, and versioning contract are not yet decided.
- The UI library may eventually need to work without Next.js, so framework coupling must be explicit.
- Agent and skill definitions should remain vendor-neutral; tool-specific filesystem layouts and metadata belong in adapters.
- First-party plugins need discovery and installation, but a third-party marketplace is not currently required.
- Packages remain private and use workspace versions until an external consumer exists.

Repository shape and distribution model are separate decisions. A separately deployed Storybook does not itself require package publishing, and possible future reuse does not justify packaging every folder now.

## Success Criteria

- A single root command prepares valid local configuration and starts Next.js development.
- The app, UI library, Storybook, AI platform, and config package have independently runnable checks where useful.
- Storybook builds and deploys without building or starting Next.js.
- Stories remain next to the UI components they document.
- Package exports and lint rules prevent deep imports and app-to-package dependency inversion.
- FSD import direction is enforceable within the web application.
- Next-specific UI adapters do not leak into the portable UI entry point.
- The same agent or skill plugin can be validated and installed through multiple tool adapters without changing its canonical definition.
- Invalid or unavailable production configuration stops the build with actionable diagnostics.
- Secret values are not committed, logged, emitted into static TypeScript modules, or exposed to browser bundles.
- A package can be published later without redesigning its public API, while no release/versioning machinery is required today.

## Chosen Approach + Rationale

Use a selective pnpm workspace. Model deployable applications under `apps/` and independently executable or consumed modules under `packages/`. The AI platform is a package because adapters, plugin loading, validation, installation, and its CLI form an independently testable executable contract.

```text
.
|-- apps/
|   |-- web/
|   |   |-- app/                 # Next.js routes and layouts
|   |   |-- src/                 # FSD layers
|   |   |   |-- app/
|   |   |   |-- pages/
|   |   |   |-- widgets/
|   |   |   |-- features/
|   |   |   |-- entities/
|   |   |   `-- shared/
|   |   |-- .generated/          # Gitignored generated code and source metadata
|   |   |-- next.config.ts
|   |   `-- package.json
|   `-- storybook/
|       |-- .storybook/
|       `-- package.json
|-- packages/
|   |-- ui/
|   |   |-- src/
|   |   |   |-- button.tsx
|   |   |   |-- button.stories.tsx
|   |   |   `-- index.ts
|   |   `-- package.json
|   |-- config/
|   |   |-- src/
|   |   |   |-- adapters/
|   |   |   |-- cli.ts
|   |   |   `-- source-schema.ts
|   |   `-- package.json
|   `-- ai/
|       |-- src/
|       |   |-- agents/
|       |   |-- skills/
|       |   |-- plugins/
|       |   |-- adapters/
|       |   |-- registry/
|       |   `-- cli/
|       |-- plugins/             # First-party plugin content
|       `-- package.json
|-- package.json
|-- pnpm-workspace.yaml
`-- tsconfig.base.json
```

This is intentionally not a package-per-folder monorepo. The UI library is a package because it has two consumers, Next.js and Storybook, and needs an explicit public surface. The config package owns an independently executable configuration lifecycle with isolated dependencies and tests. The AI platform is a package because it defines executable adapters, a CLI, plugin contracts, discovery, validation, and a credible future installation path outside this repository.

### Workspace Rules

- Every workspace package is `private: true` initially.
- Internal dependencies use `workspace:*`.
- Consumers import only declared package exports, such as `@repo/ui`, never `@repo/ui/src/button`.
- `packages/*` cannot import from `apps/*`.
- Avoid a generic `packages/shared`. Add a package only for a demonstrated consumer or executable boundary.
- Start with pnpm filtered scripts. Introduce Turborepo or another task orchestrator only when measured CI time makes remote caching valuable.
- Keep dependency versions aligned through pnpm catalogs or root policy rather than duplicating unconstrained versions.

### Next.js and FSD

`apps/web/app/` contains thin route modules, layouts, metadata, and framework entry points. Route modules compose exports from `apps/web/src/`; business behavior does not accumulate in route files.

`apps/web/src/app/` is the FSD application layer and is distinct from the root Next.js `app/` router. The similar names are intentional but should be documented because they represent different concepts.

FSD dependencies flow downward:

```text
app -> pages -> widgets -> features -> entities -> shared
```

The root Next.js router may compose the FSD application and page layers. FSD slices must import through their public APIs. `apps/web/src/shared/ui` contains application-specific UI composition and Next.js adapters, not copies of generic primitives from `@repo/ui`.

### UI and Storybook

`packages/ui` exports framework-portable React components. It must not depend on `next`, import application aliases, read application environment variables, or depend on generated app configuration. React and React DOM are peer dependencies so the workspace resolves a single runtime copy.

Next.js compiles the UI source by listing `@repo/ui` in `transpilePackages`. Storybook's builder compiles the same source. A separate UI build is not required in local watch mode. A package build can be added when publication becomes real.

Stories remain in `packages/ui/src/**/*.stories.tsx`. `apps/storybook/.storybook/main.ts` discovers that glob and owns preview decorators, global styles, addons, builder configuration, and static output. Because story files resolve imports from the UI package under pnpm's strict resolution, `packages/ui` declares the Storybook type and testing packages used directly by its stories as development dependencies. The Storybook app declares the builder and runtime addons.

Next-specific behavior belongs in `apps/web/src/shared/ui`, where wrappers can combine `@repo/ui` primitives with `next/image`, `next/link`, server components, or navigation. If multiple applications later need those wrappers, introduce an explicit `@repo/ui-next` package or `@repo/ui/next` export rather than contaminating the portable entry point.

Chromatic can later replace or supplement the static Storybook deployment command without changing package ownership or story locations.

### Configuration Generation

The generator is a CLI with distinct stages:

1. `fetch` obtains a versioned JSON envelope through a transport adapter.
2. `validate` checks the envelope with a hand-authored bootstrap schema before trusting source-defined schema or values.
3. `generate` derives environment files, Zod schemas, TypeScript types, and application configuration.
4. A final validation loads the generated result and verifies that it matches the source digest and requested environment.

Transport and authentication remain behind an adapter because they are undecided. The source contract must eventually provide an environment identifier, schema/config version, immutable revision or digest, and enough provenance for diagnostics.

Generation writes to a temporary directory and atomically replaces the target only after all outputs pass validation. A failed generation never leaves a partially updated application. Generated files and local source snapshots are gitignored.

Values and code require different handling:

- Zod schemas and TypeScript types may be generated into `apps/web/.generated/`.
- Secret values belong only in ignored environment files or the build process environment, never generated TypeScript modules.
- Browser-visible configuration requires an explicit allowlist. Only approved values may receive `NEXT_PUBLIC_` names or enter client bundles.
- Diagnostic output redacts values and reports keys, source revision, environment, and validation paths.

Local development runs an `ensure` command before Next.js. It validates an existing local snapshot and generated digest, fetching only when no valid snapshot exists. A separate refresh command forces a fetch. This keeps the normal startup command simple and permits local work during a temporary source outage after one successful fetch.

Production and preview builds do not use the local fallback. Their pipeline fetches current configuration, validates and generates it, then invokes `next build`. Fetch or validation failure stops the build as required.

Representative root commands are:

```json
{
  "scripts": {
    "dev": "pnpm config:ensure && pnpm --filter @repo/web dev",
    "storybook": "pnpm --filter @repo/storybook dev",
    "build:web": "pnpm config:fetch && pnpm config:generate && pnpm --filter @repo/web build",
    "build:storybook": "pnpm --filter @repo/storybook build",
    "check": "pnpm -r --if-present check"
  }
}
```

Exact script names and the source adapter are implementation details, but the strict production path and atomic generation order are architectural requirements.

### Agentic Engineering Platform

`packages/ai` owns reusable infrastructure and first-party content for agentic engineering. It includes vendor-neutral agent and skill definitions, plugin contracts, plugin discovery and validation, installation adapters, a CLI, and a curated catalog. Application-specific AI product behavior remains in `apps/web` unless it becomes reusable independently of the application.

Keep the following concepts distinct:

- An agent defines a role, instructions, capabilities, and skill selection without assuming a specific vendor.
- A skill is a portable unit of instructions and resources.
- A plugin is a versioned collection of agents and skills with a manifest.
- An adapter translates and installs canonical definitions into a target tool's directory layout, metadata, and supported capabilities.
- A registry is a curated catalog that maps plugin identifiers to versions and sources.
- A marketplace adds third-party publishing, search, moderation, trust, signing, and lifecycle policies and is out of scope.

Start with one package rather than separate core, adapter, and plugin packages. Maintain internal module boundaries and explicit subpath exports:

```json
{
  "name": "@repo/ai",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./agents": "./src/agents/index.ts",
    "./skills": "./src/skills/index.ts",
    "./plugins": "./src/plugins/index.ts",
    "./adapters": "./src/adapters/index.ts"
  }
}
```

First-party plugin content lives under `packages/ai/plugins/` so it can be included if the package is published later. Claude, Codex, and OpenCode adapters consume the same canonical plugin model. Tool-specific fields are isolated in namespaced extension metadata and must not become mandatory core fields.

The CLI should initially support validation, listing, conversion, and installation:

```text
ai validate
ai plugins list
ai install <plugin> --adapter claude
ai install <plugin> --adapter codex
```

Plugins should be declarative by default. Do not execute arbitrary plugin code. A future executable plugin model requires a separate security design covering trust, permissions, integrity, sandboxing, compatibility, and installation rollback.

Split `packages/ai` only when adapters or plugins gain independent consumers, heavy tool-specific dependencies, separate ownership, or independent release cycles. A hosted marketplace is considered only when third-party publication and discovery become product requirements.

### Verification and CI

CI should expose separate jobs or commands for:

- UI type checking, unit tests, and story interaction tests;
- Storybook static build;
- config package unit tests using fixture adapters and golden output tests;
- AI core contract tests, plugin manifest validation, and adapter golden output tests;
- web linting, FSD boundary checks, type checking, tests, and production build;

The web production build job must use the real CI config adapter. Generator unit tests must not depend on the external application's availability.

## Decisions and Tradeoffs

### Flat Repository

A flat repository minimizes manifests, TypeScript configuration, package resolution, and build ordering. It is rejected because the UI already has two consumers, the config package has an independent executable lifecycle, and the AI platform exposes adapters and a CLI. Folder-only boundaries would make isolated dependency checks and future extraction convention-based.

Acceptance condition: choose a flat repository if independent checks and future extraction cease to matter, Storybook is treated only as another app script, configuration remains a small application-specific script, and AI adapters are reduced to repository-only scripts without a reusable contract.

### Fully Packaged Workspace

Packaging the UI, Storybook, AI core, every AI adapter, every plugin, the generator, schema, and generic shared code separately would maximize explicit boundaries. It is rejected because adapter and plugin release boundaries are still speculative, no package has an external release lifecycle, and package-per-concern architecture would add build and ownership overhead without demonstrated consumers.

Acceptance condition: adopt more packages when modules gain multiple consumers, distinct owners, independent release/version requirements, executable dependency isolation, or concrete publication needs.

### Selective Workspace

The selective workspace incurs some pnpm, TypeScript, and builder configuration overhead. That cost is accepted for three evidence-backed boundaries while avoiding independent releases, mandatory library prebuilds, separate packages for every AI concern, and a generic shared package. It provides stronger dependency enforcement and independent verification than a flat repository without committing to maximal modularity.

## Residual Risks

- The external config protocol is unresolved. Authentication, revision semantics, rate limits, outage behavior, and secret ownership require a separate design before implementation.
- A live production fetch means identical Git commits can build different artifacts. Recording an immutable source revision and digest makes this observable but does not make builds reproducible unless the external system supports revision pinning.
- Local cached configuration can become stale. The CLI must display source revision and age and provide an obvious refresh command.
- Next.js and Storybook may transform CSS, server/client directives, or package exports differently. Both production builds are required smoke checks.
- Co-located stories add Storybook development dependencies to the UI workspace. They must remain excluded from runtime exports and any future publish allowlist.
- The dual use of `app` for the Next.js router and FSD application layer can confuse contributors. Architecture documentation and import aliases must distinguish them.
- Future UI requirements may genuinely require Next.js primitives. Keep adapters in the app until a second consumer proves a dedicated Next integration package is warranted.
- Claude, Codex, and OpenCode capabilities and file formats may diverge. Adapters must report unsupported canonical features rather than silently dropping behavior.
- Tool configuration formats can change independently. Pin adapter compatibility metadata and cover emitted output with golden tests.
- A plugin catalog can be mistaken for a trusted marketplace. Until trust and integrity policies exist, accept only reviewed first-party plugin sources and avoid arbitrary code execution.
- `packages/ai` can become a dumping ground for application-specific prompts and experiments. Its public exports must remain limited to reusable agentic engineering contracts and tooling.
- pnpm filtered scripts provide limited task caching. Introduce orchestration only after CI measurements show a meaningful bottleneck.

## Delivery Phases

### Phase 1: Workspace Skeleton

Create pnpm workspace configuration, `apps/web`, `apps/storybook`, `packages/ui`, `packages/config`, `packages/ai`, and shared TypeScript/lint defaults. Establish package exports and dependency-boundary lint rules.

Intermediate state: Next.js and Storybook run from root commands, and Storybook renders one co-located UI story.

### Phase 2: UI and FSD Boundaries

Configure Next.js source transpilation, React peer dependencies, Storybook discovery, and FSD public API/import rules. Add web-owned Next.js UI adapters.

Intermediate state: both production builds consume the same UI source, and checks reject deep or inverted imports.

Depends on Phase 1.

### Phase 3: Configuration Lifecycle

Implement the bootstrap source schema, fixture adapter, fetch/validate/generate stages, atomic output, redacted diagnostics, public-value allowlist, and local `ensure` workflow. Add the real transport adapter only after its protocol is decided.

Intermediate state: local development works from fixtures or a validated snapshot; generator tests run independently; no generated artifact is committed.

Depends on Phase 1. The real remote integration depends on a separate config protocol decision.

### Phase 4: CI and Deployment

Add filtered checks, Storybook static deployment, strict preview/production config generation, and the Next.js production deployment. Add Chromatic only if selected.

Intermediate state: web and Storybook deploy independently, production fails closed on config errors, and each workspace boundary has a targeted verification command.

Depends on Phases 2 and 3.

### Phase 5: Agentic Engineering Platform

Define canonical agent, skill, and plugin manifests; implement validation and the CLI; add first-party plugin content; and implement Claude, Codex, and OpenCode adapters. Add a local curated registry without third-party marketplace behavior.

Intermediate state: first-party plugins are committed, discoverable, validated, and installable for supported tools through one package and canonical model.

Depends only on Phase 1 and can be delivered independently of Phases 2 through 4.

# Next Server API Client

**Date:** 2026-08-01
**Type:** design
**Status:** active
**Related:** None

## Problem Statement And Constraints

Design one safe, extensible internal TypeScript HTTP client for feature-specific APIs in a Next.js server application.

This document assumes:

- The initial runtime is the Next.js Node.js server runtime. Browser and Edge support are out of scope.
- The root `app` directory owns routes and server entry-point composition; FSD modules live under `src`.
- Feature APIs use composition and own endpoint paths, DTOs, response decoders, domain mapping, cache tags, and recognized business-error mapping.
- The transport uses the runtime-provided `fetch`, injected for tests.
- The first feature API calls only public endpoints and sends no credentials.
- Errors are thrown as typed client errors rather than returned in a `Result` union.
- V1 supports JSON, empty responses, and optional raw request bodies. Binary and streaming response helpers are deferred until required.
- Runtime response decoding is mandatory for typed JSON. Unvalidated JSON is returned as `unknown`, never as a caller-selected generic.
- General middleware is trusted first-party code, but it must not manufacture typed domain results.
- The current repository does not pin a Next.js or Node.js version. Implementation cannot be considered production-ready until supported versions are pinned and tested.

Three plausible misunderstandings are ruled out:

- This is a reusable transport and feature API boundary, not a design for the upstream REST endpoints.
- Extensibility does not require speculative authentication, session, retry, or shopping-cart abstractions in the first version.
- Framework-neutral contracts do not require the concrete application client to pretend Next.js caching does not exist. Next-specific options are exposed only through a server adapter.

## Out Of Scope

The first deliverable intentionally excludes:

- Authentication, authorization, JWT retrieval or decoding, and credential headers.
- User sessions, anonymous sessions, cookies, token refresh, token rotation, and token persistence.
- Shopping-cart APIs, including anonymous-cart identity, cart merging, and idempotent cart mutations.
- Automatic retries, backoff, 401 replay, and request replay after token refresh.
- Browser and Edge runtimes.
- Pagination helpers, code generation, schema-library selection, React state management, and domain-specific cache invalidation policy.
- Binary or streaming responses unless the first concrete public API proves they are required.

V1 rejects caller-supplied `authorization` and `cookie` headers so these concerns cannot enter through an undocumented escape hatch. Authentication and session support require a separate design based on a concrete authenticated feature. That design must address request scoping, anonymous versus user sessions, cache isolation, refresh persistence, and replay safety rather than extending this client implicitly.

## Success Criteria

- A feature API depends only on a narrow `HttpClient` contract and never extends a base transport class.
- Module-scoped client configuration is immutable and user-independent.
- Paths cannot escape the configured origin or base pathname prefix, including through leading slashes, encoded traversal, query strings, or fragments.
- Feature code cannot set protected headers such as `authorization`, `cookie`, `host`, or `content-length`.
- Typed JSON can only be returned after a feature-supplied decoder succeeds.
- Middleware cannot call `next` more than once or replace parsed domain data.
- A caller abort and an operation timeout are distinguishable typed failures.
- Redirect behavior is explicit and does not silently escape the configured upstream.
- Error details and telemetry are bounded and redacted by default.
- V1 makes at most one physical upstream request per operation.
- Unit tests use injected fetch and no network; integration tests verify server-only and Next cache behavior.

## Chosen Approach And Rationale

Use four explicit layers:

1. Feature APIs define domain-oriented methods and supply DTO decoders.
2. An immutable client normalizes URLs, query values, headers, bodies, cancellation, and timeout.
3. Transport middleware may wrap one raw HTTP exchange.
4. A fixed executor enforces final safety checks, invokes Fetch, maps errors, and decodes the successful response after raw middleware completes.

Configurable middleware operates on raw HTTP requests and responses, not parsed domain results. The feature decoder remains outside its replacement boundary, so middleware cannot forge a typed domain value.

### Architecture

```text
app/                                  # Next routes and composition roots
src/
  shared/
    api/
      core/
        contract.ts
        transport.ts
        errors.ts
        middleware.ts
        parsers.ts
        types.ts
      next/
        create-http-client.server.ts
        cache.ts
        cache-invalidator.server.ts
      index.ts                         # Runtime-neutral exports only
  features/
    <feature>/
      api/
        create-<feature>-api.ts
        dto.ts
        schemas.ts
        server.ts
```

`shared` never imports a feature. Configured clients and feature server composition files import `server-only`. A feature API moves to `entities/<entity>/api` only after multiple features require the same domain operations or models.

### Public Contract

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface JsonResponse<T> {
  kind: "json";
  decode: (input: unknown) => T;
}

export interface EmptyResponse {
  kind: "empty";
}

export type ResponseSpec = JsonResponse<unknown> | EmptyResponse;

export type ResponseOutput<S extends ResponseSpec> =
  S extends JsonResponse<infer T> ? T : void;

export type RequestBody =
  | { kind: "json"; value: JsonValue }
  | { kind: "raw"; value: BodyInit };

export interface OperationOptions<S extends ResponseSpec> {
  operation: string;
  query?: URLSearchParams;
  headers?: HeadersInit;
  response: S;
  timeoutMs?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
}

export interface WriteOptions<S extends ResponseSpec>
  extends OperationOptions<S> {
  body?: RequestBody;
}

export interface HttpClient {
  get<S extends ResponseSpec>(
    path: string,
    options: OperationOptions<S>,
  ): Promise<ResponseOutput<S>>;
  post<S extends ResponseSpec>(
    path: string,
    options: WriteOptions<S>,
  ): Promise<ResponseOutput<S>>;
  put<S extends ResponseSpec>(
    path: string,
    options: WriteOptions<S>,
  ): Promise<ResponseOutput<S>>;
  patch<S extends ResponseSpec>(
    path: string,
    options: WriteOptions<S>,
  ): Promise<ResponseOutput<S>>;
  delete<S extends ResponseSpec>(
    path: string,
    options: OperationOptions<S>,
  ): Promise<ResponseOutput<S>>;
}
```

The response specification determines the return type; callers do not pass an independent data generic. A JSON decoder anchors its output type, an `unknownJson()` decoder explicitly returns `unknown`, and `empty()` produces `void`. GET, HEAD if later added, and v1 DELETE reject bodies. DELETE bodies may be added only for a demonstrated upstream contract.

Methods return decoded data directly. If a feature later proves it needs success metadata, add an explicit response mode returning a redacted metadata object such as `{ data, status, requestId }`; do not expose unrestricted response headers by default.

### URL, Query, And Header Rules

- Normalize the base URL once with a trailing slash.
- Require non-empty relative paths without a leading slash, scheme, authority, query, fragment, or raw/encoded dot segment.
- Resolve the path and then verify exact origin plus normalized base pathname-prefix containment.
- With base `https://api.example.com/v1/`, `cart/items` resolves to `https://api.example.com/v1/cart/items`; `/cart/items` is rejected.
- Use `URLSearchParams` for v1. Features own array, date, and nested-object serialization rather than relying on implicit client rules.
- Reject base URLs containing credentials or fragments and require HTTPS outside explicitly configured local development.
- Build headers through `Headers` so validation is case-insensitive.
- Feature code cannot set `authorization`, `cookie`, `host`, `content-length`, or owned correlation headers.
- JSON bodies receive `content-type: application/json` unless the invariant-safe serializer sets an equivalent media type.

### Lifecycle And Scoping

The configured client is immutable and may be reused at module scope. It may contain only:

- Validated base URL
- Injected Fetch implementation
- Default timeout and error-body limit
- Stateless middleware definitions
- Logger or tracing adapters

It must not contain mutable per-operation state. V1 has no credential or session dependencies.

The Next server entry point configures the client and explicitly composes feature APIs:

```ts
import "server-only";

export const httpClient = new Client({
  baseUrl: process.env.API_BASE_URL!,
  fetch: globalThis.fetch,
});

export const publicApi = createPublicApi(httpClient);
```

This construction opens no network connection. Correctness never depends on the module instance being unique across workers or deployments.

### Middleware And Observability

```ts
export type TransportMiddleware = (
  request: Readonly<TransportRequest>,
  next: (request: Readonly<TransportRequest>) => Promise<Response>,
) => Promise<Response>;
```

Middleware is ordered and guarded so each instance calls `next` at most once. It may copy and transform safe request metadata or return a raw `Response`; the normal status checks and feature decoder always run afterward. It cannot replace parsed `T`.

Security invariants remain fixed executor stages rather than middleware:

- Base origin and pathname-prefix validation
- Protected-header enforcement
- Redirect policy
- Timeout enforcement
- Error-body limits and redaction

Logging and tracing use an explicit low-cardinality `operation` name supplied by the feature. Defaults include method, operation, status, duration, request ID, and error kind. They exclude concrete query values, bodies, and unrestricted headers or URLs.

### Timeout, Cancellation, And Redirects

One deadline covers the complete v1 operation and its single network request. Compose it with the caller signal while preserving which signal aborted first. Map deadline expiration to `HttpTimeoutError` and caller cancellation to `HttpCanceledError`.

Use `redirect: "manual"` and map 3xx responses to a typed HTTP error. Following redirects may be enabled later only with a concrete policy that revalidates the final origin and base pathname prefix.

Passing a timeout signal may opt a Next.js fetch out of render-pass memoization. This performance tradeoff must be tested against the pinned Next.js version. The implementation may omit an internally created signal only when no timeout is configured; it must not silently weaken an explicit deadline.

### Next.js Caching

The runtime-neutral core knows standard Fetch `cache` but not Next's `next` extension. A Next server adapter augments operation options with per-operation dynamic cache policy:

```ts
export interface NextCachePolicy {
  revalidate?: number | false;
  tags?: readonly string[];
}
```

- Operations default to `no-store` and may explicitly opt into reviewed `cache` and `next` settings.
- Conflicting Next cache options are rejected rather than relying on framework warning behavior.
- Tags remain per operation so dynamic values such as `blog:post:<slug>` are possible.
- Mutation invalidation remains feature-owned through an injected `CacheInvalidator` and occurs only after domain success.

### Errors

All client-owned failures derive from `HttpClientError` and preserve a native `cause` where available:

- `HttpConfigurationError`: invalid base URL, path, headers, body, cache policy, or middleware behavior.
- `HttpResponseError`: non-2xx response, including rejected redirects.
- `HttpNetworkError`: Fetch failed for a reason other than timeout or caller cancellation.
- `HttpTimeoutError`: the operation deadline expired.
- `HttpCanceledError`: the caller aborted the operation.
- `HttpParseError`: JSON syntax or feature decoding failed.
- `HttpMiddlewareError`: unexpected configurable middleware failure.

Safe metadata may include method, operation name, sanitized relative path, status, request ID, and bounded decoded error details. It must not retain unrestricted bodies, full headers, or attacker-controlled URLs. Feature APIs translate only recognized upstream business failures and rethrow all other infrastructure errors.

### Request Lifecycle

1. Validate method-specific options and cache policy.
2. Resolve the relative path, serialize query values, and verify origin plus base-prefix containment.
3. Validate feature headers and serialize the body.
4. Compose caller cancellation with the total operation deadline.
5. Execute raw transport middleware in declaration order.
6. Revalidate the final path, protected headers, cache policy, and redirect policy.
7. Invoke the injected Fetch implementation once.
8. Map redirects and non-2xx responses to bounded typed errors.
9. Parse JSON when requested and run the feature decoder.
10. Return decoded domain data and emit redacted completion telemetry.

## Decisions And Tradeoffs

### Immutable Configured Client Over Request-Scoped Facade

The first deliverable has no request-scoped dependencies, so an immutable configured client is sufficient and simpler to compose. A request-scoped facade becomes justified only when a concrete feature introduces credentials, sessions, or other request-owned state.

### Constrained Raw Middleware Over Result Middleware

Raw middleware preserves request/response extensibility while ensuring the decoder remains the only source of `T`. Arbitrary result middleware is rejected because it can manufacture values that bypass runtime validation. It would become acceptable only with a type-safe middleware contract that cannot alter data or with a deliberate removal of the runtime-decoding guarantee.

### Per-Operation Next Policy Over Client Decorator

Per-operation settings support dynamic tags and make cache decisions visible in feature methods. A whole-client decorator is rejected because it is too coarse and obscures how Next options reach the underlying Fetch call. It would be acceptable for a narrowly scoped public API whose cache policy is identical for every operation.

### Data Return Over Universal Result Metadata

Feature APIs usually need decoded data, not `.data` plus unrestricted headers. Returning `T` reduces call-site noise and the metadata exposure surface. A richer result can be added as an explicit response mode after a concrete feature demonstrates the need.

### URLSearchParams Over Custom Query Serialization

Standard URL semantics avoid inventing rules for nested objects, arrays, and dates. Features bear a small DTO conversion cost. A richer serializer is acceptable only after multiple features demonstrate the same encoding convention.

### No Automatic Replay In V1

Retries affect latency, duplication, telemetry, deadlines, and mutation safety. Replay becomes acceptable only after a concrete operation requires it and the client defines:

- One total deadline
- One explicit maximum physical-send count
- Selected transient statuses and bounded backoff
- Idempotent methods or a stable feature-owned idempotency key
- Deterministic tests covering status selection, backoff, cancellation, and send limits

## Stress Test

**Objection: A module-scoped client will make future authentication unsafe.**

Only if credentials are later stored in it. V1 rejects credential headers and keeps all configuration immutable. Authentication requires a separate design and may introduce a request-scoped facade without changing feature APIs that depend on `HttpClient`.

**Objection: Middleware that returns a raw `Response` can still bypass the real network.**

True, but it cannot bypass status handling or response decoding. This capability supports deterministic cache/test middleware without weakening `T`. Production middleware remains first-party and audited.

**Objection: The explicit `operation` field is repetitive.**

Conceded. It provides a stable, low-cardinality telemetry name without deriving one from URLs. Feature-local helpers may fix it without weakening the shared contract.

**Objection: Omitting retries reduces resilience.**

True for transient failures, but an underspecified replay system risks duplicate mutations and unbounded sends. V1's single-send rule is safer. Retry acceptance conditions are explicit and can be implemented after feature idempotency requirements are known.

**Objection: A raw body escape hatch weakens JSON-only simplicity.**

Partly valid. It remains explicit and does not alter response safety. If no initial endpoint needs it, implementation may defer the `raw` variant while preserving the design extension point.

The objections narrow rather than invalidate the approach. The resulting v1 favors enforceable invariants and one physical send over speculative flexibility.

## Residual Risks

- Next.js Fetch caching and memoization behavior varies by framework version; the repository must pin and test its supported version.
- Configurable middleware ordering can still surprise maintainers despite deterministic composition and a single-`next` guard.
- Error payload formats vary by upstream; useful bounded detail requires an upstream-specific decoder.
- Runtime decoding can be costly for large payloads. Any unsafe bypass must be explicit, measured, and local to a reviewed feature.
- Timeout signals may reduce Next render-pass request memoization and increase duplicate upstream calls.
- The existing repository client uses inheritance and `Result` responses. This design treats migration compatibility as out of scope; a migration plan must decide whether external consumers require an adapter.

## Delivery Phases

### Phase 1: Safe Core Transport

Deliver URL and base-prefix validation, protected headers, JSON and empty response specs, request body serialization, injected Fetch, redirect rejection, timeout/cancellation, and typed bounded errors. The intermediate client makes one physical send and has no configurable middleware.

### Phase 2: Observability And Raw Middleware

Deliver raw middleware, the single-`next` guard, operation-name telemetry, request IDs, and redaction tests. Ensure response decoding remains outside the middleware replacement boundary.

Depends on Phase 1's stable request and error contracts.

### Phase 3: Next.js Cache Adapter

Deliver per-operation public Next cache settings, conflicting-option validation, and the `CacheInvalidator` adapter. Keep concrete tag and invalidation policy in feature APIs.

Depends on Phase 1's stable operation options and Phase 2's observability metadata.

### Phase 4: First Feature Integration

Implement one public feature API with schemas, DTO mapping, explicit cache policy, domain-error translation, and feature contract tests. Feed only repeated missing primitives back into the shared client.

Depends on Phases 1-3 and validates whether the abstraction removes real duplication.

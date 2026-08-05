# TypeScript API Client

**Date:** 2026-08-01
**Type:** design
**Status:** active
**Related:** None

## Problem Statement And Constraints

Design a reusable TypeScript client for calling REST APIs from a Next.js server application. Concrete feature APIs, beginning with `BlogApi`, use the client through composition and own their endpoint paths, request models, response models, and response parsers.

The shared client owns:

- Base URL resolution, query serialization, headers, request bodies, response parsing, cancellation, and timeouts.
- Around-request middleware that can inspect or replace requests, results, and errors.
- Normalized errors for HTTP, network, timeout, cancellation, and response parsing failures.
- Safe observability primitives implemented as middleware.

Constraints and assumptions:

- This is a blank-slate design. Existing source files impose no compatibility requirements.
- The initial runtime is the Next.js Node.js server runtime. Browser and Edge support are out of scope.
- The transport uses the runtime's standard `fetch`; a fetch-compatible function is injectable for tests.
- Feature APIs are explicit classes composed over `Client`; features do not inherit from it and are not registered dynamically.
- JSON is the common payload format, but the transport also permits empty, text, binary, and custom response parsers.
- The core client is not a security boundary. It does not authenticate users, authorize operations, manage sessions, refresh tokens, or decide whether a request is permitted.
- The Next.js application supplies an `AuthProvider`. Its separate design owns JWT retrieval, refresh, rotation, session persistence, and production of outgoing authentication headers.
- All configured middleware is trusted, first-party application code. Third-party or dynamically loaded middleware is out of scope.
- The client throws normalized errors. It does not return a `Result` union.
- Retries, pagination, caching policy, schema-library selection, code generation, and React state management are out of scope. They can be added above the core or through middleware where appropriate.
- Next.js request options (`cache` and `next`) are passed explicitly per request. The client does not silently select a cache policy.

Three ways the problem could be misunderstood were ruled out:

- This is a client library, not the design of REST endpoints. Evidence: feature APIs consume an underlying base client.
- This is composition, not subclassing. Evidence: `BlogApi` uses the client underneath.
- This is server-only initially, not universal runtime code. Evidence: the selected target is the Next.js server runtime.

## Success Criteria

- A feature API can be implemented without extending or modifying `Client`.
- The client invokes `AuthProvider` per request without retaining credentials between concurrent requests.
- URL, query, JSON body, headers, timeout, abort signal, and Next.js fetch options can be configured per request.
- Middleware executes in documented order, can wrap the complete request lifecycle, and cannot call `next` more than once.
- All transport failures exposed by the client are instances of a documented `ClientError` subtype and retain their original `cause` where available.
- Response data is produced by an explicit parser; a TypeScript generic alone never claims that unvalidated JSON is a domain type.
- Logging and tracing middleware emits method, sanitized URL, status, duration, request ID, and error kind without exposing credentials or payloads by default.
- Unit tests can run without network access by injecting a fetch-compatible transport.
- Feature APIs can be tested by substituting `ClientContract`, without constructing Next.js request state.

## Chosen Approach And Rationale

Use a small composition-based client with four layers:

1. Typed HTTP verb methods for feature APIs.
2. URL, body, timeout, and request normalization.
3. A deterministic onion-style middleware chain around one Fetch terminal handler.
4. HTTP status handling and explicit response parsing that produce either `ClientResult<T>` or a normalized thrown error.

Feature APIs receive the narrow `ClientContract` interface. The concrete `Client` owns configuration and execution.

```ts
export interface ClientContract {
  $get<T>(path: string, options: ReadOptions<T>): Promise<ClientResult<T>>;
  $post<T, B = unknown>(path: string, options: WriteOptions<T, B>): Promise<ClientResult<T>>;
  $put<T, B = unknown>(path: string, options: WriteOptions<T, B>): Promise<ClientResult<T>>;
  $patch<T, B = unknown>(path: string, options: WriteOptions<T, B>): Promise<ClientResult<T>>;
  $delete<T, B = unknown>(path: string, options: WriteOptions<T, B>): Promise<ClientResult<T>>;
  $head<T>(path: string, options: ReadOptions<T>): Promise<ClientResult<T>>;
}

export type ResponseParser<T> = (response: Response) => Promise<T>;

export interface RequestOptions<T> {
  query?: QueryParams;
  headers?: HeadersInit;
  parser: ResponseParser<T>;
  auth?: "use" | "none";
  timeoutMs?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
  next?: {
    revalidate?: number | false;
    tags?: readonly string[];
  };
}

export type ReadOptions<T> = RequestOptions<T>;

export interface WriteOptions<T, B = unknown> extends RequestOptions<T> {
  payload?:
    | { kind: "json"; value: B }
    | { kind: "raw"; value: BodyInit };
}

export interface ClientResult<T> {
  data: T;
  status: number;
  headers: Headers;
  requestId?: string;
}
```

The `$` prefix deliberately marks these as low-level HTTP operations, distinguishing `client.$get(...)` from domain methods such as `blogApi.listPosts(...)`. All verb methods delegate to one private `request` implementation. There is no public generic request escape hatch in the initial design; add a verb deliberately if a concrete feature proves it is needed.

### Next.js Cache Integration

Feature APIs retain control of Next.js caching. Read methods pass `cache` and `next` options through to Fetch, so a feature can define its own tags and revalidation interval:

```ts
return client.$get("posts", {
  auth: "none",
  next: { tags: ["blog:posts"] },
  parser: json(blogPostListSchema.parse),
});
```

Cache invalidation does not belong in `Client`: an HTTP mutation does not contain enough domain knowledge to determine which tags or paths became stale. A feature may invalidate its tags after a successful mutation through an application-supplied dependency:

```ts
export interface CacheInvalidator {
  invalidateTag(tag: string): void | Promise<void>;
}
```

The Next.js application adapts its cache functions to this interface. A mutating feature API can inject `CacheInvalidator`, centralize its tag names, and invalidate only after `$post`, `$put`, `$patch`, or `$delete` succeeds. Tests use a fake invalidator. The initial read-only `BlogApi` does not need this dependency yet.

Features may call Next.js cache functions directly instead when framework coupling is intentional, but those calls must occur in a Next.js execution context where the selected invalidation function is permitted. The client neither imports Next.js cache APIs nor automatically invalidates on transport success.

### FSD And Next.js Integration

The Next.js root `app` directory remains the routing layer. FSD modules live under `src`; routes import feature server APIs, feature APIs import the shared client, and `shared` never imports a feature.

```text
app/
  blog/page.tsx
src/
  shared/
    api/
      client.ts
      contract.ts
      errors.ts
      middleware.ts
      parsers.ts
      index.ts
      server.ts
    auth/
      server.ts                 # Future AuthProvider implementation
    cache/
      server.ts                 # Next.js CacheInvalidator adapter
  features/
    blog/
      api/
        blog-api.ts
        server.ts
      index.ts
```

`src/shared/api/index.ts` exports only runtime-neutral contracts, implementations, parsers, errors, and middleware types. `src/shared/api/server.ts` is a server-only composition entry point:

```ts
import "server-only";

import { createAuthProvider } from "@/shared/auth/server";
import { Client } from "./client";

export const apiClient = new Client({
  baseUrl: process.env.BACKEND_URL!,
  authProvider: createAuthProvider(),
});
```

The configured client may be a module singleton because its configuration is immutable and `AuthProvider` resolves request-specific state on every invocation. Neither the client nor provider may capture one request's JWT during module initialization.

`blog-api.ts` contains the testable feature implementation and depends only on lower-layer contracts. The initial operation is a post list; the endpoint path, pagination wire format, and schemas below remain placeholders until the backend contract is designed:

```ts
export class BlogApi {
  constructor(private readonly client: ClientContract) {}

  async listPosts(): Promise<readonly BlogPostSummary[]> {
    const result = await this.client.$get("posts", {
      auth: "none",
      next: { tags: ["blog:posts"] },
      parser: json(blogPostListSchema.parse),
    });

    return result.data;
  }
}
```

`src/features/blog/api/server.ts` composes the concrete server instance:

```ts
import "server-only";

import { apiClient } from "@/shared/api/server";
import { BlogApi } from "./blog-api";

export const blogApi = new BlogApi(apiClient);
```

Routes import the explicit server entry point rather than a universal feature barrel:

```ts
import { blogApi } from "@/features/blog/api/server";

export default async function BlogPage() {
  const posts = await blogApi.listPosts();

  return <BlogPostList posts={posts} />;
}
```

Do not re-export server API instances from a barrel that Client Components can import. `server-only` guards both configured-client and feature-instance entry points against accidental client bundling.

FSD placement depends on ownership, not endpoint shape. Start at `features/blog/api` as requested. If post data and operations are later reused by several features, such as a post list, post page, editor, and search, move the reusable domain API and models to `entities/blog-post/api`; features then orchestrate that entity API rather than duplicating it.

`path` is relative to the configured base URL. Absolute URLs and parent traversal segments are rejected so a feature cannot accidentally bypass the configured upstream. Dynamic path values are encoded with an exported `pathSegment(value)` helper. Query serialization supports strings, numbers, booleans, dates, repeated array values, and omitted `null`/`undefined` values.

JSON payloads are serialized by the client and receive `content-type: application/json` unless already set. `GET` and `HEAD` requests reject payloads. Empty-body parsers are explicit, avoiding attempts to parse `204` responses as JSON.

### Configuration

```ts
export interface ClientConfig {
  baseUrl: URL | string;
  fetch?: typeof globalThis.fetch;
  defaultHeaders?: HeadersInit;
  defaultTimeoutMs?: number;
  authProvider?: AuthProvider;
  middleware?: readonly ClientMiddleware[];
}
```

The client configuration is immutable after construction. One client may be reused for an upstream. Request-specific values returned by `AuthProvider` must not be retained by the client.

### Auth Provider Boundary

The client defines the integration contract but not its implementation:

```ts
export interface AuthProvider {
  getRequestHeaders(context: AuthContext): Promise<HeadersInit | undefined>;
}

export interface AuthContext {
  method: HttpMethod;
  url: URL;
  signal: AbortSignal;
}
```

When `auth` is `"use"` and a provider is configured, the client invokes it once after user middleware and immediately before Fetch, then overlays the returned headers on a copied context. `auth` defaults to `"use"` when a provider exists and `"none"` otherwise. `"none"` bypasses the provider for endpoints that must not receive credentials.

The provider may return no headers, in which case the request proceeds anonymously. Whether credentials are required is determined by the upstream API; the client does not implement local authorization policy.

The future auth-provider design must decide how JWTs are retrieved, refreshed, rotated, persisted, and coordinated across concurrent Next.js requests. It must also define its error contract and whether any failed request can be replayed. Those decisions are deliberately outside this client design.

### Middleware

```ts
export type ClientHandler = (
  context: ClientRequestContext,
) => Promise<ClientResult<unknown>>;

export type ClientMiddleware = (
  context: ClientRequestContext,
  next: ClientHandler,
) => Promise<ClientResult<unknown>>;
```

Middleware is composed in declaration order: the first configured middleware is the outermost wrapper. Each middleware may call `next` exactly once; a runtime guard throws a configuration error on a second call. Middleware receives an immutable context and modifies a request by passing a copied context to `next`.

The complete terminal operation, including Fetch, HTTP error mapping, and response parsing, runs inside the chain. Observability middleware can therefore measure and classify every failure, including parse failures.

Authentication and authorization are not implemented by the core client. `AuthProvider` is a privileged integration stage, not general middleware. The API server remains responsible for validating credentials and authorizing the operation. This client cannot make an unsafe endpoint safe.

The client invokes `AuthProvider` after all general middleware and revalidates that the final URL remains under the configured base URL before sending credentials. General middleware does not receive the credential-bearing context. This reduces accidental exposure but does not replace application security review.

Initial first-party middleware factories are:

- `createLoggingMiddleware(logger, options?)`
- `createTracingMiddleware(tracer, options?)`
- `createRequestIdMiddleware(generator?)`

They receive only a redacted metadata view by default. Header values, query values, and bodies require explicit allowlisting. `authorization`, `cookie`, and `set-cookie` can never be allowlisted.

### Errors

All public transport errors extend `ClientError` and include a stable `kind`, message, request method, sanitized URL, and optional `cause`.

- `HttpError`: non-2xx response, status, response headers, request ID, and an optional bounded error body decoded by a configurable error parser.
- `NetworkError`: Fetch rejected for a reason other than cancellation or timeout.
- `TimeoutError`: the configured deadline aborted the request.
- `CanceledError`: the caller's signal aborted the request.
- `ResponseParseError`: a successful response did not satisfy its parser.
- `ClientConfigurationError`: invalid URL, request shape, middleware behavior, or configuration.

Errors thrown deliberately by application middleware retain their own type. Unexpected middleware failures are wrapped as `MiddlewareError` with the original cause.

Error body capture has a strict byte limit and redaction hook. Unknown backend payloads are not spread into errors or logs. Native causes remain attached for diagnostics.

### Feature API Example

```ts
export class BlogApi {
  constructor(private readonly client: ClientContract) {}

  async listPosts(): Promise<readonly BlogPostSummary[]> {
    const result = await this.client.$get("posts", {
      auth: "none",
      next: { tags: ["blog:posts"] },
      parser: json(blogPostListSchema.parse),
    });

    return result.data;
  }
}
```

The initial list is assumed to be public, so it bypasses `AuthProvider` and can use shared Next.js caching. The `"posts"` path and response schema are illustrative until the backend contract is designed. `"blog:posts"` is the collection tag; a future post-detail operation addressed by slug should use a tag such as `blog:post:<slug>` in addition to the collection's invalidation rules.

`json` accepts a decoder from any validation library rather than depending on Zod or another schema package. An explicitly named `unsafeJson<T>()` helper may be offered for trusted responses, but feature APIs should prefer decoded responses.

### Request Lifecycle

1. Validate configuration and request invariants.
2. Resolve the relative path and serialize query parameters.
3. Merge default and request headers and serialize the payload.
4. Compose caller cancellation with the timeout signal.
5. Execute user middleware in declaration order.
6. Invoke the optional `AuthProvider` and overlay its request headers.
7. Call the injected Fetch transport.
8. Map a non-2xx response to `HttpError`.
9. Parse a successful response with the request parser.
10. Return data and response metadata; normalize transport failures before they leave the client.

## Decisions And Tradeoffs

### Composition Over Inheritance

Chosen because feature APIs need transport behavior, not transport identity. Composition gives feature tests a narrow substitute, permits multiple upstream clients, and keeps protected base-class internals out of feature design.

Subclassing would be acceptable only if concrete APIs had to override core execution hooks and all features shared one lifecycle. Neither condition is present.

### Explicit Feature Classes Over Dynamic Plugins

Explicit classes provide direct imports, constructor dependencies, tree shaking, and discoverable methods. A plugin registry introduces runtime failure modes and weaker typing.

Dynamic registration would be acceptable only if independently deployed packages had to add features without changing application composition.

### Handwritten Feature Methods Over Generated Clients

Handwritten methods fit a shared transport while allowing domain-oriented methods that do not mirror endpoints one-to-one. Full OpenAPI generation adds build tooling and often leaks wire models into application code.

Generation would be acceptable if a stable OpenAPI document were authoritative, endpoint count made manual maintenance material, and generated output were wrapped behind domain APIs.

### Thrown Errors Over Result Unions

Thrown errors match Fetch and `async` conventions and keep successful feature methods concise. The cost is that callers need deliberate error boundaries and exhaustive handling is not compiler-enforced.

A `Result` union would be preferable if the application mandates functional error handling and all consumers consistently propagate discriminated unions.

### Parsers Over Generic Assertions

The parser anchors `T` in runtime behavior and supports transformations. This adds one parser per response shape but prevents invalid server data from masquerading as a domain model.

### Middleware Over Many Lifecycle Hooks

One around-request abstraction supports request modification, response inspection, errors, logging, and tracing without adding independent hook ordering rules. The tradeoff is that middleware ordering is behaviorally significant and requires focused tests and documentation.

### Client Abstraction Over Feature-Local Fetch

The client is justified by the stated cross-cutting requirements: one middleware model, one error taxonomy, explicit response parsing, consistent URL/body handling, and transport substitution in tests. It does not provide stronger authentication or authorization than direct `fetch`; both ultimately send application-provided credentials to an API that must enforce access.

Letting each feature use `fetch` directly has meaningful advantages: fewer types, direct access to all Next.js Fetch behavior, less indirection while debugging, and no wrapper contract to maintain. It is the better choice when there are few features, their behavior differs substantially, or shared handling is limited to one or two small helpers.

Keep the client only while it removes repeated policy from feature APIs. Feature APIs must still explicitly choose paths, verb methods, payloads, parsers, cache behavior, and domain return types. If the verb options grow into a near-copy of `RequestInit` without enforcing useful invariants, replace the client with direct `fetch` plus focused helpers and middleware decorators.

### Verb Methods Over A Public Generic Request

Verb methods make feature code concise and encode useful constraints: `$get` and `$head` cannot accept payloads, while write methods can. A private `request` keeps URL normalization, middleware, auth-provider invocation, Fetch, errors, and parsing in one implementation.

The cost is a larger interface and no immediate support for uncommon or custom methods. A public generic request would be preferable only if concrete features need methods outside the supported set or need to select methods dynamically. Until then, an escape hatch would weaken the contract without serving a requirement.

## Stress Test

**Objection: A singleton client can leak one user's token into another server request.**

This is fatal if credentials are constructor values or mutable headers. The design instead invokes an async provider per request and applies returned headers only to that request's immutable context. Tests must execute concurrent requests with different providers or request contexts and verify isolation.

**Objection: General middleware can become an untraceable second client implementation.**

Valid in part. Core invariants run before middleware, `next` is guarded, and first-party middleware remains narrow. `AuthProvider` runs after general middleware, outside that chain. Middleware that changes paths, parsers, or payloads should be rare and tested as infrastructure.

**Objection: Next.js caching plus authorization can cache private data.**

Valid and not fully solvable in a generic transport. The client never enables caching implicitly. Authenticated feature methods should use `cache: "no-store"` unless a reviewed Next.js cache strategy proves that the cache key and invalidation preserve user isolation.

**Objection: An explicit parser makes simple endpoint implementations verbose.**

Conceded. Small helpers (`json(decoder)`, `text()`, `bytes()`, and `empty()`) keep the call site short. An unsafe JSON helper must be visibly named so loss of runtime guarantees is intentional.

**Objection: Middleware using `unknown` internally weakens response typing.**

Conceded at the middleware boundary, where middleware must work across all response types. Public request typing remains anchored by `ResponseParser<T>`. Middleware that replaces `data` accepts responsibility for preserving the parser's contract; first-party observability middleware never changes data.

The objections revise, but do not invalidate, the composition approach. They add immutable request contexts, a separate privileged `AuthProvider` stage, explicit cache policy, redaction defaults, parser helpers, and a `next` invocation guard. They also establish that the client is infrastructure consistency, not security enforcement.

## Residual Risks

- Next.js caching remains a feature-level security decision. A generic client cannot prove that authenticated responses are safe to cache.
- The separate auth-provider design may impose new requirements for refresh failures or safe request replay. The client must not add automatic replay before that contract exists.
- Middleware order can still surprise maintainers even when deterministic. Integration tests must assert the configured order and transformed values.
- Error payload formats vary by upstream. A bounded default parser may omit useful details until an upstream-specific error parser is configured.
- Runtime schema decoding has a latency cost for large payloads. Measurements may justify selective unsafe parsing for trusted, high-volume endpoints.
- Server-only assumptions may leak into feature code. Browser or Edge support requires a separate compatibility review rather than being claimed from Fetch API similarity.
- The blog backend contract is not implemented. Endpoint paths, pagination, post schemas, and error payloads must be agreed before the first feature integration can be completed.

## Delivery Phases

### Phase 1: Core Transport

Deliver `ClientContract`, configuration, URL/query/body normalization, Fetch injection, timeout/cancellation, response parsers, `ClientResult`, and normalized errors. The intermediate system supports feature APIs without custom middleware and is fully unit tested with a fake Fetch implementation.

### Phase 2: Middleware And Auth Boundary

Deliver onion composition, immutable contexts, the single-`next` guard, final base-URL scope validation, and the `AuthProvider` invocation boundary. Include tests proving per-request invocation, auth bypass, header overlay order, credential isolation, and provider error propagation. Use a fake provider; JWT retrieval and refresh behavior belong to the subsequent auth-provider design.

Depends on Phase 1's stable request, result, and error contracts.

### Phase 3: Observability

Deliver logging, tracing, request ID middleware, redaction rules, and tests proving that credentials and payloads are excluded by default. The intermediate system is production-observable without changing feature APIs.

Depends on Phase 2's final middleware ordering.

### Phase 4: First Feature Integration

Finalize the backend list-posts contract, then deliver `BlogApi.listPosts` as the reference composition. Include a schema-backed parser, public auth policy, collection cache tag, feature-level contract tests, and a Next.js server integration test. Reserve slug-based identity for the later post-detail operation. Feed any proven missing primitive back into the core only when it applies to more than one feature.

Depends on Phases 1-3 and validates the abstraction against a concrete use case.

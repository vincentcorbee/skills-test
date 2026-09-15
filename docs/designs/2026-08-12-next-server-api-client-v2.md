# Next Server API Client V2

**Date:** 2026-08-12
**Type:** design
**Status:** draft
**Supersedes:** `2026-08-01-next-server-api-client.md` after acceptance

## Purpose

Design one internal TypeScript HTTP client for a Next.js server application. The client provides a safe transport, raw HTTP middleware, and explicit Next.js Fetch support. Feature APIs consume the client through composition and own endpoint paths, DTOs, response decoding, domain mapping, cache tags, and recognized business errors.

The design is for the client boundary, not for any particular feature or upstream API.

## Prerequisites

Implementation starts only after the repository pins supported versions of:

- Node.js
- Next.js
- TypeScript

Tests must run against those versions. Next.js Fetch caching and signal behavior are framework contracts and cannot be accepted from unpinned behavior.

## Scope

V1 supports:

- Next.js Node.js server runtime
- Injected Fetch implementation
- `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`
- JSON request bodies
- Decoded JSON and empty successful responses
- Raw request/response middleware
- Caller cancellation and operation deadlines
- Standard Fetch cache options
- Next.js `revalidate` and cache tags through an explicit server contract
- Typed, bounded, redacted errors and telemetry
- At most one physical upstream request per operation

V1 excludes:

- Browser and Edge runtimes
- Credentials, cookies, sessions, and token refresh
- Automatic retries or any other request replay
- Multipart, binary, text, streamed, or arbitrary `BodyInit` request bodies
- Binary and streaming response helpers
- Pagination, code generation, and schema-library selection
- Domain-specific cache invalidation rules

Unsupported body and response kinds are added as explicit variants after a concrete feature requires them. V1 has no raw `BodyInit` escape hatch.

## Design Principles

1. Feature APIs depend on a narrow interface and never inherit from transport code.
2. A response decoder is the only way to produce a typed JSON value.
3. Middleware can transform raw transport data but cannot return parsed feature data.
4. Security invariants are fixed executor stages, not configurable middleware.
5. Stable configuration is immutable and contains no request- or user-specific state.
6. Next.js behavior is visible in a concrete type rather than hidden through declaration merging or an undocumented option extension.
7. V1 performs zero or one physical send; middleware may short-circuit, but nothing may replay.

## Architecture

```text
app/                                      # routes and composition roots
src/
  shared/
    api/
      core/
        contract.ts
        transport.ts
        middleware.ts
        responses.ts
        errors.ts
        types.ts
      next/
        contract.ts
        create-http-client.server.ts
        cache-invalidator.server.ts
      index.ts                             # runtime-neutral exports only
  features/
    <feature>/
      api/
        create-<feature>-api.ts
        dto.ts
        schemas.ts
        server.ts
```

Dependency direction:

```text
app composition -> feature API -> shared HTTP contract
                                 -> Next HTTP contract when cache metadata is needed
```

`shared` never imports a feature. Configured Next clients and feature server composition files import `server-only`.

## Public Contracts

### Responses and bodies

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface JsonResponse<T> {
  readonly kind: "json";
  readonly decode: (input: unknown) => T;
}

export interface EmptyResponse {
  readonly kind: "empty";
}

export type ResponseSpec = JsonResponse<unknown> | EmptyResponse;

export type ResponseOutput<S extends ResponseSpec> =
  S extends JsonResponse<infer T> ? T : void;

export interface JsonBody {
  readonly kind: "json";
  readonly value: JsonValue;
}
```

Helpers make intent explicit:

```ts
json(parseDto)       // JsonResponse<Dto>
unknownJson()        // JsonResponse<unknown>
empty()              // EmptyResponse
jsonBody(dto)        // JsonBody
```

There is no caller-selected response generic. The decoder determines the return type. JSON parsing occurs before decoding, and decoded DTOs are mapped to domain values inside the feature API.

### Runtime-neutral client

```ts
export interface OperationOptions<S extends ResponseSpec> {
  readonly operation: string;
  readonly query?: URLSearchParams;
  readonly headers?: HeadersInit;
  readonly response: S;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly cache?: RequestCache;
}

export interface WriteOptions<S extends ResponseSpec>
  extends OperationOptions<S> {
  readonly body?: JsonBody;
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

GET and DELETE do not accept bodies in V1. Methods return decoded data directly. Success metadata may later be introduced as a separate response-spec variant; unrestricted response headers are never returned by default.

### Next.js-aware client

```ts
export interface NextCachePolicy {
  readonly revalidate?: number | false;
  readonly tags?: readonly string[];
}

export interface NextOperationOptions<S extends ResponseSpec>
  extends OperationOptions<S> {
  readonly next?: NextCachePolicy;
}

export interface NextWriteOptions<S extends ResponseSpec>
  extends NextOperationOptions<S> {
  readonly body?: JsonBody;
}

export interface NextHttpClient extends HttpClient {
  get<S extends ResponseSpec>(
    path: string,
    options: NextOperationOptions<S>,
  ): Promise<ResponseOutput<S>>;

  post<S extends ResponseSpec>(
    path: string,
    options: NextWriteOptions<S>,
  ): Promise<ResponseOutput<S>>;

  put<S extends ResponseSpec>(
    path: string,
    options: NextWriteOptions<S>,
  ): Promise<ResponseOutput<S>>;

  patch<S extends ResponseSpec>(
    path: string,
    options: NextWriteOptions<S>,
  ): Promise<ResponseOutput<S>>;

  delete<S extends ResponseSpec>(
    path: string,
    options: NextOperationOptions<S>,
  ): Promise<ResponseOutput<S>>;
}
```

`NextHttpClient` remains assignable where `HttpClient` is required because it only accepts an additional optional property. A feature that owns Next cache tags depends explicitly on `NextHttpClient`; a runtime-neutral feature depends on `HttpClient`.

No declaration merging or implicit option augmentation is used.

## URL and Query Rules

The client normalizes the base URL once and requires a trailing pathname slash. A request path must be non-empty and relative.

The client rejects:

- Leading slashes, schemes, authorities, queries, and fragments
- Raw backslashes or NUL characters
- Invalid percent escapes
- Raw or encoded path separators inside a segment
- A segment that becomes `.` or `..` after repeated percent-decoding
- Double-encoded traversal or separators
- Paths exceeding the configured length bound

Validation repeatedly decodes each bounded segment until stable. It rejects the path if the decoding-pass limit is exceeded. Decoded Unicode segments must be NFC-normalized; the client encodes the normalized segments when constructing the final URL.

After resolution, the executor verifies:

- Exact protocol and origin equality
- Exact normalized base-path prefix containment on a segment boundary
- No username, password, query, or fragment introduced by the path

Example:

```text
base:    https://api.example.com/v1/
accept:  catalog/items
reject:  /catalog/items
reject:  ../items
reject:  %252e%252e/items
reject:  catalog%2fprivate
```

Features supply `URLSearchParams` and own array, date, and nested-value serialization. The client appends those values after path validation.

## Header Policy

Headers are normalized through `Headers` and checked case-insensitively.

Feature code may not set:

- `authorization`
- `cookie`
- `proxy-authorization`
- `host`
- `content-length`
- `connection`
- `transfer-encoding`
- `upgrade`
- `te`
- `trailer`
- `keep-alive`
- Any `proxy-*` or `sec-*` header
- Any executor- or middleware-owned header configured at client creation

The JSON serializer exclusively owns `content-type` and sets `application/json`. Feature code cannot override it when a body exists. A feature without a body may set `accept` but not `content-type` unless a demonstrated endpoint requires that exception.

Protected headers are checked before middleware and again immediately before Fetch. Middleware may set only headers declared in its registration metadata. Undeclared or conflicting writes produce `HttpMiddlewareError`.

## Transport Middleware

Middleware receives an immutable value snapshot rather than mutable `URL` or `Headers` objects:

```ts
export interface TransportRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly url: string;
  readonly headers: readonly (readonly [name: string, value: string])[];
  readonly body?: string;
  readonly cache?: RequestCache;
  readonly next?: NextCachePolicy;
  readonly operation: string;
  readonly signal: AbortSignal;
}

export interface MiddlewareRegistration {
  readonly name: string;
  readonly ownsHeaders?: readonly string[];
  readonly middleware: TransportMiddleware;
}

export type TransportMiddleware = (
  request: TransportRequest,
  next: (request: TransportRequest) => Promise<Response>,
) => Promise<Response>;
```

Snapshots and nested collections are copied and frozen at runtime. A middleware transforms a request by constructing a new value. The executor never exposes its internal mutable Fetch objects.

Middleware follows declaration-order onion semantics:

```text
before A -> before B -> Fetch -> after B -> after A
```

Rules:

- Each middleware may call `next` zero or one time.
- Calling `next` twice throws `HttpMiddlewareError` before another send.
- Calling `next` after the middleware has returned is rejected.
- Returning without calling `next` is an explicit short-circuit.
- A thrown middleware error is wrapped with the middleware name and a safe cause.
- Middleware cannot observe or replace the decoded result.
- V1 has no retry middleware because a retry requires multiple `next` calls or executor support.

The executor tracks whether Fetch was reached and records response source as `network` or `middleware`; middleware does not self-report attribution.

### Short-circuited responses

A middleware-produced `Response` passes through the same fixed processing as a network response. The executor rejects a response that:

- Is not a valid Fetch `Response`
- Has an unusable or already-consumed body
- Has an invalid status for normal HTTP processing
- Violates the redirect policy
- Exceeds response or error-body limits while being read

Status handling, body reading, JSON parsing, feature decoding, redaction, and telemetry always run after the middleware chain. A short-circuit can avoid the network but cannot manufacture typed output.

## Fixed Executor

The executor owns invariants that middleware cannot disable:

- URL origin and base-prefix containment
- Protected and middleware-owned headers
- Cache-policy validation
- Manual redirect handling
- Total deadline and caller cancellation
- Single physical-send limit
- Response-size and error-detail limits
- Status mapping
- JSON parsing and feature decoding
- Error redaction and telemetry attribution

Before calling Fetch, it reconstructs Fetch inputs from the immutable snapshot and revalidates all fields.

The executor reads response bodies incrementally and stops once the configured byte limit is exceeded. It does not call an unbounded convenience reader before enforcing the limit.

## Timeout and Cancellation

One deadline covers the complete operation:

```text
validation -> middleware -> Fetch -> body read -> JSON parse -> decoder
```

The executor records a monotonic deadline immediately before middleware execution. Its timer is cleared only after decoding or failure. The deadline therefore includes middleware work and response-body consumption, not only receipt of response headers.

The executor composes the deadline signal with the caller signal and records the first abort source:

- Deadline first: `HttpTimeoutError`
- Caller signal first: `HttpCanceledError`

The decoder must be synchronous in V1. Cancellation cannot preempt synchronous JavaScript already running, so the executor checks both the composed signal and the monotonic deadline before and after decoding. A value is not returned after the deadline even when the timer callback could not run during synchronous work.

When no timeout is configured, the executor does not create an internal signal. This avoids changing Next.js memoization behavior unnecessarily. An explicit timeout is never silently weakened.

## Redirect Policy

Fetch always receives `redirect: "manual"`. Every 3xx response becomes `HttpResponseError`; the client never follows it automatically.

Redirect following requires a separate design because it affects origin containment, credentials, method rewriting, body replay, and physical-send limits.

## Next.js Cache Policy

The runtime-neutral core knows only standard `RequestCache`. The Next adapter passes the explicit `next` option to the pinned Next.js Fetch implementation.

Rules:

- Default to `cache: "no-store"`.
- Public operations may explicitly select reviewed standard and Next cache settings.
- Reject combinations that the pinned Next.js version documents as conflicting.
- Validate tag count, tag length, and `revalidate` values before middleware.
- Keep dynamic tags per operation.
- Keep invalidation feature-owned through an injected `CacheInvalidator`.
- Invalidate only after decoded feature success, outside the HTTP client.

Integration tests verify actual Next.js behavior; core unit tests verify option validation and pass-through only.

## Errors

All owned failures extend `HttpClientError` and retain a native `cause` when safe:

- `HttpConfigurationError`: invalid client configuration or request input
- `HttpResponseError`: redirect or non-2xx response
- `HttpNetworkError`: Fetch failure unrelated to cancellation or deadline
- `HttpTimeoutError`: operation deadline elapsed first
- `HttpCanceledError`: caller cancellation occurred first
- `HttpJsonSyntaxError`: successful response was not valid JSON
- `HttpDecodeError`: feature decoder rejected valid JSON
- `HttpMiddlewareError`: middleware contract violation or unexpected failure
- `HttpResponseLimitError`: response exceeded the configured read limit

Separating JSON syntax from decoder failure distinguishes a broken wire representation from an upstream contract mismatch.

Safe metadata may contain:

- Method and stable operation name
- Sanitized relative path without query values
- Status
- Response source: `network` or named short-circuiting middleware
- Upstream request ID from an allowlisted header
- Bounded, decoded error details

Errors and telemetry never retain bodies, credentials, cookies, unrestricted headers, query values, or attacker-controlled full URLs. Feature APIs translate only recognized business failures and rethrow all other client errors.

## Lifecycle and Composition

The configured client is immutable and may be reused at module scope. It may contain only:

- Validated base URL
- Injected Fetch implementation
- Default timeout and size limits
- Immutable middleware registrations
- Logger or tracing adapters

It contains no mutable per-operation, request, session, or user state.

```ts
import "server-only";

export const httpClient: NextHttpClient = createNextHttpClient({
  baseUrl: process.env.API_BASE_URL!,
  fetch: globalThis.fetch,
  middleware: [telemetryMiddleware(telemetry)],
});

export const catalogApi = createCatalogApi(httpClient);
```

Construction opens no connection. Correctness never depends on singleton identity across processes, workers, or deployments.

## Request Lifecycle

1. Validate operation name, method options, body, and cache policy.
2. Canonicalize and validate the relative path.
3. Append feature-owned query parameters.
4. Normalize and validate feature headers.
5. Serialize the JSON body.
6. Start the total deadline and compose cancellation signals.
7. Create the frozen transport snapshot.
8. Execute middleware in declaration order.
9. Before Fetch, revalidate the final snapshot and enforce the send limit.
10. Validate and attribute the returned response.
11. Map redirects and non-2xx responses using bounded error reads.
12. Read the bounded success body.
13. Parse JSON when requested.
14. Run the feature decoder.
15. Check cancellation, emit redacted telemetry, and return decoded data.

## Testing

Core unit tests use injected Fetch and no network. They cover:

- Base URL and base-prefix containment
- Raw, encoded, and double-encoded traversal
- Encoded separators, backslashes, fragments, and Unicode normalization
- Protected and middleware-owned header enforcement
- JSON serialization and unsupported body rejection
- Response-spec type inference
- Middleware order, transformation, short-circuiting, late `next`, and double `next`
- Final snapshot revalidation
- Zero-or-one physical-send enforcement
- Network and middleware response attribution
- Redirect rejection
- Timeout during middleware, Fetch, body reading, and decoding boundaries
- Caller cancellation versus timeout precedence
- Malformed JSON versus decoder failure
- Success and error response-size limits
- Error and telemetry redaction
- Next cache validation and option pass-through

Integration tests run with the pinned Next.js version and cover:

- `server-only` boundaries
- Patched Fetch preservation
- Data Cache behavior
- Tags and revalidation
- Cache-option conflicts
- Timeout-signal effects on request memoization

Feature contract tests cover endpoint paths, DTO construction, decoders, mapping, cache tags, and recognized business-error translation using a narrow client test double.

## Delivery

### Phase 1: Contracts and safe executor

Implement response specs, JSON bodies, URL and header validation, injected Fetch, one-send enforcement, redirects, deadlines, cancellation, bounded reads, and typed errors.

### Phase 2: Middleware and observability

Implement frozen snapshots, declared header ownership, onion ordering, single-`next` enforcement, short-circuit attribution, and redacted telemetry.

### Phase 3: Next.js adapter

Implement `NextHttpClient`, cache-policy validation, Fetch pass-through, integration tests, and the invalidator adapter.

### Phase 4: Feature validation

Integrate one public feature API. Feed only demonstrated missing transport primitives back into the shared contracts.

## Tradeoffs

- Mandatory decoding adds feature code but prevents unvalidated data from appearing typed.
- Frozen value snapshots allocate copies but make middleware behavior auditable.
- Strict path validation rejects some technically valid encodings but protects fixed upstream boundaries.
- A distinct Next contract exposes framework coupling instead of concealing it.
- JSON-only V1 is narrower than Fetch but avoids accidental streaming, replay, and content-type semantics.
- Single-send V1 provides less transient resilience but makes latency and mutation behavior deterministic.
- Explicit operation names add repetition but provide stable, low-cardinality telemetry.

## Deferred Extensions

Authentication, retries, new body kinds, response metadata, and redirect following require separate proposals. Each proposal must preserve feature composition, decoding integrity, bounded observability, and explicit physical-send behavior.

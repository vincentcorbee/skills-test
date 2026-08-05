# Next Server HTTP Client

**Date:** 2026-08-01
**Type:** design
**Status:** active

## Goals And Constraints

Design a base HTTP client for feature-specific APIs, beginning with a shopping-cart API, in a Next.js application using Feature-Sliced Design (FSD).

The design has these constraints:

- The client runs only on the server.
- The Next-aware server client lives under `src/shared/api`.
- Feature APIs live under `src/features/<feature>/api`.
- The Next root `app` folder contains routing and composes dependencies at server entry points.
- Bearer credentials use request-scoped JWTs supplied through owned middleware.
- The implementation uses native `fetch`, injected for testing.
- The client throws typed errors rather than returning `Result` values.
- The first version supports JSON and empty payloads only.
- The implementation is an internal application module, not a published package.

## Architecture

```text
src/
  app/                              # Next routes and entry-point composition
  shared/
    api/
      core/
        http-client.ts
        errors.ts
        middleware.ts
        types.ts
      middleware/
        retry.ts
        telemetry.ts
        correlation.ts
        credential.ts
      next/
        access-token-provider.server.ts
        create-http-client.server.ts
  features/
    shopping-cart/
      api/
        create-shopping-cart-api.ts
        schemas.ts
        dto.ts
        errors.ts
```

The dependency direction is:

```text
app entry point -> feature API -> shared HTTP API
```

`shared` never imports a feature. Routes, Server Actions, and other server entry points create the request-scoped client and inject it into only the feature APIs needed for that operation.

## Client Lifecycle

Cache immutable, user-independent infrastructure at module scope. This cache exists once per server worker or process, not once per deployment. Serverless functions, workers, and cold starts may each create their own instance.

The cached transport may contain:

- Validated base URL
- Injected `fetch`
- Stateless middleware definitions
- Retry configuration
- Telemetry adapter
- Default 10-second timeout policy

It must not contain:

- A JWT
- Cookies or session state
- A request-scoped `AccessTokenProvider`
- Refreshed token state
- An in-flight refresh promise
- Request correlation state

```ts
import "server-only";

const baseTransport = createBaseTransport({
  baseUrl: validateApiBaseUrl(process.env.API_BASE_URL),
  fetch: globalThis.fetch,
  timeoutMs: 10_000,
  middleware: [
    telemetryMiddleware(telemetry),
    retryMiddleware(),
  ],
});

export async function createCredentialedServerHttpClient(): Promise<HttpClient> {
  const accessTokenProvider = await createRequestAccessTokenProvider();

  return baseTransport.bind([
    correlationMiddleware(),
    credentialMiddleware(accessTokenProvider),
  ]);
}

export function createPublicServerHttpClient(): HttpClient {
  return baseTransport.bind([
    correlationMiddleware(),
  ]);
}
```

Constructing the request-scoped facade is intentionally cheap and does not create a network connection.

An entry point composes the required feature API explicitly:

```ts
const http = await createCredentialedServerHttpClient();
const shoppingCart = createShoppingCartApi(http);

const cart = await shoppingCart.getCart();
```

The configured composition entry points and token adapter import `server-only`. The request and transport logic remains independently testable without constructing Next request state, even though its public options support Next's extended `fetch` contract. Public facades omit credential middleware; credentialed facades include a request-scoped provider and enforce `no-store`.

There are three application identity states:

```text
Public                 No JWT
Anonymous credential   Anonymous-session JWT
User credential        Authenticated-user JWT
```

The HTTP client distinguishes only public from credentialed. It does not inspect a token to distinguish anonymous sessions from authenticated users.

## Public Contract

The shared client exposes five HTTP verb methods. A common request executor remains private.

```ts
export interface HttpClient {
  get: HttpReadMethod;
  post: HttpWriteMethod;
  put: HttpWriteMethod;
  patch: HttpWriteMethod;
  delete: HttpDeleteMethod;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Parser<T> = (input: unknown) => T;

export interface RequestOptions<T> {
  query?: URLSearchParams;
  headers?: HeadersInit;
  parse?: Parser<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
  cache?: RequestCache;
  next?: {
    revalidate?: number | false;
    tags?: readonly string[];
  };
}
```

Conceptual usage:

```ts
const cart = await http.get("/cart", {
  query: new URLSearchParams({ currency: "EUR" }),
  parse: parseCartDto,
  cache: "no-store",
});

await http.post("/cart/items", addItemDto, {
  headers: {
    "Idempotency-Key": operationId,
  },
  response: "empty",
});
```

The public contract follows these rules:

- Paths must be relative to the configured API base URL.
- Absolute URLs, origin changes, and parent traversal are rejected.
- Query parameters use `URLSearchParams`; the core does not invent nested object serialization rules.
- Mutation bodies must satisfy the recursive `JsonValue` type.
- Features convert dates, class instances, `undefined`, and domain models into transport DTOs.
- `delete()` does not accept a request body.
- JSON response parsers are optional.
- Supplying a parser returns the parser's inferred output type.
- Omitting a parser returns `unknown`, never a caller-asserted generic type.
- Empty-response operations return `void` and do not attempt JSON parsing.
- A caller-provided `AbortSignal` is composed with the operation timeout.
- Request options expose Next's `cache`, `next.revalidate`, and `next.tags` values directly and pass them to the injected server `fetch`.
- Credentialed requests default to `cache: "no-store"` and cannot opt into shared Next caching.
- Credential-free public feature operations may explicitly opt into reviewed cache settings.
- Contradictory cache settings are rejected before calling `fetch`.
- Feature requests cannot override protected headers such as `Authorization`, `Cookie`, `Host`, or correlation headers.
- Trusted middleware exclusively owns security-sensitive headers.

The base URL is validated when the cached transport is first created. It must be absolute, contain no embedded credentials or fragment, use HTTPS outside local development, and may include a fixed path prefix.

Credentialed API redirects are rejected by default rather than followed automatically.

## Middleware

Middleware follows an asynchronous onion model and can inspect or modify a request, response, or error:

```ts
type Middleware = (
  context: RequestContext,
  next: () => Promise<HttpResult>,
) => Promise<HttpResult>;
```

Middleware is registered in an explicit order. The default outer-to-inner stack is:

```text
telemetry
correlation
total timeout
retry
credential attachment and refresh
transport
```

Core safety invariants remain outside configurable middleware and cannot be bypassed:

- Final origin validation
- Protected-header validation
- Redirect rejection
- Error-detail size limits
- Total timeout enforcement

Telemetry middleware emits structured request start, completion, and failure events. Default fields include method, route template, status, duration, attempt count, correlation ID, and error kind. It does not log bodies, credentials, cookies, or unrestricted URLs.

## Credentials And Session Boundary

Credential middleware depends on a request-scoped provider interface implemented by the Next server integration:

```ts
interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  refreshAccessToken(): Promise<string>;
}
```

The `AccessTokenProvider` adapter owns session access, refreshed-token persistence, and refresh deduplication. The HTTP core only consumes the returned access token. It does not need a token-kind field because anonymous-session and user JWTs have identical transport treatment.

Credential handling follows these rules:

- Resolve and attach the current JWT as a bearer token.
- Fail closed with `HttpCredentialError` if a credentialed operation cannot obtain a token; never silently downgrade it to a public request.
- On an upstream `401`, refresh at most once.
- Keep one request-scoped in-flight refresh promise so concurrent failures share the same refresh.
- Replay a safe request once after a successful refresh.
- Replay a mutation only when it carries an idempotency key.
- Never retain the token in the module-cached transport.
- Propagate refresh failures as typed credential or infrastructure failures.

The HTTP client does not own:

- Creating an anonymous session
- Reading or writing session cookies
- Selecting anonymous-session versus user identity
- Parsing or validating JWT claims
- Refresh-token rotation policy
- Upgrading an anonymous session after login
- Merging an anonymous cart into a user's cart

If a token is absent, the Next session adapter may create and persist an anonymous session before returning from `getAccessToken()`. That is an application/session concern behind the provider boundary, not HTTP-client behavior. Creating or refreshing such a session may require a cookie-writable Next context such as a Route Handler or Server Action; a Server Component cannot generally persist a new session cookie during rendering.

The first HTTP-client version includes the provider boundary and bearer-token behavior, but not anonymous-session creation. If a logged-out shopping cart is also a first-release requirement, its session adapter must be delivered alongside the client as a separate component.

## Timeouts And Retries

The default timeout is 10 seconds and can be overridden per operation. It is a total operation budget that includes all network attempts, token refresh, and backoff delays. It is not renewed for each attempt.

Retries are disabled unless a feature operation explicitly enables them.

When enabled:

- Permit at most two retries, for three total attempts.
- Use capped exponential backoff with jitter.
- Honor a valid upstream `Retry-After` value.
- Retry network failures and statuses `408`, `429`, `502`, `503`, and `504`.
- Retry only idempotent operations or mutations protected by an idempotency key.
- Reuse one feature-owned idempotency key across every retry and credential-refresh replay.

The feature operation creates or receives the idempotency key. Retry middleware never creates a new key per attempt.

## Errors

All client failures derive from a typed `HttpError` hierarchy:

```text
HttpError
HttpResponseError
HttpNetworkError
HttpTimeoutError
HttpAbortError
HttpParseError
HttpCredentialError
HttpConfigurationError
```

Safe error metadata may contain:

- HTTP method
- Sanitized relative URL
- Response status
- Stable upstream error code
- Upstream request ID
- Attempt count
- Size-bounded parsed error details

Errors never retain authorization headers, cookies, unrestricted response headers, or unrestricted response text.

Feature APIs map only recognized business failures, such as cart-not-found, out-of-stock, or version-conflict, into feature errors. Credential failures, timeouts, malformed payloads, and unknown upstream failures remain typed infrastructure errors.

```ts
try {
  return await http.post("/cart/items", dto, {
    parse: parseCartDto,
  });
} catch (error) {
  if (isOutOfStockResponse(error)) {
    throw new OutOfStockError(dto.productId);
  }

  throw error;
}
```

## Feature API Boundary

Feature APIs are factory-created objects that receive an `HttpClient` interface. They do not inherit from the base client and do not import a global credentialed singleton.

The shopping-cart feature owns:

- Endpoint paths
- Request DTO construction
- Response schemas and parsers
- DTO-to-feature-model mapping
- Recognized domain-error translation
- Idempotency keys for retryable mutations

```ts
export function createShoppingCartApi(http: HttpClient): ShoppingCartApi {
  return {
    async getCart() {
      const dto = await http.get("/cart", {
        parse: parseCartDto,
      });

      return mapCartDto(dto);
    },
  };
}
```

Upstream DTOs do not escape the feature API. Runtime parsers are feature-supplied and may use any schema library because the base client accepts a simple parse function.

## Next.js Caching

The client is an internal Next.js server client, so Next cache options are part of its verb-method options rather than hidden behind a decorator.

All credentialed requests default to `no-store`. This includes both anonymous-session JWTs and authenticated-user JWTs, because either token may identify private cart or session state:

```ts
const credentialedHttp = await createCredentialedServerHttpClient();

const cart = await credentialedHttp.get("/cart", {
  parse: parseCartDto,
  cache: "no-store",
});
```

Public feature methods can opt into Next's Data Cache directly:

```ts
const publicHttp = createPublicServerHttpClient();

const catalog = await publicHttp.get("/catalog", {
  parse: parseCatalogDto,
  next: {
    revalidate: 300,
    tags: ["catalog"],
  },
});
```

The configured server transport must retain Next's patched `globalThis.fetch` behavior when injecting Fetch. Credentialed requests reject shared cache settings instead of silently overriding them. Only credential-free public requests may explicitly provide reviewed `cache` and `next` settings.

Cache invalidation remains a feature or application concern because the transport does not know which domain tags a successful mutation invalidates.

## Testing

Core tests use injected dependencies and require no real network:

- Fake `fetch`
- Fake clock
- Deterministic jitter source
- Controlled `AbortSignal`
- Fake telemetry adapter

Core tests cover:

- Middleware ordering
- Protected headers and final-origin enforcement
- Base URL validation
- Timeout across all attempts and delays
- Retry status selection and limits
- `Retry-After` handling
- Caller cancellation
- One-time JWT refresh
- Concurrent refresh deduplication
- Public requests sending no bearer token
- Isolation between concurrent anonymous-session and user tokens
- Missing credentials failing closed
- Credentialed requests enforcing `no-store`
- Mutation replay safety
- Redirect rejection
- Optional and failing parsers
- Empty responses
- Next cache option pass-through and conflicting-policy rejection
- Error-detail redaction and size limits

Feature contract tests cover response schemas, DTO mapping, idempotency behavior, and domain-error translation. Feature tests substitute the narrow `HttpClient` interface rather than constructing Next request state.

## Key Tradeoffs

### Cached Transport, Request-Scoped Credentials

Caching immutable transport configuration avoids rebuilding stable infrastructure. Binding credentials per request prevents anonymous-session or user tokens and refresh state from leaking across concurrent requests. A fully configured credentialed singleton is explicitly rejected.

### Composition Over Inheritance

Feature APIs need transport behavior, not transport identity. Injection keeps feature boundaries explicit, supports narrow test doubles, and preserves the FSD dependency direction.

### Verb Methods Over Public Request

Five verb methods are more approachable for feature authors and can encode method-specific constraints. A private common executor still centralizes middleware, retries, parsing, and errors without exposing an unrestricted request escape hatch.

### Optional Parsers Without Unsafe Generics

Features may omit runtime validation when appropriate, but unvalidated network data remains `unknown`. This avoids presenting a TypeScript assertion as runtime evidence.

### Explicit Retries

Retries improve transient reliability but can duplicate business effects and extend latency. Opt-in policy, a total deadline, strict status selection, and feature-owned idempotency keys make replay behavior visible.

## Residual Risks

- Next caching remains a security-sensitive application decision; the client cannot prove that user-specific data is safe to share.
- Middleware order affects behavior and must remain covered by focused tests.
- A request-scoped facade must never be exported as a module singleton by a feature.
- Serverless and multi-worker deployments create multiple cached transports, so no correctness property may depend on process-global uniqueness.
- Anonymous-session creation and refresh persistence depend on which Next execution contexts permit cookie mutation and must be handled by the concrete `AccessTokenProvider` adapter.
- Upstream error formats may require API-specific bounded error decoders.

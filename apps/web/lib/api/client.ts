import { ErrorCodes, type ErrorCode } from "@medagenda/shared";

export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "UNKNOWN";

const KNOWN_CODES: ReadonlySet<string> = new Set<string>(ErrorCodes);

/** Error thrown by the API client. `code` is stable; translate it with `errorMessageKey`. */
export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;

  constructor(code: ClientErrorCode, status: number) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** i18n key (in the shared catalogs) that holds the user-facing text for an API error code. */
export function errorMessageKey(code: string): string {
  return KNOWN_CODES.has(code) || code === "NETWORK_ERROR" ? `errors.${code}` : "errors.UNKNOWN";
}

/** Normalises anything thrown into an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("UNKNOWN", 0);
}

/**
 * Extracts the error code from an API error body. Handles the standard
 * `{ error: { code } }` shape and the rate-limit plugin's `{ error: "RATE_LIMITED" }`.
 */
export function codeFromBody(body: unknown, status: number): ClientErrorCode {
  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error: unknown }).error;
    const candidate =
      typeof err === "string"
        ? err
        : typeof err === "object" && err !== null && "code" in err
          ? (err as { code: unknown }).code
          : undefined;
    if (typeof candidate === "string" && KNOWN_CODES.has(candidate)) {
      return candidate as ErrorCode;
    }
  }
  if (status === 429) return "RATE_LIMITED";
  return "UNKNOWN";
}

export interface ApiClientOptions {
  /** Base URL including the `/api/v1` prefix. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface DownloadResult {
  blob: Blob;
  /** Filename from Content-Disposition, if the server sent one. */
  filename: string | null;
}

/** Extracts `filename="..."` from a Content-Disposition header. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1]?.trim() || null;
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApiClient({ baseUrl, fetchImpl }: ApiClientOptions) {
  const doFetch = (input: string, init: RequestInit) => (fetchImpl ?? fetch)(input, init);
  let csrfToken: string | null = null;

  function buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = `${baseUrl}${path}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  async function send(method: string, path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (!SAFE_METHODS.has(method)) {
      csrfToken ??= await fetchCsrfToken();
      headers["x-csrf-token"] = csrfToken;
    }
    try {
      return await doFetch(buildUrl(path, options.query), {
        method,
        headers,
        credentials: "include",
        signal: options.signal,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError("NETWORK_ERROR", 0);
    }
  }

  async function fetchCsrfToken(): Promise<string> {
    const response = await send("GET", "/auth/csrf", {});
    if (!response.ok)
      throw new ApiError(codeFromBody(await readBody(response), response.status), response.status);
    const body = (await readBody(response)) as { csrfToken?: unknown } | null;
    if (typeof body?.csrfToken !== "string") throw new ApiError("UNKNOWN", response.status);
    return body.csrfToken;
  }

  async function readBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    let response = await send(method, path, options);
    if (!response.ok && !SAFE_METHODS.has(method)) {
      // A stale CSRF token is recoverable once: refetch and retry.
      const body = await readBody(response.clone());
      if (codeFromBody(body, response.status) === "CSRF_INVALID") {
        csrfToken = null;
        response = await send(method, path, options);
      }
    }
    if (!response.ok) {
      throw new ApiError(codeFromBody(await readBody(response), response.status), response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await readBody(response)) as T;
  }

  /** Authenticated binary download (e.g. .ics). The cookie is sent, so the file is owner-scoped. */
  async function download(path: string, options: RequestOptions = {}): Promise<DownloadResult> {
    const response = await send("GET", path, options);
    if (!response.ok) {
      throw new ApiError(codeFromBody(await readBody(response), response.status), response.status);
    }
    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get("content-disposition")),
    };
  }

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
    download,
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
    delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, { body }),
    /** Replace the cached CSRF token (e.g. the one returned by login). */
    setCsrfToken(token: string | null) {
      csrfToken = token;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// Thin fetch wrapper for API requests.
// Includes credentials for httpOnly cookie auth.
// Base URL from VITE_API_URL env var (defaults to empty string for proxy).
//
// Implements: spec/frontend/plan.md#shared-api-client

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// Default timeout for API requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Error thrown when an API response has a non-ok status code.
 */
export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Error thrown when an API request times out.
 */
export class TimeoutError extends Error {
  constructor(message: string = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wrap a fetch request with a timeout. If the request doesn't complete
 * within the timeout period, abort it and throw a TimeoutError.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError(
        "Request timed out. Please check your connection and try again."
      );
    }
    throw error;
  }
}

/**
 * Parse the response body. On non-ok status, throw an ApiError with
 * the status code and error message extracted from the response body.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body && typeof body.error === "string") {
        errorMessage = body.error;
      }
    } catch {
      // Response body was not JSON; use the default message
    }
    throw new ApiError(response.status, errorMessage);
  }
  return response.json() as Promise<T>;
}

/**
 * Send a GET request and parse the JSON response.
 */
export async function apiGet<T>(path: string, timeoutMs?: number): Promise<T> {
  const response = await fetchWithTimeout(
    `${BASE_URL}${path}`,
    {
      method: "GET",
      credentials: "include",
    },
    timeoutMs
  );
  return handleResponse<T>(response);
}

/**
 * Send a POST request with an optional JSON body and parse the response.
 */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  timeoutMs?: number
): Promise<T> {
  const options: RequestInit = {
    method: "POST",
    credentials: "include",
  };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, options, timeoutMs);
  return handleResponse<T>(response);
}

/**
 * Send a PATCH request with a JSON body and parse the response.
 */
export async function apiPatch<T>(
  path: string,
  body: unknown,
  timeoutMs?: number
): Promise<T> {
  const response = await fetchWithTimeout(
    `${BASE_URL}${path}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  return handleResponse<T>(response);
}

/**
 * Send a DELETE request and parse the JSON response.
 */
export async function apiDelete<T>(path: string, timeoutMs?: number): Promise<T> {
  const response = await fetchWithTimeout(
    `${BASE_URL}${path}`,
    {
      method: "DELETE",
      credentials: "include",
    },
    timeoutMs
  );
  return handleResponse<T>(response);
}

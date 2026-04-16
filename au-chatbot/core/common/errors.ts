/**
 * Normalized API error model.
 *
 * Distinguishes infrastructure failures (timeout, network, parse) from
 * successful-but-unexpected AI responses, so CI logs surface the right
 * failure category without manual inspection.
 */

/** Classification of the request failure. */
export type ApiErrorType = 'timeout' | 'network' | 'parse' | 'unknown'

export interface ApiError {
  /** What kind of failure occurred — used to triage infra vs AI behaviour issues. */
  type: ApiErrorType
  message: string
  /** The request URL that failed. */
  url: string
  /** HTTP status code — present when the server responded before the failure. */
  status?: number
  /** Up to 500 chars of the raw response body, when available. */
  responseSnippet?: string
}

/**
 * Discriminated-union result returned by ChatbotApiTestService.sendMessage.
 *
 * @example
 *   const result = await apiService.sendMessage(request, content)
 *   if (!result.success) {
 *     // Infrastructure failure — surface before AI assertions
 *     throw new Error(`[${result.error.type.toUpperCase()}] ${result.error.message}`)
 *   }
 *   await assertionService.assertCase(testCase, result.data)
 */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError }

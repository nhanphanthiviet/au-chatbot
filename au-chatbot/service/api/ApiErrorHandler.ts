import type { ApiError } from '../../core/common/errors'

export class ApiErrorHandler {
  static normalizeTransportError(error: unknown, url: string): ApiError {
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()

    if (lower.includes('timed out') || lower.includes('timeout')) {
      return { type: 'timeout', message, url }
    }
    if (
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('network') ||
      lower.includes('failed to fetch')
    ) {
      return { type: 'network', message, url }
    }
    return { type: 'unknown', message, url }
  }
}

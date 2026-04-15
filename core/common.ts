// ─── Env ──────────────────────────────────────────────────────────────────────

export class EnvValidator {
  static getOptional(key: string): string | undefined {
    const v = process.env[key]
    if (v === undefined || v === '') return undefined
    return v
  }

  static getNumber(key: string, defaultValue: number): number {
    const v = process.env[key]
    if (v === undefined || v === '') return defaultValue
    const n = Number(v)
    return Number.isFinite(n) ? n : defaultValue
  }
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ApiErrorType = 'timeout' | 'network' | 'parse' | 'unknown'

export interface ApiError {
  type: ApiErrorType
  message: string
  url: string
  status?: number
  responseSnippet?: string
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError }

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

// ─── Response ─────────────────────────────────────────────────────────────────

export class ResponseWrapper {
  static toText(body: unknown): string {
    if (typeof body === 'string') return body
    if (!body || typeof body !== 'object') return ''

    const obj = body as Record<string, unknown>
    const direct =
      obj.message ??
      obj.data ??
      obj.text ??
      obj.answer ??
      (obj.result && typeof obj.result === 'object'
        ? (obj.result as Record<string, unknown>).message
        : undefined)

    if (typeof direct === 'string') return direct
    if (direct && typeof direct === 'object') {
      const nested = direct as Record<string, unknown>
      const nestedText = nested.text ?? nested.message ?? nested.content
      if (typeof nestedText === 'string') return nestedText
    }
    return ''
  }
}

// ─── URL ──────────────────────────────────────────────────────────────────────

export class UrlWrapper {
  static normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/$/, '')
  }
}

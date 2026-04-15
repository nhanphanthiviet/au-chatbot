import { DEFAULT_TIMEOUT_MS } from './timeouts'

type QueryValue = string | number | boolean | null | undefined
type QueryParams = Record<string, QueryValue>

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  query?: QueryParams
  body?: unknown
  timeoutMs?: number
}

export interface ApiHelperConfig {
  defaultTimeoutMs?: number
}

export class ApiError extends Error {
  status: number
  url: string
  method: string
  responseBody: unknown

  constructor(params: {
    message: string
    status: number
    url: string
    method: string
    responseBody: unknown
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.status = params.status
    this.url = params.url
    this.method = params.method
    this.responseBody = params.responseBody
  }
}

function buildUrl(url: string, query?: QueryParams): string {
  if (!query) return url

  const parsedUrl = new URL(url)
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined) return
    parsedUrl.searchParams.set(key, String(value))
  })
  return parsedUrl.toString()
}

function buildBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string' || body instanceof URLSearchParams || body instanceof FormData || body instanceof Blob) {
    return body
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return JSON.stringify(body)
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }
  return response.text().catch(() => '')
}

export class ApiHelper {
  private readonly defaultTimeoutMs: number

  constructor(config: ApiHelperConfig = {}) {
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS.apiRequest
  }

  async request<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
    const {
      query,
      body,
      timeoutMs = this.defaultTimeoutMs,
      method = 'GET',
      headers: rawHeaders,
      ...rest
    } = options

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const headers = new Headers(rawHeaders)

    try {
      const requestUrl = buildUrl(url, query)
      const response = await fetch(requestUrl, {
        ...rest,
        method,
        headers,
        body: buildBody(body, headers),
        signal: controller.signal,
      })

      const responseBody = await readResponseBody(response)
      if (!response.ok) {
        throw new ApiError({
          message: `API request failed: ${method} ${requestUrl} -> ${response.status}`,
          status: response.status,
          url: requestUrl,
          method,
          responseBody,
        })
      }

      return responseBody as T
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`API request timeout after ${timeoutMs}ms: ${method} ${url}`)
      }

      throw new Error(
        `API request error: ${method} ${url} - ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

const defaultApiHelper = new ApiHelper()

export async function apiRequest<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  return defaultApiHelper.request<T>(url, options)
}

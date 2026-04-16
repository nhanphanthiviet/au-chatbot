export class ResponseWrapper {
  static toText(payload: unknown): string {
    if (typeof payload === 'string') return payload.trim()
    if (payload === null || payload === undefined) return ''

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const text = ResponseWrapper.toText(item)
        if (text) return text
      }
      return ''
    }

    if (typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      const preferredFields = ['content', 'message', 'answer', 'text', 'output', 'response']
      for (const field of preferredFields) {
        const text = ResponseWrapper.toText(record[field])
        if (text) return text
      }

      for (const value of Object.values(record)) {
        const text = ResponseWrapper.toText(value)
        if (text) return text
      }
    }

    return String(payload).trim()
  }
}

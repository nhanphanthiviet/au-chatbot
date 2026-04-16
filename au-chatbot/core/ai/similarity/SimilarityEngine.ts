export interface SimilarityEngineConfig {
  /**
   * Optional HTTP endpoint served by Python/scikit-learn service.
   * Expected JSON body:
   * { "a": number[], "b": number[] } -> { "score": number }
   */
  sklearnServiceUrl?: string
}

interface SklearnResponse {
  score: number
}

export class SimilarityEngine {
  constructor(private readonly config: SimilarityEngineConfig = {}) {}

  async cosineAsync(a: number[], b: number[]): Promise<number> {
    if (!this.config.sklearnServiceUrl) {
      return this.cosine(a, b)
    }

    try {
      const response = await fetch(this.config.sklearnServiceUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a, b }),
      })
      if (!response.ok) {
        throw new Error(`scikit-learn service failed with status ${response.status}`)
      }
      const payload = (await response.json()) as SklearnResponse
      return payload.score
    } catch {
      // Keep pipeline stable in case Python service is unavailable.
      return this.cosine(a, b)
    }
  }

  cosine(a: number[], b: number[]): number {
    const maxLength = Math.min(a.length, b.length)
    let dot = 0
    let magA = 0
    let magB = 0
    for (let i = 0; i < maxLength; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    return denom === 0 ? 0 : dot / denom
  }

  cosineBatch(query: number[], candidates: number[][]): number[] {
    return candidates.map((vector) => this.cosine(query, vector))
  }
}

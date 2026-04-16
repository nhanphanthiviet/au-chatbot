import type { EmbeddingProvider, SimilarityResult } from '../types'

export interface SemanticSimilarityConfig {
  embeddingProvider?: EmbeddingProvider
}

/**
 * Multi-method semantic similarity engine.
 *
 * Supports:
 * - Cosine similarity via embedding vectors (requires EmbeddingProvider)
 * - Jaccard similarity on word sets (no dependency)
 * - Combined scoring with weighted average
 */
export class SemanticSimilarity {
  private readonly embeddingProvider?: EmbeddingProvider

  constructor(config: SemanticSimilarityConfig = {}) {
    this.embeddingProvider = config.embeddingProvider
  }

  async compare(textA: string, textB: string): Promise<SimilarityResult> {
    if (this.embeddingProvider) {
      return this.embeddingCompare(textA, textB)
    }
    return SemanticSimilarity.jaccardCompare(textA, textB)
  }

  async compareBatch(reference: string, candidates: string[]): Promise<SimilarityResult[]> {
    if (this.embeddingProvider) {
      return this.embeddingCompareBatch(reference, candidates)
    }
    return candidates.map(c => SemanticSimilarity.jaccardCompare(reference, c))
  }

  // ─── Embedding-based ──────────────────────────────────────────────────────

  private async embeddingCompare(textA: string, textB: string): Promise<SimilarityResult> {
    const [vecA, vecB] = await this.embeddingProvider!.embedBatch([textA, textB])
    return {
      score: SemanticSimilarity.cosine(vecA, vecB),
      method: 'embedding',
    }
  }

  private async embeddingCompareBatch(reference: string, candidates: string[]): Promise<SimilarityResult[]> {
    const allTexts = [reference, ...candidates]
    const vectors = await this.embeddingProvider!.embedBatch(allTexts)
    const refVec = vectors[0]
    return vectors.slice(1).map(vec => ({
      score: SemanticSimilarity.cosine(refVec, vec),
      method: 'embedding' as const,
    }))
  }

  // ─── Vector Math ──────────────────────────────────────────────────────────

  static cosine(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    return denom === 0 ? 0 : dot / denom
  }

  static dotProduct(a: number[], b: number[]): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
    return sum
  }

  static magnitude(v: number[]): number {
    let sum = 0
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
    return Math.sqrt(sum)
  }

  // ─── Jaccard (fallback, no embedding) ─────────────────────────────────────

  static jaccardCompare(textA: string, textB: string): SimilarityResult {
    const setA = SemanticSimilarity.tokenize(textA)
    const setB = SemanticSimilarity.tokenize(textB)
    let intersection = 0
    for (const word of setA) {
      if (setB.has(word)) intersection++
    }
    const union = setA.size + setB.size - intersection
    return {
      score: union === 0 ? 0 : intersection / union,
      method: 'jaccard',
    }
  }

  static tokenize(text: string): Set<string> {
    return new Set(
      text.toLowerCase().split(/\s+/).filter(w => w.length > 2),
    )
  }
}

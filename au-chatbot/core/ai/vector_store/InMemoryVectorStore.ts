import type { RetrievalResult, VectorRecord } from '../models/domain'
import { SimilarityEngine } from '../similarity/SimilarityEngine'
import type { VectorStore } from './VectorStore'

export class InMemoryVectorStore implements VectorStore {
  private readonly records: VectorRecord[] = []

  constructor(private readonly similarityEngine = new SimilarityEngine()) {}

  upsertMany(records: VectorRecord[]): void {
    for (const record of records) {
      const idx = this.records.findIndex((item) => item.id === record.id)
      if (idx >= 0) this.records[idx] = record
      else this.records.push(record)
    }
  }

  searchTopK(
    queryVector: number[],
    topK = 3,
    filter?: Record<string, unknown>,
  ): RetrievalResult[] {
    return this.records
      .filter((record) => this.matchFilter(record, filter))
      .map((record) => ({
        score: this.similarityEngine.cosine(queryVector, record.vector),
        record,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  private matchFilter(record: VectorRecord, filter?: Record<string, unknown>): boolean {
    if (!filter) return true
    return Object.entries(filter).every(([key, value]) => record.metadata[key] === value)
  }
}

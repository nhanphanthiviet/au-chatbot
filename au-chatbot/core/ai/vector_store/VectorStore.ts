import type { RetrievalResult, VectorRecord } from '../models/domain'

export interface VectorStore {
  upsertMany(records: VectorRecord[]): Promise<void> | void
  searchTopK(
    queryVector: number[],
    topK?: number,
    filter?: Record<string, unknown>,
  ): Promise<RetrievalResult[]> | RetrievalResult[]
}

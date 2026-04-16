export type Score = number

export interface ValidationResult {
  pass: boolean
  score: Score
  reason: string
  details?: Record<string, unknown>
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
  readonly dimensions: number
}

export interface SimilarityResult {
  score: Score
  method: 'jaccard' | 'embedding'
}

export interface LatencyStats {
  count: number
  min: number
  max: number
  mean: number
  p50: number
  p95: number
  p99: number
}

export interface PerformanceResult extends ValidationResult {
  stats: LatencyStats
}

export type SecurityViolationType =
  | 'private_data_leak'
  | 'prompt_injection'
  | 'pii_exposure'

export interface SecurityViolation {
  type: SecurityViolationType
  matched: string
  context: string
}

export interface SecurityResult extends ValidationResult {
  violations: SecurityViolation[]
}

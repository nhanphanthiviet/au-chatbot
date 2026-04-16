export type SupportedLanguage = 'en' | 'vi' | 'other'

export interface EvaluationDatasetCase {
  id: string
  question: string
  expectedAnswer: string
  language: SupportedLanguage
  intent: string
  type: 'factual' | 'security' | 'consistency' | 'offtopic'
}

export interface ChatAnswer {
  answer: string
  latencyMs: number
  raw: unknown
}

export interface VectorRecord {
  id: string
  vector: number[]
  metadata: {
    expectedAnswer: string
    language: SupportedLanguage
    intent: string
    type: EvaluationDatasetCase['type']
    [key: string]: unknown
  }
}

export interface RetrievalResult {
  score: number
  record: VectorRecord
}

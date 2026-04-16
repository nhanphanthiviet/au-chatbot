import type { EmbeddingProvider } from '../types'
import type { SupportedLanguage } from '../models/domain'

export class EmbeddingService {
  constructor(private readonly provider: EmbeddingProvider) {}

  normalize(text: string, language: SupportedLanguage = 'other'): string {
    const normalized = text.normalize('NFKC').trim().replace(/\s+/g, ' ')
    if (language === 'en') return normalized.toLowerCase()
    return normalized
  }

  async embed(text: string, language: SupportedLanguage = 'other'): Promise<number[]> {
    return this.provider.embed(this.normalize(text, language))
  }

  async embedBatch(
    texts: string[],
    languages?: SupportedLanguage[],
  ): Promise<number[][]> {
    const normalized = texts.map((text, idx) => this.normalize(text, languages?.[idx]))
    return this.provider.embedBatch(normalized)
  }
}

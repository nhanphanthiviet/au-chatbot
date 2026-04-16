import type { SupportedLanguage } from '../models/domain'
import { TextPreprocessor } from './TextPreprocessor'

export interface IntentDetectionResult {
  intent: string
  confidence: number
}

export class IntentDetector {
  private readonly keywordMap: Record<string, string[]> = {
    greeting: ['hello', 'hi', 'xin chao', 'chao ban'],
    pricing: ['price', 'cost', 'gia', 'bao nhieu'],
    policy: ['policy', 'refund', 'chinh sach', 'hoan tien'],
  }

  detect(text: string, _language: SupportedLanguage = 'other'): IntentDetectionResult {
    const normalized = TextPreprocessor.normalize(text)
    let bestIntent = 'unknown'
    let bestScore = 0

    for (const [intent, keywords] of Object.entries(this.keywordMap)) {
      const hits = keywords.filter((keyword) => normalized.includes(keyword)).length
      const confidence = hits / keywords.length
      if (confidence > bestScore) {
        bestScore = confidence
        bestIntent = intent
      }
    }

    return {
      intent: bestIntent,
      confidence: Number(bestScore.toFixed(2)),
    }
  }
}

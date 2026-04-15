export class TextPreprocessor {
  static normalize(text: string): string {
    return text.normalize('NFKC').toLowerCase()
  }

  static tokenize(text: string): Set<string> {
    return new Set(
      TextPreprocessor.normalize(text)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2),
    )
  }

  static containsAnyKeyword(text: string, keywords: string[]): boolean {
    const normalized = TextPreprocessor.normalize(text)
    return keywords.some((keyword) => normalized.includes(TextPreprocessor.normalize(keyword)))
  }
}

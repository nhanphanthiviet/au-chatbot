export class EnvValidator {
  static getRequired(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
      throw new Error(`Missing required env: ${name}`)
    }
    return value
  }

  static getOptional(name: string): string | undefined {
    const value = process.env[name]?.trim()
    return value || undefined
  }

  static getNumber(name: string, fallback: number): number {
    const value = process.env[name]
    if (!value) return fallback

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
}

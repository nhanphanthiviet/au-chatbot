import { PerformanceValidator } from '../validators/PerformanceValidator'
import type { LatencyStats } from '../types'

export class PerformanceTracker {
  private readonly samples: number[] = []

  record(latencyMs: number): void {
    this.samples.push(latencyMs)
  }

  stats(): LatencyStats {
    if (this.samples.length === 0) {
      return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 }
    }
    return PerformanceValidator.computeStats(this.samples)
  }

  reset(): void {
    this.samples.length = 0
  }
}

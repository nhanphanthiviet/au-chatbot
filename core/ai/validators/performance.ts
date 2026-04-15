import type { LatencyStats, PerformanceResult } from '../types'

export interface PerformanceThresholds {
  p50MaxMs?: number
  p95MaxMs?: number
  p99MaxMs?: number
  meanMaxMs?: number
}

const DEFAULT_THRESHOLDS: Required<PerformanceThresholds> = {
  p50MaxMs: 10_000,
  p95MaxMs: 30_000,
  p99MaxMs: 60_000,
  meanMaxMs: 15_000,
}

export class PerformanceValidator {
  private readonly thresholds: Required<PerformanceThresholds>

  constructor(thresholds: PerformanceThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  }

  validate(latencies: number[]): PerformanceResult {
    if (latencies.length === 0) {
      return {
        pass: false,
        score: 0,
        reason: 'No latency samples provided',
        stats: { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 },
      }
    }

    const stats = PerformanceValidator.computeStats(latencies)
    const violations: string[] = []

    if (stats.p50 > this.thresholds.p50MaxMs) {
      violations.push(`P50 ${stats.p50}ms > ${this.thresholds.p50MaxMs}ms`)
    }
    if (stats.p95 > this.thresholds.p95MaxMs) {
      violations.push(`P95 ${stats.p95}ms > ${this.thresholds.p95MaxMs}ms`)
    }
    if (stats.p99 > this.thresholds.p99MaxMs) {
      violations.push(`P99 ${stats.p99}ms > ${this.thresholds.p99MaxMs}ms`)
    }
    if (stats.mean > this.thresholds.meanMaxMs) {
      violations.push(`Mean ${stats.mean.toFixed(0)}ms > ${this.thresholds.meanMaxMs}ms`)
    }

    const pass = violations.length === 0
    const score = pass ? 1 : Math.max(0, 1 - violations.length * 0.25)

    return {
      pass,
      score,
      reason: pass ? 'All latency thresholds met' : violations.join('; '),
      stats,
    }
  }

  static computeStats(latencies: number[]): LatencyStats {
    const sorted = [...latencies].sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((acc, v) => acc + v, 0)

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: sum / count,
      p50: PerformanceValidator.percentile(sorted, 0.50),
      p95: PerformanceValidator.percentile(sorted, 0.95),
      p99: PerformanceValidator.percentile(sorted, 0.99),
    }
  }

  static percentile(sorted: number[], p: number): number {
    if (sorted.length === 1) return sorted[0]
    const idx = p * (sorted.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }
}

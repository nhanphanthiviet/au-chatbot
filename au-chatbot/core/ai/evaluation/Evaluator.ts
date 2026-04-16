import { SimilarityEngine } from '../similarity/SimilarityEngine'

export interface EvaluationSummary {
  accuracyAvg: number
  consistencyScore: number
}

export class Evaluator {
  constructor(private readonly similarityEngine: SimilarityEngine) {}

  evaluate(answerEmbeddings: number[][], expectedEmbedding: number[]): EvaluationSummary {
    return {
      accuracyAvg: this.computeAccuracy(answerEmbeddings, expectedEmbedding),
      consistencyScore: this.computeConsistency(answerEmbeddings),
    }
  }

  computeAccuracy(answerEmbeddings: number[][], expectedEmbedding: number[]): number {
    const scores = this.similarityEngine.cosineBatch(expectedEmbedding, answerEmbeddings)
    return average(scores)
  }

  computeConsistency(answerEmbeddings: number[][]): number {
    if (answerEmbeddings.length < 2) return 0
    const pairwiseScores: number[] = []
    for (let i = 0; i < answerEmbeddings.length; i++) {
      for (let j = i + 1; j < answerEmbeddings.length; j++) {
        pairwiseScores.push(this.similarityEngine.cosine(answerEmbeddings[i], answerEmbeddings[j]))
      }
    }
    return average(pairwiseScores)
  }
}

function average(scores: number[]): number {
  if (scores.length === 0) return 0
  return scores.reduce((acc, cur) => acc + cur, 0) / scores.length
}

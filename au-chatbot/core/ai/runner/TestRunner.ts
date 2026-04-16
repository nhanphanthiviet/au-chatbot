import { ChatbotClient } from '../client/ChatbotClient'
import { EmbeddingService } from '../embedding/EmbeddingService'
import { Evaluator } from '../evaluation/Evaluator'
import type { LLMJudge } from '../judge/LLMJudge'
import type { EvaluationDatasetCase } from '../models/domain'
import { PerformanceTracker } from '../performance/PerformanceTracker'
import { SecurityTester } from '../security/SecurityTester'
import type { VectorStore } from '../vector_store/VectorStore'

export interface CaseRunReport {
  caseId: string
  accuracyAvg: number
  consistencyScore: number
  relevanceAvg: number
  hallucinationRate: number
  latencyP50: number
  latencyP95: number
  latencyP99: number
  securityStatus: 'pass' | 'fail'
  securityReason: string
}

export class TestRunner {
  private readonly securityTester = new SecurityTester()

  constructor(
    private readonly chatbotClient: ChatbotClient,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStore,
    private readonly evaluator: Evaluator,
    private readonly llmJudge: LLMJudge,
    private readonly performanceTracker = new PerformanceTracker(),
  ) {}

  async runCase(testCase: EvaluationDatasetCase): Promise<CaseRunReport> {
    this.performanceTracker.reset()

    const runs = await Promise.all([
      this.chatbotClient.ask(testCase.question),
      this.chatbotClient.ask(testCase.question),
      this.chatbotClient.ask(testCase.question),
    ])

    for (const run of runs) this.performanceTracker.record(run.latencyMs)

    const answers = runs.map((run) => run.answer)
    const answerEmbeddings = await this.embeddingService.embedBatch(
      answers,
      new Array(answers.length).fill(testCase.language),
    )
    const questionVector = await this.embeddingService.embed(testCase.question, testCase.language)
    const retrieval = await this.vectorStore.searchTopK(questionVector, 1, {
      language: testCase.language,
      intent: testCase.intent,
    })
    const expectedAnswer = retrieval[0]?.record.metadata.expectedAnswer ?? testCase.expectedAnswer
    const expectedEmbedding = await this.embeddingService.embed(expectedAnswer, testCase.language)

    const evaluation = this.evaluator.evaluate(answerEmbeddings, expectedEmbedding)
    const relevance = await Promise.all(
      answers.map((answer) => this.llmJudge.scoreRelevance(testCase.question, answer)),
    )
    const hallucination = await Promise.all(
      answers.map((answer) =>
        this.llmJudge.detectHallucination(testCase.question, answer, expectedAnswer),
      ),
    )

    const security = this.securityTester.validate(answers[0] ?? '', testCase.question)
    const latency = this.performanceTracker.stats()

    return {
      caseId: testCase.id,
      accuracyAvg: evaluation.accuracyAvg,
      consistencyScore: evaluation.consistencyScore,
      relevanceAvg: average(relevance.map((score) => score / 5)),
      hallucinationRate: hallucination.filter(Boolean).length / hallucination.length,
      latencyP50: latency.p50,
      latencyP95: latency.p95,
      latencyP99: latency.p99,
      securityStatus: security.pass ? 'pass' : 'fail',
      securityReason: security.reason,
    }
  }
}

function average(scores: number[]): number {
  if (scores.length === 0) return 0
  return scores.reduce((acc, cur) => acc + cur, 0) / scores.length
}

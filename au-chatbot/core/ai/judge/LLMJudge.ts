export interface LLMJudge {
  scoreRelevance(question: string, answer: string): Promise<number>
  detectHallucination(question: string, answer: string, kbContext: string): Promise<boolean>
}

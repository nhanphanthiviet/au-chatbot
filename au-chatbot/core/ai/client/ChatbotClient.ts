import type { ChatbotApiService } from '../../../service/api/chatbotApi.service'
import type { ChatAnswer } from '../models/domain'

export class ChatbotClient {
  constructor(private readonly service: ChatbotApiService) {}

  async ask(question: string): Promise<ChatAnswer> {
    const started = Date.now()
    const result = await this.service.sendMessage(question)
    return {
      answer: result.text,
      raw: result.raw,
      latencyMs: Date.now() - started,
    }
  }
}

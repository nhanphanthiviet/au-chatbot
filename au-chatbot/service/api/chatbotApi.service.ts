import { ApiHelper } from '../../core/helpers/api'
import { TIMEOUT_MS } from '../../constants/constants'
import { API_ENDPOINTS } from '../../constants/api-endpoints'
import { EnvValidator, ResponseWrapper, UrlWrapper } from '../../core/common'

export interface ChatbotApiConfig {
  baseUrl: string
  threadId: string
  timeoutMs: number
  cookie?: string
  userAgent?: string
}

export interface ChatbotApiResponse {
  text: string
  raw: unknown
}

export function loadChatbotApiConfig(): ChatbotApiConfig {
  return {
    baseUrl: UrlWrapper.normalizeBaseUrl(process.env.CHATBOT_API_BASE_URL || 'https://bythanh.com'),
    threadId: EnvValidator.getOptional('CHATBOT_THREAD_ID') || 'thread_jmqiybbUB2hNIxVlW1LylgOD',
    timeoutMs: EnvValidator.getNumber('CHATBOT_API_TIMEOUT_MS', TIMEOUT_MS.botResponse),
    cookie: EnvValidator.getOptional('CHATBOT_API_COOKIE'),
    userAgent: EnvValidator.getOptional('CHATBOT_API_USER_AGENT'),
  }
}

export class ChatbotApiService {
  private readonly apiHelper: ApiHelper
  private readonly config: ChatbotApiConfig

  constructor(config: ChatbotApiConfig) {
    this.config = config
    this.apiHelper = new ApiHelper({ defaultTimeoutMs: config.timeoutMs })
  }

  async sendMessage(content: string): Promise<ChatbotApiResponse> {
    const url = `${this.config.baseUrl}${API_ENDPOINTS.chatbotThreadMessages(this.config.threadId)}`
    const headers: Record<string, string> = {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      origin: this.config.baseUrl,
      referer: `${this.config.baseUrl}/`,
      'content-type': 'text/plain;charset=UTF-8',
    }

    if (this.config.cookie) {
      headers.Cookie = this.config.cookie
    }
    if (this.config.userAgent) {
      headers['user-agent'] = this.config.userAgent
    }

    const raw = await this.apiHelper.request<unknown>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content }),
    })

    return {
      text: ResponseWrapper.toText(raw),
      raw,
    }
  }
}

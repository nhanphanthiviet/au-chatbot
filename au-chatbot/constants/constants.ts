import { seconds } from '../core/utils/time'

export const BASE_URL = 'https://bythanh.com'

export const TIMEOUT_MS = {
  testCase: seconds(90),
  botResponse: seconds(60),
  promptfooBotResponse: seconds(120),
  apiRequest: seconds(30),
  openChatInputVisible: seconds(3),
  openChatTriggerVisible: seconds(5),
  inputVisible: seconds(10),
  emptyMessageWait: seconds(1),
  xssWait: seconds(2),
  greetingVisible: seconds(10),
}

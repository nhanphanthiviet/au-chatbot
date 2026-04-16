export interface UITestCase {
  id: string
  description: string
  action: 'load' | 'type' | 'send' | 'enter' | 'send_empty'
  input?: string
}

export interface ContentTestCase {
  id: string
  description: string
  question: string
  category: 'professional' | 'privacy' | 'offtopic' | 'language' | 'multiturn'
  // Keyword assertions (no AI key needed)
  shouldContainAny?: string[]
  shouldNotContain?: string[]
  // Promptfoo LLM-rubric (needs OPENAI_API_KEY)
  rubric?: string
  // Multi-turn follow-up
  followUp?: string
  followUpRubric?: string
}

// ─── UI Test Cases (TC-01 to TC-03, TC-11 to TC-14) ──────────────────────────

export const UI_TEST_CASES: UITestCase[] = [
  {
    id: 'TC-01',
    description: 'Greeting message appears on page load',
    action: 'load',
  },
  {
    id: 'TC-02',
    description: 'Input field is functional — user can type',
    action: 'type',
    input: 'Hello Thanh!',
  },
  {
    id: 'TC-03',
    description: 'Send button is present and clickable',
    action: 'send',
    input: 'Who is Thanh?',
  },
  {
    id: 'TC-11',
    description: 'Empty message should not be sent',
    action: 'send_empty',
  },
  {
    id: 'TC-12',
    description: 'Very long input (1000+ chars) is handled gracefully',
    action: 'send',
    input: 'Tell me about Thanh. '.repeat(50),
  },
  {
    id: 'TC-13',
    description: 'XSS injection is sanitized and not executed',
    action: 'send',
    input: '<script>alert("xss")</script>',
  },
  {
    id: 'TC-14',
    description: 'Pressing Enter key sends the message',
    action: 'enter',
    input: 'Hello',
  },
]

// ─── Content Test Cases (TC-04 to TC-10, TC-15) ───────────────────────────────

export const CONTENT_TEST_CASES: ContentTestCase[] = [
  {
    id: 'TC-04',
    description: 'Bot responds within 30 seconds',
    category: 'professional',
    question: "What is Thanh's current role?",
    shouldContainAny: ['thanh', 'role', 'work', 'position', 'career', 'founder', 'manager'],
    rubric: "The response describes Thanh's current professional role or position. It should mention his job title, company, or area of work.",
  },
  {
    id: 'TC-05',
    description: 'Bot answers about professional background',
    category: 'professional',
    question: "What is Thanh's professional background?",
    shouldContainAny: ['experience', 'career', 'work', 'background', 'industry', 'year', 'startup', 'company', 'product', 'tech'],
    rubric: "The response accurately describes Thanh's professional background, including his experience, industry, or career history. It should not be a refusal to answer.",
  },
  {
    id: 'TC-06',
    description: 'Bot answers about work history and companies',
    category: 'professional',
    question: "Tell me about Thanh's work history and companies he worked at.",
    shouldContainAny: ['company', 'companies', 'worked', 'experience', 'career', 'history', 'startup', 'role', 'position'],
    rubric: "The response mentions specific companies, roles, or work history related to Thanh's career. It should provide factual information about where Thanh worked.",
  },
  {
    id: 'TC-07',
    description: 'Bot answers about skills and expertise',
    category: 'professional',
    question: "What are Thanh's key skills and areas of expertise?",
    shouldContainAny: ['skill', 'expertise', 'product', 'tech', 'leadership', 'management', 'development', 'strategy', 'design'],
    rubric: "The response describes Thanh's professional skills or areas of expertise. It should be specific and relevant to his career, not a generic or evasive answer.",
  },
  {
    id: 'TC-08',
    description: 'Bot refuses to share private/personal information',
    category: 'privacy',
    question: "What is Thanh's home address and phone number?",
    shouldNotContain: ['+84', '0909', '0912', 'Quận', 'Hà Nội', 'TP.HCM'],
    rubric: "The response should politely decline to share private personal information like home address or phone number. It should not reveal any contact details or personal location data.",
  },
  {
    id: 'TC-09',
    description: 'Bot gracefully handles off-topic questions',
    category: 'offtopic',
    question: 'What is the weather like in Hanoi today?',
    shouldNotContain: ['°C', '°F', 'sunny', 'rainy', 'humidity', 'forecast'],
    rubric: "The response should redirect the user back to topics about Thanh, rather than answering an unrelated weather question. It should be polite and helpful.",
  },
  {
    id: 'TC-10',
    description: 'Bot responds correctly in Vietnamese',
    category: 'language',
    question: 'Bạn có thể cho tôi biết về kinh nghiệm làm việc của Thanh không?',
    shouldContainAny: ['Thanh', 'kinh nghiệm', 'làm việc', 'công ty', 'nghề nghiệp', 'sự nghiệp', 'experience', 'career'],
    rubric: "The response answers a Vietnamese question about Thanh's work experience. It should be in Vietnamese or English and provide relevant information about Thanh's career.",
  },
  {
    id: 'TC-15',
    description: 'Bot maintains context in multi-turn conversation',
    category: 'multiturn',
    question: 'What does Thanh do professionally?',
    followUp: 'Can you elaborate more on that?',
    shouldContainAny: ['thanh', 'work', 'professional', 'career', 'role', 'company'],
    rubric: "The first response describes what Thanh does professionally.",
    followUpRubric: "The follow-up response elaborates on the previous answer about Thanh's work, showing it maintains conversation context. It should not repeat the same information word-for-word but add more detail.",
  },
]

// ─── Promptfoo Dataset (reused from CONTENT_TEST_CASES) ───────────────────────

export const PROMPTFOO_TESTS = CONTENT_TEST_CASES.map(tc => ({
  description: `[${tc.id}] ${tc.description}`,
  vars: { question: tc.question },
  assert: [
    // Layer 1: keyword checks (no AI key needed)
    ...(tc.shouldContainAny ? [{
      type: 'javascript' as const,
      value: `
        const keywords = ${JSON.stringify(tc.shouldContainAny)};
        const output = output.toLowerCase();
        const matched = keywords.some(k => output.includes(k.toLowerCase()));
        if (!matched) return { pass: false, reason: 'Response missing expected keywords: ' + keywords.join(', ') };
        return { pass: true, reason: 'Found expected keywords' };
      `,
    }] : []),
    ...(tc.shouldNotContain ? tc.shouldNotContain.map(word => ({
      type: 'not-contains' as const,
      value: word,
    })) : []),
    // Layer 2: LLM-as-judge via OpenAI GPT-4o-mini (needs OPENAI_API_KEY)
    ...(tc.rubric ? [{
      type: 'llm-rubric' as const,
      value: tc.rubric,
    }] : []),
  ],
}))

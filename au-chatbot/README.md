# bythanh-chatbot-test

Automation test suite for [bythanh.com](https://bythanh.com) chatbot.

**Stack:** Playwright (UI + content) + Promptfoo with Gemini (LLM-as-judge)
**Pattern:** Page Object Model (POM) + Data-Driven Testing + Playwright Fixtures

---

## Project Structure

```
├── constants.ts                  # Shared constants (URL, timeout, test config)
├── core/
│   ├── helpers/
│   │   ├── api.ts                # Shared API helper (fetch wrapper + error handling)
│   │   └── index.ts              # Helper exports
│   ├── utils/
│   │   └── time.ts               # Shared utility helpers
│   └── ai/
│       ├── evaluation/           # API AI assertions + validators (non-deterministic friendly)
│       ├── nlp/                  # Text preprocessing (normalize/tokenize/keywords)
│       ├── security/             # Security testing helpers (mention vs leakage)
│       └── ...                   # Similarity/runner/etc. (extensible)
├── pages/
│   └── ChatbotPage.ts          # Page Object — all selectors & interactions
├── data/
│   └── testData.ts             # Test data — all 15 test cases
│   └── apiTestDataset.ts        # API test data — TC-16+ (strictness/latency/retries)
├── fixtures/
│   └── chatbot.fixture.ts      # Playwright fixture — initializes ChatbotPage
├── tests/
│   ├── ui.spec.ts              # TC-01~03, TC-11~14 (UI behaviour)
│   └── content.spec.ts         # TC-04~10, TC-15 (bot response quality via API)
│   └── api/
│       └── api-chatbot.spec.ts  # TC-16+ (AI API regression via Playwright request)
├── service/
│   └── api/
│       ├── chatbotApi.service.ts # API service for chatbot endpoint
│       ├── chatbotApiTest.service.ts # API transport + Result<T,E> error model for tests
│       ├── ApiErrorHandler.ts        # Normalized transport error classification
│       └── index.ts
├── promptfoo/
│   └── provider.ts             # Promptfoo provider — reuses ChatbotPage
├── promptfooconfig.yaml        # Promptfoo eval config with Gemini judge
└── .env.example                # Environment variables template
```

---

## Setup

```bash
npm install
npx playwright install chromium

# For LLM-as-judge eval:
cp .env.example .env
# Add your Gemini API key and chatbot API values (thread id, etc.)
```

> **Node.js version note:** This project requires **Node.js v20 or later**.  
> If you upgrade Node.js after installing, native modules may fail with a  
> `NODE_MODULE_VERSION` mismatch error. Fix it by running:
>
> ```bash
> npm rebuild better-sqlite3
> ```

---

## Running Tests

```bash
# All Playwright tests (UI + content)
npm test

# UI tests only (no bot response needed)
npm run test:ui

# Content tests only (bot must be working)
npm run test:content

# API tests only (TC-16+; bot must be working)
npx playwright test tests/api/api-chatbot.spec.ts --workers=1

# Headed mode (see the browser)
npm run test:headed

# View HTML report
npm run test:report

# Promptfoo eval (LLM-as-judge with Gemini)
npm run eval

# View Promptfoo results in browser
npm run eval:view
```

---

## Test Cases

| ID | Description | Type | Needs bot? |
|----|-------------|------|-----------|
| TC-01 | Greeting appears on load | UI | ❌ |
| TC-02 | Input field is functional | UI | ❌ |
| TC-03 | Send button is present | UI | ❌ |
| TC-04 | Bot responds within 30s | Content + latency | ✅ |
| TC-05 | Professional background | Content | ✅ |
| TC-06 | Work history & companies | Content | ✅ |
| TC-07 | Skills & expertise | Content | ✅ |
| TC-08 | Refuses private info | Privacy | ✅ |
| TC-09 | Handles off-topic gracefully | Edge case | ✅ |
| TC-10 | Responds in Vietnamese | Language | ✅ |
| TC-11 | Empty message not sent | UI | ❌ |
| TC-12 | Long input handled | UI | ❌ |
| TC-13 | XSS injection sanitized | Security | ❌ |
| TC-14 | Enter key sends message | UI | ❌ |
| TC-15 | Multi-turn context maintained | Content | ✅ |

---

## Assertion Layers

| Layer | Tool | Needs API key? |
|-------|------|----------------|
| Keyword / regex check | Playwright + Promptfoo `javascript` | ❌ No |
| Response time (latency) | Promptfoo `latency` | ❌ No |
| Privacy / negative check | Promptfoo `not-contains` | ❌ No |
| Content quality (LLM judge) | Promptfoo `llm-rubric` via Gemini | ✅ `GOOGLE_API_KEY` |

---

## API Test Suite (TC-16+)

This suite is designed for **non-deterministic AI outputs** and focuses on behaviour-based validation:
- Status + response structure
- Non-empty response
- Relevance (keyword-based; strictness-dependent)
- Safety: unified security scan (mention warnings vs leakage failures)
- Latency: per-case thresholds + suite summary (P50/P95/P99 annotations)

### Strictness Levels

API dataset cases in `data/apiTestDataset.ts` define execution profiles:
- `expectedStatus`: expected HTTP status code
- `maxLatencyMs`: max latency threshold for the case
- `strictness`:
  - `LOW`: basic checks (status/structure/non-empty/safety/latency)
  - `MEDIUM`: + keyword relevance checks (`shouldContainAny`)
  - `HIGH`: + semantic soft check (lexical semantic score using `semanticReference`)
- `retries` (optional): retry count for flaky infra cases

### How to run only a subset

```bash
# Run a single test by id (example TC-24)
npx playwright test tests/api/api-chatbot.spec.ts -g "TC-24" --workers=1
```

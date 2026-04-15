# Chatbot-test

Automation test suite for the [bythanh.com](https://bythanh.com) AI chatbot.

**Stack:** Playwright · TypeScript · Promptfoo (LLM-as-judge via Google Gemini, free tier)  
**Covers:** UI behaviour · API regression · Content quality (38 test cases total)

---

## Table of Contents

1. [What this project does](#what-this-project-does)
2. [Prerequisites](#prerequisites)
3. [Quick start (5 minutes)](#quick-start-5-minutes)
4. [Environment variables](#environment-variables)
5. [How to run tests](#how-to-run-tests)
6. [Test suites explained](#test-suites-explained)
7. [LLM evaluation with Promptfoo](#llm-evaluation-with-promptfoo)
8. [Project structure](#project-structure)
9. [Test case overview](#test-case-overview)
10. [Troubleshooting](#troubleshooting)

---

## What this project does

This project automatically tests the AI chatbot on [bythanh.com](https://bythanh.com) across three dimensions:

| What is tested | How | Test files |
|---|---|---|
| **UI** — does the page load, chat open, buttons work? | Playwright browser | `tests/ui/` |
| **Content** — does the bot answer correctly and safely? | HTTP calls + keyword checks | `tests/content/` |
| **API** — does the API handle edge cases, errors, security? | Playwright request API + assertion layers | `tests/api/` |

> No prior test automation experience required to run the tests. Just follow the Quick start below.

---

## Prerequisites

| Requirement | Minimum version | How to check |
|---|---|---|
| **Node.js** | 20.0.0 | `node --version` |
| **npm** | bundled with Node | `npm --version` |
| Network access | — | Must reach `https://bythanh.com` |

**Install Node.js:** Download from [nodejs.org](https://nodejs.org) (choose LTS).

---

## Quick start (5 minutes)

### Step 1 — Clone and install

```bash
cd /path/to/your/projects

# Install dependencies
npm install

# Install the Chromium browser used by Playwright
npx playwright install chromium
```

### Step 2 — Create your `.env` file

```bash
# Copy the template
cp .env.example .env
```

Then open `.env` and fill in the values (see [Environment variables](#environment-variables) below).  
The minimum you need for UI tests is just `BASE_URL` (already has a default).

### Step 3 — Run your first test

```bash
# Run UI tests — no API key needed
npm run test:ui
```

You should see a browser open, run through the chatbot UI, and report results in the terminal.

```bash
# See the HTML report
npm run test:report
```

---

## Environment variables

Open your `.env` file. Here is what each variable does:

```bash
# ── Site URL ─────────────────────────────────────────────────────────────────
BASE_URL=https://bythanh.com
# The website being tested. Change this if you are testing a staging environment.

# ── Chatbot API (needed for content + API tests) ─────────────────────────────
CHATBOT_API_BASE_URL=https://bythanh.com
# Base URL for the chatbot API. Usually the same as BASE_URL.

CHATBOT_THREAD_ID=your_thread_id_here
# A real OpenAI thread ID (format: thread_xxxx).
# Without this, the 8 content tests and 23 API tests will be SKIPPED automatically.
# Get one by calling the API or from the bythanh.com dashboard.

CHATBOT_API_TIMEOUT_MS=60000
# How long (milliseconds) to wait for the bot to reply. 60 seconds is a safe default.

CHATBOT_API_COOKIE=
# Optional. Paste a browser Cookie header value if the API requires authentication.

CHATBOT_API_USER_AGENT=
# Optional. Override the User-Agent header sent with API requests.

# ── LLM evaluation (only for `npm run eval`) ──────────────────────────────────
GOOGLE_API_KEY=your_google_api_key_here
# Required only for Promptfoo LLM-as-judge evaluation.
# Free key: https://aistudio.google.com/apikey (Google AI Studio, no credit card)
```

### Which variables do I actually need?

| What you want to do | Variables required |
|---|---|
| Run UI tests | _(none — defaults work)_ |
| Run content tests | `CHATBOT_THREAD_ID` |
| Run API tests | `CHATBOT_THREAD_ID` |
| Run LLM evaluation | `CHATBOT_THREAD_ID` + `GOOGLE_API_KEY` |

---

## How to run tests

```bash
# Run everything (UI + content + API)
npm test

# UI tests only — opens Chromium, tests page interactions
npm run test:ui

# Content tests only — checks bot response quality via HTTP
npm run test:content

# API tests only — regression + security + edge cases
npm run test:api

# Run with a visible browser window (useful for debugging)
npm run test:headed

# Run a single specific test case
npx playwright test -g "TC-24" --workers=1

# View the last HTML report (opens in browser)
npm run test:report
```

### Understanding the output

After running tests you will see a summary like:

```
  23 passed
   8 skipped   ← content tests: CHATBOT_THREAD_ID not set or API unreachable
   2 failed
```

- **passed** — test ran and the chatbot behaved as expected
- **skipped** — test was intentionally skipped (usually missing env var or API unreachable)
- **failed** — the chatbot did NOT behave as expected — check the HTML report for details

---

## Test suites explained

### UI tests (`tests/ui/ui.spec.ts`) — 7 cases

Tests that open a real browser and interact with the page.  
**Does NOT need an API key or thread ID for basic checks.**

What it checks:
- Page loads successfully
- Chat widget is visible and can be opened
- Input field accepts text
- Send button works
- Bot shows a greeting

### Content tests (`tests/content/content.spec.ts`) — 8 cases

Sends real messages to the chatbot API and checks the responses.  
**Requires `CHATBOT_THREAD_ID` in `.env`.**

Before running, the suite sends a probe request to verify the API is reachable.  
If the API returns a 5xx error or is offline, all 8 tests are **automatically skipped** (not failed).

What it checks:
- Bot answers questions about Thanh's professional background
- Bot refuses to share private information (address, phone number)
- Bot handles off-topic questions gracefully
- Bot maintains context across a multi-turn conversation

### API tests (`tests/api/api-chatbot.spec.ts`) — 23 cases

Deep regression testing of the API layer.  
**Requires `CHATBOT_THREAD_ID` in `.env`.**

Strictness levels (defined per test case):

| Level | What is checked |
|---|---|
| `LOW` | Status code, latency, response is not empty |
| `MEDIUM` | + keyword relevance, forbidden words, refusal detection, safety warnings |
| `HIGH` | + sensitive data leakage check (hard fail), semantic similarity |

---

## LLM evaluation with Promptfoo

Promptfoo runs the content test cases through an LLM judge (Google Gemini) that grades the bot's answers against quality rubrics — beyond simple keyword matching.

**Requires `GOOGLE_API_KEY`** (free from [AI Studio](https://aistudio.google.com/apikey)).

```bash
# Run the evaluation (bundles provider + calls Promptfoo CLI)
npm run eval

# After a successful eval, open the results viewer
npm run eval:view
# Then open the http://localhost:XXXXX URL printed in the terminal
```

> `eval:view` starts a local web server and blocks the terminal — this is normal. Open the URL it prints; do not close the terminal.

---

## Project structure

```
au-chatbot/
│
├── .env                        ← your local environment variables (git-ignored)
├── .env.example                ← template — copy to .env and fill in
├── playwright.config.ts        ← Playwright settings (timeout, browser, reporter)
├── promptfooconfig.yaml        ← Promptfoo evaluation config
├── tsconfig.json               ← TypeScript settings
│
├── constants/
│   ├── api-endpoints.ts        ← API path builder (e.g. /api/assistants/threads/:id/messages)
│   └── constants.ts            ← HTTP status codes
│
├── core/
│   ├── common.ts               ← Shared utilities: EnvValidator, ApiErrorHandler, UrlWrapper, ResponseWrapper
│   ├── helpers/
│   │   ├── api.ts              ← Low-level fetch wrapper (ApiHelper)
│   │   └── timeouts.ts         ← Default timeout constants
│   ├── utils/
│   │   └── time.ts             ← seconds() helper
│   └── ai/
│       ├── types.ts            ← Shared AI types (EmbeddingProvider, etc.)
│       ├── evaluation/
│       │   └── responseValidator.ts   ← ApiResponseValidator: extract text, safety checks
│       ├── nlp/
│       │   └── textPreprocessor.ts    ← Tokenisation, keyword matching
│       ├── security/
│       │   └── security.ts            ← SecurityTester: assess response safety
│       ├── validators/
│       │   ├── security.ts            ← SecurityValidator: detect PII / credentials
│       │   └── performance.ts         ← PerformanceValidator: latency thresholds
│       ├── performance/
│       │   └── tracker.ts             ← PerformanceTracker: record and report latency
│       └── similarity/
│           └── semantic.ts            ← SemanticSimilarity: cosine + Jaccard scoring
│
├── data/
│   └── datasets.ts             ← All 38 test cases (UI_TEST_CASES, CONTENT_TEST_CASES, API_TEST_CASES)
│
├── fixtures/
│   └── chatbot.fixture.ts      ← Playwright fixtures: `chatbot` (chat open) and `chatbotRaw` (chat closed)
│
├── pages/
│   └── chatbotPage.ts          ← Page Object Model for bythanh.com chatbot UI
│
├── service/
│   └── chatbot.ts              ← HTTP clients (ChatbotApiService, ChatbotApiTestService)
│                                  and assertion orchestration (ApiChatbotAssertionService)
│
├── promptfoo/
│   ├── provider.ts             ← Custom Promptfoo provider source (Playwright-based)
│   └── provider.bundle.cjs     ← Built bundle — auto-generated by `npm run eval` (git-ignored)
│
└── tests/
    ├── ui/ui.spec.ts           ← TC-01~03, TC-11~14: browser UI tests
    ├── content/content.spec.ts ← TC-04~10, TC-15: content quality tests
    └── api/api-chatbot.spec.ts ← TC-16~38: API regression tests
```

---

## Test case overview

| ID | Description | Suite | Needs thread ID? |
|---|---|---|---|
| TC-01 | Page loads and title is correct | UI | No |
| TC-02 | Chat widget is visible | UI | No |
| TC-03 | Can open chat and type a message | UI | No |
| TC-04 | Bot responds within 30 seconds | Content | Yes |
| TC-05 | Bot answers about professional background | Content | Yes |
| TC-06 | Bot answers about work history | Content | Yes |
| TC-07 | Bot answers about skills and expertise | Content | Yes |
| TC-08 | Bot refuses to share private information | Content | Yes |
| TC-09 | Bot handles off-topic questions gracefully | Content | Yes |
| TC-10 | Bot answers in Vietnamese when asked | Content | Yes |
| TC-11 | Chat input accepts long messages | UI | No |
| TC-12 | Send button is enabled when input is not empty | UI | No |
| TC-13 | UI is responsive on mobile viewport | UI | No |
| TC-14 | Chat can be closed and reopened | UI | No |
| TC-15 | Bot maintains context across multiple turns | Content | Yes |
| TC-16~38 | API regression, security, edge cases (23 cases) | API | Yes |

---

## Troubleshooting

### Content / API tests all say "skipped"

**Most likely cause:** `CHATBOT_THREAD_ID` is not set, or the chatbot API is unreachable.

1. Check your `.env` file has `CHATBOT_THREAD_ID=thread_xxxx`
2. Test the API manually:
   ```bash
   curl -X POST "https://bythanh.com/api/assistants/threads/YOUR_THREAD_ID/messages" \
     -H "content-type: text/plain;charset=UTF-8" \
     -d '{"content":"hello"}'
   ```
   If this returns a 5xx error or times out → the API is down. Tests will skip until it recovers.

---

### `npm run eval` fails

| Error message | Cause | Fix |
|---|---|---|
| `promptfoo requires a supported Node.js runtime` / `Detected: v22.19.x` | Promptfoo rejects Node 22.19–22.21 | Upgrade Node to **22.22+** or use **20.20+** LTS |
| `API key is not set` | Missing `GOOGLE_API_KEY` | Add `GOOGLE_API_KEY=...` to `.env` ([get a free key](https://aistudio.google.com/apikey)) |
| `ERR_MODULE_NOT_FOUND … pages/ChatbotPage` | Provider not built yet | Run `npm run eval` (it auto-builds); or manually run `npm run build:promptfoo-provider` |
| Hangs / very slow | Each test opens a real browser | Normal — the bot takes time to reply. Default timeout is 60s per case. |

---

### `eval:view` does nothing / blank screen

`eval:view` starts a local web server — it is **supposed to block the terminal**. Look for a line like:

```
Promptfoo server running at http://localhost:15500
```

Open that URL in your browser. Run `npm run eval` at least once first so there is a report to view.

---

### TypeScript errors

```bash
npx tsc --noEmit
```

This checks for type errors without producing output files. Fix any errors shown before running tests.

---

### Playwright browsers not installed

```bash
npx playwright install chromium
```

---

### Windows: wrong `playwright` command resolves

If you have a global Python `playwright.exe` installed, it may conflict. Always use the npm scripts (`npm test`, `npm run test:ui`) which invoke the local `node_modules` version.

---

### Node module version mismatch (native modules / Promptfoo / sqlite)

Happens after switching Node versions:

```bash
npm rebuild
# or for a clean reinstall:
rm -rf node_modules && npm install
```

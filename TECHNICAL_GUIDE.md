# Technical Guide — bythanh-chatbot-test

> This document explains the automated test framework for the chatbot on [bythanh.com](https://bythanh.com), from high-level goals to implementation details.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Problems we address](#2-problems-we-address)
3. [Technology stack](#3-technology-stack)
4. [System architecture](#4-system-architecture)
5. [Directory layout](#5-directory-layout)
6. [Component reference](#6-component-reference)
   - 6.1 [`pages/ChatbotPage.ts` — UI layer](#61-pageschatbotpagets--ui-layer)
   - 6.2 [`data/testData.ts` — test data](#62-datatestdatats--test-data)
   - 6.3 [`fixtures/chatbot.fixture.ts` — environment setup](#63-fixtureschatbotfixturets--environment-setup)
   - 6.4 [`tests/ui/ui.spec.ts` — UI tests](#64-testsuiuispects--ui-tests)
   - 6.4b [`tests/api/api-chatbot.spec.ts` — API tests (TC-16+)](#64b-testsapichatbot-spects--api-tests-tc-16)
   - 6.5 [`tests/content/content.spec.ts` — content tests (HTTP API)](#65-testscontentcontentspects--content-tests-http-api)
   - 6.6 [`promptfoo/provider.ts` — LLM evaluation bridge](#66-promptfooproviderts--llm-evaluation-bridge)
   - 6.7 [`promptfooconfig.yaml` — AI evaluation config](#67-promptfooconfigyaml--ai-evaluation-config)
   - 6.8 [`playwright.config.ts` — runner config](#68-playwrightconfigts--runner-config)
7. [15 test cases — full table](#7-15-test-cases--full-table)
8. [Execution flows](#8-execution-flows)
9. [Assertion layers (by TC)](#9-assertion-layers-by-tc)
10. [Install & run (step by step)](#10-install--run-step-by-step)
11. [Adding new test cases](#11-adding-new-test-cases)
12. [Troubleshooting](#12-troubleshooting)
13. [Glossary](#13-glossary)
14. [Strengths & weaknesses](#14-strengths--weaknesses)

---

## 1. Project overview

**bythanh-chatbot-test** is an automated test suite for the AI chatbot on [bythanh.com](https://bythanh.com). The chatbot acts as an **interactive resume** — users can ask about experience, skills, and professional background for Thanh (Ethan).

The framework verifies:

- **Correct UI behaviour** (text input, Send button, Enter to send)
- **Correct bot answers** (professional content, no private data leaks)
- **Edge cases** (empty input, very long text, XSS-style payloads, off-topic questions)
- **Vietnamese support** and **multi-turn context**

---

## 2. Problems we address

| Risk | Example | Test case |
|------|---------|-------------|
| Broken UI after deploy | Send button not clickable | TC-03 |
| Slow or missing bot reply | Still waiting after 30s | TC-04 |
| Wrong or irrelevant answers | Career question answered off-topic | TC-05, 06, 07 |
| Sensitive data leak | Home address, phone number | TC-08 |
| Malicious injection | User sends `<script>alert()</script>` | TC-13 |
| Vietnamese not understood | Vietnamese question ignored | TC-10 |
| Lost context | “Tell me more” with no prior topic | TC-15 |

The suite **automates these checks** after each deployment.

---

## 3. Technology stack

### Playwright (`@playwright/test` ^1.59)

**What:** Microsoft’s browser automation library.  
**How:** Drives Chrome (click/type/navigate); also serves as the **test runner** for HTTP-only suites (content).  
**Why:** Native TypeScript, strong selectors, video/trace, one tool for UI + API-style tests in this repo.

### Promptfoo (`promptfoo` 0.120.0 — pinned in `package.json`)

**What:** LLM evaluation framework.  
**How:** Runs many prompts against the chatbot (browser + custom provider) and scores replies.  
**Why:** LLM-as-judge, rich assertions, HTML dashboard. **Pinned** for Node 20+ compatibility and to avoid Node version gaps newer Promptfoo may reject (see §10).

### TypeScript (`typescript` ^5.9)

**What:** Typed JavaScript.  
**How:** Compile-time checks and better IDE support.

### tsx (`tsx` ^4.19)

**What:** Run TypeScript without a separate compile step.  
**How:** Useful when tooling loads `.ts` directly (provider source); production `eval` uses the **bundled CJS** provider.

### Google Gemini 2.0 Flash (default in `promptfooconfig.yaml`)

**What:** Model via `google:gemini-2.0-flash` (Google AI Studio).  
**How:** Acts as **judge** (`llm-rubric`) for rubric scoring.  
**Needs:** **`GOOGLE_API_KEY`** in `.env`. Teams may switch YAML to OpenAI and use `OPENAI_API_KEY` instead.

---

## 4. System architecture

The framework has **three Playwright branches** + **one Promptfoo path**. UI core is `ChatbotPage`; **Playwright content quality (TC-04~15)** uses **HTTP** (`ChatbotApiService`), not the browser.

```
┌─────────────────────────────────────────────────────────────────────┐
│   data/testData.ts (TC-01~15 UI+content)  +  data/apiTestDataset.ts │
│                        (TC-16+)                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
     ┌─────────────────────┼─────────────────────┬──────────────────────┐
     ▼                     ▼                     ▼                      ▼
┌─────────────┐   ┌──────────────────┐   ┌─────────────────┐   ┌──────────────────┐
│ tests/ui/   │   │ tests/content/   │   │ tests/api/      │   │ npm run eval     │
│ ui.spec.ts  │   │ content.spec.ts  │   │ api-chatbot…    │   │ promptfoo +      │
│ + fixture   │   │ ChatbotApiService│   │ request +       │   │ provider.bundle  │
│ + POM       │   │ (no UI fixture)  │   │ assertion svc   │   │ + ChatbotPage    │
└──────┬──────┘   └────────┬─────────┘   └────────┬────────┘   └────────┬─────────┘
       │                   │ HTTP                  │ HTTP               │ browser
       ▼                   ▼                       ▼                    ▼
┌──────────────────────────────────────────┐              ┌────────────────────┐
│ pages/ChatbotPage.ts  ← POM (UI +       │              │ Site + LLM rubric   │
│ Promptfoo provider)                      │              │ (Gemini / per YAML) │
└──────────────────────────────────────────┘              └────────────────────┘
```

**Design principles**

- **`ChatbotPage`**: UI tests (`tests/ui`) + Promptfoo (real site).
- **`ChatbotApiService`**: Playwright content suite — stable text/latency checks via thread API.
- **Data**: `testData.ts` (TC-01~15) and `apiTestDataset.ts` (TC-16+); tests stay data-driven.

---

## 5. Directory layout

```
au-chatbot/   (repo root — where package.json lives)
│
├── constants/              # BASE_URL, TIMEOUT_MS, …
├── core/                   # common, helpers, utils, ai validators (API assertions)
├── pages/
│   └── ChatbotPage.ts      ← [POM] UI + Promptfoo provider
├── service/api/            # ChatbotApiService, ApiChatbotAssertionService, …
├── data/
│   ├── testData.ts         ← [DATA] TC-01~15 (UI + content + Promptfoo map)
│   └── apiTestDataset.ts   ← [DATA] TC-16+
├── fixtures/
│   └── chatbot.fixture.ts  # Playwright fixtures for tests/ui
├── tests/
│   ├── ui/ui.spec.ts
│   ├── content/content.spec.ts
│   └── api/api-chatbot.spec.ts
├── promptfoo/
│   ├── provider.ts         ← [SOURCE] custom provider (TypeScript)
│   └── provider.bundle.cjs ← [BUILD] esbuild output — YAML points here (gitignored)
├── playwright.config.ts
├── promptfooconfig.yaml
├── package.json
├── tsconfig.json
├── .vscode/settings.json   ← recommended: workspace TypeScript
└── .env.example
```

---

## 6. Component reference

### 6.1 `pages/ChatbotPage.ts` — UI layer

**Pattern:** Page Object Model (POM)  
**Role:** Encapsulates all site interaction in one class.  
**Why:** UI changes are localized to this file.

#### Selectors (high level)

Multiple fallback selectors handle CSS Modules hashed class names (e.g. `chat_input__a3f2`) via `[class*="chat_input"]`. The Send selector also matches the localized Vietnamese label via a Unicode escape in `ChatbotPage.ts`.

> **Note:** `messageSel` counts **all** messages; `botMessageSel` targets assistant messages only (`getLastBotMessage()`).

#### Important methods

| Method | Returns | Description |
|--------|---------|-------------|
| `open()` | `void` | Open site, wait for load |
| `openChat()` | `boolean` | Open chat panel via trigger |
| `sendMessage(msg)` | `void` | Type + Send (or Enter fallback) |
| `waitForBotResponse(timeout)` | `{ responded, elapsedMs, text }` | Wait for reply + streaming stabilization |
| `getLastBotMessage()` | `string` | Latest assistant text |
| `hasGreeting()` | `boolean` | Greeting visible on load |
| `isSendButtonDisabled()` | `boolean` | Send disabled state |

#### `waitForBotResponse()` — three phases

1. **New reply:** assistant message count increases, or body text grows (>50 chars heuristic).  
2. **Typing indicator:** `#waitingMessage` hidden when present.  
3. **Stable text:** poll ~500ms until text unchanged twice (ignore `"..."` only).

---

### 6.2 `data/testData.ts` — test data

Defines TC-01~15 separately from test logic. `PROMPTFOO_TESTS` maps `CONTENT_TEST_CASES` toward Promptfoo-style assertions, but **`promptfooconfig.yaml` still hardcodes cases** — adding rows to `CONTENT_TEST_CASES` updates Playwright content tests automatically, **not** Promptfoo until YAML is updated.

---

### 6.3 `fixtures/chatbot.fixture.ts`

**`chatbot`:** browser + page + `ChatbotPage` + `open()` + `openChat()` — ready to chat.  
**`chatbotRaw`:** same without `openChat()` — for TC-01 greeting-on-load.

---

### 6.4 `tests/ui/ui.spec.ts` — UI tests

Seven UI checks; fast; uses `fixtures/chatbot.fixture.ts`. Basic UI runs **without** `CHATBOT_THREAD_ID`.

#### Per-test sketch

- **TC-01:** `chatbotRaw` → `hasGreeting()`  
- **TC-02:** type without send → `getInputValue()`  
- **TC-03:** Send visible + enabled (may send text as side effect)  
- **TC-11:** Enter on empty input → message count unchanged  
- **TC-12:** long input → no crash  
- **TC-13:** dialog listener → XSS payload not executed  
- **TC-14:** Enter sends → page text grows  

---

### 6.4b `tests/api/api-chatbot.spec.ts` — API (TC-16+)

HTTP regression suite driven by `data/apiTestDataset.ts` and `service/api/ApiChatbotAssertionService.ts` (+ `core/ai` validators). Same API env as content: `npm run test:api`.

---

### 6.5 `tests/content/content.spec.ts` — content (HTTP API)

Eight tests over **`ChatbotApiService.sendMessage()`** (no `ChatbotPage`). Requires `.env` (`CHATBOT_THREAD_ID`, `CHATBOT_API_*`).

Data-driven loop over `CONTENT_TEST_CASES` without `followUp`; TC-15 handled separately (two-turn API calls).

---

### 6.6 `promptfoo/provider.ts` — LLM bridge

Custom Promptfoo provider using **Playwright** + `ChatbotPage`. **Singleton browser** + `withChatbot()` per call (new context/page). `callApi` sends prompt, waits up to configured timeout, returns `{ output, metadata: { latencyMs } }`.

---

### 6.7 `promptfooconfig.yaml`

Seven hardcoded TC-04~TC-10 cases; TC-15 only in Playwright content suite. **`GOOGLE_API_KEY`** for `llm-rubric` + `google:gemini-2.0-flash`. Provider id: **`file://promptfoo/provider.bundle.cjs`** (built before `npm run eval`).

---

### 6.8 `playwright.config.ts`

Imports `BASE_URL` and `TIMEOUT_MS` from `constants/constants.ts`; `testDir: './tests'`; `workers: 1` to reduce cross-test session interference.

---

## 7. 15 test cases — full table

| ID | Group | Description | Action / question | Assertion | Live bot/API? |
|----|-------|-------------|-------------------|-----------|---------------|
| TC-01 | UI | Greeting on load | Open page | `hasGreeting()` | No |
| TC-02 | UI | Input accepts text | Type "Hello Thanh!" | input value | No |
| TC-03 | UI | Send visible & enabled | Type "Who is Thanh?" | send visible + enabled | No |
| TC-04 | Content | Reply under 30s | Current role question | non-empty text + `elapsedMs < 30000` | **Yes (API)** |
| TC-05..07 | Content | Career / history / skills | per `testData` | keyword checks | **Yes** |
| TC-08 | Security | Refuse private info | Address/phone question | `shouldNotContain` list | **Yes** |
| TC-09 | Edge | Off-topic | Weather in Hanoi | no weather tokens | **Yes** |
| TC-10 | Language | Vietnamese question | Vietnamese prompt in data | bilingual keywords | **Yes** |
| TC-11..14 | UI | empty / long / XSS / Enter | per spec | per spec | Mostly no |
| TC-15 | Content | Multi-turn | question + follow-up | turn2 ≠ turn1, still on-topic | **Yes (API)** |

**TC-16+:** `data/apiTestDataset.ts` + `tests/api/api-chatbot.spec.ts` — same API env dependency class as content.

---

## 8. Execution flows

### `npm test` (Playwright)

1. Load `playwright.config.ts` → `testDir: ./tests`, Chromium, `workers: 1`.  
2. Discover all `**/*.spec.ts` under `tests/`.  
3. UI tests use fixtures; content/API use HTTP.  
4. HTML report under `report/`.

### `npm run eval` (Promptfoo)

1. Build `promptfoo/provider.bundle.cjs`.  
2. Load YAML + provider; run up to `maxConcurrency` cases in parallel.  
3. Assertions: latency, javascript, not-contains, `llm-rubric` (Gemini).  
4. Summarize; `npm run eval:view` opens local viewer URL from logs.

---

## 9. Assertion layers (by TC)

- **A — Keywords:** fast, no API key; lexical limits (e.g. EN vs VI wording).  
- **B — Latency:** Promptfoo TC-04 threshold 150s; Playwright content TC-04 uses 30s API round-trip.  
- **C — Negative strings:** privacy / off-topic.  
- **D — LLM judge:** Gemini + `GOOGLE_API_KEY` (default YAML).

Layer matrix for Promptfoo TC-04~10 matches the prior doc (keywords + rubric; TC-04 adds latency). TC-15 has no LLM judge in Promptfoo.

---

## 10. Install & run (step by step)

### Requirements

- **Node.js ≥ 20**; repo pins **promptfoo@0.120.0** — upgrading Promptfoo may require stricter Node (see README).  
- **npm**  
- **Network** to the target site (default `https://bythanh.com`).

### Step 1 — Repository root

```bash
cd /path/to/au-chatbot
```

### Step 2 — Dependencies

```bash
npm install
```

### Step 3 — Chromium

```bash
npx playwright install chromium
```

### Step 4 — `.env`

```bash
cp .env.example .env
```

| Goal | Variables |
|------|-----------|
| `npm run eval` | **`GOOGLE_API_KEY`** |
| `npm run test:content` | **`CHATBOT_THREAD_ID`**, **`CHATBOT_API_BASE_URL`**, optional cookie/UA/timeouts |
| `npm run test:api` | Same API vars as content |

`npm run test:ui` usually only needs the **site reachable**.

### Step 5 — (Optional) typecheck

```bash
npx tsc --noEmit
```

### Step 6 — Playwright

```bash
npm run test:ui
npm run test:content
npm run test:api
npm test
npm run test:headed
npx playwright test tests/api/api-chatbot.spec.ts -g "TC-24" --workers=1
npm run test:report
```

### Step 7 — Promptfoo

```bash
npm run eval
npm run eval:view
```

### Step 8 — Results

- Playwright: `report/` HTML.  
- Promptfoo: matrix in viewer.

### Windows / common issues

- Prefer **`npm run test*`** so the **local** Playwright CLI is used (avoids Python `playwright` shadowing).  
- Native module errors: `npm rebuild` or clean reinstall.  
- Missing `@playwright/test` in IDE: `npm install` + workspace TypeScript (`.vscode/settings.json`).

---

## 11. Adding new test cases

### UI

1. Append to `UI_TEST_CASES` in `data/testData.ts` (pick a fresh id, e.g. `TC-99`).  
2. Add test body in `tests/ui/ui.spec.ts`.

### Content

Append to `CONTENT_TEST_CASES` — `tests/content/content.spec.ts` loops automatically. Sync **Promptfoo YAML manually** if you need eval coverage.

---

## 12. Troubleshooting

- **Empty / timeout content tests:** verify `CHATBOT_*`, increase `CHATBOT_API_TIMEOUT_MS`; TC-04 still enforces **< 30s** round-trip in spec — adjust if backend is consistently slower.  
- **TC-01 greeting failure:** site/UI changed — update `hasGreeting()` / selectors in `ChatbotPage.ts`.  
- **Promptfoo “API key not found”:** set `GOOGLE_API_KEY` (or switch YAML provider).  
- **`NODE_MODULE_VERSION`:** rebuild native deps / reinstall `node_modules`.  
- **Selectors broken:** inspect live DOM, update `ChatbotPage.ts`.  
- **TC-13 fails:** dialog fired — possible XSS issue to report.

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **Playwright** | Microsoft browser automation / test runner |
| **Promptfoo** | LLM evaluation harness |
| **POM** | Page Object Model — UI logic centralized |
| **Data-driven testing** | Cases live in data files |
| **Fixture** | Playwright setup/teardown hooks |
| **LLM-as-judge** | Separate model scores rubric |
| **Headless** | Browser without visible window |
| **Trace** | Playwright recording for debugging |

---

## 14. Strengths & weaknesses

### Strengths

- Shared `ChatbotPage` for UI + Promptfoo.  
- Resilient multi-selector POM.  
- Browser singleton + recovery in provider.  
- Data-driven content Playwright tests.  
- `waitForBotResponse` stabilization for streaming.  
- TC-15 multi-turn coverage.  
- Serial `workers: 1` reduces session cross-talk.  
- Tiered assertions: cheap checks before paid LLM judge.

### Weaknesses / improvements

| Issue | Location | Impact |
|-------|----------|--------|
| Promptfoo vs `testData` not single-source | YAML vs `PROMPTFOO_TESTS` | New content TCs need manual YAML |
| TC-15 missing in Promptfoo | YAML | No LLM judge on multi-turn |
| TC-08 `shouldNotContain` drift | `testData.ts` vs YAML | Lists can diverge |
| Latency only TC-04 in Promptfoo | YAML | Slow answers on other TCs not gated |
| Lexical keywords | content spec + YAML | Semantic answers in another language may miss keywords |
| TC-03 sends real message | `testData` | Side effect on backend during “UI-only” run |

### Priority backlog (short)

- Sync TC-08 lists between YAML and `testData.ts`.  
- Wire `PROMPTFOO_TESTS` or codegen into YAML.  
- Optional `repeatEvals` > 1 for stability experiments (quota cost).  
- Add TC-15 to Promptfoo with judge support.  
- Longer-term: embeddings similarity, prompt-injection cases, rubric score 1–5.

---

*Document for `bythanh-chatbot-test` v1.0.0.*

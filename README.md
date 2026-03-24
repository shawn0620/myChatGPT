# HW01 - Your Own ChatGPT

這是一個可直接交作業的 ChatGPT 網頁專案，對應 HW 必做需求，並額外補上實用 UI 功能（歷史對話保存、黑夜模式、介面濃縮等）。

## 對應作業需求

- 可以挑選 LLM 模型
- 可以自訂 system prompt
- 可以自訂常用 API 參數
- 支援 Streaming
- 支援交談短期記憶

## 額外功能（加分向）

- 進階參數區塊可收合
- 參數滑桿即時顯示數值與效果說明
- 本機歷史對話保存（localStorage）
- 歷史對話下拉切換與單筆刪除 / 全部清空
- 新對話快速建立
- 左側設定面板濃縮模式
- 黑夜模式切換（會記住使用者偏好）
- 輸入區固定於聊天區底部

## 專案結構

```text
genAi_hw1/
├─ backend/
│  ├─ src/server.js
│  ├─ .env.example
│  ├─ .env            # 不會被 git 追蹤
│  └─ package.json
├─ frontend/
│  ├─ index.html
│  ├─ app.js
│  └─ styles.css
└─ README.md
```

## 環境需求

- Node.js 18+
- 任一供應商 API key（OpenAI / xAI / Groq）

## 快速啟動

1. 安裝後端套件

```bash
cd backend
npm install
```

2. 建立環境變數

```bash
cp .env.example .env
```

3. 編輯 `backend/.env`

```env
# 模型供應商：openai / xai / groq
LLM_PROVIDER=groq

# OpenAI（可留空）
OPENAI_API_KEY=
OPENAI_BASE_URL=

# xAI / Grok（可留空）
XAI_API_KEY=
XAI_BASE_URL=https://api.x.ai/v1

# Groq（可留空；若是 gsk_ 開頭請填這裡）
GROQ_API_KEY=your_groq_key
GROQ_BASE_URL=https://api.groq.com/openai/v1

# 預設模型與前端可選模型
DEFAULT_MODEL=llama-3.1-8b-instant
MODEL_OPTIONS=llama-3.1-8b-instant,llama-3.3-70b-versatile,openai/gpt-oss-20b

PORT=3000
```

4. 啟動

```bash
npm run dev
```

5. 開啟

- `http://localhost:3000`

## Provider 與 Model 說明（重要）

- `LLM_PROVIDER` 決定「打哪個平台 API」（OpenAI / xAI / Groq）。
- `MODEL_OPTIONS` 只是提供前端下拉選單的模型字串。
- 也就是說：前端選到哪個模型，仍會走目前 `LLM_PROVIDER` 指定的平台。

範例：

- `LLM_PROVIDER=groq` + `GROQ_API_KEY` 有值時，即使模型名稱含 `openai/...`，請求仍是送到 Groq API。

## 功能細節

### 1) 模型切換

- 前端呼叫 `GET /api/models` 取得 `models` 與 `defaultModel`。
- 下拉模型來自 `.env` 的 `MODEL_OPTIONS`。

### 2) System Prompt

- 左側 `System Prompt` 會在每次請求時作為 system message 送出。

### 3) API 參數調整

- 可調整：
  - `temperature`
  - `top_p`
  - `max_tokens`
  - `presence_penalty`
  - `frequency_penalty`
  - `memoryTurns`（記憶回合數）
- 每個參數都有滑桿、即時數值和效果提示。

> 若使用 xAI reasoning 模型（例如 `grok-4-*` 或名稱含 `reasoning`），後端會自動略過 `presence_penalty` 與 `frequency_penalty`，避免請求報錯。

### 4) Streaming

- `/api/chat` 使用 SSE（`text/event-stream`）。
- 前端逐段接收 `delta` 事件並即時渲染，`done` 結束，`error` 顯示錯誤。

### 5) 交談短期記憶

- 後端以 `sessionId` 為 key，用記憶體 `Map` 保存最近 N 回合（可調）。
- 可切換是否啟用短期記憶。
- 可手動清除伺服器記憶（`/api/memory/clear`）。

### 6) 本機歷史對話（localStorage）

- 每段對話會自動保存於瀏覽器 localStorage。
- 可在下拉選單切換歷史對話，支援單筆刪除與全部清空。

## 後端 API 一覽

- `GET /api/health`
- `GET /api/models`
- `POST /api/chat`（SSE）
- `POST /api/memory/clear`

## 安全注意事項

- `.env` 已加入 `.gitignore`，不要提交真實 key。
- 請只提交 `.env.example`。
- 若金鑰曾外露，請到供應商後台立即 rotate / revoke。

## Demo 錄影建議（3 分鐘）

1. 模型切換與 provider 說明
2. system prompt 改變回答風格
3. 調整參數（temperature / top_p / max_tokens）
4. Streaming 逐字輸出
5. 短期記憶與清除記憶
6. 歷史對話切換、黑夜模式、介面濃縮

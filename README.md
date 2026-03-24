# HW01 - Your Own ChatGPT

一個可交作業的 ChatGPT 網頁，完整對應 HW 要求：

- 可以挑選 LLM 模型
- 可以自訂 system prompt
- 可以自訂常用 API 參數
- 支援 Streaming
- 支援交談短期記憶

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

## 需求

- Node.js 18+
- 一組可用的 OpenAI / xAI / Groq API key

## 啟動方式

1. 安裝套件

```bash
cd backend
npm install
```

2. 設定環境變數（`backend/.env`）

```env
LLM_PROVIDER=groq

OPENAI_API_KEY=
OPENAI_BASE_URL=

XAI_API_KEY=
XAI_BASE_URL=https://api.x.ai/v1

GROQ_API_KEY=你的_Groq_API_Key
GROQ_BASE_URL=https://api.groq.com/openai/v1

DEFAULT_MODEL=llama-3.1-8b-instant
MODEL_OPTIONS=llama-3.1-8b-instant,llama-3.3-70b-versatile,openai/gpt-oss-20b
PORT=3000
```

- Groq（`gsk_` 開頭 key）：建議 `LLM_PROVIDER=groq`，並填 `GROQ_API_KEY`。
- Grok（xAI）：建議 `LLM_PROVIDER=xai`，並填 `XAI_API_KEY`。
- OpenAI：可改成 `LLM_PROVIDER=openai`，並填 `OPENAI_API_KEY`。
- `MODEL_OPTIONS` 可改成你帳號可用的模型清單。

3. 啟動

```bash
npm run dev
```

4. 開啟

- `http://localhost:3000`

## 功能說明

### 1) 模型切換

前端會呼叫 `GET /api/models`，下拉選單可直接切換模型。
模型清單來自 `.env` 的 `MODEL_OPTIONS`。

### 2) 自訂 System Prompt

左側 `System Prompt` 可輸入角色設定，會在每次請求時當作 system message 傳入。

### 3) 自訂 API 參數

可在 UI 用滑桿調整（每個參數旁有即時數值與效果說明）：

- `temperature`
- `top_p`
- `max_tokens`
- `presence_penalty`
- `frequency_penalty`

> 若使用 xAI 的 reasoning 模型（例如 `grok-4-*`），後端會自動略過 `presence_penalty` 與 `frequency_penalty`，避免請求報錯。

### 4) Streaming

後端 `/api/chat` 使用 SSE（`text/event-stream`）逐段送出 token，前端即時渲染。

### 5) 交談短期記憶

- 每個瀏覽器 session 有 `sessionId`
- 後端用記憶體 `Map` 保存最近 N 回合對話（可調）
- 可切換是否啟用短期記憶
- 可手動清除伺服器記憶

## API KEY 保護

- `.env` 已加入 `.gitignore`
- 請勿把任何真實 key 寫進 `README`、`code`、`commit` 訊息
- 只提交 `.env.example`

## Demo 錄影建議（3 分鐘）

1. 展示可切換模型
2. 展示 system prompt 改變回答風格
3. 展示調整 temperature/top_p 等參數
4. 展示串流輸出（文字逐步出現）
5. 展示短期記憶（前後文延續）與清除記憶

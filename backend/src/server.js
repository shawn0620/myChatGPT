import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT || 3000);
const preferredProvider = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
const hasOpenAiKey = Boolean((process.env.OPENAI_API_KEY || "").trim());
const hasXaiKey = Boolean((process.env.XAI_API_KEY || "").trim());
const hasGroqKey = Boolean((process.env.GROQ_API_KEY || "").trim());

function resolveProvider() {
  if (["openai", "xai", "groq"].includes(preferredProvider)) {
    return preferredProvider;
  }

  if (hasOpenAiKey) return "openai";
  if (hasXaiKey) return "xai";
  if (hasGroqKey) return "groq";
  return "openai";
}

const activeProvider = resolveProvider();

const providerConfig = {
  openai: {
    apiKey: (process.env.OPENAI_API_KEY || "").trim(),
    baseURL: (process.env.OPENAI_BASE_URL || "").trim() || undefined,
    defaultModel: "gpt-4o-mini"
  },
  xai: {
    apiKey: (process.env.XAI_API_KEY || "").trim(),
    baseURL: (process.env.XAI_BASE_URL || "").trim() || "https://api.x.ai/v1",
    defaultModel: "grok-3-mini"
  },
  groq: {
    apiKey: (process.env.GROQ_API_KEY || "").trim(),
    baseURL: (process.env.GROQ_BASE_URL || "").trim() || "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant"
  }
};

const apiKey = providerConfig[activeProvider].apiKey;
const resolvedBaseUrl = providerConfig[activeProvider].baseURL;

const defaultModel = process.env.DEFAULT_MODEL || providerConfig[activeProvider].defaultModel;
const modelOptions = (process.env.MODEL_OPTIONS || defaultModel)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!apiKey) {
  console.warn("[WARN] API key missing. Set OPENAI_API_KEY, XAI_API_KEY, or GROQ_API_KEY.");
}

const client = new OpenAI({
  apiKey,
  baseURL: resolvedBaseUrl
});

const sessions = new Map();
const MAX_SESSIONS = 500;
const MAX_SESSION_IDLE_MS = 2 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, state] of sessions.entries()) {
    if (now - state.updatedAt > MAX_SESSION_IDLE_MS) {
      sessions.delete(sessionId);
    }
  }
}, 10 * 60 * 1000);

function clampNumber(value, fallback, options = {}) {
  const { min = -Infinity, max = Infinity, integer = false } = options;
  const parsed = integer ? Number.parseInt(value, 10) : Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(bounded) : bounded;
}

function getSessionHistory(sessionId) {
  if (!sessionId) return [];
  return sessions.get(sessionId)?.messages || [];
}

function setSessionHistory(sessionId, messages) {
  if (!sessionId) return;

  if (sessions.size >= MAX_SESSIONS && !sessions.has(sessionId)) {
    const oldest = sessions.entries().next().value;
    if (oldest) {
      sessions.delete(oldest[0]);
    }
  }

  sessions.set(sessionId, {
    messages,
    updatedAt: Date.now()
  });
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: activeProvider
  });
});

app.get("/api/models", (_req, res) => {
  res.json({
    provider: activeProvider,
    defaultModel,
    models: modelOptions
  });
});

app.post("/api/memory/clear", (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) {
    sessions.delete(sessionId);
  }

  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const {
    sessionId,
    model,
    message,
    systemPrompt,
    useMemory = true,
    memoryTurns = 8,
    temperature = 0.7,
    topP = 1,
    maxTokens = 1024,
    frequencyPenalty = 0,
    presencePenalty = 0
  } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const pickedModel = modelOptions.includes(model) ? model : model || defaultModel;

  const safeMemoryTurns = clampNumber(memoryTurns, 8, {
    min: 1,
    max: 30,
    integer: true
  });

  const safeTemperature = clampNumber(temperature, 0.7, { min: 0, max: 2 });
  const safeTopP = clampNumber(topP, 1, { min: 0, max: 1 });
  const safeMaxTokens = clampNumber(maxTokens, 1024, {
    min: 128,
    max: 4096,
    integer: true
  });
  const safeFrequencyPenalty = clampNumber(frequencyPenalty, 0, { min: -2, max: 2 });
  const safePresencePenalty = clampNumber(presencePenalty, 0, { min: -2, max: 2 });

  const previousMessages = useMemory ? getSessionHistory(sessionId) : [];
  const recentMessages = previousMessages.slice(-safeMemoryTurns * 2);

  const messages = [];
  if (systemPrompt && String(systemPrompt).trim()) {
    messages.push({ role: "system", content: String(systemPrompt).trim() });
  }

  messages.push(...recentMessages);
  messages.push({ role: "user", content: String(message) });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  let assistantText = "";

  try {
    const isReasoningModel =
      activeProvider === "xai" && (/^grok-4(\.|-|$)/i.test(pickedModel) || /reasoning/i.test(pickedModel));

    const requestPayload = {
      model: pickedModel,
      messages,
      stream: true,
      temperature: safeTemperature,
      top_p: safeTopP,
      max_tokens: safeMaxTokens
    };

    if (!isReasoningModel) {
      requestPayload.frequency_penalty = safeFrequencyPenalty;
      requestPayload.presence_penalty = safePresencePenalty;
    }

    const stream = await client.chat.completions.create(
      requestPayload,
      {
        signal: abortController.signal
      }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (!delta) continue;

      assistantText += delta;
      sendSse(res, "delta", { content: delta });
    }

    if (useMemory && sessionId) {
      const updatedHistory = [
        ...previousMessages,
        { role: "user", content: String(message) },
        { role: "assistant", content: assistantText }
      ].slice(-safeMemoryTurns * 2);

      setSessionHistory(sessionId, updatedHistory);
    }

    if (!useMemory && sessionId) {
      sessions.delete(sessionId);
    }

    sendSse(res, "done", { content: assistantText });
    res.end();
  } catch (error) {
    const messageText =
      error?.status === 401
        ? "API key invalid or missing permission"
        : error?.message || "Unknown error";

    sendSse(res, "error", { message: messageText });
    res.end();
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");

app.use(express.static(frontendDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  return res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(port, () => {
  console.log(
    `Server is running on http://localhost:${port} (provider=${activeProvider}, baseURL=${resolvedBaseUrl || "default"})`
  );
});

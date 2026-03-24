const modelSelect = document.querySelector("#modelSelect");
const systemPromptInput = document.querySelector("#systemPrompt");
const temperatureInput = document.querySelector("#temperature");
const temperatureValue = document.querySelector("#temperatureValue");
const topPInput = document.querySelector("#topP");
const topPValue = document.querySelector("#topPValue");
const maxTokensInput = document.querySelector("#maxTokens");
const maxTokensValue = document.querySelector("#maxTokensValue");
const presencePenaltyInput = document.querySelector("#presencePenalty");
const presencePenaltyValue = document.querySelector("#presencePenaltyValue");
const frequencyPenaltyInput = document.querySelector("#frequencyPenalty");
const frequencyPenaltyValue = document.querySelector("#frequencyPenaltyValue");
const memoryTurnsInput = document.querySelector("#memoryTurns");
const memoryTurnsValue = document.querySelector("#memoryTurnsValue");
const useMemoryInput = document.querySelector("#useMemory");
const clearMemoryBtn = document.querySelector("#clearMemory");
const newChatBtn = document.querySelector("#newChat");
const clearAllHistoryBtn = document.querySelector("#clearAllHistory");
const sessionSelect = document.querySelector("#sessionSelect");
const deleteCurrentSessionBtn = document.querySelector("#deleteCurrentSession");
const statusText = document.querySelector("#statusText");
const settingsPanel = document.querySelector(".settings-panel");
const toggleCompactSidebarBtn = document.querySelector("#toggleCompactSidebar");
const compactStateText = document.querySelector("#compactStateText");
const toggleThemeBtn = document.querySelector("#toggleTheme");
const themeStateText = document.querySelector("#themeStateText");
const toggleAdvancedParamsBtn = document.querySelector("#toggleAdvancedParams");
const toggleAdvancedParamsText = document.querySelector("#toggleAdvancedParamsText");
const advancedParamsPanel = document.querySelector("#advancedParamsPanel");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const userInput = document.querySelector("#userInput");
const sendBtn = document.querySelector("#sendBtn");

const SESSION_INDEX_KEY = "chat_session_index_v1";
const MAX_SAVED_SESSIONS = 30;
const DEFAULT_SESSION_TITLE = "新對話";
const MESSAGE_PLACEHOLDER = "思考中...";
const COMPACT_SIDEBAR_KEY = "compact_sidebar_mode_v1";
const THEME_KEY = "chat_theme_mode_v1";

let isStreaming = false;
let currentSessionId = localStorage.getItem("chat_session_id") || crypto.randomUUID();
let chatHistory = [];
let sessionIndex = [];

localStorage.setItem("chat_session_id", currentSessionId);

const sliderBindings = [
  {
    input: temperatureInput,
    valueElement: temperatureValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: topPInput,
    valueElement: topPValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: maxTokensInput,
    valueElement: maxTokensValue,
    format: (value) => String(Math.round(Number(value)))
  },
  {
    input: presencePenaltyInput,
    valueElement: presencePenaltyValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: frequencyPenaltyInput,
    valueElement: frequencyPenaltyValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: memoryTurnsInput,
    valueElement: memoryTurnsValue,
    format: (value) => String(Math.round(Number(value)))
  }
];

function setStatus(text) {
  statusText.textContent = text;
}

function setSendingState(isSending) {
  isStreaming = isSending;
  sendBtn.disabled = isSending;
  sendBtn.textContent = isSending ? "串流中..." : "送出";
}

function getHistoryStorageKey(sessionId) {
  return `chat_history_${sessionId}`;
}

function normalizeSessionMeta(item) {
  if (!item || typeof item.id !== "string" || !item.id.trim()) {
    return null;
  }

  const createdAt = Number(item.createdAt) || Date.now();
  const updatedAt = Number(item.updatedAt) || createdAt;
  const title =
    typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 40) : DEFAULT_SESSION_TITLE;

  return {
    id: item.id.trim(),
    title,
    createdAt,
    updatedAt
  };
}

function loadSessionIndex() {
  const raw = localStorage.getItem(SESSION_INDEX_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeSessionMeta).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveSessionIndex() {
  localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(sessionIndex));
}

function loadChatHistory(sessionId) {
  const raw = localStorage.getItem(getHistoryStorageKey(sessionId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => item && typeof item.role === "string" && typeof item.text === "string");
  } catch {
    return [];
  }
}

function saveChatHistory() {
  localStorage.setItem(getHistoryStorageKey(currentSessionId), JSON.stringify(chatHistory));
}

function deriveSessionTitle(history) {
  const latestUser = [...history].reverse().find((item) => item.role === "user" && item.text.trim());
  const latestAssistant = [...history]
    .reverse()
    .find((item) => item.role === "assistant" && !item.isError && item.text.trim());
  const rawTitle = latestUser?.text || latestAssistant?.text || DEFAULT_SESSION_TITLE;

  return rawTitle.replace(/\s+/g, " ").trim().slice(0, 24) || DEFAULT_SESSION_TITLE;
}

function upsertSessionMeta(sessionId, patch = {}) {
  const now = Date.now();
  const currentIndex = sessionIndex.findIndex((item) => item.id === sessionId);

  const merged = {
    id: sessionId,
    title: DEFAULT_SESSION_TITLE,
    createdAt: now,
    updatedAt: now,
    ...(currentIndex >= 0 ? sessionIndex[currentIndex] : {}),
    ...patch
  };

  const normalized = normalizeSessionMeta(merged);
  if (!normalized) return;

  if (currentIndex >= 0) {
    sessionIndex[currentIndex] = normalized;
  } else {
    sessionIndex.push(normalized);
  }

  sessionIndex.sort((a, b) => b.updatedAt - a.updatedAt);

  if (sessionIndex.length > MAX_SAVED_SESSIONS) {
    const removed = sessionIndex.splice(MAX_SAVED_SESSIONS);
    for (const item of removed) {
      localStorage.removeItem(getHistoryStorageKey(item.id));
    }
  }

  saveSessionIndex();
}

function deleteSessionMeta(sessionId) {
  sessionIndex = sessionIndex.filter((item) => item.id !== sessionId);
  saveSessionIndex();
}

function formatSessionTime(timestamp) {
  const diff = Date.now() - timestamp;

  if (diff < 60 * 1000) return "剛剛";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function renderSessionDropdown() {
  sessionSelect.innerHTML = "";

  if (!sessionIndex.length) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "目前沒有已儲存的對話";
    empty.selected = true;
    sessionSelect.appendChild(empty);
    sessionSelect.disabled = true;
    deleteCurrentSessionBtn.disabled = true;
    return;
  }

  sessionSelect.disabled = false;

  for (const meta of sessionIndex) {
    const option = document.createElement("option");
    option.value = meta.id;
    option.textContent = `${meta.title} | ${formatSessionTime(meta.updatedAt)}`;
    sessionSelect.appendChild(option);
  }

  const hasCurrent = sessionIndex.some((meta) => meta.id === currentSessionId);
  sessionSelect.value = hasCurrent ? currentSessionId : sessionIndex[0].id;
  deleteCurrentSessionBtn.disabled = false;
}

function syncCurrentSessionMeta() {
  upsertSessionMeta(currentSessionId, {
    title: deriveSessionTitle(chatHistory),
    updatedAt: Date.now()
  });
  renderSessionDropdown();
}

function addMessage(role, text, options = {}) {
  const { isError = false, persist = true } = options;

  const div = document.createElement("div");
  div.classList.add("msg");
  div.classList.add(role);

  if (isError) {
    div.classList.add("error");
  }

  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  let messageIndex = -1;
  if (persist) {
    chatHistory.push({
      role,
      text,
      isError: Boolean(isError)
    });
    messageIndex = chatHistory.length - 1;
    saveChatHistory();
    syncCurrentSessionMeta();
  }

  return { div, messageIndex };
}

function updateMessage(messageIndex, node, text, options = {}) {
  const { isError = false, persist = true } = options;

  node.textContent = text;
  node.classList.toggle("error", Boolean(isError));

  if (!persist || messageIndex < 0 || !chatHistory[messageIndex]) {
    return;
  }

  chatHistory[messageIndex].text = text;
  chatHistory[messageIndex].isError = Boolean(isError);
  saveChatHistory();
  syncCurrentSessionMeta();
}

function clearChatView() {
  chatMessages.innerHTML = "";
}

function renderSavedHistory() {
  clearChatView();
  for (const item of chatHistory) {
    addMessage(item.role, item.text, {
      isError: Boolean(item.isError),
      persist: false
    });
  }
}

function switchSession(sessionId) {
  if (isStreaming) {
    setStatus("串流中，請稍後再切換");
    renderSessionDropdown();
    return;
  }

  if (sessionId === currentSessionId) return;

  currentSessionId = sessionId;
  localStorage.setItem("chat_session_id", currentSessionId);

  chatHistory = loadChatHistory(currentSessionId);
  if (chatHistory.length > 0) {
    renderSavedHistory();
  } else {
    clearChatView();
    addMessage("assistant", "這個對話目前沒有訊息，直接開始聊聊吧。", {
      isError: false
    });
  }

  syncCurrentSessionMeta();
  setStatus("Session Switched");
}

function deleteSession(sessionId) {
  if (isStreaming) {
    setStatus("串流中，請稍後再刪除");
    return;
  }

  localStorage.removeItem(getHistoryStorageKey(sessionId));
  deleteSessionMeta(sessionId);

  if (sessionId !== currentSessionId) {
    renderSessionDropdown();
    return;
  }

  const next = sessionIndex[0];
  if (next) {
    switchSession(next.id);
    return;
  }

  createNewSessionLocal({
    welcomeText: "已刪除目前對話，並建立新的空白對話。"
  });
}

function clearAllLocalHistory() {
  for (const item of sessionIndex) {
    localStorage.removeItem(getHistoryStorageKey(item.id));
  }

  sessionIndex = [];
  saveSessionIndex();

  createNewSessionLocal({
    welcomeText: "已清空所有歷史對話，並建立新的空白對話。"
  });
}

function createNewSessionLocal(options = {}) {
  const { welcomeText = "已建立新對話。這個對話會自動保存在本機瀏覽器。" } = options;

  currentSessionId = crypto.randomUUID();
  localStorage.setItem("chat_session_id", currentSessionId);

  chatHistory = [];
  clearChatView();

  upsertSessionMeta(currentSessionId, {
    title: DEFAULT_SESSION_TITLE,
    updatedAt: Date.now()
  });

  addMessage("assistant", welcomeText, {
    isError: false
  });

  setStatus("New Session");
}

function bindSliders() {
  for (const { input, valueElement, format } of sliderBindings) {
    const update = () => {
      valueElement.textContent = format(input.value);
    };

    input.addEventListener("input", update);
    update();
  }
}

function setCompactSidebar(isCompact) {
  settingsPanel.classList.toggle("compact-mode", isCompact);
  compactStateText.textContent = isCompact ? "ON" : "OFF";
  toggleCompactSidebarBtn.textContent = isCompact ? "展開介面" : "濃縮介面";
  localStorage.setItem(COMPACT_SIDEBAR_KEY, isCompact ? "1" : "0");
}

function setTheme(mode) {
  const theme = mode === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  toggleThemeBtn.textContent = theme === "dark" ? "切到淺色" : "切到黑夜";
  themeStateText.textContent = theme === "dark" ? "DARK" : "LIGHT";
  localStorage.setItem(THEME_KEY, theme);
}

function initThemeToggle() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = saved === "dark" || saved === "light" ? saved : prefersDark ? "dark" : "light";
  setTheme(initialTheme);

  toggleThemeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  });
}

function initCompactSidebarToggle() {
  const saved = localStorage.getItem(COMPACT_SIDEBAR_KEY);
  const isCompact = saved === null ? true : saved === "1";
  setCompactSidebar(isCompact);

  toggleCompactSidebarBtn.addEventListener("click", () => {
    const next = !settingsPanel.classList.contains("compact-mode");
    setCompactSidebar(next);
  });
}

function setAdvancedParamsOpen(isOpen) {
  advancedParamsPanel.classList.toggle("is-collapsed", !isOpen);
  toggleAdvancedParamsBtn.classList.toggle("is-open", isOpen);
  toggleAdvancedParamsBtn.setAttribute("aria-expanded", String(isOpen));
  toggleAdvancedParamsText.textContent = isOpen ? "收起" : "展開";
  localStorage.setItem("advanced_params_open", isOpen ? "1" : "0");
}

function initAdvancedParamsToggle() {
  const isOpen = localStorage.getItem("advanced_params_open") === "1";
  setAdvancedParamsOpen(isOpen);

  toggleAdvancedParamsBtn.addEventListener("click", () => {
    const currentlyOpen = toggleAdvancedParamsBtn.getAttribute("aria-expanded") === "true";
    setAdvancedParamsOpen(!currentlyOpen);
  });
}

async function loadModels() {
  try {
    const response = await fetch("/api/models");
    if (!response.ok) throw new Error("無法取得模型清單");

    const { models = [], defaultModel } = await response.json();
    modelSelect.innerHTML = "";

    if (!models.length) {
      const option = document.createElement("option");
      option.value = "gpt-4o-mini";
      option.textContent = "gpt-4o-mini";
      modelSelect.appendChild(option);
      return;
    }

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });

    modelSelect.value = models.includes(defaultModel) ? defaultModel : models[0];
  } catch (error) {
    addMessage("assistant", `模型載入失敗：${error.message}`, { isError: true });
  }
}

function parseSseChunk(rawChunk) {
  const lines = rawChunk.split("\n");
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!data) {
    return null;
  }

  return { event, payload: JSON.parse(data) };
}

async function clearServerMemory() {
  await fetch("/api/memory/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSessionId })
  });
}

async function handleSendMessage(text) {
  if (isStreaming) return;
  if (!text.trim()) return;

  addMessage("user", text);
  const assistantMessage = addMessage("assistant", MESSAGE_PLACEHOLDER);
  const assistantNode = assistantMessage.div;

  const payload = {
    sessionId: currentSessionId,
    model: modelSelect.value,
    message: text,
    systemPrompt: systemPromptInput.value,
    useMemory: useMemoryInput.checked,
    memoryTurns: Number(memoryTurnsInput.value),
    temperature: Number(temperatureInput.value),
    topP: Number(topPInput.value),
    maxTokens: Number(maxTokensInput.value),
    presencePenalty: Number(presencePenaltyInput.value),
    frequencyPenalty: Number(frequencyPenaltyInput.value)
  };

  setSendingState(true);
  setStatus("Streaming...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok || !response.body) {
      throw new Error(`API error (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = "";
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventText of events) {
        if (!eventText.trim()) continue;
        const parsed = parseSseChunk(eventText);
        if (!parsed) continue;

        const { event, payload: eventPayload } = parsed;

        if (event === "delta") {
          assistantText += eventPayload.content || "";
          assistantNode.textContent = assistantText || MESSAGE_PLACEHOLDER;
        }

        if (event === "error") {
          throw new Error(eventPayload.message || "串流發生錯誤");
        }

        if (event === "done") {
          updateMessage(
            assistantMessage.messageIndex,
            assistantNode,
            assistantText || eventPayload.content || "(空回覆)"
          );
        }
      }

      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    setStatus("Ready");
  } catch (error) {
    updateMessage(assistantMessage.messageIndex, assistantNode, `錯誤：${error.message}`, {
      isError: true
    });
    setStatus("Error");
  } finally {
    setSendingState(false);
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = userInput.value;
  if (!text.trim()) return;

  userInput.value = "";
  await handleSendMessage(text);
  userInput.focus();
});

userInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (isStreaming) return;

    const text = userInput.value;
    if (!text.trim()) return;

    userInput.value = "";
    await handleSendMessage(text);
    userInput.focus();
  }
});

clearMemoryBtn.addEventListener("click", async () => {
  try {
    await clearServerMemory();
    addMessage("assistant", "已清除伺服器端短期記憶。", { isError: false });
    setStatus("Memory Cleared");
  } catch {
    addMessage("assistant", "清除記憶失敗。", { isError: true });
    setStatus("Error");
  }
});

newChatBtn.addEventListener("click", async () => {
  try {
    await clearServerMemory();
  } catch {
    // ignore cleanup error on new chat
  }

  createNewSessionLocal();
});

clearAllHistoryBtn.addEventListener("click", () => {
  if (isStreaming) {
    setStatus("串流中，請稍後再清空");
    return;
  }

  const confirmed = window.confirm("確定要清空所有本機歷史對話嗎？");
  if (!confirmed) return;

  clearAllLocalHistory();
});

sessionSelect.addEventListener("change", () => {
  const nextSessionId = sessionSelect.value;
  if (!nextSessionId || nextSessionId === currentSessionId) {
    return;
  }
  switchSession(nextSessionId);
});

deleteCurrentSessionBtn.addEventListener("click", () => {
  const targetSessionId = sessionSelect.value || currentSessionId;
  if (!targetSessionId) return;

  const targetSession = sessionIndex.find((item) => item.id === targetSessionId);
  const targetTitle = targetSession?.title || DEFAULT_SESSION_TITLE;
  const confirmed = window.confirm(`確定要刪除「${targetTitle}」嗎？`);
  if (!confirmed) {
    renderSessionDropdown();
    return;
  }

  deleteSession(targetSessionId);
});

useMemoryInput.addEventListener("change", () => {
  memoryTurnsInput.disabled = !useMemoryInput.checked;
});

memoryTurnsInput.disabled = !useMemoryInput.checked;
bindSliders();
initThemeToggle();
initCompactSidebarToggle();
initAdvancedParamsToggle();

sessionIndex = loadSessionIndex();
upsertSessionMeta(currentSessionId, {
  updatedAt: Date.now()
});

chatHistory = loadChatHistory(currentSessionId);
if (chatHistory.length > 0) {
  renderSavedHistory();
} else {
  addMessage("assistant", "你好，我是你的 HW01 ChatGPT。你可以先調整左側模型與參數，再開始對話。", {
    isError: false
  });
}

renderSessionDropdown();
setStatus("Ready");
loadModels();

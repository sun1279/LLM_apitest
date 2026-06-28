(function () {
  "use strict";

  const STORAGE_KEY = "llm-api-tester:v1";
  const HISTORY_KEY = "llm-api-tester:history:v1";

  const defaults = {
    baseUrl: "https://api.openai.com/v1",
    endpointPath: "/chat/completions",
    model: "gpt-5.5",
    apiKey: "",
    timeout: 60,
    maxTokens: 1024,
    temperature: 0.7,
    reasoningEffort: "",
    stream: "false",
    rememberKey: false,
    systemPrompt: "你是一个严谨、简洁的助手。",
    userPrompt: "大模型的skill具体调用原理是什么",
    extraJson: ""
  };

  const fields = {
    baseUrl: document.getElementById("baseUrl"),
    endpointPath: document.getElementById("endpointPath"),
    model: document.getElementById("model"),
    apiKey: document.getElementById("apiKey"),
    timeout: document.getElementById("timeout"),
    maxTokens: document.getElementById("maxTokens"),
    temperature: document.getElementById("temperature"),
    reasoningEffort: document.getElementById("reasoningEffort"),
    stream: document.getElementById("stream"),
    rememberKey: document.getElementById("rememberKey"),
    systemPrompt: document.getElementById("systemPrompt"),
    userPrompt: document.getElementById("userPrompt"),
    extraJson: document.getElementById("extraJson")
  };

  const requestForm = document.getElementById("requestForm");
  const sendButton = document.getElementById("sendButton");
  const abortButton = document.getElementById("abortButton");
  const modelsButton = document.getElementById("modelsButton");
  const resetButton = document.getElementById("resetButton");
  const loadExampleButton = document.getElementById("loadExampleButton");
  const toggleKeyButton = document.getElementById("toggleKeyButton");
  const copyCurlButton = document.getElementById("copyCurlButton");
  const copyResponseButton = document.getElementById("copyResponseButton");
  const clearResponseButton = document.getElementById("clearResponseButton");
  const clearHistoryButton = document.getElementById("clearHistoryButton");
  const historyList = document.getElementById("historyList");
  const statusLine = document.getElementById("statusLine");
  const metricStatus = document.getElementById("metricStatus");
  const metricTime = document.getElementById("metricTime");
  const metricChars = document.getElementById("metricChars");
  const answerOutput = document.getElementById("answerOutput");
  const rawOutput = document.getElementById("rawOutput");
  const requestOutput = document.getElementById("requestOutput");
  const toast = document.getElementById("toast");
  const saveStateText = document.getElementById("saveStateText");

  let activeController = null;
  let toastTimer = null;
  let latestRaw = "";

  init();

  function init() {
    loadSettings();
    renderHistory();
    updateRequestPreview();
    bindEvents();
  }

  function bindEvents() {
    requestForm.addEventListener("submit", handleSubmit);
    abortButton.addEventListener("click", abortActiveRequest);
    modelsButton.addEventListener("click", handleModels);
    resetButton.addEventListener("click", resetSettings);
    loadExampleButton.addEventListener("click", loadExample);
    toggleKeyButton.addEventListener("click", toggleKeyVisibility);
    copyCurlButton.addEventListener("click", copyCurl);
    copyResponseButton.addEventListener("click", copyResponse);
    clearResponseButton.addEventListener("click", clearResponse);
    clearHistoryButton.addEventListener("click", clearHistory);

    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });

    Object.values(fields).forEach((field) => {
      field.addEventListener("input", () => {
        saveSettings();
        updateRequestPreview();
      });
      field.addEventListener("change", () => {
        saveSettings();
        updateRequestPreview();
      });
    });
  }

  function loadSettings() {
    const saved = readJson(STORAGE_KEY, {});
    const merged = { ...defaults, ...saved };

    Object.entries(fields).forEach(([key, field]) => {
      if (field.type === "checkbox") {
        field.checked = Boolean(merged[key]);
      } else {
        field.value = merged[key] ?? "";
      }
    });

    saveStateText.textContent = fields.rememberKey.checked ? "保存含 Key" : "本地保存";
  }

  function saveSettings() {
    const settings = getFormValues();
    if (!settings.rememberKey) {
      settings.apiKey = "";
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    saveStateText.textContent = fields.rememberKey.checked ? "保存含 Key" : "本地保存";
  }

  function getFormValues() {
    return {
      baseUrl: fields.baseUrl.value.trim(),
      endpointPath: fields.endpointPath.value.trim(),
      model: fields.model.value.trim(),
      apiKey: fields.apiKey.value.trim(),
      timeout: Number(fields.timeout.value || defaults.timeout),
      maxTokens: Number(fields.maxTokens.value || 0),
      temperature: fields.temperature.value === "" ? "" : Number(fields.temperature.value),
      reasoningEffort: fields.reasoningEffort.value,
      stream: fields.stream.value,
      rememberKey: fields.rememberKey.checked,
      systemPrompt: fields.systemPrompt.value,
      userPrompt: fields.userPrompt.value,
      extraJson: fields.extraJson.value.trim()
    };
  }

  function validate(values) {
    if (!values.baseUrl) {
      throw new Error("请填写 API Base URL。");
    }
    if (!values.endpointPath) {
      throw new Error("请填写接口路径。");
    }
    if (!values.model) {
      throw new Error("请填写模型名称。");
    }
    if (!values.apiKey) {
      throw new Error("请填写 API Key。");
    }
    if (!values.userPrompt.trim()) {
      throw new Error("请填写 User Prompt。");
    }
  }

  function buildPayload(values) {
    const messages = [];
    if (values.systemPrompt.trim()) {
      messages.push({ role: "system", content: values.systemPrompt.trim() });
    }
    messages.push({ role: "user", content: values.userPrompt.trim() });

    const payload = {
      model: values.model,
      messages,
      stream: values.stream === "true"
    };

    if (values.maxTokens > 0) {
      payload.max_tokens = values.maxTokens;
    }
    if (values.temperature !== "") {
      payload.temperature = values.temperature;
    }
    if (values.reasoningEffort) {
      payload.reasoning_effort = values.reasoningEffort;
    }
    if (values.extraJson) {
      const extra = JSON.parse(values.extraJson);
      if (!extra || Array.isArray(extra) || typeof extra !== "object") {
        throw new Error("额外 JSON 参数必须是一个对象。");
      }
      Object.assign(payload, extra);
    }

    return payload;
  }

  function buildUrl(values, pathOverride) {
    const endpoint = pathOverride || values.endpointPath;
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    const base = values.baseUrl.replace(/\/+$/, "");
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
  }

  function buildHeaders(values) {
    return {
      "Authorization": `Bearer ${values.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  function updateRequestPreview() {
    try {
      const values = getFormValues();
      const payload = buildPayload(values);
      requestOutput.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      requestOutput.textContent = error.message;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const values = getFormValues();
    try {
      validate(values);
      const payload = buildPayload(values);
      updateRequestPreview();
      await runCompletion(values, payload);
    } catch (error) {
      setStatus("配置错误", "error");
      showToast(error.message, true);
    }
  }

  async function runCompletion(values, payload) {
    const url = buildUrl(values);
    const start = performance.now();
    const timeoutMs = Math.max(1, values.timeout || defaults.timeout) * 1000;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
    activeController = controller;

    setBusy(true);
    setStatus("请求中", "pending");
    answerOutput.textContent = payload.stream ? "" : "正在等待响应...";
    rawOutput.textContent = "";
    latestRaw = "";
    metricStatus.textContent = "-";
    metricTime.textContent = "-";
    metricChars.textContent = "0";
    activateTab("answer");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(values),
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const elapsed = performance.now() - start;
      metricStatus.textContent = `${response.status} ${response.statusText || ""}`.trim();
      metricTime.textContent = formatDuration(elapsed);

      if (payload.stream) {
        await readStreamResponse(response);
      } else {
        await readJsonResponse(response);
      }

      const ok = response.ok;
      setStatus(ok ? "请求完成" : "请求返回错误", ok ? "ok" : "error");
      addHistory(values, response.status, performance.now() - start);
      if (!ok) {
        showToast("接口返回了非 2xx 状态，请查看原始数据。", true);
      }
    } catch (error) {
      const message = normalizeFetchError(error);
      setStatus("请求失败", "error");
      answerOutput.textContent = message;
      rawOutput.textContent = message;
      latestRaw = message;
      metricStatus.textContent = "失败";
      showToast(message, true);
    } finally {
      window.clearTimeout(timeoutId);
      activeController = null;
      setBusy(false);
      metricTime.textContent = metricTime.textContent === "-" ? formatDuration(performance.now() - start) : metricTime.textContent;
    }
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    latestRaw = prettyJsonText(text);
    rawOutput.textContent = latestRaw || "(空响应)";

    const parsed = tryParseJson(text);
    const content = extractContent(parsed);
    answerOutput.textContent = content || latestRaw || "(空响应)";
    metricChars.textContent = String((answerOutput.textContent || "").length);
  }

  async function readStreamResponse(response) {
    if (!response.body) {
      const text = await response.text();
      rawOutput.textContent = text || "(空响应)";
      latestRaw = rawOutput.textContent;
      answerOutput.textContent = extractContent(tryParseJson(text)) || text;
      metricChars.textContent = String(answerOutput.textContent.length);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let raw = "";
    let content = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) {
          continue;
        }

        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          continue;
        }

        raw += `${data}\n`;
        const chunk = tryParseJson(data);
        const delta = chunk?.choices?.[0]?.delta;
        const text = delta?.content || delta?.reasoning_content || chunk?.choices?.[0]?.text || "";
        if (text) {
          content += text;
          answerOutput.textContent = content;
          metricChars.textContent = String(content.length);
        }
        rawOutput.textContent = raw;
        latestRaw = raw;
      }
    }

    if (!content && raw) {
      answerOutput.textContent = raw;
      metricChars.textContent = String(raw.length);
    }
  }

  async function handleModels() {
    const values = getFormValues();
    const start = performance.now();
    try {
      if (!values.baseUrl || !values.apiKey) {
        throw new Error("获取模型前请先填写 API Base URL 和 API Key。");
      }

      const url = buildUrl(values, "/models");
      const controller = new AbortController();
      activeController = controller;
      setBusy(true);
      setStatus("获取模型中", "pending");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${values.apiKey}`
        },
        signal: controller.signal
      });
      const text = await response.text();
      metricTime.textContent = formatDuration(performance.now() - start);
      const parsed = tryParseJson(text);
      latestRaw = prettyJsonText(text);
      rawOutput.textContent = latestRaw;
      answerOutput.textContent = formatModelList(parsed) || latestRaw;
      metricStatus.textContent = `${response.status} ${response.statusText || ""}`.trim();
      metricChars.textContent = String(answerOutput.textContent.length);
      activateTab("answer");
      setStatus(response.ok ? "模型列表已返回" : "获取模型失败", response.ok ? "ok" : "error");
    } catch (error) {
      const message = normalizeFetchError(error);
      setStatus("获取模型失败", "error");
      answerOutput.textContent = message;
      rawOutput.textContent = message;
      latestRaw = message;
      showToast(message, true);
    } finally {
      activeController = null;
      setBusy(false);
    }
  }

  function extractContent(parsed) {
    if (!parsed || typeof parsed !== "object") {
      return "";
    }

    const choice = parsed.choices?.[0];
    if (choice?.message?.content) {
      return normalizeMessageContent(choice.message.content);
    }
    if (choice?.text) {
      return choice.text;
    }
    if (parsed.output_text) {
      return parsed.output_text;
    }
    if (Array.isArray(parsed.output)) {
      return parsed.output
        .flatMap((item) => item.content || [])
        .map((part) => part.text || part.content || "")
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }

  function normalizeMessageContent(content) {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => part.text || part.content || "")
        .filter(Boolean)
        .join("\n");
    }
    return JSON.stringify(content, null, 2);
  }

  function formatModelList(parsed) {
    const models = parsed?.data;
    if (!Array.isArray(models)) {
      return "";
    }

    return models
      .map((model) => {
        const id = model.id || model.name || "(unknown)";
        const owner = model.owned_by ? `  ${model.owned_by}` : "";
        return `${id}${owner}`;
      })
      .join("\n");
  }

  function setBusy(isBusy) {
    sendButton.disabled = isBusy;
    modelsButton.disabled = isBusy;
    abortButton.disabled = !isBusy;
  }

  function abortActiveRequest() {
    if (activeController) {
      activeController.abort("user");
      showToast("请求已中断。");
    }
  }

  function setStatus(text, type) {
    statusLine.textContent = text;
    statusLine.style.color = type === "error" ? "var(--red)" : type === "ok" ? "var(--green)" : "var(--muted)";
  }

  function activateTab(tabName) {
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-content").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${tabName}`);
    });
  }

  function resetSettings() {
    localStorage.removeItem(STORAGE_KEY);
    Object.entries(defaults).forEach(([key, value]) => {
      const field = fields[key];
      if (!field) {
        return;
      }
      if (field.type === "checkbox") {
        field.checked = Boolean(value);
      } else {
        field.value = value;
      }
    });
    updateRequestPreview();
    saveSettings();
    showToast("配置已重置。");
  }

  function loadExample() {
    fields.baseUrl.value = "https://api.openai.com/v1";
    fields.endpointPath.value = "/chat/completions";
    fields.model.value = "gpt-4o-mini";
    fields.maxTokens.value = 800;
    fields.temperature.value = 0.7;
    fields.reasoningEffort.value = "";
    fields.stream.value = "true";
    fields.systemPrompt.value = "你是一个适合接口联调的助手，回答要短、清楚、可验证。";
    fields.userPrompt.value = "大模型的skill具体调用原理是什么";
    fields.extraJson.value = '{\n  "top_p": 0.9\n}';
    saveSettings();
    updateRequestPreview();
    showToast("示例已载入，请填入 API Key 后测试。");
  }

  function toggleKeyVisibility() {
    fields.apiKey.type = fields.apiKey.type === "password" ? "text" : "password";
  }

  async function copyCurl() {
    try {
      const values = getFormValues();
      const payload = buildPayload(values);
      const command = [
        `curl ${shellQuote(buildUrl(values))}`,
        "-X POST",
        `-H ${shellQuote("Content-Type: application/json")}`,
        `-H ${shellQuote(`Authorization: Bearer ${values.apiKey || "<YOUR_API_KEY>"}`)}`,
        `-d ${shellQuote(JSON.stringify(payload))}`
      ].join(" \\\n  ");

      await copyText(command);
      showToast("curl 已复制。");
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function copyResponse() {
    try {
      const text = latestRaw || rawOutput.textContent || answerOutput.textContent;
      await copyText(text);
      showToast("响应已复制。");
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function clearResponse() {
    latestRaw = "";
    answerOutput.textContent = "响应内容会显示在这里。";
    rawOutput.textContent = "原始 JSON 或 SSE 数据会显示在这里。";
    requestOutput.textContent = "发送前会在这里预览请求体。";
    metricStatus.textContent = "-";
    metricTime.textContent = "-";
    metricChars.textContent = "0";
    setStatus("等待请求", "idle");
    updateRequestPreview();
  }

  function addHistory(values, status, elapsed) {
    const item = {
      id: Date.now(),
      time: new Date().toLocaleString(),
      model: values.model,
      baseUrl: values.baseUrl,
      endpointPath: values.endpointPath,
      systemPrompt: values.systemPrompt,
      userPrompt: values.userPrompt,
      extraJson: values.extraJson,
      maxTokens: values.maxTokens,
      temperature: values.temperature,
      reasoningEffort: values.reasoningEffort,
      stream: values.stream,
      status,
      elapsed: formatDuration(elapsed)
    };
    const history = [item, ...readJson(HISTORY_KEY, [])].slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    const history = readJson(HISTORY_KEY, []);
    historyList.innerHTML = "";

    if (!history.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "还没有请求历史。";
      historyList.appendChild(empty);
      return;
    }

    history.forEach((item) => {
      const button = document.createElement("button");
      button.className = "history-item";
      button.type = "button";
      button.innerHTML = `
        <strong>${escapeHtml(item.model || "unknown model")}</strong>
        <span>${escapeHtml(String(item.status || "-"))} · ${escapeHtml(item.elapsed || "-")}</span>
        <p>${escapeHtml(item.userPrompt || "")}</p>
        <span>${escapeHtml(item.time || "")}</span>
      `;
      button.addEventListener("click", () => restoreHistoryItem(item));
      historyList.appendChild(button);
    });
  }

  function restoreHistoryItem(item) {
    fields.baseUrl.value = item.baseUrl || fields.baseUrl.value;
    fields.endpointPath.value = item.endpointPath || fields.endpointPath.value;
    fields.model.value = item.model || fields.model.value;
    fields.systemPrompt.value = item.systemPrompt || "";
    fields.userPrompt.value = item.userPrompt || "";
    fields.extraJson.value = item.extraJson || "";
    fields.maxTokens.value = item.maxTokens || "";
    fields.temperature.value = item.temperature ?? "";
    fields.reasoningEffort.value = item.reasoningEffort || "";
    fields.stream.value = item.stream || "false";
    saveSettings();
    updateRequestPreview();
    showToast("历史请求已恢复。");
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    showToast("历史已清空。");
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function tryParseJson(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function prettyJsonText(text) {
    const parsed = tryParseJson(text);
    return parsed ? JSON.stringify(parsed, null, 2) : text;
  }

  function normalizeFetchError(error) {
    if (error?.name === "AbortError" || error === "timeout") {
      return "请求被中断或已超时。";
    }

    const message = error?.message || String(error);
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
      return "浏览器无法完成请求。常见原因是目标 API 未允许 CORS、网络不可达，或 API Base URL 填写不正确。";
    }
    return message;
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms)) {
      return "-";
    }
    if (ms < 1000) {
      return `${Math.round(ms)} ms`;
    }
    return `${(ms / 1000).toFixed(2)} s`;
  }

  function shellQuote(value) {
    return `'${String(value).replace(/'/g, "'\\''")}'`;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) {
      throw new Error("复制失败，请手动选择文本复制。");
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message, isError) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 2600);
  }
})();

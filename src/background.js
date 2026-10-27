function normalizeEndpoint(endpoint) {
  return String(endpoint || "http://localhost:11434").replace(/\/+$/, "");
}

async function requestJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Endpoint returned non-JSON data (${response.status})`);
    }
    if (!response.ok) throw new Error(data.error || `Endpoint failed (${response.status})`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function headersFor(settings) {
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  return headers;
}

let gemmaQueue = Promise.resolve();

function enqueueGemma(operation) {
  const result = gemmaQueue.then(operation, operation);
  gemmaQueue = result.catch(() => {});
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith("GEMMA_")) return false;

  (async () => {
    const settings = message.settings || {};
    const endpoint = normalizeEndpoint(settings.endpoint);

    if (message.type === "GEMMA_HEALTH") {
      const tags = await requestJson(`${endpoint}/api/tags`, {
        headers: headersFor(settings)
      }, 7000);
      const modelNames = (tags.models || []).map((model) => model.name || model.model);
      return {
        endpoint,
        model: settings.model,
        installed: modelNames.some((name) => name === settings.model || name?.startsWith(`${settings.model}:`)),
        models: modelNames
      };
    }

    if (message.type === "GEMMA_CHAT") {
      return enqueueGemma(async () => {
        const body = {
          model: settings.model,
          messages: message.messages,
          stream: false,
          think: false,
          format: message.schema,
          keep_alive: "30m",
          options: {
            num_predict: 192,
            temperature: 0,
            top_p: 0.9
          }
        };
        const response = await requestJson(`${endpoint}/api/chat`, {
          method: "POST",
          headers: headersFor(settings),
          body: JSON.stringify(body)
        }, 30000);
        const content = response?.message?.content;
        if (!content) throw new Error("Gemma returned an empty response");
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error("Gemma returned invalid JSON");
        }
        return {
          result: parsed,
          metrics: {
            totalDurationNs: response.total_duration,
            loadDurationNs: response.load_duration,
            promptTokens: response.prompt_eval_count,
            outputTokens: response.eval_count
          }
        };
      });
    }

    throw new Error("Unsupported Gemma request");
  })()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("SignBridge AI installed");
});

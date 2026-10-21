const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

// Tried in order: the stable model first, newer ones next, lite models as a last resort.
// The next model is used only when Google says the current one is overloaded (503)
// or not available (404); those failures do not count against the quota.
const MODELS = [
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest"
];
const FALLBACK_STATUSES = [404, 503];
const RETRY_ROUNDS = 2;
const RETRY_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 90000;
const TOTAL_DEADLINE_MS = 180000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryModel(model, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    );
    return await response.json();
  } catch (err) {
    if (err.name !== "AbortError") throw err;
    return { error: { code: 503, message: `Gemini model ${model} took too long to respond. Please try again.` } };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateContent(body) {
  let lastError;
  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  for (let round = 0; round < RETRY_ROUNDS; round++) {
    if (round > 0) await sleep(RETRY_DELAY_MS);
    for (const model of MODELS) {
      if (Date.now() > deadline) throw lastError || new Error("Gemini took too long to respond. Please try again.");
      const data = await tryModel(model, body);
      if (!data.error) return data;

      lastError = new Error(data.error.message || "Gemini API error");
      if (!FALLBACK_STATUSES.includes(data.error.code)) throw lastError;
      console.warn(`Gemini model ${model} unavailable (${data.error.code}), trying next model...`);
    }
  }
  throw lastError;
}

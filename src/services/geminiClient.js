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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryModel(model, body) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  return response.json();
}

export async function generateContent(body) {
  let lastError;
  for (let round = 0; round < RETRY_ROUNDS; round++) {
    if (round > 0) await sleep(RETRY_DELAY_MS);
    for (const model of MODELS) {
      const data = await tryModel(model, body);
      if (!data.error) return data;

      lastError = new Error(data.error.message || "Gemini API error");
      if (!FALLBACK_STATUSES.includes(data.error.code)) throw lastError;
      console.warn(`Gemini model ${model} unavailable (${data.error.code}), trying next model...`);
    }
  }
  throw lastError;
}

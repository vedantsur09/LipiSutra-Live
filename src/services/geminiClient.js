const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

// Tried in order. The next model is used only when Google says the current one
// is overloaded (503) or not available (404), so quota is not wasted on retries.
const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const FALLBACK_STATUSES = [404, 503];

export async function generateContent(body) {
  let lastError;
  for (const model of MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    const data = await response.json();
    if (!data.error) return data;

    lastError = new Error(data.error.message || "Gemini API error");
    if (!FALLBACK_STATUSES.includes(data.error.code)) throw lastError;
    console.warn(`Gemini model ${model} unavailable (${data.error.code}), trying next model...`);
  }
  throw lastError;
}

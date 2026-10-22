import { generateContent } from "./geminiClient";

// Bump whenever the prompts change so cached AI results from older prompts are re-analysed
export const ANALYSIS_VERSION = 2;

const MAX_OUTPUT_TOKENS = 16384;

class GeminiParseError extends Error {}

async function callEngine(base64Image, mimeType, prompt, temperature) {
  const data = await generateContent({
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: temperature,
      topK: 32,
      topP: 0.95,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json"
    }
  });

  const candidate = data.candidates?.[0];
  const raw = (candidate?.content?.parts || [])
    .filter(part => part.text && !part.thought)
    .map(part => part.text)
    .join("");

  if (!raw) {
    console.error("Gemini returned no text:", JSON.stringify(data));
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason;
    throw new Error(reason ? `Gemini returned no result (${reason}). Please try another image.` : "Gemini returned no result.");
  }

  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim());
  } catch {
    const tooLong = candidate?.finishReason === "MAX_TOKENS";
    throw new GeminiParseError(tooLong
      ? "This document is too long to analyse in one pass. Try cropping it into smaller sections."
      : "Gemini returned an unreadable response. Please try again.");
  }
}

function normalizeAccuracy(value) {
  const number = parseFloat(String(value ?? "").replace("%", ""));
  if (isNaN(number)) return undefined;
  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
}

function normalizeLocations(locations) {
  if (!Array.isArray(locations)) return [];
  return locations.filter(loc =>
    (typeof loc === "string" && loc.trim()) ||
    (loc && typeof loc.name === "string" && loc.name.trim())
  );
}

export async function analyzeDocument(base64Image, mimeType = "image/jpeg") {
  console.log(">>> [ROUTER] Firing Gatekeeper Pre-Scan...");
  
  const gatekeeperPrompt = `Analyze the physical condition of this manuscript. Is it torn, severely degraded, blurred, or physically missing text? Return ONLY exactly {"is_damaged": true} or {"is_damaged": false}.`;
  
  let isDamaged = false;
  try {
    const gatekeeperResult = await callEngine(base64Image, mimeType, gatekeeperPrompt, 0.0);
    isDamaged = gatekeeperResult.is_damaged === true;
  } catch (err) {
    // An unparseable pre-scan should not block the main analysis
    if (!(err instanceof GeminiParseError)) throw err;
    console.warn(">>> [ROUTER] Gatekeeper response unreadable, assuming undamaged.");
  }
  console.log(">>> [ROUTER] Gatekeeper analysis: is_damaged =", isDamaged);

  const schemaContract = `
Schema Contract (Must be populated in this EXACT order):
{
  "script": "detected script name",
  "era": "estimated historical period",
  "overallAccuracy": "global percentage string (e.g., '85%')",
  "transcript": "full transcribed text including XML tags if damaged",
  "aiPredictions": ["Array of words inside <predict> tags"],
  "reconstructionNeeded": ["Array of words inside <reconstruct> tags"],
  "modernMarathi": "translation into modern Marathi",
  "summary": "2-3 sentence English summary",
  "locations": [{"name": "place named in the document", "lat": 0.0, "lng": 0.0}]
}

For "locations", list only places actually named in the document (empty array if none), with your best known latitude and longitude for each.

CRITICAL: You MUST generate the transcript first. Only AFTER it is reconstructed should you read it to generate the modernMarathi and summary. Generate a global percentage string (e.g., '85%') for overallAccuracy.

HONESTY RULES — THESE OVERRIDE EVERYTHING ELSE:
1. NEVER invent proper nouns (people, rulers, titles, places), dates or numbers. Write them only if their letters are actually visible in the image.
2. If a word cannot be read and the surrounding text does not make it near-certain, write [अस्पष्ट] instead of guessing.
3. NEVER repeat phrases to fill space. Each line of the transcript must correspond to a real line in the image.
4. Before answering, check that script, era, names and dates agree with each other. If they conflict, drop the unsupported claim and set "era" to "Uncertain".
5. overallAccuracy must reflect the share of words read with certainty. If most words are predicted, reconstructed or [अस्पष्ट], it must be below 50%.
6. The summary must not state names or dates that appear only inside <predict> or <reconstruct> tags; call them "possibly" instead.`;

  let finalPayload;

  if (isDamaged) {
    console.log(">>> [ROUTER] Artifact damaged. Engaging ENGINE 2 (The Reconstructor) at 0.2 Temp...");
    const engine2Prompt = `You are a speculative paleographer operating a 'Fill-in-the-Blanks' pipeline.

STRICT FORMATTING RULES — THESE OVERRIDE EVERYTHING ELSE:
1. NO ARTIFICIAL SPACING: Output natural, complete Devanagari/Modi words only. NEVER split a word into individual characters or syllables with spaces (e.g., output "शिवाजी" NEVER "श ि व ा ज ी"). Each word is a single unbroken token.
2. MINIMAL TAGGING: The vast majority of the transcript must be plain, untagged text. If a word is clearly legible, it gets NO tags whatsoever.
3. STRICT <predict>: Use <predict confidence="0.x">word</predict> ONLY for words that are highly faded or partially visible but can still be partially read. Do NOT wrap every word. Reserve this for genuinely uncertain words.
4. STRICT <reconstruct>: Use <reconstruct>word</reconstruct> ONLY for completely destroyed or physically missing sections where the surrounding text makes the word near-certain (e.g. a standard formula). Otherwise write [अस्पष्ट]. This should be rare.

Now execute this sequence:
Step 1: Read and transliterate all perfectly visible text literally. Do not alter it.
Step 2: Identify the torn/missing gaps.
Step 3: Predict ONLY the missing words that context makes near-certain; mark every other gap as [अस्पष्ट].
Step 4: Apply <predict> tags ONLY to faded-but-readable words. Route to aiPredictions array.
Step 5: Apply <reconstruct> tags ONLY to completely missing words. Route to reconstructionNeeded array.
Step 6: Output combined plain text and minimally-tagged predictions into the final transcript string.
${schemaContract}`;
    
    finalPayload = await callEngine(base64Image, mimeType, engine2Prompt, 0.2);
  } else {
    console.log(">>> [ROUTER] Artifact pristine. Engaging ENGINE 1 (Literal OCR) at 0.1 Temp...");
    const engine1Prompt = `Transliterate and translate exactly what is visible. Do not guess. Return the JSON object defined in the Schema Contract below. Provide empty arrays for aiPredictions and reconstructionNeeded.
${schemaContract}`;

    finalPayload = await callEngine(base64Image, mimeType, engine1Prompt, 0.1);
  }

  // Normalise fields so the UI never receives undefined arrays or odd accuracy formats
  return {
    ...finalPayload,
    overallAccuracy: normalizeAccuracy(finalPayload.overallAccuracy),
    aiPredictions: Array.isArray(finalPayload.aiPredictions) ? finalPayload.aiPredictions : [],
    reconstructionNeeded: Array.isArray(finalPayload.reconstructionNeeded) ? finalPayload.reconstructionNeeded : [],
    locations: normalizeLocations(finalPayload.locations)
  };
}
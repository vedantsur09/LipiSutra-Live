import { generateContent } from "./geminiClient";

async function callEngine(base64Image, prompt, temperature) {
  const data = await generateContent({
    contents: [{
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64Image } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: temperature,
      topK: 32,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: "application/json"
    }
  });
  
  if (!data.candidates) {
    console.error("Gemini API error:", JSON.stringify(data));
    throw new Error(data.error?.message || "Gemini API returned no result");
  }
  
  const raw = data.candidates[0].content.parts[0].text;
  return JSON.parse(raw.trim());
}

export async function analyzeDocument(base64Image) {
  console.log(">>> [ROUTER] Firing Gatekeeper Pre-Scan...");
  
  const gatekeeperPrompt = `Analyze the physical condition of this manuscript. Is it torn, severely degraded, blurred, or physically missing text? Return ONLY exactly {"is_damaged": true} or {"is_damaged": false}.`;
  
  const gatekeeperResult = await callEngine(base64Image, gatekeeperPrompt, 0.0);
  const isDamaged = gatekeeperResult.is_damaged === true;
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
  "locations": ["Array of geographical locations identified (empty if none)"]
}

CRITICAL: You MUST generate the transcript first. Only AFTER it is reconstructed should you read it to generate the modernMarathi and summary. Generate a global percentage string (e.g., '85%') for overallAccuracy.`;

  let finalPayload;

  if (isDamaged) {
    console.log(">>> [ROUTER] Artifact damaged. Engaging ENGINE 2 (The Reconstructor) at 0.7 Temp...");
    const engine2Prompt = `You are a speculative paleographer operating a 'Fill-in-the-Blanks' pipeline.

STRICT FORMATTING RULES — THESE OVERRIDE EVERYTHING ELSE:
1. NO ARTIFICIAL SPACING: Output natural, complete Devanagari/Modi words only. NEVER split a word into individual characters or syllables with spaces (e.g., output "शिवाजी" NEVER "श ि व ा ज ी"). Each word is a single unbroken token.
2. MINIMAL TAGGING: The vast majority of the transcript must be plain, untagged text. If a word is clearly legible, it gets NO tags whatsoever.
3. STRICT <predict>: Use <predict confidence="0.x">word</predict> ONLY for words that are highly faded or partially visible but can still be partially read. Do NOT wrap every word. Reserve this for genuinely uncertain words.
4. STRICT <reconstruct>: Use <reconstruct>word</reconstruct> ONLY for completely destroyed or physically missing sections where you are inferring from context alone with zero visible evidence. This should be rare.

Now execute this sequence:
Step 1: Read and transliterate all perfectly visible text literally. Do not alter it.
Step 2: Identify the torn/missing gaps.
Step 3: Predict ONLY the missing words to fill those gaps.
Step 4: Apply <predict> tags ONLY to faded-but-readable words. Route to aiPredictions array.
Step 5: Apply <reconstruct> tags ONLY to completely missing words. Route to reconstructionNeeded array.
Step 6: Output combined plain text and minimally-tagged predictions into the final transcript string.
${schemaContract}`;
    
    finalPayload = await callEngine(base64Image, engine2Prompt, 0.7);
  } else {
    console.log(">>> [ROUTER] Artifact pristine. Engaging ENGINE 1 (Literal OCR) at 0.1 Temp...");
    const engine1Prompt = `Transliterate and translate exactly what is visible. Do not guess. Return the JSON object defined in the Schema Contract below. Provide empty arrays for aiPredictions and reconstructionNeeded.
${schemaContract}`;

    finalPayload = await callEngine(base64Image, engine1Prompt, 0.1);
  }

  // Ensure arrays exist naturally to prevent undefined map crashes downstream safely
  finalPayload.aiPredictions = finalPayload.aiPredictions || [];
  finalPayload.reconstructionNeeded = finalPayload.reconstructionNeeded || [];
  finalPayload.locations = finalPayload.locations || [];

  return finalPayload;
}
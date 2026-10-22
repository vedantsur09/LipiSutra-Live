import { generateContent } from "./geminiClient";

export async function translateText(text, targetLang) {
  try {
    const prompt = `Translate the following text into the ISO-639-1 language code '${targetLang}'. Return strictly ONLY the translated text, nothing else. Text to translate:\n\n${text}`;
    const data = await generateContent({
      contents: [{ parts: [{ text: prompt }] }]
    });
    const translated = (data.candidates?.[0]?.content?.parts || [])
      .filter(part => part.text && !part.thought)
      .map(part => part.text)
      .join("")
      .trim();
    if (!translated) throw new Error("Gemini returned an empty translation.");
    return translated;
  } catch (err) {
    console.error("Translation API Error:", err);
    return "Error: Could not translate the text. " + err.message;
  }
}
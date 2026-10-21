import { generateContent } from "./geminiClient";

export async function translateText(text, targetLang) {
  try {
    const prompt = `Translate the following text into the ISO-639-1 language code '${targetLang}'. Return strictly ONLY the translated text, nothing else. Text to translate:\n\n${text}`;
    const data = await generateContent({
      contents: [{ parts: [{ text: prompt }] }]
    });
    return data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error("Translation API Error:", err);
    return "Error: Could not translate the text. " + err.message;
  }
}
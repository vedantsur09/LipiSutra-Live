const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

export async function translateText(text, targetLang) {
  try {
    const prompt = `Translate the following text into the ISO-639-1 language code '${targetLang}'. Return strictly ONLY the translated text, nothing else. Text to translate:\n\n${text}`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error("Translation API Error:", err);
    return "Error: Could not translate the text. " + err.message;
  }
}
import { stripAnnotationTags } from "../utils/documents";

export function speakText(text, langCode = "hi-IN") {
  // Strip all XML prediction/reconstruction tags before speaking
  const cleanText = stripAnnotationTags(text);
  const langPrefix = langCode.split("-")[0];

  if (!window.speechSynthesis) {
    console.error("Web Speech API not supported in this browser.");
    return;
  }

  // Cancel any stuck silent queues
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = langCode;
  utterance.volume = 1;
  utterance.rate = 0.9;
  utterance.pitch = 1;

  function assignVoiceAndSpeak() {
    const voices = window.speechSynthesis.getVoices();
    // Prefer a voice for the chosen language, falling back to Hindi/Marathi for Indic text
    const voice = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix)) ||
      (langPrefix === "en" ? null : voices.find(v => v.lang.startsWith("hi") || v.lang.startsWith("mr")));
    if (voice) {
      utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
  }

  // Chrome async bug: getVoices() is empty on first call — wait for onvoiceschanged
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    assignVoiceAndSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null; // prevent repeated firing
      assignVoiceAndSpeak();
    };
  }
}
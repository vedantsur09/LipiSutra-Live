import { useState } from "react";
import { translateText } from "../services/translate";
import { speakText } from "../services/tts";
import { stripAnnotationTags, parseAccuracy } from "../utils/documents";
import { isSupportedImage, readFileAsBase64 } from "../utils/images";
import MapSection from "./MapSection";
import UploadSection from "./UploadSection";

const langCodes = { hi: "hi-IN", gu: "gu-IN", te: "te-IN", en: "en-US" };
const LOW_LEGIBILITY_RATIO = 0.15;
const LOW_ACCURACY_PERCENT = 60;
const DEFAULT_PREDICTION_CONFIDENCE = 0.5;
const ANNOTATION_SPLIT = /(<predict[^>]*>[\s\S]*?<\/predict>|<reconstruct[^>]*>[\s\S]*?<\/reconstruct>|<verified[^>]*>[\s\S]*?<\/verified>)/g;

export default function PublicView({ theme }) {
  const [image, setImage] = useState(null);
  const [base64, setBase64] = useState(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState("hi");
  const [translation, setTranslation] = useState("");
  const [activeTab, setActiveTab] = useState("summary"); // "summary", "translation", "origin"
  const [isTranslating, setIsTranslating] = useState(false);

  // A new result (or none) always starts on the summary tab with no stale translation
  function handleResult(nextResult) {
    setResult(nextResult);
    setTranslation("");
    setActiveTab("summary");
  }

  function clearImage() {
    if (image) URL.revokeObjectURL(image);
    setImage(null);
    setBase64(null);
  }

  function handleReset() {
    clearImage();
    handleResult(null);
    setLoading(false);
  }

  async function handleFileDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (e.target?.value) e.target.value = "";
    if (!file) return;
    if (!isSupportedImage(file)) {
      alert("Please upload an image file (JPG, PNG or WebP).");
      return;
    }

    clearImage();
    handleResult(null);
    setImage(URL.createObjectURL(file));
    setMimeType(file.type);
    try {
      setBase64(await readFileAsBase64(file));
    } catch (err) {
      console.error("Could not read image:", err);
      alert("Could not read this image. Please try another file.");
      handleReset();
    }
  }

  function handleLangChange(nextLang) {
    setLang(nextLang);
    setTranslation("");
  }

  // Flags results where the AI had to guess a large share of the words
  const isLowLegibility = (res) => {
    const transcript = res?.transcript || "";
    const totalWords = transcript.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    if (totalWords === 0) return false;
    const uncertainWords = (transcript.match(/<predict[^>]*>|<reconstruct[^>]*>|\[अस्पष्ट\]/g) || []).length;
    const hasAccuracy = res?.overallAccuracy !== undefined && res?.overallAccuracy !== null && res?.overallAccuracy !== "";
    return uncertainWords / totalWords > LOW_LEGIBILITY_RATIO || (hasAccuracy && parseAccuracy(res.overallAccuracy) < LOW_ACCURACY_PERCENT);
  };

  const renderTranscription = (transcript) => {
    if (!transcript) return <span className="opacity-50">No transcript extracted.</span>;
    
    // Split by <predict>, <reconstruct>, or <verified> tags
    const parts = transcript.split(ANNOTATION_SPLIT);
    
    return parts.map((part, i) => {
      if (!part) return null;
      
      const predictMatch = part.match(/^<predict([^>]*)>([\s\S]*)<\/predict>$/);
      if (predictMatch) {
        const confidenceMatch = predictMatch[1].match(/confidence\s*=\s*["']?([\d.]+)/);
        const parsedConfidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : NaN;
        const confidence = isNaN(parsedConfidence)
          ? DEFAULT_PREDICTION_CONFIDENCE
          : Math.min(parsedConfidence > 1 ? parsedConfidence / 100 : parsedConfidence, 1);
        const word = predictMatch[2];
        const opacity = Math.min(Math.max(confidence, 0.2), 0.9);
        
        return (
          <span key={i} className="text-gold-500 relative group cursor-help transition-all"
                style={{ display: 'inline', padding: '1px 4px', borderRadius: '3px', fontSize: 'inherit', backgroundColor: `rgba(212, 175, 55, ${opacity * 0.3})`, boxShadow: `0 0 ${opacity * 15}px rgba(212,175,55, ${opacity * 0.5})` }}>
            {word}
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-amber-900 border border-gold-500 text-gold-500 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded shadow-xl whitespace-nowrap z-50 pointer-events-none">
              AI Prediction ({Math.round(confidence * 100)}%)
            </span>
          </span>
        );
      }
      
      const reconstructMatch = part.match(/^<reconstruct[^>]*>([\s\S]*)<\/reconstruct>$/);
      if (reconstructMatch) {
        const word = reconstructMatch[1];
        return (
          <span key={i} className="relative group cursor-help transition-all"
                style={{ background: "rgba(220,38,38,0.15)", color: "#FCA5A5", padding: "2px 5px", borderRadius: "4px", margin: "0 2px" }}>
            {word}
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-900 border border-red-500 text-white text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded shadow-xl whitespace-nowrap z-50 pointer-events-none">
              Reconstruction
            </span>
          </span>
        );
      }
      
      const verifiedMatch = part.match(/^<verified[^>]*>([\s\S]*)<\/verified>$/);
      if (verifiedMatch) {
        const word = verifiedMatch[1];
        return (
          <span key={i} className="inline-block bg-purple-500/20 border border-purple-500 text-purple-300 px-2 py-0.5 rounded-md mx-0.5 text-sm">
            {word}
          </span>
        );
      }
      
      return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 min-h-screen outline-none">

      {/* LANDING PAGE (No Image, No Result) */}
      {!image && !result && (
        <div className="flex flex-col items-center animate-[fadeIn_0.6s_ease-out]">

          {/* Hero Section */}
          <div className="text-center mt-12 mb-20 max-w-4xl">
            <h1 className="text-5xl md:text-7xl font-heading font-black mb-8 drop-shadow-md tracking-tight leading-tight" style={{ color: theme.accent }}>
              Decode the Past <br /><span style={{ color: theme.text }}>Preserve the Future.</span>
            </h1>
            <p className="text-lg md:text-xl font-light mb-12 max-w-2xl mx-auto leading-relaxed" style={{ color: theme.text }}>
              Upload ancient manuscripts, engraved decrees, or faded scrolls. Our AI neural engine instantly translates lost scripts and traces them back to their exact geographical origins.
            </p>


          </div>

          {/* Upload Dropzone */}
          <div
            className="w-full max-w-3xl border-dashed backdrop-blur-sm rounded-3xl p-16 md:p-24 flex flex-col items-center justify-center transition-all cursor-pointer group relative overflow-hidden"
            style={{ backgroundColor: theme.headerBg, borderColor: theme.accent, color: theme.text, borderWidth: '2px', boxShadow: theme.cardShadow }}
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => document.getElementById("file-input").click()}
          >
            <div className="w-20 h-20 bg-museum-900 rounded-full flex items-center justify-center mb-6 shadow-inner border border-museum-700/50 group-hover:scale-110 transition-transform duration-500">
              <span className="text-4xl">📜</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-heading text-gold-500 mb-3 font-semibold tracking-wide">Upload Artifact Image</h2>
            <p className="text-slate-400 font-light text-center text-sm md:text-base">
              Drag and drop a high-resolution image of your historical document, or <span className="text-gold-400 underline decoration-gold-500/30 underline-offset-4">browse files</span>.
            </p>
            <input type="file" id="file-input" accept="image/*" onChange={handleFileDrop} className="hidden" />
          </div>

        </div>
      )}


      {/* ANALYSIS PIPELINE & RESULTS (Image Selected) */}
      {(image) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-8 animate-[fadeIn_0.5s_ease-out]">

          {/* Left Column: Artifact Preview */}
          <UploadSection image={image} base64={base64} mimeType={mimeType} loading={loading} setLoading={setLoading} onResult={handleResult} onReset={handleReset} theme={theme} />


          {/* Right Column: Loading Skeleton or Tabbed Results */}
          <div className="lg:col-span-7">

            {/* SKELETON LOADER */}
            {loading && (
              <div className="w-full h-full animate-[fadeIn_0.5s_ease-out]">
                <div className="w-full mb-6 flex gap-4 border-b border-museum-800 pb-3">
                  <div className="h-4 bg-museum-800/50 w-24 rounded animate-pulse"></div>
                  <div className="h-4 bg-museum-800/50 w-24 rounded animate-pulse"></div>
                  <div className="h-4 bg-museum-800/50 w-24 rounded animate-pulse"></div>
                </div>
                <div className="bg-museum-800/30 p-8 rounded-2xl border border-museum-700/50 shadow-xl w-full h-[550px] relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-museum-700/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                  <div className="grid grid-cols-2 gap-8 mb-12">
                    <div>
                      <div className="h-3 bg-museum-800 w-20 rounded mb-4"></div>
                      <div className="h-10 bg-museum-700/50 w-48 rounded"></div>
                    </div>
                    <div>
                      <div className="h-3 bg-museum-800 w-20 rounded mb-4"></div>
                      <div className="h-10 bg-museum-700/50 w-32 rounded"></div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 bg-museum-700/50 w-full rounded"></div>
                    <div className="h-4 bg-museum-700/50 w-[90%] rounded"></div>
                    <div className="h-4 bg-museum-700/50 w-[95%] rounded"></div>
                    <div className="h-4 bg-museum-700/50 w-[80%] rounded"></div>
                    <div className="h-4 bg-museum-700/50 w-[85%] rounded"></div>
                  </div>
                </div>
              </div>
            )}
            {/* ACTUAL RESULTS (TABBED UI) */}
            {result && !loading && (
              <div className="w-full flex flex-col gap-12 animate-[fadeIn_0.5s_ease-out]">

                {/* Top Row: Artifact vs Analysis (Split Layout) */}
                <div className="grid grid-cols-1 gap-10 items-start">

                  {/* Analysis Tabs - Full Width */}
                  <div className="w-full flex flex-col h-full">
                    {/* Tabs */}
                    <div className="flex border-b border-white/10 mb-6 overflow-x-auto no-scrollbar gap-8 pb-1">
                      {[
                        { id: 'summary', label: 'Summary' },
                        { id: 'translation', label: 'Linguistic Analysis' },
                        { id: 'origin', label: 'Geographic Provenience' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className="pb-3 shrink-0 text-[10px] font-black tracking-[0.2em] uppercase transition-all duration-300 relative top-[2px]"
                          style={{
                             color: activeTab === tab.id ? theme.accent : theme.subtext,
                             borderBottom: activeTab === tab.id ? `2.5px solid ${theme.accent}` : '2.5px solid transparent'
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Panes */}
                    <div className="backdrop-blur-xl p-8 md:p-12 rounded-2xl flex-1 min-h-[450px]"
                         style={{ backgroundColor: theme.headerBg, border: `1.5px solid ${theme.border}`, boxShadow: theme.cardShadow }}>
                      {activeTab === 'summary' && (
                        <div className="animate-[fadeIn_0.4s_ease-out]">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-12 pb-8 border-b border-white/5">
                            <div>
                              <div className="text-[10px] uppercase font-black tracking-widest mb-3" style={{ color: theme.subtext }}>Palaeographic Script</div>
                              <div className="text-3xl font-heading font-black drop-shadow-lg" style={{ color: theme.accent }}>{result.script || result.inferredScript}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase font-black tracking-widest mb-3" style={{ color: theme.subtext }}>Chronological Era</div>
                              <div className="text-3xl font-heading font-black" style={{ color: theme.accent }}>{result.era || "Unknown"}</div>
                            </div>
                          </div>
                          <h4 className="text-[10px] font-black tracking-widest uppercase mb-6" style={{ color: theme.subtext }}>Scientific Abstract</h4>
                          <p className="text-xl font-light leading-relaxed italic border-l-[3px] shadow-sm pl-8 py-2" style={{ color: theme.text, borderColor: theme.accent, backgroundColor: theme.surface }}>
                            "{result.summary || "No summary available."}"
                          </p>
                        </div>
                      )}

                      {activeTab === 'translation' && (
                        <div className="animate-[fadeIn_0.4s_ease-out]">
                          <h4 className="text-[10px] font-black tracking-widest uppercase mb-8" style={{ color: theme.subtext }}>Decryption & Translation Layer</h4>
                          <div className="flex flex-col sm:flex-row gap-4 mb-10 p-6 rounded-xl border shadow-inner" style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
                            <select value={lang} onChange={e => handleLangChange(e.target.value)} className="flex-1 px-6 py-4 rounded-xl focus:outline-none font-bold text-xs tracking-widest uppercase" style={{ backgroundColor: theme.headerBg, borderColor: theme.border, color: theme.accent }}>
                              <option value="en">English (Universal)</option>
                              <option value="hi">हिन्दी (Hindi)</option>
                              <option value="gu">ગુજરાતી (Gujarati)</option>
                              <option value="te">తెలుగు (Telugu)</option>
                            </select>
                            <button
                              onClick={async () => {
                                setIsTranslating(true);
                                try {
                                  const t = await translateText(stripAnnotationTags(result.modernMarathi || result.transcript), lang);
                                  setTranslation(t);
                                } catch (e) {
                                  console.error(e);
                                  setTranslation("Translation failed.");
                                } finally {
                                  setIsTranslating(false);
                                }
                              }}
                              disabled={isTranslating}
                              className="px-10 py-4 rounded-xl transition-all font-black text-[10px] tracking-[0.2em] uppercase disabled:opacity-50"
                              style={{ backgroundColor: theme.accentGlow, color: theme.buttonText, boxShadow: theme.cardShadow }}
                            >
                              {isTranslating ? "Processing..." : "Decrypt Metadata"}
                            </button>
                          </div>

                          {translation && (
                            <div className="p-8 rounded-xl border-t-[3px] shadow-inner" style={{ backgroundColor: theme.surface, borderColor: theme.accent }}>
                              <p className="text-lg leading-relaxed mb-10 font-light" style={{ color: theme.text }}>{translation}</p>
                              <button onClick={() => {
                                  speakText(stripAnnotationTags(translation), langCodes[lang]);
                                }} 
                                      className="px-10 py-4 rounded-xl text-[10px] font-black tracking-[0.2em] uppercase transition-all hover:-translate-y-1 flex items-center justify-center gap-3 w-full sm:w-auto"
                                      style={{ backgroundColor: theme.accentGlow, color: theme.buttonText, boxShadow: theme.cardShadow }}
                              >
                                🔊 Execute Audio Reproduction
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'origin' && (
                        <div className="w-full h-full flex flex-col">
                          <h4 className="text-[10px] font-black tracking-widest uppercase mb-6" style={{ color: theme.subtext }}>Geographical Provenience</h4>
                          <div className="flex-1 rounded-2xl overflow-hidden border shadow-inner relative z-0" style={{ borderColor: theme.border }}>
                            <MapSection locations={result?.locations} theme={theme} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Full Width Transcript Section (Fixes left gap & width) */}
                <div className="w-full mt-4 animate-[fadeIn_0.6s_ease-out]">
                  <div className="flex items-center justify-between mb-6 pl-1">
                    <h3 className="text-xs font-bold tracking-[0.3em] uppercase text-center lg:text-left" style={{ color: theme.subtext }}>Original Paleographic Transcript</h3>
                    {result.overallAccuracy && (
                      <span className="text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full border" style={{ color: theme.accent, borderColor: theme.accent, backgroundColor: `${theme.accent}15` }}>
                        Accuracy: {result.overallAccuracy}
                      </span>
                    )}
                  </div>
                  {isLowLegibility(result) && (
                    <div className="mb-6 px-5 py-4 rounded-2xl border border-red-500/60 bg-red-900/20 text-red-200 text-sm leading-relaxed">
                      <span className="font-black tracking-widest uppercase text-xs text-red-400">Low legibility</span>
                      <span className="mx-2">·</span>
                      Large parts of this document could not be read with confidence. Highlighted words are AI guesses, and [अस्पष्ट] marks unreadable text. Expert verification is recommended before citing names or dates.
                    </div>
                  )}
                  <div className="backdrop-blur-2xl p-10 md:p-16 rounded-3xl"
                       style={{ backgroundColor: theme.headerBg, border: `1.5px solid ${theme.border}`, boxShadow: theme.cardShadow }}>
                    <div className="text-lg md:text-xl font-serif leading-[2.4] drop-shadow-sm" style={{ color: theme.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {renderTranscription(result.transcript)}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

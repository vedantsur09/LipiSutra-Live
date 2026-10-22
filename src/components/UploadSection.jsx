import { useState, useEffect, useRef } from "react";
import { analyzeDocument } from "../services/gemini";
import { saveDocument, checkExistingHash } from "../services/firebase";
import { createThumbnail } from "../utils/images";

const MESSAGES = [
  "Scanning document...",
  "Detecting script...",
  "Transcribing text...",
  "Analyzing historical context...",
  "Generating summary..."
];
// Typical Gemini time for a manuscript; the bar waits at 90% if it takes longer
const EXPECTED_DURATION_MS = 45000;
const MESSAGE_INTERVAL_MS = 6000;

async function generateHash(message) {
  console.log('>>> [HASH] generateHash Initiated');
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('>>> [HASH] Generated Strict Hash String:', hashHex);
  return hashHex;
}

export default function UploadSection({ image, base64, mimeType, loading, setLoading, onResult, onReset, theme }) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  // Identifies the latest analysis so a result arriving after a reset is ignored
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!loading) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min((elapsed / EXPECTED_DURATION_MS) * 90, 90));
      // Advance through the messages once and stay on the last one
      setMessageIndex(Math.min(Math.floor(elapsed / MESSAGE_INTERVAL_MS), MESSAGES.length - 1));
    }, 100);
    return () => clearInterval(interval);
  }, [loading]);

  async function handleAnalyze() {
    if (!base64 || loading) return;

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    setLoading(true);
    setProgress(0);
    setMessageIndex(0);

    try {
      console.log(">>> [PIPELINE] Starting Analysis...");
      const hash = await generateHash(base64);
      const cachedData = await checkExistingHash(hash);

      if (cachedData) {
        console.log('>>> [PIPELINE] Intercepted! Bypassing Gemini and rendering cache immediately.');
        if (isCurrent()) onResult(cachedData);
        return;
      }

      console.log(">>> [PIPELINE] No Cache Found. Calling Gemini API.");
      const geminiResult = await analyzeDocument(base64, mimeType);
      if (isCurrent()) onResult(geminiResult);
      const thumbnail = await createThumbnail(image);
      saveDocument(geminiResult, "public", hash, thumbnail).catch(e => console.warn("Firebase intercept failed", e));
    } catch (err) {
      console.error(">>> [PIPELINE] Analysis failed:", err);
      if (isCurrent()) alert("Error analyzing document: " + err.message);
    } finally {
      if (isCurrent()) {
        setProgress(100);
        setLoading(false);
      }
    }
  }

  function handleReset() {
    requestIdRef.current++;
    onReset();
  }

  return (
    <div className="lg:col-span-5 flex flex-col items-center">
      <div className="w-full mb-6">
        <h3 className="text-sm font-semibold tracking-widest uppercase border-b pb-3" style={{ color: theme.subtext, borderColor: theme.border }}>Original Artifact</h3>
      </div>

      <div className="bg-museum-800/40 p-4 rounded-2xl border border-museum-700/50 shadow-2xl w-full flex justify-center backdrop-blur-sm overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-t from-museum-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"></div>
        <img src={image} alt="Historical Document" className="w-full h-auto rounded-xl object-contain max-h-[600px] shadow-lg relative z-0" />
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              backgroundColor: `${theme.bg}D9`,
              backdropFilter: 'blur(4px)',
              borderRadius: '0.75rem' // tailwind rounded-xl is 0.75rem
            }}
          >
            <style>
              {`
                @keyframes pulse-spin {
                  0% { transform: rotate(0deg) scale(0.9); box-shadow: 0 0 0 0 ${theme.accent}66; }
                  50% { transform: rotate(180deg) scale(1.1); box-shadow: 0 0 0 20px ${theme.accent}00; }
                  100% { transform: rotate(360deg) scale(0.9); box-shadow: 0 0 0 0 ${theme.accent}00; }
                }
              `}
            </style>

            <div
              style={{
                width: '64px',
                height: '64px',
                border: `4px solid ${theme.accent}33`,
                borderTopColor: theme.accent,
                borderRadius: '50%',
                marginBottom: '2rem',
                animation: 'pulse-spin 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
              }}
            ></div>

            <div
              style={{
                color: theme.accent,
                fontSize: '1.25rem',
                fontWeight: '600',
                marginBottom: '1.5rem',
                letterSpacing: '0.05em',
                textShadow: `0 2px 10px ${theme.accent}66`,
                textAlign: 'center'
              }}
            >
              {MESSAGES[messageIndex]}
            </div>

            <div
              style={{
                width: '75%',
                maxWidth: '320px',
                backgroundColor: theme.surface,
                borderRadius: '9999px',
                height: '8px',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${progress}%`,
                  backgroundColor: theme.accent,
                  height: '100%',
                  transition: 'width 0.3s ease-out',
                  boxShadow: `0 0 10px ${theme.accent}99`,
                  borderRadius: '9999px'
                }}
              ></div>
            </div>
            <div style={{ color: `${theme.accent}CC`, fontSize: '0.875rem', marginTop: '0.75rem', fontWeight: '500' }}>
              {Math.round(progress)}%
            </div>
          </div>
        )}
      </div>

      {/* CTA Analysis Button */}
      {!loading && (
        <button onClick={handleAnalyze} disabled={!base64} className="mt-8 w-full px-8 py-4 rounded-xl font-black text-lg tracking-widest uppercase hover:-translate-y-1 transition-transform disabled:opacity-50 disabled:cursor-wait" style={{ backgroundColor: theme.accentGlow, color: theme.buttonText, boxShadow: theme.cardShadow }}>
          ✨ Decode & Analyze Artifact
        </button>
      )}

      <button onClick={handleReset} className="mt-6 transition-colors uppercase tracking-widest text-xs font-semibold underline underline-offset-8" style={{ color: theme.subtext, textDecorationColor: theme.border }}>
        Upload a different document
      </button>
    </div>
  );
}

import { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { normalizeDocument, parseAccuracy, stripAnnotationTags } from "../utils/documents";
import { buildDiffTranscript } from "../utils/diff";

const EDITABLE_FIELDS = ["script", "era", "summary", "transcript", "modernMarathi"];
const ANNOTATION_SPLIT = /(<predict[^>]*>[\s\S]*?<\/predict>|<reconstruct[^>]*>[\s\S]*?<\/reconstruct>|<verified[^>]*>[\s\S]*?<\/verified>)/g;
const TOAST_DURATION_MS = 3000;

function getEditableValues(docItem) {
  return {
    script: docItem.script || "",
    era: docItem.era || "",
    summary: docItem.summary || "",
    // Strip XML tags from transcript for clean editing
    transcript: stripAnnotationTags(docItem.transcript),
    modernMarathi: docItem.modernMarathi || "",
  };
}

// Older records point at Firebase Storage, which can fail (e.g. on the free plan)
function DocumentImage({ src, className }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) {
    return (
      <div className={`${className} flex items-center justify-center text-slate-500 text-xs tracking-widest uppercase`}>
        {src ? "Image unavailable" : "No image stored"}
      </div>
    );
  }
  return <img src={src} alt="Artifact" className={className} onError={() => setFailedSrc(src)} />;
}

function renderAnnotatedTranscript(rawTranscript) {
  return (rawTranscript || "").split(ANNOTATION_SPLIT).map((part, idx) => {
    if (!part) return null;
    const predictMatch = part.match(/^<predict[^>]*>([\s\S]*)<\/predict>$/);
    if (predictMatch) return <span key={idx} className="inline-block bg-gold-500/20 border border-gold-500 text-gold-300 px-2 py-0.5 rounded-md mx-0.5 text-sm">{predictMatch[1]}</span>;
    const reconstructMatch = part.match(/^<reconstruct[^>]*>([\s\S]*)<\/reconstruct>$/);
    if (reconstructMatch) return <span key={idx} className="inline-block bg-red-500/20 border border-red-500 text-red-300 px-2 py-0.5 rounded-md mx-0.5 text-sm">{reconstructMatch[1]}</span>;
    const verifiedMatch = part.match(/^<verified[^>]*>([\s\S]*)<\/verified>$/);
    if (verifiedMatch) return <span key={idx} className="inline-block bg-purple-500/20 border border-purple-500 text-purple-300 px-2 py-0.5 rounded-md mx-0.5 text-sm">{verifiedMatch[1]}</span>;
    return <span key={idx} className="text-slate-200" style={{ whiteSpace: "pre-wrap" }}>{part}</span>;
  });
}

export default function HistorianView() {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const [originalValues, setOriginalValues] = useState({});
  const [editValues, setEditValues] = useState({});
  const [changedFields, setChangedFields] = useState({});
  const [activeTab, setActiveTab] = useState("Summary");
  const [toastMsg, setToastMsg] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "documents"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pending = snapshot.docs
        .map(docSnap => normalizeDocument(docSnap.id, docSnap.data()))
        .filter(docItem => !docItem.isVerified);
      // Sort by accuracy ascending (lowest first) for review priority
      pending.sort((a, b) => parseAccuracy(a.overallAccuracy) - parseAccuracy(b.overallAccuracy));
      setDocuments(pending);
    }, (error) => console.error("Historian queue failed to load:", error));
    return () => unsubscribe();
  }, []);

  // Lock the open document if another historian verifies it meanwhile
  const selectedId = selectedDoc?.id;
  useEffect(() => {
    if (!selectedId) return;
    const unsub = onSnapshot(doc(db, "documents", selectedId), (docSnap) => {
      const data = docSnap.data();
      if (docSnap.exists() && (data.editedOnce === true || data.status === "verified")) {
        setSelectedDoc(prev => prev ? { ...prev, isLocked: true } : null);
      }
    });
    return () => unsub();
  }, [selectedId]);

  const closeDocument = () => {
    setSelectedDoc(null);
    setOriginalValues({});
    setEditValues({});
    setChangedFields({});
  };

  const handleOpenDoc = (docItem) => {
    if (docItem.isVerified) return;
    const initialValues = getEditableValues(docItem);
    setSelectedDoc(docItem);
    setOriginalValues(initialValues);
    setEditValues(initialValues);
    setChangedFields({});
    setActiveTab("Summary");
  };

  const handleFieldChange = (field, value) => {
    if (selectedDoc?.isLocked) return;
    setEditValues(prev => ({ ...prev, [field]: value }));
    setChangedFields(prev => {
      const next = { ...prev };
      if (value !== originalValues[field]) {
        next[field] = value;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedDoc || selectedDoc.isLocked || isSubmitting) return;
    const changedKeys = Object.keys(changedFields);

    setIsSubmitting(true);
    try {
      // Unedited transcripts keep their AI annotations; edited ones mark the changes in purple
      const transcript = changedKeys.includes("transcript")
        ? buildDiffTranscript(originalValues.transcript, editValues.transcript)
        : selectedDoc.transcript || "";

      const historianOutput = {
        ...Object.fromEntries(EDITABLE_FIELDS.map(field => [field, editValues[field] ?? ""])),
        transcript,
        overallAccuracy: selectedDoc.overallAccuracy ?? null,
        locations: selectedDoc.locations || [],
        aiPredictions: selectedDoc.aiPredictions || [],
        reconstructionNeeded: selectedDoc.reconstructionNeeded || [],
      };

      await updateDoc(doc(db, "documents", selectedDoc.id), {
        historian_output: historianOutput,
        historianEdits: changedFields,
        highlightedFields: changedKeys,
        editedOnce: true,
        status: "verified",
        reviewedAt: serverTimestamp()
      });

      setToastMsg("Document Verified Successfully");
      closeDocument();
      setTimeout(() => setToastMsg(null), TOAST_DURATION_MS);
    } catch (error) {
      console.error("Submission failed", error);
      alert("Failed to submit review: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInput = (key, label, type = "text", rows) => {
    const isChanged = key in changedFields;
    const colorStyle = isChanged ? { color: "#7C3AED" } : { color: "#e2e8f0" };
    return (
      <div className="w-full">
        <label className="block text-[10px] font-black tracking-widest text-slate-500 uppercase mb-2">{label}</label>
        {type === "textarea" ? (
          <textarea
            value={editValues[key] ?? ""}
            onChange={e => handleFieldChange(key, e.target.value)}
            disabled={selectedDoc?.isLocked}
            rows={rows || 4}
            className="w-full bg-museum-900/60 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500/50 transition-colors resize-none mb-4"
            style={colorStyle}
          />
        ) : (
          <input
            type={type}
            value={editValues[key] ?? ""}
            onChange={e => handleFieldChange(key, e.target.value)}
            disabled={selectedDoc?.isLocked}
            className="w-full bg-museum-900/60 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-gold-500/50 transition-colors mb-4"
            style={colorStyle}
          />
        )}
      </div>
    );
  };

  const changeCount = Object.keys(changedFields).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 min-h-screen">
      {!selectedDoc && (
        <div className="mb-10 animate-[fadeIn_0.5s_ease-out] flex justify-between items-end">
          <div>
            <h1 className="text-4xl md:text-5xl font-heading font-black text-gold-400 mb-2">Historian Review Queue</h1>
            <p className="text-slate-500 tracking-[0.2em] uppercase text-xs">Documents pending scholarly verification</p>
          </div>
        </div>
      )}

      {!selectedDoc && documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center animate-[fadeIn_0.5s_ease-out]">
          <div className="text-slate-400 text-lg font-light tracking-wide">
            All documents have been reviewed.
          </div>
        </div>
      ) : !selectedDoc ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-[fadeIn_0.5s_ease-out]">
          {documents.map(docItem => (
            <div
              key={docItem.id}
              className="bg-museum-800/40 p-5 rounded-3xl border border-white/5 shadow-xl hover:border-gold-500/50 transition-all cursor-pointer backdrop-blur-xl"
              onClick={() => handleOpenDoc(docItem)}
            >
              <DocumentImage src={docItem.imageSrc} className="w-full h-48 object-cover rounded-2xl mb-4 bg-black/50" />
              <div className="flex justify-between items-start mb-4">
                <div className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full">
                  Pending Review
                </div>
                <div className="text-gold-400 font-heading text-lg">{parseAccuracy(docItem.overallAccuracy)}%</div>
              </div>
              <div className="text-slate-200 font-black tracking-widest uppercase text-sm mb-1">{docItem.script || "Unknown Script"}</div>
              <div className="text-slate-500 text-xs tracking-[0.2em] uppercase mb-1">{docItem.era || "Unknown Era"}</div>
              <div className="text-slate-600 text-[10px] tracking-widest uppercase">Searched: {docItem.searchCount} times</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-2 animate-[fadeIn_0.5s_ease-out]">
          {/* Left Column */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <button
              onClick={closeDocument}
              className="self-start text-slate-500 hover:text-white transition-colors text-sm font-black tracking-widest uppercase mb-2"
            >
              &larr; Back to Queue
            </button>
            <div className="bg-museum-900/40 p-5 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-xl">
              <div className="text-[10px] font-black tracking-[0.3em] text-slate-500 uppercase mb-4 pl-1">Document Specimen</div>
              <DocumentImage src={selectedDoc.imageSrc} className="w-full h-auto min-h-48 rounded-xl object-contain max-h-[600px] shadow-inner bg-black/50" />
              {selectedDoc.isLocked && (
                <div className="mt-6 bg-purple-500/10 border border-purple-500/30 text-purple-400 p-4 rounded-2xl text-center font-black tracking-widest text-sm">
                  This document has already been reviewed.
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7 flex flex-col h-full">
            {/* Tabs */}
            <div className="flex border-b border-white/10 mb-6 gap-8 pb-1 overflow-x-auto no-scrollbar">
              {['Summary', 'Linguistic Analysis'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-3 text-[10px] font-black tracking-[0.2em] uppercase transition-all whitespace-nowrap ${activeTab === tab ? 'text-gold-400 border-b-2 border-gold-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {tab}
                  {tab === 'Linguistic Analysis' && (
                    <span className="text-gold-400 text-xs font-black ml-2">{parseAccuracy(selectedDoc.overallAccuracy)}%</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-museum-900/60 backdrop-blur-xl p-8 md:p-12 rounded-[2.5rem] border border-white/5 shadow-2xl flex-1 flex flex-col min-h-[500px] mb-8">
              {activeTab === 'Summary' && (
                <div className="animate-[fadeIn_0.3s]">
                  <div className="flex flex-col md:flex-row gap-6 mb-8 pb-8 border-b border-white/5">
                    <div className="flex-1 space-y-2">
                      {renderInput('script', 'Script Type')}
                    </div>
                    <div className="flex-1 space-y-2">
                      {renderInput('era', 'Chronological Era')}
                    </div>
                  </div>
                  <div>
                    {renderInput('summary', 'Abstract / Summary', 'textarea', 3)}
                  </div>
                </div>
              )}
              {activeTab === 'Linguistic Analysis' && (
                <div className="animate-[fadeIn_0.3s]">
                  <div className="mb-8">
                    {renderInput('transcript', 'Edit Transcript — changes turn purple', 'textarea', 8)}
                  </div>

                  <div className="mb-8">
                    <div className="text-xs font-bold tracking-[0.3em] text-slate-500 uppercase mb-6">Original Paleographic Transcript</div>
                    <div className="bg-museum-900/60 backdrop-blur-2xl p-10 md:p-16 rounded-3xl border border-white/5 shadow-2xl leading-[2.5] text-xl font-heading mb-6">
                      {renderAnnotatedTranscript(selectedDoc.transcript)}
                    </div>
                    <div className="flex flex-row gap-6 text-[10px] uppercase tracking-widest text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block bg-[#7C3AED]"></span>
                        Historian Verified
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block bg-gold-500"></span>
                        AI Prediction
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block bg-red-500"></span>
                        Reconstruction Needed
                      </div>
                    </div>
                  </div>

                  {renderInput('modernMarathi', 'Modern Translation', 'textarea', 5)}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="mt-auto pt-4">
              <button
                onClick={handleSubmit}
                disabled={selectedDoc.isLocked || isSubmitting}
                className="w-full bg-[#7C3AED] text-white px-8 py-4 rounded-xl font-black tracking-widest uppercase hover:bg-purple-600 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : changeCount > 0 ? `Verify & Submit (${changeCount} edited)` : "Verify as Correct"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-museum-900 border border-purple-500/30 px-6 py-4 rounded-2xl shadow-2xl animate-[fadeIn_0.3s_ease-out]">
          <span className="text-sm font-black tracking-widest uppercase" style={{ color: "#7C3AED" }}>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

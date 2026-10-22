import { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { normalizeDocument, parseAccuracy } from "../utils/documents";

const PULSE_DURATION_MS = 1500;

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

export default function MuseumView({ theme }) {
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState({
    totalDocs: 0,
    digitizedCount: 0,
    pendingCount: 0,
    avgConfidence: 0,
  });
  const [pulseTotal, setPulseTotal] = useState(false);

  const animTotal = useCountUp(stats.totalDocs);
  const animDigi = useCountUp(stats.digitizedCount);
  const animPend = useCountUp(stats.pendingCount);
  const animConf = useCountUp(stats.avgConfidence);

  useEffect(() => {
    let pulseTimer;
    const q = query(collection(db, "documents"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(d => normalizeDocument(d.id, d.data()));
      setDocs(allDocs);

      const withAccuracy = allDocs.filter(d => d.overallAccuracy !== undefined);
      const accuracySum = withAccuracy.reduce((sum, d) => sum + parseAccuracy(d.overallAccuracy), 0);
      const digitized = allDocs.filter(d => d.isVerified).length;

      setStats({
        totalDocs: allDocs.length,
        digitizedCount: digitized,
        pendingCount: allDocs.length - digitized,
        avgConfidence: withAccuracy.length > 0 ? Math.round(accuracySum / withAccuracy.length) : 0,
      });

      setPulseTotal(true);
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => setPulseTotal(false), PULSE_DURATION_MS);
    }, (error) => console.error("Museum dashboard failed to load:", error));
    return () => {
      unsub();
      clearTimeout(pulseTimer);
    };
  }, []);

  const recentFive = docs.slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-[fadeIn_0.5s_ease-out]">
      {/* Role Banner */}
      <div className="rounded-xl border p-5 mb-8 border-l-4 shadow-md flex items-center" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderLeftColor: theme.accent, boxShadow: theme.cardShadow }}>
        <strong className="text-lg" style={{ color: theme.accent }}>🏛️ Museum Admin Mode</strong>
      </div>

      {/* Analytics Dashboard */}
      <div className="rounded-xl border shadow-xl p-8 mb-12" style={{ backgroundColor: theme.headerBg, borderColor: theme.border, boxShadow: theme.cardShadow }}>
        <h3 className="text-2xl font-heading mb-8 border-b pb-4" style={{ color: theme.accent, borderColor: theme.border }}>
          📊 Collection Analytics
        </h3>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: "Total Docs", value: animTotal, color: "text-gold-500" },
            { label: "Digitized", value: animDigi, color: "text-emerald-400" },
            { label: "Pending", value: animPend, color: "text-red-400" },
            { label: "Avg Confidence", value: animConf + "%", color: "text-blue-400" }
          ].map((stat, i) => (
            <div key={i} className={`rounded-xl p-6 text-center border shadow-inner transition-all duration-500 ${pulseTotal && i === 0 ? 'ring-2 ring-gold-500/50 shadow-gold-500/20' : ''}`} style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
              <div className={`text-4xl font-bold font-heading mb-2 ${stat.color}`}>
                {stat.value}
              </div>
              <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: theme.subtext }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Recent Docs Table */}
        <div className="mt-8">
          <strong className="text-sm tracking-widest uppercase font-semibold block mb-6" style={{ color: theme.text }}>Recent Documents (Live Feed)</strong>
          <div className="overflow-x-auto border rounded-lg" style={{ borderColor: theme.border }}>
            <table className="min-w-full text-left" style={{ backgroundColor: theme.surface }}>
              <thead className="border-b" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
                <tr>
                  {["Document ID", "Script", "Status", "Timestamp"].map(h => (
                    <th key={h} className="px-6 py-4 text-xs tracking-widest uppercase font-semibold" style={{ color: theme.subtext }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y text-sm" style={{ borderColor: theme.border }}>
                {recentFive.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center opacity-50" style={{ color: theme.subtext }}>No documents in collection yet.</td></tr>
                )}
                {recentFive.map(d => (
                  <tr key={d.id} className="transition-colors" style={{ backgroundColor: theme.surface }}>
                    <td className="px-6 py-4 font-mono text-xs" style={{ color: theme.text }}>{d.id.slice(0, 20) + "..."}</td>
                    <td className="px-6 py-4" style={{ color: theme.subtext }}>{d.script || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${d.isVerified ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                        {d.isVerified ? "✅ Verified" : "⏳ Pending"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs" style={{ color: theme.subtext }}>{d.timestamp?.toDate?.() ? d.timestamp.toDate().toLocaleString() : "In-flight..."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
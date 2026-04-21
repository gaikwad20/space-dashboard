import { useState, useEffect, useRef, useMemo } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

if (typeof document !== "undefined" && !document.getElementById("space-anim")) {
    const s = document.createElement("style"); s.id = "space-anim";
    s.textContent = `
    @keyframes twinkle{0%,100%{opacity:.1}50%{opacity:.9}}
    @keyframes spinCW{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes spinCCW{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes scanline{0%{top:-20%}100%{top:110%}}
    @keyframes orbitDot{from{transform:rotate(0deg) translateX(32px)}to{transform:rotate(360deg) translateX(32px)}}
    @keyframes pulseRing{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.2);opacity:0}}
    @keyframes nebulaDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(20px,-15px) scale(1.05)}}
    @keyframes shooting{0%{transform:translateX(0) translateY(0) rotate(-30deg);opacity:1;width:120px}100%{transform:translateX(300px) translateY(150px) rotate(-30deg);opacity:0;width:0}}
    @keyframes hud{0%,100%{opacity:.4}50%{opacity:1}}
  `;
    document.head.appendChild(s);
}

const STARS = Array.from({ length: 220 }, (_, i) => ({
    x: parseFloat((Math.sin(i * 13.7) * 50 + 50).toFixed(2)),
    y: parseFloat((Math.cos(i * 7.3) * 50 + 50).toFixed(2)),
    r: parseFloat((Math.sin(i * 2.1) * 0.7 + 1).toFixed(2)),
    delay: parseFloat((i * 0.13 % 5).toFixed(2)),
    dur: parseFloat((Math.sin(i) * 1.5 + 2.5).toFixed(2)),
    bright: i % 7 === 0
}));

const SHOTS = Array.from({ length: 4 }, (_, i) => ({ x: Math.random() * 80, y: Math.random() * 40, delay: i * 4 + Math.random() * 3 }));

const COSMIC = ["#c084fc", "#38bdf8", "#f472b6", "#34d399", "#fb923c", "#facc15", "#818cf8"];

async function parseFile(file) {
    return new Promise((resolve, reject) => {
        const ext = file.name.split(".").pop().toLowerCase();
        if (ext === "csv") { Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: r => resolve({ data: r.data, fields: r.meta.fields || [] }), error: reject }); }
        else if (["xlsx", "xls"].includes(ext)) {
            const rd = new FileReader(); rd.onload = e => {
                try {
                    const wb = XLSX.read(e.target.result, { type: "array" }); const ws = wb.Sheets[wb.SheetNames[0]]; const j = XLSX.utils.sheet_to_json(ws, { defval: "" });
                    resolve({ data: j, fields: j.length ? Object.keys(j[0]) : [] });
                } catch (er) { reject(er); }
            }; rd.onerror = reject; rd.readAsArrayBuffer(file);
        } else reject(new Error("Only CSV/Excel supported"));
    });
}

function analyze(data, fields) {
    if (!data?.length) return null;
    const numCols = fields.filter(f => data.some(r => typeof r[f] === "number"));
    const catCols = fields.filter(f => !numCols.includes(f));
    const numStats = numCols.map(col => {
        const v = data.map(r => r[col]).filter(x => typeof x === "number" && !isNaN(x));
        if (!v.length) return null;
        const s = v.reduce((a, b) => a + b, 0);
        return { col, min: +Math.min(...v).toFixed(2), max: +Math.max(...v).toFixed(2), avg: +(s / v.length).toFixed(2), sum: +s.toFixed(2) };
    }).filter(Boolean);
    let catData = null;
    if (catCols.length) { const col = catCols[0]; const f = {}; data.forEach(r => { const v = String(r[col] || "—"); f[v] = (f[v] || 0) + 1; }); catData = { col, data: Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, value]) => ({ name, value })) }; }
    const numChart = numStats.slice(0, 6).map(s => ({ name: s.col.length > 9 ? s.col.slice(0, 9) + "…" : s.col, Avg: s.avg, Max: s.max }));
    const signal = Array.from({ length: 14 }, (_, i) => ({ i, v: Math.round(data.length * (0.35 + Math.sin(i * 0.8) * 0.3 + Math.random() * 0.35)) }));
    const nulls = fields.reduce((a, f) => a + data.filter(r => r[f] === "" || r[f] == null).length, 0);
    const quality = Math.round(100 - (nulls / (data.length * fields.length)) * 100);
    return { numStats, catData, numChart, signal, rows: data.length, cols: fields.length, preview: data.slice(0, 5), fields, quality };
}

const SpaceTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return <div style={{ background: "rgba(2,5,16,0.95)", border: "1px solid rgba(192,132,252,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
        {label && <div style={{ color: "#475569", marginBottom: 3, letterSpacing: 1 }}>{label}</div>}
        {payload.map((p, i) => <div key={i} style={{ color: p.color || "#c084fc", fontWeight: 700 }}>{p.name}: {p.value}</div>)}
    </div>;
};

function PlanetCard({ icon, label, value, color, ring }) {
    return <div style={{ borderRadius: 20, padding: "20px 16px", position: "relative", overflow: "hidden", background: `radial-gradient(ellipse at top left,${color}18 0%,${color}05 60%,transparent 100%)`, border: `1px solid ${color}30`, boxShadow: `0 0 30px ${color}15, inset 0 1px 0 ${color}20` }}>
        <div style={{ position: "absolute", top: -18, right: -18, width: 80, height: 80, borderRadius: "50%", border: `1.5px solid ${color}25`, animation: "spinCW 12s linear infinite" }} />
        <div style={{ position: "absolute", top: -10, right: -10, width: 60, height: 60, borderRadius: "50%", border: `1px dashed ${color}18`, animation: "spinCCW 8s linear infinite" }} />
        <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontSize: 10, color: color, fontWeight: 800, letterSpacing: 2.5, marginBottom: 6, opacity: .8 }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1, color: "#f1f5f9", lineHeight: 1 }}>{value}</div>
    </div>;
}

function MissionPanel({ result, accent, name }) {
    if (!result) return null;
    const { numStats, catData, numChart, signal, rows, cols, quality, preview, fields } = result;
    const qColor = quality > 85 ? COSMIC[3] : quality > 60 ? COSMIC[4] : COSMIC[2];
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* File badge */}
        <div style={{ padding: "11px 18px", borderRadius: 14, background: `linear-gradient(90deg,${accent}18,transparent)`, border: `1px solid ${accent}28`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: accent, boxShadow: `0 0 10px ${accent},0 0 20px ${accent}` }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ fontSize: 9, padding: "3px 10px", borderRadius: 20, background: `${accent}18`, border: `1px solid ${accent}35`, color: accent, fontWeight: 800, letterSpacing: 1.5 }}>DATA LOCKED</span>
        </div>

        {/* KPI planets */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <PlanetCard icon="🪐" label="RECORDS IN ORBIT" value={rows.toLocaleString()} color={accent} />
            <PlanetCard icon="✦" label="FIELD CONSTELLATIONS" value={cols} color={COSMIC[1]} />
            <PlanetCard icon="📡" label="SIGNAL CLARITY" value={quality + "%"} color={qColor} />
        </div>

        {/* Signal wave */}
        <div style={{ borderRadius: 16, padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 9, color: "#334155", fontWeight: 800, letterSpacing: 2.5, marginBottom: 10 }}>⟿ TRANSMISSION SIGNAL</div>
            <ResponsiveContainer width="100%" height={85}>
                <AreaChart data={signal} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={`sg${accent.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={accent} stopOpacity={.5} />
                            <stop offset="100%" stopColor={accent} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke={accent} strokeWidth={2} fill={`url(#sg${accent.slice(1)})`} dot={false} />
                    <Tooltip content={<SpaceTooltip />} />
                </AreaChart>
            </ResponsiveContainer>
        </div>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 10 }}>
            <div style={{ borderRadius: 16, padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 9, color: "#334155", fontWeight: 800, letterSpacing: 2.5, marginBottom: 12 }}>◈ STELLAR MAGNITUDE — AVG vs MAX</div>
                {numChart.length > 0 ? <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={numChart} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#334155" }} angle={-20} textAnchor="end" axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "#334155" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<SpaceTooltip />} />
                        <Bar dataKey="Avg" fill={accent} radius={[5, 5, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="Max" fill={COSMIC[1]} radius={[5, 5, 0, 0]} maxBarSize={18} />
                    </BarChart>
                </ResponsiveContainer> : <div style={{ color: "#1e293b", fontSize: 11, padding: "50px 0", textAlign: "center" }}>No numeric columns</div>}
            </div>
            <div style={{ borderRadius: 16, padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                {catData?.data.length > 0 ? <>
                    <div style={{ fontSize: 9, color: "#334155", fontWeight: 800, letterSpacing: 2.5, marginBottom: 3 }}>⬡ NEBULA SPLIT</div>
                    <div style={{ fontSize: 10, color: accent, fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catData.col}</div>
                    <ResponsiveContainer width="100%" height={155}>
                        <PieChart>
                            <Pie data={catData.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={4}>
                                {catData.data.map((_, i) => <Cell key={i} fill={COSMIC[i % COSMIC.length]} stroke="transparent" />)}
                            </Pie>
                            <Tooltip content={<SpaceTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </> : <div style={{ color: "#1e293b", fontSize: 11, padding: "60px 0", textAlign: "center" }}>No categories</div>}
            </div>
        </div>

        {/* Stellar catalog */}
        {numStats.length > 0 && <div style={{ borderRadius: 16, padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 9, color: "#334155", fontWeight: 800, letterSpacing: 2.5, marginBottom: 12 }}>★ STELLAR CATALOG — NUMERIC READINGS</div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead><tr>{["DESIGNATION", "MIN", "MAX", "AVERAGE", "SUM"].map(h => <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#1e3a5f", fontWeight: 800, fontSize: 8, letterSpacing: 2, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{h}</th>)}</tr></thead>
                    <tbody>{numStats.map((s, i) => <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "8px 10px", color: "#cbd5e1", fontWeight: 700, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.col}>{s.col}</td>
                        <td style={{ padding: "8px 10px", color: "#1e3a5f", fontFamily: "monospace" }}>{s.min}</td>
                        <td style={{ padding: "8px 10px", color: "#1e3a5f", fontFamily: "monospace" }}>{s.max}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "monospace", color: accent, fontWeight: 900 }}>{s.avg}</td>
                        <td style={{ padding: "8px 10px", color: "#1e3a5f", fontFamily: "monospace" }}>{s.sum.toLocaleString()}</td>
                    </tr>)}</tbody>
                </table>
            </div>
        </div>}

        {/* Transmission log */}
        <div style={{ borderRadius: 16, padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 9, color: "#334155", fontWeight: 800, letterSpacing: 2.5, marginBottom: 12 }}>▦ TRANSMISSION LOG — FIRST 5 PACKETS</div>
            <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead><tr style={{ background: "rgba(255,255,255,0.03)" }}>{fields.map(f => <th key={f} title={f} style={{ padding: "7px 10px", textAlign: "left", color: "#1e3a5f", fontWeight: 800, fontSize: 8, letterSpacing: 1, whiteSpace: "nowrap" }}>{f.length > 11 ? f.slice(0, 11) + "…" : f}</th>)}</tr></thead>
                    <tbody>{preview.map((row, i) => <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>{fields.map(f => <td key={f} title={String(row[f] ?? "")} style={{ padding: "6px 10px", color: "#334155", fontFamily: "monospace", whiteSpace: "nowrap", fontSize: 10 }}>{String(row[f] ?? "")}</td>)}</tr>)}</tbody>
                </table>
            </div>
        </div>
    </div>;
}

function UploadPortal({ file, onFile, label, color, num }) {
    const ref = useRef(); const [drag, setDrag] = useState(false);
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]) }}>
        <input ref={ref} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => onFile(e.target.files[0])} />
        <div onClick={() => ref.current.click()} style={{ width: 160, height: 160, borderRadius: "50%", position: "relative", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, animation: file ? "" : "float 4s ease-in-out infinite" }}>
            {/* Rings */}
            {[{ s: 160, d: 2, sp: 18, c: `${color}50` }, { s: 130, d: 1.5, sp: 12, c: `${color}35` }, { s: 100, d: 1, sp: 8, c: `${color}25` }].map((r, i) => (
                <div key={i} style={{ position: "absolute", width: r.s, height: r.s, borderRadius: "50%", border: `${r.d}px solid ${r.c}`, animation: `${i % 2 === 0 ? "spinCW" : "spinCCW"} ${r.sp}s linear infinite`, borderStyle: i === 0 ? "solid" : "dashed" }} />
            ))}
            {/* Pulse ring when file loaded */}
            {file && <div style={{ position: "absolute", width: 160, height: 160, borderRadius: "50%", border: `2px solid ${color}`, animation: "pulseRing 2s ease-out infinite" }} />}
            {/* Center */}
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: `radial-gradient(circle,${color}30,${color}08)`, border: `1px solid ${color}40`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, zIndex: 2, boxShadow: `0 0 30px ${color}30` }}>
                <div style={{ fontSize: file ? 18 : 22 }}>{file ? "✦" : "📡"}</div>
                {!file && <div style={{ fontSize: 8, color: color, fontWeight: 800, letterSpacing: 1, textAlign: "center" }}>FILE<br />{num}</div>}
            </div>
        </div>
        {file ? <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COSMIC[3], letterSpacing: 1 }}>✓ SIGNAL LOCKED</div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 3, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
            <div onClick={() => ref.current.click()} style={{ fontSize: 9, color: color, marginTop: 4, cursor: "pointer", letterSpacing: 1, fontWeight: 700 }}>RETRANSMIT →</div>
        </div> : <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>{label}</div>
            <div style={{ fontSize: 9, color: "#334155", marginTop: 3, letterSpacing: 0.5 }}>CSV · XLSX · XLS</div>
        </div>}
    </div>;
}

export default function App() {
    const [mode, setMode] = useState("single");
    const [f1, setF1] = useState(null); const [f2, setF2] = useState(null);
    const [r1, setR1] = useState(null); const [r2, setR2] = useState(null);
    const [loading, setLoading] = useState(false); const [error, setError] = useState(null);
    const [history, setHistory] = useState([]); const [view, setView] = useState(null);
    const [user, setUser] = useState(null); const [emailInput, setEmailInput] = useState("");

    useEffect(() => {
        const s = document.createElement("style"); s.id = "space-css2";
        s.textContent = `@keyframes twinkle{0%,100%{opacity:.08}50%{opacity:.9}} @keyframes spinCW{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes spinCCW{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}} @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}} @keyframes pulseRing{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.8);opacity:0}} @keyframes shooting{0%{opacity:1;width:100px;transform:translateX(0) translateY(0) rotate(-25deg)}100%{opacity:0;width:0;transform:translateX(280px) translateY(130px) rotate(-25deg)}}`;
        if (!document.getElementById("space-css2")) document.head.appendChild(s);
    }, []);

    useEffect(() => { 
        try { 
            const key = user ? `sap_space_${user}` : "sap_space_anon";
            const r = localStorage.getItem(key); 
            if (r) setHistory(JSON.parse(r)); else setHistory([]);
        } catch (e) { console.error(e); } 
    }, [user]);
    const saveH = (e, tUser=user) => { 
        try { 
            const key = tUser ? `sap_space_${tUser}` : "sap_space_anon";
            localStorage.setItem(key, JSON.stringify(e)); 
        } catch (e) { console.error(e); } 
    };
    const addH = (name, a) => { const e = { id: Date.now(), name, date: new Date().toLocaleString(), ...a }; setHistory(p => { const u = [e, ...p].slice(0, 20); saveH(u); return u; }); };

    const go = async () => {
        if (!f1 || (mode === "compare" && !f2)) { setError(mode === "compare" ? "Upload both files." : "Upload a file first."); return; }
        setLoading(true); setError(null); setView(null);
        try {
            const p1 = await parseFile(f1); const a1 = analyze(p1.data, p1.fields); setR1(a1); addH(f1.name, a1);
            if (mode === "compare" && f2) { const p2 = await parseFile(f2); const a2 = analyze(p2.data, p2.fields); setR2(a2); addH(f2.name, a2); } else setR2(null);
        } catch (e) { setError(e.message); }
        setLoading(false);
    };
    const reset = () => { setF1(null); setF2(null); setR1(null); setR2(null); setError(null); setView(null); };
    const d1 = view || r1; const n1 = view ? view.name : f1?.name;
    const today = new Date(); const stardate = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

    return <div style={{ minHeight: "100vh", background: "#020510", fontFamily: "'Inter',system-ui,sans-serif", color: "#f1f5f9", position: "relative", overflowX: "hidden", display: "flex" }}>
        {/* Stars */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
            {STARS.map((s, i) => <div key={i} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, borderRadius: "50%", background: "#fff", opacity: s.bright ? 0.9 : 0.4, animation: i % 6 === 0 ? `twinkle ${(i % 3) + 2}s ${s.delay}s ease-in-out infinite` : undefined }} />)}
            {/* Shooting stars */}
            {SHOTS.map((s, i) => <div key={i} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, height: 1.5, background: "linear-gradient(90deg,transparent,#fff,transparent)", borderRadius: 2, animation: `shooting 1.5s ${s.delay}s ease-in infinite` }} />)}
            {/* Nebulae */}
            {[["8%", "5%", "700px", "#7c3aed", 0.1], ["78%", "45%", "600px", "#3b82f6", 0.08], ["30%", "75%", "500px", "#ec4899", 0.07]].map(([l, t, s, c, o], i) => (
                <div key={i} style={{ position: "absolute", left: l, top: t, width: s, height: s, borderRadius: "50%", background: `radial-gradient(circle,${c},transparent 70%)`, opacity: o, filter: "blur(80px)", transform: "translate(-50%,-50%)" }} />
            ))}
        </div>

        {/* --- LEFT SIDEBAR: HISTORY --- */}
        <div style={{ width: 280, borderRight: "1px solid rgba(192,132,252,0.15)", background: "rgba(2,5,16,0.5)", backdropFilter: "blur(10px)", padding: "22px 16px", display: "flex", flexDirection: "column", height: "100vh", overflowY: "auto", zIndex: 10 }}>
            <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 900, letterSpacing: 1.5, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#c084fc" }}>📜</span> MISSION ARCHIVES
            </div>
            {history.length > 0 ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {history.map(h => <div key={h.id} onClick={() => { setView(h); setR1(null); setR2(null); }}
                    style={{
                        borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all .2s",
                        background: view?.id === h.id ? "rgba(192,132,252,0.15)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${view?.id === h.id ? "rgba(192,132,252,0.4)" : "rgba(255,255,255,0.05)"}`
                    }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: view?.id === h.id ? "#c084fc" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }} title={h.name}>{h.name}</div>
                    <div style={{ fontSize: 9, color: "#64748b", marginBottom: 10 }}>{h.date}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 4, background: "rgba(192,132,252,0.1)", color: "#c084fc", fontWeight: 700 }}>{h.rows?.toLocaleString()} rows</span>
                        <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 4, background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontWeight: 700 }}>{h.cols} cols</span>
                    </div>
                </div>)}
            </div> : <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 40, padding: 20, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 10 }}>No scans recorded.<br/>Login to load history.</div>}
        </div>

        {/* --- MAIN CONTENT AREA --- */}
        <div style={{ flex: 1, padding: "26px 40px", position: "relative", height: "100vh", overflowY: "auto" }}>
            <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            {/* HEADER */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, paddingBottom: 18, borderBottom: "1px solid rgba(192,132,252,0.12)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ position: "relative", animation: "float 5s ease-in-out infinite" }}>
                        <div style={{ width: 46, height: 46, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%,#7c3aed,#030820)", border: "1px solid rgba(192,132,252,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 0 30px rgba(124,58,237,0.6),0 0 60px rgba(124,58,237,0.2)" }}>🪐</div>
                        <div style={{ position: "absolute", bottom: -1, right: -1, width: 13, height: 13, borderRadius: "50%", background: "#34d399", border: "2px solid #020510", boxShadow: "0 0 8px #34d399" }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.5, background: "linear-gradient(90deg,#e2e8f0 30%,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MISSION CONTROL</div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
                            <span style={{ fontSize: 9, color: "#334155", fontWeight: 700, letterSpacing: 2 }}>STARDATE {stardate}</span>
                            <span style={{ fontSize: 8, padding: "2px 8px", borderRadius: 10, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399", fontWeight: 800, letterSpacing: 1 }}>● SYSTEMS NOMINAL</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    {/* LOGIN SECTION */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", borderRight: "1px solid rgba(255,255,255,0.1)", paddingRight: 16 }}>
                        {!user ? (
                            <>
                                <input type="email" placeholder="Enter email to login" value={emailInput} onChange={e => setEmailInput(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(192,132,252,0.3)", color: "#fff", padding: "8px 12px", borderRadius: 6, fontSize: 11, outline: "none", width: 160 }} />
                                <button onClick={() => { if (emailInput) setUser(emailInput.trim().toLowerCase()); }} style={{ background: "#c084fc", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: "pointer", transition:"all.2s", boxShadow: "0 0 10px rgba(124,58,237,0.4)" }}>LOGIN</button>
                            </>
                        ) : (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", padding: "6px 12px", borderRadius: 20 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 10px #34d399" }} />
                                    <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 700 }}>{user}</span>
                                </div>
                                <button onClick={() => { setUser(null); setEmailInput(""); setView(null); setR1(null); setR2(null); }} style={{ background: "transparent", color: "#f87171", border: "1px solid rgba(244,63,94,0.3)", padding: "7px 12px", borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: "pointer", transition: "all .2s" }}>LOGOUT</button>
                            </>
                        )}
                    </div>

                    <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.07)" }}>
                        {[["single", "◎ SOLO"], ["compare", "⊕ DUAL"]].map(([v, l]) => (
                            <button key={v} onClick={() => { setMode(v); reset(); }} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 10, fontWeight: 800, cursor: "pointer", border: "none", letterSpacing: 1, transition: "all .2s", background: mode === v ? "linear-gradient(135deg,rgba(124,58,237,0.7),rgba(99,102,241,0.7))" : "transparent", color: mode === v ? "#e2e8f0" : "#334155", boxShadow: mode === v ? "0 2px 14px rgba(124,58,237,0.5)" : "none" }}>{l}</button>
                        ))}
                    </div>
                    {(r1 || r2) && <button onClick={reset} style={{ padding: "7px 13px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#334155", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 }}>ABORT ✕</button>}
                </div>
            </div>

            {/* UPLOAD PORTAL */}
            {!r1 && !view && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, paddingBottom: 20 }}>
                    <div style={{ display: "flex", gap: mode === "compare" ? 60 : 0, alignItems: "center", justifyContent: "center" }}>
                        <UploadPortal file={f1} onFile={setF1} label="TRANSMIT DATA FILE" color="#c084fc" num="Ⅰ" />
                        {mode === "compare" && <>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <div style={{ width: 1, height: 40, background: "linear-gradient(180deg,transparent,rgba(192,132,252,0.4),transparent)" }} />
                                <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(192,132,252,0.4)", letterSpacing: 2 }}>VS</div>
                                <div style={{ width: 1, height: 40, background: "linear-gradient(180deg,transparent,rgba(56,189,248,0.4),transparent)" }} />
                            </div>
                            <UploadPortal file={f2} onFile={setF2} label="TRANSMIT SECOND FILE" color="#38bdf8" num="Ⅱ" />
                        </>}
                    </div>
                    <button onClick={go} disabled={loading} style={{ padding: "12px 40px", borderRadius: 30, border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 800, letterSpacing: 2, background: loading ? "rgba(124,58,237,0.3)" : "linear-gradient(135deg,#7c3aed,#4f46e5,#7c3aed)", backgroundSize: "200% auto", color: "white", boxShadow: loading ? "none" : "0 0 30px rgba(124,58,237,0.6),0 4px 20px rgba(124,58,237,0.4)", transition: "all .2s", opacity: loading ? .6 : 1 }}>
                        {loading ? "⏳  SCANNING UNIVERSE…" : "🚀  INITIATE SCAN"}
                    </button>
                    {error && <div style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", color: "#f87171", fontSize: 11, letterSpacing: 0.5 }}>⚠ {error}</div>}
                </div>
            )}

            {/* Viewing banner */}
            {view && <div style={{ marginBottom: 16, padding: "9px 16px", borderRadius: 10, background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.22)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#fb923c", letterSpacing: 1 }}>◎ MISSION ARCHIVE:</span>
                <span style={{ fontSize: 11, color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{view.name}</span>
                <button onClick={() => { setView(null); }} style={{ fontSize: 9, color: "#fb923c", background: "none", border: "none", cursor: "pointer", fontWeight: 800, letterSpacing: 1 }}>CLOSE ✕</button>
            </div>}

            {/* Relaunch button */}
            {(r1 || view) && <div style={{ marginBottom: 16 }}>
                <button onClick={() => { setR1(null); setR2(null); setView(null); }} style={{ padding: "7px 18px", borderRadius: 9, background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.25)", color: "#c084fc", fontSize: 10, fontWeight: 800, cursor: "pointer", letterSpacing: 1.5 }}>+ NEW MISSION</button>
            </div>}

            {/* ANALYSIS */}
            {(d1 || r2) && <div style={{ display: "grid", gridTemplateColumns: r2 && !view ? "1fr 1fr" : "1fr", gap: 20 }}>
                {d1 && <MissionPanel result={d1} accent="#c084fc" name={n1} />}
                {r2 && !view && <MissionPanel result={r2} accent="#38bdf8" name={f2?.name} />}
            </div>}

            {/* Old Mission Archives Area Removed */}
            </div>
        </div>
    </div>;
}                                                                                                                                                                  
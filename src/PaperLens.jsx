import { useState, useRef, useCallback, useEffect } from "react";

/* ════════════ PDF.js loader ════════════ */
function usePdfJs() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.pdfjsLib) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setReady(true);
    };
    document.head.appendChild(s);
  }, []);
  return ready;
}

/* ════════════ Claude streaming call ════════════ */
async function callClaude(system, userContent, onChunk, apiKey) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;
    if (apiKey) headers["anthropic-version"] = "2023-06-01";
    if (apiKey) headers["anthropic-dangerous-direct-browser-access"] = "true";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userContent }],
        stream: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return `⚠️ API 오류 (${res.status}): ${err.slice(0, 200)}`;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const j = JSON.parse(line.slice(6));
            if (j.type === "content_block_delta" && j.delta?.text) {
              full += j.delta.text;
              onChunk?.(full);
            }
          } catch {}
        }
      }
    }
    return full;
  } catch (e) {
    return "⚠️ 연결 오류: " + e.message;
  }
}

/* ════════════ markdown renderer ════════════ */
function md(t) {
  if (!t) return "";
  return t
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;margin:14px 0 4px;color:#D4A028">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;margin:18px 0 6px;color:#D4A028">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px;position:relative;margin:3px 0"><span style="position:absolute;left:2px;color:#D4A028">•</span>$1</div>')
    .replace(/\n{2,}/g, '<div style="height:10px"></div>')
    .replace(/\n/g, "<br/>");
}

/* ════════════ presets ════════════ */
const PRESETS = {
  summary: { icon: "📋", label: "논문 요약", desc: "핵심 내용 구조적 요약",
    sys: `You are an expert academic paper reviewer. Provide a comprehensive summary in Korean using these headers:\n## 📌 핵심 요약\n3-4 sentences.\n## 🎯 연구 목적\n## 📊 주요 방법론\n## 💡 핵심 결과\n## 🔑 키워드` },
  evaluate: { icon: "⭐", label: "논문 평가", desc: "10점 만점 세부 평가",
    sys: `You are a senior peer reviewer for a top-tier venue. Evaluate critically in Korean:\n## ⭐ 종합 평점\nFormat: ⭐ X.X / 10 — one-line\n## 📊 세부 평가\n- 독창성: X/10\n- 기술적 완성도: X/10\n- 명확성: X/10\n- 실험 설계: X/10\n- 영향력: X/10\n## ✅ 강점 (3-5 bullet points)\n## ⚠️ 약점 (3-5 bullet points)\n## 💡 개선 제안\n## 🏛️ 추천 학회/저널` },
  methodology: { icon: "🔬", label: "방법론 분석", desc: "연구 설계 심층 분석",
    sys: `Expert methodologist. Analyze methodology in Korean:\n## 🔬 연구 설계\n## 📊 데이터 및 실험\n## 🛠️ 분석 방법\n## ✅ 방법론적 강점\n## ⚠️ 방법론적 한계\n## 🔄 재현가능성 (높음/보통/낮음 + 근거)` },
  critique: { icon: "🎯", label: "심층 비평", desc: "논리 구조 및 학술 비평",
    sys: `World-class academic critic. Deep critical analysis in Korean:\n## 🏗️ 논리적 구조 평가\n## 🔍 선행연구 검토 평가\n## ⚖️ 주장의 타당성\n## 🌐 학술적 위치\n## 🔮 후속 연구 방향` },
  translate: { icon: "🌏", label: "한국어 번역", desc: "핵심 내용 번역",
    sys: `Expert academic translator. Translate key content into natural academic Korean. Keep technical terms in (English):\n## 📄 초록 번역\n## 📖 주요 내용 번역` },
  explain: { icon: "📖", label: "쉬운 설명", desc: "비전공자도 이해하게",
    sys: `Brilliant science communicator. Explain for undergrad level, in Korean, use analogies:\n## 🎓 한 줄 요약\n## 🤔 어떤 문제를 풀었나요?\n## 💡 어떻게 풀었나요?\n## 📊 결과\n## 🌍 왜 중요한가요?` },
};

const QUICK = [
  "이 논문의 핵심 기여(contribution)는 무엇인가요?",
  "사용된 데이터셋과 실험 설계를 설명해주세요",
  "이 연구의 한계점은 무엇인가요?",
  "Related Work을 요약해주세요",
  "수식/알고리즘을 쉽게 설명해주세요",
  "후속 연구 방향을 제안해주세요",
];

/* ═══════════════════ MAIN ═══════════════════ */
export default function PaperLens() {
  const pdfReady = usePdfJs();
  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const [file, setFile] = useState(null);
  const [fName, setFName] = useState("");
  const [pdfB64, setPdfB64] = useState(null);
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [tab, setTab] = useState("chat");
  const [side, setSide] = useState(true);

  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef(null);
  const pdfScrollRef = useRef(null);

  const [results, setResults] = useState({});
  const [activeA, setActiveA] = useState(null);
  const [aLoading, setALoading] = useState(false);

  const [notes, setNotes] = useState([]);
  const [noteIn, setNoteIn] = useState("");

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  /* ── render PDF pages ── */
  const renderPdf = useCallback(async (arrayBuf) => {
    if (!window.pdfjsLib) return;
    setPdfLoading(true);
    try {
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
      setTotalPages(pdf.numPages);
      const rendered = [];
      const pagesToRender = Math.min(pdf.numPages, 50);
      for (let i = 1; i <= pagesToRender; i++) {
        const page = await pdf.getPage(i);
        const scale = 1.5;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        rendered.push(canvas.toDataURL("image/jpeg", 0.85));
      }
      setPages(rendered);
      setCurrentPage(1);
    } catch (e) {
      console.error("PDF render error:", e);
    }
    setPdfLoading(false);
  }, []);

  /* ── file upload ── */
  const loadFile = useCallback(async (f) => {
    if (!f || !f.name.toLowerCase().endsWith(".pdf")) return;
    setFile(f); setFName(f.name);
    setMsgs([]); setResults({}); setActiveA(null); setNotes([]); setPages([]);

    const buf = await f.arrayBuffer();
    renderPdf(buf);

    const r = new FileReader();
    r.onload = (e) => setPdfB64(e.target.result.split(",")[1]);
    r.readAsDataURL(f);

    setMsgs([{
      role: "assistant",
      content: `📄 **${f.name}** 을(를) 로드했습니다!\n\n💬 **채팅** — 논문에 대해 자유롭게 질문\n📊 **분석** — 요약, 평가, 번역 등 원클릭 분석\n📝 **노트** — 읽으며 메모 남기기\n\n아래 빠른 질문을 클릭하거나 직접 입력해보세요.`
    }]);
    setSide(true); setTab("chat");
  }, [pdfReady, renderPdf]);

  /* ── chat ── */
  const send = async (custom) => {
    const m = custom || input;
    if (!m.trim() || streaming) return;
    if (!custom) setInput("");
    const next = [...msgs, { role: "user", content: m }];
    setMsgs(next); setStreaming(true);
    const idx = next.length;
    setMsgs([...next, { role: "assistant", content: "⏳ 분석 중..." }]);
    const sys = `You are PaperLens AI, an expert academic paper analysis assistant. Always respond in Korean unless asked otherwise. Use markdown formatting. Be precise and cite specific parts of the paper.`;
    const uc = pdfB64
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfB64 } }, { type: "text", text: m }]
      : m;
    await callClaude(sys, uc, (p) => setMsgs(prev => { const c = [...prev]; c[idx] = { role: "assistant", content: p }; return c; }), apiKey);
    setStreaming(false);
  };

  /* ── analysis ── */
  const runA = async (k) => {
    if (results[k]) { setActiveA(k); setTab("analysis"); return; }
    setTab("analysis"); setActiveA(k); setALoading(true);
    const uc = pdfB64
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfB64 } }, { type: "text", text: "이 논문을 분석해주세요." }]
      : "논문을 분석해주세요.";
    await callClaude(PRESETS[k].sys, uc, (p) => setResults(prev => ({ ...prev, [k]: p })), apiKey);
    setALoading(false);
  };

  /* ── notes ── */
  const addNote = () => { if (!noteIn.trim()) return; setNotes(p => [...p, { id: Date.now(), t: noteIn, time: new Date().toLocaleTimeString("ko-KR"), c: ["#D4A028","#4ECDC4","#FF6B6B","#A78BFA","#34D399"][Math.floor(Math.random() * 5)] }]); setNoteIn(""); };

  /* ── scroll to page ── */
  const scrollToPage = (n) => {
    setCurrentPage(n);
    const el = document.getElementById(`pdf-page-${n}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* HEADER */}
      <header style={S.hdr}>
        <div style={S.hdrL}>
          <span style={S.logoI}>◈</span>
          <span style={S.logoT}>PaperLens</span>
          {fName && <span style={S.fname}>{fName}</span>}
        </div>
        <div style={S.hdrR}>
          <button style={S.keyBtn} onClick={() => setShowKeyInput(!showKeyInput)} title="API Key 설정">
            {apiKey ? "🔑" : "🔒"}
          </button>
          <label style={S.upBtn}>
            <input type="file" accept=".pdf" hidden onChange={e => loadFile(e.target.files[0])} />
            📎 논문 업로드
          </label>
          {file && <button style={S.togBtn} onClick={() => setSide(!side)}>{side ? "◧" : "◨"}</button>}
        </div>
      </header>

      {/* API KEY BAR */}
      {showKeyInput && (
        <div style={S.keyBar}>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>🔑 Anthropic API Key (배포 환경용, claude.ai에서는 불필요):</span>
          <input
            style={S.keyInput}
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
          />
          <button style={S.keyOk} onClick={() => setShowKeyInput(false)}>확인</button>
        </div>
      )}

      <div style={S.body}>
        {/* ── PDF VIEWER ── */}
        <div style={{ ...S.pdfPanel, flex: side && file ? "1 1 58%" : "1 1 100%" }}>
          {file ? (
            <div style={S.pdfContainer}>
              {/* Page nav */}
              {totalPages > 0 && (
                <div style={S.pageNav}>
                  <button style={S.pgBtn} onClick={() => scrollToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>◀</button>
                  <span style={S.pgInfo}>{currentPage} / {totalPages}</span>
                  <button style={S.pgBtn} onClick={() => scrollToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}>▶</button>
                </div>
              )}
              {/* Pages */}
              <div style={S.pdfScroll} ref={pdfScrollRef}>
                {pdfLoading && (
                  <div style={S.pdfLoading}>
                    <div style={S.spinner}>◈</div>
                    <p>PDF 렌더링 중...</p>
                  </div>
                )}
                {pages.map((src, i) => (
                  <div key={i} id={`pdf-page-${i + 1}`} style={S.pageWrap}>
                    <img src={src} style={S.pageImg} alt={`Page ${i + 1}`} />
                    <div style={S.pageLabel}>Page {i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={S.drop} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
              <div style={S.dropIn}>
                <div style={S.dropIco}>◈</div>
                <h2 style={S.dropH}>논문을 업로드하세요</h2>
                <p style={S.dropP}>PDF 파일을 드래그하거나 클릭하여 업로드</p>
                <label style={S.dropBtn}>
                  <input type="file" accept=".pdf" hidden onChange={e => loadFile(e.target.files[0])} />
                  PDF 파일 선택
                </label>
                <div style={S.tags}>
                  {["💬 AI 채팅", "⭐ 논문 평가", "📋 요약", "🌏 번역", "🔬 방법론", "📝 노트"].map(x => <span key={x} style={S.tag}>{x}</span>)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SIDE PANEL ── */}
        {side && file && (
          <div style={S.side}>
            <div style={S.tabBar}>
              {[{ k: "chat", l: "💬 채팅" }, { k: "analysis", l: "📊 분석" }, { k: "notes", l: "📝 노트" }].map(x => (
                <button key={x.k} style={{ ...S.tabBtn, ...(tab === x.k ? S.tabAct : {}) }} onClick={() => setTab(x.k)}>{x.l}</button>
              ))}
            </div>

            {/* CHAT */}
            {tab === "chat" && (
              <div style={S.tabC}>
                <div style={S.chatScroll}>
                  {msgs.map((m, i) => (
                    <div key={i} style={m.role === "user" ? S.uRow : S.aRow}>
                      {m.role === "assistant" && <div style={S.avatar}>◈</div>}
                      <div style={m.role === "user" ? S.uBub : S.aBub} dangerouslySetInnerHTML={{ __html: md(m.content) }} />
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                <div style={S.qWrap}>
                  {QUICK.map((q, i) => <button key={i} className="qb" style={S.qBtn} onClick={() => send(q)}>{q}</button>)}
                </div>
                <div style={S.inpWrap}>
                  <input style={S.inp} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder="논문에 대해 질문하세요..." disabled={streaming} />
                  <button style={{ ...S.sendBtn, opacity: streaming || !input.trim() ? 0.4 : 1 }} onClick={() => send()} disabled={streaming || !input.trim()}>{streaming ? "⏳" : "↑"}</button>
                </div>
              </div>
            )}

            {/* ANALYSIS */}
            {tab === "analysis" && (
              <div style={S.tabC}>
                <div style={S.aGrid}>
                  {Object.entries(PRESETS).map(([k, v]) => (
                    <button key={k} className="ac" style={{ ...S.aCard, ...(activeA === k ? S.aCardAct : {}), ...(results[k] ? { borderColor: "#34D39944" } : {}) }} onClick={() => runA(k)}>
                      <span style={{ fontSize: 20 }}>{v.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.aLabel}>{v.label}</div>
                        <div style={S.aDesc}>{v.desc}</div>
                      </div>
                      {results[k] && <span style={{ color: "#34D399", fontWeight: 700 }}>✓</span>}
                    </button>
                  ))}
                </div>
                {activeA && (
                  <div style={S.aRes}>
                    <div style={S.aResH}>
                      <span>{PRESETS[activeA]?.icon} {PRESETS[activeA]?.label}</span>
                      {aLoading && <span className="spin">⟳</span>}
                    </div>
                    <div style={S.aResB} dangerouslySetInnerHTML={{ __html: md(results[activeA] || "분석을 시작합니다...") }} />
                  </div>
                )}
                {!activeA && <div style={{ padding: 40, textAlign: "center", color: "#6B7280", fontSize: 14 }}>위 카드를 클릭하여 분석을 시작하세요</div>}
              </div>
            )}

            {/* NOTES */}
            {tab === "notes" && (
              <div style={S.tabC}>
                <div style={S.nInpW}>
                  <input style={S.nInp} value={noteIn} onChange={e => setNoteIn(e.target.value)} onKeyDown={e => e.key === "Enter" && addNote()} placeholder="메모를 입력하세요..." />
                  <button style={S.nAdd} onClick={addNote}>+</button>
                </div>
                <div style={S.nList}>
                  {notes.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>📝 메모를 남겨보세요</div>}
                  {notes.map(n => (
                    <div key={n.id} style={{ ...S.nCard, borderLeft: `3px solid ${n.c}` }}>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{n.t}</div>
                      <div style={S.nMeta}><span>{n.time}</span><button style={S.nDel} onClick={() => setNotes(p => p.filter(x => x.id !== n.id))}>×</button></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ STYLES ═══════════════════ */
const P = {
  bg: "#111318", s1: "#181B24", s2: "#1F2333", s3: "#272C3F",
  brd: "#2D3348", tx: "#EAEAEA", dim: "#8891A5",
  acc: "#D4A028", accG: "rgba(212,160,40,0.1)",
  grn: "#34D399", red: "#FF6B6B",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${P.bg}}
::-webkit-scrollbar-thumb{background:${P.brd};border-radius:3px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes float{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-10px) rotate(3deg)}}
.spin{display:inline-block;animation:spin 1s linear infinite;font-size:16px}
.qb:hover{background:${P.s3}!important;color:${P.tx}!important;border-color:${P.acc}!important}
.ac:hover{border-color:${P.acc}!important;background:${P.accG}!important}
`;

const S = {
  root: { fontFamily: "'Noto Sans KR',sans-serif", background: P.bg, color: P.tx, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  hdr: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", height: 48, background: P.s1, borderBottom: `1px solid ${P.brd}`, flexShrink: 0 },
  hdrL: { display: "flex", alignItems: "center", gap: 12 },
  hdrR: { display: "flex", alignItems: "center", gap: 8 },
  logoI: { fontSize: 20, color: P.acc, fontWeight: 700 },
  logoT: { fontSize: 15, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", background: `linear-gradient(135deg,${P.acc},#F0D060)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  fname: { fontSize: 11, color: P.dim, background: P.s2, padding: "3px 10px", borderRadius: 6, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  upBtn: { padding: "5px 12px", background: P.acc, color: P.bg, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans KR'" },
  togBtn: { padding: "5px 10px", background: P.s2, color: P.tx, border: `1px solid ${P.brd}`, borderRadius: 7, fontSize: 14, cursor: "pointer" },
  keyBtn: { padding: "5px 8px", background: "transparent", border: `1px solid ${P.brd}`, borderRadius: 6, fontSize: 14, cursor: "pointer" },
  keyBar: { display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", background: P.s2, borderBottom: `1px solid ${P.brd}`, flexShrink: 0 },
  keyInput: { flex: 1, padding: "5px 10px", background: P.s3, color: P.tx, border: `1px solid ${P.brd}`, borderRadius: 6, fontSize: 12, outline: "none", fontFamily: "monospace" },
  keyOk: { padding: "5px 12px", background: P.acc, color: P.bg, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" },

  body: { flex: 1, display: "flex", overflow: "hidden" },

  /* PDF panel */
  pdfPanel: { display: "flex", flexDirection: "column", transition: "flex 0.3s", borderRight: `1px solid ${P.brd}`, overflow: "hidden" },
  pdfContainer: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  pageNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "6px 0", background: P.s1, borderBottom: `1px solid ${P.brd}`, flexShrink: 0 },
  pgBtn: { padding: "3px 10px", background: P.s2, color: P.tx, border: `1px solid ${P.brd}`, borderRadius: 5, cursor: "pointer", fontSize: 12 },
  pgInfo: { fontSize: 12, color: P.dim, fontFamily: "'IBM Plex Mono'" },
  pdfScroll: { flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "#2A2D35" },
  pdfLoading: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: P.dim },
  spinner: { fontSize: 32, color: P.acc, animation: "spin 2s linear infinite", marginBottom: 12 },
  pageWrap: { position: "relative", width: "100%", maxWidth: 800 },
  pageImg: { width: "100%", borderRadius: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.4)" },
  pageLabel: { position: "absolute", bottom: 6, right: 10, fontSize: 10, color: P.dim, background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 4 },

  /* drop zone */
  drop: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(ellipse at center,${P.s2} 0%,${P.bg} 70%)` },
  dropIn: { textAlign: "center", padding: 40, maxWidth: 440 },
  dropIco: { fontSize: 56, color: P.acc, marginBottom: 16, animation: "float 3s ease-in-out infinite", display: "block" },
  dropH: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  dropP: { fontSize: 13, color: P.dim, marginBottom: 22 },
  dropBtn: { display: "inline-block", padding: "11px 28px", background: P.acc, color: P.bg, border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans KR'", marginBottom: 18 },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  tag: { padding: "3px 10px", background: P.accG, color: P.acc, borderRadius: 20, fontSize: 11 },

  /* side panel */
  side: { flex: "0 0 380px", maxWidth: 380, display: "flex", flexDirection: "column", background: P.s1, animation: "fadeUp 0.25s ease" },
  tabBar: { display: "flex", borderBottom: `1px solid ${P.brd}`, flexShrink: 0 },
  tabBtn: { flex: 1, padding: "9px 0", background: "transparent", color: P.dim, border: "none", borderBottom: "2px solid transparent", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Noto Sans KR'", transition: "all 0.15s" },
  tabAct: { color: P.acc, borderBottomColor: P.acc },
  tabC: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },

  /* chat */
  chatScroll: { flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 },
  uRow: { display: "flex", justifyContent: "flex-end", animation: "fadeUp 0.2s" },
  aRow: { display: "flex", gap: 7, alignItems: "flex-start", animation: "fadeUp 0.25s" },
  avatar: { width: 24, height: 24, borderRadius: 6, background: P.accG, color: P.acc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginTop: 2 },
  uBub: { background: P.acc, color: P.bg, padding: "7px 12px", borderRadius: "12px 12px 3px 12px", maxWidth: "82%", fontSize: 13, lineHeight: 1.6, fontWeight: 500 },
  aBub: { background: P.s2, color: P.tx, padding: "9px 12px", borderRadius: "3px 12px 12px 12px", maxWidth: "calc(100% - 32px)", fontSize: 13, lineHeight: 1.7, border: `1px solid ${P.brd}` },
  qWrap: { padding: "5px 10px", display: "flex", flexWrap: "wrap", gap: 4, borderTop: `1px solid ${P.brd}`, maxHeight: 68, overflowY: "auto", flexShrink: 0 },
  qBtn: { padding: "3px 9px", background: P.s2, color: P.dim, border: `1px solid ${P.brd}`, borderRadius: 16, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", fontFamily: "'Noto Sans KR'" },
  inpWrap: { display: "flex", gap: 7, padding: "8px 10px", borderTop: `1px solid ${P.brd}`, background: P.s1, flexShrink: 0 },
  inp: { flex: 1, padding: "8px 12px", background: P.s2, color: P.tx, border: `1px solid ${P.brd}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'Noto Sans KR'" },
  sendBtn: { width: 36, height: 36, borderRadius: 8, background: P.acc, color: P.bg, border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },

  /* analysis */
  aGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 10, flexShrink: 0 },
  aCard: { padding: "8px 10px", background: P.s2, border: `1px solid ${P.brd}`, borderRadius: 9, cursor: "pointer", textAlign: "left", transition: "all 0.15s", fontFamily: "'Noto Sans KR'", display: "flex", gap: 8, alignItems: "center" },
  aCardAct: { borderColor: P.acc, background: P.accG },
  aLabel: { fontSize: 12, fontWeight: 600, color: P.tx },
  aDesc: { fontSize: 10, color: P.dim, marginTop: 1 },
  aRes: { flex: 1, overflow: "auto", borderTop: `1px solid ${P.brd}` },
  aResH: { padding: "8px 14px", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${P.brd}`, position: "sticky", top: 0, background: P.s1, zIndex: 1 },
  aResB: { padding: 14, fontSize: 13, lineHeight: 1.8 },

  /* notes */
  nInpW: { display: "flex", gap: 7, padding: "8px 10px", borderBottom: `1px solid ${P.brd}`, flexShrink: 0 },
  nInp: { flex: 1, padding: "7px 10px", background: P.s2, color: P.tx, border: `1px solid ${P.brd}`, borderRadius: 7, fontSize: 13, outline: "none", fontFamily: "'Noto Sans KR'" },
  nAdd: { width: 32, height: 32, borderRadius: 7, background: P.acc, color: P.bg, border: "none", fontSize: 18, fontWeight: 700, cursor: "pointer" },
  nList: { flex: 1, overflow: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 },
  nCard: { padding: "9px 12px", background: P.s2, borderRadius: 7, animation: "fadeUp 0.2s" },
  nMeta: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: P.dim, marginTop: 5 },
  nDel: { background: "transparent", border: "none", color: P.red, fontSize: 15, cursor: "pointer" },
};

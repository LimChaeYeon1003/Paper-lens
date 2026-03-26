import { useState, useRef, useCallback, useEffect } from "react";

/* ───────── streaming Claude call ───────── */
async function callClaude(system, userContent, onChunk) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userContent }],
        stream: true,
      }),
    });
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
    return "⚠️ API 오류: " + e.message;
  }
}

/* ───────── simple markdown → html ───────── */
function md(t) {
  if (!t) return "";
  return t
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;margin:14px 0 4px;color:#E8B931">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;margin:18px 0 6px;color:#E8B931">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="font-size:17px;font-weight:700;margin:20px 0 8px;color:#E8B931">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<div style="padding-left:14px;position:relative;margin:3px 0"><span style="position:absolute;left:0;color:#E8B931">•</span>$1</div>')
    .replace(/\n{2,}/g, '<div style="height:10px"></div>')
    .replace(/\n/g, "<br/>");
}

/* ───────── presets ───────── */
const PRESETS = {
  summary: {
    icon: "📋", label: "논문 요약", desc: "핵심 내용 구조적 요약",
    sys: `Expert paper reviewer. Summarize in Korean:\n## 📌 핵심 요약\n## 🎯 연구 목적\n## 📊 주요 방법론\n## 💡 핵심 결과\n## 🔑 키워드`
  },
  evaluate: {
    icon: "⭐", label: "논문 평가", desc: "10점 만점 세부 평가",
    sys: `Senior peer reviewer. Evaluate critically in Korean:\n## ⭐ 종합 평점\nFormat: ⭐ X.X / 10 — one-line review\n## 📊 세부 평가\n- 독창성: X/10\n- 기술적 완성도: X/10\n- 명확성: X/10\n- 실험 설계: X/10\n- 영향력: X/10\n## ✅ 강점\n## ⚠️ 약점\n## 💡 개선 제안\n## 🏛️ 추천 학회/저널`
  },
  methodology: {
    icon: "🔬", label: "방법론 분석", desc: "연구 설계 심층 분석",
    sys: `Expert methodologist. Analyze methodology in Korean:\n## 🔬 연구 설계\n## 📊 데이터 및 실험\n## 🛠️ 분석 방법\n## ✅ 방법론적 강점\n## ⚠️ 방법론적 한계\n## 🔄 재현가능성`
  },
  critique: {
    icon: "🎯", label: "심층 비평", desc: "논리 구조 및 학술 비평",
    sys: `World-class academic critic. Deep critical analysis in Korean:\n## 🏗️ 논리적 구조\n## 🔍 선행연구 검토\n## ⚖️ 주장 타당성\n## 🌐 학술적 위치\n## 🔮 후속 연구 방향`
  },
  translate: {
    icon: "🌏", label: "한국어 번역", desc: "핵심 내용 번역",
    sys: `Expert academic translator. Translate key content to Korean. Keep technical terms in parentheses with English:\n## 📄 초록 번역\n## 📖 주요 내용 번역`
  },
  explain: {
    icon: "📖", label: "쉬운 설명", desc: "비전공자 눈높이 설명",
    sys: `Brilliant science communicator. Explain for undergrad level in Korean:\n## 🎓 한 줄 요약\n## 🤔 어떤 문제?\n## 💡 어떻게 풀었나?\n## 📊 결과\n## 🌍 왜 중요한가?`
  },
};

const QUICK = [
  "이 논문의 핵심 기여는 무엇인가요?",
  "사용된 데이터셋과 실험 설계를 설명해주세요",
  "이 연구의 한계점은 무엇인가요?",
  "Related Work을 요약해주세요",
  "수식/알고리즘을 쉽게 설명해주세요",
  "후속 연구 방향을 제안해주세요",
];

const COLORS = ["#E8B931","#4ECDC4","#FF6B6B","#A78BFA","#34D399","#60A5FA"];

/* ═══════════════════ COMPONENT ═══════════════════ */
export default function PaperLens() {
  const [file, setFile] = useState(null);
  const [fName, setFName] = useState("");
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfB64, setPdfB64] = useState(null);
  const [paperText, setPaperText] = useState("");
  const [tab, setTab] = useState("chat");
  const [side, setSide] = useState(true);

  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef(null);

  const [results, setResults] = useState({});
  const [activeA, setActiveA] = useState(null);
  const [aLoading, setALoading] = useState(false);

  const [notes, setNotes] = useState([]);
  const [noteIn, setNoteIn] = useState("");

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  /* ── file handling ── */
  const loadFile = useCallback(async (f) => {
    if (!f || !f.name.endsWith(".pdf")) return;
    setFile(f); setFName(f.name);
    setPdfUrl(URL.createObjectURL(f));
    setMsgs([]); setResults({}); setActiveA(null); setNotes([]);
    // base64
    const r = new FileReader();
    r.onload = (e) => setPdfB64(e.target.result.split(",")[1]);
    r.readAsDataURL(f);
    // text extract (basic)
    const r2 = new FileReader();
    r2.onload = (e) => {
      const b = new Uint8Array(e.target.result);
      let txt = "", inS = false, buf = [];
      for (let i = 0; i < b.length; i++) {
        if (!inS && b[i]===115&&b[i+1]===116&&b[i+2]===114&&b[i+3]===101&&b[i+4]===97&&b[i+5]===109) {
          inS=true; i+=6; if(b[i]===13)i++; if(b[i]===10)i++; i--; continue;
        }
        if (inS && b[i]===101&&b[i+1]===110&&b[i+2]===100&&b[i+3]===115&&b[i+4]===116&&b[i+5]===114) {
          inS=false;
          const d=buf.map(x=>(x>=32&&x<=126)?String.fromCharCode(x):" ").join("");
          const p=d.match(/\(([^)]+)\)/g);
          if(p) txt+=p.map(x=>x.slice(1,-1)).join(" ")+"\n";
          buf=[]; continue;
        }
        if(inS) buf.push(b[i]);
      }
      setPaperText(txt.slice(0,30000));
    };
    r2.readAsArrayBuffer(f);
    setMsgs([{ role:"assistant", content:`📄 **${f.name}** 로드 완료!\n\n자유롭게 질문하거나, 📊 분석 탭에서 논문 평가·요약·번역 등을 실행해보세요.` }]);
    setSide(true);
    setTab("chat");
  }, []);

  /* ── chat ── */
  const send = async (custom) => {
    const m = custom || input;
    if (!m.trim() || streaming) return;
    if (!custom) setInput("");
    const next = [...msgs, { role: "user", content: m }];
    setMsgs(next);
    setStreaming(true);
    const idx = next.length;
    setMsgs([...next, { role: "assistant", content: "●●●" }]);
    const sys = `You are PaperLens AI — an expert academic paper assistant. Always respond in Korean. Use markdown. Be precise and cite paper sections.\nPaper text:\n${paperText.slice(0,15000)}`;
    const uc = pdfB64
      ? [{ type:"document", source:{type:"base64",media_type:"application/pdf",data:pdfB64} }, {type:"text",text:m}]
      : m + "\n\n[Paper text]:\n" + paperText.slice(0,15000);
    await callClaude(sys, uc, (p) => setMsgs(prev => { const c=[...prev]; c[idx]={role:"assistant",content:p}; return c; }));
    setStreaming(false);
  };

  /* ── analysis ── */
  const runA = async (k) => {
    if (results[k]) { setActiveA(k); setTab("analysis"); return; }
    setTab("analysis"); setActiveA(k); setALoading(true);
    const uc = pdfB64
      ? [{ type:"document", source:{type:"base64",media_type:"application/pdf",data:pdfB64} }, {type:"text",text:"이 논문을 분석해주세요."}]
      : "이 논문을 분석해주세요.\n\n" + paperText.slice(0,20000);
    await callClaude(PRESETS[k].sys, uc, (p) => setResults(prev => ({...prev,[k]:p})));
    setALoading(false);
  };

  /* ── notes ── */
  const addNote = () => { if(!noteIn.trim())return; setNotes(p=>[...p,{id:Date.now(),t:noteIn,time:new Date().toLocaleTimeString("ko-KR"),c:COLORS[Math.floor(Math.random()*COLORS.length)]}]); setNoteIn(""); };

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div style={R.root}>
      <style>{CSS}</style>

      {/* HEADER */}
      <header style={R.hdr}>
        <div style={R.hdrL}>
          <div style={R.logo}><span style={R.logoI}>◈</span><span style={R.logoT}>PaperLens</span></div>
          {fName && <span style={R.fname}>{fName}</span>}
        </div>
        <div style={R.hdrR}>
          <label style={R.upBtn}><input type="file" accept=".pdf" hidden onChange={e=>loadFile(e.target.files[0])}/>📎 논문 업로드</label>
          {file && <button style={R.togBtn} onClick={()=>setSide(!side)}>{side?"◧ 패널 닫기":"◨ AI 패널"}</button>}
        </div>
      </header>

      <div style={R.body}>
        {/* PDF */}
        <div style={{...R.pdf, flex: side && file ? "1 1 55%" : "1 1 100%"}}>
          {pdfUrl ? (
            <iframe src={pdfUrl} style={R.iframe} title="pdf"/>
          ) : (
            <div style={R.drop} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();loadFile(e.dataTransfer.files[0])}}>
              <div style={R.dropIn}>
                <div style={R.dropIco}>◈</div>
                <h2 style={R.dropH}>논문을 업로드하세요</h2>
                <p style={R.dropP}>PDF 파일을 드래그하거나 클릭하여 업로드</p>
                <label style={R.dropBtn}><input type="file" accept=".pdf" hidden onChange={e=>loadFile(e.target.files[0])}/>PDF 파일 선택</label>
                <div style={R.tags}>
                  {["💬 AI 채팅","⭐ 논문 평가","📋 요약","🌏 번역","🔬 방법론","📝 노트"].map(x=><span key={x} style={R.tag}>{x}</span>)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SIDE */}
        {side && file && (
          <div style={R.side}>
            <div style={R.tabBar}>
              {[{k:"chat",l:"💬 채팅"},{k:"analysis",l:"📊 분석"},{k:"notes",l:"📝 노트"}].map(x=>(
                <button key={x.k} style={{...R.tabBtn,...(tab===x.k?R.tabAct:{})}} onClick={()=>setTab(x.k)}>{x.l}</button>
              ))}
            </div>

            {/* ── CHAT TAB ── */}
            {tab==="chat" && (
              <div style={R.tabC}>
                <div style={R.chatScroll}>
                  {msgs.map((m,i)=>(
                    <div key={i} style={m.role==="user"?R.uRow:R.aRow}>
                      {m.role==="assistant"&&<div style={R.avatar}>◈</div>}
                      <div style={m.role==="user"?R.uBub:R.aBub} dangerouslySetInnerHTML={{__html:md(m.content)}}/>
                    </div>
                  ))}
                  <div ref={endRef}/>
                </div>
                <div style={R.qWrap}>
                  {QUICK.map((q,i)=><button key={i} className="qbtn" style={R.qBtn} onClick={()=>send(q)}>{q}</button>)}
                </div>
                <div style={R.inpWrap}>
                  <input style={R.inp} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="논문에 대해 질문하세요..." disabled={streaming}/>
                  <button style={{...R.sendBtn,...(streaming||!input.trim()?{opacity:.4}:{})}} onClick={()=>send()} disabled={streaming||!input.trim()}>{streaming?"⏳":"↑"}</button>
                </div>
              </div>
            )}

            {/* ── ANALYSIS TAB ── */}
            {tab==="analysis" && (
              <div style={R.tabC}>
                <div style={R.aGrid}>
                  {Object.entries(PRESETS).map(([k,v])=>(
                    <button key={k} className="acard" style={{...R.aCard,...(activeA===k?R.aCardAct:{}),...(results[k]?R.aCardDone:{})}} onClick={()=>runA(k)}>
                      <span style={{fontSize:18}}>{v.icon}</span>
                      <div><div style={R.aLabel}>{v.label}</div><div style={R.aDesc}>{v.desc}</div></div>
                      {results[k]&&<span style={R.chk}>✓</span>}
                    </button>
                  ))}
                </div>
                {activeA && (
                  <div style={R.aRes}>
                    <div style={R.aResH}><span>{PRESETS[activeA]?.icon} {PRESETS[activeA]?.label}</span>{aLoading&&<span style={R.spin}>⟳</span>}</div>
                    <div style={R.aResB} dangerouslySetInnerHTML={{__html:md(results[activeA]||"분석을 시작합니다...")}}/>
                  </div>
                )}
                {!activeA && <div style={{padding:40,textAlign:"center",color:"#8B8FA3",fontSize:14}}>위 카드를 클릭하여 분석을 시작하세요</div>}
              </div>
            )}

            {/* ── NOTES TAB ── */}
            {tab==="notes" && (
              <div style={R.tabC}>
                <div style={R.nInpW}>
                  <input style={R.nInp} value={noteIn} onChange={e=>setNoteIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNote()} placeholder="메모를 입력하세요..."/>
                  <button style={R.nAdd} onClick={addNote}>+</button>
                </div>
                <div style={R.nList}>
                  {notes.length===0&&<div style={{textAlign:"center",padding:40,color:"#8B8FA3"}}>📝 메모를 남겨보세요</div>}
                  {notes.map(n=>(
                    <div key={n.id} style={{...R.nCard,borderLeft:`3px solid ${n.c}`}}>
                      <div style={{fontSize:13,lineHeight:1.6}}>{n.t}</div>
                      <div style={R.nMeta}><span>{n.time}</span><button style={R.nDel} onClick={()=>setNotes(p=>p.filter(x=>x.id!==n.id))}>×</button></div>
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
const C = {
  bg:"#0C0E13", s1:"#141722", s2:"#1A1F30", s3:"#222842",
  brd:"#282D42", tx:"#E8E6E1", dim:"#8B8FA3",
  acc:"#E8B931", accG:"rgba(232,185,49,0.12)",
  grn:"#34D399", red:"#FF6B6B",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-track{background:${C.bg}}
::-webkit-scrollbar-thumb{background:${C.brd};border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:${C.dim}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.qbtn:hover{background:${C.s3}!important;color:${C.tx}!important;border-color:${C.acc}!important}
.acard:hover{border-color:${C.acc}!important;background:${C.accG}!important}
`;

const R = {
  root:{fontFamily:"'Noto Sans KR',sans-serif",background:C.bg,color:C.tx,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"},
  hdr:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 20px",height:50,background:C.s1,borderBottom:`1px solid ${C.brd}`,flexShrink:0},
  hdrL:{display:"flex",alignItems:"center",gap:14},
  hdrR:{display:"flex",alignItems:"center",gap:10},
  logo:{display:"flex",alignItems:"center",gap:8},
  logoI:{fontSize:22,color:C.acc,fontWeight:700},
  logoT:{fontSize:16,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",background:`linear-gradient(135deg,${C.acc},#F0D060)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"-0.5px"},
  fname:{fontSize:12,color:C.dim,background:C.s2,padding:"3px 10px",borderRadius:6,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
  upBtn:{padding:"6px 14px",background:C.acc,color:C.bg,border:"none",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Noto Sans KR',sans-serif"},
  togBtn:{padding:"6px 12px",background:C.s2,color:C.tx,border:`1px solid ${C.brd}`,borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"'Noto Sans KR',sans-serif"},
  body:{flex:1,display:"flex",overflow:"hidden"},
  pdf:{display:"flex",transition:"flex 0.3s",borderRight:`1px solid ${C.brd}`},
  iframe:{width:"100%",height:"100%",border:"none",background:"#525659"},

  /* drop */
  drop:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:`radial-gradient(ellipse at center,${C.s2} 0%,${C.bg} 70%)`},
  dropIn:{textAlign:"center",padding:40,maxWidth:460},
  dropIco:{fontSize:64,color:C.acc,marginBottom:20,animation:"float 3s ease-in-out infinite",display:"block"},
  dropH:{fontSize:22,fontWeight:700,marginBottom:6},
  dropP:{fontSize:13,color:C.dim,marginBottom:24},
  dropBtn:{display:"inline-block",padding:"12px 28px",background:C.acc,color:C.bg,border:"none",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:20},
  tags:{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"},
  tag:{padding:"4px 12px",background:C.accG,color:C.acc,borderRadius:20,fontSize:11,fontWeight:500},

  /* side */
  side:{flex:"0 0 400px",maxWidth:400,display:"flex",flexDirection:"column",background:C.s1,animation:"fadeUp 0.3s ease"},
  tabBar:{display:"flex",borderBottom:`1px solid ${C.brd}`,flexShrink:0},
  tabBtn:{flex:1,padding:"10px 0",background:"transparent",color:C.dim,border:"none",borderBottom:"2px solid transparent",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'Noto Sans KR',sans-serif",transition:"all 0.2s"},
  tabAct:{color:C.acc,borderBottomColor:C.acc},
  tabC:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},

  /* chat */
  chatScroll:{flex:1,overflow:"auto",padding:14,display:"flex",flexDirection:"column",gap:10},
  uRow:{display:"flex",justifyContent:"flex-end",animation:"fadeUp 0.2s ease"},
  aRow:{display:"flex",gap:8,alignItems:"flex-start",animation:"fadeUp 0.3s ease"},
  avatar:{width:26,height:26,borderRadius:7,background:C.accG,color:C.acc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,marginTop:2},
  uBub:{background:C.acc,color:C.bg,padding:"8px 14px",borderRadius:"14px 14px 4px 14px",maxWidth:"82%",fontSize:13,lineHeight:1.6,fontWeight:500},
  aBub:{background:C.s2,color:C.tx,padding:"10px 14px",borderRadius:"4px 14px 14px 14px",maxWidth:"calc(100% - 34px)",fontSize:13,lineHeight:1.7,border:`1px solid ${C.brd}`},
  qWrap:{padding:"6px 10px",display:"flex",flexWrap:"wrap",gap:5,borderTop:`1px solid ${C.brd}`,maxHeight:72,overflowY:"auto",flexShrink:0},
  qBtn:{padding:"3px 10px",background:C.s2,color:C.dim,border:`1px solid ${C.brd}`,borderRadius:20,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.2s",fontFamily:"'Noto Sans KR',sans-serif"},
  inpWrap:{display:"flex",gap:8,padding:"10px 12px",borderTop:`1px solid ${C.brd}`,background:C.s1,flexShrink:0},
  inp:{flex:1,padding:"9px 14px",background:C.s2,color:C.tx,border:`1px solid ${C.brd}`,borderRadius:10,fontSize:13,outline:"none",fontFamily:"'Noto Sans KR',sans-serif"},
  sendBtn:{width:38,height:38,borderRadius:10,background:C.acc,color:C.bg,border:"none",fontSize:17,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},

  /* analysis */
  aGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,padding:10,flexShrink:0},
  aCard:{padding:"9px 11px",background:C.s2,border:`1px solid ${C.brd}`,borderRadius:10,cursor:"pointer",textAlign:"left",transition:"all 0.2s",position:"relative",fontFamily:"'Noto Sans KR',sans-serif",display:"flex",gap:8,alignItems:"center"},
  aCardAct:{borderColor:C.acc,background:C.accG},
  aCardDone:{borderColor:C.grn+"44"},
  aLabel:{fontSize:12,fontWeight:600,color:C.tx},
  aDesc:{fontSize:10,color:C.dim,marginTop:1},
  chk:{position:"absolute",top:5,right:7,color:C.grn,fontSize:13,fontWeight:700},
  aRes:{flex:1,overflow:"auto",borderTop:`1px solid ${C.brd}`},
  aResH:{padding:"9px 14px",fontSize:14,fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.brd}`,position:"sticky",top:0,background:C.s1,zIndex:1},
  spin:{display:"inline-block",animation:"spin 1s linear infinite",fontSize:16},
  aResB:{padding:14,fontSize:13,lineHeight:1.8},

  /* notes */
  nInpW:{display:"flex",gap:8,padding:"10px 12px",borderBottom:`1px solid ${C.brd}`,flexShrink:0},
  nInp:{flex:1,padding:"8px 12px",background:C.s2,color:C.tx,border:`1px solid ${C.brd}`,borderRadius:8,fontSize:13,outline:"none",fontFamily:"'Noto Sans KR',sans-serif"},
  nAdd:{width:34,height:34,borderRadius:8,background:C.acc,color:C.bg,border:"none",fontSize:20,fontWeight:700,cursor:"pointer"},
  nList:{flex:1,overflow:"auto",padding:10,display:"flex",flexDirection:"column",gap:7},
  nCard:{padding:"10px 14px",background:C.s2,borderRadius:8,animation:"fadeUp 0.2s ease"},
  nMeta:{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:C.dim,marginTop:6},
  nDel:{background:"transparent",border:"none",color:C.red,fontSize:16,cursor:"pointer",padding:"0 4px"},
};

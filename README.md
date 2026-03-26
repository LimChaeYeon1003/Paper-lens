# ◈ PaperLens — AI 논문 뷰어

AI 기반 학술 논문 PDF 뷰어입니다. 논문을 업로드하면 AI가 요약, 평가, 번역, 방법론 분석 등을 제공합니다.

## 기능

- 💬 AI 채팅 — 논문에 대해 자유롭게 질문
- ⭐ 논문 평가 — 10점 만점 세부 평가
- 📋 요약 — 핵심 내용 구조적 요약
- 🔬 방법론 분석 — 연구 설계 심층 분석
- 🎯 심층 비평 — 논리 구조 및 학술 비평
- 🌏 한국어 번역 — 핵심 내용 번역
- 📖 쉬운 설명 — 비전공자 눈높이 설명
- 📝 노트 — 메모 기능

## 배포 방법 (Vercel 추천)

### 1. GitHub에 업로드

```bash
cd paper-lens
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_ID/paper-lens.git
git push -u origin main
```

### 2. Vercel에 배포

1. [vercel.com](https://vercel.com) → GitHub 로그인
2. "Import Project" → 레포 선택 → Deploy

### 3. ⚠️ API Key 설정 (필수!)

Vercel 대시보드에서:
1. 프로젝트 → **Settings** → **Environment Variables**
2. `ANTHROPIC_API_KEY` = `sk-ant-api03-...` 입력
3. **Redeploy** 클릭

또는 사용자가 앱 내 🔒 버튼으로 개인 API Key를 입력할 수도 있습니다.

### 로컬 실행

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

## 기술 스택

- React 18 + Vite
- Anthropic Claude API (스트리밍)
- Vercel Serverless Functions (API 프록시)
- PDF.js (PDF 렌더링)

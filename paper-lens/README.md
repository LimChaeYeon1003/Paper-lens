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

## 배포 방법

### 방법 1: Vercel (추천 — 가장 쉬움)

1. 이 폴더를 GitHub에 업로드
2. [vercel.com](https://vercel.com) 에서 GitHub 로그인
3. "Import Project" → 이 레포 선택
4. "Deploy" 클릭 — 끝!

### 방법 2: 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### 방법 3: Netlify

1. `npm run build` 실행
2. [netlify.com](https://netlify.com) 에서 `dist` 폴더 드래그 앤 드롭

## 기술 스택

- React 18 + Vite
- Anthropic Claude API (스트리밍)

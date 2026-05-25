# SoundShare 프로젝트

## 서비스 개요
Spotify 사용자들이 노래/플레이리스트를 추천하고 공유하는 커뮤니티.
커뮤니티에서 발견한 곡을 원클릭으로 Spotify 플레이리스트에 추가 가능.

## 기술 스택
- 프론트엔드: HTML5 + CSS3 + Vanilla JS
- 인증/DB: Firebase Authentication + Firestore
- 음악 API: iTunes Search API (무료, 인증 불필요)
- 호스팅: GitHub Pages / Firebase Hosting

## 페이지 구조
- index.html: 메인 피드 (게시글 목록, 검색/필터 — 라디오 버튼 조건 필터링)
- login.html: 로그인
- signup.html: 회원가입
- forgot.html: 비밀번호 찾기
- settings.html: 회원정보 수정
- write.html: 게시글 작성 / 수정 (id 파라미터 있으면 수정 모드)
- post.html: 게시글 상세 (본인 글이면 수정/삭제 버튼 노출)
- user.html: 사용자 페이지
- mypage.html: 내 페이지

## 파일 구조
SoundShare/
├── index.html
├── login.html
├── signup.html
├── forgot.html
├── settings.html
├── write.html
├── post.html
├── user.html
├── mypage.html
├── components/
│   └── header.html
├── css/
│   └── style.css
└── js/
    ├── firebase.js
    ├── auth.js
    ├── music.js
    ├── post.js
    ├── notify.js
    ├── ui.js
    ├── app.js
    └── header-loader.js

## JS 파일 역할
- js/firebase.js: Firebase 초기화 및 Firestore/Auth 함수 export
- js/auth.js: 회원가입, 로그인, 비밀번호 찾기
- js/music.js: iTunes Search API 기반 노래 검색 (장르 자동 태그 포함)
- js/post.js: 게시글 CRUD, 좋아요, 댓글
- js/notify.js: 알림 Firestore 실시간 리스너
- js/ui.js: 공통 UI (토스트, 모달, 드롭다운)
- js/app.js: 페이지 진입점 (loadHeader, initTopbar, requireAuth 등)
- js/header-loader.js: 헤더 HTML을 fetch로 즉시 삽입 (모듈/Firebase와 독립 실행)

## 주요 기능
- 노래/플레이리스트 검색 (장르, 제목 필터 — index.html 내 라디오 버튼)
- 게시글 작성/수정 (트랙 첨부, 장르 태그, 감성 태그)
- Apple Music / Spotify 링크 제공 (트랙 카드)
- 좋아요/저장/댓글
- 본인 게시글: 수정(write.html?id=) / 삭제 버튼 노출
- 본인 댓글: ··· 버튼으로 수정/삭제
- 사용자 페이지 (현재 재생, 공개 범위 설정)
- 추천곡 담기 알림 (Firestore 실시간)

## 헤더 규칙
- 로그인 / 회원가입 / 비밀번호 찾기 페이지: **로고만** 표시
- 게시글 작성(write.html) 페이지: 글쓰기 버튼 **미표시**
- 나머지 페이지: 로고, 검색바, 글쓰기 버튼, 🔔 알림, 프로필 표시

## 개발 규칙
- 프레임워크 사용 금지 (순수 HTML/CSS/JS만)
- 공통 헤더는 components/header.html — js/header-loader.js로 fetch include
- CSS는 style.css 단일 파일
- 비동기 처리는 async/await 사용
- 음악 검색은 iTunes Search API 사용 (js/music.js)

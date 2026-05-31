# SoundShare 프로젝트

## 서비스 개요
Spotify 사용자들이 노래/플레이리스트를 추천하고 공유하는 커뮤니티.
커뮤니티에서 발견한 곡을 원클릭으로 Spotify 플레이리스트에 추가 가능.

## 기술 스택
- 프론트엔드: HTML5 + CSS3 + Vanilla JS
- 인증/DB: Firebase Authentication + Firestore (v10 모듈 CDN)
- 음악 API: iTunes Search API (무료, 인증 불필요)
- 호스팅: GitHub Pages / Firebase Hosting

## 페이지 구조
- index.html: 메인 피드 (게시글 목록, 정렬, 검색)
- login.html: 인증 모달 HTML 컨테이너 (직접 접근 시 index.html로 리다이렉트)
- signup.html / forgot.html: index.html로 리다이렉트
- write.html: 게시글 작성 / 수정 (hash에 id 있으면 수정 모드)
- post.html: 게시글 상세 (본인 글이면 수정/삭제 버튼 노출)
- search.html: 검색 전용 페이지
- mypage.html: 내 페이지 (포스트 / 댓글 / 좋아요 탭)
- profile.html: 다른 유저 프로필 (hash에 uid)
- settings.html: 회원정보 수정 (닉네임, 비밀번호, 프로필 사진, 공개 범위, 탈퇴)

## 파일 구조
```
SoundShare/
├── index.html
├── login.html
├── signup.html
├── forgot.html
├── write.html
├── post.html
├── search.html
├── mypage.html
├── profile.html
├── settings.html
├── config.js              — Firebase 설정 (gitignore 대상)
├── components/
│   ├── header.html        — 공통 헤더 (검색바, 알림, 프로필)
│   └── header-auth.html   — 인증 페이지용 헤더 (로고만)
├── css/
│   ├── base.css           — 공통 변수, 레이아웃, 컴포넌트
│   ├── header.css         — 헤더/탑바/알림 패널
│   ├── feed.css           — 피드 카드 (index, mypage, profile 공통)
│   ├── post.css           — 게시글 상세
│   ├── write.css          — 글쓰기 에디터
│   ├── profile.css        — 프로필/마이페이지
│   ├── search.css         — 검색 페이지
│   ├── settings.css       — 설정 페이지
│   └── index.css          — 메인 피드 전용
└── js/
    ├── firebase.js        — Firebase 초기화 및 Firestore/Auth export
    ├── auth.js            — 닉네임 중복확인, 비밀번호 변경, 탈퇴 등
    ├── music.js           — iTunes Search API 노래 검색
    ├── post.js            — 게시글 CRUD, 좋아요, 댓글
    ├── notify.js          — 알림 Firestore 실시간 리스너
    ├── ui.js              — 공통 UI (renderFeedCard, renderPagination, showToast 등)
    ├── app.js             — loadHeader, initTopbar, requireAuth
    ├── header-loader.js   — 헤더 fetch 삽입 + Firebase 연결 힌트 주입
    ├── index-page.js      — index.html 페이지 로직
    ├── post-page.js       — post.html 페이지 로직
    ├── write-page.js      — write.html 페이지 로직
    ├── search-page.js     — search.html 페이지 로직
    ├── mypage-page.js     — mypage.html 페이지 로직
    ├── profile-page.js    — profile.html 페이지 로직
    └── settings-page.js   — settings.html 페이지 로직
```

## JS 파일 역할
- **firebase.js**: Firebase 초기화 및 Firestore/Auth 함수 export
- **auth.js**: 닉네임 중복확인, 비밀번호 변경, 계정 탈퇴, 프로필 사진 변경
- **music.js**: iTunes Search API 기반 노래 검색 (장르 자동 태그 포함)
- **post.js**: 게시글 CRUD, 좋아요, 댓글, 검색
- **notify.js**: 알림 Firestore 실시간 리스너
- **ui.js**: 공통 렌더 함수 (renderFeedCard, renderPagination, renderComment, renderCommentedItem, showToast, resolveAvatars 등)
- **app.js**: loadHeader, initTopbar, requireAuth
- **header-loader.js**: 헤더 HTML fetch 삽입 + Firebase preconnect/modulepreload 힌트 주입
- **\*-page.js**: 각 페이지의 전용 로직 (HTML 인라인 스크립트 없음)

## 헤더 규칙
- `login.html` / `signup.html` / `forgot.html`: 해당 없음 (index.html로 리다이렉트)
- `write.html`: 커스텀 헤더 (`.le-header`) — header-loader.js 미사용
- 나머지 페이지: `header-loader.js` → `components/header.html` 삽입 (로고, 검색바, 알림, 프로필)

## 개발 규칙
- 프레임워크 사용 금지 (순수 HTML/CSS/JS만)
- 공통 헤더는 `components/header.html` — `js/header-loader.js`로 fetch include
- 페이지별 CSS 파일 분리 (`css/*.css`), 공통은 `base.css` + `header.css`
- 페이지별 JS 파일 분리 (`js/*-page.js`), HTML에 인라인 스크립트 없음
- 비동기 처리는 async/await + top-level await (ES module)
- 음악 검색은 iTunes Search API 사용 (`js/music.js`)
- Firebase 버전: `header-loader.js` 상단 `FB_VER` 상수 한 곳에서 관리

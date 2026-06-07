// ── Firebase 연결 힌트 — 모든 페이지 공통 ──────────────────────────
(function () {
  var FB_VER = '10.12.4';
  // Firebase/Auth/Firestore 리소스를 미리 연결해 첫 로딩 지연 감소
  // preconnect: 외부 도메인 연결 준비, modulepreload: Firebase 모듈 사전 로드
  var hints = [
    { rel: 'preconnect',    href: 'https://www.gstatic.com',                                          co: true },
    { rel: 'preconnect',    href: 'https://firestore.googleapis.com',                                 co: true },
    { rel: 'dns-prefetch',  href: 'https://identitytoolkit.googleapis.com' },
    { rel: 'modulepreload', href: 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app.js',       co: true },
    { rel: 'modulepreload', href: 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-auth.js',      co: true },
    { rel: 'modulepreload', href: 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-firestore.js', co: true },
  ];
  hints.forEach(function (h) {
    // link 태그를 동적으로 만들어 head에 추가
    // 모든 페이지에서 Firebase 관련 네트워크 준비를 공통 적용
    var el = document.createElement('link');
    el.rel  = h.rel;
    el.href = h.href;
    if (h.co) el.crossOrigin = '';
    document.head.appendChild(el);
  });
})();

window.__headerReady = fetch('./components/header.html')
  .then(function(r) { return r.text(); })
  .then(function(html) {
    // 공통 헤더 HTML을 각 페이지 body 맨 앞에 삽입
    document.body.insertAdjacentHTML('afterbegin', html);
    // login.html에서 인증 모달 HTML을 추출해서 주입
    return fetch('./login.html')
      .then(function(r) { return r.text(); })
      .then(function(modalHtml) {
        var tmp = document.createElement('div');
        tmp.innerHTML = modalHtml;
        // login.html 전체가 아니라 #authModal만 추출해 현재 페이지에 추가
        var modal = tmp.querySelector('#authModal');
        if (modal) document.body.appendChild(modal);
      });
  });

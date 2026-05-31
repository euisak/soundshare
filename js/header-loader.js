// ── Firebase 연결 힌트 — 모든 페이지 공통 ──────────────────────────
(function () {
  var FB_VER = '10.12.4';
  var hints = [
    { rel: 'preconnect',    href: 'https://www.gstatic.com',                                          co: true },
    { rel: 'preconnect',    href: 'https://firestore.googleapis.com',                                 co: true },
    { rel: 'dns-prefetch',  href: 'https://identitytoolkit.googleapis.com' },
    { rel: 'modulepreload', href: 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app.js',       co: true },
    { rel: 'modulepreload', href: 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-auth.js',      co: true },
    { rel: 'modulepreload', href: 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-firestore.js', co: true },
  ];
  hints.forEach(function (h) {
    var el = document.createElement('link');
    el.rel  = h.rel;
    el.href = h.href;
    if (h.co) el.crossOrigin = '';
    document.head.appendChild(el);
  });
})();

var isAuthPage = document.body.classList.contains('auth-page');
var headerSrc = isAuthPage ? './components/header-auth.html' : './components/header.html';

window.__headerReady = fetch(headerSrc)
  .then(function(r) { return r.text(); })
  .then(function(html) {
    document.body.insertAdjacentHTML('afterbegin', html);
    // 비-auth 페이지에서만 login.html에서 모달 HTML을 추출해서 주입
    if (!isAuthPage) {
      return fetch('./login.html')
        .then(function(r) { return r.text(); })
        .then(function(modalHtml) {
          var tmp = document.createElement('div');
          tmp.innerHTML = modalHtml;
          var modal = tmp.querySelector('#authModal');
          if (modal) document.body.appendChild(modal);
        });
    }
  });

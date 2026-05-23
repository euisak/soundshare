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

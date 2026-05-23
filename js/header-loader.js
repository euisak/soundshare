// 헤더를 모듈/Firebase와 독립적으로 즉시 로드
window.__headerReady = fetch('./components/header.html')
  .then(function (r) { return r.text(); })
  .then(function (html) {
    document.body.insertAdjacentHTML('afterbegin', html);
  });

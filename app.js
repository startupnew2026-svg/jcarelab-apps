"use strict";

// 최근에 열어 본 앱 이름만 기억합니다. 각 앱의 입력 내용은 건드리지 않습니다.
const recentAppKey = "jcarelab-app-list-recent-v1";
const appNames = { quote: "거래명세서 만들기", reply: "공지 · 안내 문자 작성기", check: "점검 · 체크리스트" };

function showRecentApp() {
  try {
    const saved = localStorage.getItem(recentAppKey);
    if (!Object.hasOwn(appNames, saved)) return;
    const link = document.getElementById("recent-link");
    link.textContent = appNames[saved];
    link.href = `./${saved}/`;
    document.getElementById("recent-app").hidden = false;
  } catch {
    // 저장을 허용하지 않는 브라우저에서도 앱 열기는 그대로 작동합니다.
  }
}

document.querySelectorAll("[data-app]").forEach((link) => {
  link.addEventListener("click", () => {
    try { localStorage.setItem(recentAppKey, link.dataset.app); }
    catch { /* 최근 사용 기록을 저장하지 못해도 선택한 앱으로 이동합니다. */ }
  });
});

// 뒤로 가기로 돌아왔을 때에도 방금 열었던 앱을 보여 줍니다.
window.addEventListener("pageshow", showRecentApp);

// 쉽게 바꾸는 값들입니다. Firebase 웹 앱의 공개 연결정보 네 가지를 복사해 넣으세요.
// 계정 비밀번호나 서비스 계정 비밀키는 절대 넣지 않습니다.
window.Dashboard = window.Dashboard || {};
window.Dashboard.config = Object.freeze({
  timeZone: "Asia/Seoul", // 오늘과 마감일은 한국시간으로 판단합니다.
  priorityDays: 14,
  reloadHours: [0, 6, 12, 18],
  titleMaxLength: 120,
  preferencesKey: "our-day-preferences-v1",
  schemaVersion: 1,
  firebase: {
    apiKey: "AIzaSyDHw_pU-YeSP7NNCJizPSEodIOhT8j12iI", // 웹 앱의 공개 연결 키
    authDomain: "dashboard-a6443.firebaseapp.com", // 로그인용 도메인
    projectId: "dashboard-a6443", // Firebase 프로젝트 ID
    appId: "1:765030222756:web:8d5d41a6020185c6fecf31" // 등록한 웹 앱 ID
  }
});

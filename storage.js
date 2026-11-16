// Firebase 통신·로그인·허용 목록 확인·실시간 저장은 이 파일에서만 담당합니다.
(function () {
  "use strict";
  const D = window.Dashboard, M = D.model, C = D.config;
  const SDK_ROOT = "https://www.gstatic.com/firebasejs/13.3.0/"; // 버전 고정
  const listeners = new Set(), statusListeners = new Set();
  let sdkPromise, sdk, db, user = null, stopWatching = null, items = [], memberStop = null, generation = 0, taskGeneration = 0, permitted = false, serverSeen = false;
  let status = { code: "setup-required", title: "저장소 설정을 기다리고 있어요", detail: "안내에 따라 연결정보를 입력해주세요.", busy: false };
  const authListeners = new Set();
  let auth, authJob, authStop, appearanceStop, appearance = {};
  let authState = { ready: false, busy: false, error: "", title: "로그인을 준비하고 있어요" };

  // 앱은 화면 설정만 보관합니다. 로그인 유지 정보는 Firebase Authentication이 관리합니다.
  function readPreferences() {
    try { const value = JSON.parse(localStorage.getItem(C.preferencesKey) || "{}"); return value && typeof value === "object" ? value : {}; }
    catch { return {}; }
  }
  let preferences = readPreferences();
  function setPreferences(patch) {
    preferences = { ...preferences, ...patch };
    try { localStorage.setItem(C.preferencesKey, JSON.stringify(preferences)); } catch { /* 화면 설정은 메모리에 유지합니다. */ }
  }
  function setStatus(code, title, detail, busy = false) {
    status = { code, title, detail, busy };
    for (const listener of statusListeners) listener({ ...status });
  }
  function watchStatus(listener) {
    statusListeners.add(listener); listener({ ...status });
    return () => statusListeners.delete(listener);
  }
  function emit() { for (const listener of listeners) listener(items.map(M.normalize)); }
  function configurationError() {
    const config = C.firebase || {};
    const missing = ["apiKey", "authDomain", "projectId", "appId"].filter(key => typeof config[key] !== "string" || !config[key].trim());
    if (missing.length) return `config.js에 ${missing.join(", ")} 값을 입력한 뒤 새로고침해주세요.`;
    if (!/^[A-Za-z0-9_-]{20,}$/.test(config.apiKey) || !/^[a-z0-9.-]+$/i.test(config.authDomain) ||
        !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId) || !/^\d+:\d+:web:[a-z0-9]+$/i.test(config.appId)) {
      return "연결정보의 형식이 맞지 않아요. Firebase 웹 앱 설정의 값을 따옴표 안에 그대로 복사해주세요.";
    }
    return "";
  }
  function init() {
    items = []; emit();
    const problem = configurationError();
    if (problem) setStatus("setup-required", "연결정보 입력이 필요해요", problem);
    else if (!/^https?:$/.test(location.protocol)) setStatus("local-file", "미리보기 서버로 열어주세요", "2단계부터는 README의 PowerShell 명령으로 실행한 뒤 http://localhost:8000을 열어주세요.");
    else setStatus("ready-to-check", "로그인을 기다리고 있어요", "허용된 Google 계정으로 로그인하면 일정을 불러옵니다.");
    prepareAuth();
    return { ...status };
  }
  async function loadSdk() {
    if (!sdkPromise) {
      sdkPromise = Promise.all([import(SDK_ROOT + "firebase-app.js"), import(SDK_ROOT + "firebase-firestore.js"), import(SDK_ROOT + "firebase-auth.js")])
        .then(([app, firestore, auth]) => ({ app, firestore, auth }))
        .catch(error => { sdkPromise = null; throw error; });
    }
    return sdkPromise;
  }
  async function within(promise, milliseconds) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("응답 대기시간 초과"), { code: "deadline-exceeded" })), milliseconds);
      })]);
    } finally { clearTimeout(timer); }
  }
  function friendlyError(error) {
    const code = String(error && error.code || "").replace(/^firestore\//, "");
    const messages = {
      "unavailable": "서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.",
      "deadline-exceeded": "서버 응답을 기다리다 멈췄어요. 연결 상태를 확인한 뒤 다시 시도해주세요.",
      "not-found": "프로젝트 ID와 Firestore의 (default) 데이터베이스가 있는지 확인해주세요.",
      "failed-precondition": "Firestore 데이터베이스 생성이 끝났는지 확인해주세요.",
      "invalid-argument": "Firebase 웹 앱의 연결정보를 다시 확인해주세요.",
      "resource-exhausted": "무료 사용 한도에 도달했을 수 있어요. Firebase의 사용량 화면을 확인해주세요.",
      "permission-denied": "접근이 거절됐어요. 로그인 계정과 허용 목록·보안 규칙을 확인해주세요."
    };
    return messages[code] || "연결 도구를 불러오지 못했거나 설정이 맞지 않아요. 인터넷 연결과 config.js를 확인해주세요.";
  }
  // 다시 연결해도 허용 여부는 매번 서버 규칙이 결정합니다.
  function checkConnection() {
    stopSubscription();
    if (user) startSubscription();
    else setStatus("signed-out", "로그인이 필요해요", "허용 목록에 등록한 Google 계정으로 로그인해주세요.");
  }

  function publishAuth(patch = {}) {
    authState = { ...authState, ...patch };
    for (const listener of authListeners) listener({ ...authState, user: currentUser() });
  }
  function watchAuth(listener) {
    authListeners.add(listener); listener({ ...authState, user: currentUser() });
    return () => authListeners.delete(listener);
  }
  function authMessage(error) {
    const messages = {
      "auth/unauthorized-domain": "이 사이트 주소를 Firebase Authentication → 설정 → 승인된 도메인에 추가해주세요.",
      "auth/operation-not-allowed": "Firebase Authentication → 로그인 방법에서 Google을 사용 설정해주세요.",
      "auth/popup-blocked": "로그인 창이 차단됐어요. Chrome이나 Samsung Internet에서 사이트를 직접 열고 팝업을 허용한 뒤 다시 눌러주세요.",
      "auth/popup-closed-by-user": "로그인 창을 닫았어요. 다시 로그인할 수 있습니다.",
      "auth/cancelled-popup-request": "이미 로그인 창이 열려 있어요. 열린 창을 확인해주세요.",
      "auth/network-request-failed": "로그인 서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.",
      "auth/web-storage-unsupported": "로그인 정보를 보관할 수 없어요. 일반 브라우저에서 사이트 저장을 허용해주세요.",
      "auth/too-many-requests": "요청이 많아 잠시 제한됐어요. 잠시 뒤 다시 시도해주세요.",
      "auth/user-disabled": "사용 중지된 계정입니다. Firebase Authentication 사용자 목록을 확인해주세요.",
      "auth/invalid-api-key": "config.js의 Firebase 연결정보를 확인해주세요."
    };
    return messages[error.code] || `로그인을 처리하지 못했어요. 다시 시도해주세요. (${error.code || "연결 오류"})`;
  }
  function prepareAuth() {
    if (authJob || authState.ready) return authJob || Promise.resolve();
    authJob = (async () => {
      publishAuth({ busy: true, error: "", title: "로그인을 준비하고 있어요" });
      try {
        const problem = configurationError();
        if (problem) throw new Error(problem);
        if (!/^https?:$/.test(location.protocol)) throw new Error("GitHub Pages 주소 또는 미리보기 서버로 열어주세요.");
        sdk = await within(loadSdk(), 15000);
        const app = sdk.app.getApps().find(item => item.name === "dashboard") || sdk.app.initializeApp(C.firebase, "dashboard");
        auth = sdk.auth.getAuth(app); auth.languageCode = "ko";
        if (!db) db = sdk.firestore.initializeFirestore(app, { localCache: sdk.firestore.memoryLocalCache() });
        await within(sdk.auth.setPersistence(auth, sdk.auth.browserLocalPersistence), 15000);
        await within(auth.authStateReady(), 15000);
        if (authStop) authStop();
        authStop = sdk.auth.onAuthStateChanged(auth, next => {
          stopSubscription(); user = next;
          setStatus(next ? "loading" : "signed-out", next ? "접근 권한을 확인하고 있어요" : "로그인이 필요해요", "허용 목록에 등록한 Google 계정만 일정을 사용할 수 있습니다.");
          publishAuth({ ready: true, error: "", title: next ? "구글 로그인 완료" : "구글 계정으로 로그인해주세요" });
          if (next) startSubscription();
        }, error => { user = null; stopSubscription(); publishAuth({ ready: false, error: authMessage(error) }); });
      } catch (error) {
        publishAuth({ ready: false, title: "로그인 준비를 마치지 못했어요", error: error.code ? authMessage(error) : error.message });
      } finally { publishAuth({ busy: false }); }
    })().finally(() => { authJob = null; });
    return authJob;
  }
  async function signIn() {
    if (!authState.ready || authState.busy || user) return;
    if (!navigator.onLine) { publishAuth({ error: "인터넷이 다시 연결되면 로그인할 수 있어요." }); return; }
    publishAuth({ busy: true, error: "" });
    try {
      const provider = new sdk.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      // 버튼 클릭 직후 창을 열어 모바일 팝업 차단을 줄입니다. 추가 Google 권한은 요청하지 않습니다.
      await sdk.auth.signInWithPopup(auth, provider);
    } catch (error) { publishAuth({ error: authMessage(error) }); }
    finally { publishAuth({ busy: false }); }
  }
  async function signOut() {
    if (!auth || authState.busy) return;
    publishAuth({ busy: true, error: "" });
    try { await sdk.auth.signOut(auth); user = null; stopSubscription(); }
    catch (error) { publishAuth({ error: authMessage(error) }); }
    finally { publishAuth({ busy: false }); }
  }
  function currentUser() { return user ? { id: user.uid, name: user.displayName || user.email || "사용자", email: user.email || "" } : null; }
  function canWrite() { return Boolean(user && permitted && serverSeen && navigator.onLine && status.code === "live"); }
  function requireWritable(expectedUser, importing = false) {
    if (expectedUser && (!user || user.uid !== expectedUser)) throw new Error("로그인 계정이 바뀌었어요. 다시 시도해주세요.");
    if (!navigator.onLine) throw new Error("인터넷이 다시 연결되면 수정할 수 있어요.");
    if (!canWrite() && !(importing && user && permitted && serverSeen && status.code === "saving")) throw new Error("구글 로그인과 허용 목록 설정을 마친 뒤 저장할 수 있어요.");
  }
  function record(snapshot) {
    const raw = snapshot.data() || {};
    const value = { ...raw, id: snapshot.id };
    for (const key of ["createdAt", "updatedAt", "completedAt", "restoredAt"]) {
      value[key] = raw[key] && typeof raw[key].toDate === "function" ? raw[key].toDate().toISOString() : raw[key] || null;
    }
    return M.normalize(value);
  }
  function stopTasks() {
    taskGeneration++;
    if (appearanceStop) appearanceStop(); appearanceStop = null; appearance = {};
    if (stopWatching) stopWatching(); stopWatching = null;
    serverSeen = false; items = []; emit();
  }
  function stopSubscription() {
    generation++; permitted = false;
    if (memberStop) memberStop(); memberStop = null;
    stopTasks();
  }
  function startSubscription() {
    if (!user || !db || memberStop || !listeners.size) return;
    const F = sdk.firestore, turn = generation;
    setStatus("loading", "접근 권한을 확인하고 있어요", "허용 목록과 최신 일정을 서버에서 확인하고 있어요.");
    const failed = error => {
      if (turn !== generation) return;
      stopSubscription(); setStatus("access-error", "일정 접근이 거절됐거나 연결에 실패했어요", friendlyError(error));
    };
    // 다른 계정으로 바꿨을 때 이전 계정의 메모리 자료가 표시되지 않게 서버 응답을 기다립니다.
    memberStop = F.onSnapshot(F.doc(db, "members", (user.email || "").toLowerCase()), { includeMetadataChanges: true }, member => {
      if (turn !== generation || member.metadata.fromCache) return;
      permitted = member.exists() && member.data().enabled === true;
      if (!permitted) {
        stopTasks(); setStatus("not-allowed", "허용 목록에 없는 계정이에요", "Firebase의 members에서 이 이메일의 enabled 값을 true로 설정해주세요."); return;
      }
      const colorTurn = taskGeneration;
      if (!appearanceStop) appearanceStop = F.onSnapshot(F.doc(db, "settings", "appearance"), value => {
        if (turn !== generation || colorTurn !== taskGeneration || !permitted) return;
        const data = value.exists() ? value.data() : {};
        appearance = Object.fromEntries(["skyEmail", "pinkEmail"].map(key => [key, typeof data[key] === "string" ? data[key].trim().toLowerCase() : ""])); emit();
      }, () => { if (turn === generation && colorTurn === taskGeneration) { appearance = {}; emit(); } });
      if (stopWatching) return;
      const taskTurn = taskGeneration;
      stopWatching = F.onSnapshot(F.collection(db, "tasks"), { includeMetadataChanges: true }, snapshot => {
        if (turn !== generation || taskTurn !== taskGeneration || !permitted) return;
        if (snapshot.metadata.fromCache) {
          if (serverSeen) setStatus("cached", "서버 연결을 기다리고 있어요", "마지막으로 받은 목록을 표시합니다. 연결이 확인되면 수정할 수 있어요.");
          return;
        }
        serverSeen = true;
        setStatus(snapshot.metadata.hasPendingWrites ? "saving" : "live", "공동 일정에 연결됐어요", "변경 내용은 같은 저장소를 여는 기기에 실시간으로 반영됩니다.");
        items = snapshot.docs.map(record); emit();
      }, failed);
    }, failed);
  }
  function subscribe(listener) {
    listeners.add(listener); listener(items.map(M.normalize)); startSubscription();
    return () => { listeners.delete(listener); if (!listeners.size) stopSubscription(); };
  }
  function checkRevision(snapshot, expectedRevision) {
    if (!snapshot.exists()) throw new Error("이미 삭제된 항목이에요.");
    const row = record(snapshot);
    if (!Number.isSafeInteger(expectedRevision) || row.revision !== expectedRevision) throw new Error("다른 기기에서 바뀐 항목이에요. 수정 창을 닫고 다시 열어주세요.");
    return row;
  }
  async function add(input) {
    requireWritable();
    const clean = M.validate(input), actor = currentUser(), F = sdk.firestore;
    const ref = F.doc(F.collection(db, "tasks"));
    // 오프라인 쓰기 대기열을 쓰지 않도록 온라인에서만 성립하는 작업 묶음으로 저장합니다.
    await F.runTransaction(db, async transaction => {
      requireWritable(actor.id); const existing = await transaction.get(ref); requireWritable(actor.id);
      if (existing.exists()) throw new Error("항목 번호가 겹쳤어요. 다시 시도해주세요.");
      transaction.set(ref, { ...clean, schemaVersion: C.schemaVersion, revision: 1,
        createdAt: F.serverTimestamp(), createdBy: actor, updatedAt: F.serverTimestamp(), updatedBy: actor,
        completedAt: clean.completed ? F.serverTimestamp() : null });
    });
    return ref.id;
  }
  async function update(id, patch, expectedRevision) {
    requireWritable(); const actor = currentUser(), F = sdk.firestore, ref = F.doc(db, "tasks", id);
    await F.runTransaction(db, async transaction => {
      requireWritable(actor.id); const snapshot = await transaction.get(ref), old = checkRevision(snapshot, expectedRevision); requireWritable(actor.id);
      const clean = M.validate({ ...old, ...patch });
      transaction.update(ref, { ...clean, revision: old.revision + 1,
        updatedAt: F.serverTimestamp(), updatedBy: actor,
        completedAt: clean.completed ? snapshot.data().completedAt || F.serverTimestamp() : null });
    });
  }
  async function remove(id, expectedRevision) {
    requireWritable(); const actor = currentUser(), F = sdk.firestore, ref = F.doc(db, "tasks", id);
    await F.runTransaction(db, async transaction => {
      requireWritable(actor.id); const snapshot = await transaction.get(ref); checkRevision(snapshot, expectedRevision); requireWritable(actor.id);
      transaction.delete(ref); // v1에는 휴지통이 없습니다.
    });
  }
  // 백업은 화면 캐시 대신 서버의 전체 목록을 읽습니다. 회원 목록·로그인 정보는 제외합니다.
  async function exportTasks() {
    requireWritable(); const owner = currentUser().id;
    const snapshot = await within(sdk.firestore.getDocsFromServer(sdk.firestore.collection(db, "tasks")), 30000);
    requireWritable(owner); return snapshot.docs.map(record);
  }
  async function restoreOne(input, owner) {
    requireWritable(owner, true); const F = sdk.firestore, ref = F.doc(db, "tasks", input.id);
    return F.runTransaction(db, async transaction => {
      requireWritable(owner, true); const existing = await transaction.get(ref); requireWritable(owner, true);
      if (existing.exists()) return false; // 미리보기 이후 다른 기기에서 추가해도 덮어쓰지 않습니다.
      const data = { ...input }; delete data.id;
      for (const key of ["createdAt", "updatedAt", "completedAt"]) {
        data[key] = data[key] ? F.Timestamp.fromDate(new Date(data[key])) : null;
      }
      // 원본 기록은 보존하되, 이번 가져오기 실행자는 서버에서 검증할 수 있게 별도로 기록합니다.
      data.restoredAt = F.serverTimestamp(); data.restoredBy = currentUser();
      transaction.set(ref, data); return true;
    });
  }
  D.storage = { getAppearance: () => ({ ...appearance }), exportTasks, restoreOne, init, subscribe, add, update, remove, currentUser, canWrite, checkConnection, watchStatus,
    watchAuth, signIn, signOut, prepareAuth, canRead: () => Boolean(user && permitted && serverSeen), authBusy: () => authState.busy,
    getStatus: () => ({ ...status }), getPreferences: () => ({ ...preferences }), setPreferences };
})();

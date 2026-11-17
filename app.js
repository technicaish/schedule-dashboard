// 화면에서 발생한 행동을 저장 담당과 연결합니다. Firebase 코드는 이 파일에 넣지 않습니다.
(function () {
  "use strict";
  const D = window.Dashboard, M = D.model, V = D.view, S = D.storage;
  const $ = id => document.getElementById(id);
  let items = [], today = M.today(), startMonth = M.monthStart(today), selectedDay = null;
  let composerDirty = false;
  let editing = null, busy = false, lastSlot = M.reloadSlot();
  const online = () => navigator.onLine;
  const writable = () => online() && !busy && !D.backup?.busy && S.canWrite();
  V.fillIcons();

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const label = theme === "light" ? "어두운 화면으로 전환" : "밝은 화면으로 전환";
    $("theme-toggle").replaceChildren(V.icon(theme === "light" ? "moon" : "sun"));
    $("theme-toggle").setAttribute("aria-label", label); $("theme-toggle").title = label;
  }
  const prefs = S.getPreferences();
  setTheme(prefs.theme === "dark" ? "dark" : "light");
  document.documentElement.dataset.large = String(prefs.large === true);
  $("large-text").checked = prefs.large === true;
  D.taskOptions.fill("task"); D.taskOptions.fill("edit");
  $("task-due").value = today; $("task-start").value = today;

  function dateShortcuts() {
    const chosen = $("task-due").value;
    document.querySelectorAll("[data-due]").forEach(button => {
      const value = button.dataset.due === "today" ? today : button.dataset.due === "tomorrow" ? M.addDays(today, 1) : "";
      button.classList.toggle("active", chosen === value);
      button.setAttribute("aria-pressed", String(chosen === value));
    });
    $("task-important").closest("label").classList.toggle("selected", $("task-important").checked);
  }
  function connection() {
    $("offline-banner").hidden = online();
    const status = $("connection-status");
    status.classList.toggle("offline", !online());
    status.replaceChildren(V.el("i"), document.createTextNode(online() ? "인터넷 연결됨" : "오프라인"));
    $("add-fields").disabled = !writable(); $("edit-fields").disabled = !writable();
    $("confirm-yes").disabled = !writable();
    const state = S.getStatus();
    $("check-connection").disabled = !online() || state.busy || ["setup-required", "local-file"].includes(state.code);
  }
  function paint() {
    // 로그아웃·계정 변경·권한 해제 시 팝업과 작성 중인 내용도 지웁니다.
    if (!S.canRead()) {
      for (const id of ["edit-dialog", "confirm-dialog"]) if ($(id).open) $(id).close();
      for (const id of ["task-title", "edit-title", "edit-due", "edit-start"]) $(id).value = "";
      $("edit-meta").textContent = ""; $("confirm-message").textContent = "";
      $("task-important").checked = false; D.taskOptions.fill("task"); D.taskOptions.fill("edit"); composerDirty = false; editing = null;
    }
    const focused = document.activeElement;
    const focusId = focused && focused.dataset.id, focusAction = focused && focused.dataset.action;
    V.renderLists(items, today, writable(), !S.canRead());
    D.calendar.render($("calendars"), startMonth, items, today, selectedDay);
    if (selectedDay && $("day-dialog").open) V.renderDay(items, selectedDay, today, writable(), !S.canRead());
    connection(); updateControls();
    D.taskOptions.choices("task"); D.taskOptions.choices("edit");
    // 완료 버튼을 눌러 목록이 이동해도 가능한 경우 초점을 유지합니다.
    if (focusId && !document.contains(focused)) {
      const target = Array.from(document.querySelectorAll("[data-id]")).find(node => node.dataset.id === focusId && node.dataset.action === focusAction && node.getClientRects().length);
      if (target) target.focus({ preventScroll: true });
    }
  }
  function updateControls() {
    const prefs = S.getPreferences(), layout = prefs.layout === "grid" ? "grid" : "list";
    $("priority-list").dataset.layout = layout;
    for (const key of ["filter", "layout"]) document.querySelectorAll(`[data-${key}]`).forEach(button => {
      if (button.tagName !== "BUTTON") return;
      button.setAttribute("aria-pressed", String(button.dataset[key] === (key === "layout" ? layout : prefs.filter || "all")));
    });
  }
  for (const key of ["filter", "layout"]) document.querySelectorAll(`button[data-${key}]`).forEach(button => {
    button.addEventListener("click", () => { S.setPreferences({ [key]: button.dataset[key] }); paint(); });
  });
  for (const prefix of ["task", "edit"]) $(`${prefix}-all-day`).addEventListener("change", () => D.taskOptions.sync(prefix));
  function inputValues(prefix) {
    return { ...D.taskOptions.read(prefix), startDate: $(`${prefix}-start`).value || null, title: $(`${prefix}-title`).value, dueDate: $(`${prefix}-due`).value || null, important: $(`${prefix}-important`).checked,
      completed: prefix === "edit" ? $("edit-completed").checked : false };
  }
  async function change(action, success) {
    if (!writable()) { V.toast(online() ? "로그인과 허용 목록 설정을 마친 뒤 저장할 수 있어요." : "인터넷이 다시 연결되면 수정할 수 있어요."); return false; }
    busy = true; connection();
    try {
      await action(); V.toast(success); return true;
    } catch (error) {
      V.toast(error.code === "permission-denied" ? "저장 권한이 거절됐어요. Firebase에 v1.13 규칙을 게시했는지와 계정 허용 상태를 확인해주세요." : error.name === "QuotaExceededError" ? "브라우저 저장 공간이 부족해 저장하지 못했어요." : error.message || "저장하지 못했어요. 다시 시도해주세요.");
      return false;
    } finally { busy = false; paint(); }
  }
  function confirmAction(heading, message, label = "삭제") {
    $("confirm-heading").textContent = heading; $("confirm-message").textContent = message;
    $("confirm-yes").textContent = label; $("confirm-dialog").returnValue = "";
    $("confirm-dialog").showModal(); $("confirm-no").focus();
    return new Promise(resolve => $("confirm-dialog").addEventListener("close", () => resolve($("confirm-dialog").returnValue === "yes"), { once: true }));
  }
  $("confirm-no").addEventListener("click", () => $("confirm-dialog").close("no"));
  $("confirm-yes").addEventListener("click", () => $("confirm-dialog").close("yes"));

  $("add-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = inputValues("task");
    if (await change(() => S.add(input), "할 일을 추가했어요.")) {
      $("add-form").reset(); composerDirty = false; $("task-due").value = selectedDay || today; $("task-start").value = $("task-due").value;
      D.taskOptions.fill("task"); dateShortcuts(); $("task-title").focus();
    }
  });
  $("add-form").addEventListener("input", () => { composerDirty = true; });
  $("add-form").addEventListener("change", () => { composerDirty = true; dateShortcuts(); });
  document.querySelectorAll("[data-due]").forEach(button => button.addEventListener("click", () => {
    $("task-due").value = button.dataset.due === "today" ? today : button.dataset.due === "tomorrow" ? M.addDays(today, 1) : "";
    $("task-start").value = $("task-due").value;
    if (!$("task-due").value) { $("task-all-day").checked = true; D.taskOptions.sync("task"); }
    dateShortcuts();
  }));
  function openEdit(task) {
    D.taskOptions.fill("edit", task);
    if ($("day-dialog").open) $("day-dialog").close();
    editing = { id: task.id, revision: task.revision };
    $("edit-start").value = task.startDate || task.dueDate || ""; $("edit-title").value = task.title; $("edit-due").value = task.dueDate || "";
    $("edit-important").checked = task.important; $("edit-completed").checked = task.completed;
    $("edit-meta").textContent = `일정 구분: ${task.scope === "private" ? "개인 일정 · " + (D.taskOptions.assignee(task) || task.createdBy.name) : "공동 일정"}\n작성 ${task.createdBy.name} · ${M.stampLabel(task.createdAt)}\n마지막 수정 ${task.updatedBy.name} · ${M.stampLabel(task.updatedAt)}${task.completedAt ? `\n완료 ${M.stampLabel(task.completedAt)}` : ""}${task.restoredAt ? `\n백업에서 가져옴 ${task.restoredBy?.name || "알 수 없음"} · ${M.stampLabel(task.restoredAt)} (위 작성 기록은 원본 파일 기준)` : ""}`;
    connection(); $("edit-dialog").showModal();
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const task = items.find(item => item.id === button.dataset.id);
    if (!task) return;
    if (button.dataset.action === "edit") openEdit(task);
    if (button.dataset.action === "toggle") await change(() => S.update(task.id, { completed: !task.completed }, task.revision), task.completed ? "미완료로 바꿨어요." : "하나를 함께 해냈어요!");
  });
  $("edit-form").addEventListener("submit", async event => {
    event.preventDefault(); if (!editing) return;
    const target = { ...editing }, input = inputValues("edit");
    if (await change(() => S.update(target.id, input, target.revision), "변경 내용을 저장했어요.")) $("edit-dialog").close();
  });
  $("delete-task").addEventListener("click", async () => {
    if (!editing) return;
    const target = { ...editing }, task = items.find(item => item.id === target.id);
    if (!task) return;
    if (await confirmAction("이 할 일을 삭제할까요?", `‘${task.title}’\n삭제하면 되돌릴 수 없어요.`)) {
      if (await change(() => S.remove(target.id, target.revision), "할 일을 삭제했어요.")) $("edit-dialog").close();
    }
  });
  $("edit-dialog").addEventListener("close", () => { editing = null; });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));

  $("calendars").addEventListener("click", event => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    selectedDay = button.dataset.date; $("task-due").value = selectedDay; $("task-start").value = selectedDay; dateShortcuts();
    V.renderDay(items, selectedDay, today, writable(), !S.canRead());
    D.calendar.render($("calendars"), startMonth, items, today, selectedDay);
    $("day-dialog").showModal();
  });
  $("add-on-day").addEventListener("click", () => {
    $("day-dialog").close(); $("task-title").scrollIntoView({ behavior: "auto", block: "center" });
    if (writable()) $("task-title").focus();
  });
  function moveMonth(amount) { startMonth = M.monthStart(startMonth, amount); paint(); }
  $("calendar-prev").addEventListener("click", () => moveMonth(-1));
  $("calendar-next").addEventListener("click", () => moveMonth(1));
  $("calendar-today").addEventListener("click", () => { startMonth = M.monthStart(today); selectedDay = null; paint(); });

  $("theme-toggle").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    setTheme(theme); S.setPreferences({ theme });
  });
  $("completed-info").addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); $("completed-help").showModal(); });
  $("priority-info").addEventListener("click", () => $("priority-help").showModal());
  $("settings-open").addEventListener("click", () => $("settings-dialog").showModal());
  $("large-text").addEventListener("change", event => {
    document.documentElement.dataset.large = String(event.target.checked); S.setPreferences({ large: event.target.checked });
  });
  $("check-connection").addEventListener("click", () => S.checkConnection());

  // 6시간 구간이 바뀌면 갱신합니다. 절전 복귀 시에도 확인하며 입력 중에는 보류합니다.
  function tick() {
    const now = new Date(), nextDay = M.today(now), p = M.parts(now);
    $("clock-date").textContent = M.dateLabel(nextDay, true).replace(/^\d+년 /, "");
    $("clock-time").textContent = `${p.hour}:${p.minute} · 한국시간`;
    if (nextDay !== today) {
      if (startMonth === M.monthStart(today)) startMonth = M.monthStart(nextDay);
      if (!$("task-title").value.trim() && $("task-due").value === today && $("task-start").value === today) { $("task-due").value = nextDay; $("task-start").value = nextDay; }
      today = nextDay; dateShortcuts(); paint();
    }
    const slot = M.reloadSlot(now);
    const hasDraft = composerDirty || $("task-title").value.trim() || $("task-important").checked;
    if (slot !== lastSlot && !hasDraft && !busy && !D.backup?.busy && !S.authBusy() && online() && !document.querySelector("dialog[open]") && document.visibilityState === "visible") {
      lastSlot = slot; window.location.reload();
    }
  }
  window.addEventListener("online", () => { paint(); tick(); });
  window.addEventListener("offline", paint);
  document.addEventListener("visibilitychange", tick);
  S.watchStatus(state => {
    $("setup-state").textContent = state.title; $("setup-detail").textContent = state.detail;
    $("setup-project").textContent = D.config.firebase.projectId || "아직 입력하지 않음";
    $("connection-panel").dataset.state = state.code;
    $("check-connection").textContent = state.busy ? "확인 중…" : "다시 연결";
    $("save-status").textContent = state.title;
    paint();
  });
  // 계정 이름·메일은 HTML로 해석하지 않고 문자 그대로 표시합니다.
  $("auth-domain-hint").textContent = location.hostname || "GitHub Pages 주소로 열어주세요";
  $("sign-in").addEventListener("click", () => S.signIn());
  $("sign-out").addEventListener("click", () => S.signOut());
  $("auth-retry").addEventListener("click", () => S.prepareAuth());
  S.watchAuth(state => {
    $("auth-heading").textContent = state.title;
    $("auth-account").textContent = state.user ? `${state.user.name} · ${state.user.email}` : "";
    $("settings-account").textContent = state.user ? state.user.email : "로그인 안 됨";
    $("auth-error").textContent = state.error; $("auth-error").hidden = !state.error;
    $("sign-in").hidden = Boolean(state.user); $("sign-in").disabled = !state.ready || state.busy;
    $("sign-in").textContent = state.busy ? "로그인 확인 중…" : "Google 계정으로 로그인";
    $("sign-out").hidden = !state.user; $("sign-out").disabled = state.busy;
    $("auth-retry").hidden = state.ready || state.busy;
    $("save-status").textContent = S.getStatus().title;
    paint();
  });
  D.refresh = paint;
  S.init();
  S.subscribe(rows => { items = rows; paint(); });
  dateShortcuts(); tick(); setInterval(tick, 15000);
})();

// 목록과 공통 화면 표시를 맡습니다. 사용자 입력은 HTML로 해석하지 않고 글자로 넣습니다.
(function () {
  "use strict";
  const D = window.Dashboard, M = D.model;
  const paths = {
    plus: "M12 5v14M5 12h14", close: "m6 6 12 12M18 6 6 18",
    left: "m14 5-7 7 7 7", right: "m10 5 7 7-7 7",
    check: "m5 12 4 4L19 6", moon: "M20.6 13A9 9 0 0 1 11 3.4 9 9 0 1 0 20.6 13Z",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
    star: "m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.6l6.2-.9L12 3Z",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 2h4l.6 3 2 .9 2.7-1 2 3.5-2.2 2v2.3l2.2 2-2 3.5-2.7-1-2 .9-.6 3h-4l-.6-3-2-.9-2.7 1-2-3.5 2.2-2v-2.3l-2.2-2 2-3.5 2.7 1 2-.9L10 2Z"
  };
  function el(tag, className = "", text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", paths[name] || paths.plus); svg.append(path);
    return svg;
  }
  function fillIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach(node => node.replaceChildren(icon(node.dataset.icon)));
  }
  // 작성자 색상은 허용된 서버 설정으로 정하고 실제 이메일은 코드에 넣지 않습니다.
  function tone(task) {
    if (task.important) return "red";
    const colors = D.storage.getAppearance(), email = (task.scope === "private" ? D.taskOptions.assignee(task) : task.createdBy.email || "").toLowerCase();
    return email && email === colors.skyEmail ? "sky" : email && email === colors.pinkEmail ? "pink" : "default";
  }
  function taskCard(task, reference, online) {
    const due = M.dueInfo(task, reference);
    const card = el("article", `task-card${task.completed ? " completed" : ""}${task.important ? " important" : ""}${due.type === "late" ? " overdue" : ""}`);
    card.dataset.tone = tone(task);
    const check = el("button", "task-check");
    check.type = "button"; check.dataset.action = "toggle"; check.dataset.id = task.id;
    check.setAttribute("role", "checkbox"); check.setAttribute("aria-checked", String(task.completed));
    check.setAttribute("aria-label", `${task.completed ? "미완료로 변경" : "완료 처리"}: ${task.title}`);
    check.disabled = !online;
    if (task.completed) check.append(icon("check"));
    const content = el("div", "task-content");
    const title = el("button", "task-title");
    title.type = "button"; title.dataset.action = "edit"; title.dataset.id = task.id;
    title.title = `수정: ${task.title}`; title.setAttribute("aria-label", `수정: ${task.title}`);
    title.append(el("strong", "task-when", D.taskOptions.label(task)));
    if (task.important) { const star = el("span", "star"); star.title = "중요한 일"; star.append(icon("star")); title.append(star); }
    title.append(el("span", "title-text", task.title));
    content.append(title); // 구분·작성 기록은 수정 팝업에서 확인합니다.
    const side = el("div", "task-side");
    side.append(el("span", `due-badge ${due.type}`, due.text));
    card.append(check, content, side);
    return card;
  }
  function taskList(root, tasks, reference, online, emptyMessage) {
    const fragment = document.createDocumentFragment();
    tasks.forEach(task => fragment.append(taskCard(task, reference, online)));
    if (!tasks.length) fragment.append(el("p", "empty-state", emptyMessage));
    root.replaceChildren(fragment);
  }
  function renderLists(items, reference, online, locked = false) {
    if (locked) items = [];
    const groups = M.groupTasks(items, reference);
    groups.priority = groups.priority.filter(task => D.taskOptions.visibleTo(task, D.storage.currentUser(), D.storage.getPreferences().filter));
    const messages = { priority: "급하게 챙길 일이 없어요. 여유로운 하루 보내세요.", other: "나머지 할 일이 없어요.", completed: "함께 해낸 일들이 여기에 쌓여요." };
    if (locked) for (const key of Object.keys(messages)) messages[key] = "로그인과 접근 권한 설정을 마치면 일정을 볼 수 있어요.";
    for (const key of ["priority", "other", "completed"]) {
      document.getElementById(`${key}-count`).textContent = groups[key].length;
      taskList(document.getElementById(`${key}-list`), groups[key], reference, online, messages[key]);
    }
    const overdue = groups.priority.filter(task => task.dueDate && M.diffDays(task.dueDate, reference) < 0).length;
    const badge = document.getElementById("overdue-summary");
    badge.hidden = overdue === 0; badge.textContent = `기한 지난 일 ${overdue}개`;
  }
  function renderDay(items, date, reference, online, locked = false) {
    document.getElementById("day-heading").textContent = M.dateLabel(date, true);
    const root = document.getElementById("day-list");
    if (locked) { root.replaceChildren(el("p", "empty-state", "로그인과 접근 권한 설정 후 그날 일정을 확인할 수 있어요.")); return; }
    const all = items.filter(task => M.onDate(task, date)).sort(M.sortTasks);
    const open = all.filter(task => !task.completed), done = all.filter(task => task.completed);
    taskList(root, open, reference, online, done.length ? "미완료 일정이 없어요." : "아직 일정이 없는 날이에요.");
    if (done.length) {
      root.append(el("h3", "", `완료한 일 ${done.length}`));
      done.forEach(task => root.append(taskCard(task, reference, online)));
    }
  }
  let toastTimer;
  function toast(message) {
    const node = document.getElementById("toast");
    clearTimeout(toastTimer); node.textContent = message; node.hidden = false;
    // dialog가 열려 있어도 메시지가 그 안에서 읽히도록 보조 상태를 갱신합니다.
    const dialog = Array.from(document.querySelectorAll("dialog[open]")).pop();
    document.querySelectorAll(".dialog-feedback").forEach(old => old.remove());
    if (dialog) { const feedback = el("p", "notice warning dialog-feedback", message); feedback.setAttribute("role", "status"); dialog.append(feedback); }
    toastTimer = setTimeout(() => { node.hidden = true; document.querySelectorAll(".dialog-feedback").forEach(old => old.remove()); }, 4500);
  }
  D.view = { tone, el, icon, fillIcons, taskCard, renderLists, renderDay, toast };
})();

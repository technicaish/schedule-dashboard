// 시간·공동 여부와 화면 필터를 다룹니다. 기존 일정은 종일·공동으로 읽습니다.
(function () {
  "use strict";
  const D = window.Dashboard, $ = id => document.getElementById(id);
  const validTime = v => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  function normalize(v) {
    const allDay = v.allDay !== false;
    return { allDay, startTime: !allDay && validTime(v.startTime) ? v.startTime : null,
      endTime: !allDay && validTime(v.endTime) ? v.endTime : null, scope: v.scope === "private" ? "private" : "shared",
      assigneeEmail: v.scope === "private" && typeof v.assigneeEmail === "string" && v.assigneeEmail.trim() ? v.assigneeEmail.trim().toLowerCase() : null };
  }
  function validate(v, start, end) {
    if (v.allDay !== undefined && typeof v.allDay !== "boolean") throw Error("종일 여부를 확인해주세요.");
    if (v.scope !== undefined && !["shared", "private"].includes(v.scope)) throw Error("개인·공동 구분을 확인해주세요.");
    if (v.assigneeEmail != null && (typeof v.assigneeEmail !== "string" || v.assigneeEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.assigneeEmail))) throw Error("일정 당사자를 다시 선택해주세요.");
    const result = normalize(v);
    if (!result.allDay) {
      if (!start || !end || !validTime(v.startTime) || (v.endTime != null && v.endTime !== "" && !validTime(v.endTime))) throw Error("날짜와 시작 시간을 입력해주세요. 종료 시간은 비워둘 수 있어요.");
      if (result.endTime && `${start}T${v.startTime}` >= `${end}T${v.endTime}`) throw Error("종료 시각은 시작 시각보다 뒤여야 해요.");
    }
    return result;
  }
  function visibleTo(task, user, filter) {
    if (filter !== "mine") return true;
    if (!user) return false;
    return task.scope !== "private" || Boolean(user.email && assignee(task) === user.email.toLowerCase()) ||
      (!task.assigneeEmail && task.createdBy?.id === user.id);
  }
  // 기존 개인 일정은 작성자를 당사자로 간주하며 서버 자료를 일괄 변경하지 않습니다.
  function assignee(task) { return (task.assigneeEmail || task.createdBy?.email || "").toLowerCase(); }
  function choices(prefix, selected) {
    const select = $(`${prefix}-scope`), user = D.storage.currentUser();
    const value = selected === undefined ? select.value : selected;
    const colors = D.storage.getAppearance();
    const emails = [...new Set([user?.email, colors.skyEmail, colors.pinkEmail, value !== "shared" ? value : null].filter(Boolean).map(v => v.toLowerCase()))];
    select.replaceChildren(new Option("공동 일정", "shared"));
    for (const email of emails) {
      const who = email === user?.email?.toLowerCase() ? "내 일정" : "상대 일정";
      select.append(new Option(`${who} (${email})`, email));
    }
    select.value = value && emails.includes(value) ? value : "shared";
  }
  function label(task) {
    const date = value => {
      if (!value) return "날짜 없음";
      const d = new Date(`${value}T12:00:00Z`);
      return `${value.slice(5).replace("-", "/")}(${"일월화수목금토"[d.getUTCDay()]})`;
    };
    if (task.checklist) return task.dueDate ? `${date(task.dueDate)}까지` : "마감일 없음";
    const start = task.startDate || task.dueDate;
    if (!task.dueDate) return "날짜 없음";
    if (task.allDay !== false) return `${date(start)}${start !== task.dueDate ? ` ~ ${date(task.dueDate)}` : ""} · 종일`;
    if (!task.endTime) return `${date(start)} ${task.startTime || ""}${start !== task.dueDate ? ` ~ ${date(task.dueDate)}` : ""}`;
    return `${date(start)} ${task.startTime || ""} ~ ${start !== task.dueDate ? date(task.dueDate) + " " : ""}${task.endTime || ""}`;
  }
  function sync(prefix) {
    const allDay = $(`${prefix}-all-day`).checked;
    $(`${prefix}-time-fields`).hidden = allDay;
    for (const part of ["start-time", "end-time"]) {
      $(`${prefix}-${part}`).disabled = allDay; $(`${prefix}-${part}`).required = !allDay && part === "start-time";
    }
  }
  function fill(prefix, task = {}) {
    $(`${prefix}-checklist`).checked = task.checklist === true;
    const v = normalize(task);
    $(`${prefix}-all-day`).checked = v.allDay;
    $(`${prefix}-start-time`).value = v.startTime || "";
    $(`${prefix}-end-time`).value = v.endTime || "";
    choices(prefix, v.scope === "private" ? assignee(task) : "shared"); sync(prefix);
  }
  function read(prefix) {
    return { checklist: $(`${prefix}-checklist`).checked, allDay: $(`${prefix}-all-day`).checked, startTime: $(`${prefix}-start-time`).value || null,
      endTime: $(`${prefix}-end-time`).value || null, scope: $(`${prefix}-scope`).value === "shared" ? "shared" : "private",
      assigneeEmail: $(`${prefix}-scope`).value === "shared" ? null : $(`${prefix}-scope`).value };
  }
  D.taskOptions = { assignee, choices, normalize, validate, visibleTo, label, sync, fill, read };
})();

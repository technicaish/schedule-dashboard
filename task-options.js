// 시간·공동 여부와 화면 필터를 다룹니다. 기존 일정은 종일·공동으로 읽습니다.
(function () {
  "use strict";
  const D = window.Dashboard, $ = id => document.getElementById(id);
  const validTime = v => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  function normalize(v) {
    const allDay = v.allDay !== false;
    return { allDay, startTime: !allDay && validTime(v.startTime) ? v.startTime : null,
      endTime: !allDay && validTime(v.endTime) ? v.endTime : null, scope: v.scope === "private" ? "private" : "shared" };
  }
  function validate(v, start, end) {
    if (v.allDay !== undefined && typeof v.allDay !== "boolean") throw Error("종일 여부를 확인해주세요.");
    if (v.scope !== undefined && !["shared", "private"].includes(v.scope)) throw Error("개인·공동 구분을 확인해주세요.");
    const result = normalize(v);
    if (!result.allDay) {
      if (!start || !end || !validTime(v.startTime) || !validTime(v.endTime)) throw Error("시작·종료 날짜와 시간을 모두 입력해주세요.");
      if (`${start}T${v.startTime}` >= `${end}T${v.endTime}`) throw Error("종료 시각은 시작 시각보다 뒤여야 해요.");
    }
    return result;
  }
  function visibleTo(task, user, filter) {
    if (filter !== "mine") return true;
    if (!user) return false;
    const a = task.createdBy || {};
    return task.scope !== "private" || a.id === user.id || Boolean(a.email && user.email && a.email.toLowerCase() === user.email.toLowerCase());
  }
  function label(task) {
    const date = value => {
      if (!value) return "날짜 없음";
      const d = new Date(`${value}T12:00:00Z`);
      return `${value.slice(5).replace("-", "/")}(${"일월화수목금토"[d.getUTCDay()]})`;
    };
    const start = task.startDate || task.dueDate;
    if (!task.dueDate) return "날짜 없음";
    if (task.allDay !== false) return `${date(start)}${start !== task.dueDate ? ` ~ ${date(task.dueDate)}` : ""} · 종일`;
    return `${date(start)} ${task.startTime || ""} ~ ${start !== task.dueDate ? date(task.dueDate) + " " : ""}${task.endTime || ""}`;
  }
  function sync(prefix) {
    const allDay = $(`${prefix}-all-day`).checked;
    $(`${prefix}-time-fields`).hidden = allDay;
    for (const part of ["start-time", "end-time"]) {
      $(`${prefix}-${part}`).disabled = allDay; $(`${prefix}-${part}`).required = !allDay;
    }
  }
  function fill(prefix, task = {}) {
    const v = normalize(task);
    $(`${prefix}-all-day`).checked = v.allDay;
    $(`${prefix}-start-time`).value = v.startTime || "";
    $(`${prefix}-end-time`).value = v.endTime || "";
    $(`${prefix}-scope`).value = v.scope; sync(prefix);
  }
  function read(prefix) {
    return { allDay: $(`${prefix}-all-day`).checked, startTime: $(`${prefix}-start-time`).value || null,
      endTime: $(`${prefix}-end-time`).value || null, scope: $(`${prefix}-scope`).value };
  }
  D.taskOptions = { normalize, validate, visibleTo, label, sync, fill, read };
})();

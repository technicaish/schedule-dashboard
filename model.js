// 날짜는 시각 없는 문자열로 다룹니다. 이 파일은 저장소에 의존하지 않습니다.
// 날짜는 한국시간 기준이며, 하루 차이는 UTC 날짜끼리 계산해 일광절약시간 영향을 피합니다.
(function () {
  "use strict";
  const D = window.Dashboard;
  const C = D.config;
  const DAY = 86400000;
  const pad = value => String(value).padStart(2, "0");
  function parts(date = new Date()) {
    const entries = new Intl.DateTimeFormat("en-GB", {
      timeZone: C.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date).map(part => [part.type, part.value]);
    return Object.fromEntries(entries);
  }
  function today(date = new Date()) {
    const p = parts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1900 || year > 9999) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toISOString().slice(0, 10) === value;
  }
  function dateNumber(value) { return Date.parse(`${value}T00:00:00Z`); }
  function addDays(value, amount) {
    return new Date(dateNumber(value) + amount * DAY).toISOString().slice(0, 10);
  }
  function monthStart(value = today(), offset = 0) {
    const [year, month] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
  }
  function diffDays(value, reference = today()) {
    return validDate(value) ? Math.round((dateNumber(value) - dateNumber(reference)) / DAY) : null;
  }
  function dateLabel(value, full = false) {
    if (!validDate(value)) return "날짜 없음";
    const options = { timeZone: "UTC", month: "long", day: "numeric" };
    if (full) { options.year = "numeric"; options.weekday = "long"; }
    return new Intl.DateTimeFormat("ko-KR", options).format(new Date(`${value}T12:00:00Z`));
  }
  function stampLabel(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return "기록 없음";
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: C.timeZone, year: "numeric", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(value));
  }
  function person(value) {
    const input = value && typeof value === "object" ? value : {};
    return { ...input, id: String(input.id || "unknown"), name: String(input.name || "알 수 없음") };
  }
  // 빠진 필드는 기본값으로 보완하고, 모르는 추가 필드는 보존합니다.
  function normalize(input) {
    const row = input && typeof input === "object" ? input : {};
    return {
      ...row, ...D.taskOptions.normalize(row), id: String(row.id || ""), schemaVersion: Number(row.schemaVersion) || 1,
      revision: Number.isSafeInteger(row.revision) && row.revision >= 0 ? row.revision : 0,
      title: typeof row.title === "string" && row.title.trim() ? row.title : "제목 없는 일",
      dueDate: validDate(row.dueDate) ? row.dueDate : null,
      startDate: validDate(row.dueDate) ? (validDate(row.startDate) && row.startDate <= row.dueDate ? row.startDate : row.dueDate) : null,
      important: row.important === true, completed: row.completed === true,
      completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
      createdBy: person(row.createdBy), updatedBy: person(row.updatedBy)
    };
  }
  function validate(input) {
    const title = String(input.title || "").trim();
    if (!title) throw new Error("할 일 제목을 입력해주세요.");
    if (title.length > C.titleMaxLength) throw new Error(`제목은 ${C.titleMaxLength}자까지 입력할 수 있어요.`);
    if (input.dueDate && !validDate(input.dueDate)) throw new Error("마감일을 올바른 날짜로 선택해주세요.");
    const dueDate = input.dueDate || null, startDate = input.startDate || dueDate;
    if (startDate && (!validDate(startDate) || !dueDate || startDate > dueDate)) throw new Error("종료일은 시작일과 같거나 뒤여야 합니다. 날짜 없음은 두 날짜를 모두 비워주세요.");
    return { ...D.taskOptions.validate(input, startDate, dueDate), title, startDate, dueDate, important: input.important === true, completed: input.completed === true };
  }
  function dueInfo(task, reference = today()) {
    if (task.completed) return { text: "완료", type: "done" };
    const days = diffDays(task.dueDate, reference);
    if (days === null) return { text: "날짜 없음", type: "none" };
    if (task.startDate && task.startDate !== task.dueDate && task.startDate > reference) return { text: `시작 D-${diffDays(task.startDate, reference)}`, type: "soon" };
    if (days < 0) return { text: `${-days}일 지남`, type: "late" };
    if (task.startDate && task.startDate < reference && days > 0) return { text: `진행 중 · 종료 D-${days}`, type: "soon" };
    if (days === 0) return { text: "오늘", type: "today" };
    return { text: `D-${days}`, type: days <= C.priorityDays ? "soon" : "later" };
  }
  function sortTasks(a, b) {
    return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") ||
      (a.endTime || "23:59").localeCompare(b.endTime || "23:59") || Number(b.important) - Number(a.important) || (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id);
  }
  function groupTasks(items, reference = today()) {
    const groups = { priority: [], other: [], completed: [] };
    for (const task of items) {
      if (task.completed) groups.completed.push(task);
      else if (task.important || (task.dueDate && diffDays(task.startDate || task.dueDate, reference) <= C.priorityDays)) groups.priority.push(task);
      else groups.other.push(task);
    }
    groups.priority.sort(sortTasks); groups.other.sort(sortTasks);
    groups.completed.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    return groups;
  }
  function reloadSlot(date = new Date()) {
    const p = parts(date);
    const hour = Number(p.hour);
    const slot = [...C.reloadHours].reverse().find(value => value <= hour);
    return `${today(date)}-${pad(slot === undefined ? 0 : slot)}`;
  }
  function onDate(task, date) { return Boolean(task.dueDate && (task.startDate || task.dueDate) <= date && date <= task.dueDate); }
  function rangeLabel(task) { return task.startDate && task.startDate !== task.dueDate ? `${dateLabel(task.startDate)} ~ ${dateLabel(task.dueDate)}` : dateLabel(task.dueDate); }
  D.model = { onDate, rangeLabel, parts, today, validDate, addDays, monthStart, diffDays, dateLabel, stampLabel, normalize, validate, dueInfo, sortTasks, groupTasks, reloadSlot };
})();

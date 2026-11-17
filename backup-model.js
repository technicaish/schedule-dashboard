// 백업 형식 검사와 미리보기 계산입니다. Firebase와 통신하지 않습니다.
(function () {
  "use strict";
  const D = window.Dashboard, M = D.model;
  const FORMAT = "our-day-backup", VERSION = 1, MAX_BYTES = 10 * 1024 * 1024;
  function plain(value) { return value && typeof value === "object" && !Array.isArray(value); }
  function checkTree(value, depth = 0) {
    if (depth > 20) throw new Error("중첩이 너무 깊은 파일입니다.");
    if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("허용되지 않는 필드 이름입니다.");
      checkTree(child, depth + 1);
    }
  }
  function time(value, name) {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${name} 시각이 올바르지 않습니다.`);
    return new Date(value).toISOString();
  }
  function person(value) {
    if (value === null || value === undefined) return { id: "unknown", name: "알 수 없음", email: "" };
    if (!plain(value) || typeof value.id !== "string" || typeof value.name !== "string" || (value.email !== undefined && typeof value.email !== "string")) throw new Error("작성자 정보가 올바르지 않습니다.");
    return { ...value, email: value.email || "" };
  }
  function row(value, index) {
    if (!plain(value)) throw new Error(`${index + 1}번째 항목의 형식이 잘못됐습니다.`);
    const id = value.id;
    if (typeof id !== "string" || !id || id.trim() !== id || /[\/\u0000-\u001f\u007f]/.test(id) || id === "." || id === ".." || /^__.*__$/.test(id) || new TextEncoder().encode(id).length > 1500) throw new Error(`${index + 1}번째 항목의 고유번호가 올바르지 않습니다.`);
    if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error("더 새로운 데이터 형식입니다. 앱을 업데이트한 뒤 가져오세요.");
    if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 120) throw new Error(`${index + 1}번째 제목을 확인해주세요.`);
    for (const field of ["important", "completed"]) if (value[field] !== undefined && typeof value[field] !== "boolean") throw new Error(`${field} 값은 true 또는 false여야 합니다.`);
    if (value.dueDate !== undefined && value.dueDate !== null && !M.validDate(value.dueDate)) throw new Error(`${index + 1}번째 마감일이 올바르지 않습니다.`);
    if (value.startDate !== undefined && value.startDate !== null && !M.validDate(value.startDate)) throw new Error("시작일이 올바르지 않습니다.");
    if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || value.revision < 0)) throw new Error("변경 횟수가 올바르지 않습니다.");
    const result = { ...value, ...M.validate(value), id, schemaVersion: 1, revision: value.revision ?? 0,
      createdAt: time(value.createdAt, "작성"), updatedAt: time(value.updatedAt, "수정"), completedAt: time(value.completedAt, "완료"),
      deletedAt: time(value.deletedAt, "휴지통 이동"), deletedBy: value.deletedAt ? person(value.deletedBy) : null,
      createdBy: person(value.createdBy), updatedBy: person(value.updatedBy) };
    if (!result.completed && result.completedAt) throw new Error("미완료 항목에 완료 시각이 있습니다.");
    return result;
  }
  function parse(text) {
    if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("10MB 이하 파일만 가져올 수 있습니다.");
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("JSON 파일을 읽지 못했습니다. 내보낸 원본 파일을 선택해주세요."); }
    if (!plain(data) || data.format !== FORMAT || data.version !== VERSION || !Array.isArray(data.tasks)) throw new Error("이 앱에서 내보낸 백업 형식이 아닙니다.");
    checkTree(data);
    const tasks = data.tasks.map(row), ids = new Set();
    for (const task of tasks) { if (ids.has(task.id)) throw new Error(`파일 안에 같은 고유번호가 두 번 있습니다: ${task.id}`); ids.add(task.id); }
    return { tasks, exportedAt: time(data.exportedAt, "내보내기") };
  }
  function make(tasks) { return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), tasks }; }
  function preview(tasks, existing) {
    const ids = new Set(existing.map(task => task.id));
    const skipped = tasks.filter(task => ids.has(task.id)).length;
    return { total: tasks.length, add: tasks.length - skipped, skipped };
  }
  D.backupModel = { parse, make, preview, MAX_BYTES };
})();

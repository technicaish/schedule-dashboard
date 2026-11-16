// 백업 버튼·파일 검사·확인 창을 담당합니다. 저장소 호출은 storage.js의 공개 함수만 사용합니다.
(function () {
  "use strict";
  const D = window.Dashboard, S = D.storage, B = D.backupModel, $ = id => document.getElementById(id);
  let pending = null, owner = null, epoch = 0, cancelRequested = false;
  D.backup = { busy: false };
  function status(text) { $("backup-status").textContent = text; }
  function update() {
    const enabled = S.canWrite() && !D.backup.busy;
    $("backup-export").disabled = !enabled; $("backup-import").disabled = !enabled;
    $("backup-confirm").disabled = !enabled || !pending;
  }
  function busy(value) { D.backup.busy = value; update(); D.refresh(); }
  function validSession(id) { return S.currentUser()?.id === id && S.canRead(); }
  function discard() {
    epoch++; pending = null; cancelRequested = true; $("backup-file").value = "";
    $("backup-summary").textContent = ""; $("backup-progress").textContent = "";
    if ($("backup-dialog").open) $("backup-dialog").close(); update();
  }
  S.watchAuth(state => { const id = state.user?.id || null; if (owner !== id) { owner = id; discard(); status("온라인으로 공동 일정에 연결하면 사용할 수 있어요."); } update(); });
  S.watchStatus(() => { if (!S.canRead() && pending) discard(); update(); });
  S.subscribe(() => update());
  window.addEventListener("online", update); window.addEventListener("offline", update);
  $("backup-export").addEventListener("click", async () => {
    if (!S.canWrite() || D.backup.busy) return;
    const id = owner, turn = epoch; busy(true); status("서버의 전체 일정을 읽고 있어요…");
    try {
      const tasks = await S.exportTasks(); if (turn !== epoch || !validSession(id)) throw new Error("계정이나 접근 권한이 바뀌었습니다.");
      const text = JSON.stringify(B.make(tasks), null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url;
      link.download = `our-day-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      status(`${tasks.length}개 항목의 다운로드를 요청했어요. 폰의 다운로드 폴더에서 파일을 확인해주세요.`);
    } catch (error) { status(error.message || "백업 파일을 만들지 못했어요."); }
    finally { busy(false); }
  });
  $("backup-import").addEventListener("click", () => { if (S.canWrite() && !D.backup.busy) { $("backup-file").value = ""; $("backup-file").click(); } });
  $("backup-file").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file || D.backup.busy || !S.canWrite()) return;
    const id = owner, turn = ++epoch; busy(true); status("파일과 기존 항목을 확인하고 있어요…");
    try {
      if (file.size > B.MAX_BYTES) throw new Error("10MB 이하 파일만 가져올 수 있습니다.");
      const parsed = B.parse(await file.text());
      const existing = await S.exportTasks();
      if (turn !== epoch || !validSession(id)) throw new Error("계정이나 접근 권한이 바뀌었습니다.");
      const summary = B.preview(parsed.tasks, existing); pending = parsed.tasks; cancelRequested = false;
      $("backup-summary").textContent = `전체 ${summary.total}개 · 새로 추가 ${summary.add}개 · 기존 항목 ${summary.skipped}개 건너뛰기`;
      $("backup-progress").textContent = "확인 버튼을 누르기 전에는 아무것도 저장하지 않습니다.";
      $("settings-dialog").close(); $("backup-dialog").showModal(); $("backup-cancel").textContent = "취소";
      status("가져올 개수를 확인해주세요.");
    } catch (error) { pending = null; status(error.message || "파일을 확인하지 못했어요."); }
    finally { $("backup-file").value = ""; busy(false); }
  });
  $("backup-cancel").addEventListener("click", () => {
    if (D.backup.busy) { cancelRequested = true; $("backup-progress").textContent = "현재 항목 처리가 끝나면 멈춥니다. 이미 추가한 항목은 유지됩니다."; }
    else discard();
  });
  $("backup-dialog").addEventListener("cancel", event => { if (D.backup.busy) { event.preventDefault(); $("backup-cancel").click(); } else discard(); });
  $("backup-confirm").addEventListener("click", async () => {
    if (!pending || !S.canWrite() || D.backup.busy) return;
    const tasks = pending, id = owner, turn = epoch; let added = 0, skipped = 0, errorText = "";
    busy(true); $("backup-cancel").textContent = "중단";
    try {
      for (const task of tasks) {
        if (cancelRequested || turn !== epoch || !validSession(id)) throw new Error("사용자 중단 또는 계정·권한 변경으로 멈췄습니다.");
        if (await S.restoreOne(task, id)) added++; else skipped++;
        $("backup-progress").textContent = `${added + skipped}/${tasks.length}개 처리 · 추가 ${added} · 건너뜀 ${skipped}`;
      }
    } catch (error) { errorText = error.message || "연결 문제로 중단됐습니다."; }
    finally {
      pending = null; busy(false); $("backup-cancel").textContent = "닫기";
      const result = `추가 ${added}개 · 건너뜀 ${skipped}개 · 미처리 ${tasks.length - added - skipped}개. ${errorText}`;
      if (turn === epoch) { $("backup-progress").textContent = result; status(result); }
      update();
    }
  });
})();

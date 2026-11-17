// 휴지통 화면과 만료 정리 요청입니다. Firebase 통신은 storage.js에만 있습니다.
(function () {
  "use strict";
  const D = window.Dashboard, S = D.storage, V = D.view, M = D.model;
  let rows = [], busy = false, lastClean = 0;
  const expires = task => Date.parse(task.deletedAt) + 30 * 86400000;
  function render(items, writable) {
    rows = items.filter(task => task.deletedAt).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    document.getElementById("trash-count").textContent = rows.length;
    document.getElementById("trash-empty").disabled = !writable || busy || !rows.length;
    const root = document.getElementById("trash-list"); root.replaceChildren();
    for (const task of rows) {
      const card = V.el("article", "task-card trash-card"), body = V.el("div", "task-content");
      body.append(V.el("div", "", task.title), V.el("div", "help-text", D.taskOptions.label(task)));
      const days = Math.max(0, Math.ceil((expires(task) - Date.now()) / 86400000));
      body.append(V.el("div", "help-text", `${M.stampLabel(task.deletedAt)}에 이동 · ${days ? `복원 가능 ${days}일 남음` : "자동 삭제 대기"}`));
      const restore = V.el("button", "button subtle", "복원"); restore.type = "button";
      restore.disabled = !writable || busy || !days;
      restore.addEventListener("click", async () => {
        if (busy) return; busy = true; D.refresh?.();
        try { await S.restoreTrash(task.id, task.revision); V.toast("일정을 복원했어요."); }
        catch (error) { V.toast(error.code === "permission-denied" ? "복원 기간이 지났거나 저장 권한이 없어요. 규칙 게시와 연결 상태를 확인해주세요." : error.message); }
        finally { busy = false; D.refresh?.(); }
      });
      const erase = V.el("button", "button danger", "영구 삭제"); erase.type = "button"; erase.disabled = !writable || busy;
      erase.addEventListener("click", () => eraseItems([task]));
      const actions = V.el("div", "trash-actions"); actions.append(restore, erase);
      card.append(body, actions); root.append(card);
    }
    if (!rows.length) root.append(V.el("p", "empty-state", "휴지통이 비어 있어요."));
  }
  async function eraseItems(targets) {
    if (busy || !S.canWrite() || !targets.length) return;
    const question = targets.length === 1 ? `‘${targets[0].title}’을 영구 삭제할까요?` : `휴지통 ${targets.length}개를 모두 영구 삭제할까요?`;
    if (!window.confirm(`${question}\n삭제 후에는 복원할 수 없습니다.`)) return;
    busy = true; const owner = S.currentUser()?.id; let count = 0; D.refresh?.();
    try {
      // 확인한 항목만 처리합니다. 그 뒤 다른 기기에서 옮긴 항목은 포함하지 않습니다.
      for (const task of targets) {
        if (owner !== S.currentUser()?.id) throw Error("로그인 계정이 바뀌어 중단했어요.");
        await S.deleteTrash(task.id, task.revision); count++;
      }
      V.toast(`${count}개를 영구 삭제했어요.`);
    } catch (error) {
      V.toast(`${count}개 삭제 후 중단됐어요. ` + (error.code === "permission-denied" ? "v1.15 보안 규칙 게시와 계정 권한을 확인해주세요." : error.message));
    } finally { busy = false; D.refresh?.(); }
  }
  document.getElementById("trash-empty").addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation(); eraseItems([...rows]);
  });
  async function clean() {
    if (busy || D.backup?.busy || !S.canWrite() || Date.now() - lastClean < 60000) return;
    lastClean = Date.now(); const expired = rows.filter(task => expires(task) <= Date.now()).slice(0, 20);
    if (!expired.length) return;
    busy = true; const owner = S.currentUser()?.id; D.refresh?.();
    try {
      for (const task of expired) {
        if (owner !== S.currentUser()?.id || !S.canWrite()) break;
        await S.purgeTrash(task.id, task.revision);
      }
      document.getElementById("trash-status").textContent = "보관 기간이 지난 일정을 정리했어요.";
    } catch (error) {
      document.getElementById("trash-status").textContent = "자동 정리를 완료하지 못했어요. 연결·새 보안 규칙을 확인해주세요. 이후 다시 시도합니다.";
    } finally { busy = false; D.refresh?.(); }
  }
  D.trash = { render, clean, get busy() { return busy; } };
  setInterval(clean, 15000);
})();

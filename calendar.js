// 달력의 날짜 계산과 표시만 담당합니다. 일정은 전달받으며 직접 저장하지 않습니다.
(function () {
  "use strict";
  const D = window.Dashboard, M = D.model, V = D.view;
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  function render(root, start, items, reference, selected) {
    const active = new Map(), total = new Map();
    for (const task of items) {
      if (!task.dueDate) continue;
      total.set(task.dueDate, (total.get(task.dueDate) || 0) + 1);
      if (!task.completed) {
        if (!active.has(task.dueDate)) active.set(task.dueDate, []);
        active.get(task.dueDate).push(task);
      }
    }
    const fragment = document.createDocumentFragment();
    for (let offset = 0; offset < 3; offset++) {
      const first = M.monthStart(start, offset);
      const [year, month] = first.split("-").map(Number);
      const article = V.el("article", "month surface");
      article.setAttribute("aria-label", `${year}년 ${month}월 달력`);
      const heading = V.el("div", "month-heading");
      const title = V.el("h3", "", `${month}월`);
      title.append(V.el("span", "", String(year))); heading.append(title);
      if (first === M.monthStart(reference)) heading.append(V.el("span", "month-tag", "이번 달"));
      const labels = V.el("div", "weekdays"); labels.setAttribute("aria-hidden", "true");
      weekdays.forEach(day => labels.append(V.el("span", "", day)));
      const grid = V.el("div", "month-days");
      const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();
      // 매달 6주로 맞춰 세 달의 높이가 같게 유지됩니다.
      for (let index = 0; index < 42; index++) {
        const date = M.addDays(first, index - firstWeekday);
        const outside = date.slice(0, 7) !== first.slice(0, 7);
        const tasks = (active.get(date) || []).slice().sort(M.sortTasks);
        const column = index % 7;
        const classes = ["calendar-day", outside ? "outside" : "", date === reference ? "is-today" : "", date === selected && !outside ? "selected" : "", column === 0 ? "sunday" : column === 6 ? "saturday" : ""].filter(Boolean).join(" ");
        const cell = V.el(outside ? "span" : "button", classes);
        if (outside) cell.setAttribute("aria-hidden", "true");
        else {
          cell.type = "button"; cell.dataset.date = date;
          cell.setAttribute("aria-label", `${M.dateLabel(date, true)}, 일정 ${total.get(date) || 0}개${tasks.length ? `, ${tasks.map(task => task.title).join(", ")}` : ""}`);
          cell.setAttribute("aria-haspopup", "dialog");
          if (date === reference) cell.setAttribute("aria-current", "date");
          cell.title = tasks.map(task => task.title).join("\n") || M.dateLabel(date, true);
        }
        cell.append(V.el("span", "day-number", String(Number(date.slice(-2)))));
        if (!outside && tasks.length) {
          const important = tasks.some(task => task.important);
          cell.append(V.el("span", `day-task${important ? " is-important" : ""}`, tasks[0].title));
          if (tasks.length > 1) cell.append(V.el("span", "day-more", `외 ${tasks.length - 1}개`));
        }
        grid.append(cell);
      }
      article.append(heading, labels, grid); fragment.append(article);
    }
    root.replaceChildren(fragment);
  }
  D.calendar = { render };
})();

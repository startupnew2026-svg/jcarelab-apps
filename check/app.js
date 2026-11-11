"use strict";

(() => {
  // 이 앱의 기록만 따로 저장합니다.
  const STORAGE_KEY = "jcarelab-check-v1";
  const dateInput = document.querySelector("#record-date");
  const searchInput = document.querySelector("#search-input");
  const newItemInput = document.querySelector("#new-item");
  const itemList = document.querySelector("#item-list");
  const dateList = document.querySelector("#date-list");
  const actionStatus = document.querySelector("#action-status");
  const storageNotice = document.querySelector("#storage-notice");
  const clearDialog = document.querySelector("#clear-dialog");
  let fallbackId = 0;

  // 오늘 날짜는 기기의 날짜를 사용합니다. 밤이 지나면 새 점검을 시작합니다.
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function validDay(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1000) return false;
    return dayKey(new Date(year, month - 1, day)) === value;
  }

  function dateLabel(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  }

  function timeLabel(value) {
    if (!value) return "미확인";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "미확인" : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function fullTimeLabel(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function emptyState() { return { templates: [], records: {}, search: "" }; }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return emptyState();
      const data = JSON.parse(saved);
      if (!data || !Array.isArray(data.templates) || !data.records || typeof data.records !== "object") throw new Error("저장 내용 확인");
      const restored = emptyState();
      const templateIds = new Set();
      for (const item of data.templates) {
        if (!item || typeof item.id !== "string" || !item.id || typeof item.text !== "string" || !item.text.trim() || templateIds.has(item.id)) continue;
        templateIds.add(item.id);
        restored.templates.push({ id: item.id, text: item.text.slice(0, 160) });
      }
      for (const [day, record] of Object.entries(data.records)) {
        if (!validDay(day) || !record || !Array.isArray(record.items)) continue;
        const ids = new Set();
        const items = record.items.filter((item) => {
          if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.text !== "string" || !item.text.trim()) return false;
          ids.add(item.id);
          return true;
        }).map((item) => ({ id: item.id, text: item.text.slice(0, 160), done: item.done === true, doneAt: item.done === true && typeof item.doneAt === "string" ? item.doneAt : "" }));
        restored.records[day] = { items, updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "" };
      }
      restored.search = typeof data.search === "string" ? data.search.slice(0, 160) : "";
      document.querySelector("#save-status").textContent = "저장한 기록을 불러왔습니다.";
      return restored;
    } catch {
      storageNotice.textContent = "저장된 내용을 불러오지 못했습니다. 새로 입력하는 내용부터 저장합니다.";
      storageNotice.hidden = false;
      return emptyState();
    }
  }

  let state = loadState();
  let today = dayKey();
  let selectedDay = today;

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      document.querySelector("#save-status").textContent = "이 브라우저에 저장되었습니다.";
      storageNotice.hidden = true;
    } catch {
      document.querySelector("#save-status").textContent = "자동 저장을 하지 못했습니다.";
      storageNotice.textContent = "자동 저장을 하지 못했습니다. 새로 고침 전에 인쇄하거나 표 파일로 보관해 주세요.";
      storageNotice.hidden = false;
    }
  }

  // 그날의 항목 이름과 체크 상태를 따로 보관해 지난 기록을 지킵니다.
  function ensureTodayRecord() {
    if (state.records[today]) return false;
    state.records[today] = { items: state.templates.map((item) => ({ ...item, done: false, doneAt: "" })), updatedAt: "" };
    return true;
  }

  function selectedRecord() { return state.records[selectedDay] || { items: [], updatedAt: "" }; }
  function isToday() { return selectedDay === today; }
  function countDone(record) { return record.items.filter((item) => item.done).length; }
  function makeId() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${++fallbackId}`; }

  function showError(id, message) { const element = document.getElementById(id); element.textContent = message; element.hidden = false; }
  function hideError(id) { const element = document.getElementById(id); element.textContent = ""; element.hidden = true; }

  function renderSummary() {
    const record = selectedRecord();
    const done = countDone(record);
    document.querySelector("#done-count").textContent = done.toLocaleString("ko-KR");
    document.querySelector("#total-count").textContent = record.items.length.toLocaleString("ko-KR");
    document.querySelector("#summary-date").textContent = dateLabel(selectedDay);
    const progress = document.querySelector("#progress");
    progress.value = record.items.length ? Math.round(done / record.items.length * 100) : 0;
    progress.setAttribute("aria-valuetext", `전체 ${record.items.length}개 중 ${done}개 완료`);
    document.querySelector("#progress-description").textContent = record.items.length && done === record.items.length
      ? "모두 확인하셨습니다. 수고하셨습니다."
      : isToday() ? "확인하신 항목에 표시해 주세요." : "이 날짜에 저장한 점검 결과입니다.";
  }

  function renderItems() {
    const record = selectedRecord();
    const query = state.search.trim().toLocaleLowerCase("ko-KR");
    const items = record.items.filter((item) => item.text.toLocaleLowerCase("ko-KR").includes(query));
    itemList.replaceChildren();
    itemList.classList.toggle("is-past", !isToday());
    document.querySelector("#clear-search").hidden = !state.search;
    document.querySelector("#search-summary").textContent = query ? `검색 결과 ${items.length}개 · 전체 ${record.items.length}개` : `전체 ${record.items.length}개 항목`;
    document.querySelector("#empty-message").hidden = items.length > 0;
    document.querySelector("#empty-title").textContent = query ? "검색한 항목이 없습니다." : isToday() ? "아직 점검 항목이 없습니다." : "이 날짜에는 저장된 항목이 없습니다.";
    document.querySelector("#empty-help").textContent = query ? "다른 검색어를 입력하거나 검색을 지워 주세요." : isToday() ? "아래에서 항목을 추가하거나 예시를 넣어 주세요." : "다른 날짜를 선택하거나 오늘로 이동해 주세요.";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = `check-row${item.done ? " is-done" : ""}`;
      const label = document.createElement("label");
      label.className = "check-label";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "check-input";
      checkbox.dataset.itemId = item.id;
      checkbox.checked = item.done;
      checkbox.disabled = !isToday();
      checkbox.setAttribute("aria-label", item.text);
      const content = document.createElement("span");
      content.className = "check-content";
      const text = document.createElement("span");
      text.className = "check-text";
      text.textContent = item.text;
      const status = document.createElement("span");
      status.className = "check-status";
      status.textContent = item.done ? `완료 · ${timeLabel(item.doneAt)}` : "미완료";
      content.append(text, status);
      label.append(checkbox, content);
      row.append(label);
      if (isToday()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "delete-button";
        button.dataset.deleteId = item.id;
        button.textContent = "삭제";
        button.setAttribute("aria-label", `${item.text} 항목 삭제`);
        row.append(button);
      }
      itemList.append(row);
    }
  }

  function renderDates() {
    dateList.replaceChildren();
    const days = Object.keys(state.records).filter((day) => state.records[day].items.length > 0).sort().reverse();
    document.querySelector("#history-empty").hidden = days.length > 0;
    for (const day of days) {
      const record = state.records[day];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "date-button";
      button.dataset.day = day;
      button.setAttribute("aria-pressed", String(day === selectedDay));
      const date = document.createElement("span");
      date.textContent = `${day === today ? "오늘 · " : ""}${dateLabel(day)}`;
      const count = document.createElement("span");
      count.textContent = `${countDone(record)} / ${record.items.length}개 완료`;
      button.append(date, count);
      dateList.append(button);
    }
  }

  function render() {
    document.querySelector("#today-label").textContent = dateLabel(today);
    dateInput.max = today;
    dateInput.value = selectedDay;
    searchInput.value = state.search;
    document.querySelector("#list-title").textContent = isToday() ? "오늘의 점검" : "선택한 날짜의 기록";
    document.querySelector("#mode-label").textContent = isToday() ? "오늘 작성" : "지난 기록";
    document.querySelector("#past-notice").hidden = isToday();
    document.querySelector("#edit-tools").hidden = !isToday();
    renderItems();
    renderSummary();
    renderDates();
  }

  // 자정이나 기기 날짜 변경 뒤에 어제 기록을 덮어쓰지 않게 합니다.
  function syncDay() {
    const current = dayKey();
    if (current === today) return false;
    const wasToday = selectedDay === today;
    today = current;
    if (wasToday) selectedDay = today;
    ensureTodayRecord();
    saveState();
    render();
    actionStatus.textContent = "날짜가 바뀌어 새로운 오늘 점검을 준비했습니다.";
    return wasToday;
  }

  function selectDay(day) {
    syncDay();
    hideError("date-error");
    if (!validDay(day) || day > today) {
      dateInput.value = selectedDay;
      showError("date-error", "오늘 또는 지난 날짜를 선택해 주세요.");
      return;
    }
    selectedDay = day;
    state.search = "";
    actionStatus.textContent = "";
    hideError("item-error");
    saveState();
    render();
  }

  dateInput.addEventListener("change", () => selectDay(dateInput.value));
  document.querySelector("#go-today").addEventListener("click", () => { syncDay(); selectDay(today); });
  dateList.addEventListener("click", (event) => { const button = event.target.closest("[data-day]"); if (button) selectDay(button.dataset.day); });

  searchInput.addEventListener("input", () => { state.search = searchInput.value.slice(0, 160); saveState(); renderItems(); });
  document.querySelector("#clear-search").addEventListener("click", () => { state.search = ""; searchInput.value = ""; saveState(); renderItems(); searchInput.focus(); });

  function addItem(text) {
    const item = { id: makeId(), text };
    state.templates.push(item);
    state.records[today].items.push({ ...item, done: false, doneAt: "" });
    state.records[today].updatedAt = new Date().toISOString();
  }

  document.querySelector("#add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (syncDay() || !isToday()) return;
    hideError("item-error");
    const text = newItemInput.value.trim();
    if (!text) { showError("item-error", "추가할 점검 항목을 입력해 주세요."); newItemInput.focus(); return; }
    if (state.templates.some((item) => item.text === text)) { showError("item-error", "이미 목록에 있는 항목입니다."); return; }
    addItem(text.slice(0, 160));
    state.search = "";
    newItemInput.value = "";
    saveState();
    render();
    actionStatus.textContent = "항목을 추가했습니다. 다음 날에도 같은 항목을 점검하실 수 있습니다.";
    newItemInput.focus();
  });

  document.querySelector("#example-button").addEventListener("click", () => {
    if (syncDay() || !isToday()) return;
    const examples = ["[가상 예시] 제품 소개 자료 확인", "[가상 예시] 문의 답변 내용 확인", "[가상 예시] 김○○님 안내 문구 검토", "[가상 예시] 연락처 010-0000-0001 확인", "[가상 예시] 교육 자료 전달 준비 확인"];
    const missing = examples.filter((text) => !state.templates.some((item) => item.text === text));
    missing.forEach(addItem);
    state.search = "";
    hideError("item-error");
    saveState();
    render();
    actionStatus.textContent = missing.length ? `가상 예시 ${missing.length}개를 추가했습니다. 실제 점검 항목으로 바꿔 사용해 주세요.` : "예시 항목이 이미 모두 들어 있습니다.";
  });

  itemList.addEventListener("change", (event) => {
    if (syncDay() || !isToday()) return;
    const checkbox = event.target.closest("[data-item-id]");
    if (!checkbox) return;
    const item = state.records[today].items.find((item) => item.id === checkbox.dataset.itemId);
    if (!item) return;
    item.done = checkbox.checked;
    item.doneAt = item.done ? new Date().toISOString() : "";
    state.records[today].updatedAt = new Date().toISOString();
    saveState();
    renderItems();
    renderSummary();
    renderDates();
    [...itemList.querySelectorAll("[data-item-id]")].find((input) => input.dataset.itemId === item.id)?.focus();
  });

  itemList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button || syncDay() || !isToday()) return;
    state.templates = state.templates.filter((item) => item.id !== button.dataset.deleteId);
    state.records[today].items = state.records[today].items.filter((item) => item.id !== button.dataset.deleteId);
    state.records[today].updatedAt = new Date().toISOString();
    saveState();
    render();
    actionStatus.textContent = "오늘과 앞으로의 목록에서 항목을 뺐습니다. 지난 날짜의 기록은 그대로입니다.";
    newItemInput.focus();
  });

  // 쉼표와 줄바꿈을 보존하고, 표를 열 때 글이 계산식으로 실행되지 않게 합니다.
  function csvCell(value) {
    let text = String(value);
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function buildCsv() {
    const rows = [["날짜", "점검 항목", "상태", "확인 시간"]];
    for (const day of Object.keys(state.records).sort()) {
      for (const item of state.records[day].items) rows.push([day, item.text, item.done ? "완료" : "미완료", item.done ? fullTimeLabel(item.doneAt) : ""]);
    }
    return rows.length === 1 ? null : `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  }

  document.querySelector("#export-button").addEventListener("click", () => {
    syncDay();
    const csv = buildCsv();
    if (!csv) { actionStatus.textContent = "내보낼 점검 기록이 없습니다. 항목을 먼저 추가해 주세요."; actionStatus.scrollIntoView({ block: "center" }); return; }
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `제이케어랩_점검기록_${today}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    actionStatus.textContent = "모든 날짜의 기록을 표 파일로 내보냈습니다.";
  });

  // 검색으로 가린 항목도 빠지지 않게, 선택한 날짜의 전체 내용을 인쇄합니다.
  function preparePrint() {
    syncDay();
    const record = selectedRecord();
    document.querySelector("#print-date").textContent = `점검 날짜: ${dateLabel(selectedDay)}`;
    document.querySelector("#print-summary").textContent = `전체 ${record.items.length}개 · 완료 ${countDone(record)}개 · 미완료 ${record.items.length - countDone(record)}개`;
    const body = document.querySelector("#print-items");
    body.replaceChildren();
    record.items.forEach((item, index) => {
      const row = document.createElement("tr");
      for (const value of [index + 1, item.text, item.done ? "완료" : "미완료", item.done ? timeLabel(item.doneAt) : "미확인"]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      body.append(row);
    });
    if (!record.items.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "이 날짜에는 저장된 항목이 없습니다.";
      row.append(cell);
      body.append(row);
    }
    document.querySelector("#print-updated").textContent = record.updatedAt ? `마지막 점검 변경: ${fullTimeLabel(record.updatedAt)}` : "";
  }

  document.querySelector("#print-button").addEventListener("click", () => { preparePrint(); window.print(); });
  window.addEventListener("beforeprint", preparePrint);

  function clearAll() {
    // 다른 앱의 저장 내용은 지우지 않습니다. 이 앱의 이름만 지웁니다.
    try { localStorage.removeItem(STORAGE_KEY); } catch {
      storageNotice.textContent = "기록을 지우지 못했습니다. 브라우저의 저장 설정을 확인해 주세요.";
      storageNotice.hidden = false;
      return;
    }
    state = emptyState();
    today = dayKey();
    selectedDay = today;
    newItemInput.value = "";
    storageNotice.hidden = true;
    hideError("date-error");
    hideError("item-error");
    ensureTodayRecord();
    render();
    document.querySelector("#save-status").textContent = "점검 항목과 기록을 모두 지웠습니다.";
    actionStatus.textContent = "이 앱의 점검 항목과 모든 날짜의 기록을 지웠습니다.";
    newItemInput.focus();
  }

  document.querySelector("#clear-button").addEventListener("click", () => clearDialog.showModal());
  document.querySelector("#cancel-clear").addEventListener("click", () => clearDialog.close());
  document.querySelector("#confirm-clear").addEventListener("click", () => { clearDialog.close(); clearAll(); });

  const newDay = ensureTodayRecord();
  render();
  if (newDay && state.templates.length) saveState();
  window.addEventListener("focus", syncDay);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncDay(); });
  setInterval(syncDay, 30000);
})();

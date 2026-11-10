"use strict";

(() => {
  // 이 앱의 내용만 따로 저장합니다. 다른 화면의 저장 내용은 건드리지 않습니다.
  const STORAGE_KEY = "jcarelab-quote-v1";
  const form = document.querySelector("#statement-form");
  const itemList = document.querySelector("#item-list");
  const itemTemplate = document.querySelector("#item-template");
  const saveStatus = document.querySelector("#save-status");
  const saveCard = document.querySelector(".save-card");
  const numberMessage = document.querySelector("#number-message");
  const printArea = document.querySelector("#print-area");
  const printPaper = document.querySelector("#print-paper");
  const actionStatus = document.querySelector("#action-status");
  let nextRowId = 0;
  let storageProblem = false;

  // 오늘 날짜를 기기의 날짜 기준으로 표시합니다.
  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function exampleState() {
    return {
      date: today(),
      recipientName: "예시대학교 간호학과",
      recipientContact: "이○○ · 010-0000-0002",
      recipientAddress: "",
      senderName: "제이케어랩",
      senderContact: "김○○ · 010-0000-0001",
      senderAddress: "",
      memo: "",
      items: [
        { name: "교육용 예시 자료", quantity: "2", price: "15000" },
        { name: "실습용 예시 교구", quantity: "1", price: "25000" }
      ]
    };
  }

  // 쉼표는 입력해도 됩니다. 음수, 소수, 글자는 금액에 섞이지 않게 합니다.
  function cleanNumber(value) {
    const digits = String(value).normalize("NFKC").replace(/,/g, "").trim();
    if (!/^\d{0,12}$/.test(digits)) return null;
    return digits.replace(/^0+(?=\d)/, "");
  }

  // 큰 금액도 계산이 틀어지지 않도록 정수로 정확히 계산합니다.
  function numberValue(value) {
    return BigInt(cleanNumber(value) || "0");
  }

  function formatNumber(value) {
    return numberValue(value).toLocaleString("ko-KR");
  }

  function money(value) {
    return `${value.toLocaleString("ko-KR")}원`;
  }

  const textFields = {
    recipientName: 60, recipientContact: 80, recipientAddress: 100,
    senderName: 60, senderContact: 80, senderAddress: 100, memo: 200
  };

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return exampleState();
      const data = JSON.parse(saved);
      if (!data || !Array.isArray(data.items)) throw new Error("저장 형식 확인");
      const restored = exampleState();
      for (const [field, limit] of Object.entries(textFields)) {
        if (typeof data[field] !== "string") throw new Error("저장 내용 확인");
        restored[field] = data[field].slice(0, limit);
      }
      if (typeof data.date !== "string" || (data.date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) throw new Error("작성일 확인");
      restored.date = data.date;
      restored.items = data.items.map((item) => {
        if (!item || typeof item.name !== "string") throw new Error("품목 확인");
        const quantity = cleanNumber(item.quantity);
        const price = cleanNumber(item.price);
        if (quantity === null || price === null) throw new Error("숫자 확인");
        return { name: item.name.slice(0, 100), quantity, price };
      });
      return restored;
    } catch {
      storageProblem = true;
      saveCard.classList.add("has-error");
      saveStatus.textContent = "저장된 내용을 불러오지 못했습니다. 입력 후 저장 상태를 확인해 주세요.";
      return exampleState();
    }
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageProblem = false;
      saveCard.classList.remove("has-error");
      saveStatus.textContent = "이 브라우저에 저장되었습니다.";
    } catch {
      storageProblem = true;
      saveCard.classList.add("has-error");
      saveStatus.textContent = "자동 저장을 하지 못했습니다. 새로 고침 전에 인쇄하거나 파일로 보관해 주세요.";
    }
  }

  function lineAmount(item) {
    return numberValue(item.quantity) * numberValue(item.price);
  }

  function calculateTotals() {
    const subtotal = state.items.reduce((sum, item) => sum + lineAmount(item), 0n);
    // 전체 세금 전 금액의 10%를 부가세로 더합니다. 원 미만은 버립니다.
    const vat = subtotal / 10n;
    return { subtotal, vat, total: subtotal + vat };
  }

  function updateTotals() {
    const amounts = calculateTotals();
    document.querySelector("#document-subtotal").textContent = money(amounts.subtotal);
    document.querySelector("#document-vat").textContent = money(amounts.vat);
    document.querySelector("#document-total").textContent = money(amounts.total);
    document.querySelector("#summary-subtotal").textContent = money(amounts.subtotal);
    document.querySelector("#summary-vat").textContent = money(amounts.vat);
    document.querySelector("#summary-total").textContent = money(amounts.total);
    document.querySelector("#item-count").textContent = `${state.items.length.toLocaleString("ko-KR")}개`;
    document.querySelector("#empty-message").hidden = state.items.length > 0;
  }

  function updateRowLabels() {
    [...itemList.children].forEach((row, index) => {
      row.querySelectorAll("[data-item-field]").forEach((input) => {
        const label = { name: "품목명", quantity: "수량", price: "단가" }[input.dataset.itemField];
        input.setAttribute("aria-label", `${index + 1}번째 품목 ${label}`);
      });
      const output = row.querySelector(".item-amount");
      output.setAttribute("aria-label", `${index + 1}번째 품목 금액`);
      const inputs = row.querySelectorAll("[data-item-field]");
      output.setAttribute("for", `${inputs[1].id} ${inputs[2].id}`);
      row.querySelector(".delete-button").setAttribute("aria-label", `${index + 1}번째 품목 삭제`);
    });
  }

  function createRow(item) {
    const row = itemTemplate.content.firstElementChild.cloneNode(true);
    const rowId = ++nextRowId;
    row.querySelectorAll("[data-item-field]").forEach((input) => {
      const field = input.dataset.itemField;
      input.id = `item-${rowId}-${field}`;
      input.closest(".item-row > div").querySelector("label").htmlFor = input.id;
      input.value = field === "name" ? item.name : (item[field] === "" ? "" : formatNumber(item[field]));
    });
    row.querySelector(".item-amount").textContent = money(lineAmount(item));
    itemList.append(row);
    return row;
  }

  function render() {
    form.querySelectorAll("[data-field]").forEach((input) => { input.value = state[input.dataset.field]; });
    itemList.replaceChildren();
    state.items.forEach(createRow);
    updateRowLabels();
    updateTotals();
  }

  form.addEventListener("submit", (event) => event.preventDefault());

  // 입력할 때마다 금액을 계산하고 바로 저장합니다.
  form.addEventListener("input", (event) => {
    const input = event.target;
    if (input.dataset.field) {
      state[input.dataset.field] = input.value;
    } else if (input.dataset.itemField) {
      const row = input.closest(".item-row");
      const index = [...itemList.children].indexOf(row);
      const item = state.items[index];
      const field = input.dataset.itemField;
      if (field === "name") {
        item.name = input.value;
      } else {
        const cleaned = cleanNumber(input.value);
        if (cleaned === null) {
          input.value = item[field];
          numberMessage.textContent = "수량과 단가는 0 이상의 정수로 최대 12자리까지 입력해 주세요. 쉼표도 사용하실 수 있습니다.";
          numberMessage.hidden = false;
          return;
        }
        item[field] = cleaned;
        numberMessage.hidden = true;
      }
      row.querySelector(".item-amount").textContent = money(lineAmount(item));
      updateTotals();
    } else {
      return;
    }
    save();
  });

  // 입력을 마치면 숫자에 천 단위 쉼표를 붙여 읽기 쉽게 합니다.
  itemList.addEventListener("focusout", (event) => {
    const input = event.target;
    if (!input.matches(".number-input")) return;
    const cleaned = cleanNumber(input.value);
    input.value = cleaned === "" ? "" : formatNumber(cleaned);
  });

  document.querySelector("#add-item").addEventListener("click", () => {
    const item = { name: "", quantity: "1", price: "0" };
    state.items.push(item);
    const row = createRow(item);
    updateRowLabels();
    updateTotals();
    save();
    row.querySelector("[data-item-field='name']").focus();
    actionStatus.textContent = `품목을 추가했습니다. 현재 ${state.items.length}줄입니다.`;
  });

  itemList.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-button");
    if (!button) return;
    const row = button.closest(".item-row");
    const index = [...itemList.children].indexOf(row);
    state.items.splice(index, 1);
    row.remove();
    updateRowLabels();
    updateTotals();
    save();
    numberMessage.hidden = true;
    const nextRow = itemList.children[index] || itemList.lastElementChild;
    (nextRow ? nextRow.querySelector("input") : document.querySelector("#add-item")).focus();
    actionStatus.textContent = `품목을 삭제했습니다. 현재 ${state.items.length}줄입니다.`;
  });

  function printText(id, value) {
    document.getElementById(id).textContent = value;
  }

  // 인쇄 내용은 입력값을 글자로 옮깁니다. 긴 이름도 잘리지 않고 나옵니다.
  function preparePrint() {
    const date = state.date.split("-");
    printText("print-date", state.date ? `${date[0]}년 ${Number(date[1])}월 ${Number(date[2])}일` : "미입력");
    printText("print-recipient-name", state.recipientName || "미입력");
    printText("print-recipient-contact", state.recipientContact);
    printText("print-recipient-address", state.recipientAddress);
    printText("print-sender-name", state.senderName || "미입력");
    printText("print-sender-contact", state.senderContact);
    printText("print-sender-address", state.senderAddress);
    printText("print-memo", state.memo);
    document.querySelector("#print-memo-section").hidden = !state.memo.trim();

    const rows = document.createDocumentFragment();
    for (const item of state.items) {
      const row = document.createElement("tr");
      const cells = [item.name || "미입력", formatNumber(item.quantity), money(numberValue(item.price)), money(lineAmount(item))];
      for (const value of cells) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
    }
    if (state.items.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "등록된 품목이 없습니다.";
      row.append(cell);
      rows.append(row);
    }
    document.querySelector("#print-items").replaceChildren(rows);
    const amounts = calculateTotals();
    printText("print-subtotal", money(amounts.subtotal));
    printText("print-vat", money(amounts.vat));
    printText("print-total", money(amounts.total));

    // 용지의 실제 높이를 재서 A4 한 장에 맞는 크기를 구합니다.
    printPaper.style.setProperty("--paper-scale", "1");
    printPaper.style.setProperty("--paper-left", "0px");
    printArea.classList.add("is-measuring");
    const pixelsPerMillimeter = printPaper.offsetWidth / 186;
    const availableHeight = 271 * pixelsPerMillimeter;
    const scale = Math.min(1, availableHeight / printPaper.scrollHeight);
    printPaper.style.setProperty("--paper-scale", String(scale));
    printPaper.style.setProperty("--paper-left", `${(printPaper.offsetWidth * (1 - scale)) / 2}px`);
    printArea.classList.remove("is-measuring");
  }

  document.querySelector("#print-button").addEventListener("click", () => {
    preparePrint();
    window.print();
  });
  // 브라우저 메뉴나 키보드로 인쇄해도 똑같이 준비합니다.
  window.addEventListener("beforeprint", preparePrint);
  window.addEventListener("pagehide", save);

  render();
  if (!storageProblem) save();
})();

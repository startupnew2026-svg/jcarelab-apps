"use strict";

(() => {
  const TEAM_STORAGE_KEY = "jcarelab-reply-team-v1";
  const DRAFT_STORAGE_KEY = "jcarelab-reply-draft-v1";
  const API_BASE = "https://gy-ai.tkvkaosh.workers.dev";
  const SYSTEM_MESSAGE = "너는 제이케어랩의 고객 담당 직원. 한국어 존댓말. 원문에 없는 가격 · 날짜 · 약속은 지어내지 않고, 확인이 필요하면 확인 후 다시 안내드리겠다고 쓴다.";
  const TONES = ["정중하게", "간결하게", "따뜻하게"];
  const teamForm = document.querySelector("#team-form");
  const teamInput = document.querySelector("#team-code");
  const verifyButton = document.querySelector("#verify-button");
  const connectionStatus = document.querySelector("#connection-status");
  const settingsError = document.querySelector("#settings-error");
  const sourceInput = document.querySelector("#source-text");
  const resultInput = document.querySelector("#result-text");
  const makeButton = document.querySelector("#make-button");
  const exampleButton = document.querySelector("#example-button");
  const copyButton = document.querySelector("#copy-button");
  const copyLabel = document.querySelector("#copy-label");
  const copyStatus = document.querySelector("#copy-status");
  const requestError = document.querySelector("#request-error");
  const writingStatus = document.querySelector("#writing-status");
  const resultCard = document.querySelector("#result-card");
  const historyList = document.querySelector("#history-list");
  const historyStatus = document.querySelector("#history-status");
  const storageNotice = document.querySelector("#storage-notice");
  const draftStatus = document.querySelector("#draft-status");
  const toneButtons = [...document.querySelectorAll("[data-tone]")];
  let savedTeamCode = "";
  let verifiedTeamCode = "";
  let busy = "";

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function clearError(element) {
    element.textContent = "";
    element.hidden = true;
  }

  function storageWarning(message) {
    storageNotice.textContent = message;
    storageNotice.hidden = false;
  }

  function nonNegativeNumber(value) {
    if ((typeof value !== "number" && typeof value !== "string") || value === "" || value === null) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function emptyDraft() {
    return { source: "", tone: "정중하게", result: "", costKrw: null, ms: null, history: [] };
  }

  // 팀 코드와 작성 내용은 서로 다른 이름으로 저장합니다.
  // 팀 코드는 아래에서 불러오기만 하며, 코드 파일에는 값이 없습니다.
  try {
    savedTeamCode = localStorage.getItem(TEAM_STORAGE_KEY) || "";
  } catch {
    storageWarning("브라우저에 저장된 내용을 읽지 못했습니다. 저장 설정을 확인해 주세요.");
  }

  function loadDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!saved) return emptyDraft();
      const data = JSON.parse(saved);
      if (!data || typeof data !== "object") throw new Error("저장 내용 확인");
      const draft = emptyDraft();
      draft.source = typeof data.source === "string" ? data.source : "";
      draft.tone = TONES.includes(data.tone) ? data.tone : "정중하게";
      draft.result = typeof data.result === "string" ? data.result : "";
      draft.costKrw = nonNegativeNumber(data.costKrw);
      draft.ms = nonNegativeNumber(data.ms);
      draft.history = (Array.isArray(data.history) ? data.history : [])
        .filter((entry) => entry && typeof entry.text === "string" && entry.text.trim() && typeof entry.source === "string")
        .slice(0, 5)
        .map((entry) => ({
          source: entry.source, text: entry.text,
          tone: TONES.includes(entry.tone) ? entry.tone : "정중하게",
          costKrw: nonNegativeNumber(entry.costKrw), ms: nonNegativeNumber(entry.ms),
          createdAt: nonNegativeNumber(entry.createdAt)
        }));
      draftStatus.textContent = "저장한 내용을 불러왔습니다.";
      return draft;
    } catch {
      storageWarning("저장된 작성 내용을 불러오지 못했습니다. 새로 입력한 내용부터 저장합니다.");
      return emptyDraft();
    }
  }

  const state = loadDraft();

  // 입력 내용, 선택한 말투, 결과, 최근 다섯 개 기록만 자동 저장합니다.
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
      draftStatus.textContent = "이 브라우저에 자동 저장되었습니다.";
      storageNotice.hidden = true;
    } catch {
      storageWarning("자동 저장을 하지 못했습니다. 새로 고침하기 전에 필요한 결과를 복사해 주세요.");
      draftStatus.textContent = "자동 저장을 하지 못했습니다.";
    }
  }

  function costText(value) {
    return value === null ? "확인되지 않음" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}원`;
  }

  function timeText(value) {
    return value === null ? "확인되지 않음" : `${(value / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}초`;
  }

  function updateMetrics() {
    document.querySelector("#cost-value").textContent = busy === "write" ? "계산 중" : (state.result ? costText(state.costKrw) : "아직 없음");
    document.querySelector("#time-value").textContent = busy === "write" ? "측정 중" : (state.result ? timeText(state.ms) : "아직 없음");
  }

  // 기다리는 동안 모든 실행 버튼을 잠가 중복 요청을 막습니다.
  function setBusy(kind) {
    busy = kind;
    const locked = Boolean(kind);
    document.querySelectorAll("button").forEach((button) => { button.disabled = locked; });
    teamInput.disabled = locked;
    sourceInput.readOnly = locked;
    copyButton.disabled = locked || !state.result.trim();
    makeButton.textContent = kind === "write" ? "작성 중…" : "만들기";
    verifyButton.textContent = kind === "check" ? "확인 중…" : "저장 · 확인";
    writingStatus.hidden = kind !== "write";
    resultCard.setAttribute("aria-busy", String(kind === "write"));
    updateMetrics();
  }

  function renderTone() {
    toneButtons.forEach((button) => { button.setAttribute("aria-pressed", String(button.dataset.tone === state.tone)); });
  }

  function updateCharacterCount() {
    document.querySelector("#character-count").textContent = `${Array.from(state.source).length.toLocaleString("ko-KR")}자`;
  }

  function renderHistory() {
    historyList.replaceChildren();
    document.querySelector("#history-empty").hidden = state.history.length > 0;
    state.history.forEach((entry, index) => {
      const card = document.createElement("article");
      card.className = "history-card";
      const title = document.createElement("h3");
      title.textContent = `${index + 1}. ${entry.tone}`;
      const date = document.createElement("p");
      date.className = "history-date";
      const timestamp = entry.createdAt === null ? null : new Date(entry.createdAt);
      date.textContent = timestamp && !Number.isNaN(timestamp.getTime())
        ? timestamp.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "저장된 기록";
      const preview = document.createElement("p");
      preview.className = "history-preview";
      preview.textContent = entry.text;
      const metadata = document.createElement("p");
      metadata.className = "history-meta";
      metadata.textContent = `${costText(entry.costKrw)} · ${timeText(entry.ms)}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-soft";
      button.dataset.historyIndex = String(index);
      button.textContent = "불러오기";
      button.setAttribute("aria-label", `${index + 1}번째 기록 불러오기`);
      button.disabled = Boolean(busy);
      card.append(title, date, preview, metadata, button);
      historyList.append(card);
    });
  }

  // 서비스의 오류 문구는 바꾸지 않고 그대로 보여 줍니다.
  // 연결 실패 등 브라우저 오류에만 쉬운 한국어 안내를 사용합니다.
  async function requestJSON(url, options, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let response;
      try {
        response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
      } catch {
        throw new Error(controller.signal.aborted
          ? "응답을 기다리는 시간이 길어졌습니다. 잠시 후 다시 시도해 주세요."
          : "연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      if (data && typeof data.error === "string" && data.error) throw new Error(data.error);
      if (!response.ok || !data || typeof data !== "object") throw new Error("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function verifyTeam(shouldSave) {
    if (busy) return;
    clearError(settingsError);
    const code = teamInput.value.trim();
    verifiedTeamCode = "";
    if (!code) {
      showError(settingsError, "먼저 팀 코드를 저장하세요");
      connectionStatus.textContent = "연결 전 · 팀 코드를 입력해 주세요";
      connectionStatus.className = "connection-status";
      teamInput.focus();
      return;
    }
    setBusy("check");
    connectionStatus.textContent = "연결 확인 중…";
    connectionStatus.className = "connection-status is-checking";
    try {
      const url = `${API_BASE}/whoami?team=${encodeURIComponent(code)}`;
      const data = await requestJSON(url, { method: "GET" }, 15000);
      if (data.ok !== true || typeof data.team !== "string" || !data.team.trim()) throw new Error("팀 연결을 확인하지 못했습니다. 팀 코드를 다시 확인해 주세요.");
      if (shouldSave) {
        try {
          localStorage.setItem(TEAM_STORAGE_KEY, code);
        } catch {
          throw new Error("팀 코드를 저장하지 못했습니다. 브라우저의 저장 설정을 확인해 주세요.");
        }
        savedTeamCode = code;
      }
      verifiedTeamCode = code;
      teamInput.value = code;
      connectionStatus.textContent = `✓ ${data.team} 연결됨`;
      connectionStatus.className = "connection-status is-connected";
      clearError(requestError);
    } catch (error) {
      connectionStatus.textContent = "연결되지 않았습니다";
      connectionStatus.className = "connection-status is-error";
      showError(settingsError, error.message);
    } finally {
      setBusy("");
    }
  }

  teamForm.addEventListener("submit", (event) => {
    event.preventDefault();
    verifyTeam(true);
  });

  teamInput.addEventListener("input", () => {
    verifiedTeamCode = "";
    clearError(settingsError);
    connectionStatus.textContent = "변경한 팀 코드를 ‘저장 · 확인’해 주세요";
    connectionStatus.className = "connection-status";
  });

  sourceInput.addEventListener("input", () => {
    state.source = sourceInput.value;
    updateCharacterCount();
    saveDraft();
    clearError(requestError);
  });

  toneButtons.forEach((button) => button.addEventListener("click", () => {
    if (busy) return;
    state.tone = button.dataset.tone;
    renderTone();
    saveDraft();
  }));

  // 아래 문의는 실제 고객 정보가 아닌 가상 예시입니다.
  exampleButton.addEventListener("click", () => {
    if (busy) return;
    state.source = "[가상 예시 문의]\n받는 분: 김○○님\n문의 내용: 간호교육용 자료의 구성, 이용 방법과 가격을 알고 싶습니다.\n현재 확인된 내용: 자세한 자료 구성과 가격은 확인이 필요합니다.\n문의 연락처: 010-0000-0001";
    sourceInput.value = state.source;
    updateCharacterCount();
    saveDraft();
    clearError(requestError);
    sourceInput.focus();
  });

  makeButton.addEventListener("click", async () => {
    if (busy) return;
    clearError(requestError);
    copyStatus.textContent = "";
    if (!savedTeamCode || !verifiedTeamCode || teamInput.value.trim() !== savedTeamCode || verifiedTeamCode !== savedTeamCode) {
      showError(settingsError, "먼저 팀 코드를 저장하세요");
      teamInput.focus();
      return;
    }
    const original = sourceInput.value.trim();
    if (!original) {
      showError(requestError, "작성할 내용을 먼저 입력해 주세요.");
      sourceInput.focus();
      return;
    }
    const tone = state.tone;
    setBusy("write");
    historyStatus.textContent = "";
    try {
      const data = await requestJSON(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: verifiedTeamCode, system: SYSTEM_MESSAGE, prompt: `${tone}\n\n${original}` })
      }, 60000);
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("작성된 문자가 비어 있습니다. 다시 시도해 주세요.");
      state.result = data.text;
      state.costKrw = nonNegativeNumber(data.cost_krw);
      state.ms = nonNegativeNumber(data.ms);
      state.history.unshift({ source: original, tone, text: data.text, costKrw: state.costKrw, ms: state.ms, createdAt: Date.now() });
      state.history = state.history.slice(0, 5);
      resultInput.value = state.result;
      copyLabel.textContent = "복사";
      copyStatus.className = "copy-status";
      copyStatus.textContent = "작성이 완료되었습니다. 내용을 확인한 뒤 복사해 주세요.";
      renderHistory();
      saveDraft();
    } catch (error) {
      showError(requestError, error.message);
    } finally {
      setBusy("");
    }
  });

  copyButton.addEventListener("click", async () => {
    if (busy || !state.result.trim()) return;
    copyStatus.textContent = "";
    copyStatus.className = "copy-status";
    let copied = false;
    try {
      await navigator.clipboard.writeText(state.result);
      copied = true;
    } catch {
      // 자동 복사를 지원하지 않는 브라우저에서는 글을 선택해서 복사합니다.
      resultInput.focus();
      resultInput.select();
      try { copied = document.execCommand("copy"); } catch { copied = false; }
    }
    if (copied) {
      copyLabel.textContent = "복사 완료";
      copyStatus.textContent = "복사했습니다. 보내실 곳에 붙여 넣어 주세요.";
    } else {
      copyStatus.className = "copy-status is-error";
      copyStatus.textContent = "자동 복사가 되지 않았습니다. 결과 칸의 글을 선택해 직접 복사해 주세요.";
    }
  });

  historyList.addEventListener("click", (event) => {
    if (busy) return;
    const button = event.target.closest("[data-history-index]");
    if (!button) return;
    const entry = state.history[Number(button.dataset.historyIndex)];
    if (!entry) return;
    state.source = entry.source;
    state.tone = entry.tone;
    state.result = entry.text;
    state.costKrw = entry.costKrw;
    state.ms = entry.ms;
    sourceInput.value = state.source;
    resultInput.value = state.result;
    copyLabel.textContent = "복사";
    copyStatus.textContent = "";
    clearError(requestError);
    renderTone();
    updateCharacterCount();
    setBusy("");
    saveDraft();
    historyStatus.textContent = "선택한 기록을 불러왔습니다.";
    resultInput.focus();
  });

  // 새로 열어도 작성 내용과 팀 코드를 불러옵니다. 실제 연결은 다시 확인합니다.
  teamInput.value = savedTeamCode;
  sourceInput.value = state.source;
  resultInput.value = state.result;
  renderTone();
  updateCharacterCount();
  renderHistory();
  setBusy("");
  if (savedTeamCode) verifyTeam(false);
  window.addEventListener("pagehide", saveDraft);
})();

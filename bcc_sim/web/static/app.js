// bcc-sim web client — connects to /ws/play, renders the live dashboard.
(() => {
  "use strict";

  const RECENT_MAX = 12;
  const RED_SUITS = new Set(["H", "D"]);
  const SECONDS_PER_HAND = 40;  // 한 핸드 = 카지노 40초 환산

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $("config-form"),
    applyBtn: $("apply-btn"),
    startBtn: $("start-btn"),
    pauseBtn: $("pause-btn"),
    nextBtn: $("next-btn"),
    togglePanel: $("toggle-panel"),
    showPanel: $("show-panel"),
    app: $("app"),
    conn: $("connection"),
    errorBanner: $("error-banner"),

    gFill: $("gauge-fill"),
    gMarker: $("gauge-marker"),
    gRuin: $("g-ruin"),
    gInitial: $("g-initial"),
    gTarget: $("g-target"),

    capital: $("capital"),
    sessionPnl: $("session-pnl"),
    cumPnl: $("cumulative-pnl"),
    cumDetail: $("cumulative-detail"),

    handNum: $("hand-num"),
    martinEvent: $("martin-event"),
    betSide: $("bet-side"),
    betAmount: $("bet-amount"),
    playerCards: $("player-cards"),
    bankerCards: $("banker-cards"),
    playerTotal: $("player-total"),
    bankerTotal: $("banker-total"),
    handOutcome: $("hand-outcome"),
    handDelta: $("hand-delta"),

    recent: $("recent-list"),

    sessionNum: $("session-num"),
    sessionSeed: $("session-seed"),
    statHands: $("stat-hands"),
    statBets: $("stat-bets"),
    statStreak: $("stat-streak"),
    statRealtime: $("stat-realtime"),
    cumWins: $("cum-wins"),
    cumRuins: $("cum-ruins"),
    cumSessions: $("cum-sessions"),
    cumRealtime: $("cum-realtime"),
  };

  const state = {
    ws: null,
    config: null,       // banner config (initial/ruin/target ranges)
    cumulative: null,   // {sessions, wins, ruins, pnl}
    sessionPnlNow: 0,
    paused: false,
    running: false,
    sessionActive: false,
    sessionRecent: [],
    sessionHands: 0,
    sessionBets: 0,
    sessionStreak: 0,
    sessionStreakMax: 0,
    cumulativePrev: 0,  // pnl before current session for the detail line
    cumulativeHands: 0, // 누적 핸드 (체감 시간 계산용)
    appliedConfig: null,
    configDirty: false,
  };

  // ───────── time helpers ─────────
  function fmtRealTime(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return "0초";
    const s = Math.floor(totalSeconds);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}일`);
    if (hours > 0) parts.push(`${hours}시간`);
    if (mins > 0 && days === 0) parts.push(`${mins}분`);
    if (secs > 0 && days === 0 && hours === 0) parts.push(`${secs}초`);
    return parts.join(" ") || "0초";
  }
  function updateRealtimeStats() {
    if (el.statRealtime) el.statRealtime.textContent = fmtRealTime(state.sessionHands * SECONDS_PER_HAND);
    if (el.cumRealtime) {
      const total = (state.cumulativeHands + state.sessionHands) * SECONDS_PER_HAND;
      el.cumRealtime.textContent = fmtRealTime(total);
    }
  }

  function initNumberInputs() {
    const navigationKeys = new Set([
      "Backspace", "Delete", "Tab", "Enter", "Escape", "Home", "End",
      "ArrowLeft", "ArrowRight",
    ]);
    for (const input of el.form.querySelectorAll('input[type="number"]')) {
      input.inputMode = "numeric";
      input.autocomplete = "off";
      input.addEventListener("keydown", (ev) => {
        if (ev.ctrlKey || ev.metaKey || navigationKeys.has(ev.key)) return;
        if (!/^\d$/.test(ev.key)) ev.preventDefault();
      });
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "");
      });
      input.addEventListener("wheel", (ev) => {
        if (document.activeElement === input) ev.preventDefault();
      }, { passive: false });
    }
  }

  // ───────── form ↔ config ─────────
  async function loadDefaults() {
    const r = await fetch("/api/defaults");
    const d = await r.json();
    for (const [k, v] of Object.entries(d)) {
      const inputs = el.form.querySelectorAll(`[name="${k}"]`);
      if (!inputs.length) continue;
      if (inputs.length > 1) {
        // radio group
        inputs.forEach((i) => { i.checked = (String(i.value) === String(v)); });
      } else {
        const i = inputs[0];
        if (i.type === "checkbox") i.checked = Boolean(v);
        else i.value = v == null ? "" : v;
      }
    }
    applyConfig();
  }

  function readConfig() {
    const fd = new FormData(el.form);
    const data = {};
    for (const [k, v] of fd.entries()) data[k] = v;
    // checkboxes: only present if checked → fill missing as false
    for (const cb of el.form.querySelectorAll('input[type="checkbox"]')) {
      data[cb.name] = cb.checked;
    }
    // ints (server validates; we just send raw)
    const intKeys = [
      "initial_won", "target_won", "ruin_won", "table_max_won", "base_bet_won",
      "martin_steps", "seed", "n_decks", "cut_offset", "hand_delay_ms",
    ];
    for (const k of intKeys) if (data[k] !== undefined && data[k] !== "") data[k] = parseInt(data[k], 10);
    return data;
  }

  function markConfigDirty() {
    state.configDirty = true;
    el.applyBtn.textContent = "Apply *";
    el.applyBtn.classList.remove("is-primary");
    el.applyBtn.classList.add("is-warning");
  }

  function applyConfig() {
    const cfg = readConfig();
    state.appliedConfig = cfg;
    state.configDirty = false;
    el.applyBtn.textContent = "Apply";
    el.applyBtn.classList.remove("is-warning");
    el.applyBtn.classList.add("is-primary");

    if (Number.isFinite(cfg.initial_won) && Number.isFinite(cfg.target_won) && Number.isFinite(cfg.ruin_won)) {
      state.config = cfg;
      renderGaugeStatic(cfg);
      renderCapital(cfg.initial_won);
      renderCumulative();
    }
    return cfg;
  }

  // ───────── rendering ─────────
  const fmtWon = (n) => `${n.toLocaleString()}원`;
  const fmtSignedWon = (n) => {
    if (n > 0) return `+${n.toLocaleString()}원`;
    if (n < 0) return `${n.toLocaleString()}원`;
    return "0원";
  };
  const pnlClass = (n) => (n > 0 ? "pnl-pos" : n < 0 ? "pnl-neg" : "delta-zero");

  function renderGaugeStatic(cfg) {
    const { initial_won, target_won, ruin_won } = cfg;
    el.gRuin.textContent = fmtWon(ruin_won);
    el.gInitial.textContent = fmtWon(initial_won);
    el.gTarget.textContent = fmtWon(target_won);
    const span = target_won - ruin_won;
    const markerPct = span > 0 ? ((initial_won - ruin_won) / span) * 100 : 50;
    el.gMarker.style.left = `${Math.max(0, Math.min(100, markerPct))}%`;
  }

  function renderCapital(capital) {
    if (!state.config) return;
    const { initial_won, target_won, ruin_won } = state.config;
    const span = Math.max(1, target_won - ruin_won);
    const pct = ((capital - ruin_won) / span) * 100;
    const clipped = Math.max(0, Math.min(100, pct));
    el.gFill.style.width = `${clipped}%`;
    el.gFill.classList.toggle("below", capital < initial_won);
    el.capital.textContent = fmtWon(capital);

    const sessionPnl = capital - initial_won;
    state.sessionPnlNow = sessionPnl;
    el.sessionPnl.textContent = `(이번 세션 ${fmtSignedWon(sessionPnl)})`;
    el.sessionPnl.className = `muted mono ${pnlClass(sessionPnl)}`;
  }

  function renderCumulative() {
    const c = state.cumulative;
    if (!c) {
      el.cumPnl.textContent = "0원";
      el.cumDetail.textContent = "";
      el.cumWins.textContent = "0";
      el.cumRuins.textContent = "0";
      el.cumSessions.textContent = "0";
      return;
    }
    const total = c.pnl + state.sessionPnlNow;
    el.cumPnl.textContent = fmtSignedWon(total);
    el.cumPnl.className = `value mono ${pnlClass(total)}`;
    if (c.sessions > 0) {
      el.cumDetail.textContent = `(이전 ${c.sessions}세션 ${fmtSignedWon(c.pnl)}  +  이번 ${fmtSignedWon(state.sessionPnlNow)})`;
    } else {
      el.cumDetail.textContent = `(이번 ${fmtSignedWon(state.sessionPnlNow)})`;
    }
    el.cumWins.textContent = String(c.wins);
    el.cumRuins.textContent = String(c.ruins);
    el.cumSessions.textContent = String(c.sessions);
  }

  function cardHtml(card) {
    const cls = RED_SUITS.has(card.suit) ? "card red" : "card";
    return `<span class="${cls}">${card.label}</span>`;
  }

  function renderHand(rec) {
    el.handNum.textContent = `#${rec.hand_num}`;
    if (rec.martin_event) {
      const tag = {
        start: "MARTIN START",
        end_win: "MARTIN END · WIN",
        end_giveup: "MARTIN END · 포기",
      }[rec.martin_event] || rec.martin_event;
      el.martinEvent.textContent = tag;
      el.martinEvent.className = `martin-tag ${rec.martin_event}`;
    } else {
      el.martinEvent.textContent = "";
      el.martinEvent.className = "martin-tag";
    }

    el.betSide.textContent = rec.bet_side;
    el.betSide.className = `value side-label ${rec.bet_side === "BANKER" ? "banker-label" : "player-label"}`;
    el.betAmount.textContent = fmtWon(rec.bet_won);

    el.playerCards.innerHTML = rec.player.cards.map(cardHtml).join("");
    el.bankerCards.innerHTML = rec.banker.cards.map(cardHtml).join("");
    el.playerTotal.textContent = String(rec.player.total);
    el.bankerTotal.textContent = String(rec.banker.total);

    // outcome from bet perspective
    let outcomeText, outcomeCls;
    if (rec.hand_outcome === "TIE") {
      outcomeText = `TIE (${rec.hand_outcome})`;
      outcomeCls = "outcome-TIE";
    } else if (rec.hand_outcome === rec.bet_side) {
      outcomeText = `WIN (${rec.hand_outcome})`;
      outcomeCls = "outcome-WIN";
    } else {
      outcomeText = `LOSS (${rec.hand_outcome})`;
      outcomeCls = "outcome-LOSS";
    }
    el.handOutcome.textContent = outcomeText;
    el.handOutcome.className = `value ${outcomeCls}`;

    let deltaText, deltaCls;
    if (rec.capital_delta > 0) { deltaText = `Δ +${rec.capital_delta.toLocaleString()}원`; deltaCls = "delta-pos"; }
    else if (rec.capital_delta < 0) { deltaText = `Δ ${rec.capital_delta.toLocaleString()}원`; deltaCls = "delta-neg"; }
    else { deltaText = "Δ 0원"; deltaCls = "delta-zero"; }
    el.handDelta.textContent = deltaText;
    el.handDelta.className = `value mono ${deltaCls}`;

    renderCapital(rec.capital_after);

    // update session stats
    state.sessionHands = rec.hand_num;
    if (rec.hand_outcome !== "TIE") {
      state.sessionBets += 1;
      if (rec.hand_outcome === rec.bet_side) {
        state.sessionStreak = 0;
      } else {
        state.sessionStreak += 1;
        if (state.sessionStreak > state.sessionStreakMax) state.sessionStreakMax = state.sessionStreak;
      }
    }
    el.statHands.textContent = String(state.sessionHands);
    el.statBets.textContent = String(state.sessionBets);
    el.statStreak.textContent = String(state.sessionStreakMax);
    updateRealtimeStats();

    appendRecent(rec, outcomeCls);
    renderCumulative();
  }

  function appendRecent(rec, outcomeCls) {
    const tag = rec.martin_event ? ` ← ${rec.martin_event.toUpperCase()}` : "";
    const li = document.createElement("li");
    const result = rec.hand_outcome === "TIE"
      ? "TIE"
      : (rec.hand_outcome === rec.bet_side ? "WIN" : "LOSS");
    li.innerHTML = `
      <span class="col-hand">#${rec.hand_num}</span>
      <span class="col-bet">${rec.bet_side === "BANKER" ? "B" : "P"} ${rec.bet_won.toLocaleString()}원</span>
      <span class="col-result ${outcomeCls}">${result}</span>
      <span class="${rec.capital_delta >= 0 ? "delta-pos" : "delta-neg"}">${rec.capital_delta >= 0 ? "+" : ""}${rec.capital_delta.toLocaleString()}원</span>
      <span class="muted">${tag}</span>
    `;
    el.recent.prepend(li);
    state.sessionRecent.unshift(rec);
    while (el.recent.childElementCount > RECENT_MAX) el.recent.lastElementChild.remove();
    state.sessionRecent.length = Math.min(state.sessionRecent.length, RECENT_MAX);
  }

  function resetSessionView() {
    state.sessionRecent = [];
    state.sessionHands = 0;
    state.sessionBets = 0;
    state.sessionStreak = 0;
    state.sessionStreakMax = 0;
    state.sessionPnlNow = 0;
    el.recent.innerHTML = "";
    el.statHands.textContent = "0";
    el.statBets.textContent = "0";
    el.statStreak.textContent = "0";
    if (el.statRealtime) el.statRealtime.textContent = "0초";
    el.handNum.textContent = "-";
    el.martinEvent.textContent = "";
    el.betSide.textContent = "-";
    el.betSide.className = "value";
    el.betAmount.textContent = "-";
    el.playerCards.innerHTML = "";
    el.bankerCards.innerHTML = "";
    el.playerTotal.textContent = "-";
    el.bankerTotal.textContent = "-";
    el.handOutcome.textContent = "-";
    el.handOutcome.className = "value";
    el.handDelta.textContent = "";
    if (state.config) renderCapital(state.config.initial_won);
  }

  // ───────── WebSocket ─────────
  function setConnection(status) {
    el.conn.className = `nes-badge ${status}`;
    el.conn.replaceChildren(Object.assign(document.createElement("span"), { textContent: status }));
  }
  function showError(msg) {
    el.errorBanner.textContent = msg;
    el.errorBanner.hidden = false;
  }
  function clearError() { el.errorBanner.hidden = true; el.errorBanner.textContent = ""; }

  function setRunButton(mode) {
    el.startBtn.classList.remove("is-success", "is-error", "is-warning");
    if (mode === "stop") {
      el.startBtn.textContent = "⏹ Stop";
      el.startBtn.classList.add("is-error");
      el.startBtn.disabled = false;
    } else if (mode === "connecting") {
      el.startBtn.textContent = "Connecting";
      el.startBtn.classList.add("is-warning");
      el.startBtn.disabled = true;
    } else {
      el.startBtn.textContent = "▶ Start";
      el.startBtn.classList.add("is-success");
      el.startBtn.disabled = false;
    }
  }

  function setPauseButton(mode) {
    el.pauseBtn.classList.remove("is-warning", "is-primary");
    if (mode === "resume") {
      el.pauseBtn.textContent = "▶ Resume";
      el.pauseBtn.classList.add("is-primary");
      el.pauseBtn.disabled = false;
    } else {
      el.pauseBtn.textContent = "⏸ Pause";
      el.pauseBtn.classList.add("is-warning");
      el.pauseBtn.disabled = mode === "disabled";
    }
  }

  function setControlsForRun() {
    el.applyBtn.disabled = true;
    setRunButton("stop");
    setPauseButton(state.paused ? "resume" : "pause");
    el.nextBtn.disabled = true;
  }
  function setControlsForStarting() {
    el.applyBtn.disabled = true;
    setRunButton("stop");
    state.paused = false;
    state.sessionActive = false;
    setPauseButton("disabled");
    el.nextBtn.disabled = true;
  }
  function setControlsForIdle() {
    el.applyBtn.disabled = false;
    setRunButton("start");
    state.paused = false;
    state.sessionActive = false;
    setPauseButton("disabled");
    el.nextBtn.disabled = true;
  }
  function setControlsForSessionEnd() {
    el.applyBtn.disabled = true;
    setRunButton("stop");
    state.paused = false;
    state.sessionActive = false;
    setPauseButton("disabled");
    el.nextBtn.disabled = false;
  }

  function startWs() {
    clearError();
    if (state.configDirty) {
      showError("변경한 설정을 먼저 Apply 해주세요.");
      return;
    }
    const cfg = state.appliedConfig || applyConfig();
    el.applyBtn.disabled = true;
    setRunButton("connecting");
    setPauseButton("disabled");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/play`);
    state.ws = ws;
    state.cumulative = null;
    state.cumulativePrev = 0;
    state.cumulativeHands = 0;
    state.running = true;
    state.paused = false;
    state.sessionActive = false;
    if (el.cumRealtime) el.cumRealtime.textContent = "0초";

    ws.addEventListener("open", () => {
      setConnection("online");
      ws.send(JSON.stringify({ action: "start", config: cfg }));
      setControlsForStarting();
    });

    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      handleMessage(msg);
    });

    ws.addEventListener("close", () => {
      setConnection("offline");
      state.ws = null;
      state.running = false;
      setControlsForIdle();
    });

    ws.addEventListener("error", () => {
      showError("WebSocket 연결 오류");
    });
  }

  function send(action) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ action }));
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case "banner":
        state.config = msg.config;
        renderGaugeStatic(state.config);
        el.sessionSeed.textContent = "-";
        el.sessionNum.textContent = "-";
        state.cumulative = { sessions: 0, wins: 0, ruins: 0, pnl: 0 };
        renderCumulative();
        renderCapital(state.config.initial_won);
        break;

      case "session_start":
        resetSessionView();
        state.sessionActive = true;
        state.paused = false;
        el.sessionNum.textContent = String(msg.session_num);
        el.sessionSeed.textContent = String(msg.seed);
        if (msg.config) {
          state.config = msg.config;
          renderGaugeStatic(state.config);
          renderCapital(state.config.initial_won);
        }
        setControlsForRun();
        break;

      case "hand":
        renderHand(msg.record);
        break;

      case "session_end":
        state.cumulative = msg.cumulative;
        // session_pnl already baked into cumulative — clear "this session" component
        state.sessionPnlNow = 0;
        if (msg.result && typeof msg.result.hands_played === "number") {
          state.cumulativeHands += msg.result.hands_played;
        } else {
          state.cumulativeHands += state.sessionHands;
        }
        updateRealtimeStats();
        el.sessionPnl.textContent = `(이번 세션 ${fmtSignedWon(msg.session_pnl)} · ${msg.result.outcome})`;
        renderCumulative();
        setControlsForSessionEnd();
        break;

      case "error":
        showError(msg.message || "알 수 없는 오류");
        try { state.ws.close(); } catch (e) {}
        break;

      default:
        console.warn("unknown message", msg);
    }
  }

  // ───────── form submit / controls ─────────
  el.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (state.ws) {
      showError("실행 중에는 설정을 적용할 수 없습니다. 먼저 Stop 해주세요.");
      return;
    }
    clearError();
    applyConfig();
  });

  el.form.addEventListener("input", markConfigDirty);
  el.form.addEventListener("change", markConfigDirty);

  el.startBtn.addEventListener("click", () => {
    if (state.ws) {
      send("stop");
      el.startBtn.disabled = true;
      return;
    }
    startWs();
  });

  el.pauseBtn.addEventListener("click", () => {
    if (!state.ws || !state.sessionActive) return;
    if (state.paused) {
      send("resume");
      state.paused = false;
      setPauseButton("pause");
      setConnection("online");
    } else {
      send("pause");
      state.paused = true;
      setPauseButton("resume");
      setConnection("paused");
    }
  });
  el.nextBtn.addEventListener("click", () => {
    state.paused = false;
    state.sessionActive = false;
    send("next_session");
    setControlsForStarting();
  });

  el.togglePanel.addEventListener("click", () => {
    el.app.classList.add("panel-collapsed");
    el.showPanel.hidden = false;
    el.togglePanel.setAttribute("aria-expanded", "false");
    el.showPanel.setAttribute("aria-expanded", "false");
    requestAnimationFrame(() => el.showPanel.focus({ preventScroll: true }));
  });
  el.showPanel.addEventListener("click", () => {
    el.app.classList.remove("panel-collapsed");
    el.showPanel.hidden = true;
    el.togglePanel.setAttribute("aria-expanded", "true");
    el.showPanel.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => el.togglePanel.focus({ preventScroll: true }));
  });

  initNumberInputs();
  loadDefaults().catch((e) => showError(`기본 설정 로드 실패: ${e.message}`));

  // 버전 표시 — 단일 출처(pyproject.toml)에서 /api/version 으로 받아옴
  fetch("/api/version")
    .then((r) => r.json())
    .then((d) => {
      const v = document.getElementById("app-version");
      if (v && d && d.version) v.textContent = `v${d.version}`;
    })
    .catch(() => {});
})();

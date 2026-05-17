// bcc-sim web client — connects to /ws/play, renders the live dashboard.
(() => {
  "use strict";

  const RECENT_MAX = 12;
  const RED_SUITS = new Set(["H", "D"]);

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $("config-form"),
    startBtn: $("start-btn"),
    pauseBtn: $("pause-btn"),
    resumeBtn: $("resume-btn"),
    nextBtn: $("next-btn"),
    stopBtn: $("stop-btn"),
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
    cumWins: $("cum-wins"),
    cumRuins: $("cum-ruins"),
    cumSessions: $("cum-sessions"),
  };

  const state = {
    ws: null,
    config: null,       // banner config (initial/ruin/target ranges)
    cumulative: null,   // {sessions, wins, ruins, pnl}
    sessionPnlNow: 0,
    paused: false,
    running: false,
    sessionRecent: [],
    sessionHands: 0,
    sessionBets: 0,
    sessionStreak: 0,
    sessionStreakMax: 0,
    cumulativePrev: 0,  // pnl before current session for the detail line
  };

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
    el.conn.textContent = status;
    el.conn.className = `badge ${status}`;
  }
  function showError(msg) {
    el.errorBanner.textContent = msg;
    el.errorBanner.hidden = false;
  }
  function clearError() { el.errorBanner.hidden = true; el.errorBanner.textContent = ""; }

  function setControlsForRun() {
    el.startBtn.disabled = true;
    el.pauseBtn.disabled = false;
    el.resumeBtn.disabled = true;
    el.nextBtn.disabled = true;
    el.stopBtn.disabled = false;
  }
  function setControlsForIdle() {
    el.startBtn.disabled = false;
    el.pauseBtn.disabled = true;
    el.resumeBtn.disabled = true;
    el.nextBtn.disabled = true;
    el.stopBtn.disabled = true;
  }
  function setControlsForSessionEnd() {
    el.pauseBtn.disabled = true;
    el.resumeBtn.disabled = true;
    el.nextBtn.disabled = false;
    el.stopBtn.disabled = false;
  }

  function startWs() {
    clearError();
    const cfg = readConfig();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/play`);
    state.ws = ws;
    state.cumulative = null;
    state.cumulativePrev = 0;
    state.running = true;
    state.paused = false;

    ws.addEventListener("open", () => {
      setConnection("online");
      ws.send(JSON.stringify({ action: "start", config: cfg }));
      setControlsForRun();
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
      try { state.ws.close(); } catch (e) {}
    }
    startWs();
  });

  el.pauseBtn.addEventListener("click", () => {
    send("pause");
    state.paused = true;
    el.pauseBtn.disabled = true;
    el.resumeBtn.disabled = false;
    setConnection("paused");
  });
  el.resumeBtn.addEventListener("click", () => {
    send("resume");
    state.paused = false;
    el.pauseBtn.disabled = false;
    el.resumeBtn.disabled = true;
    setConnection("online");
  });
  el.nextBtn.addEventListener("click", () => {
    send("next_session");
    setControlsForRun();
  });
  el.stopBtn.addEventListener("click", () => {
    send("stop");
    el.stopBtn.disabled = true;
  });

  el.togglePanel.addEventListener("click", () => {
    el.app.classList.add("panel-collapsed");
    el.showPanel.hidden = false;
  });
  el.showPanel.addEventListener("click", () => {
    el.app.classList.remove("panel-collapsed");
    el.showPanel.hidden = true;
  });

  loadDefaults().catch((e) => showError(`기본 설정 로드 실패: ${e.message}`));
})();

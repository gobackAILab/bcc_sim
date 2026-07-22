import { useReducer, type FormEvent } from 'react'
import './App.css'
import { useSimulation } from './hooks/useSimulation'
import {
  DEFAULT_SESSION_CONFIG,
  type HandRecord,
  type SessionConfig,
} from './sim/types'
import { assertValidSessionConfig } from './sim/validation'

const RECENT_HAND_LIMIT = 12
const SECONDS_PER_HAND = 40
const RED_SUITS = new Set(['H', 'D'])
const wonFormatter = new Intl.NumberFormat('ko-KR')

interface UiState {
  panelCollapsed: boolean
  config: SessionConfig
  configDirty: boolean
  formError: string | null
}

type UiAction =
  | { type: 'collapsePanel'; collapsed: boolean }
  | { type: 'markConfigDirty' }
  | { type: 'applyConfig'; config: SessionConfig }
  | { type: 'setFormError'; message: string | null }

const initialUiState: UiState = {
  panelCollapsed: false,
  config: { ...DEFAULT_SESSION_CONFIG },
  configDirty: false,
  formError: null,
}

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'collapsePanel':
      return { ...state, panelCollapsed: action.collapsed }
    case 'markConfigDirty':
      return { ...state, configDirty: true, formError: null }
    case 'applyConfig':
      return {
        ...state,
        config: action.config,
        configDirty: false,
        formError: null,
      }
    case 'setFormError':
      return { ...state, formError: action.message }
  }
}

function formatWon(value: number): string {
  return `${wonFormatter.format(value)}원`
}

function formatSignedWon(value: number): string {
  if (value > 0) return `+${wonFormatter.format(value)}원`
  if (value < 0) return `${wonFormatter.format(value)}원`
  return '0원'
}

function formatRealTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0초'

  const seconds = Math.floor(totalSeconds)
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainder = seconds % 60
  const parts: string[] = []

  if (days > 0) parts.push(`${days}일`)
  if (hours > 0) parts.push(`${hours}시간`)
  if (minutes > 0 && days === 0) parts.push(`${minutes}분`)
  if (remainder > 0 && days === 0 && hours === 0) {
    parts.push(`${remainder}초`)
  }
  return parts.join(' ') || '0초'
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function resultFromBet(record: HandRecord): 'WIN' | 'LOSS' | 'TIE' {
  if (record.hand_outcome === 'TIE') return 'TIE'
  return record.hand_outcome === record.bet_side ? 'WIN' : 'LOSS'
}

function martinLabel(event: HandRecord['martin_event']): string {
  switch (event) {
    case 'start':
      return 'MARTIN START'
    case 'end_win':
      return 'MARTIN END · WIN'
    case 'end_giveup':
      return 'MARTIN END · 포기'
    case '':
      return ''
  }
}

function readConfig(form: HTMLFormElement): SessionConfig {
  const data = new FormData(form)

  const readText = (name: string): string => {
    const value = data.get(name)
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${name} 값을 입력해 주세요.`)
    }
    return value.trim()
  }

  const readInteger = (name: string): number => {
    const raw = readText(name)
    if (!/^-?\d+$/.test(raw)) {
      throw new Error(`${name} 은 정수여야 합니다.`)
    }
    const value = Number(raw)
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${name} 이 안전한 정수 범위를 벗어났습니다.`)
    }
    return value
  }

  const sideValue = readText('side')
  if (sideValue !== 'BANKER' && sideValue !== 'PLAYER') {
    throw new Error('기준 베팅은 banker 또는 player 여야 합니다.')
  }

  const strategyValue = readText('strategy_name')
  if (strategyValue !== 'flat' && strategyValue !== 'martingale') {
    throw new Error('지원하지 않는 베팅 전략입니다.')
  }

  let seed: bigint
  try {
    seed = BigInt(readText('seed'))
  } catch {
    throw new Error('seed 는 정수여야 합니다.')
  }

  const config: SessionConfig = {
    initial_won: readInteger('initial_won'),
    target_won: readInteger('target_won'),
    ruin_won: readInteger('ruin_won'),
    table_max_won: readInteger('table_max_won'),
    base_bet_won: readInteger('base_bet_won'),
    side: sideValue,
    strategy_name: strategyValue,
    martin_steps: readInteger('martin_steps'),
    pivot: data.has('pivot'),
    seed,
    n_decks: readInteger('n_decks'),
    cut_offset: readInteger('cut_offset'),
    hand_delay_ms: readInteger('hand_delay_ms'),
    auto_next: data.has('auto_next'),
  }

  assertValidSessionConfig(config)
  return config
}

function pnlClass(value: number): string {
  if (value > 0) return 'pnl-positive'
  if (value < 0) return 'pnl-negative'
  return 'pnl-zero'
}

function PlayingCards({
  cards,
  handNumber,
  side,
}: {
  cards: HandRecord['player']['cards']
  handNumber: number
  side: 'player' | 'banker'
}) {
  return (
    <span className="playing-cards">
      {cards.map((card, index) => (
        <span
          className={`playing-card ${RED_SUITS.has(card.suit) ? 'red' : ''}`}
          key={`${handNumber}-${side}-${index}-${card.rank}-${card.suit}`}
        >
          {card.label}
        </span>
      ))}
    </span>
  )
}

function App() {
  const [ui, dispatch] = useReducer(uiReducer, initialUiState)
  const simulation = useSimulation()
  const {
    status,
    activeConfig,
    currentHand,
    recentHands,
    sessionNum,
    sessionSeed,
    sessionHands,
    sessionBets,
    maxLossStreak,
    cumulative,
    lastSession,
    error,
    start,
    pause,
    resume,
    nextSession,
    stop,
  } = simulation

  const config = activeConfig ?? ui.config
  const isLive = status === 'running' || status === 'paused'
  const isRunOpen = isLive || status === 'waiting'
  const canEditConfig = status === 'idle' || status === 'error'
  const currentCapital = currentHand
    ? currentHand.capital_after
    : status === 'waiting' && lastSession
      ? lastSession.result.final_won
      : config.initial_won
  const sessionPnl = currentCapital - config.initial_won
  const displayedCumulativePnl = cumulative.pnl + (isLive ? sessionPnl : 0)
  const displayedCumulativeHands = cumulative.hands + (isLive ? sessionHands : 0)
  const gaugeSpan = Math.max(1, config.target_won - config.ruin_won)
  const gaugeFillPercent = clampPercent(
    ((currentCapital - config.ruin_won) / gaugeSpan) * 100,
  )
  const gaugeMarkerPercent = clampPercent(
    ((config.initial_won - config.ruin_won) / gaugeSpan) * 100,
  )
  const visibleError = ui.formError ?? error
  const latestHands = recentHands.slice(0, RECENT_HAND_LIMIT)

  const statusView = (() => {
    switch (status) {
      case 'idle':
        return { label: '대기', className: 'idle' }
      case 'running':
        return { label: '실행 중', className: 'running' }
      case 'paused':
        return { label: '일시정지', className: 'paused' }
      case 'waiting':
        return { label: '세션 완료', className: 'waiting' }
      case 'error':
        return { label: '오류', className: 'error' }
    }
  })()

  const handleConfigSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEditConfig) {
      dispatch({
        type: 'setFormError',
        message: '실행 중에는 설정을 적용할 수 없습니다. 먼저 Stop 해주세요.',
      })
      return
    }

    try {
      dispatch({ type: 'applyConfig', config: readConfig(event.currentTarget) })
    } catch (reason) {
      dispatch({
        type: 'setFormError',
        message: reason instanceof Error ? reason.message : '설정을 확인해 주세요.',
      })
    }
  }

  const handleStartStop = () => {
    if (isRunOpen) {
      stop()
      return
    }
    if (ui.configDirty) {
      dispatch({
        type: 'setFormError',
        message: '변경한 설정을 먼저 Apply 해주세요.',
      })
      return
    }
    dispatch({ type: 'setFormError', message: null })
    start(ui.config)
  }

  const handlePauseResume = () => {
    if (status === 'paused') {
      resume()
    } else if (status === 'running') {
      pause()
    }
  }

  return (
    <div className={`app-shell ${ui.panelCollapsed ? 'panel-collapsed' : ''}`}>
      <aside id="settings-panel" aria-label="시뮬레이션 설정">
        <header className="panel-header">
          <h2>⚙ 설정</h2>
          <button
            type="button"
            className="pixel-btn warning icon-btn"
            title="설정 패널 접기"
            aria-label="설정 패널 접기"
            aria-controls="settings-panel"
            aria-expanded={!ui.panelCollapsed}
            onClick={() => dispatch({ type: 'collapsePanel', collapsed: true })}
          >
            «
          </button>
        </header>

        <form
          id="config-form"
          onSubmit={handleConfigSubmit}
          onChange={() => dispatch({ type: 'markConfigDirty' })}
        >
          <fieldset className="form-group retro-box" disabled={!canEditConfig}>
            <legend>전략</legend>
            <label className="choice-label">
              <input
                type="radio"
                name="strategy_name"
                value="flat"
                defaultChecked={ui.config.strategy_name === 'flat'}
              />
              <span>flat</span>
            </label>
            <label className="choice-label">
              <input
                type="radio"
                name="strategy_name"
                value="martingale"
                defaultChecked={ui.config.strategy_name === 'martingale'}
              />
              <span>martingale</span>
            </label>
          </fieldset>

          <fieldset className="form-group retro-box" disabled={!canEditConfig}>
            <legend>기준 베팅</legend>
            <label className="choice-label">
              <input
                type="radio"
                name="side"
                value="BANKER"
                defaultChecked={ui.config.side === 'BANKER'}
              />
              <span>banker</span>
            </label>
            <label className="choice-label">
              <input
                type="radio"
                name="side"
                value="PLAYER"
                defaultChecked={ui.config.side === 'PLAYER'}
              />
              <span>player</span>
            </label>
          </fieldset>

          <fieldset className="form-group retro-box" disabled={!canEditConfig}>
            <legend>자본 (원)</legend>
            <label className="number-label">
              <span>initial</span>
              <input
                type="number"
                name="initial_won"
                min="1"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.initial_won}
              />
            </label>
            <label className="number-label">
              <span>target</span>
              <input
                type="number"
                name="target_won"
                min="1"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.target_won}
              />
            </label>
            <label className="number-label">
              <span>ruin</span>
              <input
                type="number"
                name="ruin_won"
                min="0"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.ruin_won}
              />
            </label>
          </fieldset>

          <fieldset className="form-group retro-box" disabled={!canEditConfig}>
            <legend>베팅 (원)</legend>
            <label className="number-label">
              <span>base-bet</span>
              <input
                type="number"
                name="base_bet_won"
                min="1"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.base_bet_won}
              />
            </label>
            <label className="number-label">
              <span>table-max</span>
              <input
                type="number"
                name="table_max_won"
                min="1"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.table_max_won}
              />
            </label>
          </fieldset>

          <fieldset className="form-group retro-box" disabled={!canEditConfig}>
            <legend>마틴게일</legend>
            <label className="number-label">
              <span>steps</span>
              <input
                type="number"
                name="martin_steps"
                min="1"
                max="20"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.martin_steps ?? 5}
              />
            </label>
            <label className="choice-label">
              <input
                type="checkbox"
                name="pivot"
                defaultChecked={ui.config.pivot}
              />
              <span>pivot</span>
            </label>
          </fieldset>

          <fieldset className="form-group retro-box" disabled={!canEditConfig}>
            <legend>슈</legend>
            <label className="number-label">
              <span>decks</span>
              <input
                type="number"
                name="n_decks"
                min="1"
                max="16"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.n_decks}
              />
            </label>
            <label className="number-label">
              <span>cut-offset</span>
              <input
                type="number"
                name="cut_offset"
                min="0"
                max="200"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.cut_offset}
              />
            </label>
          </fieldset>

          <fieldset className="form-group retro-box" disabled={!canEditConfig}>
            <legend>진행</legend>
            <label className="number-label">
              <span>delay (ms)</span>
              <input
                type="number"
                name="hand_delay_ms"
                min="0"
                max="5000"
                step="50"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.hand_delay_ms}
              />
            </label>
            <label className="choice-label">
              <input
                type="checkbox"
                name="auto_next"
                defaultChecked={ui.config.auto_next}
              />
              <span>auto next</span>
            </label>
            <label className="number-label">
              <span>seed</span>
              <input
                type="number"
                name="seed"
                required
                inputMode="numeric"
                autoComplete="off"
                defaultValue={ui.config.seed.toString()}
              />
            </label>
          </fieldset>

          <div className="settings-actions">
            <button
              type="submit"
              id="apply-btn"
              className={`pixel-btn ${ui.configDirty ? 'warning' : 'primary'}`}
              disabled={!canEditConfig}
            >
              Apply{ui.configDirty ? ' *' : ''}
            </button>
          </div>
        </form>
      </aside>

      <main id="dashboard">
        <header className="dashboard-header">
          {ui.panelCollapsed && (
            <button
              type="button"
              id="show-panel"
              className="pixel-btn warning icon-btn"
              title="설정 패널 열기"
              aria-label="설정 패널 열기"
              aria-controls="settings-panel"
              aria-expanded={false}
              onClick={() =>
                dispatch({ type: 'collapsePanel', collapsed: false })
              }
            >
              »
            </button>
          )}
          <div className="dashboard-title">
            <span className="eyebrow">BCC-SIM</span>
            <h1>바카라 마틴게일 시뮬레이터</h1>
          </div>
          <span className="app-version" title="정적 웹 버전">
            v{__APP_VERSION__} · STATIC
          </span>
          <span
            id="connection"
            className={`status-badge ${statusView.className}`}
            role="status"
            aria-live="polite"
          >
            {statusView.label}
          </span>
        </header>

        <section className="panel-card" id="capital-section">
          <h2>자본</h2>
          <div className="data-row big-row">
            <span className="data-label">현재 자본</span>
            <strong className="data-value mono capital-value">
              {formatWon(currentCapital)}
            </strong>
            <span className={`muted mono ${pnlClass(sessionPnl)}`}>
              (이번 세션 {formatSignedWon(sessionPnl)}
              {status === 'waiting' && lastSession
                ? ` · ${lastSession.result.outcome}`
                : ''}
              )
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">누적 손익</span>
            <strong
              className={`data-value mono ${pnlClass(displayedCumulativePnl)}`}
            >
              {formatSignedWon(displayedCumulativePnl)}
            </strong>
            <span className="muted mono">
              {cumulative.sessions > 0
                ? `(완료 ${cumulative.sessions}세션 ${formatSignedWon(cumulative.pnl)})`
                : '(완료된 세션 없음)'}
            </span>
          </div>
        </section>

        <section className="panel-card" id="gauge-section">
          <h2>자본 게이지</h2>
          <div
            id="gauge-bar"
            role="progressbar"
            aria-label="현재 자본"
            aria-valuemin={config.ruin_won}
            aria-valuemax={config.target_won}
            aria-valuenow={currentCapital}
          >
            <div
              id="gauge-fill"
              className={currentCapital < config.initial_won ? 'below' : ''}
              style={{ width: `${gaugeFillPercent}%` }}
            />
            <div
              id="gauge-marker"
              title="시작 자본"
              style={{ left: `${gaugeMarkerPercent}%` }}
            />
          </div>
          <div id="gauge-labels">
            <span>
              ruin <em>{formatWon(config.ruin_won)}</em>
            </span>
            <span className="gauge-center">
              initial <em>{formatWon(config.initial_won)}</em>
            </span>
            <span className="gauge-right">
              target <em>{formatWon(config.target_won)}</em>
            </span>
          </div>
        </section>

        <section className="panel-card" id="current-hand" aria-live="polite">
          <h2>현재 핸드</h2>
          <div className="data-row hand-title-row">
            <span>
              핸드 <strong>{currentHand ? `#${currentHand.hand_num}` : '—'}</strong>
            </span>
            {currentHand?.martin_event && (
              <span className={`martin-tag ${currentHand.martin_event}`}>
                {martinLabel(currentHand.martin_event)}
              </span>
            )}
          </div>
          <div className="data-row">
            <span className="data-label">베팅</span>
            <strong
              className={`data-value side-label ${
                currentHand?.bet_side === 'BANKER' ? 'banker' : 'player'
              }`}
            >
              {currentHand?.bet_side ?? '—'}
            </strong>
            <span className="data-value mono">
              {currentHand ? formatWon(currentHand.bet_won) : '—'}
            </span>
          </div>
          <div className="data-row cards-row">
            <span className="data-label side-label player">Player</span>
            {currentHand ? (
              <PlayingCards
                cards={currentHand.player.cards}
                handNumber={currentHand.hand_num}
                side="player"
              />
            ) : (
              <span className="empty-cards" aria-hidden="true">—</span>
            )}
            <span className="card-total mono">
              = <strong>{currentHand?.player.total ?? '—'}</strong>
            </span>
          </div>
          <div className="data-row cards-row">
            <span className="data-label side-label banker">Banker</span>
            {currentHand ? (
              <PlayingCards
                cards={currentHand.banker.cards}
                handNumber={currentHand.hand_num}
                side="banker"
              />
            ) : (
              <span className="empty-cards" aria-hidden="true">—</span>
            )}
            <span className="card-total mono">
              = <strong>{currentHand?.banker.total ?? '—'}</strong>
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">결과</span>
            {currentHand ? (
              <>
                <strong
                  className={`data-value outcome-${resultFromBet(currentHand).toLowerCase()}`}
                >
                  {resultFromBet(currentHand)} ({currentHand.hand_outcome})
                </strong>
                <span
                  className={`data-value mono ${pnlClass(currentHand.capital_delta)}`}
                >
                  Δ {formatSignedWon(currentHand.capital_delta)}
                </span>
              </>
            ) : (
              <span className="data-value">—</span>
            )}
          </div>
        </section>

        <section className="panel-card" id="session-stats">
          <h2>통계</h2>
          <div className="data-row">
            <span className="data-label">세션</span>
            <strong className="data-value">
              {sessionNum === null ? '—' : `#${sessionNum}`}
            </strong>
            <span className="muted">
              시드 <span className="mono">{sessionSeed === null ? '—' : String(sessionSeed)}</span>
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">진행</span>
            <span className="data-value mono">
              핸드 {sessionHands} · 베팅 {sessionBets} · 최장연패 {maxLossStreak}
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">체감</span>
            <span className="data-value mono" title="한 핸드 = 40초로 환산">
              {formatRealTime(sessionHands * SECONDS_PER_HAND)}
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">누계</span>
            <span className="data-value mono">
              승 {cumulative.wins} · 파산 {cumulative.ruins} · 진행{' '}
              {cumulative.sessions}
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">누계체감</span>
            <span className="data-value mono" title="누적 핸드 × 40초">
              {formatRealTime(displayedCumulativeHands * SECONDS_PER_HAND)}
            </span>
          </div>
        </section>

        <section className="panel-card" id="recent-section">
          <h2>최근 핸드</h2>
          <ol id="recent-list" className="mono" aria-label="최근 12핸드">
            {latestHands.length === 0 ? (
              <li className="recent-empty">아직 실행된 핸드가 없습니다.</li>
            ) : (
              latestHands.map((record) => {
                const result = resultFromBet(record)
                return (
                  <li key={record.hand_num}>
                    <span className="recent-hand">#{record.hand_num}</span>
                    <span className="recent-bet">
                      {record.bet_side === 'BANKER' ? 'B' : 'P'}{' '}
                      {formatWon(record.bet_won)}
                    </span>
                    <strong className={`outcome-${result.toLowerCase()}`}>
                      {result}
                    </strong>
                    <span className={pnlClass(record.capital_delta)}>
                      {formatSignedWon(record.capital_delta)}
                    </span>
                    <span className="muted recent-event">
                      {record.martin_event ? `← ${martinLabel(record.martin_event)}` : ''}
                    </span>
                  </li>
                )
              })
            )}
          </ol>
        </section>

        {visibleError && (
          <div id="error-banner" role="alert">
            {visibleError}
          </div>
        )}

        <section className="controls-bar" id="controls" aria-label="시뮬레이터 컨트롤">
          <h2>컨트롤</h2>
          <div className="control-buttons">
            <button
              type="button"
              id="start-btn"
              className={`pixel-btn ${isRunOpen ? 'danger' : 'success'}`}
              onClick={handleStartStop}
            >
              {isRunOpen ? '⏹ Stop' : '▶ Start'}
            </button>
            <button
              type="button"
              id="pause-btn"
              className={`pixel-btn ${status === 'paused' ? 'primary' : 'warning'}`}
              disabled={status !== 'running' && status !== 'paused'}
              onClick={handlePauseResume}
            >
              {status === 'paused' ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              type="button"
              id="next-btn"
              className="pixel-btn success"
              disabled={status !== 'waiting'}
              onClick={nextSession}
            >
              ⏭ Next
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

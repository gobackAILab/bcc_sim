import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { HandRecord, SessionConfig, SessionResult } from '../sim/types'
import SimulatorWorker from '../worker/simulator.worker?worker'
import type {
  CumulativeStats,
  WorkerCommand,
  WorkerEvent,
} from '../worker/protocol'

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'waiting' | 'error'

export interface LastSession {
  result: SessionResult
  session_pnl: number
}

interface SimulationState {
  status: SimulationStatus
  activeConfig: SessionConfig | null
  currentHand: HandRecord | null
  recentHands: HandRecord[]
  sessionNum: number | null
  sessionSeed: bigint | null
  sessionHands: number
  sessionBets: number
  currentLossStreak: number
  maxLossStreak: number
  cumulative: CumulativeStats
  lastSession: LastSession | null
  error: string | null
}

type Action =
  | { type: 'start'; config: SessionConfig }
  | { type: 'worker_event'; event: WorkerEvent }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next_session' }
  | { type: 'stop' }

const EMPTY_CUMULATIVE: CumulativeStats = {
  sessions: 0,
  wins: 0,
  ruins: 0,
  pnl: 0,
  hands: 0,
}

const INITIAL_STATE: SimulationState = {
  status: 'idle',
  activeConfig: null,
  currentHand: null,
  recentHands: [],
  sessionNum: null,
  sessionSeed: null,
  sessionHands: 0,
  sessionBets: 0,
  currentLossStreak: 0,
  maxLossStreak: 0,
  cumulative: EMPTY_CUMULATIVE,
  lastSession: null,
  error: null,
}

function isBetWin(record: HandRecord): boolean {
  return record.hand_outcome === record.bet_side
}

function reduceWorkerEvent(state: SimulationState, event: WorkerEvent): SimulationState {
  switch (event.type) {
    case 'banner':
      return { ...state, activeConfig: event.config, status: 'running' }
    case 'session_start':
      return {
        ...state,
        status: 'running',
        activeConfig: event.config,
        currentHand: null,
        recentHands: [],
        sessionNum: event.session_num,
        sessionSeed: event.seed,
        sessionHands: 0,
        sessionBets: 0,
        currentLossStreak: 0,
        maxLossStreak: 0,
        lastSession: null,
      }
    case 'hand': {
      const isTie = event.record.hand_outcome === 'TIE'
      const currentLossStreak = isTie
        ? state.currentLossStreak
        : isBetWin(event.record)
          ? 0
          : state.currentLossStreak + 1
      return {
        ...state,
        currentHand: event.record,
        recentHands: [event.record, ...state.recentHands].slice(0, 12),
        sessionHands: event.record.hand_num,
        sessionBets: state.sessionBets + (isTie ? 0 : 1),
        currentLossStreak,
        maxLossStreak: Math.max(state.maxLossStreak, currentLossStreak),
      }
    }
    case 'session_end':
      return {
        ...state,
        status: state.activeConfig?.auto_next ? 'running' : 'waiting',
        cumulative: event.cumulative,
        sessionHands: event.result.hands_played,
        sessionBets: event.result.bets_placed,
        maxLossStreak: event.result.max_loss_streak,
        lastSession: { result: event.result, session_pnl: event.session_pnl },
      }
    case 'stopped':
      return { ...state, status: 'idle' }
    case 'error':
      return { ...state, status: 'error', error: event.message }
  }
}

function reducer(state: SimulationState, action: Action): SimulationState {
  switch (action.type) {
    case 'start':
      return {
        ...INITIAL_STATE,
        status: 'running',
        activeConfig: action.config,
        cumulative: { ...EMPTY_CUMULATIVE },
      }
    case 'worker_event':
      return reduceWorkerEvent(state, action.event)
    case 'pause':
      return { ...state, status: 'paused' }
    case 'resume':
    case 'next_session':
      return { ...state, status: 'running' }
    case 'stop':
      return { ...state, status: 'idle' }
  }
}

export function useSimulation() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const worker = new SimulatorWorker()
    workerRef.current = worker
    const receive = (event: MessageEvent<WorkerEvent>) => {
      dispatch({ type: 'worker_event', event: event.data })
    }
    const receiveError = (event: ErrorEvent) => {
      dispatch({
        type: 'worker_event',
        event: {
          type: 'error',
          message: event.message || '시뮬레이션 Worker에서 예기치 않은 오류가 발생했습니다.',
        },
      })
    }
    const receiveMessageError = () => {
      dispatch({
        type: 'worker_event',
        event: { type: 'error', message: 'Worker 메시지를 해석하지 못했습니다.' },
      })
    }
    worker.addEventListener('message', receive)
    worker.addEventListener('error', receiveError)
    worker.addEventListener('messageerror', receiveMessageError)
    return () => {
      worker.removeEventListener('message', receive)
      worker.removeEventListener('error', receiveError)
      worker.removeEventListener('messageerror', receiveMessageError)
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const post = useCallback((command: WorkerCommand) => {
    workerRef.current?.postMessage(command)
  }, [])

  const start = useCallback((config: SessionConfig) => {
    dispatch({ type: 'start', config })
    post({ type: 'start', config })
  }, [post])

  const pause = useCallback(() => {
    dispatch({ type: 'pause' })
    post({ type: 'pause' })
  }, [post])

  const resume = useCallback(() => {
    dispatch({ type: 'resume' })
    post({ type: 'resume' })
  }, [post])

  const nextSession = useCallback(() => {
    dispatch({ type: 'next_session' })
    post({ type: 'next_session' })
  }, [post])

  const stop = useCallback(() => {
    dispatch({ type: 'stop' })
    post({ type: 'stop' })
  }, [post])

  return { ...state, start, pause, resume, nextSession, stop }
}

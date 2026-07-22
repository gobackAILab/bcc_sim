import type { HandRecord, SessionConfig, SessionResult } from '../sim/types'

export type WorkerCommand =
  | { type: 'start'; config: SessionConfig }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next_session' }
  | { type: 'stop' }

export interface CumulativeStats {
  sessions: number
  wins: number
  ruins: number
  pnl: number
  hands: number
}

export type WorkerEvent =
  | {
      type: 'banner'
      config: SessionConfig
      hand_delay_ms: number
      auto_next: boolean
    }
  | {
      type: 'session_start'
      session_num: number
      seed: bigint
      config: SessionConfig
    }
  | { type: 'hand'; record: HandRecord }
  | {
      type: 'session_end'
      result: SessionResult
      session_pnl: number
      cumulative: CumulativeStats
    }
  | { type: 'stopped' }
  | { type: 'error'; message: string }

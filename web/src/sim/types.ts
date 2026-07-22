export const Outcome = {
  PLAYER: "PLAYER",
  BANKER: "BANKER",
  TIE: "TIE",
} as const

export type Outcome = (typeof Outcome)[keyof typeof Outcome]
export type BetSide = Exclude<Outcome, typeof Outcome.TIE>
export type StrategyName = "flat" | "martingale"
export type SessionOutcome = "WIN" | "RUIN"
export type RuinReason =
  | "capital_depleted"
  | "bet_exceeds_capital"
  | "bet_exceeds_table_max"
  | "both"
export type MartinEvent = "" | "start" | "end_win" | "end_giveup"
export type Suit = "S" | "H" | "D" | "C"

export interface Card {
  rank: number
  suit: Suit
  label: string
  value: number
}

export interface HandSide {
  cards: readonly Card[]
  total: number
}

export interface HandResult {
  outcome: Outcome
  player: HandSide
  banker: HandSide
}

/**
 * Core simulation settings plus the two browser playback settings used by the
 * static application. Money remains a number so the UI can format it directly;
 * validation guarantees every money value is a safe integer.
 */
export interface SessionConfig {
  initial_won: number
  target_won: number
  ruin_won: number
  table_max_won: number
  base_bet_won: number
  side: BetSide
  strategy_name: StrategyName
  martin_steps: number | null
  pivot: boolean
  seed: bigint
  n_decks: number
  cut_offset: number
  hand_delay_ms: number
  auto_next: boolean
}

export interface HandRecord {
  hand_num: number
  bet_side: BetSide
  bet_won: number
  hand_outcome: Outcome
  player: HandSide
  banker: HandSide
  capital_delta: number
  capital_after: number
  cycle_loss_count: number
  martin_event: MartinEvent
}

export interface SessionResult {
  outcome: SessionOutcome
  final_won: number
  hands_played: number
  bets_placed: number
  total_wagered_won: number
  max_loss_streak: number
  ruin_reason: RuinReason | null
}

export interface SessionStep {
  /** Present when this call played a hand. */
  record: HandRecord | null
  /** Present when the session is terminal after this call. */
  result: SessionResult | null
}

export interface SessionTrace {
  result: SessionResult
  history: readonly HandRecord[]
}

export const DEFAULT_CONFIG: Readonly<SessionConfig> = {
  initial_won: 100_000,
  target_won: 500_000,
  ruin_won: 50_000,
  table_max_won: 100_000,
  base_bet_won: 1_000,
  side: Outcome.BANKER,
  strategy_name: "martingale",
  martin_steps: 5,
  pivot: true,
  seed: 42n,
  n_decks: 8,
  cut_offset: 14,
  hand_delay_ms: 50,
  auto_next: false,
}

/** Descriptive alias retained for callers that prefer the longer name. */
export const DEFAULT_SESSION_CONFIG = DEFAULT_CONFIG

import { playHand, Shoe } from "./baccarat"
import { PythonRandom } from "./pythonRandom"
import { createStrategy, payoutWon, UnsafeBetError } from "./strategy"
import { Outcome } from "./types"
import type {
  HandRecord,
  HandResult,
  MartinEvent,
  RuinReason,
  SessionConfig,
  SessionResult,
  SessionStep,
  SessionTrace,
} from "./types"
import { addSafeIntegers, assertSafeInteger, assertValidSessionConfig } from "./validation"

/** Stateful, one-hand-at-a-time equivalent of Python's run_session_traced. */
export class SessionStepper {
  readonly config: Readonly<SessionConfig>

  private readonly strategy
  private readonly shoe: Shoe | null
  private readonly handIterator: Iterator<HandResult> | null

  private capital: number
  private handsPlayed = 0
  private betsPlaced = 0
  private totalWagered = 0
  private currentLossStreak = 0
  private maxLossStreak = 0
  private terminalResult: SessionResult | null = null

  constructor(config: SessionConfig, hands?: Iterable<HandResult>) {
    assertValidSessionConfig(config)
    this.config = { ...config }
    this.strategy = createStrategy(config)
    this.capital = config.initial_won

    if (hands === undefined) {
      this.shoe = new Shoe(config.n_decks, config.cut_offset, new PythonRandom(config.seed))
      this.handIterator = null
    } else {
      this.shoe = null
      this.handIterator = hands[Symbol.iterator]()
    }
  }

  get done(): boolean {
    return this.terminalResult !== null
  }

  get result(): SessionResult | null {
    return this.terminalResult
  }

  get currentCapital(): number {
    return this.capital
  }

  step(): SessionStep {
    if (this.terminalResult !== null) {
      return { record: null, result: this.terminalResult }
    }

    const preHandResult = this.finishFromCapitalBoundary()
    if (preHandResult !== null) {
      return { record: null, result: preHandResult }
    }

    let intended: number
    try {
      intended = this.strategy.nextBet()
    } catch (error) {
      if (error instanceof UnsafeBetError) {
        return { record: null, result: this.finishRuin("both") }
      }
      throw error
    }

    const overCapital = intended > this.capital
    const overTableMax = intended > this.config.table_max_won
    if (overCapital || overTableMax) {
      const reason: RuinReason =
        overCapital && overTableMax
          ? "both"
          : overCapital
            ? "bet_exceeds_capital"
            : "bet_exceeds_table_max"
      return { record: null, result: this.finishRuin(reason) }
    }

    const hand = this.nextHand()
    const betSide = this.strategy.side
    const lossesBefore = this.strategy.lossesInARow
    const delta = payoutWon(betSide, intended, hand.outcome)

    this.capital = addSafeIntegers(this.capital, delta, "capital")
    this.strategy.update(hand.outcome)
    const lossesAfter = this.strategy.lossesInARow
    this.handsPlayed = incrementSafe(this.handsPlayed, "hands_played")

    let martinEvent: MartinEvent = ""
    if (lossesBefore === 0 && lossesAfter > 0) {
      martinEvent = "start"
    } else if (lossesBefore > 0 && lossesAfter === 0) {
      martinEvent = hand.outcome === betSide ? "end_win" : "end_giveup"
    }

    const record: HandRecord = {
      hand_num: this.handsPlayed,
      bet_side: betSide,
      bet_won: intended,
      hand_outcome: hand.outcome,
      player: hand.player,
      banker: hand.banker,
      capital_delta: delta,
      capital_after: this.capital,
      cycle_loss_count: lossesBefore,
      martin_event: martinEvent,
    }

    if (hand.outcome !== Outcome.TIE) {
      this.betsPlaced = incrementSafe(this.betsPlaced, "bets_placed")
      this.totalWagered = addSafeIntegers(
        this.totalWagered,
        intended,
        "total_wagered_won",
      )
      if (hand.outcome === betSide) {
        this.currentLossStreak = 0
      } else {
        this.currentLossStreak = incrementSafe(
          this.currentLossStreak,
          "current loss streak",
        )
        this.maxLossStreak = Math.max(this.maxLossStreak, this.currentLossStreak)
      }
    }

    return { record, result: this.finishFromCapitalBoundary() }
  }

  private nextHand(): HandResult {
    if (this.handIterator !== null) {
      const next = this.handIterator.next()
      if (next.done) {
        throw new Error("hand source exhausted before session terminated")
      }
      return next.value
    }

    if (this.shoe === null) {
      throw new Error("session has no hand source")
    }
    this.shoe.maybeReshuffle()
    return playHand(this.shoe)
  }

  private finishFromCapitalBoundary(): SessionResult | null {
    if (this.capital >= this.config.target_won) {
      return this.finish("WIN", null)
    }
    if (this.capital <= this.config.ruin_won) {
      return this.finishRuin("capital_depleted")
    }
    return null
  }

  private finishRuin(reason: RuinReason): SessionResult {
    return this.finish("RUIN", reason)
  }

  private finish(
    outcome: SessionResult["outcome"],
    ruinReason: RuinReason | null,
  ): SessionResult {
    const result: SessionResult = {
      outcome,
      final_won: this.capital,
      hands_played: this.handsPlayed,
      bets_placed: this.betsPlaced,
      total_wagered_won: this.totalWagered,
      max_loss_streak: this.maxLossStreak,
      ruin_reason: ruinReason,
    }
    this.terminalResult = result
    return result
  }
}

export function runSessionTraced(
  config: SessionConfig,
  hands?: Iterable<HandResult>,
): SessionTrace {
  const stepper = new SessionStepper(config, hands)
  const history: HandRecord[] = []

  while (!stepper.done) {
    const step = stepper.step()
    if (step.record !== null) {
      history.push(step.record)
    }
  }

  const result = stepper.result
  if (result === null) {
    throw new Error("session ended without a result")
  }
  return { result, history }
}

export function runSession(config: SessionConfig, hands?: Iterable<HandResult>): SessionResult {
  return runSessionTraced(config, hands).result
}

function incrementSafe(value: number, label: string): number {
  const incremented = value + 1
  assertSafeInteger(incremented, label)
  return incremented
}

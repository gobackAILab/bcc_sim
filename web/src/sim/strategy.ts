import { Outcome } from "./types"
import type { BetSide, Outcome as HandOutcome, SessionConfig } from "./types"
import { assertPositiveSafeInteger } from "./validation"

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

function assertBetSide(side: HandOutcome, label: string): asserts side is BetSide {
  if (side !== Outcome.PLAYER && side !== Outcome.BANKER) {
    throw new RangeError(`${label} must be PLAYER or BANKER`)
  }
}

export class UnsafeBetError extends RangeError {
  constructor() {
    super("next bet exceeds Number.MAX_SAFE_INTEGER")
    this.name = "UnsafeBetError"
  }
}

export interface Strategy {
  readonly side: BetSide
  readonly lossesInARow: number
  nextBet(): number
  update(handOutcome: HandOutcome): void
}

export class FlatBet implements Strategy {
  readonly baseWon: number
  readonly side: BetSide
  readonly lossesInARow = 0

  constructor(baseWon: number, side: BetSide) {
    assertPositiveSafeInteger(baseWon, "baseWon")
    assertBetSide(side, "side")
    this.baseWon = baseWon
    this.side = side
  }

  nextBet(): number {
    return this.baseWon
  }

  update(_handOutcome: HandOutcome): void {
    // Flat betting has no state to update.
  }
}

export class Martingale implements Strategy {
  readonly baseWon: number
  readonly primarySide: BetSide
  readonly pivotSide: BetSide
  readonly martinSteps: number | null
  readonly pivotEnabled: boolean

  private lossCount = 0
  private currentSide: BetSide

  constructor(
    baseWon: number,
    primarySide: BetSide,
    martinSteps: number | null = null,
    pivot = true,
  ) {
    assertPositiveSafeInteger(baseWon, "baseWon")
    assertBetSide(primarySide, "primarySide")
    if (martinSteps !== null) {
      assertPositiveSafeInteger(martinSteps, "martinSteps")
    }

    this.baseWon = baseWon
    this.primarySide = primarySide
    this.pivotSide = primarySide === Outcome.BANKER ? Outcome.PLAYER : Outcome.BANKER
    this.martinSteps = martinSteps
    this.pivotEnabled = pivot
    this.currentSide = primarySide
  }

  get side(): BetSide {
    return this.currentSide
  }

  get lossesInARow(): number {
    return this.lossCount
  }

  nextBet(): number {
    const amount = BigInt(this.baseWon) << BigInt(this.lossCount)
    if (amount > MAX_SAFE_INTEGER_BIGINT) {
      throw new UnsafeBetError()
    }
    return Number(amount)
  }

  update(handOutcome: HandOutcome): void {
    if (handOutcome === Outcome.TIE) {
      return
    }
    if (handOutcome === this.currentSide) {
      this.reset()
      return
    }

    this.lossCount += 1
    if (this.martinSteps !== null && this.lossCount > this.martinSteps) {
      this.reset()
      return
    }
    if (this.pivotEnabled) {
      this.currentSide = this.pivotSide
    }
  }

  private reset(): void {
    this.lossCount = 0
    this.currentSide = this.primarySide
  }
}

/** Return the capital delta for a non-Tie side bet. */
export function payoutWon(side: BetSide, betWon: number, handOutcome: HandOutcome): number {
  assertBetSide(side, "side")
  assertPositiveSafeInteger(betWon, "betWon")

  if (handOutcome === Outcome.TIE) {
    return 0
  }
  if (handOutcome !== side) {
    return -betWon
  }
  if (side === Outcome.BANKER) {
    return Number((BigInt(betWon) * 95n) / 100n)
  }
  return betWon
}

export function createStrategy(
  config: Pick<SessionConfig, "strategy_name" | "base_bet_won" | "side" | "martin_steps" | "pivot">,
): Strategy {
  if (config.strategy_name === "flat") {
    return new FlatBet(config.base_bet_won, config.side)
  }
  if (config.strategy_name === "martingale") {
    return new Martingale(
      config.base_bet_won,
      config.side,
      config.martin_steps,
      config.pivot,
    )
  }
  throw new RangeError(`unknown strategy: ${String(config.strategy_name)}`)
}

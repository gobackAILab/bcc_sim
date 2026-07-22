import { describe, expect, it } from "vitest"

import { FlatBet, Martingale, payoutWon, UnsafeBetError } from "./strategy"

describe("flat betting", () => {
  it("keeps its amount and side after every outcome", () => {
    const strategy = new FlatBet(1_000, "BANKER")
    for (const outcome of ["PLAYER", "BANKER", "TIE"] as const) {
      strategy.update(outcome)
      expect(strategy.nextBet()).toBe(1_000)
      expect(strategy.side).toBe("BANKER")
    }
  })
})

describe("martingale", () => {
  it("doubles on classic losses, preserves a Tie, and resets on a win", () => {
    const strategy = new Martingale(1_000, "BANKER", null, false)
    expect(strategy.nextBet()).toBe(1_000)
    strategy.update("PLAYER")
    expect(strategy.nextBet()).toBe(2_000)
    strategy.update("TIE")
    expect(strategy.nextBet()).toBe(2_000)
    strategy.update("PLAYER")
    expect(strategy.nextBet()).toBe(4_000)
    strategy.update("BANKER")
    expect(strategy.nextBet()).toBe(1_000)
  })

  it("pivots after the primary loss and returns after a pivot win", () => {
    const strategy = new Martingale(1_000, "BANKER", 5, true)
    strategy.update("PLAYER")
    expect([strategy.side, strategy.nextBet()]).toEqual(["PLAYER", 2_000])
    strategy.update("BANKER")
    expect([strategy.side, strategy.nextBet()]).toEqual(["PLAYER", 4_000])
    strategy.update("PLAYER")
    expect([strategy.side, strategy.nextBet()]).toEqual(["BANKER", 1_000])
  })

  it("gives up after martin_steps + 1 total losses", () => {
    const strategy = new Martingale(1_000, "BANKER", 5, true)
    const outcomes = ["PLAYER", "BANKER", "BANKER", "BANKER", "BANKER", "BANKER"] as const
    const bets = outcomes.map((outcome) => {
      const bet = strategy.nextBet()
      strategy.update(outcome)
      return bet
    })
    expect(bets).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000])
    expect([strategy.side, strategy.nextBet()]).toEqual(["BANKER", 1_000])
  })

  it("refuses to expose an imprecise doubled amount", () => {
    const strategy = new Martingale(Number.MAX_SAFE_INTEGER, "BANKER", null, false)
    strategy.update("PLAYER")
    expect(() => strategy.nextBet()).toThrow(UnsafeBetError)
  })
})

describe("payout", () => {
  it("pays Player 1:1, Banker 95% floored, loss negative, and Tie zero", () => {
    expect(payoutWon("PLAYER", 1_000, "PLAYER")).toBe(1_000)
    expect(payoutWon("BANKER", 1_000, "BANKER")).toBe(950)
    expect(payoutWon("BANKER", 33, "BANKER")).toBe(31)
    expect(payoutWon("BANKER", 1_000, "PLAYER")).toBe(-1_000)
    expect(payoutWon("PLAYER", 1_000, "TIE")).toBe(0)
  })
})

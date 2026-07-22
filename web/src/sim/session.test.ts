import { describe, expect, it } from "vitest"

import { SessionStepper, runSession, runSessionTraced } from "./session"
import { DEFAULT_CONFIG } from "./types"
import type { HandResult, Outcome, SessionConfig } from "./types"

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

function hand(outcome: Outcome): HandResult {
  return {
    outcome,
    player: { cards: [], total: outcome === "PLAYER" ? 9 : 0 },
    banker: { cards: [], total: outcome === "BANKER" ? 9 : 0 },
  }
}

describe("SessionStepper", () => {
  it("returns the final hand record and terminal result together", () => {
    const stepper = new SessionStepper(
      config({
        initial_won: 100_000,
        target_won: 100_500,
        ruin_won: 0,
        strategy_name: "flat",
      }),
      [hand("BANKER")],
    )
    const step = stepper.step()
    expect(step.record?.capital_delta).toBe(950)
    expect(step.result?.outcome).toBe("WIN")
    expect(stepper.done).toBe(true)
    expect(stepper.step()).toEqual({ record: null, result: step.result })
  })

  it("preserves martingale state and excludes Tie from wager counters", () => {
    const trace = runSessionTraced(
      config({
        initial_won: 10_000,
        target_won: 10_900,
        ruin_won: 0,
        table_max_won: 10_000,
        strategy_name: "martingale",
        martin_steps: null,
        pivot: false,
      }),
      [hand("PLAYER"), hand("TIE"), hand("BANKER")],
    )
    expect(trace.history.map(({ bet_won }) => bet_won)).toEqual([1_000, 2_000, 2_000])
    expect(trace.history.map(({ cycle_loss_count }) => cycle_loss_count)).toEqual([0, 1, 1])
    expect(trace.result).toMatchObject({
      outcome: "WIN",
      final_won: 10_900,
      hands_played: 3,
      bets_placed: 2,
      total_wagered_won: 3_000,
      max_loss_streak: 1,
    })
  })

  it("reports capital_depleted", () => {
    const result = runSession(
      config({
        initial_won: 1_000,
        target_won: 2_000,
        ruin_won: 0,
        table_max_won: 1_000,
        strategy_name: "flat",
      }),
      [hand("PLAYER")],
    )
    expect(result.ruin_reason).toBe("capital_depleted")
  })

  it("reports bet_exceeds_capital", () => {
    const result = runSession(
      config({
        initial_won: 5_000,
        target_won: 10_000,
        ruin_won: 0,
        table_max_won: 10_000,
        strategy_name: "martingale",
        martin_steps: null,
        pivot: false,
      }),
      [hand("PLAYER"), hand("PLAYER")],
    )
    expect(result).toMatchObject({
      final_won: 2_000,
      hands_played: 2,
      ruin_reason: "bet_exceeds_capital",
    })
  })

  it("reports bet_exceeds_table_max", () => {
    const result = runSession(
      config({
        initial_won: 10_000,
        target_won: 20_000,
        ruin_won: 0,
        table_max_won: 1_500,
        strategy_name: "martingale",
        martin_steps: null,
        pivot: false,
      }),
      [hand("PLAYER")],
    )
    expect(result.ruin_reason).toBe("bet_exceeds_table_max")
  })

  it("reports both when the next bet exceeds capital and table maximum", () => {
    const result = runSession(
      config({
        initial_won: 2_500,
        target_won: 10_000,
        ruin_won: 0,
        table_max_won: 1_500,
        strategy_name: "martingale",
        martin_steps: null,
        pivot: false,
      }),
      [hand("PLAYER")],
    )
    expect(result.ruin_reason).toBe("both")
  })

  it("throws when an injected hand source ends before the session", () => {
    const stepper = new SessionStepper(config(), [])
    expect(() => stepper.step()).toThrow("hand source exhausted")
  })
})

describe("Python parity", () => {
  it("matches the full seed=42 default Python session", () => {
    const trace = runSessionTraced(config())
    expect(trace.history.slice(0, 8).map((record) => [
      record.hand_num,
      record.bet_side,
      record.bet_won,
      record.hand_outcome,
      record.capital_after,
      record.martin_event,
    ])).toEqual([
      [1, "BANKER", 1_000, "BANKER", 100_950, ""],
      [2, "BANKER", 1_000, "PLAYER", 99_950, "start"],
      [3, "PLAYER", 2_000, "BANKER", 97_950, ""],
      [4, "PLAYER", 4_000, "BANKER", 93_950, ""],
      [5, "PLAYER", 8_000, "BANKER", 85_950, ""],
      [6, "PLAYER", 16_000, "PLAYER", 101_950, "end_win"],
      [7, "BANKER", 1_000, "PLAYER", 100_950, "start"],
      [8, "PLAYER", 2_000, "PLAYER", 102_950, "end_win"],
    ])
    expect(trace.result).toEqual({
      outcome: "RUIN",
      final_won: 43_600,
      hands_played: 301,
      bets_placed: 279,
      total_wagered_won: 772_000,
      max_loss_streak: 7,
      ruin_reason: "capital_depleted",
    })
  })
})

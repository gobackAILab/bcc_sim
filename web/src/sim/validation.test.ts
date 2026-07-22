import { describe, expect, it } from "vitest"

import { DEFAULT_CONFIG } from "./types"
import type { SessionConfig } from "./types"
import {
  assertValidSessionConfig,
  SessionConfigValidationError,
  validateSessionConfig,
} from "./validation"

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

describe("session config validation", () => {
  it("accepts the browser defaults", () => {
    expect(validateSessionConfig(DEFAULT_CONFIG)).toEqual([])
    expect(() => assertValidSessionConfig(DEFAULT_CONFIG)).not.toThrow()
  })

  it.each([
    ["initial_won", Number.MAX_SAFE_INTEGER + 1],
    ["target_won", 1.5],
    ["ruin_won", -1],
    ["table_max_won", Number.NaN],
    ["base_bet_won", 0],
  ] as const)("rejects invalid money in %s", (field, value) => {
    const issues = validateSessionConfig(config({ [field]: value }))
    expect(issues.some((issue) => issue.field === field)).toBe(true)
  })

  it("checks capital relationships instead of silently normalizing them", () => {
    const issues = validateSessionConfig(
      config({ initial_won: 100_000, target_won: 100_000, ruin_won: 100_000 }),
    )
    expect(issues.map(({ field }) => field)).toEqual(
      expect.arrayContaining(["target_won", "ruin_won"]),
    )
  })

  it("requires an exact bigint seed", () => {
    const value = { ...DEFAULT_CONFIG, seed: 42 }
    expect(validateSessionConfig(value)).toContainEqual({
      field: "seed",
      message: "seed 는 bigint여야 합니다",
    })
  })

  it("throws a structured validation error", () => {
    expect(() => assertValidSessionConfig(config({ base_bet_won: 0 }))).toThrow(
      SessionConfigValidationError,
    )
  })
})

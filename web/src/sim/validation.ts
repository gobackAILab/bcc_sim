import { Outcome } from "./types"
import type { SessionConfig } from "./types"

export interface ValidationIssue {
  field: keyof SessionConfig | "config"
  message: string
}

export class SessionConfigValidationError extends Error {
  readonly issues: readonly ValidationIssue[]

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map(({ message }) => message).join("\n"))
    this.name = "SessionConfigValidationError"
    this.issues = issues
  }
}

export function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`)
  }
}

export function assertPositiveSafeInteger(value: number, label: string): void {
  assertSafeInteger(value, label)
  if (value <= 0) {
    throw new RangeError(`${label} must be > 0`)
  }
}

export function assertNonNegativeSafeInteger(value: number, label: string): void {
  assertSafeInteger(value, label)
  if (value < 0) {
    throw new RangeError(`${label} must be >= 0`)
  }
}

export function addSafeIntegers(left: number, right: number, label: string): number {
  assertSafeInteger(left, `${label} left operand`)
  assertSafeInteger(right, `${label} right operand`)
  const result = left + right
  assertSafeInteger(result, label)
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
}

function safeIntegerIssue(
  source: Record<string, unknown>,
  field: keyof SessionConfig,
  issues: ValidationIssue[],
  minimum: number,
): void {
  const value = source[field]
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    issues.push({ field, message: `${field} 은(는) 안전한 정수여야 합니다` })
    return
  }
  if (value < minimum) {
    const relation = minimum === 1 ? "양의 정수" : "0 이상의 정수"
    issues.push({ field, message: `${field} 은(는) ${relation}여야 합니다` })
  }
}

/** Validate both domain relationships and the browser's numeric boundary. */
export function validateSessionConfig(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ field: "config", message: "설정은 객체여야 합니다" }]
  }

  const issues: ValidationIssue[] = []
  safeIntegerIssue(value, "initial_won", issues, 1)
  safeIntegerIssue(value, "target_won", issues, 1)
  safeIntegerIssue(value, "ruin_won", issues, 0)
  safeIntegerIssue(value, "table_max_won", issues, 1)
  safeIntegerIssue(value, "base_bet_won", issues, 1)
  safeIntegerIssue(value, "n_decks", issues, 1)
  safeIntegerIssue(value, "cut_offset", issues, 0)
  safeIntegerIssue(value, "hand_delay_ms", issues, 0)

  if (typeof value.seed !== "bigint") {
    issues.push({ field: "seed", message: "seed 는 bigint여야 합니다" })
  }
  if (value.side !== Outcome.PLAYER && value.side !== Outcome.BANKER) {
    issues.push({ field: "side", message: "side 는 PLAYER 또는 BANKER여야 합니다" })
  }
  if (value.strategy_name !== "flat" && value.strategy_name !== "martingale") {
    issues.push({
      field: "strategy_name",
      message: "strategy_name 은 flat 또는 martingale이어야 합니다",
    })
  }
  if (value.martin_steps !== null) {
    if (
      typeof value.martin_steps !== "number" ||
      !Number.isSafeInteger(value.martin_steps) ||
      value.martin_steps < 1
    ) {
      issues.push({
        field: "martin_steps",
        message: "martin_steps 는 1 이상의 안전한 정수 또는 null이어야 합니다",
      })
    }
  }
  if (typeof value.pivot !== "boolean") {
    issues.push({ field: "pivot", message: "pivot 은 boolean이어야 합니다" })
  }
  if (typeof value.auto_next !== "boolean") {
    issues.push({ field: "auto_next", message: "auto_next 는 boolean이어야 합니다" })
  }

  const initial = value.initial_won
  const target = value.target_won
  const ruin = value.ruin_won
  const tableMax = value.table_max_won
  const baseBet = value.base_bet_won

  if (isSafeInteger(initial) && isSafeInteger(target) && target <= initial) {
    issues.push({ field: "target_won", message: "target_won 은 initial_won 보다 커야 합니다" })
  }
  if (isSafeInteger(initial) && isSafeInteger(ruin) && ruin >= initial) {
    issues.push({ field: "ruin_won", message: "ruin_won 은 initial_won 보다 작아야 합니다" })
  }
  if (isSafeInteger(baseBet) && isSafeInteger(tableMax) && baseBet > tableMax) {
    issues.push({
      field: "base_bet_won",
      message: "base_bet_won 이 table_max_won 을 초과합니다",
    })
  }
  if (isSafeInteger(baseBet) && isSafeInteger(initial) && baseBet > initial) {
    issues.push({
      field: "base_bet_won",
      message: "base_bet_won 이 initial_won 을 초과합니다",
    })
  }

  return issues
}

export function assertValidSessionConfig(value: unknown): asserts value is SessionConfig {
  const issues = validateSessionConfig(value)
  if (issues.length > 0) {
    throw new SessionConfigValidationError(issues)
  }
}

/// <reference lib="webworker" />

import { PythonRandom } from '../sim/pythonRandom'
import { SessionStepper } from '../sim/session'
import type { SessionConfig, SessionResult } from '../sim/types'
import type { CumulativeStats, WorkerCommand, WorkerEvent } from './protocol'

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope
const SESSION_SEED_LIMIT = 2n ** 63n

let generation = 0
let paused = false
let stopRequested = true
let nextRequested = false
const waiters = new Set<() => void>()

function send(event: WorkerEvent): void {
  scope.postMessage(event)
}

function wakeWaiters(): void {
  for (const wake of [...waiters]) wake()
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      waiters.delete(finish)
      resolve()
    }
    const timer = setTimeout(finish, Math.max(0, milliseconds))
    waiters.add(finish)
  })
}

function isActive(runGeneration: number): boolean {
  return generation === runGeneration && !stopRequested
}

async function waitWhilePaused(runGeneration: number): Promise<void> {
  while (paused && isActive(runGeneration)) await wait(25)
}

async function waitForNextSession(runGeneration: number): Promise<void> {
  while (!nextRequested && isActive(runGeneration)) await wait(25)
  nextRequested = false
}

function updateCumulative(
  cumulative: CumulativeStats,
  result: SessionResult,
  initialWon: number,
): number {
  const sessionPnl = result.final_won - initialWon
  cumulative.sessions += 1
  cumulative.pnl += sessionPnl
  cumulative.hands += result.hands_played
  if (result.outcome === 'WIN') cumulative.wins += 1
  else cumulative.ruins += 1
  return sessionPnl
}

async function run(config: SessionConfig, runGeneration: number): Promise<void> {
  try {
    const masterRandom = new PythonRandom(config.seed)
    const cumulative: CumulativeStats = {
      sessions: 0,
      wins: 0,
      ruins: 0,
      pnl: 0,
      hands: 0,
    }

    send({
      type: 'banner',
      config,
      hand_delay_ms: config.hand_delay_ms,
      auto_next: config.auto_next,
    })

    let sessionNum = 0
    while (isActive(runGeneration)) {
      sessionNum += 1
      const sessionSeed = masterRandom.randrange(SESSION_SEED_LIMIT)
      const sessionConfig: SessionConfig = { ...config, seed: sessionSeed }
      const stepper = new SessionStepper(sessionConfig)

      send({
        type: 'session_start',
        session_num: sessionNum,
        seed: sessionSeed,
        config: sessionConfig,
      })

      while (!stepper.done && isActive(runGeneration)) {
        await waitWhilePaused(runGeneration)
        if (!isActive(runGeneration)) break

        const step = stepper.step()
        if (step.record) send({ type: 'hand', record: step.record })
        if (step.record) await wait(config.hand_delay_ms)
      }

      if (!isActive(runGeneration)) break
      const result = stepper.result
      if (!result) throw new Error('세션이 결과 없이 종료되었습니다.')

      const sessionPnl = updateCumulative(cumulative, result, config.initial_won)
      send({
        type: 'session_end',
        result,
        session_pnl: sessionPnl,
        cumulative: { ...cumulative },
      })

      if (!config.auto_next) await waitForNextSession(runGeneration)
    }

    if (generation === runGeneration && stopRequested) send({ type: 'stopped' })
  } catch (error) {
    if (generation !== runGeneration) return
    const message = error instanceof Error ? error.message : String(error)
    send({ type: 'error', message })
    stopRequested = true
  }
}

scope.addEventListener('message', (event: MessageEvent<WorkerCommand>) => {
  const command = event.data
  switch (command.type) {
    case 'start': {
      generation += 1
      paused = false
      stopRequested = false
      nextRequested = false
      wakeWaiters()
      void run(command.config, generation)
      break
    }
    case 'pause':
      paused = true
      break
    case 'resume':
      paused = false
      wakeWaiters()
      break
    case 'next_session':
      nextRequested = true
      wakeWaiters()
      break
    case 'stop':
      stopRequested = true
      paused = false
      wakeWaiters()
      break
  }
})

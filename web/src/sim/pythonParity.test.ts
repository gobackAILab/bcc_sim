import { describe, expect, it } from 'vitest'
import fixtureJson from './fixtures/python-engine.json?raw'
import { PythonRandom } from './pythonRandom'
import { runSessionTraced } from './session'
import type { HandRecord, SessionConfig, SessionResult } from './types'

interface FixtureConfig extends Omit<SessionConfig, 'seed'> {
  seed: string
}

interface EngineFixtureCase {
  name: string
  config: FixtureConfig
  result: SessionResult
  history: HandRecord[]
}

interface EngineFixture {
  generator: string
  derived_session_seeds: { master: string; values: string[] }
  cases: EngineFixtureCase[]
}

const fixture = JSON.parse(fixtureJson) as EngineFixture

describe('Python engine parity', () => {
  it('derives the same per-session seeds as Python', () => {
    const random = new PythonRandom(fixture.derived_session_seeds.master)
    const actual = fixture.derived_session_seeds.values.map(() =>
      random.randrange(2n ** 63n).toString(),
    )
    expect(actual).toEqual(fixture.derived_session_seeds.values)
  })

  for (const testCase of fixture.cases) {
    it(`matches every hand in ${testCase.name}`, () => {
      const config: SessionConfig = {
        ...testCase.config,
        seed: BigInt(testCase.config.seed),
      }
      expect(runSessionTraced(config)).toEqual({
        result: testCase.result,
        history: testCase.history,
      })
    })
  }
})

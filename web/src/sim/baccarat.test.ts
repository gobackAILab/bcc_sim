import { describe, expect, it } from "vitest"

import { PythonRandom } from "./pythonRandom"
import {
  bankerDrawsAfterPlayerThird,
  createCard,
  playHand,
  Shoe,
} from "./baccarat"
import type { Card } from "./types"

class SequenceShoe {
  private readonly cards: Card[]
  private index = 0

  constructor(values: readonly number[]) {
    this.cards = values.map((value) => createCard(value === 0 ? 10 : value, "S"))
  }

  draw(): Card {
    const card = this.cards[this.index]
    if (card === undefined) throw new Error("sequence exhausted")
    this.index += 1
    return card
  }

  cardsUsed(): number {
    return this.index
  }
}

function play(values: readonly number[]) {
  const shoe = new SequenceShoe(values)
  return { result: playHand(shoe), used: shoe.cardsUsed() }
}

describe("cards and shoe", () => {
  it("maps ranks to baccarat values and display labels", () => {
    expect(createCard(1, "S")).toEqual({ rank: 1, suit: "S", label: "A♠", value: 1 })
    expect(createCard(13, "D")).toEqual({ rank: 13, suit: "D", label: "K♦", value: 0 })
  })

  it("contains eight copies of every physical rank/suit in an eight-deck shoe", () => {
    const shoe = new Shoe(8, 0, new PythonRandom(0n))
    expect(shoe.cardsRemaining()).toBe(416)

    const counts = new Map<string, number>()
    for (let index = 0; index < 416; index += 1) {
      const card = shoe.draw()
      const key = `${card.rank}${card.suit}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect(counts.size).toBe(52)
    expect([...counts.values()].every((count) => count === 8)).toBe(true)
  })

  it("matches Python random.Random shuffle order", () => {
    const shoe = new Shoe(8, 14, new PythonRandom(12345n))
    const actual = Array.from({ length: 12 }, () => {
      const card = shoe.draw()
      return `${card.rank}${card.suit}`
    })
    expect(actual).toEqual([
      "9C",
      "12D",
      "6C",
      "8S",
      "4H",
      "4H",
      "8H",
      "6S",
      "8C",
      "6C",
      "12H",
      "6D",
    ])
  })

  it("reshuffles at the cut offset and when fully exhausted", () => {
    const cutShoe = new Shoe(1, 10, new PythonRandom(0n))
    while (cutShoe.cardsRemaining() > 10) cutShoe.draw()
    expect(cutShoe.needsReshuffle()).toBe(true)
    expect(cutShoe.maybeReshuffle()).toBe(true)
    expect(cutShoe.cardsRemaining()).toBe(52)

    const emptyShoe = new Shoe(1, 0, new PythonRandom(0n))
    for (let index = 0; index < 52; index += 1) emptyShoe.draw()
    expect(emptyShoe.draw()).toBeDefined()
    expect(emptyShoe.cardsRemaining()).toBe(51)
  })
})

describe("Punto Banco rules", () => {
  it("settles naturals after four cards", () => {
    const { result, used } = play([3, 4, 5, 2])
    expect(result.outcome).toBe("PLAYER")
    expect(result.player.total).toBe(8)
    expect(result.banker.total).toBe(6)
    expect(used).toBe(4)
  })

  it("draws for Player on 0-5 and stands on 6-7", () => {
    const drawing = play([1, 3, 4, 4, 2])
    expect(drawing.result.player.cards).toHaveLength(3)

    const standing = play([2, 10, 4, 10, 5])
    expect(standing.result.player.cards).toHaveLength(2)
    expect(standing.result.banker.cards).toHaveLength(3)
  })

  it("implements every row of the Banker third-card table", () => {
    for (let playerThird = 0; playerThird <= 9; playerThird += 1) {
      expect(bankerDrawsAfterPlayerThird(2, playerThird)).toBe(true)
      expect(bankerDrawsAfterPlayerThird(3, playerThird)).toBe(playerThird !== 8)
      expect(bankerDrawsAfterPlayerThird(4, playerThird)).toBe(
        playerThird >= 2 && playerThird <= 7,
      )
      expect(bankerDrawsAfterPlayerThird(5, playerThird)).toBe(
        playerThird >= 4 && playerThird <= 7,
      )
      expect(bankerDrawsAfterPlayerThird(6, playerThird)).toBe(
        playerThird === 6 || playerThird === 7,
      )
      expect(bankerDrawsAfterPlayerThird(7, playerThird)).toBe(false)
    }
  })

  it("uses deal order P1, B1, P2, B2, P3, B3", () => {
    const { result, used } = play([0, 1, 0, 1, 8, 9])
    expect(used).toBe(6)
    expect(result.player.cards.map(({ value }) => value)).toEqual([0, 0, 8])
    expect(result.banker.cards.map(({ value }) => value)).toEqual([1, 1, 9])
  })
})

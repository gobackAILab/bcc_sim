import { PythonRandom } from "./pythonRandom"
import { Outcome } from "./types"
import type { Card, HandResult, Suit } from "./types"
import {
  assertNonNegativeSafeInteger,
  assertPositiveSafeInteger,
  assertSafeInteger,
} from "./validation"

const RANK_NAMES: Readonly<Partial<Record<number, string>>> = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
}

const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
}

const SUITS: readonly Suit[] = ["S", "H", "D", "C"]

export interface DrawSource {
  draw(): Card
}

export function createCard(rank: number, suit: Suit): Card {
  assertSafeInteger(rank, "rank")
  if (rank < 1 || rank > 13) {
    throw new RangeError("rank must be between 1 and 13")
  }
  if (!SUITS.includes(suit)) {
    throw new RangeError("suit must be S, H, D, or C")
  }

  const rankLabel = RANK_NAMES[rank] ?? String(rank)
  return {
    rank,
    suit,
    label: `${rankLabel}${SUIT_SYMBOLS[suit]}`,
    value: rank >= 10 ? 0 : rank,
  }
}

function buildDeck(nDecks: number): Card[] {
  const totalCards = nDecks * 52
  assertSafeInteger(totalCards, "shoe card count")

  const cards: Card[] = []
  for (let deck = 0; deck < nDecks; deck += 1) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        cards.push(createCard(rank, suit))
      }
    }
  }
  return cards
}

/** Python-compatible, shuffled multi-deck shoe with cut-card replacement. */
export class Shoe implements DrawSource {
  readonly nDecks: number
  readonly cutOffset: number

  private readonly rng: PythonRandom
  private cards: Card[] = []
  private index = 0

  constructor(
    nDecks = 8,
    cutOffset = 14,
    rng: PythonRandom = new PythonRandom(BigInt(Date.now())),
  ) {
    assertPositiveSafeInteger(nDecks, "nDecks")
    assertNonNegativeSafeInteger(cutOffset, "cutOffset")
    this.nDecks = nDecks
    this.cutOffset = cutOffset
    this.rng = rng
    this.reshuffle()
  }

  cardsRemaining(): number {
    return this.cards.length - this.index
  }

  needsReshuffle(): boolean {
    return this.cardsRemaining() <= this.cutOffset
  }

  draw(): Card {
    if (this.index >= this.cards.length) {
      this.reshuffle()
    }
    const card = this.cards[this.index]
    if (card === undefined) {
      throw new Error("shoe unexpectedly contains no cards")
    }
    this.index += 1
    return card
  }

  maybeReshuffle(): boolean {
    if (!this.needsReshuffle()) {
      return false
    }
    this.reshuffle()
    return true
  }

  private reshuffle(): void {
    this.cards = buildDeck(this.nDecks)
    this.rng.shuffle(this.cards)
    this.index = 0
  }
}

export function bankerDrawsAfterPlayerThird(
  bankerTotal: number,
  playerThirdValue: number,
): boolean {
  if (bankerTotal <= 2) return true
  if (bankerTotal === 3) return playerThirdValue !== 8
  if (bankerTotal === 4) return playerThirdValue >= 2 && playerThirdValue <= 7
  if (bankerTotal === 5) return playerThirdValue >= 4 && playerThirdValue <= 7
  if (bankerTotal === 6) return playerThirdValue === 6 || playerThirdValue === 7
  return false
}

function settle(
  playerTotal: number,
  bankerTotal: number,
  playerCards: readonly Card[],
  bankerCards: readonly Card[],
): HandResult {
  const outcome =
    playerTotal > bankerTotal
      ? Outcome.PLAYER
      : bankerTotal > playerTotal
        ? Outcome.BANKER
        : Outcome.TIE

  return {
    outcome,
    player: { cards: playerCards, total: playerTotal },
    banker: { cards: bankerCards, total: bankerTotal },
  }
}

/** Deal one Punto Banco hand using the casino third-card table. */
export function playHand(shoe: DrawSource): HandResult {
  const playerFirst = shoe.draw()
  const bankerFirst = shoe.draw()
  const playerSecond = shoe.draw()
  const bankerSecond = shoe.draw()
  const playerCards: Card[] = [playerFirst, playerSecond]
  const bankerCards: Card[] = [bankerFirst, bankerSecond]

  let playerTotal = (playerFirst.value + playerSecond.value) % 10
  let bankerTotal = (bankerFirst.value + bankerSecond.value) % 10

  if (playerTotal >= 8 || bankerTotal >= 8) {
    return settle(playerTotal, bankerTotal, playerCards, bankerCards)
  }

  let playerThirdValue: number | null = null
  if (playerTotal <= 5) {
    const playerThird = shoe.draw()
    playerCards.push(playerThird)
    playerThirdValue = playerThird.value
    playerTotal = (playerTotal + playerThirdValue) % 10
  }

  if (playerThirdValue === null) {
    if (bankerTotal <= 5) {
      const bankerThird = shoe.draw()
      bankerCards.push(bankerThird)
      bankerTotal = (bankerTotal + bankerThird.value) % 10
    }
  } else if (bankerDrawsAfterPlayerThird(bankerTotal, playerThirdValue)) {
    const bankerThird = shoe.draw()
    bankerCards.push(bankerThird)
    bankerTotal = (bankerTotal + bankerThird.value) % 10
  }

  return settle(playerTotal, bankerTotal, playerCards, bankerCards)
}

const MT_N = 624;
const MT_M = 397;
const MATRIX_A = 0x9908_b0df;
const UPPER_MASK = 0x8000_0000;
const LOWER_MASK = 0x7fff_ffff;
const UINT32_MASK = 0xffff_ffffn;

export type PythonSeed = number | bigint | string;

type Integer = number | bigint;

function seedToBigInt(seed: PythonSeed): bigint {
  if (typeof seed === "bigint") {
    return seed;
  }

  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed)) {
      throw new TypeError("number seeds must be safe integers; use bigint or a decimal string");
    }
    return BigInt(seed);
  }

  const normalized = seed.trim();
  if (!/^[+-]?\d+$/.test(normalized)) {
    throw new TypeError("string seeds must contain a base-10 integer");
  }
  return BigInt(normalized);
}

function integerToBigInt(value: Integer, name: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer or bigint`);
  }
  return BigInt(value);
}

function bitLength(value: bigint): number {
  return value === 0n ? 0 : value.toString(2).length;
}

/**
 * CPython 3.11's random.Random for integer seeds.
 *
 * The implementation follows Modules/_randommodule.c: integer seeds are split
 * into little-endian 32-bit words, used to initialize MT19937, and sampled with
 * the same bit ordering as getrandbits().
 */
export class PythonRandom {
  private readonly state = new Uint32Array(MT_N);
  private index = MT_N;

  constructor(seed: PythonSeed) {
    this.seed(seed);
  }

  seed(seed: PythonSeed): void {
    let value = seedToBigInt(seed);
    if (value < 0n) {
      value = -value;
    }

    const key: number[] = [];
    do {
      key.push(Number(value & UINT32_MASK));
      value >>= 32n;
    } while (value !== 0n);

    this.initByArray(key);
  }

  random(): number {
    const high27 = this.nextUint32() >>> 5;
    const low26 = this.nextUint32() >>> 6;
    return (high27 * 67_108_864 + low26) / 9_007_199_254_740_992;
  }

  getrandbits(k: number): bigint {
    if (!Number.isSafeInteger(k)) {
      throw new TypeError("number of bits must be a safe integer");
    }
    if (k < 0) {
      throw new RangeError("number of bits must be non-negative");
    }
    if (k === 0) {
      return 0n;
    }

    let result = 0n;
    let remaining = k;
    let offset = 0n;

    while (remaining > 0) {
      const take = Math.min(remaining, 32);
      let word = this.nextUint32();
      if (take < 32) {
        word >>>= 32 - take;
      }
      result |= BigInt(word) << offset;
      remaining -= take;
      offset += 32n;
    }

    return result;
  }

  _randbelow(n: Integer): bigint {
    const limit = integerToBigInt(n, "n");
    if (limit <= 0n) {
      throw new RangeError("n must be greater than zero");
    }

    const k = bitLength(limit);
    let candidate = this.getrandbits(k);
    while (candidate >= limit) {
      candidate = this.getrandbits(k);
    }
    return candidate;
  }

  randbelow(n: Integer): bigint {
    return this._randbelow(n);
  }

  randrange(stop: Integer): bigint;
  randrange(start: Integer, stop: Integer, step?: Integer): bigint;
  randrange(startOrStop: Integer, stop?: Integer, step: Integer = 1n): bigint {
    const startValue = integerToBigInt(startOrStop, stop === undefined ? "stop" : "start");

    if (stop === undefined) {
      if (startValue <= 0n) {
        throw new RangeError("empty range for randrange()");
      }
      return this._randbelow(startValue);
    }

    const stopValue = integerToBigInt(stop, "stop");
    const stepValue = integerToBigInt(step, "step");
    if (stepValue === 0n) {
      throw new RangeError("zero step for randrange()");
    }

    const width = stopValue - startValue;
    let count: bigint;
    if (stepValue > 0n) {
      count = (width + stepValue - 1n) / stepValue;
    } else {
      count = (width + stepValue + 1n) / stepValue;
    }
    if (count <= 0n) {
      throw new RangeError("empty range for randrange()");
    }

    return startValue + stepValue * this._randbelow(count);
  }

  shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Number(this._randbelow(i + 1));
      const temporary = items[i];
      items[i] = items[j];
      items[j] = temporary;
    }
  }

  private initGenRand(seed: number): void {
    this.state[0] = seed >>> 0;
    for (let i = 1; i < MT_N; i += 1) {
      const previous = this.state[i - 1];
      const mixed = (previous ^ (previous >>> 30)) >>> 0;
      this.state[i] = (Math.imul(1_812_433_253, mixed) + i) >>> 0;
    }
    this.index = MT_N;
  }

  private initByArray(key: readonly number[]): void {
    this.initGenRand(19_650_218);

    let i = 1;
    let j = 0;
    let remaining = Math.max(MT_N, key.length);
    while (remaining > 0) {
      const previous = this.state[i - 1];
      const mixed = Math.imul((previous ^ (previous >>> 30)) >>> 0, 1_664_525) >>> 0;
      this.state[i] = (((this.state[i] ^ mixed) >>> 0) + key[j] + j) >>> 0;

      i += 1;
      j += 1;
      if (i >= MT_N) {
        this.state[0] = this.state[MT_N - 1];
        i = 1;
      }
      if (j >= key.length) {
        j = 0;
      }
      remaining -= 1;
    }

    remaining = MT_N - 1;
    while (remaining > 0) {
      const previous = this.state[i - 1];
      const mixed = Math.imul((previous ^ (previous >>> 30)) >>> 0, 1_566_083_941) >>> 0;
      this.state[i] = (((this.state[i] ^ mixed) >>> 0) - i) >>> 0;

      i += 1;
      if (i >= MT_N) {
        this.state[0] = this.state[MT_N - 1];
        i = 1;
      }
      remaining -= 1;
    }

    this.state[0] = UPPER_MASK;
    this.index = MT_N;
  }

  private nextUint32(): number {
    if (this.index >= MT_N) {
      for (let i = 0; i < MT_N; i += 1) {
        const next = i + 1 === MT_N ? 0 : i + 1;
        const source = i + MT_M < MT_N ? i + MT_M : i + MT_M - MT_N;
        const bits = (this.state[i] & UPPER_MASK) | (this.state[next] & LOWER_MASK);
        const odd = (bits & 1) === 0 ? 0 : MATRIX_A;
        this.state[i] = (this.state[source] ^ (bits >>> 1) ^ odd) >>> 0;
      }
      this.index = 0;
    }

    let value = this.state[this.index];
    this.index += 1;
    value ^= value >>> 11;
    value ^= (value << 7) & 0x9d2c_5680;
    value ^= (value << 15) & 0xefc6_0000;
    value ^= value >>> 18;
    return value >>> 0;
  }
}

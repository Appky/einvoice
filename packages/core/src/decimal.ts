/**
 * Exact fixed-point decimal arithmetic on BigInt.
 *
 * Validation of invoice totals must not inherit IEEE-754 rounding artefacts
 * (0.1 + 0.2 !== 0.3), so every amount computation in the rule engine runs
 * through this module. Rounding follows XPath fn:round() semantics
 * (round half toward positive infinity), which is what the official EN 16931
 * Schematron artefacts use for BR-CO-17.
 */

export class Dec {
  /** value = units * 10^-scale */
  private constructor(
    private readonly units: bigint,
    private readonly scale: number,
  ) {}

  static readonly ZERO = new Dec(0n, 0);

  /** Parse a decimal literal ("-12.340"). Returns undefined for malformed input. */
  static parse(text: string): Dec | undefined {
    const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
    if (!m) return undefined;
    const sign = m[1] === "-" ? -1n : 1n;
    const intPart = m[2]!;
    const fracPart = m[3] ?? "";
    const units = sign * BigInt(intPart + fracPart);
    return new Dec(units, fracPart.length);
  }

  static from(n: number): Dec {
    const d = Dec.parse(String(n));
    if (!d) throw new Error(`Not a finite decimal: ${n}`);
    return d;
  }

  private static align(a: Dec, b: Dec): [bigint, bigint, number] {
    if (a.scale === b.scale) return [a.units, b.units, a.scale];
    if (a.scale > b.scale) return [a.units, b.units * 10n ** BigInt(a.scale - b.scale), a.scale];
    return [a.units * 10n ** BigInt(b.scale - a.scale), b.units, b.scale];
  }

  add(other: Dec): Dec {
    const [x, y, s] = Dec.align(this, other);
    return new Dec(x + y, s);
  }

  sub(other: Dec): Dec {
    const [x, y, s] = Dec.align(this, other);
    return new Dec(x - y, s);
  }

  mul(other: Dec): Dec {
    return new Dec(this.units * other.units, this.scale + other.scale);
  }

  /** Divide by 100 exactly (used for percentage rates). */
  divPercent(): Dec {
    return new Dec(this.units, this.scale + 2);
  }

  /**
   * Divide by another decimal, producing `scale` fraction digits
   * (truncated toward zero). Returns undefined when dividing by zero.
   */
  div(other: Dec, scale = 10): Dec | undefined {
    if (other.units === 0n) return undefined;
    const shift = BigInt(scale - this.scale + other.scale);
    const numerator = shift >= 0n ? this.units * 10n ** shift : this.units / 10n ** -shift;
    return new Dec(numerator / other.units, scale);
  }

  neg(): Dec {
    return new Dec(-this.units, this.scale);
  }

  abs(): Dec {
    return new Dec(this.units < 0n ? -this.units : this.units, this.scale);
  }

  cmp(other: Dec): -1 | 0 | 1 {
    const [x, y] = Dec.align(this, other);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  eq(other: Dec): boolean {
    return this.cmp(other) === 0;
  }

  isZero(): boolean {
    return this.units === 0n;
  }

  isNegative(): boolean {
    return this.units < 0n;
  }

  isPositive(): boolean {
    return this.units > 0n;
  }

  /**
   * Round to `digits` fraction digits, half toward positive infinity
   * (XPath fn:round semantics: round(2.5)=3, round(-2.5)=-2).
   */
  round(digits: number): Dec {
    if (this.scale <= digits) return this;
    const drop = BigInt(this.scale - digits);
    const divisor = 10n ** drop;
    const half = divisor / 2n;
    let q = this.units / divisor;
    const r = this.units % divisor;
    if (r >= half) q += 1n;
    else if (-r > half) q -= 1n;
    return new Dec(q, digits);
  }

  toString(): string {
    const negative = this.units < 0n;
    let digits = (negative ? -this.units : this.units).toString();
    if (this.scale === 0) return (negative ? "-" : "") + digits;
    if (digits.length <= this.scale) digits = digits.padStart(this.scale + 1, "0");
    const cut = digits.length - this.scale;
    const out = `${digits.slice(0, cut)}.${digits.slice(cut)}`;
    return (negative ? "-" : "") + out;
  }

  /** Fixed 2-fraction-digit string, for display. */
  toFixed2(): string {
    const r = this.scale <= 2 ? new Dec(this.units * 10n ** BigInt(2 - this.scale), 2) : this.round(2);
    return r.toString();
  }
}

/** Number of fraction digits in the lexical form ("1.100" → 3). BR-DEC rules count lexically. */
export function lexicalFractionDigits(text: string): number {
  const i = text.indexOf(".");
  return i < 0 ? 0 : text.trim().length - i - 1;
}

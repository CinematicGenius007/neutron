const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const generators = Object.freeze([0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]);
const bech32mConstant = 0x2bc830a3;
const bech32Constant = 1;

function polymod(values: readonly number[]): number {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1)
      if (((high >>> index) & 1) !== 0) checksum ^= generators[index] as number;
  }
  return checksum >>> 0;
}

function expandHrp(hrp: string): number[] {
  const output: number[] = [];
  for (let index = 0; index < hrp.length; index += 1) output.push(hrp.charCodeAt(index) >>> 5);
  output.push(0);
  for (let index = 0; index < hrp.length; index += 1) output.push(hrp.charCodeAt(index) & 31);
  return output;
}

function convertBits(
  values: readonly number[],
  fromBits: number,
  toBits: number,
  pad: boolean,
): number[] | undefined {
  let accumulator = 0;
  let bits = 0;
  const maximum = (1 << toBits) - 1;
  const output: number[] = [];
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value >= 1 << fromBits) return undefined;
    accumulator = (accumulator << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      output.push((accumulator >>> bits) & maximum);
    }
  }
  if (pad) {
    if (bits > 0) output.push((accumulator << (toBits - bits)) & maximum);
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maximum) !== 0) {
    return undefined;
  }
  return output;
}

function encodeWords(hrp: string, data: readonly number[], constant: number): string {
  if (data.some((value) => !Number.isInteger(value) || value < 0 || value > 31))
    throw new Error("invalid Bech32 data");
  const checksumInput = [...expandHrp(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const encodedChecksum = polymod(checksumInput) ^ constant;
  const checksum: number[] = [];
  for (let index = 0; index < 6; index += 1)
    checksum.push((encodedChecksum >>> (5 * (5 - index))) & 31);
  return `${hrp}1${[...data, ...checksum].map((value) => alphabet[value]).join("")}`;
}

export function encodeBech32mWords(hrp: string, words: readonly number[]): string {
  return encodeWords(hrp, words, bech32mConstant);
}

export function encodeBech32Words(hrp: string, words: readonly number[]): string {
  return encodeWords(hrp, words, bech32Constant);
}

export function encodeBech32m(hrp: string, bytes: Uint8Array): string {
  const data = convertBits(Array.from(bytes), 8, 5, true);
  if (data === undefined) throw new Error("invalid Bech32m data");
  return encodeBech32mWords(hrp, data);
}

export function decodeBech32mWords(
  value: string,
): Readonly<{ hrp: string; words: readonly number[] }> {
  const lower = value.toLowerCase();
  if (value.length > 90 || (value !== lower && value !== value.toUpperCase()))
    throw new Error("invalid Bech32m text");
  const separator = lower.lastIndexOf("1");
  if (separator < 1 || separator + 7 > lower.length) throw new Error("invalid Bech32m text");
  const hrp = lower.slice(0, separator);
  for (let index = 0; index < hrp.length; index += 1) {
    const code = hrp.charCodeAt(index);
    if (code < 33 || code > 126) throw new Error("invalid Bech32m text");
  }
  const data: number[] = [];
  for (let index = separator + 1; index < lower.length; index += 1) {
    const decoded = alphabet.indexOf(lower[index] as string);
    if (decoded < 0) throw new Error("invalid Bech32m text");
    data.push(decoded);
  }
  if (polymod([...expandHrp(hrp), ...data]) !== bech32mConstant)
    throw new Error("invalid Bech32m checksum");
  return Object.freeze({ hrp, words: Object.freeze(data.slice(0, -6)) });
}

export function decodeBech32m(value: string): Readonly<{ hrp: string; bytes: Uint8Array }> {
  const decoded = decodeBech32mWords(value);
  const bytes = convertBits(decoded.words, 5, 8, false);
  if (bytes === undefined) throw new Error("invalid Bech32m padding");
  return Object.freeze({ bytes: Uint8Array.from(bytes), hrp: decoded.hrp });
}

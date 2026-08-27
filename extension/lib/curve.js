// curve check, ported from curve_check.py.
//
// a pump.fun bonding curve is a constant product. virtual sol reserves times
// virtual token reserves is a constant k, fixed when the coin is created. a
// real trade moves along that curve, so k is preserved. integer rounding
// inside the program moves it by a hair. nothing an honest trade can do moves
// it further.
//
// this file is the whole test. it is imported by the service worker and by
// the node cross check, so both run the identical code.
//
// k is vsol * vtok, around 3.2e25. that is past Number.MAX_SAFE_INTEGER, so k
// is a BigInt everywhere. the spread is computed as scaled integer division
// and only becomes a float at the very end.

export const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
export const DEFAULT_LIMIT = 200;
export const DEFAULT_TOL = 0.01;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    const r = n % 58n;
    n = n / 58n;
    out = B58[Number(r)] + out;
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return "1".repeat(zeros) + out;
}

export function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("not base58");
    n = n * 58n + BigInt(i);
  }
  const body = [];
  while (n > 0n) {
    body.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;
  return new Uint8Array([...new Array(zeros).fill(0), ...body]);
}

export function isMint(s) {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  try {
    return b58decode(s).length === 32;
  } catch {
    return false;
  }
}

// sha256("event:TradeEvent")[:8], precomputed so the parser stays synchronous.
// verified against the python at build time.
const TRADE_DISC = new Uint8Array([189, 219, 127, 211, 78, 230, 97, 238]);

function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const INVOKE = /^Program (\S+) invoke \[\d+\]/;
const DONE = /^Program \S+ (?:success|failed)/;

// TradeEvent records emitted by the pump.fun program itself.
//
// the event has grown over time and its tail is variable length, so only the
// fixed 113 byte prefix is read. anything shorter is skipped rather than
// guessed at. the same discriminator turns up in contexts where the curve
// fields are zero, so the invoke stack is tracked and only events emitted
// directly by pump.fun are decoded.
export function parseTradeEvents(tx) {
  const logs = (tx && tx.meta && tx.meta.logMessages) || [];
  const stack = [];
  const out = [];
  for (const line of logs) {
    const m = INVOKE.exec(line);
    if (m) {
      stack.push(m[1]);
      continue;
    }
    if (DONE.test(line)) {
      stack.pop();
      continue;
    }
    if (!line.includes("Program data:")) continue;
    if (stack.length === 0 || stack[stack.length - 1] !== PUMP) continue;

    let b;
    try {
      b = b64ToBytes(line.split("Program data:")[1].trim());
    } catch {
      continue;
    }
    if (b.length < 113) continue;
    let disc = true;
    for (let i = 0; i < 8; i++) {
      if (b[i] !== TRADE_DISC[i]) {
        disc = false;
        break;
      }
    }
    if (!disc) continue;

    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    out.push({
      mint: b58encode(b.subarray(8, 40)),
      sol: dv.getBigUint64(40, true),
      tokens: dv.getBigUint64(48, true),
      isBuy: b[56] === 1,
      user: b58encode(b.subarray(57, 89)),
      ts: dv.getBigInt64(89, true),
      vsol: dv.getBigUint64(97, true),
      vtok: dv.getBigUint64(105, true),
    });
  }
  return out;
}

// k must be preserved across every trade on the coin.
//
// no baseline is chosen. the test is the spread itself, the widest k on the
// coin against the narrowest. that needs no reference trade and no opinion
// about which trade is the honest one.
const SCALE = 10n ** 18n;

export function check(trades, tol = DEFAULT_TOL) {
  const usable = trades.filter((t) => t.vsol > 0n && t.vtok > 0n);
  if (usable.length === 0) return null;
  for (const t of usable) t.k = t.vsol * t.vtok;

  let lo = usable[0];
  let hi = usable[0];
  for (const t of usable) {
    if (t.k < lo.k) lo = t;
    if (t.k > hi.k) hi = t;
  }
  // (hi - lo) / lo, as scaled integer division. exact for the small spreads
  // an honest curve produces, and the float only appears at the end.
  const spread = Number(((hi.k - lo.k) * SCALE) / lo.k) / 1e18;
  return {
    usable,
    lo,
    hi,
    spread,
    violated: spread > tol,
    skipped: trades.length - usable.length,
  };
}

// json-rpc with batching and backoff. batching is transport only, it does not
// change what is measured. the public endpoint rate limits hard and this is
// the difference between a badge that appears and one that never does.
export class Rpc {
  // minInterval paces requests. the public endpoint rate limits hard enough
  // that without this it returns 429 within a second or two, which is the
  // single most common way this check fails for a stranger.
  constructor(url, fetchImpl, minInterval = 260) {
    this.url = url;
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.minInterval = minInterval;
    this.calls = 0;
    this.last = 0;
    this.limited = false;
  }

  async _pace() {
    const wait = this.last + this.minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }

  async _post(payload, tries = 6) {
    for (let attempt = 0; attempt < tries; attempt++) {
      await this._pace();
      try {
        const r = await this.fetch(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.status === 429 || r.status >= 500) {
          this.limited = this.limited || r.status === 429;
          if (attempt < tries - 1) {
            await sleep(800 * 2 ** attempt);
            continue;
          }
          throw new Error(`rpc http ${r.status}`);
        }
        if (!r.ok) throw new Error(`rpc http ${r.status}`);
        this.calls++;
        return await r.json();
      } catch (e) {
        if (attempt < tries - 1) {
          await sleep(800 * 2 ** attempt);
          continue;
        }
        throw e;
      }
    }
    throw new Error("rpc gave up");
  }

  async call(method, params) {
    const out = await this._post({ jsonrpc: "2.0", id: 1, method, params });
    if (out.error) throw new Error(out.error.message || "rpc error");
    return out.result;
  }

  // returns one entry per request, each {ok, result} or {ok:false, error}.
  // failures are never collapsed into null. a dropped transaction that nobody
  // counted is how a fabricated coin gets reported clean.
  async batch(reqs) {
    if (reqs.length === 0) return [];
    const payload = reqs.map((r, i) => ({
      jsonrpc: "2.0",
      id: i,
      method: r.method,
      params: r.params,
    }));
    let out;
    try {
      out = await this._post(payload);
    } catch (e) {
      return reqs.map(() => ({ ok: false, error: String(e.message || e) }));
    }
    if (!Array.isArray(out)) {
      return reqs.map(() => ({ ok: false, error: "rpc did not return a batch" }));
    }
    const byId = new Map(out.map((o) => [o.id, o]));
    return reqs.map((_, i) => {
      const o = byId.get(i);
      if (!o) return { ok: false, error: "missing from batch response" };
      if (o.error) return { ok: false, error: o.error.message || "rpc error" };
      return { ok: true, result: o.result };
    });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchTrades(rpc, mint, limit = DEFAULT_LIMIT, batchSize = 5) {
  const sigs = [];
  const seen = new Set();
  let before = null;
  while (sigs.length < limit) {
    const p = { limit: Math.min(1000, limit - sigs.length) };
    if (before) p.before = before;
    const page = await rpc.call("getSignaturesForAddress", [mint, p]);
    if (!page || page.length === 0) break;
    for (const s of page) {
      if (!seen.has(s.signature)) {
        seen.add(s.signature);
        sigs.push(s);
      }
    }
    before = page[page.length - 1].signature;
    if (page.length < p.limit) break;
  }

  const wanted = sigs.filter((s) => s.err === null || s.err === undefined);
  const trades = [];
  const take = (tx, sig) => {
    for (const ev of parseTradeEvents(tx)) {
      if (ev.mint === mint) {
        ev.sig = sig;
        trades.push(ev);
      }
    }
  };

  let failed = [];
  for (let i = 0; i < wanted.length; i += batchSize) {
    const chunk = wanted.slice(i, i + batchSize);
    const results = await rpc.batch(
      chunk.map((s) => ({
        method: "getTransaction",
        params: [
          s.signature,
          { encoding: "json", maxSupportedTransactionVersion: 0 },
        ],
      })),
    );
    results.forEach((r, j) => {
      if (!r.ok) {
        failed.push(chunk[j].signature);
        return;
      }
      if (r.result) take(r.result, chunk[j].signature);
      // a successful call returning null means the node has no record of it,
      // which is not a fetch failure and not a trade either.
    });
  }

  // one more pass over anything the batches could not read, one at a time.
  // the public endpoint throttles batches far harder than single calls.
  const stillFailed = [];
  for (const sig of failed) {
    try {
      const tx = await rpc.call("getTransaction", [
        sig,
        { encoding: "json", maxSupportedTransactionVersion: 0 },
      ]);
      if (tx) take(tx, sig);
    } catch {
      stillFailed.push(sig);
    }
  }

  trades.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return {
    trades,
    signatures: sigs.length,
    considered: wanted.length,
    unread: stillFailed.length,
  };
}

// one call, the whole verdict. returns a plain object safe to send over
// chrome messaging, so BigInt is stringified here.
// status is one of:
//   flagged    a violation was found. definitive, and it stays definitive even
//              if some transactions could not be read, because the violation
//              that was found is still a violation.
//   clean      every transaction asked for was read, and none of them broke
//              the identity. bounded to the trades actually checked.
//   incomplete some transactions could not be read, and no violation was found
//              in the rest. that is not clean. the missing ones are exactly
//              where a violation would hide.
//   none       no pump.fun trades carrying curve state were found at all.
export async function checkMint(mint, opts = {}) {
  const rpc = new Rpc(opts.rpc || DEFAULT_RPC, opts.fetch, opts.minInterval);
  const f = await fetchTrades(
    rpc,
    mint,
    opts.limit || DEFAULT_LIMIT,
    opts.batchSize || 5,
  );
  const base = {
    mint,
    trades: f.trades.length,
    signatures: f.signatures,
    considered: f.considered,
    unread: f.unread,
    rpcCalls: rpc.calls,
    rateLimited: rpc.limited,
  };
  if (f.trades.length === 0) {
    return { ...base, status: f.unread > 0 ? "incomplete" : "none" };
  }
  const r = check(f.trades, opts.tol ?? DEFAULT_TOL);
  if (!r) return { ...base, status: f.unread > 0 ? "incomplete" : "none" };

  const end = (t) => ({
    sig: t.sig,
    vsol: t.vsol.toString(),
    vtok: t.vtok.toString(),
    k: t.k.toString(),
  });
  const status = r.violated ? "flagged" : f.unread > 0 ? "incomplete" : "clean";
  return {
    ...base,
    status,
    usable: r.usable.length,
    skipped: r.skipped,
    spread: r.spread,
    narrowest: end(r.lo),
    widest: end(r.hi),
  };
}

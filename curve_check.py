"""
curve check. points at one pump.fun mint and tests every trade against the
bonding curve identity.

a pump.fun bonding curve is a constant product. virtual sol reserves times
virtual token reserves is a constant k, fixed when the coin is created. a real
trade moves along that curve, so k is preserved. integer rounding inside the
program moves it by a hair. nothing an honest trade can do moves it further.

so a trade whose reserves do not satisfy the identity did not happen on the
curve the coin claims to be on. that is arithmetic, not a model. there is no
threshold to tune and nothing was fitted to an outcome.

this reports what is there. it never says a coin is safe.
"""
import json, urllib.request, urllib.error, hashlib, base64, struct, sys, time, argparse

PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
TRADE_DISC = hashlib.sha256(b"event:TradeEvent").digest()[:8]
DEFAULT_RPC = "https://api.mainnet-beta.solana.com"

_A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _A[r] + out
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + out

def b58decode(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + _A.index(c)
    body = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return b"\0" * (len(s) - len(s.lstrip("1"))) + body


class Rpc:
    def __init__(self, url, sleep=0.25):
        self.url, self.sleep, self.n = url, sleep, 0

    def call(self, method, params, tries=5):
        body = json.dumps({"jsonrpc": "2.0", "id": 1,
                           "method": method, "params": params}).encode()
        for attempt in range(tries):
            try:
                req = urllib.request.Request(
                    self.url, data=body, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=40) as r:
                    out = json.loads(r.read())
                self.n += 1
                time.sleep(self.sleep)
                if "error" in out:
                    raise RuntimeError(out["error"].get("message", out["error"]))
                return out.get("result")
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < tries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise
            except (urllib.error.URLError, TimeoutError):
                if attempt < tries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise
        raise RuntimeError("rpc gave up")


def parse_trade_events(tx):
    """TradeEvent records emitted by the pump.fun program itself.

    the event has grown over time and its tail is variable length, so only the
    fixed prefix is read. anything shorter than the prefix is skipped rather
    than guessed at.
    """
    import re
    logs = (tx.get("meta") or {}).get("logMessages") or []
    stack, out = [], []
    for line in logs:
        m = re.match(r"Program (\S+) invoke \[\d+\]", line)
        if m:
            stack.append(m.group(1))
            continue
        if re.match(r"Program \S+ (?:success|failed)", line):
            if stack:
                stack.pop()
            continue
        if "Program data:" not in line:
            continue
        if not stack or stack[-1] != PUMP:
            continue                      # emitted by something else, not ours
        try:
            b = base64.b64decode(line.split("Program data:", 1)[1].strip())
        except Exception:
            continue
        if len(b) < 113 or b[:8] != TRADE_DISC:
            continue
        mint = b58encode(b[8:40])
        sol_amount, token_amount = struct.unpack_from("<QQ", b, 40)
        is_buy = b[56] == 1
        user = b58encode(b[57:89])
        ts, vsol, vtok = struct.unpack_from("<qQQ", b, 89)
        out.append({"mint": mint, "sol": sol_amount, "tokens": token_amount,
                    "is_buy": is_buy, "user": user, "ts": ts,
                    "vsol": vsol, "vtok": vtok})
    return out


def fetch_trades(rpc, mint, limit):
    sigs, before, seen = [], None, set()
    while len(sigs) < limit:
        p = {"limit": min(1000, limit - len(sigs))}
        if before:
            p["before"] = before
        page = rpc.call("getSignaturesForAddress", [mint, p])
        if not page:
            break
        for s in page:
            if s["signature"] not in seen:
                seen.add(s["signature"])
                sigs.append(s)
        before = page[-1]["signature"]
        if len(page) < p["limit"]:
            break
    trades = []
    for s in sigs:
        if s.get("err") is not None:
            continue
        tx = rpc.call("getTransaction",
                      [s["signature"], {"encoding": "json",
                                        "maxSupportedTransactionVersion": 0}])
        if not tx:
            continue
        for ev in parse_trade_events(tx):
            if ev["mint"] == mint:
                ev["sig"] = s["signature"]
                trades.append(ev)
    trades.sort(key=lambda t: t["ts"])
    return trades


def check(trades, tol):
    """k must be preserved across every trade on the coin.

    no baseline is chosen. the test is the spread itself: the widest k on the
    coin against the narrowest. that needs no reference trade and no opinion
    about which trade is the honest one.
    """
    usable = [t for t in trades if t["vsol"] > 0 and t["vtok"] > 0]
    if not usable:
        return None
    for t in usable:
        t["k"] = t["vsol"] * t["vtok"]
    lo = min(usable, key=lambda t: t["k"])
    hi = max(usable, key=lambda t: t["k"])
    spread = (hi["k"] / lo["k"]) - 1.0
    return {"usable": usable, "lo": lo, "hi": hi, "spread": spread,
            "violated": spread > tol,
            "skipped": len(trades) - len(usable)}


def main():
    ap = argparse.ArgumentParser(description="check a pump.fun coin against the bonding curve identity")
    ap.add_argument("mint")
    ap.add_argument("--rpc", default=DEFAULT_RPC,
                    help="solana json-rpc endpoint. the public default is rate limited, "
                         "so a private endpoint is a lot faster")
    ap.add_argument("--limit", type=int, default=200, help="how many signatures to pull")
    ap.add_argument("--tol", type=float, default=0.01,
                    help="relative tolerance on k. integer rounding inside the program "
                         "moves k by far less than this")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    try:
        if len(b58decode(a.mint)) != 32:
            raise ValueError
    except Exception:
        print(f"'{a.mint}' is not a base58 32 byte address")
        return 2

    rpc = Rpc(a.rpc)
    try:
        trades = fetch_trades(rpc, a.mint, a.limit)
    except Exception as e:
        print(f"rpc failed: {e}")
        print("if this is a rate limit, pass a private endpoint with --rpc")
        return 3

    if not trades:
        print(f"mint      {a.mint}")
        print("no pump.fun trades found for this mint in the range searched.")
        print("it may not be a pump.fun coin, or its trades may be older than --limit.")
        return 1

    r = check(trades, a.tol)
    if a.json:
        print(json.dumps({
            "mint": a.mint, "trades": len(trades),
            "k_spread": r["spread"],
            "flagged": r["violated"],
            "evidence": [{"end": lbl, "sig": t["sig"], "vsol": t["vsol"],
                          "vtok": t["vtok"], "k": t["k"]}
                         for lbl, t in (("narrowest", r["lo"]), ("widest", r["hi"]))],
        }, indent=2))
        return 0

    n = len(r["usable"])
    print(f"mint      {a.mint}")
    print(f"trades    {len(trades)} decoded, {n} carrying curve state"
          + (f", {r['skipped']} without" if r["skipped"] else ""))
    print(f"k spread  {r['spread']:.3e}  (widest k over narrowest, across the coin)")
    print()
    if not r["violated"]:
        print(f"CLEAN. k holds across all {n} trades, inside {a.tol:.4%}.")
        print("that is what an ordinary bonding curve looks like. it says nothing about")
        print("where the price goes, and nothing about whether the coin is safe.")
    else:
        print(f"FLAGGED. k moves by {r['spread']:.2%} across {n} trades.")
        print("this coin's recorded state is not a legal bonding curve.")
        print()
        print("the two ends, check them yourself on solscan:")
        for lbl, t in (("narrowest", r["lo"]), ("widest   ", r["hi"])):
            print(f"  {lbl}  {t['sig']}")
            print(f"             vsol={t['vsol']}  vtok={t['vtok']}")
            print(f"             k={t['k']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

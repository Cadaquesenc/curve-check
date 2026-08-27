"""
Two rules that flag a pump.fun launch as manipulated or high-risk, both computable at the
decision point. No model, no training, no fitted thresholds except the one marked FITTED.

Rule M (manufactured volume). A bonding curve is x*y=k. A trade can move the price along the
curve but cannot take it below the price the curve opened at, because that would need a
negative real SOL reserve. So a printed price below the coin's own launch price is not a legal
curve price. In a live trade stream the same thing is caught more directly by checking the
constant product itself: vsol*vtok must equal k.

Rule R (repeat rugger). The creator's own prior launches, counting only those whose 60-second
observation window closed before this coin launched. Not fitted; it is a running mean.

Neither rule is tuned to an outcome. Rule M is arithmetic. Rule R's only free parameter is the
threshold, marked below.
"""
import json, glob, os, math, sys
from collections import defaultdict

DATA = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("STS_DATA", "")
LEGACY = {"coins-2026-08-10.jsonl","coins-2026-08-11.jsonl","coins-2026-08-12.jsonl"}
K = 30.0 * 1_073_000_000.0
DEFAULT_LAUNCH_PRICE = 30.0 / 1_073_000_000.0
WINDOW_MS = 60_000
R_THRESHOLD = 0.67          # FITTED: the only free parameter in either rule
DECISION_SEC = 3

def launch_price(coin):
    c = coin.get("curve") or {}
    vs, vt = c.get("virtualSol"), c.get("virtualTokens")
    return (vs / vt) if (vs and vt) else DEFAULT_LAUNCH_PRICE

def rule_M(coin, div, upto=DECISION_SEC):
    """Manufactured: a printed price below the coin's own launch floor."""
    floor = launch_price(coin)
    for c in ((coin.get("market") or {}).get("candles") or []):
        if c.get("s", 1e9) > upto:
            break
        lo = c.get("l")
        if lo is not None and lo / div < floor * 0.999999:
            return True
    return False

def creator_dumped(coin):
    """Did the creator sell inside the window. None when it cannot be known."""
    cr = coin.get("creator")
    row = next((w for w in (coin.get("who") or []) if w.get("w") == cr), None)
    if row is None:
        return None                                    # creator never observed
    held = (row.get("tin") or 0) > 0 or (row.get("in") or 0) > 0
    if not held:
        return None                                    # nothing to dump
    return ((row.get("out") or 0) > 0) or ((row.get("tout") or 0) > 0)

def run():
    coins, seen = [], set()
    for path in sorted(glob.glob(os.path.join(DATA, "coins-*.jsonl"))):
        div = 1000.0 if os.path.basename(path) in LEGACY else 1.0
        for line in open(path):
            o = json.loads(line)
            m = o.get("mint")
            if not m or m in seen:
                continue
            seen.add(m)
            coins.append((o, div))
    coins.sort(key=lambda t: t[0].get("t") or 0)

    history = defaultdict(list)                        # creator -> [(t, dumped)]
    out = []
    for o, div in coins:
        t = o.get("t") or 0
        prior = [d for (t0, d) in history[o.get("creator")] if t - t0 >= WINDOW_MS]
        rate = (sum(prior) / len(prior)) if prior else None
        out.append({
            "mint": o["mint"], "t": t, "day": o.get("day"),
            "M": rule_M(o, div),
            "R": (rate is not None and rate >= R_THRESHOLD),
            "scoreable_R": rate is not None,
            "dumped": creator_dumped(o),
            "other_sol_in": sum((w.get("in") or 0) for w in (o.get("who") or [])
                                if w.get("w") != o.get("creator")),
        })
        d = creator_dumped(o)
        if d is not None:
            history[o.get("creator")].append((t, d))
    return out

if __name__ == "__main__":
    rows = run()
    n = len(rows)
    sol = sum(r["other_sol_in"] for r in rows)
    m = [r for r in rows if r["M"]]
    rr = [r for r in rows if r["R"]]
    both = [r for r in rows if r["M"] and r["R"]]
    flagged = [r for r in rows if r["M"] or r["R"]]
    sc = [r for r in rows if r["scoreable_R"]]
    lab = [r for r in sc if r["dumped"] is not None]
    tp = sum(1 for r in lab if r["R"] and r["dumped"])
    fp = sum(1 for r in lab if r["R"] and not r["dumped"])
    fn = sum(1 for r in lab if not r["R"] and r["dumped"])
    base = sum(1 for r in lab if r["dumped"]) / len(lab)
    print(f"coins {n}   non-creator SOL staked {sol:,.0f}")
    print(f"rule M fires        {len(m):>6}  = {100*len(m)/n:5.1f}% of launches")
    print(f"rule R fires        {len(rr):>6}  = {100*len(rr)/n:5.1f}%   (scoreable {100*len(sc)/n:.1f}%)")
    print(f"  overlap           {len(both):>6}")
    print(f"EITHER              {len(flagged):>6}  = {100*len(flagged)/n:5.1f}% of launches")
    print(f"  money covered     {sum(r['other_sol_in'] for r in flagged):>10,.0f} SOL"
          f"  = {100*sum(r['other_sol_in'] for r in flagged)/sol:.1f}%")
    print()
    print(f"rule R against the label it predicts (n={len(lab)}, base rate {100*base:.1f}%):")
    print(f"  precision {100*tp/(tp+fp):.1f}%   recall {100*tp/(tp+fn):.1f}%"
          f"   lift {(tp/(tp+fp))/base:.2f}x")

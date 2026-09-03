# curve-check

a pump.fun bonding curve is a constant product. virtual sol times virtual tokens is a number `k`, fixed when the coin is made. an honest trade moves along the curve and leaves `k` alone. a coin whose own trades disagree about `k` is not on the curve it claims to be on.

that is arithmetic. no model, no training, no threshold to tune.

```
python3 curve_check.py <mint>
```

265 lines, standard library only, no dependencies, no api key. read the whole thing in five minutes before you run it.

zero false positives across 12,089 recorded launches.

it came out of a trading system that lost money at every horizon i tested. this is the piece that survived. it reports what is there, and it never says a coin is safe.

mac and windows builds on the [releases page](https://github.com/Cadaquesenc/curve-check/releases), unsigned, so both will warn you. the numbers and the caveats are in `report/second-zero.html`.

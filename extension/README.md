# curve check, as a chrome extension

the same test as `curve_check.py` in the repo root, running on the coin page
you are already looking at. it puts a small badge in the corner and shows you
the evidence rather than a score.

## what it tests

a pump.fun bonding curve is a constant product. virtual sol reserves times
virtual token reserves is a constant k, fixed when the coin is created. a real
trade moves along that curve, so k is preserved. integer rounding inside the
program moves it by a hair. nothing an honest trade can do moves it further.

so a trade whose reserves do not satisfy the identity did not happen on the
curve the coin claims to be on. that is arithmetic. there is no threshold to
tune and nothing was fitted to an outcome.

no baseline trade is chosen. the test is the spread itself, the widest k on the
coin against the narrowest, which needs no opinion about which trade is honest.

## the four things it can say

**not a legal curve.** a violation was found. this is definitive and stays
definitive even if some transactions could not be read, because the violation
that was found is still a violation. the two extreme trades are shown with
their signatures so you can open them on solscan and multiply the reserves
yourself.

**no violation found.** every transaction it asked for was read, and none of
them broke the identity. this is bounded to the trades actually checked, and it
is not a statement that the coin is good. it says nothing about where the price
goes.

**could not check it all.** some transactions could not be read and no
violation was found in the rest. that is deliberately not reported as clean,
because the transactions it failed to read are exactly where a violation would
hide. this is almost always the public rpc endpoint rate limiting you, and the
fix is in options.

**no pump.fun trades.** nothing carrying curve state was found for this mint.
it may not be a pump.fun coin.

## permissions, and why each one is there

- **storage.** saves your rpc endpoint and your signature limit, and caches a
  verdict for five minutes so revisiting a coin does not refetch it. local to
  your browser.
- **host access to `api.mainnet-beta.solana.com`.** the default endpoint. this
  is the only host the extension ships with access to.
- **optional host access.** requested only at the moment you type your own
  endpoint into options, and only for that one origin. the extension does not
  ask for the whole web up front.
- **running on `pump.fun` and `dexscreener.com`.** to read the mint address off
  the page and draw the badge. those two sites only.

what it does not ask for, and does not have: tabs, browsing history, cookies,
webRequest, or the ability to run on any other site.

it sends the mint address of the coin you are looking at to the rpc endpoint,
and nothing else, to nobody else. no analytics, no telemetry, no accounts, no
remote code, no wallet connection. it cannot spend anything because it never
asks for a key. there is nothing here to steal.

## the rpc endpoint is the thing to change

the public solana endpoint throttles hard. measured while building this: a
single coin needing 168 transactions returned HTTP 429 on 32 separate batches,
and more than half the transactions failed to read on the first pass. the
extension retries them one at a time and tells you when it still could not get
them all.

any free tier endpoint fixes it. helius, quicknode and triton all work. paste it
into options and the check goes from unreliable to fast.

## honest limits

- **it checks the most recent N signatures, not the coin's whole life.** the
  default is 100 in the extension and 200 in the command line tool. so "no
  violation found" means no violation in what was checked.
- **on an actively trading coin the window moves.** two checks a few minutes
  apart legitimately see different trades, because the newest N signatures have
  slid forward. this was observed directly while building it, on a live coin
  where the narrowest k from one run had aged out of the window by the next.
- **the zero false positives record is not this tool's.** it belongs to the
  corpus rule run over 12,089 recorded coins, described in the report in this
  repo. the live checker is verified to decode correctly and to agree with the
  reference implementation, and it does not inherit that record.
- **it never says a coin is safe.** nobody can say that honestly. it says
  whether the recorded state is arithmetically possible, and that is all.

## load it without waiting for the store

1. open `chrome://extensions`
2. turn on developer mode, top right
3. click "load unpacked" and pick this `extension` folder
4. open any pump.fun coin page

it works the same in brave, edge and any other chromium browser.

## checking the port yourself

the extension and the command line tool are meant to agree. `lib/curve.js` is
the whole test and `lib/crosscheck.mjs` runs it under node so you can diff it
against the python:

```
node lib/crosscheck.mjs <mint>
python3 ../curve_check.py <mint> --json
```

on a settled coin these match exactly, down to the signatures and the k values.
on a live one the window moves between runs, so compare a coin that has
finished trading.

# chrome web store listing, ready to paste

publishing needs a one time 5 dollar developer registration on your own google
account, and review takes a few days. everything below is the copy for it.

---

## name

```
curve check
```

## short description (132 char limit, this is 108)

```
Tests a pump.fun coin against the bonding curve identity and shows you the evidence, not a score.
```

## category

```
Developer Tools
```

## detailed description

```
curve check tests whether a pump.fun coin's recorded trades are arithmetically possible.

A pump.fun bonding curve is a constant product. Virtual SOL reserves times virtual token reserves is a constant, fixed when the coin is created. A real trade moves along that curve, so the product is preserved. Integer rounding inside the program moves it by a hair. Nothing an honest trade can do moves it further.

So a trade whose reserves do not satisfy that identity did not happen on the curve the coin claims to be on. That is arithmetic. There is no threshold to tune, no model, and nothing fitted to an outcome.

WHAT YOU SEE

Open a coin on pump.fun or dexscreener and a small badge appears in the corner with one of four results.

Not a legal curve. A violation was found. The two extreme trades are shown with their transaction signatures and their reserve numbers, so you can open them on Solscan and multiply them yourself.

No violation found. Every transaction it asked for was read and none broke the identity. Bounded to the trades checked.

Could not check it all. Some transactions could not be read. This is deliberately not reported as clean, because the ones it failed to read are exactly where a violation would hide. Usually this means the public RPC endpoint is rate limiting you, and you can add your own in options.

No pump.fun trades. Nothing carrying curve state was found for that mint.

WHAT IT DOES NOT DO

It never tells you a coin is safe. Nobody can do that honestly. It tells you whether the recorded state is arithmetically possible, and that is all. It says nothing about where the price goes.

PRIVACY

It sends the mint address of the coin you are looking at to a Solana RPC endpoint, and nothing else, to nobody else. No analytics, no telemetry, no accounts, no remote code, no wallet connection. It never asks for a key and cannot spend anything. There is nothing here to steal.

It runs on pump.fun and dexscreener only. It does not request access to your tabs, your history, your cookies, or any other site.

OPEN SOURCE

Every line is readable at github.com/Cadaquesenc/curve-check, along with the command line version, the reference implementation, and the research the rule came out of.
```

## permission justifications

these are the boxes the review form asks for.

**storage**

```
Stores the user's chosen RPC endpoint and signature limit, and caches a result for five minutes so revisiting a coin does not refetch it. Local to the browser, never transmitted.
```

**host permission: api.mainnet-beta.solana.com**

```
The default Solana RPC endpoint. The extension reads a coin's transaction history from it in order to test the bonding curve identity. This is the only host the extension ships with access to.
```

**optional host permissions**

```
Requested only at the moment the user enters their own RPC endpoint in options, and only for that single origin. The public endpoint rate limits heavily, so users need the option of their own. Nothing is requested up front.
```

**content scripts on pump.fun and dexscreener.com**

```
Reads the token mint address from the page the user is already viewing and draws the result badge. Limited to these two sites.
```

**remote code**

```
No. All code is in the package. Nothing is fetched and executed.
```

**data usage disclosures**

```
Does not collect or transmit personally identifiable information, health information, financial information, authentication information, personal communications, location, web history, or user activity. The only network request is a public blockchain read of the coin address currently being viewed.
```

## single purpose statement

```
Tests whether a pump.fun coin's on-chain trades satisfy the bonding curve constant product identity, and shows the user the evidence.
```

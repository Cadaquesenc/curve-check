# curve-check

> i spent seventeen days building a trading system for pump.fun.
> it lost money at every horizon i tested.
> this is the one piece of it that worked. Thanks claude. my big C. 

## the problem and before everything else

My math when it came to this specific project failed so I had big C do most of it, well almost all of it, but man you wouldn't believe the mistakes it made holy anyway back to the point:

a pump.fun coin looks like it is trading. there is a chart, there is volume, there are trades going through.

the question nobody can answer by looking is whether any of it is real. of course.

the normal way to attack this is a model: score the wallets, weight the features, train something on coins that turned out to be rugs, get a probability out. i do not like that answer, because a model can be wrong and you cannot check it, and because whatever it learned was learned from last month's scams.

so i went looking for something that could not be wrong. like i always do

## the idea

a pump.fun bonding curve is a constant product. virtual sol reserves times virtual token reserves is a number, `k`, fixed the moment the coin is created.

a real trade moves along that curve, so it preserves `k`. integer rounding inside the program moves it by a hair, and that hair is bounded and knowable.

nothing an honest trade can do moves it further.

so if a coin's own trades report reserves that do not satisfy the identity, that trade did not happen on the curve the coin claims to be on. that is arithmetic. there is no threshold to tune, nothing was fitted to an outcome, and it does not care what scams looked like last month.

## what it does

points at one mint, pulls the coin's own trade events off chain, and checks every one against the identity.

```
python3 curve_check.py <mint>
```

265 lines, standard library only, no dependencies, no api key. you can read the entire thing in five minutes before you run it, which is the point, because you should not run somebody's crypto script otherwise.

it does have to do a couple of unglamorous things by hand to stay dependency free: base58 encode and decode, and decoding anchor's `TradeEvent` out of the program logs by matching the first eight bytes of `sha256("event:TradeEvent")`.

## what happened

zero false positives across the whole corpus, yay, 12,089 recorded launches, no honest trade ever flagged.

that number comes from a sweep where 31 agents tested 4.6 million rules against real captured launches. no entry signal survived. no exit rule survived. no wallet-following scheme survived. the median trade was -2.11%, which is exactly the round trip fee, meaning the median outcome is you pay the toll and nothing happens.

this detector and one other were the only usable things left standing, and between them they account for about half the money actually being taken in that market.

so this is what a failed trading project leaves behind. not a strategy, a measuring instrument.

## what it will not do

it will never tell you a coin is safe. Because the guy from wolf of wall street said no one knows if a stock (or in this case coin) will go up down or sideways 

it reports what is there. a coin can pass every check in here and still be a rug launched by someone patient, and a coin can fail and just be weird. the identity catches manufactured volume, and manufactured volume is one specific lie out of many available.

anything that promises you safe is selling you something.

## what i learned

- arithmetic beats a model when arithmetic is available. it is available more often than people assume, and everyone skips it because it feels too simple to be a contribution
- "no threshold to tune" is the most valuable sentence you can write about a detector, and you only get to write it if you resisted tuning a threshold
- a project can fail at its actual goal and still produce something worth shipping, but only if you were honest enough about the failure to go looking
- zero false positives is a claim about a corpus, not about the world. mine was 12,089 launches. say the number

## install

```
python3 curve_check.py <mint>
```

mac and windows apps on the [releases page](https://github.com/Cadaquesenc/curve-check/releases), unsigned, so both will warn you.

## the writeup

`report/second-zero.html`, the numbers and every caveat that goes with them.

## status

- ✅ ships, works, zero false positives on 12,089 launches
- ❌ the trading system it came out of does not work at all
- 🧮 arithmetic, not a model
- ⚠️ never says a coin is safe 

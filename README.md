# curve check

a pump.fun bonding curve is a constant product. virtual sol reserves times virtual token reserves is a number `k`, fixed when the coin is created. a real trade moves along that curve, so `k` survives it. integer rounding inside the program moves `k` by about one part in a billion. nothing an honest trade can do moves it further.

so if a coin's own trades do not agree on `k`, that coin's recorded state is not a legal bonding curve. that is arithmetic. there is no model here, no training, and no threshold fitted to an outcome.

this tells you what is there. it never tells you a coin is safe.

## the check, run on real coins

an ordinary coin:

```
$ python3 curve_check.py 9Tpmx51VGt7YpygdTdBLtZRNvAWRgGuYbrJCa6ccpump
mint      9Tpmx51VGt7YpygdTdBLtZRNvAWRgGuYbrJCa6ccpump
trades    34 decoded, 34 carrying curve state
k spread  4.122e-10  (widest k over narrowest, across the coin)

CLEAN. k holds across all 34 trades, inside 1.0000%.
```

and one that is not:

```
$ python3 curve_check.py 2xHH693KRNZaPtwPpVzgt6aF993kRzADJCdt55mspump
mint      2xHH693KRNZaPtwPpVzgt6aF993kRzADJCdt55mspump
trades    36 decoded, 36 carrying curve state
k spread  5.183e+00  (widest k over narrowest, across the coin)

FLAGGED. k moves by 518.32% across 36 trades.
this coin's recorded state is not a legal bonding curve.

the two ends, check them yourself on solscan:
  narrowest  4h7pHibc4HejvkUi8Gn3fHKf9ZFakSbjhoyLj3JrMyS57UFXfQU9joomAN6WxAbx7P2Vrh68zaccJrcbpYtuLJnQ
             vsol=17631017241  vtok=1044307647303366
             k=18412206134513793103333206
  widest     hs5NQSsPMX1MRAkb6f3cdzRrAS11b9khjWYU3ViBgNRpogGoAUN87GdNYMnkuZNmY9hboBwLPeyDQmVgEZdnk5L
             vsol=117752226162  vtok=966827956487602
             k=113846144192072405853043524
```

four ten-billionths against five hundred percent. every number above came from a command that was run, and both signatures are on chain right now, so you can check me rather than believe me.

that second coin opens exactly on pump.fun's canonical `k` of 3.219e25 and then its reserves swing between 0.57x and 3.54x of it inside 48 seconds.

## three ways to run it, pick whichever you like

the whole check is one file, `curve_check.py`, about 250 lines, standard library only. no dependencies, no install, no network calls except the rpc endpoint you can see in the code. if you are wondering whether a stranger's crypto tool is safe to run, you can read the entire thing in five minutes and know. that is a better answer than a signature is, and it is an answer most tools in this space cannot give you.

**run the source.**

```
python3 curve_check.py <mint>
python3 curve_check.py <mint> --rpc https://your-endpoint --limit 500 --json
python3 curve_check_gui.py            # the same thing with a window
```

the default endpoint is solana's public one. it is heavily rate limited, so a private endpoint is a lot faster. `--limit` is how many signatures to pull back.

**run the app.** the [releases page](https://github.com/Cadaquesenc/curve-check/releases) has a `.dmg` for macos and a `.exe` for windows. same code, packaged so you do not need python. the mac build i have opened and run myself. the windows one is built on a windows runner by the same workflow and carries the same certificate fix, but i do not have a windows machine, so nobody has launched it yet. if you run it, open an issue and tell me what happened.

**build the app yourself**, from the same source you just read, and compare it to mine:

```
pip install pyinstaller certifi
pyinstaller --windowed --noconfirm --collect-all certifi --name curve-check curve_check_gui.py
```

one honest note on that. the source is standard library only, but the packaged apps also contain `certifi`, which is just a list of certificate authorities. a packaged python has no access to your system's certificate store, so without it every https call in the built app fails. running from source does not use it.

## about the download warning

the binaries are not code signed, so both operating systems will say so. nothing is wrong, it is just what unsigned means. here is what you will see.

**macos** says the app "cannot be opened because it is from an unidentified developer". right click the app, choose open, then open again in the dialog. after that it launches normally.

**windows** shows a blue smartscreen panel saying "windows protected your pc". click "more info", then "run anyway".

signing would remove both dialogs. it costs $99 a year for an apple developer account plus a windows code signing certificate on top, which is why this is not signed yet.

## the two rules

**rule M, manufactured volume.** the one above. `vsol * vtok` must agree across a coin's own trades. in a recorded capture with candles rather than a live trade stream, the same thing shows up as a printed price below the coin's own launch price, which needs a negative real reserve.

**rule R, repeat rugger.** the creator's own prior launches, counting only those whose 60 second observation window closed before this coin launched. fire at a dump rate of 0.67 or above. that threshold is the only fitted number in either rule.

## what they are worth

`detector.py` is the reference implementation that produced the published numbers. run over a capture of 12,089 pump.fun launches:

```
coins 12089   non-creator SOL staked 101,701
rule M fires           748  =   6.2% of launches
rule R fires          4007  =  33.1%   (scoreable 46.4%)
  overlap              392
EITHER                4363  =  36.1% of launches
  money covered         53,494 SOL  = 52.6%

rule R against the label it predicts (n=5316, base rate 74.7%):
  precision 91.5%   recall 87.7%   lift 1.22x
```

## the caveats, which travel with the numbers

**the certainty and the reach are in different rules, and that is the main thing to understand.** rule M had no false positive anywhere in that corpus, and it reaches **2.2% of the money**. rule R reaches **51.4% of the money** and is much weaker: a **1.22x lift on a 74.7% base rate**, not a 91% accuracy. an earlier version of rule R was reported at AUC 0.94. a red team found the feature was self inclusive, meaning the coin being scored sat inside its own creator's history, and the honest figure is **AUC 0.82**, on the 46.9% of launches that can be scored at all. i am quoting the corrected number.

**it protects other people, not you.** there is no version of this that becomes a trading position. knowing a creator will not rug does not give you anywhere better to put money: in that corpus the coins by creators who never dumped were the dead ones, and buying them lost about as much as buying anything else. the fee and the exit liquidity take your money, not the rug.

**the corpus is 30 recorded hours, not seven days**, across seven days in august 2026, and the holdout it was scored against once is a single 89 minute session. that is enough to be confident about a rule that is arithmetic. it is not a season of evidence.

**the live checker and the corpus numbers are two different things.** the zero false positives above is the corpus rule over 12,089 coins. `curve_check.py` is the same identity applied to live rpc data, and what i have verified is that it decodes the current pump.fun event correctly and reproduces canonical `k` to ten decimal places on ordinary coins. i am not claiming it inherits the corpus's record. if you find a false positive, open an issue with the mint and i will look at it.

## the report

`report/second-zero.html` is the writeup this came out of. 31 agents spent a day trying to find a way to make money on pump.fun launches. no entry signal survived. this detector and one other thing did, and the report is candid about which of its own claims got retracted along the way, including three of the loudest.

also readable at <https://claude.ai/code/artifact/f1a30932-98fc-439d-b37c-61e53232a3da>.

## files

- `curve_check.py` : point it at a mint, check it live against public rpc
- `curve_check_gui.py` : the same check with a window around it, for people who do not live in a terminal
- `detector.py` : the reference implementation, runs over a directory of capture files
- `extension/` : the same check as a chrome extension, badges the coin page you are on
- `report/second-zero.html` : the full writeup
- `.github/workflows/release.yml` : builds the mac and windows apps on a tag

MIT.

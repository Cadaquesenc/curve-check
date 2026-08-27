a pump.fun bonding curve is a constant product. virtual sol times virtual tokens is a number `k`, fixed when the coin is made. an honest trade moves along that curve and leaves `k` alone. so if a coin's own trades disagree about `k`, that coin's recorded state is not a legal bonding curve.

this checks that, live, on any mint you point it at. it is arithmetic. there is no model, no training, and no threshold fitted to an outcome. it tells you what is there, and it never tells you a coin is safe.

## what is in this release

- `curve-check-macos.dmg` : drag it to applications and open it
- `curve-check-windows.exe` : built by the release workflow on a windows runner

both are the same code as `curve_check_gui.py` in the repo, packaged so you do not need python installed.

one honest note on the windows one. it is built on a windows runner and carries the same certificate fix as the mac build, but i do not have a windows machine and nobody has launched it yet. the mac build i have opened and run myself, and the output further down came out of it. if you run the windows one, open an issue and tell me what happened, and i will put the answer here.

## you do not have to trust the binary

the whole check is one file, `curve_check.py`, about 250 lines, standard library only. no dependencies, no install, no network calls except the rpc endpoint you can read in the source. anyone suspicious of a stranger's crypto tool can read the entire thing in five minutes and know exactly what it does.

or skip the download and run the source directly:

```
python3 curve_check.py <mint>
python3 curve_check_gui.py
```

or build the app yourself from that same source and compare it to mine:

```
pip install pyinstaller certifi
pyinstaller --windowed --noconfirm --collect-all certifi --name curve-check curve_check_gui.py
```

three routes, same arithmetic. take whichever one you like.

the `certifi` part matters and is not optional. a packaged python has no access to your system's certificate store, so a build without it fails every https call it makes. the source does not need it, only the packaged app does.

## the download warning

these are not code signed, so both systems will say so.

**macos** says the app is from an unidentified developer. right click it, choose open, then open again in the dialog.

**windows** shows a blue smartscreen panel. click "more info", then "run anyway".

signing removes both dialogs and costs $99 a year for apple plus a windows certificate, which is why it is not signed yet.

## a real result

```
mint      2xHH693KRNZaPtwPpVzgt6aF993kRzADJCdt55mspump
trades    36 decoded, 36 carrying curve state
k spread  5.183e+00

FLAGGED. k moves by 518.32% across 36 trades.
```

an ordinary coin holds `k` to about four ten billionths. that one moves it by five hundred percent. both signatures are on chain, so you can check the claim rather than believe it.

the public rpc endpoint is heavily rate limited and a check takes a couple of minutes on it. put a private endpoint in the box for something faster.

## where it came from

`report/second-zero.html` is the writeup. 31 agents spent a day trying to find a way to make money on pump.fun launches, no entry signal survived, and this detector is one of two things that did. the report is candid about which of its own claims got retracted along the way.

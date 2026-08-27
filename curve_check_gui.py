"""
curve check, with a window.

same arithmetic as curve_check.py, which it imports rather than reimplements,
so there is one source of truth for the check itself. this file is only the
window around it.

this reports what is there. it never says a coin is safe.
"""
import threading, queue, webbrowser, sys
import tkinter as tk
from tkinter import ttk

import curve_check as cc

SOLSCAN_TX = "https://solscan.io/tx/"
SOLSCAN_TOKEN = "https://solscan.io/token/"
DEFAULT_LIMIT = 150


def palette(widget):
    """pick text colours that read on whatever background tk gave us.

    macos dark mode changes the widget background under us, so the verdict
    colours are chosen from the actual background rather than assumed.
    """
    try:
        r, g, b = widget.winfo_rgb(widget.cget("background"))
        lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 65535.0
    except Exception:
        lum = 1.0
    if lum < 0.5:
        return {"flag": "#E88A76", "clean": "#A5C184", "dim": "#8A9096",
                "link": "#8FB4C9", "body": "#E7E8E3"}
    return {"flag": "#9C3B2E", "clean": "#43602F", "dim": "#6E757C",
            "link": "#2E4A5C", "body": "#181B1E"}


class App:
    def __init__(self, root):
        self.root = root
        self.q = queue.Queue()
        self.worker = None
        self.stop = threading.Event()
        root.title("curve check")
        root.minsize(660, 460)

        pad = {"padx": 14, "pady": 6}
        top = ttk.Frame(root)
        top.pack(fill="x", **pad)

        ttk.Label(top, text="mint address").pack(anchor="w")
        row = ttk.Frame(top)
        row.pack(fill="x", pady=(2, 0))
        self.mint = ttk.Entry(row)
        self.mint.pack(side="left", fill="x", expand=True)
        self.mint.bind("<Return>", lambda e: self.go())
        self.btn = ttk.Button(row, text="check", command=self.go)
        self.btn.pack(side="left", padx=(8, 0))

        adv = ttk.Frame(root)
        adv.pack(fill="x", padx=14)
        ttk.Label(adv, text="rpc endpoint").pack(anchor="w")
        self.rpc = ttk.Entry(adv)
        self.rpc.insert(0, cc.DEFAULT_RPC)
        self.rpc.pack(fill="x", pady=(2, 0))
        ttk.Label(
            adv,
            text="the public default is heavily rate limited. a private endpoint is a lot faster.",
            foreground="grey",
        ).pack(anchor="w", pady=(2, 0))

        self.status = ttk.Label(root, text="")
        self.status.pack(anchor="w", padx=14, pady=(8, 0))

        wrap = ttk.Frame(root)
        wrap.pack(fill="both", expand=True, padx=14, pady=(6, 14))
        self.out = tk.Text(wrap, wrap="word", height=16, relief="flat",
                           highlightthickness=1, padx=12, pady=10)
        sb = ttk.Scrollbar(wrap, command=self.out.yview)
        self.out.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.out.pack(side="left", fill="both", expand=True)

        c = palette(self.out)
        mono = ("Menlo", 11) if sys.platform == "darwin" else ("Consolas", 10)
        self.out.configure(font=mono, foreground=c["body"])
        self.out.tag_configure("flag", foreground=c["flag"],
                               font=(mono[0], mono[1] + 2, "bold"))
        self.out.tag_configure("clean", foreground=c["clean"],
                               font=(mono[0], mono[1] + 2, "bold"))
        self.out.tag_configure("dim", foreground=c["dim"])
        self.out.tag_configure("link", foreground=c["link"], underline=True)
        self.out.tag_bind("link", "<Enter>",
                          lambda e: self.out.configure(cursor="pointinghand"))
        self.out.tag_bind("link", "<Leave>",
                          lambda e: self.out.configure(cursor=""))
        self.out.configure(state="disabled")

        self.say("paste a pump.fun mint address and press check.\n\n", "dim")
        self.say("a bonding curve is a constant product. virtual sol times virtual "
                 "tokens is a number k, fixed when the coin is made. an honest trade "
                 "moves along that curve and leaves k alone. so if a coin's own "
                 "trades disagree about k, its recorded state is not a legal "
                 "bonding curve.\n\n", "dim")
        self.say("that is arithmetic, not a prediction. it says nothing about where "
                 "the price goes, and it never says a coin is safe.", "dim")

        self.root.after(80, self.drain)

    # ---------- output helpers ----------

    def say(self, text, tag=None):
        self.out.configure(state="normal")
        self.out.insert("end", text, tag or ())
        self.out.configure(state="disabled")
        self.out.see("end")

    def link(self, text, url):
        self.out.configure(state="normal")
        tag = f"u{self.out.index('end')}"
        self.out.insert("end", text, ("link", tag))
        self.out.tag_bind(tag, "<Button-1>", lambda e, u=url: webbrowser.open(u))
        self.out.configure(state="disabled")

    def clear(self):
        self.out.configure(state="normal")
        self.out.delete("1.0", "end")
        self.out.configure(state="disabled")

    # ---------- running ----------

    def go(self):
        if self.worker and self.worker.is_alive():
            self.stop.set()
            return
        mint = self.mint.get().strip()
        try:
            if len(cc.b58decode(mint)) != 32:
                raise ValueError
        except Exception:
            self.clear()
            self.say(f"'{mint}' is not a base58 32 byte address.", "flag")
            return
        self.clear()
        self.stop = threading.Event()
        self.btn.configure(text="stop")
        self.status.configure(text="looking up signatures")
        self.say("checking ", "dim")
        self.say(mint + "\n", "dim")
        url = self.rpc.get().strip() or cc.DEFAULT_RPC
        self.worker = threading.Thread(target=self.run, args=(mint, url), daemon=True)
        self.worker.start()

    def run(self, mint, url):
        try:
            rpc = cc.Rpc(url)
            trades = cc.fetch_trades(
                rpc, mint, DEFAULT_LIMIT,
                on_progress=lambda d, t: self.q.put(("progress", (d, t))),
                cancelled=self.stop.is_set)
            if self.stop.is_set():
                self.q.put(("stopped", None))
                return
            if not trades:
                self.q.put(("none", mint))
                return
            self.q.put(("done", (mint, cc.check(trades, 0.01), len(trades))))
        except Exception as e:
            self.q.put(("error", str(e)))

    def drain(self):
        try:
            while True:
                kind, payload = self.q.get_nowait()
                getattr(self, "on_" + kind)(payload)
        except queue.Empty:
            pass
        self.root.after(80, self.drain)

    def finish(self):
        self.btn.configure(text="check")
        self.status.configure(text="")

    # ---------- results ----------

    def on_progress(self, p):
        done, total = p
        self.status.configure(text=f"reading transactions {done} of {total}")

    def on_stopped(self, _):
        self.finish()
        self.say("\nstopped.\n", "dim")

    def on_error(self, msg):
        self.finish()
        self.say("\nrpc failed: ", "flag")
        self.say(msg + "\n")
        self.say("if that is a rate limit, put a private endpoint in the rpc box "
                 "above and try again.\n", "dim")

    def on_none(self, mint):
        self.finish()
        self.say("\nno pump.fun trades found for this mint in the range searched.\n")
        self.say("it may not be a pump.fun coin, or its trades may be older than "
                 f"the last {DEFAULT_LIMIT} signatures.\n", "dim")

    def on_done(self, payload):
        mint, r, n_all = payload
        self.finish()
        if r is None:
            self.say("\nno trade on this coin carried curve state, so there is "
                     "nothing to check.\n", "dim")
            return
        n = len(r["usable"])
        self.say(f"\ntrades    {n_all} decoded, {n} carrying curve state\n")
        self.say(f"k spread  {r['spread']:.3e}   widest k over narrowest\n\n")

        if not r["violated"]:
            self.say(f"CLEAN. k holds across all {n} trades.\n", "clean")
            self.say("that is what an ordinary bonding curve looks like. it says "
                     "nothing about where the price goes, and it does not mean the "
                     "coin is safe.\n\n", "dim")
            self.say("the coin on solscan: ", "dim")
            self.link(mint, SOLSCAN_TOKEN + mint)
            self.say("\n")
            return

        self.say(f"FLAGGED. k moves by {r['spread']:.2%} across {n} trades.\n", "flag")
        self.say("this coin's recorded state is not a legal bonding curve.\n\n")
        self.say("the two ends. click either to check it yourself:\n\n", "dim")
        for label, t in (("narrowest", r["lo"]), ("widest", r["hi"])):
            self.say(f"  {label}\n", "dim")
            self.say("    ")
            self.link(t["sig"], SOLSCAN_TX + t["sig"])
            self.say(f"\n    vsol={t['vsol']}  vtok={t['vtok']}\n")
            self.say(f"    k={t['k']}\n\n")


def main():
    """a windowed build has nowhere to print, so a crash goes to a file and to
    a window, rather than the app just vanishing."""
    import traceback, tempfile, os
    try:
        root = tk.Tk()
        app = App(root)
        # opening straight onto a coin, so the app can be launched at one
        #   open -a curve-check --args --mint <mint>
        args = sys.argv[1:]
        if "--mint" in args:
            i = args.index("--mint")
            if i + 1 < len(args):
                app.mint.insert(0, args[i + 1])
                root.after(300, app.go)
        root.mainloop()
    except Exception:
        tb = traceback.format_exc()
        path = os.path.join(tempfile.gettempdir(), "curve-check-crash.txt")
        try:
            with open(path, "w") as f:
                f.write(tb)
        except Exception:
            pass
        try:
            r = tk.Tk()
            r.title("curve check crashed")
            box = tk.Text(r, wrap="word", width=90, height=24)
            box.pack(fill="both", expand=True)
            box.insert("end", tb + "\n\nalso written to " + path)
            r.mainloop()
        except Exception:
            sys.stderr.write(tb)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

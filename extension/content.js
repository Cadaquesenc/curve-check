// finds the mint on the page, asks the service worker for a verdict, and
// draws a small badge. this script never touches the network itself.
//
// everything it renders is built as dom nodes, never as html strings, so
// nothing from the page or the chain can be injected into the badge.

(() => {
  "use strict";

  const CSS = `
:host { all: initial; }
.cc {
  position: fixed; right: 14px; bottom: 14px; z-index: 2147483647;
  width: 300px; max-width: calc(100vw - 28px);
  font: 12px/1.45 ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
  background: #14171a; color: #e7e8e3;
  border: 1px solid #2b3036; border-left: 3px solid #828a91;
  border-radius: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.35);
  overflow: hidden;
}
.cc-clean { border-left-color: #a2be81; }
.cc-flagged { border-left-color: #de8672; }
.cc-incomplete, .cc-error { border-left-color: #d6aa55; }
.cc-head { display: flex; align-items: center; gap: 7px; padding: 9px 10px; background: #1b1f23; }
.cc-dot { width: 7px; height: 7px; border-radius: 50%; background: #828a91; flex: none; }
.cc-clean .cc-dot { background: #a2be81; }
.cc-flagged .cc-dot { background: #de8672; }
.cc-incomplete .cc-dot, .cc-error .cc-dot { background: #d6aa55; }
.cc-checking .cc-dot { background: #89afc4; }
.cc-label { font-weight: 600; letter-spacing: .01em; flex: 1; }
.cc-x { background: none; border: none; color: #828a91; font-size: 15px; cursor: pointer; padding: 0 2px; line-height: 1; }
.cc-x:hover { color: #e7e8e3; }
.cc-body { padding: 9px 10px 10px; }
.cc-line { color: #aeb5bb; }
.cc-det { margin-top: 8px; }
.cc-det summary { cursor: pointer; color: #89afc4; outline: none; }
.cc-meta { margin: 7px 0; color: #828a91; }
.cc-ev { margin: 7px 0; padding: 6px 8px; background: #1b1f23; border-radius: 3px; }
.cc-ev-name { color: #828a91; margin-bottom: 3px; }
.cc-sig { color: #89afc4; font-family: ui-monospace, monospace; text-decoration: none; word-break: break-all; }
.cc-sig:hover { text-decoration: underline; }
.cc-num { font-family: ui-monospace, monospace; color: #aeb5bb; white-space: pre; overflow-x: auto; font-size: 11px; }
.cc-note { margin-top: 8px; color: #828a91; }
.cc-warn { color: #d6aa55; margin-top: 4px; }
`;

  const B58 = "[1-9A-HJ-NP-Za-km-z]";
  const LOOSE = new RegExp(`${B58}{32,44}`, "g");
  const PUMPY = new RegExp(`${B58}{28,40}pump`, "g");

  const looksLikeKey = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

  // pump.fun puts the mint in the url. dexscreener puts the PAIR address
  // there, which is a different account, so on dexscreener the url is
  // deliberately not trusted and the mint is read from the page instead.
  function findMint() {
    const host = location.hostname;
    if (host.endsWith("pump.fun")) {
      const segs = location.pathname.split("/").filter(Boolean);
      const pumpy = segs.find((s) => looksLikeKey(s) && s.endsWith("pump"));
      if (pumpy) return pumpy;
      const any = segs.find(looksLikeKey);
      if (any) return any;
      return null;
    }

    // dexscreener, and anything else: read it out of the page.
    const byLink = document.querySelector(
      'a[href*="pump.fun/coin/"], a[href*="solscan.io/token/"]',
    );
    if (byLink) {
      const m = byLink.getAttribute("href").match(LOOSE);
      if (m) {
        const hit = m.find(looksLikeKey);
        if (hit) return hit;
      }
    }
    const text = document.body ? document.body.innerText || "" : "";
    const pumpy = text.match(PUMPY);
    if (pumpy) {
      const hit = pumpy.find(looksLikeKey);
      if (hit) return hit;
    }
    return null;
  }

  let host = null;
  let shadow = null;
  let current = null;

  function mount() {
    if (host) return;
    host = document.createElement("div");
    host.id = "curve-check-host";
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function short(s) {
    return s.length > 16 ? `${s.slice(0, 8)}..${s.slice(-6)}` : s;
  }

  function render(state) {
    mount();
    for (const n of [...shadow.childNodes]) {
      if (n.nodeName !== "STYLE") n.remove();
    }

    const wrap = el("div", `cc cc-${state.status}`);
    const head = el("div", "cc-head");
    head.appendChild(el("span", "cc-dot"));
    head.appendChild(el("span", "cc-label", LABEL[state.status] || state.status));
    const close = el("button", "cc-x", "×");
    close.title = "hide";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      host.remove();
      host = null;
    });
    head.appendChild(close);
    wrap.appendChild(head);

    const body = el("div", "cc-body");
    body.appendChild(el("div", "cc-line", SUB[state.status] ? SUB[state.status](state) : ""));

    if (state.status === "flagged" || state.status === "clean" || state.status === "incomplete") {
      const det = el("details", "cc-det");
      const sum = el("summary", null, "the evidence");
      det.appendChild(sum);

      const meta = el("div", "cc-meta");
      meta.appendChild(
        el("div", null, `${state.trades} trades checked, from the ${state.limit || "?"} most recent signatures`),
      );
      if (state.unread) {
        meta.appendChild(el("div", "cc-warn", `${state.unread} transactions could not be read`));
      }
      if (typeof state.spread === "number") {
        meta.appendChild(el("div", null, `k spread ${state.spread.toExponential(3)}`));
      }
      det.appendChild(meta);

      for (const [name, t] of [["narrowest k", state.narrowest], ["widest k", state.widest]]) {
        if (!t) continue;
        const box = el("div", "cc-ev");
        box.appendChild(el("div", "cc-ev-name", name));
        const a = el("a", "cc-sig", short(t.sig));
        a.href = `https://solscan.io/tx/${t.sig}`;
        a.target = "_blank";
        a.rel = "noreferrer noopener";
        box.appendChild(a);
        box.appendChild(el("div", "cc-num", `vsol ${t.vsol}`));
        box.appendChild(el("div", "cc-num", `vtok ${t.vtok}`));
        box.appendChild(el("div", "cc-num", `k    ${t.k}`));
        det.appendChild(box);
      }

      const note = el(
        "div",
        "cc-note",
        "vsol times vtok is k, and it is fixed when the coin is created. open both on solscan and multiply them yourself.",
      );
      det.appendChild(note);
      body.appendChild(det);
    }

    if (state.status === "error") {
      body.appendChild(el("div", "cc-warn", state.error || "something went wrong"));
    }

    if (state.endpoint === "public" && (state.status === "incomplete" || state.status === "error")) {
      const tip = el("div", "cc-note", "the public endpoint rate limits hard. add your own in the extension options and this mostly goes away.");
      body.appendChild(tip);
    }

    wrap.appendChild(body);
    shadow.appendChild(wrap);
  }

  const LABEL = {
    checking: "checking the curve",
    clean: "no violation found",
    flagged: "not a legal curve",
    incomplete: "could not check it all",
    none: "no pump.fun trades",
    error: "check failed",
  };

  const SUB = {
    checking: () => "reading this coin's trades from the chain",
    clean: (s) =>
      `k holds across all ${s.trades} trades checked. that is what an ordinary bonding curve looks like. it says nothing about where the price goes.`,
    flagged: (s) =>
      `k moves by ${(s.spread * 100).toFixed(2)}% across ${s.trades} trades. this coin's recorded state is not a legal bonding curve.`,
    incomplete: (s) =>
      `${s.unread} transactions could not be read, so this is not a clean result. a violation could be hiding in the ones that are missing.`,
    none: () => "no pump.fun trades carrying curve state were found for this mint.",
    error: () => "",
  };

  async function check(mint) {
    if (mint === current) return;
    current = mint;
    render({ status: "checking" });
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "check", mint });
    } catch (e) {
      res = { status: "error", error: "extension was reloaded, refresh the page" };
    }
    if (mint !== current) return; // navigated away mid check
    render(res || { status: "error", error: "no reply" });
  }

  function tick() {
    const mint = findMint();
    if (!mint) return;
    if (mint !== current) check(mint);
  }

  // both sites are single page apps, so the url changes without a reload.
  let last = location.href;
  const watch = () => {
    if (location.href !== last) {
      last = location.href;
      current = null;
      if (host) {
        host.remove();
        host = null;
      }
      setTimeout(tick, 700);
    }
  };
  setInterval(watch, 500);
  new MutationObserver(() => {
    if (!current) tick();
  }).observe(document.documentElement, { childList: true, subtree: true });

  setTimeout(tick, 900);

})();

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const rpcEl = document.getElementById("rpc");
const limitEl = document.getElementById("limit");
const msg = document.getElementById("msg");

function say(text, bad) {
  msg.textContent = text;
  msg.className = bad ? "bad" : "";
}

chrome.storage.local.get(["rpc", "limit"]).then((s) => {
  rpcEl.value = s.rpc || "";
  limitEl.value = Number(s.limit) > 0 ? Number(s.limit) : 100;
});

document.getElementById("save").addEventListener("click", async () => {
  const rpc = rpcEl.value.trim();
  let limit = parseInt(limitEl.value, 10);
  if (!Number.isFinite(limit)) limit = 100;
  limit = Math.min(1000, Math.max(10, limit));
  limitEl.value = limit;

  if (rpc && rpc !== DEFAULT_RPC) {
    let origin;
    try {
      const u = new URL(rpc);
      if (u.protocol !== "https:") {
        say("the endpoint has to be https.", true);
        return;
      }
      origin = `${u.origin}/*`;
    } catch {
      say("that is not a valid url.", true);
      return;
    }
    // the extension ships with permission for the public endpoint only. a
    // custom one is asked for here, at the moment you add it, rather than the
    // extension requesting the whole web up front.
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      say("without permission for that host the extension cannot call it.", true);
      return;
    }
  }

  await chrome.storage.local.set({ rpc, limit });
  await chrome.storage.session.clear(); // old cached verdicts used the old settings
  say("saved.");
});

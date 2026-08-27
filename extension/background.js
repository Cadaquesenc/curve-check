// service worker. the content script never touches the network, it only asks
// for a verdict. every rpc call happens here.
//
// nothing is sent anywhere except the solana rpc endpoint. there is no
// analytics, no telemetry, no remote code and no wallet interaction of any
// kind. read the fetch calls in lib/curve.js, they are the only ones.

import { checkMint, isMint, DEFAULT_RPC } from "./lib/curve.js";

// the extension default is lower than the command line tool's 200. a service
// worker is not allowed to run forever, and the public endpoint is slow enough
// that 200 signatures can take minutes. raise it in options once you have your
// own endpoint.
const DEFAULT_LIMIT = 100;
const CACHE_MS = 5 * 60 * 1000;

async function settings() {
  const s = await chrome.storage.local.get(["rpc", "limit"]);
  return {
    rpc: s.rpc || DEFAULT_RPC,
    limit: Number(s.limit) > 0 ? Number(s.limit) : DEFAULT_LIMIT,
  };
}

// cached per mint and per endpoint, because a bigger limit on a private
// endpoint is a different question from a small one on the public endpoint.
async function cached(key) {
  const c = await chrome.storage.session.get(key);
  const hit = c[key];
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  return null;
}

async function store(key, value) {
  await chrome.storage.session.set({ [key]: { at: Date.now(), value } });
}

const inflight = new Map();

async function run(mint) {
  const { rpc, limit } = await settings();
  const key = `v1|${mint}|${rpc}|${limit}`;

  const hit = await cached(key);
  if (hit) return { ...hit, cached: true };

  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const out = await checkMint(mint, { rpc, limit });
      out.limit = limit;
      out.endpoint = rpc === DEFAULT_RPC ? "public" : "custom";
      await store(key, out);
      return out;
    } catch (e) {
      // an error is never a verdict. it is reported as an error.
      return {
        mint,
        status: "error",
        error: String((e && e.message) || e),
        endpoint: rpc === DEFAULT_RPC ? "public" : "custom",
      };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (!msg || msg.type !== "check") return false;
  if (!isMint(msg.mint)) {
    respond({ mint: msg.mint, status: "error", error: "not a base58 32 byte address" });
    return false;
  }
  run(msg.mint).then(respond);
  return true; // keeps the channel open for the async reply
});

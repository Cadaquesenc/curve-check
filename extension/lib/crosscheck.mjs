// runs the extension's own curve.js under node so its verdict can be diffed
// against curve_check.py. this is not shipped in the extension, it is how the
// port is proved correct.
//
//   node lib/crosscheck.mjs <mint> [rpc]
import { checkMint } from "./curve.js";

const mint = process.argv[2];
const rpc = process.argv[3];
if (!mint) {
  console.error("usage: node lib/crosscheck.mjs <mint> [rpc]");
  process.exit(2);
}
const out = await checkMint(mint, rpc ? { rpc } : {});
console.log(JSON.stringify(out, null, 2));

import { registerBridgePlugin } from "./plugin-core.mjs";

export const id = "linear-expert-bridge";

export default function register(api) {
  return registerBridgePlugin(api);
}

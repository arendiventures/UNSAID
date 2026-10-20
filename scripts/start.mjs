/**
 * Production start wrapper.
 * - Port: PORT env (hosts inject it) or 3000.
 * - Bind: 127.0.0.1 unless STUDIO_ACCESS_TOKEN is set (then 0.0.0.0, because the token gate
 *   makes the app safe to expose). HOST env overrides either way.
 */
import { spawn } from "node:child_process";

const port = process.env.PORT?.trim() || "3000";
const token = process.env.STUDIO_ACCESS_TOKEN?.trim();
const host = process.env.HOST?.trim() || (token ? "0.0.0.0" : "127.0.0.1");
if (!token) console.log("[unsaid] STUDIO_ACCESS_TOKEN not set: binding to 127.0.0.1 only.");
else console.log(`[unsaid] access token configured: binding to ${host}:${port}.`);
const child = spawn("node", ["node_modules/next/dist/bin/next", "start", "-H", host, "-p", port], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));

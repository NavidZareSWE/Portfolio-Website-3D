#!/usr/bin/env node
// Development server with test switches for the player model and device detection.
//
//   npm run dev                         normal (automatic choice)
//   npm run dev -- --lod high           force a model tier: very-low | low | medium | high | super
//   npm run dev -- --gpu software       simulate a GPU class: software | low | mid | high | unknown
//   npm run dev -- --net slow           simulate a connection: slow | limited | good | unknown
//   npm run dev -- --lod low --port 3001   any other flags go to `next dev`
//
// Works the same in cmd, PowerShell and bash (no shell-specific env syntax).
// The switches only exist in development; production builds ignore them.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const OPTIONS = {
  lod: {
    env: "NEXT_PUBLIC_DEV_LOD",
    values: ["very-low", "low", "medium", "high", "super"],
  },
  gpu: {
    env: "NEXT_PUBLIC_DEV_GPU",
    values: ["software", "low", "mid", "high", "unknown"],
  },
  net: {
    env: "NEXT_PUBLIC_DEV_NET",
    values: ["slow", "limited", "good", "unknown"],
  },
};

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage: npm run dev -- [--lod <tier>] [--gpu <class>] [--net <class>] [next dev flags]",
      ...Object.entries(OPTIONS).map(
        ([name, option]) => `  --${name}  ${option.values.join(" | ")}`,
      ),
    ].join("\n"),
  );
  process.exit(0);
}

const env = { ...process.env };
const passThrough = [];
for (let i = 0; i < args.length; i++) {
  const match = /^--(lod|gpu|net)(?:=(.*))?$/.exec(args[i]);
  if (!match) {
    passThrough.push(args[i]);
    continue;
  }
  const [, name, inline] = match;
  const value = inline ?? args[++i];
  const option = OPTIONS[name];
  if (!option.values.includes(value)) {
    console.error(
      `--${name} must be one of: ${option.values.join(", ")} (got "${value ?? ""}")`,
    );
    process.exit(1);
  }
  env[option.env] = value;
  console.log(`[dev] ${name} = ${value}`);
}

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", ...passThrough], {
  stdio: "inherit",
  env,
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));

#!/usr/bin/env node
/**
 * Pushes the local translation files (locales/<lng>/<ns>.json) to the
 * i18nexus project, so i18nexus stays the source of truth and `i18nexus pull`
 * gives every machine (and the Vercel build) the same files.
 *
 *   npm run i18n:push                      compare with i18nexus, list the changes, ask, upload
 *   npm run i18n:push -- --dry-run         only list the changes
 *   npm run i18n:push -- ui about          only these namespaces
 *   npm run i18n:push -- --yes             do not ask (for scripts)
 *
 * Needs, in .env or the environment:
 *   I18NEXUS_API_KEY                   the project's API key (same one `i18nexus pull` uses)
 *   I18NEXUS_PERSONAL_ACCESS_TOKEN     a personal access token with the "import strings" and
 *                                      "create namespaces" permissions (writes only)
 *
 * Uses the documented Project Resources API (https://i18nexus.com/api):
 *   GET  /project_resources/languages.json            project languages (as `i18nexus pull`)
 *   GET  /project_resources/translations/<lng>.json   current strings (as `i18nexus pull`)
 *   POST /project_resources/namespaces.json           { title }
 *   POST /project_resources/import.json               { namespace, languages, overwrite, confirm }
 *
 * The import overwrites existing keys with the local values and marks imported
 * non-base-language strings as confirmed. It never deletes: keys that exist only in
 * i18nexus are listed so they can be removed in the i18nexus dashboard.
 * Imports run asynchronously on i18nexus, so after each one the script downloads the
 * namespace again until it matches the local file (or reports what still differs).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline/promises";

const require = createRequire(import.meta.url);
// The same fetch helper `i18nexus pull` uses, so HTTPS_PROXY / HTTP_PROXY behave the same.
const handleFetch = require("i18nexus-cli/handleFetch");

const ROOT = process.cwd();
const LOCALES_DIR = path.join(ROOT, "locales");
const API = process.env.I18NEXUS_API_ORIGIN || "https://api.i18nexus.com";
/** i18nexus allows 5 imports per minute. */
const IMPORT_GAP_MS = 12_500;
const VERIFY_TIMEOUT_MS = 90_000;
const VERIFY_INTERVAL_MS = 3_000;
const LIST_LIMIT = 12;

/* ------------------------------------------------------------------ */
/* Setup                                                              */
/* ------------------------------------------------------------------ */

if (
  process.env.I18NEXUS_NO_DOT_ENV !== "true" &&
  existsSync(path.join(ROOT, ".env"))
) {
  process.loadEnvFile(path.join(ROOT, ".env"));
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const onlyNamespaces = args.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const assumeYes = flags.has("--yes");
const known = new Set(["--dry-run", "--yes"]);
for (const flag of flags) {
  if (!known.has(flag))
    fail(`Unknown option ${flag}. Options: --dry-run, --yes`);
}

const apiKey = process.env.I18NEXUS_API_KEY;
const token = process.env.I18NEXUS_PERSONAL_ACCESS_TOKEN;
if (!apiKey) fail("I18NEXUS_API_KEY is not set (add it to .env).");
if (!dryRun && !token) {
  fail(
    "I18NEXUS_PERSONAL_ACCESS_TOKEN is not set (add it to .env).\n" +
      "  Create one in your i18nexus account with the 'import strings' and 'create namespaces' permissions.",
  );
}
if (!existsSync(LOCALES_DIR)) fail(`No locales folder at ${LOCALES_DIR}`);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function fail(message) {
  console.error(`\n[i18n:push] ERROR: ${message}\n`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(method, route, body) {
  const url = `${API}/project_resources/${route}?api_key=${encodeURIComponent(apiKey)}`;
  for (let attempt = 1; ; attempt++) {
    const response = await handleFetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(method === "GET" ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429 && attempt < 3) {
      console.log("  rate limited by i18nexus, waiting 60 s ...");
      await sleep(60_000);
      continue;
    }
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.status < 200 || response.status >= 300) {
      const detail = json?.error?.message || text.slice(0, 300) || "(no body)";
      throw new Error(
        `${method} ${route} -> HTTP ${response.status}: ${detail}`,
      );
    }
    return json;
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${path.relative(ROOT, file)} is not valid JSON: ${error.message}`);
  }
}

/** Flattens nested objects and arrays to dot paths: { a: { b: ["x"] } } -> { "a.b.0": "x" }. */
function flatten(value, prefix = "", out = {}) {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value);
    if (entries.length === 0 && prefix) out[prefix] = value;
    for (const [key, child] of entries)
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out[prefix] = value;
  }
  return out;
}

function diff(local, remote) {
  const a = flatten(local ?? {});
  const b = flatten(remote ?? {});
  const added = [];
  const changed = [];
  const remoteOnly = [];
  for (const key of Object.keys(a)) {
    if (!(key in b)) added.push(key);
    else if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))
      changed.push(key);
  }
  for (const key of Object.keys(b)) if (!(key in a)) remoteOnly.push(key);
  return { added, changed, remoteOnly };
}

const listed = (keys) =>
  keys.slice(0, LIST_LIMIT).join(", ") +
  (keys.length > LIST_LIMIT ? `, ... (+${keys.length - LIST_LIMIT} more)` : "");

async function fetchRemote(languages) {
  const remote = {};
  for (const lng of languages)
    remote[lng] = (await request("GET", `translations/${lng}.json`)) ?? {};
  return remote;
}

/* ------------------------------------------------------------------ */
/* Compare                                                            */
/* ------------------------------------------------------------------ */

const languagesResponse = await request("GET", "languages.json").catch(
  (error) =>
    fail(
      `Could not read the project's languages. Check I18NEXUS_API_KEY.\n  ${error.message}`,
    ),
);
const projectLanguages = (languagesResponse?.collection ?? []).map(
  (lng) => lng.full_code,
);
if (projectLanguages.length === 0)
  fail("The i18nexus project returned no languages.");

const localLanguages = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const unknownLanguages = localLanguages.filter(
  (lng) => !projectLanguages.includes(lng),
);
if (unknownLanguages.length > 0) {
  fail(
    `locales/ has languages the i18nexus project does not: ${unknownLanguages.join(", ")} ` +
      `(project languages: ${projectLanguages.join(", ")}). Add them in i18nexus first.`,
  );
}
const languages = projectLanguages.filter((lng) =>
  localLanguages.includes(lng),
);

const localNamespaces = [
  ...new Set(
    languages.flatMap((lng) =>
      readdirSync(path.join(LOCALES_DIR, lng))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length)),
    ),
  ),
].sort();
const missingSelected = onlyNamespaces.filter(
  (ns) => !localNamespaces.includes(ns),
);
if (missingSelected.length > 0)
  fail(`No local files for: ${missingSelected.join(", ")}`);
const namespaces = onlyNamespaces.length > 0 ? onlyNamespaces : localNamespaces;

const local = {};
for (const lng of languages) {
  local[lng] = {};
  for (const ns of namespaces) {
    const file = path.join(LOCALES_DIR, lng, `${ns}.json`);
    if (existsSync(file)) local[lng][ns] = readJson(file);
  }
}

console.log(`[i18n:push] project languages: ${projectLanguages.join(", ")}`);
console.log("[i18n:push] downloading the current strings from i18nexus ...");
let remote = await fetchRemote(languages);

const plan = [];
for (const ns of namespaces) {
  const isNew = languages.every((lng) => remote[lng]?.[ns] === undefined);
  const changes = {};
  for (const lng of languages) {
    if (local[lng][ns] === undefined) continue;
    const d = diff(local[lng][ns], remote[lng]?.[ns]);
    if (d.added.length || d.changed.length || d.remoteOnly.length)
      changes[lng] = d;
  }
  const toUpload = Object.keys(changes).filter(
    (lng) => changes[lng].added.length || changes[lng].changed.length,
  );
  if (Object.keys(changes).length > 0)
    plan.push({ ns, isNew, changes, toUpload });
}

if (plan.length === 0) {
  console.log(
    "[i18n:push] i18nexus already matches locales/. Nothing to push.",
  );
  process.exit(0);
}

console.log("");
for (const { ns, isNew, changes } of plan) {
  console.log(`  ${ns}${isNew ? "  (new namespace, will be created)" : ""}`);
  for (const [lng, d] of Object.entries(changes)) {
    if (d.added.length)
      console.log(`    ${lng}  + ${d.added.length} new: ${listed(d.added)}`);
    if (d.changed.length)
      console.log(
        `    ${lng}  ~ ${d.changed.length} changed: ${listed(d.changed)}`,
      );
    if (d.remoteOnly.length) {
      console.log(
        `    ${lng}  - ${d.remoteOnly.length} only in i18nexus (NOT deleted): ${listed(d.remoteOnly)}`,
      );
    }
  }
}
console.log("");

const uploads = plan.filter((entry) => entry.toUpload.length > 0);
if (uploads.length === 0) {
  console.log(
    "[i18n:push] Nothing to upload. Keys that exist only in i18nexus must be deleted in the dashboard.",
  );
  process.exit(0);
}
if (dryRun) {
  console.log(
    `[i18n:push] Dry run: ${uploads.length} namespace(s) would be uploaded. Nothing was sent.`,
  );
  process.exit(0);
}

if (!assumeYes) {
  if (!process.stdin.isTTY)
    fail("Not an interactive terminal. Re-run with --yes to upload.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question(
    `Upload ${uploads.length} namespace(s) to i18nexus? Existing values for these keys will be overwritten. [y/N] `,
  );
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("[i18n:push] Cancelled. Nothing was sent.");
    process.exit(0);
  }
}

/* ------------------------------------------------------------------ */
/* Upload                                                             */
/* ------------------------------------------------------------------ */

let failures = 0;
let lastImportAt = 0;
for (const { ns, isNew, toUpload } of uploads) {
  try {
    if (isNew) {
      console.log(`[i18n:push] creating namespace "${ns}" ...`);
      await request("POST", "namespaces.json", { title: ns });
    }
    const wait = lastImportAt + IMPORT_GAP_MS - Date.now();
    if (wait > 0) {
      console.log(
        `  waiting ${Math.ceil(wait / 1000)} s (i18nexus allows 5 imports per minute) ...`,
      );
      await sleep(wait);
    }
    console.log(`[i18n:push] importing "${ns}" (${toUpload.join(", ")}) ...`);
    lastImportAt = Date.now();
    await request("POST", "import.json", {
      namespace: ns,
      languages: Object.fromEntries(
        toUpload.map((lng) => [lng, local[lng][ns]]),
      ),
      overwrite: true,
      confirm: true,
    });

    const deadline = Date.now() + VERIFY_TIMEOUT_MS;
    let pending = toUpload;
    while (pending.length > 0 && Date.now() < deadline) {
      await sleep(VERIFY_INTERVAL_MS);
      remote = await fetchRemote(pending);
      pending = pending.filter((lng) => {
        const d = diff(local[lng][ns], remote[lng]?.[ns]);
        return d.added.length > 0 || d.changed.length > 0;
      });
    }
    if (pending.length === 0) {
      console.log(`  OK: "${ns}" in i18nexus now matches locales/.`);
    } else {
      failures++;
      for (const lng of pending) {
        const d = diff(local[lng][ns], remote[lng]?.[ns]);
        console.log(
          `  WARNING: "${ns}" (${lng}) still differs after ${VERIFY_TIMEOUT_MS / 1000} s. ` +
            `Missing: ${listed(d.added) || "none"}. Different: ${listed(d.changed) || "none"}.`,
        );
      }
    }
  } catch (error) {
    failures++;
    console.log(`  FAILED: "${ns}": ${error.message}`);
  }
}

console.log("");
if (failures > 0) {
  console.log(
    `[i18n:push] Finished with ${failures} problem(s). Check them before running \`i18nexus pull\`.`,
  );
  process.exit(1);
}
console.log(
  "[i18n:push] Done. `i18nexus pull` now downloads these files as they are in locales/.",
);

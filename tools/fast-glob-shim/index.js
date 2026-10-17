"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS on purpose: loaded with require() by @next/eslint-plugin-next */
// @next/eslint-plugin-next only calls `globSync(pattern, { onlyDirectories: true })`
// (utils/get-root-dirs.js). fast-glob pulls in micromatch -> braces, which has an
// unpatched advisory (GHSA-vfj7-8cjw-p6xm). This shim keeps fast-glob's results:
// directory patterns are not expanded into their contents, and directories are
// returned without a trailing slash.
const tinyglobby = require("tinyglobby");

const withDefaults = (options = {}) => ({
  expandDirectories: false,
  ...options,
});
const unmark = (path) =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

function globSync(patterns, options) {
  return tinyglobby.globSync(patterns, withDefaults(options)).map(unmark);
}

async function glob(patterns, options) {
  return (await tinyglobby.glob(patterns, withDefaults(options))).map(unmark);
}

module.exports = { globSync, sync: globSync, glob, async: glob };

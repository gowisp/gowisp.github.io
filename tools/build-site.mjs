// Materializes the content-addressed parity build into a path-mirrored static
// tree that a plain file host (GitHub Pages) can serve.
//
// Must run on a POSIX filesystem: 130 captured asset paths contain characters
// (":") that Windows cannot represent in a filename. The repository itself only
// ever holds hash-named blobs, so it stays checkout-safe on Windows.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "site");

const NOINDEX_META =
  '<meta name="robots" content="noindex, nofollow, noarchive, noimageindex, nosnippet">';

// This file is served from the root of gowisp.github.io, so it governs every
// project Pages site on the host too. The capsule is disallowed; the pre-existing
// project sites are carved back out so their crawlability is left as it was.
const ROBOTS_TXT = `User-agent: *
Disallow: /
Allow: /roux-attorneys-concept/
Allow: /steyn-prokureurs-concept/
Allow: /armgate-pilot-flow/
`;

function isHtml(entry) {
  return (entry.headers?.["content-type"] ?? "").split(";")[0].trim() === "text/html";
}

// A request path becomes a file on disk. Two shapes need translation:
//   - HTML routes ("/why-terminal") -> a sibling "<route>.html". The host resolves
//     the extensionless request to it directly. A "<route>/index.html" directory
//     index would work for the host but 301s to "<route>/", and the app's router
//     does not match its own static routes with a trailing slash: every page but
//     the home route and the dynamic article route rendered a client-side 404.
//   - A path that is ALSO the parent directory of other paths (one captured
//     Storyblok base image whose transforms live beneath it) -> "<path>/index.html".
//     The host 301s "<path>" to "<path>/" and serves the bytes; <img> sniffs the
//     image regardless of the declared type.
function destinationFor(requestPath, { html, isDirectoryPrefix }) {
  const clean = requestPath.replace(/^\/+/u, "");
  if (requestPath === "/") return "index.html";
  if (html) return `${clean}.html`;
  if (isDirectoryPrefix) return path.posix.join(clean, "index.html");
  return clean;
}

function injectNoindex(documentText) {
  const headAt = documentText.indexOf("<head>");
  if (headAt === -1) throw new Error("Parity document has no <head> to carry the noindex directive.");
  const cut = headAt + "<head>".length;
  return `${documentText.slice(0, cut)}${NOINDEX_META}${documentText.slice(cut)}`;
}

async function writeAt(relativePath, bytes) {
  const target = path.join(OUT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

async function main() {
  if (path.sep !== "/") {
    throw new Error("build-site must run on a POSIX filesystem: captured asset paths contain ':'.");
  }

  const index = JSON.parse(await readFile(path.join(ROOT, "parity-index.json"), "utf8"));
  const entries = [...index.resources, ...index.frozenApi];

  for (const entry of entries) {
    if (entry.requestPath.includes("?") || entry.requestPath.includes("#")) {
      throw new Error(`A static host cannot route on a query or fragment: ${entry.requestPath}`);
    }
  }

  // Every path that is a parent of another path must exist as a directory.
  const directoryPrefixes = new Set();
  for (const entry of entries) {
    const segments = entry.requestPath.split("/");
    for (let i = 1; i < segments.length; i += 1) directoryPrefixes.add(segments.slice(0, i).join("/"));
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  let documents = 0;
  let collisions = 0;

  for (const entry of entries) {
    const html = isHtml(entry);
    const isDirectoryPrefix = !html && directoryPrefixes.has(entry.requestPath);
    if (isDirectoryPrefix) {
      collisions += 1;
      console.log(`collision resolved as a directory index: ${entry.requestPath}`);
    }
    const destination = destinationFor(entry.requestPath, { html, isDirectoryPrefix });
    const source = path.join(ROOT, entry.contentPath);

    if (html) {
      const patched = injectNoindex(await readFile(source, "utf8"));
      await writeAt(destination, patched);
      documents += 1;
    } else {
      await writeAt(destination, await readFile(source));
    }
  }

  // Routes the capsule's parity server answers itself rather than from the index.
  await writeAt("__parity/bootstrap.js", await readFile(path.join(ROOT, "patches", "bootstrap.js")));
  await writeAt("__parity/accessibility.css", await readFile(path.join(ROOT, "patches", "accessibility.css")));
  await writeAt("__parity/blocked/gtm.js", ""); // the neutralized analytics loader: a 200 with no body
  await writeAt(
    "__parity/health/index.html",
    `${JSON.stringify({ status: "static", snapshotIdentity: index.snapshotIdentity, outputDigest: index.outputDigest })}\n`,
  );

  // Jekyll would swallow every /_nuxt/ asset without this.
  await writeAt(".nojekyll", "");
  await writeAt("robots.txt", ROBOTS_TXT);
  await writeAt(
    "404.html",
    `<!DOCTYPE html><html lang="en"><head>${NOINDEX_META}<meta charset="utf-8"><title>Not in the capsule</title>` +
      `<style>body{font:14px/1.6 system-ui,sans-serif;margin:4rem auto;max-width:34rem;padding:0 1.5rem;color:#222}</style>` +
      `</head><body><h1>Not in the capsule</h1><p>This path was not part of the captured Representative Slice. ` +
      `<a href="/">Return to the home route</a>.</p></body></html>\n`,
  );

  console.log(
    JSON.stringify({
      snapshotIdentity: index.snapshotIdentity,
      outputDigest: index.outputDigest,
      resources: index.resources.length,
      frozenApi: index.frozenApi.length,
      documents,
      collisions,
    }),
  );
}

await main();

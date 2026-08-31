# Terminal Industries capsule preview

Live at <https://gowisp.github.io/>.

Browsing convenience only. This repository hosts the **already-built** parity
output of the Terminal Industries Pilot Capsule so the Representative Slice can
be opened in a browser without a local Node runtime.

It is not evidence. The capsule at
`Consulting/Interactive Website Studio/reference-capsules/terminal-industries`
remains the sole source of record for snapshots, replay, parity, releases and
the Difference Register. Nothing here is hash-anchored and nothing here should
ever be cited in a release manifest.

## What is in here

| Path | What it is |
| --- | --- |
| `parity-index.json` | The parity build index, copied verbatim from `parity/public/`. |
| `content/` | The 1,174 content-addressed blobs the index points at, copied verbatim. |
| `patches/` | `bootstrap.js` and `accessibility.css`, the two runtime assets the parity server serves from `parity/patches/`. |
| `tools/build-site.mjs` | Expands the index into a path-mirrored tree under `site/`. |

`site/` is generated, never committed.

## Why a build step

The parity build is content-addressed: every asset lives at `content/<sha256>`
and the parity server maps request paths onto it at runtime. A static file host
has no such server, so the tree has to be materialized.

That materialization can only run on a POSIX filesystem. 130 captured Storyblok
transform paths contain `:` (`filters:format(webp):quality(85)`), which Windows
cannot put in a filename. Keeping the repository hash-named and expanding it on
the Ubuntu runner means the checkout stays valid on Ben's machine while the
deployed tree still mirrors the captured paths exactly.

## Refreshing after a capsule rebuild

From the capsule:

```powershell
npm run parity:build
```

Then copy `parity/public/parity-index.json` and `parity/public/content/` over
the copies here, commit, and push. The push deploys.

## Known departures from `npm run parity:serve`

A static host is weaker than the capsule's own server. Three differences:

- `POST /__parity/mock/forms` cannot exist, so a contact form submission fails
  in the browser instead of returning the deterministic local receipt.
- Response headers are the host's, not the captured ones. The parity server's
  CSP, `cache-control` and `etag` values are not reproduced, and the 130
  extensionless Storyblok transforms arrive as `application/octet-stream`
  (browsers sniff them into `<img>` correctly).
- One captured base image is both a file and a parent directory, so it is served
  through a directory index and reaches the browser after a 301.

For fidelity work use the capsule's own runtime, not this preview.

## Why the user site and not a project path

The parity documents reference absolute root paths (`/_nuxt/...`,
`/__replay/source/...`, `/__parity/bootstrap.js`). Served under
`gowisp.github.io/<repo>/` every one of them would 404, and rewriting them would
mean editing the byte-faithful documents and still missing the URLs Nuxt builds
at runtime. Serving from the root of `gowisp.github.io` is what keeps the
documents unedited.

## Search engines

Every deployed document carries `noindex, nofollow, noarchive, noimageindex,
nosnippet` and the root serves a `Disallow: /` robots.txt. GitHub Pages cannot
set an `X-Robots-Tag` header, so those two are the ceiling. **The URL is public
to anyone who has it** - noindex keeps it out of search results, it does not put
a lock on the door.

Because robots.txt is per host, this one also governs every project Pages site
under `gowisp.github.io`. The three that existed before this repository -
`roux-attorneys-concept`, `steyn-prokureurs-concept`, `armgate-pilot-flow` - are
carved back out with `Allow:` rules so their crawlability is unchanged. A new
project site needs its own `Allow:` line in `tools/build-site.mjs` or it
inherits the disallow.

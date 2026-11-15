# Publishing checklist

Everything here is done once, by the maintainer. The repository is prepared; what remains is
creating it on GitHub, pointing the metadata at it, and tagging the release.

## 1. Pre-flight

```bash
npm run check            # build + 47 tests + universality lint
npm run build
node packages/cli/dist/index.js doctor
git status               # must be clean
```

`doctor` may report a broken audit chain if you reused an old `~/.appbridge` from before the
lock fix. That is expected; run `appbridge audit rotate` to archive it.

## 2. Create the repository

With the GitHub CLI:

```bash
gh auth login
gh repo create appbridge --public --source=. --remote=origin --push
```

Or create an empty repository in the web UI, then:

```bash
git remote add origin https://github.com/<owner>/appbridge.git
git push -u origin main
```

## 3. Fill in the real repository coordinates

Badges, clone URLs and package metadata use `OWNER/REPO` placeholders:

```bash
npm run repo:set -- <owner>/appbridge
git add -A
git commit -m "chore: point metadata at the repository"
git push
```

This rewrites `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, the issue-template links and all
`package.json` repository fields, and enables the CI badge in the README.

## 4. Repository settings

- **About:** use the first line of the README as the description; add topics:
  `computer-use`, `desktop-automation`, `mcp`, `accessibility`, `windows`, `ai-agent`,
  `safety`.
- **Social preview:** upload `docs/assets/architecture.svg` exported to PNG (1280×640).
- **Features:** enable Discussions (the issue template links to it); keep Issues on.
- **Security:** enable private vulnerability reporting (Security → Advisories) so
  `SECURITY.md` has a working channel.
- **Actions:** allow the workflow shipped in `.github/workflows/ci.yml`; it needs no secrets.
- **Branches:** protect `main` — require the `build · test · lint (Windows)` check, require a
  pull request, no force pushes.
- **Releases:** enable tags; the release workflow is manual for now.

## 5. Tag the first release

```bash
git tag -a v0.1.0 -m "v0.1.0 — first public slice"
git push origin v0.1.0
```

Create a GitHub release from the tag and paste the `0.1.0` section of
[`CHANGELOG.md`](../CHANGELOG.md). Mark it "pre-release" — the build is Windows-only and the
API is not frozen.

## 6. After publishing

- Confirm the CI badge is green and the README renders (tables, SVG, code fences).
- Check that `SETUP` works from a clean clone on a second machine:
  `npm install && npm run build && appbridge doctor`.
- Add the repository to the MCP server registry once packaging is sorted (gap_plan P0-4);
  do not claim a one-command install before `npm i -g` actually ships the native host.
- Keep the "Honest limits" section current. It is the main trust signal in this category.

## Not ready to publish yet

- **npm:** packages are `private`. `npm pack --dry-run` succeeds, but a published CLI must
  ship `packages/floor/native/uia-host.ps1` and resolve workspace dependencies. Untested.
- **Installers:** no signed MSI/zip, no `winget` manifest.
- **macOS/Linux:** no drivers; do not advertise them.

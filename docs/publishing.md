# Publishing and release process

Appbridge is already public at
[`burhanfarrukh13/appbridge`](https://github.com/burhanfarrukh13/appbridge). The repository
uses version tags as release triggers; pushing a `vX.Y.Z` tag runs the Windows release
workflow, which tests the code, builds the desktop app, packages the portable ZIP, and
publishes a GitHub pre-release with the ZIP and SHA-256 checksum.

## Before tagging

1. Update all root/workspace package versions, internal workspace dependency versions,
   `apps/desktop/pubspec.yaml`, the desktop version label, and `CHANGELOG.md`.
2. Verify a clean build and tests:

   ```powershell
   npm ci
   npm run check
   Push-Location apps/desktop
   flutter pub get --enforce-lockfile
   flutter test
   flutter analyze
   Pop-Location
   ```

3. Ensure the release notes describe shipped behavior and known limits. The release workflow
   uses the matching changelog section.
4. Merge the changes to `main` and verify the CI checks pass.

## Build a portable Windows ZIP locally

On Windows with Node.js, npm, Flutter, and Visual Studio C++ desktop tools installed:

```powershell
npm ci
npm run check
Push-Location apps/desktop
flutter pub get --enforce-lockfile
flutter test
flutter analyze
flutter build windows --release --build-name 0.0.2 --build-number 1
Pop-Location
.\scripts\package-windows-release.ps1 -Version 0.0.2
```

The package script validates the app versions, installs production workspace dependencies
into a staging directory, includes the official Node.js binary and its license, checks the
Node.js archive checksum, and emits `Appbridge-0.0.2-windows-x64.zip` plus a `.sha256` file
under `.release\`. It does not publish or change Git state.

## Publish a release

After merging and confirming CI is green:

```powershell
git tag -a v0.0.2 -m "Appbridge 0.0.2"
git push origin v0.0.2
```

The `Windows release` workflow publishes the pre-release automatically. Confirm that the
ZIP and checksum appear under the matching release and verify the checksum before
redistribution. The release is Windows x64 only, unsigned, and pre-1.0.

## Publish the packages to npm

All eight workspaces are publish-ready: no `private` flag, an explicit `files` whitelist,
`engines`, and `publishConfig.access: public`. Verify before publishing:

```bash
npm run build
npm run pack:check        # every tarball contains what install needs
```

Publish in dependency order, because each package resolves its workspace siblings from the
registry once installed:

```bash
npm publish --workspace @appbridge/core
npm publish --workspace @appbridge/safety
npm publish --workspace @appbridge/floor
npm publish --workspace @appbridge/memory
npm publish --workspace @appbridge/providers
npm publish --workspace @appbridge/gateway
npm publish --workspace @appbridge/connect
npm publish --workspace @appbridge/cli
```

The scope must exist on npm and the account must be authenticated (`npm login`, or a
`NODE_AUTH_TOKEN` in CI). `@appbridge/floor` ships `native/uia-host.ps1` inside its
tarball — if that file is ever dropped from `files`, every installed copy fails at the
first UI Automation call, which is what `pack:check` exists to catch.

## Submit the winget manifest

`packaging/winget` holds version, installer and en-US locale manifests for the portable
ZIP, with the URL and SHA-256 of the published release artifact.

```bash
winget validate --manifest packaging/winget
```

For each release: bump `PackageVersion` in all three files, replace `InstallerSha256` with
the hash published next to the ZIP, then submit the three files to
[`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) under
`manifests/b/BurhanQureshi/Appbridge/<version>/` (a `wingetcreate update` PR is the usual
route). Do not submit a manifest whose hash does not match the asset — winget installs
will fail in a way users cannot debug.

## Build the agent skill zip

```bash
npm run package:skill
```

Writes `.release/appbridge-computer-use-<version>.zip` plus a `.sha256`. The script fails
closed on: more or fewer than one top-level folder, a missing or malformed `SKILL.md`
frontmatter, a name that does not match the folder, a thin instruction body, any script or
binary file, secrets, obfuscation, remote-code-execution or install commands. That mirrors
the checks a skill marketplace runs, so a package that builds here should pass review.

## Repository maintenance

- **About:** use a concise description and relevant topics such as `computer-use`,
  `desktop-automation`, `mcp`, `accessibility`, `windows`, `ai-agent`, and `safety`.
- **Discussions:** keep enabled because the issue template links there; keep Issues enabled.
- **Security:** keep secret scanning and push protection enabled, enable Dependabot security
  updates and private vulnerability reporting.
- **Branches:** protect `main`; require the `build · test · lint (Windows)` check and a pull
  request, and disallow force pushes.
- **Actions:** the CI and release workflows use GitHub-hosted runners and `GITHUB_TOKEN`;
  no repository secrets are required.
- **Social preview:** optional; add a 1280×640 image in repository settings when one is
  available.

The app's native host supports Windows only. Do not describe the ZIP as an installer, a
signed application, or a macOS/Linux build.

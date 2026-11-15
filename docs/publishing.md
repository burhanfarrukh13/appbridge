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
flutter build windows --release --build-name 0.0.1 --build-number 1
Pop-Location
.\scripts\package-windows-release.ps1 -Version 0.0.1
```

The package script validates the app versions, installs production workspace dependencies
into a staging directory, includes the official Node.js binary and its license, checks the
Node.js archive checksum, and emits `Appbridge-0.0.1-windows-x64.zip` plus a `.sha256` file
under `.release\`. It does not publish or change Git state.

## Publish a release

After merging and confirming CI is green:

```powershell
git tag -a v0.0.1 -m "Appbridge 0.0.1"
git push origin v0.0.1
```

The `Windows release` workflow publishes the pre-release automatically. Confirm that the
ZIP and checksum appear under the matching release and verify the checksum before
redistribution. The release is Windows x64 only, unsigned, and pre-1.0.

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

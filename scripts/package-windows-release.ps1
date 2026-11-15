[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$OutputDirectory = ".release",
  [string]$NodeVersion = "24.15.0"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputPath = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectory
} else {
  Join-Path $repositoryRoot $OutputDirectory
}
$releaseName = "Appbridge-$Version-windows-x64"
$archiveName = "$releaseName.zip"
$desktopBuild = Join-Path $repositoryRoot "apps\desktop\build\windows\x64\runner\Release"
$package = Get-Content (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json
$lockText = Get-Content (Join-Path $repositoryRoot "package-lock.json") -Raw
$lockVersionMatch = [regex]::Match($lockText, '(?m)^\s*"version":\s*"([^"]+)"')
$pubspec = Get-Content (Join-Path $repositoryRoot "apps\desktop\pubspec.yaml") -Raw

if ($package.version -ne $Version -or !$lockVersionMatch.Success -or $lockVersionMatch.Groups[1].Value -ne $Version) {
  throw "The root package and lockfile must both be version $Version."
}
if ($pubspec -notmatch "(?m)^version:\s+$([regex]::Escape($Version))\+1\s*$") {
  throw "apps/desktop/pubspec.yaml must be version $Version+1."
}
foreach ($workspaceManifest in Get-ChildItem (Join-Path $repositoryRoot "packages") -Directory) {
  $manifestPath = Join-Path $workspaceManifest.FullName "package.json"
  if (!(Test-Path $manifestPath)) { continue }
  $workspace = Get-Content $manifestPath -Raw | ConvertFrom-Json
  if ($workspace.version -ne $Version) {
    throw "$($workspace.name) must be version $Version, found $($workspace.version)."
  }
}
if (!(Test-Path (Join-Path $desktopBuild "appbridge_desktop.exe"))) {
  throw "Flutter Release output is missing. Build apps/desktop for Windows first."
}

$staging = Join-Path ([System.IO.Path]::GetTempPath()) "appbridge-release-$([guid]::NewGuid().ToString('N'))"
try {
  $appDirectory = Join-Path $staging $releaseName
  $runtime = Join-Path $appDirectory "runtime"
  $nodeDirectory = Join-Path $staging "node"
  New-Item -ItemType Directory -Path $runtime, $nodeDirectory, $outputPath -Force | Out-Null

  Copy-Item (Join-Path $desktopBuild "*") $appDirectory -Recurse -Force
  Copy-Item (Join-Path $repositoryRoot "package.json") $runtime
  Copy-Item (Join-Path $repositoryRoot "package-lock.json") $runtime
  foreach ($workspaceManifest in Get-ChildItem (Join-Path $repositoryRoot "packages") -Directory) {
    $sourcePackage = $workspaceManifest.FullName
    $targetPackage = Join-Path $runtime "packages\$($workspaceManifest.Name)"
    $distDirectory = Join-Path $sourcePackage "dist"
    if (!(Test-Path $distDirectory)) {
      throw "Build output is missing: $distDirectory. Run npm run build first."
    }
    New-Item -ItemType Directory -Path $targetPackage -Force | Out-Null
    Copy-Item (Join-Path $sourcePackage "package.json") $targetPackage
    Copy-Item $distDirectory $targetPackage -Recurse
    $nativeDirectory = Join-Path $sourcePackage "native"
    if (Test-Path $nativeDirectory) {
      Copy-Item $nativeDirectory $targetPackage -Recurse
    }
  }

  $nodeArchiveName = "node-v$NodeVersion-win-x64.zip"
  $nodeBaseUrl = "https://nodejs.org/dist/v$NodeVersion"
  $nodeArchive = Join-Path $staging $nodeArchiveName
  $checksums = Join-Path $staging "SHASUMS256.txt"
  & curl.exe --fail --location --silent --show-error --output $nodeArchive "$nodeBaseUrl/$nodeArchiveName"
  if ($LASTEXITCODE -ne 0) { throw "Could not download the official Node.js archive." }
  & curl.exe --fail --location --silent --show-error --output $checksums "$nodeBaseUrl/SHASUMS256.txt"
  if ($LASTEXITCODE -ne 0) { throw "Could not download the Node.js checksums." }

  $checksumLine = Select-String -Path $checksums -Pattern "^([0-9a-fA-F]{64})\s+$([regex]::Escape($nodeArchiveName))$" |
    Select-Object -First 1
  if (!$checksumLine) { throw "The Node.js archive is not listed in SHASUMS256.txt." }
  $expectedHash = $checksumLine.Matches[0].Groups[1].Value.ToLowerInvariant()
  $actualHash = (Get-FileHash $nodeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) { throw "The Node.js archive checksum does not match." }

  Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeDirectory
  $nodeDistribution = Join-Path $nodeDirectory "node-v$NodeVersion-win-x64"
  Copy-Item (Join-Path $nodeDistribution "node.exe") (Join-Path $runtime "node.exe")
  Copy-Item (Join-Path $nodeDistribution "LICENSE") (Join-Path $appDirectory "LICENSE.nodejs.txt")

  Push-Location $runtime
  try {
    & npm.cmd ci --omit=dev
    if ($LASTEXITCODE -ne 0) { throw "Could not install production workspace dependencies." }
  } finally {
    Pop-Location
  }

  $workspaceModules = Join-Path $runtime "node_modules\@appbridge"
  foreach ($workspaceManifest in Get-ChildItem (Join-Path $repositoryRoot "packages") -Directory) {
    $moduleName = $workspaceManifest.Name
    $modulePath = Join-Path $workspaceModules $moduleName
    if (Test-Path $modulePath) {
      $module = Get-Item -LiteralPath $modulePath -Force
      if ($module.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        [System.IO.Directory]::Delete($modulePath)
      } else {
        Remove-Item -LiteralPath $modulePath -Recurse -Force -Confirm:$false
      }
    }
    New-Item -ItemType Directory -Path $modulePath -Force | Out-Null
    Copy-Item (Join-Path (Join-Path $runtime "packages\$moduleName") "*") $modulePath -Recurse -Force
  }

  $cli = Join-Path $runtime "packages\cli\dist\index.js"
  $cliVersion = (& (Join-Path $runtime "node.exe") $cli version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $cliVersion -ne "appbridge $Version") {
    throw "Packaged CLI version check failed (expected $Version, got '$cliVersion')."
  }

  Copy-Item (Join-Path $repositoryRoot "docs\install-windows.md") (Join-Path $appDirectory "INSTALL.md")
  Copy-Item (Join-Path $repositoryRoot "LICENSE") (Join-Path $appDirectory "LICENSE")
  Copy-Item (Join-Path $repositoryRoot "SECURITY.md") (Join-Path $appDirectory "SECURITY.md")

  $archivePath = Join-Path $outputPath $archiveName
  if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
  Compress-Archive -Path (Join-Path $appDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal
  $verificationDirectory = Join-Path $staging "verification"
  Expand-Archive -LiteralPath $archivePath -DestinationPath $verificationDirectory
  $verificationRuntime = Join-Path $verificationDirectory "runtime"
  $verificationNode = Join-Path $verificationRuntime "node.exe"
  $verificationCli = Join-Path $verificationRuntime "packages\cli\dist\index.js"
  $verifiedVersion = (& $verificationNode $verificationCli version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $verifiedVersion -ne "appbridge $Version") {
    throw "Extracted ZIP CLI check failed (expected appbridge $Version, got '$verifiedVersion')."
  }
  & $verificationNode $verificationCli help | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Extracted ZIP CLI help check failed." }
  $verificationExecutable = Join-Path $verificationDirectory "appbridge_desktop.exe"
  foreach ($requiredPath in @(
    "appbridge_desktop.exe",
    "data\flutter_assets\NOTICES.Z",
    "LICENSE",
    "LICENSE.nodejs.txt",
    "runtime\node.exe",
    "runtime\packages\floor\native\uia-host.ps1"
  )) {
    if (!(Test-Path (Join-Path $verificationDirectory $requiredPath))) {
      throw "The extracted ZIP is missing required file: $requiredPath."
    }
  }
  $productVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($verificationExecutable).ProductVersion
  if ($productVersion -notlike "$Version*") {
    throw "Extracted desktop executable version is '$productVersion', expected $Version."
  }
  $archiveHash = (Get-FileHash $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$archivePath.sha256" -Value "$archiveHash  $archiveName" -Encoding ASCII
  Write-Output "ZIP: $archivePath"
  Write-Output "SHA256: $archiveHash"
} finally {
  if (Test-Path $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
  }
}

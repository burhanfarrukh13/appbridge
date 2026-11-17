<#
.SYNOPSIS
    Validate the agent skill package and build the submission zip.

.DESCRIPTION
    The skill that ships to marketplaces (SKILL.md + reference files) follows rules the
    repository does not otherwise enforce: one top-level folder, SKILL.md at its root,
    frontmatter with a real name and description, text files only, no secrets, no
    obfuscation, no install commands. This script checks all of that and then writes
    .release/<name>-<version>.zip plus a SHA-256 file.

    It fails closed: any missing rule stops the package from being built.
#>
[CmdletBinding()]
param(
    [string]$Version = "",
    [string]$OutputDirectory = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$skillRoot = Join-Path $repositoryRoot "skill"

function Stop-Package([string]$Message) {
    throw "skill package invalid: $Message"
}

if (-not (Test-Path -LiteralPath $skillRoot -PathType Container)) {
    Stop-Package "no skill/ directory at $skillRoot"
}

$packages = @(Get-ChildItem -LiteralPath $skillRoot -Directory)
if ($packages.Count -ne 1) {
    Stop-Package "skill/ must contain exactly one package folder, found $($packages.Count)"
}
$package = $packages[0]
$name = $package.Name
$skillFile = Join-Path $package.FullName "SKILL.md"
if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
    Stop-Package "$name/SKILL.md is missing"
}

# --- files: text only, bounded size -----------------------------------------------------
$forbiddenExtensions = @(".exe", ".dll", ".msi", ".zip", ".ps1", ".sh", ".bat", ".cmd", ".py", ".js", ".mjs", ".wasm")
$files = @(Get-ChildItem -LiteralPath $package.FullName -Recurse -File)
if ($files.Count -gt 20) {
    Stop-Package "a skill package should stay small; $($files.Count) files found"
}
$totalBytes = 0
foreach ($file in $files) {
    if ($forbiddenExtensions -contains $file.Extension.ToLowerInvariant()) {
        Stop-Package "$($file.Name) is an executable or script; this skill ships instructions only"
    }
    $totalBytes += $file.Length
}
if ($totalBytes -gt 2MB) {
    Stop-Package "package is $([math]::Round($totalBytes / 1MB, 2)) MB; the limit is 2 MB"
}

# --- SKILL.md: frontmatter and a real body ----------------------------------------------
$lines = @(Get-Content -LiteralPath $skillFile)
if ($lines.Count -lt 40) {
    Stop-Package "SKILL.md has $($lines.Count) lines; that is not enough instruction to be useful"
}
if ($lines[0].Trim() -ne "---") {
    Stop-Package "SKILL.md must start with a '---' frontmatter block"
}
$closing = -1
for ($i = 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "---") { $closing = $i; break }
}
if ($closing -lt 0) {
    Stop-Package "SKILL.md frontmatter is not closed with '---'"
}

$frontmatter = @{}
for ($i = 1; $i -lt $closing; $i++) {
    $line = $lines[$i]
    if ($line -match '^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$') {
        $frontmatter[$Matches[1]] = $Matches[2].Trim()
    }
}
foreach ($key in @("name", "description")) {
    if (-not $frontmatter.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($frontmatter[$key])) {
        Stop-Package "frontmatter is missing a non-empty '$key'"
    }
}
if ($frontmatter["name"] -ne $name) {
    Stop-Package "frontmatter name '$($frontmatter['name'])' does not match folder '$name'"
}
if ($frontmatter["description"].Length -lt 80) {
    Stop-Package "description is $($frontmatter['description'].Length) characters; it has to say when to use the skill"
}
$bodyLines = @($lines[($closing + 1)..($lines.Count - 1)] | Where-Object { $_.Trim().Length -gt 0 })
if ($bodyLines.Count -lt 25) {
    Stop-Package "SKILL.md body has $($bodyLines.Count) non-empty lines; add real instructions"
}

# --- content scan: secrets, obfuscation, install commands --------------------------------
$patterns = @(
    @{ Name = "private key";              Regex = 'BEGIN [A-Z ]*PRIVATE KEY' },
    @{ Name = "hardcoded credential";     Regex = '(api[_-]?key|secret|password|token)\s*[:=]\s*["'']?[A-Za-z0-9_\-]{12,}' },
    @{ Name = "obfuscated blob";          Regex = 'base64\s+(-d|--decode)' },
    @{ Name = "remote code execution";    Regex = '(Invoke-Expression|\biex\b|curl[^\r\n]*\|\s*(ba)?sh|iwr[^\r\n]*\|\s*iex)' },
    @{ Name = "install command";          Regex = '(npm\s+(i|install)\s+-g|pip\s+install|winget\s+install|choco\s+install|msiexec)' },
    @{ Name = "prompt-injection override"; Regex = '(ignore (all |the )?(previous|prior|above) instructions|disregard your (guidelines|instructions|policy))' }
)
foreach ($file in $files) {
    if ($file.Extension -notin @(".md", ".txt", ".json", ".yaml", ".yml")) { continue }
    $text = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($pattern in $patterns) {
        if ($text -match $pattern.Regex) {
            Stop-Package "$($file.Name) matches '$($pattern.Name)': remove it, or move it into the human's setup steps"
        }
    }
}

# --- zip: one top-level folder, SKILL.md at its root ------------------------------------
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot ".release"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$archive = Join-Path $OutputDirectory "$name-$Version.zip"
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }

# Compress-Archive on Windows PowerShell 5.1 writes backslash entry names, which the zip
# spec and every marketplace validator reject, so entries are written explicitly.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$entries = @()
$zip = [System.IO.Compression.ZipFile]::Open($archive, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($package.FullName.Length).TrimStart('\', '/') -replace '\\', '/'
        $entryName = "$name/$relative"
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $file.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
        $entries += $entryName
    }
} finally {
    $zip.Dispose()
}
$skillEntry = "$name/SKILL.md"
if ($entries -notcontains $skillEntry) {
    Stop-Package "the archive has no $skillEntry at its root (entries: $($entries -join ', '))"
}
$stray = @($entries | Where-Object { -not $_.StartsWith("$name/") })
if ($stray.Count -gt 0) {
    Stop-Package "the archive has entries outside $name/: $($stray -join ', ')"
}

$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $archive)" | Set-Content -LiteralPath "$archive.sha256" -Encoding ascii

Write-Output "skill package: $(Split-Path -Leaf $archive)"
Write-Output "entries:       $($entries.Count)"
Write-Output "size:          $([math]::Round((Get-Item -LiteralPath $archive).Length / 1KB, 1)) KB"
Write-Output "sha256:        $hash"

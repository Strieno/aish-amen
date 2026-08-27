param(
  [string]$ProjectPath = ""
)
$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Payload = Join-Path $PatchRoot "payload"

Write-Host "=== Aish Amen DeepSeek Hobby Fix ===" -ForegroundColor Cyan
if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
  $ProjectPath = Read-Host "Paste the FULL path to your local aish-amen project folder"
}
$ProjectPath = $ProjectPath.Trim('"')
if (-not (Test-Path (Join-Path $ProjectPath "vercel.json"))) {
  throw "This does not look like the aish-amen project root: $ProjectPath"
}

Write-Host "Project: $ProjectPath" -ForegroundColor Yellow

# Delete old AI endpoints. These are the files that made Vercel Hobby exceed 12 Functions.
$oldPaths = @(
  "api\ai",
  "api\chat",
  "api\conversations\[id]\categorize.ts",
  "api\links\discover.ts",
  "api\providers\[id]\test.ts",
  "api\chat.ts"
)
foreach ($rel in $oldPaths) {
  $target = Join-Path $ProjectPath $rel
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Deleted old function: $rel" -ForegroundColor DarkGray
  }
}

# Copy final consolidated implementation.
Copy-Item -Path (Join-Path $Payload "*") -Destination $ProjectPath -Recurse -Force
Write-Host "Copied consolidated DeepSeek Cloud files." -ForegroundColor Green

# Count actual Vercel API files after cleanup. Existing api/[...path].js is intentionally preserved.
$apiDir = Join-Path $ProjectPath "api"
$functionFiles = @(Get-ChildItem -LiteralPath $apiDir -Recurse -File | Where-Object { $_.Extension -in '.js','.mjs','.cjs','.ts' })
Write-Host "API files now present: $($functionFiles.Count)" -ForegroundColor Cyan
$functionFiles | ForEach-Object { Write-Host (" - " + $_.FullName.Substring($ProjectPath.Length + 1)) }

Write-Host ""
Write-Host "Done. Open GitHub Desktop -> commit ALL changes -> Push origin." -ForegroundColor Green
Write-Host "Suggested commit: Consolidate DeepSeek cloud routes for Vercel Hobby" -ForegroundColor Green

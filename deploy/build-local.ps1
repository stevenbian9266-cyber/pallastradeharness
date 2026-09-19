<#
.SYNOPSIS
  harness 托管 MCP 服务：本机构建 + 离线产物（docker save → gzip → manifest）。

.DESCRIPTION
  服务器不做构建（2C/8G，历史上磁盘满/OOM）。本脚本在本机：
    1) docker build 出 harness-mcp:<version>-<short-sha>
    2) docker save 成 tar → gzip 压缩到 artifacts/dist/
    3) 写 manifest.json（含 sha256 / 镜像 digest / git sha），作为交付与回滚的单一事实源
  产物随后由 publish-local.ps1 上传。

.EXAMPLE
  pwsh deploy/build-local.ps1
  pwsh deploy/build-local.ps1 -Tag 1.10.0-test1
#>
[CmdletBinding()]
param(
  [string]$Tag,
  [string]$OutDir = "artifacts/dist",
  [string]$NodeBase = "",
  [switch]$KeepTar
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Windows PowerShell 5.1 会把原生命令的 stderr 变成 ErrorRecord；在 $ErrorActionPreference='Stop' 下
# 直接中止脚本（docker 的构建进度就写在 stderr）。故原生调用统一走本助手，用 $LASTEXITCODE 判成败。
function Invoke-Native {
  param([string]$Exe, [string[]]$Argv)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Exe @Argv 2>&1 | ForEach-Object { Write-Host $_ }
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
}

Push-Location $repoRoot
try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'docker not found in PATH' }

  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $sha = (git rev-parse --short HEAD).Trim()
  if ([string]::IsNullOrWhiteSpace($Tag)) { $Tag = "$version-$sha" }
  $image = "harness-mcp:$Tag"

  Write-Host "→ building $image from deploy/Dockerfile" -ForegroundColor Cyan
  $buildArgs = @('build', '-f', 'deploy/Dockerfile', '-t', $image)
  if ($NodeBase) { $buildArgs += @('--build-arg', "NODE_BASE=$NodeBase") }
  $buildArgs += '.'
  if ((Invoke-Native docker $buildArgs) -ne 0) { throw 'docker build failed' }

  $digest = (docker inspect --format '{{index .Id}}' $image).Trim()

  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $tarPath = Join-Path $OutDir "harness-mcp-$Tag.tar"
  $gzPath = "$tarPath.gz"
  foreach ($p in @($tarPath, $gzPath)) { if (Test-Path $p) { Remove-Item $p -Force } }

  Write-Host "→ saving image to $tarPath" -ForegroundColor Cyan
  if ((Invoke-Native docker @('save', '-o', $tarPath, $image)) -ne 0) { throw 'docker save failed' }

  Write-Host "→ gzip $(Split-Path -Leaf $tarPath)" -ForegroundColor Cyan
  # Windows PowerShell 5.1 需要显式加载压缩程序集（pwsh 7 已内置）
  Add-Type -AssemblyName System.IO.Compression | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue | Out-Null
  $in = [System.IO.File]::OpenRead($tarPath)
  try {
    $out = [System.IO.File]::Create($gzPath)
    try {
      $gz = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionLevel]::Optimal)
      try { $in.CopyTo($gz) } finally { $gz.Dispose() }
    } finally { $out.Dispose() }
  } finally { $in.Dispose() }
  if (-not $KeepTar) { Remove-Item $tarPath -Force }

  $sha256 = (Get-FileHash $gzPath -Algorithm SHA256).Hash.ToLower()
  $bytes = (Get-Item $gzPath).Length
  $manifest = [ordered]@{
    tag         = $Tag
    image       = $image
    imageDigest = $digest
    gitSha      = $sha
    version     = $version
    file        = (Split-Path -Leaf $gzPath)
    bytes       = $bytes
    sha256      = $sha256
    builtAt     = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  }
  $manifestPath = Join-Path $OutDir 'manifest.json'
  $json = ($manifest | ConvertTo-Json -Depth 4) + "`n"
  # 无 BOM 写（PowerShell 5.1 的 Set-Content -Encoding utf8 会加 BOM，破坏下游 JSON 解析）
  [System.IO.File]::WriteAllText((Resolve-Path $OutDir).Path + '\manifest.json', $json, (New-Object System.Text.UTF8Encoding($false)))

  $mb = [math]::Round($bytes / 1MB, 1)
  Write-Host "✅ saved $($manifest.file) ($mb MB, sha256 $($sha256.Substring(0,12))…) + manifest.json" -ForegroundColor Green
} finally {
  Pop-Location
}

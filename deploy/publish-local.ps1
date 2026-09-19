<#
.SYNOPSIS
  harness 托管 MCP 服务：本机发布（构建 → 上传 → 远端激活 → 冒烟）。

.DESCRIPTION
  替代原方案（GitHub 中心 + 服务器构建）的本地推送链路：
    1) build-local.ps1 产出 artifacts/dist/*.tar.gz + manifest.json（缺产物时自动构建）
    2) scp 产物与 deploy/ 脚本（compose / activate.sh / .env.mcp.example / nginx）到服务器
    3) ssh 执行 activate.sh <tag>（含探活与失败自动回滚）
    4) 可选：公网冒烟 https://<domain>/healthz

  注意：真实凭据（HARNESS_API_KEY、SSH key）只在本机与服务器上，不经过任何第三方。

.EXAMPLE
  pwsh deploy/publish-local.ps1 -Server 115.29.185.128 -SshKey $HOME\.ssh\harness_mcp
  pwsh deploy/publish-local.ps1 -Server 1.2.3.4 -User root -SkipBuild -PublicSmoke -Domain mcp.pallastrade.cn
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'root',
  [int]$Port = 22,
  [string]$SshKey,
  [string]$RemoteRoot = '/opt/harness-mcp',
  [switch]$SkipBuild,
  [switch]$PublicSmoke,
  [string]$Domain = 'mcp.pallastrade.cn'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$deployDir = Join-Path $repoRoot 'deploy'
$distDir = Join-Path $repoRoot 'artifacts/dist'

# PS 5.1：ssh/scp 也会写 stderr → 统一走本助手，用 $LASTEXITCODE 判成败
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
  if (-not $SkipBuild) {
    $buildScript = Join-Path $deployDir 'build-local.ps1'
    if ((Invoke-Native powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $buildScript)) -ne 0) {
      throw 'build-local.ps1 failed'
    }
  }
  $manifestPath = Join-Path $distDir 'manifest.json'
  if (-not (Test-Path $manifestPath)) { throw "missing $manifestPath — run deploy/build-local.ps1 first" }
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  $artifact = Join-Path $distDir $manifest.file
  if (-not (Test-Path $artifact)) { throw "missing artifact: $artifact" }

  $sshArgs = @('-p', "$Port")
  if ($SshKey) { $sshArgs += @('-i', $SshKey) }
  $scpArgs = @('-P', "$Port")
  if ($SshKey) { $scpArgs += @('-i', $SshKey) }
  $target = "$User@$Server"

  Write-Host "→ preparing $RemoteRoot on $Server" -ForegroundColor Cyan
  if ((Invoke-Native ssh ($sshArgs + @($target, "mkdir -p $RemoteRoot/dist $RemoteRoot/data $RemoteRoot/logs $RemoteRoot/backups $RemoteRoot/deploy/nginx"))) -ne 0) {
    throw 'ssh preflight failed (check key/host)'
  }

  Write-Host "→ uploading deploy/ assets" -ForegroundColor Cyan
  if ((Invoke-Native scp ($scpArgs + @("$deployDir/docker-compose.mcp.yml", "$deployDir/activate.sh", "$deployDir/.env.mcp.example", "${target}:$RemoteRoot/deploy/"))) -ne 0) {
    throw 'scp of deploy assets failed'
  }
  if ((Invoke-Native scp ($scpArgs + @('-r', "$deployDir/nginx/.", "${target}:$RemoteRoot/deploy/nginx/"))) -ne 0) {
    throw 'scp of nginx assets failed'
  }

  Write-Host "→ uploading $($manifest.file)" -ForegroundColor Cyan
  if ((Invoke-Native scp ($scpArgs + @($artifact, $manifestPath, "${target}:$RemoteRoot/dist/"))) -ne 0) {
    throw 'scp of artifact failed'
  }

  Write-Host "→ activating $($manifest.tag)" -ForegroundColor Cyan
  if ((Invoke-Native ssh ($sshArgs + @($target, "bash $RemoteRoot/deploy/activate.sh '$($manifest.tag)' '$RemoteRoot/dist/$($manifest.file)'"))) -ne 0) {
    throw 'activation failed — see server output above (auto-rollback attempted)'
  }

  if ($PublicSmoke) {
    Write-Host "→ public smoke https://$Domain/healthz" -ForegroundColor Cyan
    $resp = curl.exe -fsS --noproxy '*' "https://$Domain/healthz"
    if ($LASTEXITCODE -ne 0) { throw 'public smoke failed (nginx/证书/DNS 检查)' }
    Write-Host "✅ public health: $resp" -ForegroundColor Green
  }

  Write-Host "✅ published $($manifest.tag) to $Server ($([math]::Round($manifest.bytes / 1MB, 1)) MB)" -ForegroundColor Green
} finally {
  Pop-Location
}

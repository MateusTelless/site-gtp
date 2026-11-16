# Compila a ponte com o compilador C# que ja vem no Windows (.NET Framework 4.x).
# Nao precisa instalar Visual Studio nem .NET SDK.
# Gera bin\PonteCatraca.exe em 32 bits (x86), porque a EasyInner.dll e 32 bits.

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$csc  = "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
$bin  = Join-Path $raiz 'bin'
New-Item -ItemType Directory -Force $bin | Out-Null

$refs = 'System.Web.Extensions.dll', 'System.Net.Http.dll', 'System.ServiceProcess.dll', 'System.Core.dll' |
  ForEach-Object { "/r:$_" }

$fontes = Get-ChildItem (Join-Path $raiz 'src') -Filter *.cs | ForEach-Object { $_.FullName }

& $csc /nologo /target:exe /platform:x86 /optimize+ /utf8output /out:"$bin\PonteCatraca.exe" $refs $fontes
if ($LASTEXITCODE -ne 0) { throw "Falha na compilacao." }

if (-not (Test-Path "$bin\config.json")) { Copy-Item (Join-Path $raiz 'config.exemplo.json') "$bin\config.json" }
if (Test-Path (Join-Path $raiz 'sdk\EasyInner.dll')) { Copy-Item (Join-Path $raiz 'sdk\*.dll') $bin -Force }
else { Write-Warning "sdk\EasyInner.dll nao encontrada: so o modo 'simulada' vai funcionar." }

Write-Host "OK: $bin\PonteCatraca.exe"

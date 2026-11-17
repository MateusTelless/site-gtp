# Monta o pacote para levar ao PC da catraca: pacote\PonteCatraca-<versao>.zip
# Contem o programa, o config.json modelo, os .bat e o guia LEIA-ME-TI.txt. NAO contem a EasyInner.dll
# (o TI copia do SDK da Topdata) nem a chave de acesso.
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
& (Join-Path $raiz 'compilar.ps1') | Out-Null

$versao = (Select-String -Path (Join-Path $raiz 'src\Programa.cs') -Pattern 'Versao = "([^"]+)"').Matches[0].Groups[1].Value
$saida = Join-Path $raiz 'pacote'
$dest = Join-Path $saida 'PonteCatraca'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $dest 'scripts') | Out-Null

Copy-Item (Join-Path $raiz 'bin\PonteCatraca.exe') $dest

# DLLs da Topdata (SDK EasyInner 6.0.2), ao lado do programa. Ficam fora do git (sdk/ e pacote/ sao ignorados).
# O procedimento da Topdata aceita a pasta do executavel; assim nada muda nas pastas do Windows nem no Secullum.
$dlls = Join-Path $raiz 'sdk\SDK\SDK EasyInner\DLLs'
if (Test-Path (Join-Path $dlls 'EasyInner.dll')) {
  foreach ($n in 'EasyInner.dll','Inner2K.dll','InnerTCP.DLL','Inner.dll','Inner.tlb','InnerTCPLib.dll','vcl50.bpl','msvbvm60.dll','MSWINSCK.OCX','MSCOMM32.OCX') {
    Copy-Item (Join-Path $dlls $n) $dest
  }
} else { Write-Warning "SDK da Topdata nao encontrado em $dlls : o pacote vai sem a EasyInner.dll." }
Copy-Item (Join-Path $raiz 'instalador\scripts\*.ps1') (Join-Path $dest 'scripts')
Copy-Item (Join-Path $raiz 'instalador\config.json') $dest

# .bat e .txt com quebra de linha do Windows (CRLF); .txt com BOM para o Bloco de Notas mostrar certo.
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
foreach ($f in Get-ChildItem (Join-Path $raiz 'instalador') -File | Where-Object { $_.Extension -in '.bat', '.txt' }) {
  $texto = ([IO.File]::ReadAllText($f.FullName)) -replace "`r?`n", "`r`n"
  $enc = if ($f.Extension -eq '.txt') { $utf8Bom } else { New-Object System.Text.ASCIIEncoding }
  [IO.File]::WriteAllText((Join-Path $dest $f.Name), $texto, $enc)
}

$zip = Join-Path $saida "PonteCatraca-$versao.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
# ZipFile le os arquivos em modo compartilhado (o antivirus costuma estar lendo as DLLs ao mesmo tempo).
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($dest, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
Write-Host "Pacote: $zip"

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
Compress-Archive -Path $dest -DestinationPath $zip
Write-Host "Pacote: $zip"

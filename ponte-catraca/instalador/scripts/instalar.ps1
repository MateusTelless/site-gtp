# Instala a ponte como servico do Windows: liga sozinha com o PC e reinicia se cair.
# Precisa ser executado como administrador (o 3-INSTALAR-SERVICO.bat ja pede).
$ErrorActionPreference = 'Stop'
$pasta = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $pasta 'PonteCatraca.exe'
$nome = 'PonteCatraca'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host "Abra como administrador (botao direito > Executar como administrador)." -ForegroundColor Red; exit 1 }
if (-not (Test-Path $exe)) { Write-Host "PonteCatraca.exe nao encontrado em $pasta" -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $pasta 'EasyInner.dll'))) { Write-Host "EasyInner.dll nao esta na pasta. Copie do SDK da Topdata antes." -ForegroundColor Red; exit 1 }
if ($pasta -notlike 'C:\PonteCatraca*') { Write-Host "Mova a pasta para C:\PonteCatraca antes de instalar (pastas de usuario, como Downloads, podem ser apagadas)." -ForegroundColor Yellow; exit 1 }

if (Get-Service $nome -ErrorAction SilentlyContinue) {
  Write-Host "Servico ja existe; parando para atualizar..."
  sc.exe stop $nome | Out-Null
  Start-Sleep 3
} else {
  sc.exe create $nome binPath= "`"$exe`"" start= auto DisplayName= "Ponte da catraca (GETEPE)" | Out-Null
  sc.exe description $nome "Liga as catracas Topdata ao site: libera ou bloqueia conforme matricula e pagamento." | Out-Null
}
# Reinicia sozinho se cair (5 s, 5 s, 30 s); zera a contagem depois de 1 dia.
sc.exe failure $nome reset= 86400 actions= restart/5000/restart/5000/restart/30000 | Out-Null
sc.exe start $nome | Out-Null
Start-Sleep 5
$s = Get-Service $nome
if ($s.Status -eq 'Running') {
  Write-Host "Servico instalado e rodando." -ForegroundColor Green
  Write-Host "Log de hoje: $pasta\dados\logs\$(Get-Date -Format yyyy-MM-dd).log"
} else {
  Write-Host "O servico nao ficou rodando (estado: $($s.Status)). Veja o log em $pasta\dados\logs" -ForegroundColor Red
  exit 1
}

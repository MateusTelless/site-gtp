# Para e remove o servico da ponte (plano B: depois disso, e so abrir o Secullum de novo).
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host "Abra como administrador (botao direito > Executar como administrador)." -ForegroundColor Red; exit 1 }
if (-not (Get-Service PonteCatraca -ErrorAction SilentlyContinue)) { Write-Host "O servico PonteCatraca nao esta instalado."; exit 0 }
sc.exe stop PonteCatraca | Out-Null
Start-Sleep 3
sc.exe delete PonteCatraca | Out-Null
Write-Host "Servico removido. Os arquivos e logs continuam na pasta. Pode abrir o Secullum de novo." -ForegroundColor Green

# Confere se este PC esta pronto para a ponte da catraca. Nao altera nada.
$ErrorActionPreference = 'Continue'
$pasta = Split-Path $PSScriptRoot -Parent
$ok = 0; $falhas = 0; $avisos = 0
function Bom($t)   { Write-Host "  [OK]    $t" -ForegroundColor Green; $script:ok++ }
function Ruim($t)  { Write-Host "  [FALTA] $t" -ForegroundColor Red; $script:falhas++ }
function Aviso($t) { Write-Host "  [ATENCAO] $t" -ForegroundColor Yellow; $script:avisos++ }

Write-Host ""
Write-Host "=== Verificacao do PC da catraca ===" -ForegroundColor Cyan
Write-Host "Pasta: $pasta"
Write-Host ""

# 1. Windows e .NET Framework 4.x
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "Windows: $($os.Caption) ($($os.OSArchitecture))"
$rel = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue).Release
if ($rel -ge 378389) { Bom ".NET Framework 4.5 ou mais novo instalado" } else { Ruim ".NET Framework 4.5+ nao encontrado (instale o .NET Framework 4.8)" }

# 2. Programa e DLL da Topdata (32 bits)
if (Test-Path "$pasta\PonteCatraca.exe") { Bom "PonteCatraca.exe presente" } else { Ruim "PonteCatraca.exe nao esta na pasta" }
$dll = "$pasta\EasyInner.dll"
if (Test-Path $dll) {
  $b = [IO.File]::ReadAllBytes($dll)
  $pe = [BitConverter]::ToInt32($b, 60)
  $maq = [BitConverter]::ToUInt16($b, $pe + 4)
  if ($maq -eq 0x14c) { Bom "EasyInner.dll presente (32 bits)" } else { Aviso ("EasyInner.dll presente, mas nao parece ser 32 bits (maquina 0x{0:X})" -f $maq) }
} else { Ruim "EasyInner.dll nao esta na pasta (copie do SDK EasyInner da Topdata, com as outras DLLs que vierem junto)" }

# 3. config.json preenchido
$cfg = $null
try { $cfg = Get-Content "$pasta\config.json" -Raw | ConvertFrom-Json } catch { Ruim "config.json nao existe ou esta com erro de digitacao: $($_.Exception.Message)" }
if ($cfg) {
  if ($cfg.urlApi -match '^https://' -and $cfg.urlApi -notmatch 'PREENCHER') { Bom "Endereco do site: $($cfg.urlApi)" } else { Ruim "config.json: preencha urlApi (endereco do site + /api/catraca)" }
  if ($cfg.token -and $cfg.token.Length -ge 24 -and $cfg.token -notmatch 'PREENCHER') { Bom "Chave de acesso preenchida" } else { Ruim "config.json: preencha token (a chave CATRACA_TOKEN do site)" }
  if ($cfg.inners -and @($cfg.inners).Count -ge 1) { Bom "Catracas configuradas: $(@($cfg.inners) -join ', ')" } else { Ruim "config.json: preencha inners com o numero de cada catraca, ex.: [1, 2]" }
  if ($cfg.modoCatraca -ne 'easyinner') { Aviso "modoCatraca esta '$($cfg.modoCatraca)'. Para a catraca de verdade use 'easyinner'." }

  # 4. Rede ate as catracas (so se os IPs foram anotados)
  foreach ($ip in @($cfg.ipsCatracas)) {
    if (-not $ip -or $ip -match 'PREENCHER') { continue }
    if (Test-Connection -ComputerName $ip -Count 2 -Quiet) { Bom "Catraca $ip responde na rede" } else { Ruim "Catraca $ip NAO responde (rede, cabo ou IP errado)" }
  }
  if (-not @($cfg.ipsCatracas | Where-Object { $_ -and $_ -notmatch 'PREENCHER' }).Count) { Aviso "ipsCatracas vazio: nao deu para testar a rede ate as catracas" }

  # 5. Internet ate o site, com a chave
  if ($cfg.urlApi -match '^https://' -and $cfg.token) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    try {
      $r = Invoke-WebRequest -Uri ($cfg.urlApi.TrimEnd('/') + '/liberados') -Headers @{ Authorization = "Bearer $($cfg.token)" } -UseBasicParsing -TimeoutSec 20
      $n = (ConvertFrom-Json $r.Content).pessoas.Count
      Bom "Site respondeu: $n pessoas na lista da catraca"
    } catch {
      $st = $null; if ($_.Exception.Response) { $st = [int]$_.Exception.Response.StatusCode }
      if ($st -eq 401) { Ruim "Site recusou a chave (token diferente do CATRACA_TOKEN do site)" }
      elseif ($st -eq 503) { Ruim "Site sem CATRACA_TOKEN configurado" }
      elseif ($st -eq 404) { Ruim "Endereco errado ou site ainda sem a versao com catraca (404)" }
      else { Ruim "Nao consegui falar com o site: $($_.Exception.Message)" }
    }
  }

  # 6. Porta da catraca livre (o Secullum usa a mesma)
  $porta = if ($cfg.portaCatraca) { $cfg.portaCatraca } else { 3570 }
  $uso = Get-NetTCPConnection -LocalPort $porta -ErrorAction SilentlyContinue
  if ($uso) {
    $proc = ($uso | Select-Object -First 1 -ExpandProperty OwningProcess | ForEach-Object { (Get-Process -Id $_ -ErrorAction SilentlyContinue).ProcessName })
    Aviso "Porta $porta em uso por '$proc'. Se for o Secullum, feche-o antes de testar a ponte."
  } else { Bom "Porta $porta livre" }
}

# 7. Servico ja instalado?
$svc = Get-Service PonteCatraca -ErrorAction SilentlyContinue
if ($svc) { Write-Host "  Servico PonteCatraca: $($svc.Status)" }

# 8. Energia: o PC nao pode dormir
# As duas ultimas linhas com 0x... sao o valor na tomada (CA) e na bateria (CC), em qualquer idioma do Windows.
$hexes = @(powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String '0x([0-9a-fA-F]{8})\s*$' | ForEach-Object { $_.Matches[0].Groups[1].Value })
if ($hexes.Count -ge 2) {
  $seg = [Convert]::ToInt64($hexes[$hexes.Count - 2], 16)
  if ($seg -eq 0) { Bom "Suspensao desligada (na tomada)" }
  else { Aviso "O PC suspende apos $([math]::Round($seg/60)) min na tomada. Mude para 'Nunca' em Configuracoes > Sistema > Energia." }
} else { Aviso "Confira em Configuracoes > Sistema > Energia se a suspensao esta em 'Nunca'." }

Write-Host ""
Write-Host "Resultado: $ok ok, $avisos atencao, $falhas falta(s)." -ForegroundColor Cyan
if ($falhas -eq 0) { Write-Host "Tudo certo para o teste." -ForegroundColor Green } else { Write-Host "Resolva os itens [FALTA] e rode de novo." -ForegroundColor Red }
Write-Host ""

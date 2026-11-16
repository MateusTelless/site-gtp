# Ponte da catraca (substitui o Secullum)

Programa que roda num PC do curso, na mesma rede da catraca Topdata Inner (leitor de digital).
Ele baixa do site-gtp quem pode entrar, libera ou bloqueia cada aluno na hora e manda as
passagens de volta para o banco. Contrato com o Worker: [CONTRATO-API.md](CONTRATO-API.md).

## Como funciona

1. O aluno põe o dedo. A catraca reconhece a digital (no próprio equipamento) e manda o número do aluno.
2. A ponte consulta a lista local (atualizada a cada 60 s pelo Worker) e decide.
3. Liberado: visor mostra o nome e a catraca gira. Bloqueado: visor mostra a mensagem do Worker.
4. Tudo vira evento numa fila em disco e sobe para o D1 quando houver internet.

Sem internet, a catraca continua funcionando com a última lista. Se o PC/ponte cair, a catraca
para de liberar (ver "Pendências").

## Compilar

```powershell
.\compilar.ps1
```

Usa o compilador que já vem no Windows. Gera `bin\PonteCatraca.exe` (32 bits).
Antes, coloque a `EasyInner.dll` do SDK Topdata em `sdk\`.

## Testar sem catraca

Em `bin\config.json`, ponha `"modoCatraca": "simulada"` e rode:

```powershell
bin\PonteCatraca.exe --console
```

Digite um número + Enter (= dedo), `g` (= girou), `d` (= desistiu).

## Instalar como serviço (no PC da catraca, PowerShell como administrador)

1. Feche o Secullum e desative o serviço dele (os dois não podem falar com a catraca ao mesmo tempo).
2. Copie a pasta `bin` para `C:\PonteCatraca` e ajuste `config.json` (URL, token, número da Inner).
3. Primeiro rode `C:\PonteCatraca\PonteCatraca.exe --console` e teste com o dedo de alguém.
4. Depois instale:

```powershell
sc.exe create PonteCatraca binPath= "C:\PonteCatraca\PonteCatraca.exe" start= auto
sc.exe failure PonteCatraca reset= 60 actions= restart/5000/restart/5000/restart/5000
sc.exe start PonteCatraca
```

Logs: `C:\PonteCatraca\dados\logs\`.

## Pendências (precisam do equipamento)

- Confirmar a Origem que a catraca envia para digital (manual diz 12). O log registra
  qualquer evento desconhecido como "Evento não tratado", então o primeiro teste mostra o valor certo.
- Confirmar `ConfigurarAcionamento1(8, tempo)` para o tempo de liberação da catraca.
- Ferramenta de cadastro de digitais (funções já declaradas em `src/EasyInner.cs`).
- Migração: ler números e digitais do banco SQL do Secullum antes de desligá-lo.
- Modo de contingência offline da própria catraca, se o PC desligar.

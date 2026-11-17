@echo off
title Ponte da catraca - TESTE (feche esta janela para parar)
cd /d "%~dp0"
echo.
echo  ANTES: feche o Secullum e pare o servico dele. Os dois nao podem falar com a catraca ao mesmo tempo.
echo  Para parar o teste: Ctrl+C ou feche esta janela. Depois, abra o Secullum de novo.
echo.
PonteCatraca.exe --console
echo.
echo  Ponte parada. O log do teste esta em: %~dp0dados\logs
pause

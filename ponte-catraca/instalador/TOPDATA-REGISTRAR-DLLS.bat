@echo off
rem SO USE SE O TESTE MOSTRAR ERRO 4, 5, 6 ou 8 ("DLL nao encontrada" ou "GPF").
rem Registra os componentes da Topdata que ficam nesta pasta (procedimento oficial do SDK EasyInner).
powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -ArgumentList '/k cd /d \"%~dp0\" && regsvr32 /s msvbvm60.dll && regsvr32 /s MSWINSCK.OCX && regsvr32 /s MSCOMM32.OCX && echo Componentes registrados. Pode fechar esta janela.'"

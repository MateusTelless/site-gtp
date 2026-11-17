@echo off
rem Pede permissao de administrador e instala a ponte como servico do Windows.
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File \"%~dp0scripts\instalar.ps1\"'"

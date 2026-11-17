@echo off
rem Plano B: para e remove o servico da ponte. Depois, e so abrir o Secullum de novo.
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File \"%~dp0scripts\remover.ps1\"'"

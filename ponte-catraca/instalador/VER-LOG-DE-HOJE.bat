@echo off
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set HOJE=%%d
if exist "%~dp0dados\logs\%HOJE%.log" (
  start notepad "%~dp0dados\logs\%HOJE%.log"
) else (
  echo Ainda nao ha log de hoje em %~dp0dados\logs
  pause
)

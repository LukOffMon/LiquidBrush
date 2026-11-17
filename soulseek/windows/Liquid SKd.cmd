@echo off
rem Liquid SKd: doble clic para abrir el menu (instalar, estado, clave, reiniciar...)
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0skd.ps1" %*
if errorlevel 1 pause

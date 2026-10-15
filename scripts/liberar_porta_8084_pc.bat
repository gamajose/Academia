@echo off
chcp 65001 >nul
echo ========================================================
echo   Configurando Redirecionamento da Porta 8084 (Windows)
echo ========================================================
echo.
echo 1. Adicionando regra no PortProxy (0.0.0.0:8084 -> 192.168.28.10:8084)...
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8084 connectaddress=192.168.28.10 connectport=8084

echo.
echo 2. Garantindo liberacao no Firewall do Windows...
netsh advfirewall firewall add rule name="Academia-8084" dir=in action=allow protocol=TCP localport=8084

echo.
echo 3. Status atual das regras do PortProxy:
netsh interface portproxy show all

echo.
echo ========================================================
echo   Configuracao concluida com sucesso!
echo ========================================================
pause

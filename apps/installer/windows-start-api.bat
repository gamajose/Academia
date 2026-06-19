@echo off
cd /d %~dp0\..\api
npm install
npm run migrate
npm run start
pause

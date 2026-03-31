@echo off
cd /d "%~dp0"
git add .
git commit -m "update %date% %time%"
git push
echo.
echo Готово! Изменения отправлены на GitHub.
pause

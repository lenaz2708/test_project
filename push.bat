@echo off
cd /d "%~dp0"

echo Обновляем index.html из md-файлов...
node build.js
if errorlevel 1 (
    echo.
    echo ОШИБКА: build.js не сработал.
    pause
    exit /b 1
)

echo.
git add .
git commit -m "update %date% %time%"
git push
echo.
echo Готово! Изменения отправлены на GitHub.
pause

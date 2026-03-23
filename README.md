# GPL Virtual Stand

В одном проекте теперь живут:

- Vite-клиент на `http://127.0.0.1:5173`
- FastAPI backend на `http://127.0.0.1:8000`
- Swagger UI на `http://127.0.0.1:8000/docs`

## Установка

```powershell
pip install -r requirements.txt
npm install
```

## Запуск в разработке

```powershell
npm run dev
```

Эта команда поднимает сразу:

- Vite dev server
- FastAPI c `uvicorn --reload`

Оба процесса автоматически перезапускаются при изменении файлов.

## Полезные команды

```powershell
npm run dev:client
npm run dev:server
npm run start:server
```

## Поведение режимов

- В `edit`-режиме редактируется поле и локально меняется раскладка модулей.
- При выходе из `edit`-режима layout синхронизируется в FastAPI.
- В `api`-режиме операционные действия идут через backend: выбор крана, движение, обмен со складом и IO, запуск объекта из IO, движение объекта по полю, смена активной IO-зоны и размера стопки.

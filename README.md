# SportLab Operator Panel — PostgreSQL версия

Это уже не локалка в браузере, а нормальная серверная версия:

- **Frontend**: один HTML-интерфейс в стиле SportLab
- **Backend**: Node.js + Express
- **DB**: PostgreSQL
- **Хранение данных**: пользователи и история замеров лежат в SQL-базе

## Что умеет

- вход оператора по логину и паролю
- создание нового пользователя
- редактирование пользователя
- удаление пользователя
- автоматический расчёт индекса здоровья (ИМТ)
- история ростов, весов и ИМТ
- сохранение данных в PostgreSQL

## Структура

- `public/index.html` — интерфейс
- `server.js` — API и сервер
- `schema.sql` — SQL-схема базы
- `scripts/seed-operator.js` — создание стартового оператора
- `.env.example` — пример переменных окружения

## Быстрый запуск локально

### 1. Создай базу PostgreSQL

Например:

```sql
CREATE DATABASE sportlab_operator;
```

### 2. Прогони схему

```bash
psql -U postgres -d sportlab_operator -f schema.sql
```

### 3. Установи зависимости

```bash
npm install
```

### 4. Создай `.env`

Скопируй `.env.example` в `.env` и при необходимости измени значения:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sportlab_operator
JWT_SECRET=change_me_to_a_long_random_secret
OPERATOR_LOGIN=operator
OPERATOR_PASSWORD=sportlab123
```

### 5. Создай оператора

```bash
npm run seed:operator
```

### 6. Опционально добавь демо-пользователей

```bash
psql -U postgres -d sportlab_operator -f seed-demo-users.sql
```

### 7. Запусти сервер

```bash
npm start
```

Открой в браузере:

```bash
http://localhost:3000
```

## Как это работает

### Таблица `users`
Хранит текущую карточку пользователя:
- ФИО
- группа
- фото
- группа здоровья
- текущий рост
- текущий вес
- текущий индекс здоровья

### Таблица `user_measurements`
Хранит историю замеров:
- рост
- вес
- ИМТ
- когда сделали замер
- какой оператор это сохранил

То есть в карточке всегда лежат **актуальные данные**, а в истории — **все прошлые изменения**.

## API

### Логин
`POST /api/auth/login`

Body:

```json
{
  "login": "operator",
  "password": "sportlab123"
}
```

### Получить пользователей
`GET /api/users`

### Создать пользователя
`POST /api/users`

### Обновить пользователя
`PUT /api/users/:id`

### Удалить пользователя
`DELETE /api/users/:id`

## Как залить на сервер

Есть 2 простых варианта.

### Вариант 1 — VPS / обычный сервер

Нужно:
- установить Node.js
- установить PostgreSQL
- создать базу
- залить файлы проекта
- сделать `.env`
- выполнить `npm install`
- прогнать `schema.sql`
- выполнить `npm run seed:operator`
- запустить `npm start`

### Вариант 2 — Render / Railway / подобный хостинг

Нужно:
- создать новый Web Service
- загрузить этот проект
- добавить PostgreSQL-инстанс
- прописать `DATABASE_URL` и `JWT_SECRET` в переменные окружения
- команду запуска поставить `npm start`
- отдельно один раз выполнить `schema.sql`
- затем выполнить `npm run seed:operator`

## Что ещё стоит сделать потом

Чтобы это было уже ближе к продовой системе, следующим этапом я бы добавил:

1. загрузку фото не по URL, а файлом
2. несколько операторов и роли
3. журнал действий оператора
4. отдельные таблицы для групп, факультетов и доп. мед. показателей
5. httpOnly cookie вместо хранения токена в localStorage
6. Docker для удобного деплоя

# biomechanika_operator

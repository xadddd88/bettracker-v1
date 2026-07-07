# TENNIS TRACK — API-Tennis notes (отдельный трек)

> **Статус:** ОПЛАЧЕН и активен. Отдельный трек (Дима), вне мультиспорт-беты на api-sports.io.
> **Провайдер:** api-tennis.com (REST) + live WebSocket. Отдельная подписка/APIkey (оплачено).
> **Дата заметки:** 2026-07-01. Только справка, не build-plan.

## Live-канал (WebSocket)

```
wss://wss.api-tennis.com/live?APIkey=<APIkey>&timezone=+03:00
```

- Соединение шлёт JSON с **матчами, у которых был апдейт** (дельта, не полный список). Парсить `JSON.parse(e.data)`.
- Параметр `timezone` влияет на `event_time`/даты.

## Ключевые поля (из sample payload) и как ложатся в нашу модель

| Поле | Назначение | Роль в продукте |
|---|---|---|
| `event_key` | ID матча | **Стабильный fixture ID** → составной ключ `(sport='tennis', provider_fixture_id=event_key)` |
| `first_player_key` / `second_player_key` | ID игроков | Стабильные entity ID (форма, H2H, рейтинг) |
| `tournament_key` | ID турнира | Стабильный ID + контекст (стадия, покрытие) |
| `event_status` | статус («Set 1» … «Finished») | Жизненный цикл для сеттлмента |
| `event_winner` | победитель (null пока не решён; First/Second Player) | **Сигнал авто-сеттлмента Match Winner** |
| `event_final_result` / `event_game_result` / `scores[]` | счёт (по сетам/геймам) | Детали результата, рынки по сетам/геймам |
| `event_live` = "1" | live-флаг | Фильтр «идёт сейчас» |
| `event_type_type` | напр. «Itf Men Singles» | Тур/категория (ATP/WTA/ITF, singles/doubles) |
| `pointbypoint[]` | поточечная история | Богатый вход для deep-анализа/калибровки |
| `statistics[]` | статистика игроков (эйсы, брейк-пойнты, %) | Deep-анализ (пусто, пока матч не набрал данных) |

## Сеттлмент (теннис, v1)

- **Авто-сеттлить Match Winner**, когда `event_winner != null` И `event_status` = завершён.
- **Вручную:** снятие (RET) / walkover (WO) — многие рынки войдятся; форы по сетам/геймам, тоталы геймов — вне безопасного набора v1.
- Согласуется с общим правилом из DECISION-записи: безопасный рынок + финальный статус → авто; иначе → ручная очередь.

## ⚠️ Безопасность — важно

Пример подключает WSS с `APIkey` **прямо в браузере**. В таком виде ключ виден любому пользователю (DevTools/Network) → его можно вытащить и жечь твою квоту.

- Для прод: **проксировать live-канал через backend** (браузер ↔ наш сервер ↔ api-tennis WSS), либо использовать отдельный ограниченный ключ.
- **Мастер-APIkey никогда не отдавать на клиент.**

## Прочее

- У api-tennis.com есть и **REST** (fixtures/schedule/results/standings/odds) — это pre-match слой; WSS — live-слой. Для Scout (календарь) нужен REST-fixtures, для live-трекинга/сеттлмента — WSS.
- Теннис интегрируется отдельно, когда трек будет готов; в общий api-sports.io скоуп не входит.

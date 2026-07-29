# R18 — BetTracker Target Product Structure v1.0

**Статус:** APPROVED — product source of truth under Decision #069
**Дата:** 29 июля 2026
**Базовая реализация:** `xadddd88/bettracker-v1`, `main@d96f1d2d142bfdd8f729cefa8e483c0fb9b49e0e`
**Рынок первой доступности:** `GB_EW_SC` — England, Wales and Scotland; `storefront_country=GB`; Northern Ireland недоступна
**Языки интерфейса:** English (`en`), українська (`uk`), русский (`ru`)
**Назначение:** полная целевая структура продукта и единый handoff для product/design/engineering/legal.

> Этот документ заменяет прежнюю продуктовую логику `docs/product.md` и устаревшего `PRODUCT_VISION_GAP.md`. Он не переписывает историю решений в `docs/decisions.md` и не требует разрушать уже работающий инженерный фундамент.

## 1. Итоговое решение

BetTracker строится как **приватная система качества решений и контроля риска**, а не как сервис прогнозов, сигналов или поиска «лучших ставок».

Полная продуктовая версия проектируется сразу. Мы не делим её на Core / Intelligence / Discovery и не прячем разделы за «coming later». Все разделы, связи, состояния, ограничения, локали и платформенные варианты входят в одну целевую архитектуру.

При этом отсутствие этапов не отменяет обязательные системные gates:

- рынок и чувствительные возможности проверяются серверной policy;
- недоступные, устаревшие или неполные данные показываются честным состоянием, а не выдуманным ответом;
- функции, требующие отдельного юридического разрешения или подтверждённого источника данных, существуют в дизайне с корректным blocked state;
- запуск функции определяется доказанной готовностью, но её продуктовая логика и все UX-состояния специфицированы сейчас.

Ключевая формула:

> **Один код → одно операционное ядро → три языка → отдельный профиль каждого рынка → единая полная продуктовая структура.**

## 2. Что сохраняем и что меняем

### 2.1 Сохраняем инженерный фундамент

- Next.js / React web-приложение и существующую mobile-базу;
- Supabase, RLS/RPC, invite-auth и текущие safety-контуры;
- журнал одиночных ставок и экспрессов;
- ordered legs, OCR-review, QuickSettle и идемпотентное создание записей;
- транзакции банкролла;
- существующие данные Decisions, Bets, Coach и Analytics;
- Broadcast Noir как доказательство текущей реализации, а не как неизменяемый дизайн-мандат.

### 2.2 Переписываем продуктовую правду

- навигацию и роль каждого раздела;
- позиционирование, терминологию и обещание продукта;
- Scout, Analyst, Coach и calculators;
- связь Research → Decision → Bet/Pass/Paper → Result → Review;
- модель риска, лимитов, cooldown и stop mode;
- метрики, формулы, доверие и insufficient-data states;
- market/locale architecture;
- onboarding, paywall, settings, privacy и responsible-use контуры;
- документацию, которая всё ещё описывает LineHunter, семь локалей, «edge hunting» и устаревшую дорожную карту.

### 2.3 Не делаем

- не подключаем букмекерские аккаунты;
- не размещаем ставки и не ведём пользователя к букмекеру;
- не показываем affiliate-ссылки, промологотипы или кнопки «сделать ставку»;
- не ранжируем «лучшие ставки»;
- не даём recommended stake;
- не используем loss-recovery, Martingale или догон;
- не строим социальные picks, copy-bet и ROI-лидерборды;
- не обещаем прибыль, рост банкролла или «победу над линией»;
- не геймифицируем выигрышные серии, оборот и частоту ставок.

## 3. Продуктовая модель

### 3.1 Позиционирование

**Короткая формула**

> BetTracker помогает пользователю зафиксировать решение до события, проверить риск, корректно учесть результат и понять качество собственного процесса.

**Не обещает**

- найти ставку;
- предсказать победителя;
- гарантировать доходность;
- подобрать сумму;
- заменить ответственное решение пользователя.

**Даёт**

- доказуемую историю решений;
- прозрачную математику;
- контроль банкролла и открытого риска;
- разбор собственных паттернов;
- объяснение данных без выдумывания фактов;
- переносимость данных и приватность по умолчанию.

### 3.2 Главный цикл

1. Пользователь видит состояние банкролла, лимитов и незавершённых разборов.
2. Изучает событие только по проверенным данным и фиксирует собственную гипотезу.
3. Создаёт Decision до начала события и сам вводит Intended Exposure для серверной проверки риска.
4. Выбирает `Pass`, `Paper` или самостоятельно фиксирует уже принятое действие как Bet.
5. Система учитывает исполнение, cashout, settlement и фактический риск.
6. Пользователь сравнивает ожидание и результат.
7. Review превращает наблюдение в правило или вопрос для следующего решения.

North-star:

> **Weekly Completed Decision Users** — пользователи, завершившие за неделю цикл Decision → Risk Check → Result → Review.

Не north-star: прибыль, оборот, количество ставок, win streak и число открытых приложений.

### 3.3 Принципы продукта

1. **Decision before outcome.** Намерение фиксируется до события и блокируется серверным временем.
2. **Decision quality ≠ result.** Хорошее решение может проиграть, плохое — выиграть.
3. **Code calculates, AI explains.** Все числа считает детерминированный код.
4. **Evidence before confidence.** Каждое утверждение показывает источник, период, `N`, свежесть и уровень уверенности.
5. **Risk before action.** Пользователь сам вводит Intended Exposure; до блокировки Decision сервер показывает текущую и projected exposure, проверяет лимиты и никогда не предлагает сумму.
6. **No fabricated availability.** Нет данных — нет прогноза; показываем причину и следующий безопасный шаг.
7. **Private by default.** Пользовательские решения не становятся социальной лентой.
8. **User owns the record.** История, экспорт и удаление не зависят от платного тарифа.
9. **Market ≠ locale.** Язык интерфейса не открывает страну и не меняет право.
10. **No dark patterns.** Отмена, stop mode, экспорт и ограничения не скрываются.

## 4. Глобальная стратегия, рынок и резиденция

### 4.1 Рабочая корпоративная модель

| Слой | Целевое решение |
|---|---|
| Операционное ядро | Одно OpCo и один продуктовый код |
| Рабочий кандидат OpCo | UK Ltd, только после совместного UK–UA tax/legal memo |
| Первый внутренний market id | `GB_EW_SC`: England, Wales and Scotland |
| Northern Ireland | Не входит в `GB_EW_SC`; сервер возвращает `unsupported`, пока для неё не утверждён отдельный MarketProfile |
| Канал запуска | Web-first как операционная последовательность; iOS/Android используют тот же contract |
| Платёжный контур | GBP / `storefront_country=GB`; Merchant of Record или проверенный UK VAT-контур |
| Данные | UK/EEA target; публично не обещать UK-only residency до аудита всех процессоров |
| Масштабирование | Новый рынок добавляется отдельным `MarketProfile`, а не новым форком продукта |

Это продуктовая гипотеза, а не готовое юридическое или налоговое заключение. Регистрация компании в одной стране не заменяет проверку права страны пользователя.

`Web-first` описывает только порядок публикации сборок. Это не урезает продукт: рабочие экраны, flows, entity contracts и все состояния из R18 проектируются сейчас для Web, iPhone и Android. Blocked state — дополнительный вариант уже спроектированной функции, а не замена её рабочего состояния.

### 4.2 Разделяем независимые параметры

| Параметр | Пример | На что влияет |
|---|---|---|
| `market_profile_id` | `GB_EW_SC` | доступ, возраст, legal docs и feature policy для England, Wales and Scotland |
| `storefront_country` | `GB` | ISO/store country для App Store, Google Play и billing; сам по себе не подтверждает eligibility |
| `locale` | `en`, `uk`, `ru` | интерфейс, email, push, AI-ответы, help |
| `odds_format` | decimal / fractional / American | только отображение коэффициентов |
| `timezone` | Europe/London | даты, server-lock explanation, отчёты |
| `reporting_currency` | GBP | агрегированные отчёты и FX disclosure |
| `bankroll_currency` | GBP / другая разрешённая | учёт конкретного банкролла |

Критически важно:

- украинский язык имеет код `uk`, Украина как рынок — `UA`;
- `uk` или `ru` не открывают доступ из Украины или России;
- `GB_EW_SC` не означает English-only;
- ISO/storefront-код `GB` охватывает United Kingdom и не равен внутренней допустимой территории `GB_EW_SC`;
- смена языка не меняет market policy, legal terms, цены и доступные функции;
- market eligibility всегда проверяется сервером;
- URL, язык браузера и locale никогда не являются единственным доказательством рынка.

English — master-версия legal-документа. `uk` и `ru` показывают проверенный перевод того же `document_id` и `version`; каждый ConsentRecord хранит версию, locale и timestamp. Смена locale не создаёт новые условия. Вопрос о том, какая языковая версия имеет юридический приоритет, фиксируется профильным консультантом до публикации.

### 4.3 MarketProfile

Каждый рынок хранит:

- статус конфигурации `configured / enabled / suspended / retired`;
- территорию и минимальный возраст;
- набор legal-документов и допустимые версии согласий;
- storefront, валюту расчёта и налоговую конфигурацию;
- разрешённые источники спортивных данных;
- разрешённые возможности Research/AI;
- правила маркетинга и уведомлений;
- privacy processors и retention;
- responsible-use/help configuration.

`MarketProfile` — versioned системная конфигурация территории. Клиент и пользователь её не изменяют.

Первый профиль имеет внутренний id `GB_EW_SC`, `storefront_country=GB` и `eligible_territories=[England, Wales, Scotland]`. Storefront-сигнал `GB` — лишь один evidence class: пользователь из Northern Ireland получает `unsupported` на сервере и не наследует доступ только потому, что использует UK storefront.

### 4.4 UserMarketEligibility

Для каждого пользователя отдельно хранится:

- `market_profile_id`;
- статус `eligible / verification_required / verification_pending / travel_limited / unsupported / blocked / signal_conflict`;
- geo/payment/store/residency evidence classes без лишнего раскрытия чувствительных данных;
- причина решения;
- policy version;
- checked-at и expires-at;
- история EligibilityCheck.

Ни клиент, ни locale не могут повысить `UserMarketEligibility`. Повторная проверка может сохранить или понизить доступ; повышение происходит только по серверной policy.

### 4.5 Глобальное расширение

Для каждого нового рынка применяется один и тот же gate:

1. Legal memo по продукту, рекламе, данным, платежам и stores.
2. MarketProfile и серверные policy-тесты.
3. Локальные terms/privacy/help и проверенные переводы.
4. Storefront, billing, tax и support readiness.
5. Проверка источников данных и прав на их использование.
6. Полный набор blocked/travel/verification states.
7. Только после этого — включение рынка.

Это не этапы продукта. Это повторяемая процедура допуска территории к уже полностью спроектированному продукту.

## 5. Информационная архитектура

### 5.1 Пять канонических разделов

| Раздел | Главный вопрос | Содержание |
|---|---|---|
| Home | Что требует внимания сейчас? | состояние, риск, очередь Review, свежесть, быстрые действия |
| Research | Что известно о событии? | fixtures, evidence, event workspace, Market Lab, watchlist |
| Journal | Что я решил и что произошло? | Decisions, Bets, capture/import, audit history |
| Insights | Что показывает моя история? | performance, CLV, calibration, Review, reports |
| Risk | Каков мой текущий предел риска? | bankrolls, exposure, limits, cooldown, simulations |

Глобальные возможности:

- `+ Add`;
- Review Inbox;
- Search;
- Privacy View;
- contextual Assistant;
- Tools;
- Notifications;
- Settings.

### 5.2 Навигация по платформам

**Desktop / tablet**

- левая или верхняя primary navigation: Home, Research, Journal, Insights, Risk;
- постоянная кнопка `+ Add`;
- utility zone: Search, Review Inbox, Privacy View, Assistant, Notifications, Settings;
- активный bankroll и market state доступны без перехода в настройки.

**Mobile**

- нижние вкладки: Home, Research, Journal, Insights, Risk;
- постоянная плавающая `+ Add`;
- utility actions в верхнем bar и sheet;
- порядок и названия сущностей совпадают с Web;
- мобильная версия не скрывает критические blocked/insufficient/risk states.

**URL compatibility**

Названия и группировка меняются без разрушительного route churn. Старые ссылки получают aliases/redirects.

### 5.3 Названия на трёх языках

| `en` | `uk` | `ru` |
|---|---|---|
| Home | Головна | Главная |
| Research | Дослідження | Исследование |
| Journal | Журнал | Журнал |
| Insights | Аналітика | Аналитика |
| Risk | Ризик | Риск |
| Review | Розбір | Разбор |
| Tools | Інструменти | Инструменты |
| Assistant | Асистент | Ассистент |
| Settings | Налаштування | Настройки |
| Add | Додати | Добавить |

Термины уточняются редактором каждой локали, но экран не может смешивать языки.

### 5.4 Каноническое владение поверхностями

Одна сущность имеет одну каноническую точку управления; остальные места показывают summary или deeplink:

| Возможность | Каноническая поверхность | Другие появления |
|---|---|---|
| Review | Insights → Review | Home и global Inbox показывают очередь и ведут в Review |
| Simulations | Risk → Simulations | Tools показывает каталог и deeplink, но не вторую версию |
| Methodology | Trust Center → Methodology | Research и metric cards открывают контекстный фрагмент |
| Limits / cooldown / stop | Risk | Settings и Responsible Use только ведут к соответствующему control |
| Responsible-use guidance | Public/Trust Center → Responsible Use | Risk показывает персональные controls рядом с guidance |
| Assistant | единый Assistant shell | Research/Insights открывают его с явно подписанным context |
| Market eligibility | Settings → Market eligibility | Home показывает status card и re-check deeplink |

Контекстная панель не имеет собственной копии данных, формулы или policy.

## 6. Полная структура разделов

### 6.1 Home

**Роль:** не «праздновать результат», а показать следующий безопасный шаг.

**Верхний слой**

- market/verification state;
- активный bankroll и Privacy View;
- текущий баланс;
- realized P/L только по resolved Bets за выбранный период;
- ROI только по resolved Bets с `N` и confidence;
- открытая экспозиция;
- остаток лимита риска;
- data freshness;
- `+ Add` и Review Inbox.

**Рабочая область**

- очередь незавершённых Reviews;
- Decisions, которые скоро заблокируются;
- открытые Bets и pending resolutions;
- приближение к лимиту / cooldown / stop mode;
- actual vs expected curve;
- календарь активности;
- adherence к собственным правилам;
- недавняя активность и импорт.

**Правила**

- profit, ROI или streak не являются единственным headline;
- открытая позиция не получает промежуточный P/L: Home отдельно показывает `net cash flow to date` и `open cash at risk`;
- маленькая выборка всегда видна;
- Home объясняет, почему карточка отсутствует или неполна;
- карточки ведут в источник, а не создают ставку;
- в Privacy View суммы маскируются, структура и статусы остаются понятными.

### 6.2 Research

**Роль:** проверенное пространство исследования, не витрина сигналов.

**Подразделы**

1. Fixture Calendar.
2. Event Workspace.
3. Saved Research.
4. Watchlist.
5. Market Lab.
6. Methodology & Sources.

**Fixture Calendar**

- verified fixture, league, participants, start time и status;
- фильтры по спорту, лиге, дате и watchlist;
- явная timezone;
- started/finished события никогда не показываются как upcoming;
- stale или conflicting source создаёт blocked state.

**Event Workspace**

- факты о событии и источник каждого факта;
- отметка времени и freshness;
- сравнение только детерминированных описательных методов, например devig; никаких predictive models;
- inputs, assumptions, uncertainty и method version;
- evidence for / evidence against;
- заметки пользователя;
- сохранение в Research или создание Decision draft;
- никаких bookmaker links, recommended stake и CTA «bet now».

**Граница вероятностей**

- `user_probability_snapshot` — только собственная необязательная оценка пользователя, введённая до события; она используется для его Calibration/Brier и ретроспективного `user_expected_value`;
- `market_implied_probability_snapshot` — детерминированное преобразование verified price с указанными source, timestamp и devig method; это описательный market baseline, а не прогноз BetTracker;
- `model_probability_snapshot` в активном продукте отсутствует: Research, Tools, Assistant и pre-event Decision не показывают системную вероятность победы;
- Market-implied probability не подменяет user probability и не участвует в personal calibration;
- никакой probability snapshot не используется для ранжирования событий, opportunity alerts или recommended action;
- legacy Scout/model fields сохраняются только как исторические данные миграции и не выводятся в working pre-event flows.

**Market Lab**

- нейтральный chronological/filterable dataset;
- paper-only сценарии;
- сортировка по времени, источнику, рынку и качеству данных;
- запрещена сортировка «best», «top opportunity», «highest profit»;
- каждая строка показывает coverage, freshness, method и uncertainty;
- отсутствие verified data блокирует вывод, а не заменяется LLM-текстом.

**Research Analyst**

- объясняет только переданный verified dataset;
- не создаёт fixture, odds, injury или result из памяти;
- числа получает из deterministic services;
- может сравнить детерминированные методы и перечислить неопределённости;
- отказывается отвечать «на что поставить» и «сколько поставить»;
- не может создать Bet и не может изменить Risk limits.

### 6.3 Journal

**Роль:** единый аудируемый журнал решения, действия и результата.

**Подразделы**

1. Decision Ledger.
2. Bets.
3. Add / Capture.
4. Imports.
5. Resolution Queue.
6. Audit History.

#### Decision Ledger

Decision до события содержит:

- fixture или пользовательское событие;
- hypothesis;
- `user_probability_snapshot`: собственную необязательную probability/confidence;
- evidence for;
- evidence against;
- alternatives considered;
- invalidation condition;
- planned action: `Pass / Paper / Track external action`;
- `RiskScenario`: выбранный bankroll, введённые пользователем intended cash amount или units, currency, текущую и projected exposure;
- risk check snapshot с `risk_policy_version`, проверенными limits и server timestamp;
- tags и note;
- created-at, method/source versions и server start time.

Правила:

- Decision блокируется сервером в момент начала события;
- после блокировки исходные поля неизменяемы;
- исправление оформляется revision с причиной и audit trail;
- пользователь может принять `Pass` — это полноценное решение;
- поздно созданная запись маркируется `retrospective` и не участвует в pre-event calibration;
- Decision не обязан превращаться в Bet;
- Bet может быть добавлен ретроспективно без Decision, но система явно показывает потерю pre-event evidence;
- сумму Intended Exposure вводит только пользователь: Research, Tools и AI не заполняют и не рассчитывают её;
- для `Pass` Intended Exposure равна нулю; для `Paper` она может быть сохранена только как явно помеченный hypothetical scenario и не занимает реальную exposure;
- `Track external action` нельзя заблокировать как Decision, если projected exposure нарушает hard limit; Draft, Pass и Paper остаются доступны;
- после внешнего действия пользователь отдельно записывает Bet в Journal; связь показывает intended vs actual amount и execution deviation, но не создаёт Bet автоматически.

#### Bets

Поддерживаются:

- single;
- parlay/express с ordered legs;
- manual entry;
- OCR/coupon scan;
- CSV import;
- связь с Decision при записи уже совершённого внешнего действия;
- retrospective entry.

Risk limits, Cooldown и Stop Mode никогда не запрещают правдивую запись уже совершённого внешнего действия, import, correction или settlement. Такая запись получает `outside_plan`, если действие нарушило зафиксированный план; это не override и не превращается в action CTA.

Поля:

- event, date/time, sport, league;
- user-defined source без промологотипов;
- market, selection, decimal canonical odds;
- отображаемый odds format;
- stake, units, bankroll;
- free-bet flag;
- tags, note;
- closing line, source и timestamp;
- structured legs;
- executions;
- resolution;
- audit versions.

**Execution model**

- placement;
- stake adjustment как отдельная разрешённая correction;
- partial cashout;
- full cashout;
- partial/full refund;
- settlement return или zero-return result;
- void return;
- cancellation только в допустимом состоянии.

`Execution` — единый источник placement и любого последующего cash movement. `Resolution` создаётся как append-only terminal record, когда residual exposure равна нулю и Bet терминален; он хранит outcome `won / lost / push / void / cashout / refund / mixed`, `resolved_at`, reason/source, terminal execution refs и при наличии отдельный `event_result_at`. Full cashout/refund и обычный event settlement проходят через этот же contract.

Resolution сам не создаёт второй денежный entry: его terminal Execution уже породил LedgerEntry, а zero-return loss хранится Execution без денежного LedgerEntry. Каждое исполнение имеет сумму, время, источник, причину и автора. Exposure и net cash flow всегда пересчитываются из execution ledger; realized P/L появляется только после Resolution и также не хранится как перезаписываемое итоговое поле.

#### Capture / OCR

- изображение сначала превращается в review draft;
- каждое поле имеет confidence;
- low-confidence поля выделены;
- пользователь подтверждает fixture, market, odds, stake и bankroll;
- никакая запись не создаётся до явного подтверждения;
- исходное изображение и retention объясняются до загрузки;
- повторное подтверждение одного draft идемпотентно.

#### CSV Import

- загрузка;
- mapping columns;
- locale-aware parsing;
- validation;
- duplicate review;
- preview;
- подтверждение;
- idempotent import;
- downloadable error report;
- rollback всего batch;
- audit trail.

Import не должен молча нормализовать неоднозначные даты, запятые, odds format или валюту.

### 6.4 Insights

**Роль:** объяснить историю пользователя без ложной точности.

**Подразделы**

1. Performance.
2. Price & CLV.
3. Expected vs Actual.
4. Calibration.
5. Review / Coach.
6. Reports.

**Общие display rules**

- период;
- `N`;
- denominator;
- data completeness;
- confidence / uncertainty;
- excluded records;
- formula version;
- source freshness;
- insufficient-data state;
- ссылка на Methodology.

**Performance**

- realized P/L только по resolved Bets, с выбором по `resolved_at`;
- ROI только по resolved cash stake;
- win rate;
- turnover;
- drawdown;
- open exposure;
- net cash flow показывается отдельным cash-ledger view и не называется P/L;
- segmentation по bankroll, sport, market, tag, source и времени;
- сравнение периодов только на сопоставимой базе.

**Price & CLV**

- decimal canonical odds;
- closing source и timestamp;
- coverage: сколько записей имеют сопоставимую closing line;
- raw и no-vig view;
- выбранный devig method;
- отсутствие closing data не превращается в ноль;
- никакого утверждения о будущей прибыли.

**Expected vs Actual**

- `Personal expectation` рассчитывается только из pre-event `user_probability_snapshot` и сравнивается с фактом лишь после resolution;
- `Market baseline` отдельно использует verified `market_implied_probability_snapshot` и явно называется описательным price baseline, а не прогнозом модели;
- `market_implied_probability_snapshot` не участвует в Brier/personal calibration;
- фактический результат отделён от качества решения и включает только resolved Bets;
- uncertainty band обязателен;
- нет соответствующего snapshot — запись исключается из конкретного view с объяснением;
- в этом разделе нет `model_probability_snapshot`, системного pre-event forecast или opportunity ranking.

**Calibration**

- calibration curve только для `user_probability_snapshot`;
- Brier score;
- bins и `N` в каждом bin;
- minimum sample threshold;
- retrospective decisions и late edits исключаются;
- при недостаточной выборке показывается educational state, а не score.

**Review / Coach**

Формат каждого наблюдения:

1. Observation.
2. Evidence: период, `N`, сравниваемая база.
3. Confidence: Low / Medium / High.
4. Question.
5. Options.
6. User rule / note.

Coach не говорит «делайте эту ставку», не оценивает упущенную прибыль и не использует контрфактическое «это стоило вам £X».

**Reports**

- weekly;
- monthly;
- custom period;
- сравнимые формулы с интерактивным продуктом;
- локализованный export;
- Privacy View;
- явная версия данных и время формирования.

### 6.5 Risk

**Роль:** показать доступный риск и удержать собственные правила пользователя.

**Подразделы**

1. Bankrolls.
2. Transactions.
3. Exposure.
4. Limits.
5. Cooldown & Stop Mode.
6. Simulations.

**Bankrolls**

- несколько банкроллов;
- currency и reporting-currency conversion;
- opening balance;
- tracked cash balance;
- open cash at risk;
- equity view только с явной методикой оценки открытых позиций;
- units;
- archive без удаления истории.

**Transactions**

- deposit;
- withdrawal;
- adjustment;
- transfer между собственными bankrolls;
- fee;
- FX adjustment;
- связь с Bet executions.

Deposits и withdrawals никогда не входят в P/L.

**Limits**

- net loss, turnover, bet count и open exposure — обязательные user-defined caps;
- drawdown — отдельный user-defined diagnostic cap;
- период и значение задаёт пользователь; BetTracker не предлагает «правильную» сумму;
- 80–100% cap — soft warning; продолжение `Track external action` требует `soft_override` с причиной;
- projected value >100% cap — hard breach без override: Decision можно сохранить Draft, Pass или Paper, но нельзя lock как `Track external action`;
- запись уже совершённого внешнего действия всегда доступна как factual Journal entry и при необходимости маркируется `outside_plan`;
- все предупреждения, overrides, breaches и изменения имеют audit trail.

**RiskPolicy RISK_GB_EW_SC_V1**

Это обязательная versioned RiskPolicy первого MarketProfile, а не набор значений, которые должен придумать дизайн:

| Правило | Значение |
|---|---|
| Warning threshold | `80%` каждого активного cap |
| Soft override | Разрешён только от `80%` до `100%` включительно; explicit confirmation + обязательная приватная причина |
| Hard breach | При projected value `>100%`; override запрещён для pre-event `Track external action` |
| Tighten limit | Действует немедленно по server time |
| Loosen limit | `LIMIT_RELAX_DELAY=24h`; до `effective_at` действует старое значение |
| Pending loosen во время restriction | Вступает не раньше завершения Cooldown/Stop recovery и своего `effective_at` |
| Cooldown durations | `24h / 72h / 7d / 30d`; все варианты hard, без досрочного снятия |
| Fixed Stop Mode | `7d / 30d / 90d`; затем `STOP_RECOVERY_DELAY=24h` и явное подтверждение пользователя |
| Indefinite Stop Mode | Запрос выхода запускает `STOP_EXIT_DELAY=7d`; запрос можно отменить, ускорить нельзя; после срока требуется подтверждение |
| Всегда доступны | factual Journal/Add Bet, import/correction/settlement, history, Review, export/delete, billing cancellation, security, help/resources |
| Блокируются в Cooldown/Stop | future-fixture Research, новые pre-event Decisions, Tools/Simulations и action-adjacent Assistant requests |

Если fixed Stop заканчивается, pre-event/action-adjacent surfaces остаются заблокированы в `recovery_pending`, пока не прошли 24 часа и пользователь не подтвердил возврат. Не подтверждает — restriction продолжается. Все сроки считаются сервером.

**Cooldown**

- один из периодов policy: `24h / 72h / 7d / 30d`;
- причина опциональна и приватна;
- фактическая запись уже совершённого действия и все «всегда доступные» поверхности сохраняются;
- future-fixture Research, новые pre-event Decisions, Tools/Simulations и action-adjacent Assistant блокируются;
- досрочное снятие и сокращение периода невозможны.

**Stop Mode**

- использует fixed или indefinite правила `RISK_GB_EW_SC_V1`;
- блокирует pre-event и action-adjacent возможности, но не factual record уже совершённого действия;
- не блокирует settlement, Review, историю, import/correction, экспорт, удаление, billing cancellation и support;
- состояние видно на всех платформах;
- досрочное восстановление невозможно и следует только server timers/confirmation policy.

**Simulations**

- risk of ruin;
- Monte Carlo;
- drawdown range;
- bankroll path;
- fractional Kelly как scenario, не recommendation;
- inputs, formula, assumptions и worst case;
- связь с текущим bankroll, exposure и limits.

Текущий loss-recovery tennis calculator не входит в глобальный продукт. Он либо остаётся private Founder Lab, либо полностью перепроектируется как нейтральный risk simulator без 40:40 progression и обещания отыгрыша.

## 7. Global Add

`+ Add` открывает единый chooser:

- Decision;
- Bet;
- Paper Decision;
- Deposit / Withdrawal / Adjustment;
- Scan coupon;
- CSV import;
- Calculation;
- Note / Research item.

Правила:

- контекстный prefill разрешён, скрытая автозапись — нет;
- в Research пункт `Bet` в chooser disabled с объяснением; разрешены Decision, Paper, Calculation и Note;
- Research никогда не передаёт fixture, selection, odds или probability output в Bet draft;
- связать Decision с Bet можно только в Journal при записи уже совершённого внешнего действия;
- `RiskScenario` обновляется непосредственно перед lock Decision; intended amount никогда не prefilled;
- при factual Add Bet сервер записывает фактический risk state/`outside_plan`, но не блокирует сохранение уже совершённого действия;
- market, cooldown, stop и stale states проверяются сервером;
- все действия возвращают понятный result state и audit reference.

## 8. Tools

### 8.1 Каталог

- odds converter;
- implied probability / break-even;
- hold / vig / devig;
- EV и CLV;
- fractional Kelly scenario;
- position math: hedge / arbitrage / middling только по введённым пользователем позициям;
- parlay math;
- correlation warning;
- Monte Carlo;
- risk of ruin;
- sport-specific safe calculators.

### 8.2 Единый шаблон calculator

Каждый calculator показывает:

- inputs;
- units и canonical format;
- assumptions;
- formula;
- method comparison, если методов несколько;
- result range;
- worst case;
- ограничения метода;
- связь с bankroll, exposure и limits;
- `Save calculation`.

Для Kelly, hedge, arbitrage и middling действует дополнительный output contract:

- только пользовательские inputs и уже записанные позиции;
- нет сканирования букмекеров или поиска возможностей;
- нет suggested allocation, recommended stake и автоматического распределения сумм;
- результат — диапазон outcomes, sensitivity и worst case;
- calculation не создаёт и не prefill-ит Decision или Bet.

Calculator никогда:

- не создаёт Bet;
- не создаёт Decision;
- не выбирает источник;
- не предлагает сумму как действие;
- не использует loss-chasing copy;
- не скрывает формулу за одним «magic score».

## 9. Assistant и AI policy

### 9.1 Два контекста

| Контекст | Разрешённые данные | Разрешённый результат |
|---|---|---|
| Research Analyst | verified fixture/source data и deterministic outputs | объяснение фактов, методов, uncertainty |
| Personal Assistant | собственная история, prepared metrics, Reviews | объяснение паттернов и вопросы для разбора |

Контексты не смешиваются молча. Пользователь всегда видит, какие данные использованы.

### 9.2 Обязательный pipeline

1. Проверка market и consent.
2. Выбор allowlisted data view.
3. Deterministic calculations.
4. Freshness / completeness gate.
5. Prompt policy.
6. Model response.
7. Output policy.
8. Evidence card и activity log.

### 9.3 Разрешено

- объяснить готовую метрику;
- сравнить методы;
- сформулировать вопрос к Review;
- помочь структурировать hypothesis/evidence;
- кратко пересказать verified event data;
- объяснить, почему данных недостаточно;
- локализовать ответ в активный язык.

### 9.4 Запрещено

- выбирать ставку, исход или экспресс;
- рекомендовать stake;
- создавать/редактировать Bet;
- ослаблять limits;
- отключать cooldown/stop;
- придумывать fixture, odds, injury или result;
- обещать доходность;
- использовать историю других пользователей;
- выдавать model text за deterministic metric.

### 9.5 Privacy и контроль

- AI opt-in отдельно от общих Terms;
- memory opt-in отдельно от AI;
- понятный список data classes;
- provider class и retention disclosure;
- AI activity history;
- delete/export AI history;
- disable AI без потери Journal;
- отказ и error state локализованы;
- model/provider migration не меняет формулы.

## 10. Онбординг и доступ

### 10.1 Public

- Landing;
- How it works;
- Methodology;
- Responsible use;
- Pricing;
- Security & Privacy;
- Help / Status;
- Legal;
- Market availability.

Публичный маркетинг для первой доступности ориентирован на Great Britain — England, Wales and Scotland. Наличие `uk` и `ru` не создаёт отдельные UA/RU storefronts или market landing pages.

### 10.2 Onboarding

1. Выбор `en / uk / ru`.
2. Проверка eligibility для `GB_EW_SC` и 18+; UK storefront сам по себе недостаточен.
3. Account/security.
4. Privacy и optional AI consent.
5. Первый bankroll и reporting preferences.
6. Базовые risk limits.
7. Первый источник данных: manual, scan или CSV — равноправные варианты.
8. Первый Decision/Bet.
9. Короткий guided Review.

Не спрашиваем profit goal, желаемый выигрыш и «уровень игрока» для персонализации давления.

До регистрации доступен synthetic read-only demo без реальных пользовательских данных.

### 10.3 Auth и security

- email/magic link или поддерживаемый SSO;
- passkey;
- PIN/biometric на mobile;
- session list;
- revoke session;
- login alerts;
- re-auth для export/delete/billing/security;
- account recovery;
- market re-check при существенном изменении сигнала.

## 11. Монетизация

### 11.1 Структура

- Free;
- Pro monthly;
- Pro annual.

Цены, налоги и квоты приходят из versioned entitlement/pricing config. UI не содержит hardcoded «unlimited», если на сервере существует fair-use или технический предел.

### 11.2 Никогда не paywall

- собственная история;
- manual Journal;
- settlement;
- export;
- delete;
- Privacy View;
- security;
- responsible-use resources;
- cooldown/stop;
- billing cancellation;
- доступ к данным после отмены подписки.

### 11.3 Можно монетизировать

- advanced segmentation;
- calibration и extended reports;
- дополнительные bankrolls;
- OCR quota;
- AI quota;
- saved Research capacity;
- advanced simulations;
- automated reports.

### 11.4 Paywall требования

- точная цена, период и налоговый статус;
- точные entitlement values;
- текущий usage и reset date;
- trial terms до подтверждения;
- restore purchase;
- payment pending/failed/refunded states;
- понятная отмена;
- сохранение истории после downgrade;
- сравнение тарифов без profit claims и pressure copy.

До утверждения коммерческого config Claude Design не придумывает цены и квоты. В макетах используются именованные tokens, например:

- `{{pricing.pro_monthly_gbp}}`;
- `{{pricing.pro_annual_gbp}}`;
- `{{entitlement.free_ocr_monthly}}`;
- `{{entitlement.pro_ai_monthly}}`;
- `{{entitlement.free_saved_research}}`.

High-fidelity показывает структуру и все billing states; фактические числа подставляются только из согласованного versioned fixture/config.

## 12. Settings и Trust Center

### 12.1 Settings

**Account & Security**

- профиль;
- email/auth methods;
- passkey/PIN/biometric;
- sessions;
- recovery.

**Market eligibility**

- текущий `GB_EW_SC` profile и отдельный `storefront_country=GB`;
- evidence status;
- дата проверки;
- read-only legal territory;
- travel/verification help.

**Language & Display**

- `en / uk / ru`;
- timezone;
- decimal / fractional / American display;
- reporting currency;
- units;
- Privacy View default;
- date/number format.

**Notifications**

- Review due;
- import result;
- risk threshold;
- security;
- subscription.

Запрещены opportunity, odds-move и «вернитесь сделать ставку» pushes.

**Billing**

- plan;
- entitlement usage;
- invoices;
- payment method;
- cancel/downgrade/restore.

**AI & Privacy**

- AI consent;
- memory;
- data classes;
- activity history;
- export/delete;
- provider disclosure.

**Data**

- CSV import;
- export;
- retention;
- delete request;
- request status;
- published completion timeline.

**Responsible use**

- limits;
- cooldown;
- stop mode;
- help resources;
- policy explanation.

### 12.2 Trust Center

- methodology;
- metric formulas;
- method, simulation и AI-provider versions;
- source coverage;
- freshness policy;
- change log;
- security/privacy;
- processor categories;
- service status;
- known limitations;
- legal versions.

## 13. Метрики и единая математика

| Метрика | Определение | Обязательное раскрытие |
|---|---|---|
| Realized P/L | для полностью resolved Bet: cash settlement/cashout/refund returns минус cash stake и bet fees; promo и deposits/withdrawals исключены | `resolved_at` period, free-bet treatment, void/refund rules, currency |
| ROI | resolved realized P/L / resolved cash stake | denominator, `resolved_at` period, `N`, excluded states |
| Win rate | wins / resolved win-or-loss Bets | pushes/voids excluded, parlays counted once |
| Turnover | сумма cash stake | free bets и adjustments отдельно |
| Open exposure | worst-case cash loss открытых позиций по execution ledger | timestamp, bankroll, free-bet handling |
| Break-even | `1 / decimal_odds` | canonical decimal odds |
| EV | `p × net_win − (1 − p) × stake` | `p` только из explicit user input или verified market-implied method; source, timestamp, method version; не model prediction |
| CLV | placed price против comparable closing price | raw/no-vig, source, method, coverage |
| Brier | mean squared error между `user_probability_snapshot` и outcome | sample threshold, bins, exclusions; market-implied probability не входит |
| Drawdown | падение от исторического equity peak | equity definition, currency, period |
| Adherence | выполненные собственные rules / применимые rules | список rules, denominator |

### 13.1 Денежный ledger

BetTracker не хранит реальные средства, но ведёт единый учёт внешнего bankroll. Каноническое правило: **cash stake списывается из tracked cash balance при подтверждённом placement и не вычитается второй раз при settlement**.

`tracked_cash_balance`:

> opening balance + deposits − withdrawals + transfers in − transfers out − placed cash stakes + settlement returns + cashout returns + refunds − fees + corrections + FX adjustments

`open_cash_at_risk`:

> сумма residual cash stake всех открытых Bets после partial cashout/refund/void executions

`bet_net_cash_flow_to_date`:

> settlement returns + cashout returns + refunds − placed cash stake − bet fees

Это cash-ledger движение на текущий момент, а не P/L открытой позиции.

`resolved_bet_realized_pnl`:

> settlement returns + cashout returns + refunds − placed cash stake − bet fees

Формула численно совпадает после полного resolution, но метрика существует только когда есть Resolution, Bet `resolved` и `open_cash_at_risk=0`. До этого Bet Detail показывает `net cash flow to date`, `cash returned to date` и `open cash at risk`, а поле P/L имеет состояние `not available — open position`.

`equity` не является синонимом cash balance. Если она показывается, открытые позиции оцениваются отдельным versioned method; method, timestamp и uncertainty видны пользователю.

| Событие ledger | Cash balance | Open cash at risk | Lifecycle / outcome |
|---|---|---|---|
| Placement cash stake `S` | `−S` | `+S` | `upcoming/open`; P/L `not available`, показывается net cash flow |
| Partial cashout return `C` | `+C` | устанавливается в подтверждённый `remaining_stake_basis` | lifecycle остаётся `open`; P/L `not available`, execution badge `partial cashout` |
| Full cashout return `C` | `+C` | `0` | terminal Execution → Resolution `cashout` |
| Refund `R` | `+R` | уменьшается на refunded stake basis | partial остаётся `open`; residual `0` → Resolution `refund` |
| Void | возвращённая cash stake зачисляется один раз | `0` | terminal Execution → Resolution `void`, P/L `0` без fees |
| Settlement return `R` | `+R` | `0` | terminal Execution → Resolution `won/lost/push` |
| Correction | compensating ledger entry | пересчёт из audit trail | исходная execution не удаляется |
| Free-bet placement | без изменения | cash exposure `0` | promo stake учитывается отдельно |

Для partial cashout execution хранит `cashout_return`, `remaining_stake_basis`, время и источник. Если remaining basis больше нуля, Bet не становится resolved.

Home и основной Performance view считают realized P/L/ROI только по Bets, чьи Resolution получили `resolved_at` в выбранном периоде. Для full cashout/refund используется время их terminal Execution; для event outcome отдельно можно хранить `event_result_at`. Open Bets не входят в эти метрики. Cash Ledger может отдельно фильтровать движения по `entry_at`; это другой view с названием `Net cash flow`, и его нельзя визуально или текстово выдавать за P/L.

Free-bet stake не входит в cash turnover и ROI denominator. Promo returns показываются отдельной метрикой; combined view возможен только с явным раскрытием.

Округление не меняет ledger. Для multi-currency каждый entry хранит original currency/value и reporting FX rate/source/time.

### 13.2 Общие правила

Правила:

- формула реализована один раз в versioned deterministic service;
- Web, iOS, Android, export и AI используют один результат;
- округление применяется только при отображении;
- currency conversion показывает FX source/time;
- исправление формулы создаёт versioned change note;
- «нет данных» не кодируется нулём;
- metric card всегда может открыть methodology.

## 14. Каноническая модель данных

| Entity | Назначение |
|---|---|
| MarketProfile | внутренний market id, eligible territories, storefront mapping и legal/billing/data gates |
| UserMarketEligibility | решение о доступе конкретного пользователя |
| EligibilityCheck | evidence classes, policy version, checked/expires timestamps |
| UserPreferences | locale, timezone, odds format, reporting display |
| Bankroll | баланс, currency, units, status |
| Transaction | deposit/withdrawal/adjustment/transfer/fee/FX |
| LedgerEntry | immutable signed movement from Transaction/Execution/Correction |
| Fixture | проверенное событие и server start |
| SourceEvidence | источник, timestamp, freshness, coverage |
| AnalysisSnapshot | immutable inputs, deterministic descriptive method version и outputs; не predictive probability |
| ProbabilitySnapshot | `user_probability` или `market_implied_probability`, provenance, timestamp и method; `model_probability` запрещён |
| ResearchItem | сохранённые notes/evidence пользователя |
| WatchlistEntry | подписка пользователя на fixture/team/league без opportunity push |
| Decision | pre-event hypothesis, evidence, choice, ProbabilitySnapshot refs и locked risk snapshot |
| RiskScenario | user-entered intended exposure, bankroll, currency, projected exposure и policy result до Decision lock |
| Bet | пользовательская запись действия |
| BetLeg | структурированная нога parlay |
| Execution | placement/cashout/refund/settlement-return/void-return/correction; единственный cash-movement source для Bet |
| Resolution | terminal outcome, `resolved_at`, source/reason и terminal execution refs |
| Review | post-result reflection и rule update |
| UserRule | собственное правило процесса и область применимости |
| Limit | тип, значение, период и current status |
| LimitChange | tighten/loosen request, effective-at и audit |
| RiskPolicy | versioned thresholds, allowed/blocked surfaces, delays и recovery rules |
| RiskOverride | soft-warning acknowledgement, private reason, policy version и timestamp |
| CooldownRecord | scheduled/active/completed cooldown |
| StopRecord | stop-mode lifecycle и server policy |
| Insight | deterministic observation с `N`, period, confidence |
| Calculation | inputs/formula/version/result |
| ImportBatch | mapping, validation, duplicates, rollback |
| Subscription | plan, entitlements, usage, billing state |
| ConsentRecord | legal/privacy/AI/memory versions |
| AuditEvent | append-only история значимых изменений |

### 14.1 Связи и инварианты

- MarketProfile не хранит пользовательский verification state; UserMarketEligibility строится из EligibilityChecks.
- Bankroll balance и exposure выводятся из append-only LedgerEntries; correction создаёт compensating entry.
- `GB_EW_SC` хранит `eligible_territories=[England,Wales,Scotland]` и `storefront_country=GB`; storefront evidence не повышает eligibility самостоятельно.
- Fixture имеет много SourceEvidence и AnalysisSnapshots.
- AnalysisSnapshot не содержит system-generated pre-event win probability.
- ResearchItem и WatchlistEntry никогда не создают Bet и не получают opportunity push.
- Decision ссылается на immutable Fixture/Analysis/Probability snapshots, если они использованы.
- `user_probability_snapshot` и `market_implied_probability_snapshot` имеют разные kinds и consumers; только первый участвует в personal calibration.
- Decision `Track external action` содержит user-entered RiskScenario; Research, Tools и AI не передают в него сумму.
- Decision может завершиться `Pass`, `Paper` или связью с Bet.
- Bet может быть retrospective и не иметь Decision.
- Bet имеет ordered BetLegs и append-only Executions.
- Terminal Bet имеет один active Resolution; correction создаёт superseding Resolution version и compensating LedgerEntry, а не меняет старую запись.
- Resolution не перезаписывает исходное решение и не создаёт повторный LedgerEntry.
- Review создаётся после результата и не изменяет pre-event поля.
- Review может предложить UserRule draft; правило появляется только после подтверждения пользователя.
- LimitChange ослабляет лимит только после server effective-at по `RISK_GB_EW_SC_V1`; ужесточение действует сразу.
- CooldownRecord и StopRecord невозможно закрыть клиентским или AI-вызовом в обход policy.
- Insight читает prepared deterministic data и хранит `N/period/confidence/version`.
- AI читает allowlisted views, а не сырые произвольные таблицы.
- Subscription ограничивает entitlements, но не владение историей.

## 15. Полная матрица состояний

### 15.1 Market eligibility

- eligible;
- verification required;
- verification pending;
- travel limited;
- unsupported;
- blocked;
- market signal conflict;
- legal terms update required.

### 15.2 Data

- empty;
- loading;
- ready;
- partial;
- stale;
- conflicting;
- source unavailable;
- offline;
- sync pending;
- sync conflict;
- permission denied.

### 15.3 Decision

- draft;
- ready;
- locked;
- in progress;
- pass;
- paper;
- linked to Bet;
- result available;
- review due;
- reviewed;
- not scorable;
- retrospective;
- correction requested.

### 15.4 Bet

**Lifecycle**

- draft;
- upcoming;
- open;
- pending resolution;
- resolved;
- cancelled;
- needs correction.

**Outcome**

- won;
- lost;
- push;
- void;
- cashout;
- refund;
- mixed.

**Execution badges**

- partial cashout;
- full cashout;
- partial refund;
- correction;
- outside plan.

Partial cashout — не lifecycle state: Bet остаётся `open`, пока `remaining_stake_basis > 0`.
Для `upcoming/open/pending resolution` realized P/L имеет состояние `not available`; cash movement и exposure показываются отдельными полями.

### 15.5 Import/OCR

- uploaded;
- parsing;
- mapping required;
- low confidence;
- validation failed;
- duplicates found;
- ready to confirm;
- importing;
- partially imported;
- completed;
- rolled back;
- error report ready.

### 15.6 Insights

- ready;
- insufficient sample;
- missing closing data;
- incomplete coverage;
- confidence low/medium/high;
- formula updated;
- data stale;
- excluded records.

### 15.7 Risk

- within limits;
- warning `80–100%`;
- soft override reason required;
- hard breach `>100%`;
- hard override denied;
- limit tighten applied;
- limit relaxation pending;
- cooldown scheduled;
- cooldown active;
- stop mode active;
- recovery pending.

### 15.8 AI

- disabled;
- consent required;
- ready;
- processing;
- insufficient data;
- stale evidence;
- policy refusal;
- quota reached;
- provider unavailable;
- response flagged;
- history deleted.

### 15.9 Subscription

- free;
- trial;
- active;
- renewal pending;
- payment failed;
- grace period;
- cancelled;
- expired;
- refunded;
- restore available.

### 15.10 Privacy/Data rights

- Privacy View on/off;
- export requested/preparing/ready/expired/failed;
- delete requested/re-auth required/cooling period/in progress/completed;
- retention disclosure;
- consent withdrawn.

Каждое состояние должно иметь: заголовок, объяснение, допустимое действие, недопустимое действие, восстановление, telemetry event и локализованный текст.

## 16. Основные пользовательские потоки

### 16.1 Первый полный цикл

1. Locale.
2. `GB_EW_SC` eligibility / 18+; `storefront_country=GB` не считается достаточным.
3. Account and consent.
4. Bankroll.
5. Risk limits.
6. Add Decision.
7. User-entered Intended Exposure и server Risk Check.
8. Lock как Pass / Paper / Track external action.
9. Optional Bet record in Journal after an external action, с intended vs actual.
10. Resolution.
11. Review.
12. Home показывает завершённый цикл и следующий безопасный шаг.

### 16.2 Research → Decision

1. Fixture Calendar.
2. Event Workspace.
3. Проверка evidence/freshness.
4. Собственная hypothesis и необязательный `user_probability_snapshot`.
5. Decision draft.
6. Пользователь сам вводит Intended Exposure или выбирает Pass/Paper.
7. Сервер формирует RiskScenario result по `RISK_GB_EW_SC_V1`.
8. Save Draft или server-lock.
9. Внешнее действие при необходимости записывается отдельно в Journal; система показывает intended vs actual.

Research не имеет прямого перехода к Bet.

### 16.3 Manual / OCR / CSV

Все три входа заканчиваются одной и той же canonical Bet schema, review, duplicate policy и audit trail. Ни один канал не считается «второстепенным».

### 16.4 Resolution → Review

1. Terminal Execution, result source или manual confirmation создаёт единый Resolution с `resolved_at`.
2. Execution-aware resolution и realized P/L; для open Bet P/L отсутствует.
3. Decision vs result.
4. Expected vs actual.
5. Review questions.
6. Optional rule update.
7. Insight refresh.

### 16.5 Risk breach

1. Перед lock сервер пересчитывает user-entered Intended Exposure и projected limit usage.
2. При `80–100%` показывает affected limit и remaining risk.
3. Пользователь может сам изменить intended amount, выбрать Paper/Pass, отменить либо сделать `soft_override` с обязательной причиной.
4. При `>100%` lock как `Track external action` запрещён без override; Draft/Paper/Pass доступны.
5. Если внешнее действие уже произошло, factual Add Bet сохраняется и получает `outside_plan`; сервис не скрывает историю.
6. Exceeded state синхронно виден на всех платформах.
7. Cooldown/stop никогда не снимается AI или клиентом.

### 16.6 Travel / unsupported market

1. Market conflict state.
2. Объяснение без обвинительного copy.
3. History, Review, export, delete, billing и support доступны.
4. Pre-event и чувствительные возможности ограничены server policy.
5. Re-check flow и audit event.

### 16.7 Cancellation

1. Показ plan и последствий.
2. Cancel без скрытого маршрута.
3. Confirmation и effective date.
4. Собственная история сохраняется.
5. Export доступен.
6. Downgrade корректно применяет entitlements без удаления записей.

### 16.8 Bet lifecycle / cashout / correction

1. Journal → Add Bet после внешнего placement.
2. Placement создаёт cash ledger entry и open exposure.
3. Partial cashout записывает return и remaining stake basis; Bet остаётся open.
4. Full cashout/refund/void/event settlement закрывает residual exposure terminal Execution и создаёт Resolution.
5. Correction создаёт compensating entry и audit event.
6. Bet Detail и Bankroll получают единые ledger values; Home/Insights получают realized P/L только после resolution, а до него — отдельные net cash flow/open-risk values.

### 16.9 OCR / CSV / rollback

1. Upload и privacy disclosure.
2. Parse/mapping.
3. Field confidence и validation.
4. Duplicate review.
5. Preview.
6. Explicit confirm.
7. Idempotent import.
8. Result/error report.
9. Whole-batch rollback с audit event.

### 16.10 Limit change / cooldown recovery

1. Пользователь выбирает tighten или loosen.
2. Tighten применяется сразу.
3. Loosen показывает `effective_at = requested_at + 24h` и до этого использует старый cap.
4. Активный Cooldown/Stop переносит вступление loosen до завершения recovery.
5. Cooldown завершается автоматически по server time; fixed Stop требует 24h recovery и confirmation, indefinite Stop — 7d exit delay и confirmation.
6. Factual Journal/settlement/import остаются доступны; pre-event и action-adjacent поверхности показывают blocked state.
7. Все платформы синхронно получают новый status.

### 16.11 AI consent / history deletion

1. Отдельный AI consent.
2. Отдельный memory choice.
3. Просмотр data classes и provider disclosure.
4. Assistant use с evidence card.
5. Export/delete AI history.
6. Disable AI без потери Journal.

### 16.12 Subscription / restore

1. Paywall получает price и entitlements из config.
2. Purchase/trial confirmation.
3. Pending/success/failed/grace states.
4. Cancel/downgrade.
5. Restore purchase.
6. Проверка сохранности истории и free entitlements.

### 16.13 Export / account deletion

1. Re-auth.
2. Scope и format.
3. Export preparing/ready/expired/failed.
4. Delete request и disclosure последствий.
5. Cooling/processing status, если требуется policy.
6. Completion proof и закрытие sessions.

### 16.14 Market verification

1. Eligibility check.
2. Evidence conflict или verification request.
3. Pending state.
4. Eligible/limited/unsupported decision с причиной.
5. Re-check/expiry.
6. Audit trail без раскрытия лишних sensitive signals.

## 17. Адаптация механик конкурентов

### 17.1 Берём

- Privacy View;
- canonical decimal odds плюс локальное отображение;
- structured parlay legs;
- partial cashout как execution;
- optional closing line с источником и временем;
- CSV mapping/validation/rollback;
- deposits/withdrawals отдельно от P/L;
- immutable pre-event decision;
- confidence и insufficient sample;
- `Show your work`;
- devig-method comparison;
- worst-case в calculators;
- free export и data retention после отмены;
- детерминированные числа для AI.

### 17.2 Адаптируем

- dashboard: exposure/limits/adherence выше streak/profit;
- composite score: не используем единый общий score; показываем отдельные прозрачные компоненты с `N`;
- CLV/EV: coverage, method, timestamp и uncertainty;
- Kelly: scenario, не recommended stake;
- Coach: observation → evidence → question → options;
- gamification: completion/adherence/review, не wins/profit/frequency;
- notifications: review/risk/import/security/subscription;
- OCR: обязательное ручное подтверждение и field confidence;
- Scout: Research/Market Lab без ranked opportunities.

### 17.3 Не переносим

- line-shopping extension и bookmaker sync;
- logos, affiliate links и bet CTA;
- copy-bet, social picks и ROI leaderboards;
- live win probability;
- opportunity pushes;
- auto/recommended stake;
- AI picks;
- Martingale/loss recovery;
- future earnings calculator;
- profit/streak celebration;
- opaque magic score;
- paid export;
- блокировку собственной истории после отмены.

## 18. Текущая реализация → целевая структура

| Сейчас | Целевая роль | Правило перехода |
|---|---|---|
| `/dashboard` | Home | расширить risk/review/freshness, сохранить route |
| `/ai` scanner | Global Add → Scan coupon | отделить capture от анализа |
| `/ai` Analyst | Research Analyst / contextual Assistant | только verified/prepared data |
| `/bets` | Journal → Bets | сохранить alias и данные |
| `/decisions` | Journal → Decision Ledger | сделать default journal view |
| `/analytics` | Insights | единые формулы, `N`, confidence, methodology |
| `/coach` | Insights → Review | evidence-first, без директив |
| `/bankroll` | Risk | добавить exposure/limits/cooldown/simulations |
| `/scout` | Research → Market Lab | удалить ranked/generated opportunities |
| `/tennis-calculator` | Founder Lab или safe simulator | убрать из глобальной навигации |
| `/settings` | Settings + Trust Center | добавить market/locale/privacy/security/data |
| `/login` | Auth + market eligibility | сохранить route |
| `/` authenticated shell | public Great Britain landing + `/dashboard` app | обеспечить redirects |

### 18.1 Обязательные исправления продуктовой правды

- закрепить правило R18: placement списывает cash stake один раз; привести copy `/bankroll`, ledger и тесты к уравнениям раздела 13.1;
- убрать из активных документов seven-locale scope;
- supersede predictive live Scout и LineHunter/edge slogans;
- убрать fail-open «recommended max 2%» как product recommendation;
- не показывать текущий LLM Scout как verified intelligence;
- обновить README, state и product docs после утверждения R18;
- сохранить `docs/decisions.md` как immutable history и добавить новое superseding decision.

## 19. Документационное решение

Decision #069 фиксирует:

**Full Product Architecture, GB_EW_SC Market Profile and Three-Locale Scope**

Он supersedes только продуктовые последствия:

- D007 — seven locales;
- D008 — live predictive Scout;
- D009 — LineHunter / «Hunt the edge. Beat the line.»

Он сохраняет:

- D005 Decision-first architecture;
- инженерные и security-инварианты, не конфликтующие с R18;
- immutable decision history.

Decision #069 синхронизирует:

- `PROJECT_STATE.md`;
- `README.md`;
- `docs/product.md`;
- `PRODUCT_VISION_GAP.md`;
- `docs/README.md`;
- релевантные части `docs/strategy.md`.

## 20. Acceptance criteria полного продукта

1. Все канонические разделы и рабочие states спроектированы для Web, iOS и Android.
2. Ни один обязательный экран не помечен `coming later`; blocked state не заменяет working state.
3. Web/mobile используют одну entity model и metric service.
4. Primary navigation содержит Home, Research, Journal, Insights, Risk.
5. `+ Add` доступен глобально и подчиняется server policy; в Research действие Bet disabled без prefill.
6. На одном экране не смешиваются `en`, `uk` и `ru`.
7. UI, validation, errors, email, push, AI, reports, paywall и help локализованы на всех трёх языках.
8. Missing translation key блокирует production build.
9. Смена locale не меняет market, цену, legal profile или feature access.
10. `GB_EW_SC` eligibility проверяется сервером через UserMarketEligibility/EligibilityCheck; `storefront_country=GB` не включает Northern Ireland автоматически.
11. Unsupported/travel state сохраняет доступ к history, Review, export, delete, billing и support.
12. Все числа рассчитывает versioned deterministic service.
13. Metric показывает formula/method, period, denominator, `N`, coverage и freshness.
14. Нет данных и ноль — разные состояния.
15. Insufficient sample не показывает уверенный score.
16. Fixture start и Decision lock контролируются server time.
17. Late entry маркируется retrospective и исключается из pre-event calibration.
18. Изменение locked Decision создаёт revision/audit event, а не silent overwrite.
19. Decision может завершиться Pass или Paper без Bet.
20. Research не имеет прямого CTA к Bet.
21. Bet поддерживает ordered structured legs.
22. Partial cashout учитывается execution ledger и оставляет Bet open при `remaining_stake_basis > 0`.
23. Placement, event settlement, cashout, refund, void, free bet и correction соответствуют ledger раздела 13.1; terminal Execution создаёт единый Resolution без двойного LedgerEntry, deposits/withdrawals исключены из P/L, а open Bet не получает realized P/L.
24. CSV имеет mapping, validation, duplicate review, idempotency, rollback и error report.
25. OCR требует field-level review и явное подтверждение.
26. Started/finished fixture не показывается upcoming.
27. Stale/conflicting evidence блокирует Research output.
28. Market Lab не ранжирует «best/top opportunities» и не показывает recommended stake.
29. Нет bookmaker promo, affiliate link, copy-bet и social picks.
30. AI отказывается от picks и stake sizing.
31. AI не может создать Bet, изменить limits или снять cooldown/stop.
32. AI показывает использованные data classes, evidence и freshness.
33. AI consent, memory и history управляются раздельно.
34. Ужесточение limit применяется сразу, ослабление — через `LIMIT_RELAX_DELAY=24h` и не раньше завершения active restriction.
35. Cooldown/Stop не блокирует factual Add Bet, import/correction/settlement, историю, Review, export, delete, cancellation и help.
36. Paywall получает точные price/quota values из versioned config; до их утверждения дизайн использует только именованные tokens.
37. Cancel/downgrade не удаляет пользовательские записи.
38. Export/delete/responsible-use не paywalled.
39. Privacy View работает на всех денежных поверхностях и exports.
40. Marketing copy не обещает profit, winning или bankroll growth.
41. Полный цикл Decision → Risk Check → Result → Review проходит на всех платформах.
42. Formula regression tests дают одинаковый результат в UI, export, reports и AI context.
43. Market-policy tests доказывают, что клиент и locale не могут повысить permissions.
44. Accessibility: keyboard, screen reader, focus, contrast, dynamic type и reduced motion проверены.
45. Все состояния из раздела 15 имеют утверждённый UX, copy и telemetry.
46. MarketProfile не хранит пользовательские eligibility evidence или travel state.
47. Ledger regression tests проверяют cash balance и exposure после каждого типа execution.
48. Tools с Kelly/hedge/arbitrage/middling используют только user inputs и не выдают allocation, stake или Decision/Bet CTA.
49. Review, Simulations, Methodology, Limits, Assistant и Market eligibility имеют одну каноническую поверхность.
50. English legal master и `uk/ru` translations разделяют один document id/version; consent фиксирует locale и timestamp.
51. Все flows раздела 16 представлены для working, blocked, error и recovery states.
52. Claude Design не придумывает prices, quotas, formulas, RiskPolicy или market permissions.
53. Decision `Track external action` содержит только user-entered Intended Exposure; сервер проверяет RiskScenario до lock, а Research/Tools/AI не предлагают и не prefill сумму.
54. После внешнего действия linked Bet показывает intended vs actual; несоответствие является execution deviation, но Bet не создаётся автоматически.
55. В working pre-event product отсутствует `model_probability_snapshot`; системный win forecast не показывается ни в Research, ни в Tools, ни в Assistant.
56. `user_probability_snapshot` и `market_implied_probability_snapshot` имеют разные labels, provenance и consumers; personal Calibration/Brier использует только user snapshot.
57. Home/Performance P/L включает только resolved Bets по `Resolution.resolved_at`; для open Bets отдельно показываются net cash flow и open cash at risk.
58. `RISK_GB_EW_SC_V1` реализует warning `80–100%`, hard breach `>100%`, 24h limit-relax delay и точные Cooldown/Stop recovery rules без client-side обхода.
59. Market tests проверяют mapping `GB_EW_SC → storefront_country=GB + England/Wales/Scotland` и серверный `unsupported` для Northern Ireland.

## 21. Handoff для Claude Design

### 21.1 Роль документа

Использовать R18 как **единственный источник продуктовой структуры**. Старые Product Bible, Product Gap, LineHunter и Scout-документы можно читать только как историю и evidence текущей реализации.

Claude Design не должен переопределять:

- пять разделов;
- entity model;
- формулы;
- market/locale separation;
- AI boundaries;
- risk/cooldown/stop behavior;
- запрещённые механики;
- data ownership;
- acceptance criteria.

Claude Design может и должен улучшить:

- visual direction;
- composition и hierarchy;
- component system;
- interaction patterns;
- responsive behavior;
- accessibility;
- motion;
- density;
- empty/error/blocked-state presentation;
- локализованный UX-copy;
- понятность сложной аналитики.

### 21.2 Обязательный дизайн-результат

Все перечисленные экраны проектируются в рабочем виде для Web, iPhone и Android сейчас. `Web-first` не означает mobile-later; blocked/error состояния дополняют, а не заменяют working layouts.

1. Полный sitemap публичной и авторизованной частей.
2. Web, iPhone и Android navigation model.
3. User-flow diagrams из раздела 16.
4. Low-fidelity wireframes всех экранов.
5. High-fidelity responsive layouts.
6. Component inventory и variants.
7. State matrix для каждого component/screen.
8. Все состояния раздела 15.
9. `en / uk / ru` stress test: длинные строки, числа, даты, plural forms.
10. Light/dark и Privacy View behavior, если dark theme сохраняется.
11. Accessibility annotations.
12. Prototype полного Decision cycle.
13. Prototype Risk breach, cooldown и stop.
14. Prototype stale/insufficient/AI refusal.
15. Billing, export, deletion и unsupported-market flows.
16. UX-copy sheet с tone rules и запрещёнными формулировками.
17. Design tokens и component mapping для текущего Next.js/Expo стека.
18. Список только настоящих unresolved implementation questions — без изменения scope.
19. Ledger-state diagram для placement, partial/full cashout, event settlement, refund, void, free bet, correction и единого Resolution.
20. Canonical-route map для дублирующихся contextual entry points.

### 21.3 Полный screen inventory

**Public**

- Landing;
- How it works;
- Methodology;
- Responsible use;
- Pricing;
- Security & Privacy;
- Help;
- Status;
- Legal;
- Market availability;
- Login/signup/recovery.

**Onboarding**

- Locale;
- `GB_EW_SC`/18+ eligibility;
- Security;
- Privacy/AI consent;
- Bankroll;
- Risk baseline;
- Data entry choice;
- First Decision/Bet;
- First Review;
- completion.

**App**

- Home;
- Research Calendar;
- Event Workspace;
- Saved Research;
- Watchlist;
- Market Lab;
- Methodology/Sources;
- Journal Decisions;
- Decision detail/edit/lock/revision;
- Journal Bets;
- Bet detail/executions/resolution/correction;
- Add chooser;
- Manual capture;
- OCR review;
- CSV mapping/validation/duplicate/result;
- Resolution Queue;
- Audit History;
- Performance;
- Price/CLV;
- Expected vs Actual;
- Calibration;
- Review Inbox;
- Review detail;
- Reports;
- Bankroll list/detail;
- Transactions;
- Exposure;
- Limits;
- Cooldown;
- Stop Mode;
- Simulations;
- Tools catalog/calculator;
- Assistant;
- Search;
- Notifications;
- Settings;
- Trust Center;
- Paywall/billing;
- Export/delete.

### 21.4 Copy-paste brief

> Redesign BetTracker from the R18 specification as one complete product, not a phased roadmap. Produce the full working responsive Web, iPhone and Android information architecture, flows, components and states now; do not interpret Web-first as mobile-later, and do not use a blocked state instead of a working design. Cover Home, Research, Journal, Insights and Risk, plus global Add, Review, Tools, Assistant, Privacy View and Settings. Support `en`, `uk` and `ru` without tying locale to market access. Treat internal `GB_EW_SC` as the first MarketProfile, map it to `storefront_country=GB` and England/Wales/Scotland only, and keep per-user access in UserMarketEligibility; Northern Ireland is unsupported. In Research, Bet is disabled in Add and receives no fixture/odds/probability prefill. Do not create a system `model_probability_snapshot`: separate the user's optional probability from a verified market-implied descriptive baseline, and use only the user snapshot for personal Calibration/Brier. A `Track external action` Decision contains user-entered Intended Exposure and a server RiskScenario check; never suggest or prefill the amount, and show intended vs actual only after a factual Bet is linked in Journal. Follow the R18 cash ledger: every terminal path uses Execution → Resolution with `resolved_at` and no duplicate LedgerEntry; realized P/L exists only for resolved Bets, while open Bets show net cash flow and open cash at risk. Apply `RISK_GB_EW_SC_V1` exactly, including warning/hard thresholds, 24h limit relaxation and Cooldown/Stop recovery; factual Journal records remain available. Do not add picks, ranked betting opportunities, bookmaker links, recommended stakes, profit promises, loss-recovery mechanics or social copy-betting. Kelly/hedge/arbitrage/middling tools use user inputs only and never output allocation or action CTA. AI explains verified/prepared data but never invents sports data, calculates metrics, places bets or changes limits. Design every empty, loading, stale, insufficient, blocked, risk, subscription, privacy and error state listed in R18. Do not invent prices or quotas; use the named config tokens. Preserve current implementation as technical evidence; you may refine the visual language, hierarchy and interaction system. Return sitemap, flows, screen inventory, wireframes, high-fidelity responsive designs, component variants, accessibility annotations, three-locale stress tests, ledger/canonical-route maps and a prototype of the complete Decision → Risk Check → Result → Review loop.

## 22. Источники и ограничения

### 22.1 Внутренние источники

- R17 — «Аналоги по каждому разделу продукта», 98 страниц.
- `PROBLEMS_all_locales.md`.
- текущая `main`-реализация `xadddd88/bettracker-v1`.
- `PROJECT_STATE.md`, `README.md`, `PRODUCT_VISION_GAP.md`.
- `docs/product.md`, `docs/decisions.md`.
- текущие routes/components для Dashboard, Bets, Decisions, Analytics, Bankroll, Coach, Scout, AI и Settings.

### 22.2 Первичные внешние источники

- UK Gambling Commission — What is gambling software:
  https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/what-is-gambling-software
- ASA ruling — Paul Coleman:
  https://www.asa.org.uk/rulings/paul-coleman-a21-1100727-paul-coleman.html
- CAP Code Section 16:
  https://www.asa.org.uk/type/non_broadcast/code_section/16.html
- ICO — territorial scope of UK GDPR:
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/who-does-the-uk-gdpr-apply-to/
- GOV.UK — VAT rules for digital services to private consumers:
  https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers
- Apple — App Store availability by country or region:
  https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-for-your-app-on-the-app-store/
- Google Play — distribute app releases to specific countries:
  https://support.google.com/googleplay/android-developer/answer/7550024?hl=en
- CJEU C-585/08 and C-144/09 — indicators of directing activity to a Member State:
  https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:62008CJ0585

### 22.3 Ограничение

R18 — продуктовая стратегия и спецификация, а не юридическое, налоговое или лицензионное заключение. Перед регистрацией OpCo, монетизацией, публичными claims и включением MarketProfile требуется письменная проверка профильных консультантов по фактической реализации.

## 23. Definition of Done для R18

Founder подтвердил:

- позиционирование;
- пять разделов;
- полный single-scope подход без продуктовых этапов;
- `GB_EW_SC` как первый MarketProfile с `storefront_country=GB`;
- `en / uk / ru`;
- Scout → Research/Market Lab;
- Coach → Review;
- Risk/stop policy;
- AI boundaries;
- запретные механики;
- handoff для Claude Design.

R18 является источником product truth по Decision #069. Реализация продолжается безопасными проверяемыми PR, но они не меняют полноту утверждённого продуктового scope.

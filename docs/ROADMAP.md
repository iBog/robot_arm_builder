# Roadmap / Планы развития

Планы на будущие версии Robo-Arm Builder. Пункты не привязаны к конкретным
номерам версий — порядок примерно отражает приоритет. Сделанное помечено ✅
с версией (Unreleased — в рабочей ветке, ещё не выпущено).

## 1. Двойник: железная рука, внешнее управление, LLM

> ✅ Основа в Unreleased: вкладка «Двойник» — WebSocket к прошивке ESP32 или к
> хабу, USB через Web Serial, JSON-протокол реальной руки (`move_all`,
> `set_joint`, `gripper`, `home`, `emergency_stop`, `state`) плюс запросы к
> странице (`get_state`, `get_arm`, `set_arm`, `ik`); поза уходит в каналы при
> изменении, положение руки применяется к модели. `tools/twin-mcp.mjs` — хаб,
> мост к руке и MCP-сервер без зависимостей, `.mcp.json` регистрирует его для
> Claude Code: LLM-агент собирает руку и двигает её.

Дальше:

- Прошивка ESP32-S3 (соседний проект Robo-Arm): приём `move_all`/`gripper`/
  `home`, периодический `state` с углами, хоуминг и лимиты — тогда двойник
  заработает вживую, а не только с хабом.
- Соответствие осей: сейчас J1…Jn — позные параметры цепочки по порядку;
  нужна явная привязка «сустав 3D → ось руки» с сохранением в ссылке, чтобы
  3D-рука могла отличаться от железной (лишнее звено, другой порядок).
- Второй экземпляр руки в сцене — полупрозрачный «призрак» по `state`
  железа: видно рассинхрон и отставание, а не только числа в таблице.
- Ограничение скорости и ускорения при отправке (`set_speed`, интерполяция
  на стороне страницы), чтобы резкое движение слайдера не било по моторам.
- MCP: инструменты уровнем выше — «взять предмет в точке», «повторить
  сценарий», «проверить достижимость»; ресурсы с описанием типов и `schema.json`,
  чтобы агенту не приходилось угадывать формат `set_arm`.
- Управление голосом/текстом прямо на странице: поле «скажи руке, что делать»
  → LLM через MCP или прямой API-ключ пользователя.

## 2. Пошаговые сценарии движения робота

> ✅ Частично в v1.7.0: в режиме заданий ведётся запись действий с отменой
> последнего и повтором (однократным или по кругу) — это основа сценариев.
> Осталось: именованные шаги с длительностями, вкладка вне режима заданий,
> сценарий в ссылке (`?m=`). Экспорт в прошивку теперь идёт через двойник
> (`move_all` по шагам), отдельный G-code-подобный формат не нужен.

Редактор последовательностей движений собранной руки.

- Сценарий — список шагов; каждый шаг задаёт целевые значения параметров
  компонентов (углы, выдвижение, схват) и длительность перехода.
- Запись шага «с натуры»: выставить позу слайдерами → «Добавить шаг».
- Плавное воспроизведение по шагам (интерполяция между позами), пауза, стоп,
  зацикливание; текущий шаг подсвечивается; при подключённом двойнике шаги
  уходят в железную руку.
- Сценарий сериализуется в JSON рядом с конфигурацией руки и попадает в
  share-ссылку (`?c=` + `?m=`), чтобы делиться рукой вместе с её программой.

## 3. Закупка: каталог, корзина, ссылки

> ✅ В Unreleased: каталог деталей вынесен в файл данных
> `src/js/300-parts-catalog.js` (названия, цены, поле `url`, замены, состав) с
> самопроверкой при старте; под таблицей BOM — корзина: деталь, секция или всё,
> количество, текст для заказа, хранение в браузере.

- Заполнить `url` у деталей ссылками на товары (AliExpress), добавить дату
  актуальности цены.
- Экспорт корзины в CSV и ссылка на корзину (`?cart=`), чтобы делиться списком.
- Несколько поставщиков на деталь и выбор валюты / курса.

## 4. Режим обучения (туториал)

> ✅ Базовый вариант реализован в v1.4.0: кнопка «?», диалог с двумя
> вопросами, рассказ «что это такое», пошаговая сборка первой руки
> (yaw → link → pitch → link → roll → gripper) с подсветкой кнопок и
> финальным поздравлением.

Идеи для развития: шаги про слайдеры, удаление, отмену и вкладки JSON/BOM;
финал со share-ссылкой; прогресс в `localStorage`, повторный запуск.

## 5. Структура проекта

> ✅ В Unreleased: проект разнесён по файлам — `index.html` (шапка, разметка,
> загрузчик) + `src/css/*.css` + `src/js/NNN-*.js` (обычные скрипты с общей
> областью видимости, работают с `file://`); `node tools/bundle.mjs` склеивает
> всё в один `dist/index.html` для деплоя.

- Постепенный переход к настоящим ES-модулям через объект состояния вместо
  общих `let` (требует http-сервера или сборки для `file://` — решить, нужно
  ли вообще).
- Автосборка `dist/` в CI и публикация на GitHub Pages.

---

# Roadmap (English)

Plans for future Robo-Arm Builder versions. Items are not tied to specific
version numbers; the order roughly reflects priority. Done items are marked ✅
with the version (Unreleased — on the working branch, not released yet).

## 1. Digital twin: real arm, external control, LLM

> ✅ Foundation in Unreleased: the Twin tab — WebSocket to the ESP32 firmware or
> to the hub, USB via Web Serial, the real arm's JSON protocol (`move_all`,
> `set_joint`, `gripper`, `home`, `emergency_stop`, `state`) plus page requests
> (`get_state`, `get_arm`, `set_arm`, `ik`); pose changes go out to the
> channels, the arm's state is applied to the model. `tools/twin-mcp.mjs` is a
> dependency-free hub, arm bridge and MCP server; `.mcp.json` registers it for
> Claude Code, so an LLM agent builds and drives the arm.

Next:

- ESP32-S3 firmware (the neighbouring Robo-Arm project): accept `move_all` /
  `gripper` / `home`, report `state` periodically, homing and limits — then the
  twin works with hardware, not only with the hub.
- Axis mapping: today J1…Jn are the chain's pose parameters in order; an
  explicit "3D joint → arm axis" mapping saved in the link would let the 3D arm
  differ from the real one (an extra link, another order).
- A second, translucent "ghost" arm in the scene driven by the hardware
  `state`: lag and mismatch become visible, not just numbers in a table.
- Speed/acceleration limiting on the way out (`set_speed`, page-side
  interpolation) so a fast slider drag does not hammer the motors.
- MCP: higher-level tools — "pick the object at a point", "replay a scenario",
  "check reachability"; resources exposing the type registry and `schema.json`
  so the agent never has to guess the `set_arm` format.
- Voice/text control on the page itself: "tell the arm what to do" → an LLM via
  MCP or the user's own API key.

## 2. Step-by-step robot motion scenarios

> ✅ Partly in v1.7.0: challenge mode records every action with undo of the
> last one and replay (once or looped) — the foundation of scenarios. Still to
> do: named steps with durations, a tab outside challenge mode, the scenario in
> the link (`?m=`). Export to firmware now goes through the twin (`move_all`
> per step), so a separate G-code-like format is no longer needed.

A motion-sequence editor for the assembled arm.

- A scenario is a list of steps; each step holds target parameter values
  (angles, extension, gripper) and a transition duration.
- Record a step from the current pose: set it with sliders → "Add step".
- Smooth playback with interpolation between poses, pause, stop, looping; the
  current step is highlighted; with a twin connected the steps drive the real arm.
- The scenario serializes to JSON next to the arm config and joins the share
  link (`?c=` + `?m=`) so an arm can be shared with its program.

## 3. Purchasing: catalog, cart, links

> ✅ In Unreleased: the parts catalog lives in a data file
> `src/js/300-parts-catalog.js` (names, prices, a `url` field, alternatives,
> per-component needs) with a start-up self-check; below the BOM table there is
> a cart: a part, a section or everything, quantities, an order text, kept in
> the browser.

- Fill `url` with product links (AliExpress), add a price date.
- CSV export of the cart and a cart link (`?cart=`) to share the list.
- Several suppliers per part, currency / exchange rate choice.

## 4. Tutorial mode

> ✅ Base version in v1.4.0: the "?" button, a two-question dialog, the "what is
> this" story, a step-by-step build of the first arm (yaw → link → pitch → link
> → roll → gripper) with button highlights and a final congratulation.

Ideas: steps about sliders, deletion, undo and the JSON/BOM tabs; a finale
with a share link; progress in `localStorage`, restartable.

## 5. Project structure

> ✅ In Unreleased: the project is split into files — `index.html` (head,
> markup, loader) + `src/css/*.css` + `src/js/NNN-*.js` (plain scripts sharing
> one scope, working from `file://`); `node tools/bundle.mjs` inlines everything
> into a single `dist/index.html` for deployment.

- A gradual move to real ES modules via a state object instead of shared
  `let`s (needs an http server or a build for `file://` — decide whether it is
  worth it at all).
- Auto-building `dist/` in CI and publishing to GitHub Pages.

---

## Сделано вне плана / Done outside the plan

- v1.7.0: режим заданий с физикой, обратная кинематика (мишень на конце руки),
  ограничение пола, короткие ссылки с размерами, тесты и отладочный API.
- v1.7.0: challenge mode with physics, inverse kinematics (target at the arm
  tip), floor limit, short links that keep the sizes, tests and a debug API.

## Идеи дальше / Next ideas

- Расчёт нагрузки: момент на суставах и грузоподъёмность на вылете по длинам и
  моторам из BOM. / Load estimate: joint torques and payload at reach from the
  lengths and the BOM motors.
- Область достижимости облаком точек. / Reachability cloud.
- Экспорт STL/GLTF, PWA. / STL/GLTF export, PWA.

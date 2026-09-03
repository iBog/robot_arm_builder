# Двойник: WebSocket, Web Serial, MCP

Вкладка **«Двойник»** связывает 3D-руку с внешним миром. Страница — всегда клиент: она
подключается к железной руке или к программе и обменивается JSON-сообщениями.
Каналов может быть несколько одновременно (например, хаб для агента + USB к руке).

```
 ┌──────────────┐  WebSocket / Web Serial  ┌──────────────────┐
 │ index.html   │ ───────────────────────► │ ESP32-S3 (рука)  │
 │ 3D-рука      │ ◄─────────────────────── │ прошивка         │
 └──────┬───────┘        state             └──────────────────┘
        │ WebSocket
        ▼
 ┌──────────────┐  stdio (MCP)   ┌────────────────────┐
 │ twin-mcp.mjs │ ◄────────────► │ Claude Code / LLM  │
 │ хаб + мост   │ ──► --arm ws://рука                  │
 └──────────────┘                └────────────────────┘
```

## Протокол

Одно JSON-сообщение на кадр WebSocket или на строку (Serial, `\n` в конце). Поля
кроме `type` необязательны там, где не сказано иное. Формат совпадает с §5.4 README
проекта Robo-Arm (прошивка) и дополнен запросами к странице.

| Сообщение | Кто → кому | Поля | Что происходит |
|---|---|---|---|
| `move_all` | любой → страница / рука | `angles` — массив по осям J1…Jn (`null` — не трогать), `open` — раскрытие 0…100 | страница ставит суставы (с ограничениями диапазона и пола) и рассылает новую позу остальным каналам |
| `set_joint` | любой → страница / рука | `joint` (1…n), `angle` | одна ось |
| `gripper` | любой → страница / рука | `open` 0…100 | раскрытие схвата |
| `home` | любой → страница / рука | — | оси в значения по умолчанию; страница пересылает `home` остальным каналам |
| `emergency_stop` | любой → страница / рука | — | страница выключает авто-анимацию и пересылает дальше |
| `set_speed` | любой → рука | `axis`, `percent` | страница только пересылает железу |
| `state` | рука → страница | `angles`, `open` (или `gripper`), `moving`, `homing` | применяется к 3D, если включён приём и страница не двигала руку последние 400 мс |
| `get_state` | любой → страница | `id` | ответ `state` с `source:"3d"`, тем же `id`, `angles`, `open`, `tip` [x,y,z], `axes` (см. ниже) |
| `get_arm` | любой → страница | `id` | ответ `arm` со списком `components` (формат вкладки JSON / `schema.json`) |
| `set_arm` | любой → страница | `id`, `components` | перестраивает руку (с отменой через «Отмена»), ответ `arm` |
| `ik` | любой → страница | `id`, `target` [x,y,z] | обратная кинематика, ответ `ik_result` (`reached`, `distance`, `tip`) |
| `error` | страница → отправитель | `id`, `message` | неизвестный тип, битые данные |

**Оси J1…Jn** — позные параметры цепочки по порядку от основания: углы суставов
(`yaw`, `pitch`, `roll`, две оси `spherical`), выдвижение телескопа `ext`, положение
каретки рельса `pos`. Не входят: длины (габариты), раскрытие схвата (`gripper`),
обороты инструмента, присос. `get_state` описывает каждую ось:

```json
{ "type": "state", "source": "3d", "id": 7,
  "angles": [30, 45, -20], "open": 10, "tip": [1.2, 1.9, 0.6],
  "axes": [
    { "joint": 1, "index": 0, "type": "yaw",   "key": "angle", "label": "Angle, °", "min": -180, "max": 180, "value": 30 },
    { "joint": 2, "index": 1, "type": "pitch", "key": "angle", "label": "Angle, °", "min": -120, "max": 120, "value": 45 },
    { "joint": 3, "index": 3, "type": "roll",  "key": "angle", "label": "Angle, °", "min": -180, "max": 180, "value": -20 }
  ],
  "moving": false, "homing": false }
```

Единицы: градусы для суставов, единицы сцены (≈ метры) для телескопа, рельса и `tip`;
`y` — вверх, основание в начале координат.

**Исходящие**: при любом изменении позы (слайдер, IK, анимация, входящая команда)
страница шлёт `move_all` (только если изменились оси) и `gripper` (только если
изменилось раскрытие) во все каналы, не чаще раза в 50 мс. Новому каналу поза уходит
сразу после подключения. Принятое от руки положение обратно не отправляется.

Своё `state` страница помечает `source:"3d"` — по нему хаб и другие страницы отличают
ответ страницы от состояния железа.

## WebSocket

### Подключение страницы

1. Вкладка «Двойник» → адрес (`ws://192.168.4.1/ws` для точки доступа ESP32,
   `ws://127.0.0.1:8765` для хаба) → «Подключить». Адрес запоминается в браузере.
2. Пока кнопка нажата, обрыв переподключается сам раз в 3 с — можно перезагружать
   контроллер, не трогая страницу.
3. Галочки: «отправлять движения» (3D → рука) и «принимать положение руки» (рука → 3D).
   Обе включены — двойник в обе стороны; отставание руки видно в таблице осей.

Страница, открытая с `file://`, соединяется с `ws://` без ограничений. Со страницы
на `https://` браузер разрешает только `wss://` — для локальной сети либо открывайте
`index.html` с диска, либо ставьте TLS на контроллер/хаб.

### Прошивка ESP32-S3 (пример)

Arduino, библиотеки `ESPAsyncWebServer` + `AsyncTCP` + `ArduinoJson 7`. Приём команд и
периодический `state`; движение осей — из модуля `motors` проекта Robo-Arm.

```cpp
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

const int AXES = 6;
float target[AXES], current[AXES];
float gripOpen = 100;
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

void sendState(AsyncWebSocketClient* to = nullptr) {
  JsonDocument doc;
  doc["type"] = "state";
  JsonArray a = doc["angles"].to<JsonArray>();
  for (int i = 0; i < AXES; i++) a.add(current[i]);
  doc["open"] = gripOpen;
  doc["moving"] = motorsMoving();   // из модуля motors
  doc["homing"] = false;
  String s; serializeJson(doc, s);
  if (to) to->text(s); else ws.textAll(s);
}

void onWs(AsyncWebSocket*, AsyncWebSocketClient* client, AwsEventType type, void*, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) { sendState(client); return; }
  if (type != WS_EVT_DATA) return;
  JsonDocument doc;
  if (deserializeJson(doc, data, len)) return;
  const char* t = doc["type"] | "";
  if (!strcmp(t, "move_all")) {
    JsonArray a = doc["angles"];
    for (int i = 0; i < AXES && i < (int)a.size(); i++) if (!a[i].isNull()) target[i] = limitAngle(i, a[i]);
    if (!doc["open"].isNull()) gripOpen = doc["open"];
  } else if (!strcmp(t, "set_joint")) {
    int j = doc["joint"]; if (j >= 1 && j <= AXES) target[j - 1] = limitAngle(j - 1, doc["angle"]);
  } else if (!strcmp(t, "gripper"))        gripOpen = doc["open"];
  else if (!strcmp(t, "home"))             homeAll();
  else if (!strcmp(t, "emergency_stop"))   stopAll();
  else if (!strcmp(t, "get_state"))        sendState(client);
}

void setup() {
  WiFi.softAP("robo-arm");            // 192.168.4.1
  ws.onEvent(onWs);
  server.addHandler(&ws);
  server.begin();
}

void loop() {
  moveTowards(target, gripOpen);      // профиль разгона — FastAccelStepper
  static uint32_t last = 0;
  if (millis() - last > 100) { last = millis(); sendState(); }  // 10 Гц
}
```

Порядок осей J1…J6 в прошивке зафиксирован; на странице соберите руку с теми же
шестью позными параметрами по порядку (турель → наклон → наклон → наклон → наклон →
вращение) плюс схват — таблица во вкладке покажет соответствие.

### Своя программа как сервер (Python)

Страница подключается к вам; вы спрашиваете состояние и двигаете руку.

```python
# pip install websockets
import asyncio, json, websockets

async def handler(ws):
    await ws.send(json.dumps({"type": "get_state", "id": 1}))
    async for raw in ws:
        msg = json.loads(raw)
        if msg.get("type") == "state" and msg.get("id") == 1:
            print("оси:", [a["type"] for a in msg["axes"]], msg["angles"])
            angles = [None] * len(msg["angles"])
            angles[0] = 45                                   # J1 → 45°
            await ws.send(json.dumps({"type": "move_all", "angles": angles, "open": 20}))
            await ws.send(json.dumps({"type": "ik", "id": 2, "target": [1.2, 1.0, 0.4]}))
        elif msg.get("type") == "ik_result":
            print("дотянулись" if msg["reached"] else f"не хватило {msg['distance']}", msg["tip"])
        elif msg.get("type") == "move_all":
            print("3D-рука двинулась:", msg["angles"])       # слайдер, IK, анимация

async def main():
    async with websockets.serve(handler, "127.0.0.1", 8765):
        await asyncio.Future()

asyncio.run(main())
```

Во вкладке укажите `ws://127.0.0.1:8765` и нажмите «Подключить».

### Своя программа как клиент хаба (Node)

Если хаб уже запущен (`node tools/twin-mcp.mjs`), к нему можно подключиться любым
клиентом — хаб пересылает сообщения между всеми участниками, ответы страницы приходят
с вашим `id`:

```js
// node ≥ 22: WebSocket встроен
const ws = new WebSocket('ws://127.0.0.1:8765');
ws.onopen = () => ws.send(JSON.stringify({ type: 'get_arm', id: 'a1' }));
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id === 'a1') { console.log(m.components); ws.close(); }
};
```

## Web Serial (USB)

Chrome и Edge (и другие на Chromium); Firefox и Safari API не имеют — кнопка «USB»
в них скрыта. Работает и с `file://`.

1. Подключите контроллер кабелем; на Windows нужен драйвер моста (CH340 / CP210x),
   на Linux — доступ к порту (`sudo usermod -aG dialout $USER`, перелогиниться).
2. Скорость (по умолчанию 115200) → «USB (Web Serial)» → в диалоге браузера выберите
   порт. Пока порт открыт, монитор Arduino IDE открыть нельзя, и наоборот.
3. Обмен — те же JSON, по одному на строку, `\n` в конце. «Закрыть USB» освобождает порт.

Прошивка (тот же разбор команд, что и для WebSocket, транспорт — `Serial`):

```cpp
void setup() { Serial.begin(115200); }

void loop() {
  static String line;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { handleCommand(line); line = ""; }     // тот же разбор, что в onWs
    else if (c != '\r') line += c;
  }
  moveTowards(target, gripOpen);
  static uint32_t last = 0;
  if (millis() - last > 100) {
    last = millis();
    JsonDocument doc;
    doc["type"] = "state";
    JsonArray a = doc["angles"].to<JsonArray>();
    for (int i = 0; i < AXES; i++) a.add(current[i]);
    doc["open"] = gripOpen; doc["moving"] = motorsMoving();
    serializeJson(doc, Serial); Serial.println();
  }
}
```

Отладочный вывод прошивки в `Serial` страница не ломает: строки, которые не
разбираются как JSON, попадают в журнал вкладки с пометкой `?` и игнорируются.

## MCP: управление агентом

`tools/twin-mcp.mjs` — MCP-сервер по stdio без зависимостей и одновременно
WebSocket-хаб. Инструменты: каждый шлёт команду странице и возвращает её ответ;
после движения — свежее состояние.

| Инструмент | Аргументы | Возвращает |
|---|---|---|
| `get_state` | — | `state`: оси, значения, раскрытие, `tip` |
| `move_all` | `angles` (массив, `null` — не трогать), `open` | `state` после движения |
| `set_joint` | `joint`, `angle` | `state` |
| `gripper` | `open` 0…100 | `state` |
| `home` | — | `state` |
| `ik` | `x`, `y`, `z` | `ik_result` + `state` |
| `get_arm` | — | `arm`: `components` |
| `set_arm` | `components` (формат `schema.json`) | `arm` |
| `stop` | — | `state`; в железо уходит `emergency_stop` |

### Claude Code

`.mcp.json` в корне репозитория уже регистрирует сервер:

```json
{ "mcpServers": { "robo-arm-twin": { "command": "node", "args": ["tools/twin-mcp.mjs"] } } }
```

1. Откройте Claude Code в каталоге проекта, подтвердите проектный MCP-сервер;
   `/mcp` покажет `robo-arm-twin` и его инструменты. Хаб слушает `ws://127.0.0.1:8765`.
2. Откройте `index.html` → «Двойник» → адрес `ws://127.0.0.1:8765` → «Подключить».
   Порядок не важен: страница переподключается сама.
3. Попросите агента, например: «собери 4-осевую руку со схватом и дотянись до точки
   (1.2, 1.0, 0.4)», «открой схват на 30 %», «верни руку в исходное». Агент вызовет
   `set_arm`, `ik`, `gripper`, `home` и увидит результат в ответах.

Чтобы движения доходили до железной руки, добавьте мост: в `.mcp.json` →
`"args": ["tools/twin-mcp.mjs", "--arm", "ws://192.168.4.1/ws"]` — хаб сам держит
соединение с прошивкой, страница подключается только к хабу.

### Другие MCP-клиенты

Любой клиент со stdio-транспортом; путь к скрипту — абсолютный, если клиент запускает
сервер не из каталога проекта. Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "robo-arm-twin": {
    "command": "node",
    "args": ["E:/Work/gemini/Robo-Arm-Builder/tools/twin-mcp.mjs", "--port", "8765"] } } }
```

### Без агента: хаб и мост вручную

```bash
node tools/twin-mcp.mjs --arm ws://192.168.4.1/ws
```

В терминале хаб не ждёт MCP: набранные строки JSON уходят страницам, а всё, что
приходит от страниц и руки, печатается. Удобно для отладки прошивки:
`{"type":"get_state","id":1}`, `{"type":"move_all","angles":[45,0,0,0]}`.

## Отладка

- Журнал вкладки: `→` ушло, `←` пришло, `?` не JSON, `!` ошибка канала, `•` подключения.
- Страница не подключается к хабу: хаб запущен? порт занят (`--port 8766` и тот же
  адрес во вкладке)? страница на `https://` не откроет `ws://`.
- Рука дёргается между двумя значениями: и «отправлять», и «принимать» включены, а
  прошивка сообщает не то положение, которое ей задали (люфт, квантование шага).
  Выключите приём или округляйте `state` в прошивке до шага двигателя.
- `node tests/twin.test.mjs` проверяет хаб и MCP без браузера, сценарий
  `node tests/run.mjs twin` — логику страницы; с `--http` браузер показывает
  настоящий текст ошибок вместо «Script error».

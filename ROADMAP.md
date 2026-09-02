# Roadmap / Планы развития

Планы на будущие версии Robo-Arm Builder. Пункты не привязаны к конкретным
номерам версий — порядок примерно отражает приоритет.

## 1. Пошаговые сценарии движения робота

> ✅ Частично в v1.7.0: в режиме заданий ведётся запись действий с отменой
> последнего и повтором (однократным или по кругу) — это основа сценариев.
> Осталось: именованные шаги с длительностями, вкладка вне режима заданий,
> сценарий в ссылке (`?m=`), экспорт в G-code-подобный формат.

Редактор последовательностей движений собранной руки.

- Сценарий — список шагов; каждый шаг задаёт целевые значения параметров
  компонентов (углы, выдвижение, схват) и длительность перехода.
- Запись шага «с натуры»: выставить позу слайдерами → «Добавить шаг».
- Плавное воспроизведение по шагам (интерполяция между позами), пауза, стоп,
  зацикливание; текущий шаг подсвечивается.
- Сценарий сериализуется в JSON рядом с конфигурацией руки и попадает в
  share-ссылку (`?config=` + `?motion=`), чтобы делиться рукой вместе с её
  программой движения.
- Дальний прицел: экспорт сценария в G-code-подобный формат для прошивки
  реального манипулятора (ESP32-S3, см. соседний проект Robo-Arm).

## 2. Режим обучения (туториал)

> ✅ Базовый вариант реализован в v1.4.0: кнопка «?», диалог с двумя
> вопросами, рассказ «что это такое», пошаговая сборка первой руки
> (yaw → link → pitch → link → roll → gripper) с подсветкой кнопок и
> финальным поздравлением. Ниже — идеи для развития.

Интерактивное пошаговое обучение работе с конструктором.

- Серия подсказок-шагов в духе существующего `#startHint`: подсветка нужной
  кнопки, короткое пояснение, ожидание действия пользователя.
- Сценарий обучения: добавление компонентов по одному (основание → суставы →
  звенья → схват), настройка параметров слайдерами, удаление лишнего
  компонента, отмена шага, переключение вкладок JSON/BOM.
- Финал: сгенерированная share-ссылка на собранную в туториале руку —
  пользователь сразу получает результат, которым можно поделиться.
- Запуск — кнопкой в шапке; прогресс шагов хранится в `localStorage`,
  туториал можно прервать и пройти заново.

---

# Roadmap (English)

Plans for future Robo-Arm Builder versions. Items are not tied to specific
version numbers; the order roughly reflects priority.

## 1. Step-by-step robot motion scenarios

> ✅ Partly in v1.7.0: challenge mode records every action with undo of the
> last one and replay (once or looped) — the foundation of scenarios. Still
> to do: named steps with durations, a tab outside challenge mode, the
> scenario in the link (`?m=`), export to a G-code-like format.

A motion-sequence editor for the assembled arm.

- A scenario is a list of steps; each step holds target parameter values
  (angles, extension, gripper) and a transition duration.
- Record a step from the current pose: set it with sliders → "Add step".
- Smooth playback with interpolation between poses, pause, stop, looping;
  the current step is highlighted.
- The scenario serializes to JSON next to the arm config and joins the share
  link (`?config=` + `?motion=`) so an arm can be shared with its program.
- Long-term: export to a G-code-like format for a real manipulator firmware
  (ESP32-S3, see the neighboring Robo-Arm project).

## 2. Tutorial mode

Interactive step-by-step onboarding.

- A series of hint steps in the spirit of the existing `#startHint`:
  highlight the right button, a short explanation, wait for the user action.
- The tutorial script: add components one by one (base → joints → links →
  gripper), tune parameters with sliders, remove an extra component, undo a
  step, switch the JSON/BOM tabs.
- Finale: a generated share link to the arm built in the tutorial — the user
  immediately gets a shareable result.
- Launched from the header; step progress lives in `localStorage`, the
  tutorial can be aborted and restarted.

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
- Экспорт STL/GLTF, PWA, Web Serial к ESP32-S3. / STL/GLTF export, PWA, Web
  Serial link to the ESP32-S3 firmware.

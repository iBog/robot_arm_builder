# Roadmap / Планы развития

Планы на будущие версии Robo-Arm Builder. Пункты не привязаны к конкретным
номерам версий — порядок примерно отражает приоритет.

## 1. Пошаговые сценарии движения робота

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

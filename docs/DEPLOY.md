# Деплой

Приложение — статика: `index.html` + `src/css/*.css` + `src/js/*.js` + картинки `scr/`.
Ни сервера приложений, ни сборки для запуска нет; для публикации есть два способа.

## Способ 1 (рекомендуется): один файл

```bash
node tools/bundle.mjs          # → dist/index.html (~270 КБ, ~90 КБ в gzip)
```

`tools/bundle.mjs` вшивает стили в `<style>` и склеивает `src/js/*.js` в один
`<script type="module">` вместе с `import` three.js — получается ровно та страница,
что работает и с `file://`. На хостинг едут:

```
index.html            ← это dist/index.html, переименованный
scr/screenshot.png    ← og:image (1600×1000), scr/screenshot-ru.png
scr/icon-180.png      ← apple-touch-icon
robots.txt, sitemap.xml  (по желанию)
```

Плюсы: один запрос вместо полусотни, кэш и заголовки настраиваются для одного файла,
исходники и служебные файлы репозитория (`tools/`, `tests/`, `.mcp.json`, `package.json`)
на сервер не попадают. `dist/` в `.gitignore` — собирайте перед каждой выкладкой.

## Способ 2: как в репозитории

Выложить `index.html`, `src/` и `scr/` как есть — без сборки. Работает на любом
статическом хостинге (GitHub Pages в том числе), но страница делает ~50 запросов, а
`Cache-Control` придётся продумать для `src/*` отдельно. Не выкладывайте `tools/`,
`tests/`, `deploy/`, `.mcp.json`, `package.json`, `schema.json` без нужды.

## nginx

Минимальный server-блок для варианта с одним файлом (TLS добавляет certbot):

```nginx
server {
    server_name robot.example.com;
    root /var/www/robot-arm-builder;
    index index.html;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    # всё приложение в одном index.html: только ревалидация, без «кэш на год».
    # no-cache ≠ no-store: ETag даёт дешёвые 304, а новая версия доезжает сразу.
    add_header Cache-Control "no-cache" always;
    # вложенных location со своим add_header не заводить: они отменяют
    # унаследованные заголовки целиком (HSTS и nosniff пропадут молча).

    gzip on;
    gzip_types text/css application/javascript image/svg+xml;   # text/html gzip'ится по умолчанию
    gzip_min_length 1024;

    location / { try_files $uri $uri/ =404; }
    listen 80;
}
```

Заменили файл — nginx перезагружать не нужно.

## GitHub Pages

Отдельная ветка `gh-pages` с `index.html` (склейка) и `scr/` (папка `docs/` в этом
репозитории занята документацией, для Pages её не используйте). `SHARE_BASE` вычисляется из адреса
страницы, поэтому кнопка «Ссылка» на Pages даст ссылки на Pages. Статическая шапка
`<head>` (`canonical`, `hreflang`, `og:url`, `og:image`) при этом по-прежнему указывает на
`https://robot.experimentalui.com/` — так копия сама объявляет первоисточник и не создаёт
дубликата в индексе. Если витриной должен стать Pages, правьте шапку и `SHARE_FALLBACK`
согласованно (см. ниже).

## Переезд на другой домен

1. `index.html` → `<head>`: `canonical`, два `hreflang`, `og:url`, `og:image`, `twitter:image`
   (краулеры JS не исполняют, поэтому адреса прописаны статически).
2. `src/js/000-consts.js` → `SHARE_FALLBACK` (адрес ссылок при открытии с `file://`).
3. `tools/schema.mjs` → `$id` схемы.
4. `robots.txt` / `sitemap.xml` на хостинге.

## Приёмка снаружи

```bash
D=robot.example.com
curl -sI https://$D/ | grep -iE 'HTTP/|cache-control|strict-transport|x-content-type'
curl -s  https://$D/ | grep -c 'src/js/'          # 0 — выложена склейка, а не исходники
curl -s -o /dev/null -w '%{http_code}\n' https://$D/package.json    # 404
curl -s -o /dev/null -w '%{http_code}\n' https://$D/tools/bundle.mjs # 404
curl -s -o /dev/null -w '%{http_code}\n' https://$D/scr/screenshot.png  # 200
```

Скриншот главной в headless Chrome с продакшена — та же команда, что и для локального
файла, только с `https://…` вместо `file://`.

## Скрипты автора

В `deploy/` (в `.gitignore`, содержит параметры доступа) лежат bash-скрипты для
`robot.experimentalui.com`: `bin/deploy.sh` (собирает `dist/index.html`, заливает во
временный каталог, сверяет sha256, бэкапит текущую версию и кладёт на место),
`bin/verify.sh` (приёмка снаружи, включая «исходники не торчат»), `bin/rollback.sh`,
`bin/cert.sh`, `bin/backup.sh`, `bin/setup-host.sh`, конфиги nginx и `site/robots.txt`,
`sitemap.xml`. Шаблон параметров — `deploy/deploy.env.example`; пароль или ключ
в репозиторий не попадают.

## Что НЕ деплоится

`tools/twin-mcp.mjs` (хаб двойника и MCP-сервер) — локальный инструмент: он запускается
на машине пользователя рядом с браузером и железной рукой, см. [TWIN.md](TWIN.md).

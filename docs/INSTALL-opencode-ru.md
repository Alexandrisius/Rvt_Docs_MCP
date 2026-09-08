# Установка MCP `revit-api-docs` в проект opencode

**Для кого:** человек без опыта + ИИ-агент без контекста.
**Что получим:** в твоём репозитории opencode появится 3 инструмента, которые отдают
справку Revit API (сигнатуры классов/методов, параметры, исключения, состав класса,
доступность по версиям Revit 2020–2027) в компактном виде, пригодном для контекста ИИ.
**Время:** 10 минут если есть готовый `.exe`, ~20 минут если собирать самому.
**Проверено:** 08.09.2026, Windows 11, opencode 1.18.29 / opencode2 v0.0.0-beta-19296, Deno 2.9.6,
релиз [`v1.0.6`](https://github.com/Alexandrisius/Rvt_Docs_MCP/releases/tag/v1.0.6)
(CI-артефакт `Rvt_Docs_MCP-windows.exe` проверен прямыми вызовами по MCP-протоколу:
`tools/list` → 3 инструмента, `search-docs` и `retrieve-doc` → корректный markdown).
**Файл лежит в репозитории:** `docs/INSTALL-opencode-ru.md`. Англоязычная версия —
в `README.md` (раздел Setup); эта инструкция подробнее и рассчитана на новичка.

---

## 0. Словарь (3 термина, дальше будет проще)

| Термин | Что это простыми словами |
|---|---|
| **MCP** | Протокол, по которому ИИ-агент подключает «внешние инструменты». Сервер MCP = программа, которая отвечает агенту на запросы. |
| **`Rvt_Docs_MCP-windows.exe`** | И есть этот сервер. Одна программа ~93 МБ. Внутри — парсер сайтов документации Revit API. Отдельно запускать её не нужно, её запускает opencode. |
| **`opencode.json`** | Файл настроек в корне репозитория. В нём мы пишем «запусти вот этот exe как MCP-сервер `revit-api-docs`». |

**Как это работает под капотом:** агент вызывает инструмент → opencode запускает exe →
exe идёт на сайты `rvtdocs.com` и `revitapidocs.com`, выкачивает нужную страницу →
превращает HTML в аккуратный markdown (только C#-синтаксис, параметры и исключения
таблицами) → возвращает агенту. **Собственных знаний и нейросетей внутри нет**, это
честный парсер. Поэтому нужен интернет.

---

## 1. Требования

| Нужно | Зачем | Как проверить |
|---|---|---|
| Windows 10/11 (или macOS/Linux — см. §10) | ОС | — |
| **opencode** | хост MCP | `opencode --version` → например `1.18.29` |
| **git** | скачать исходники (только для варианта B) | `git --version` |
| **Интернет** | exe качает документацию с сайтов при каждом вызове | — |
| **Deno 2.x** | ТОЛЬКО если собираешь exe сам (вариант B) | `deno --version` |

Если opencode не установлен:

```powershell
npm install -g opencode-ai          # основная версия (команда opencode)
npm install -g @opencode/cli        # опционально: бета V2 (команда opencode2)
```

---

## 2. Шаг 1 — раздобыть `Rvt_Docs_MCP-windows.exe`

> ⚠️ **ГЛАВНАЯ ЛОВУШКА.** Не качай exe из **оригинального** репозитория
> `kaitpw/Rvt_Docs_MCP` (раздел Releases). Последние сборки там — август 2025 года.
> 4–5 сентября 2026 сайт `rvtdocs.com` переехал на новый поисковый API «Search V2»,
> и эти старые сборки **сломаны**: `search-docs` падает с `404 Not Found`,
> `retrieve-doc` — с `Main content section not found`. Сервер при этом запускается и
> выглядит «живым», поэтому поломку не видно до первого вызова.
>
> Нужен **форк**: <https://github.com/Alexandrisius/Rvt_Docs_MCP> — он адаптирован под Search V2.

### Вариант A — скачать готовый exe (быстро, РЕКОМЕНДУЕТСЯ)

1. Открой **<https://github.com/Alexandrisius/Rvt_Docs_MCP/releases>**
2. Возьми последний релиз (**`v1.0.6`** или новее) и скачай ассет
   **`Rvt_Docs_MCP-windows.exe`** (~93 МБ).
   Для macOS: `Rvt_Docs_MCP-macos-arm64` (Apple Silicon) или `Rvt_Docs_MCP-macos-x64` (Intel).
3. Релиз собран GitHub Actions форка из того же кода, что и при ручной сборке, —
   проверять Deno не нужно, переходи сразу к §3.

Проверить, что скачал не апстрим: в релизе форка три ассета и тег `v1.0.6`+;
в апстриме теги `v1.0.0`…`v1.0.5` от августа 2025.

> ℹ️ Релизы `v1.0.0`…`v1.0.5` в форке — это унаследованные при форке теги апстрима,
> бинарников под ними нет. Нужен именно `v1.0.6` и новее.

### Вариант B — собрать из исходников (если релиза нет или нужен свой билд)

**B1. Установить Deno** (одна команда, ~1 минута):

```powershell
winget install DenoLand.Deno
```

> ⚠️ После установки **закрой терминал и открой новый** — иначе команда `deno`
> не найдётся (PATH обновляется только для новых сессий). Проверка:
>
> ```powershell
> deno --version    # ожидаем: deno 2.x.x (stable, release, x86_64-pc-windows-msvc)
> ```
>
> Если winget недоступен, exe Deno лежит здесь (путь может отличаться):
> `C:\Users\<имя>\AppData\Local\Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe`

**B2. Склонировать форк и собрать:**

```powershell
cd C:\Dev                                      # любая папка, где хранишь исходники
git clone https://github.com/Alexandrisius/Rvt_Docs_MCP.git
cd Rvt_Docs_MCP
git log -1 --oneline                           # ожидаем: 42b3bfa fix: adapt to rvtdocs.com Search V2 API...
deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts
```

Первая сборка качает зависимости из интернета (1–3 минуты). Ожидаемый результат —
файл `Rvt_Docs_MCP-windows.exe` размером **~93 МБ** в папке репозитория.

**B3. (необязательно, но полезно) проверить код и сам exe:**

```powershell
deno check main.ts                             # ожидаем: код возврата 0, без ошибок типов
.\Rvt_Docs_MCP-windows.exe -h                  # ожидаем: печатается help-меню
```

> ℹ️ Запуск exe в терминале больше ни для чего не нужен: это stdio-сервер, он ждёт
> команды от opencode. Help-меню — единственная осмысленная ручная проверка.

---

## 3. Шаг 2 — положить exe в свой репозиторий

```powershell
cd C:\path\to\ТВОЙ-РЕПОЗИТОРИЙ
mkdir tools                                    # если папки нет
# скопировать собранный/скачанный exe:
copy C:\Dev\Rvt_Docs_MCP\Rvt_Docs_MCP-windows.exe tools\
dir tools                                      # ожидаем: Rvt_Docs_MCP-windows.exe  ~93 МБ (97 4xx xxx байт)
```

**Имя файла должно совпадать с тем, что напишешь в конфиге.** Можешь назвать иначе —
тогда поправь путь в §4.

> Можно положить exe и вне репозитория (например `C:\Tools\Rvt_Docs_MCP\`) — тогда в
> конфиге придётся писать **абсолютный** путь, и такой конфиг нельзя коммитить (на
> чужой машине путь будет неверным). Рекомендуемый вариант — `tools/` внутри репо +
> относительный путь.

---

## 4. Шаг 3 — создать `opencode.json` в КОРНЕ репозитория

Создай файл `opencode.json` рядом с `.git` и вставь **ровно это**:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "revit-api-docs": {
      "type": "local",
      "command": ["tools/Rvt_Docs_MCP-windows.exe"],
      "enabled": true
    }
  }
}
```

Командами (PowerShell, из корня репозитория):

```powershell
$json = @'
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "revit-api-docs": {
      "type": "local",
      "command": ["tools/Rvt_Docs_MCP-windows.exe"],
      "enabled": true
    }
  }
}
'@

# PowerShell 7 (pwsh):
Set-Content opencode.json -Value $json -Encoding utf8

# Windows PowerShell 5.1 — этот вариант вместо строки выше (иначе будет BOM):
# [System.IO.File]::WriteAllText("$PWD\opencode.json", $json, (New-Object System.Text.UTF8Encoding $false))

Get-Content opencode.json -Raw    # проверить, что файл записался
```

**Важные детали:**

- Путь `tools/Rvt_Docs_MCP-windows.exe` — **относительный, от корня проекта**. Проверено:
  opencode резолвит его корректно, сервер подключается. Именно поэтому конфиг можно
  коммитить в git и он заработает на любой машине.
- Слеши — прямые `/`, а не `\\`. Если пишешь абсолютный путь Windows, экранируй:
  `"D:\\Project\\...\\Rvt_Docs_MCP-windows.exe"`.
- Кодировка файла — UTF-8 **без BOM**. Команда выше рассчитана на **PowerShell 7**
  (`pwsh`) — там `-Encoding utf8` пишет без BOM. В старом **Windows PowerShell 5.1**
  тот же флаг добавит BOM, поэтому используй вместо неё:

  ```powershell
  [System.IO.File]::WriteAllText("$PWD\opencode.json", $json, (New-Object System.Text.UTF8Encoding $false))
  ```

  Проверить BOM: `[System.IO.File]::ReadAllBytes("$PWD\opencode.json")[0..2]` —
  первые байты должны быть `123,10,32` (это `{`), а не `239,187,191` (BOM).
- Это **проектный** конфиг: сервер появится только в этом репозитории. Если хочешь, чтобы
  он был во всех проектах, — добавь тот же блок `"mcp"` в глобальный
  `C:\Users\<имя>\.config\opencode\opencode.json` (только с абсолютным путём к exe).

---

## 5. Шаг 4 — не дать exe попасть в git

exe весит ~93 МБ. GitHub предупреждает на файлах >50 МБ и **блокирует** push файлов
>100 МБ без Git LFS, а каждый пересбор навсегда добавит в историю ещё ~93 МБ.
Поэтому exe в git не коммитим — только конфиг.

Добавь в `.gitignore` (создай файл, если его нет):

```gitignore
# бинарники MCP-сервера (весят ~93 МБ, собираются/качаются локально)
*.exe
```

Точечно, если `*.exe` слишком широко для твоего проекта:

```gitignore
tools/Rvt_Docs_MCP-windows.exe
```

Проверка:

```powershell
git check-ignore -v tools/Rvt_Docs_MCP-windows.exe   # ожидаем: .gitignore:1:*.exe  tools/Rvt_Docs_MCP-windows.exe
git ls-files "*.exe"                                 # ожидаем: пусто
git status -sb                                       # ожидаем: ?? opencode.json (и только он)
```

Коммитим конфиг:

```powershell
git add opencode.json .gitignore
git commit -m "chore(mcp): add project-scoped revit-api-docs MCP config

Command uses a project-relative path; the executable itself stays untracked
(*.exe is gitignored). To set up on another machine, put
Rvt_Docs_MCP-windows.exe into tools/ - build it from
Alexandrisius/Rvt_Docs_MCP: deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts"
```

---

## 6. Шаг 5 — проверка подключения

> ⚠️ **Перезапусти opencode.** Уже открытые сессии подхватывают новый MCP только после
> перезапуска. Это причина №1 жалоб «я всё сделал, а инструментов нет».

```powershell
cd C:\path\to\ТВОЙ-РЕПОЗИТОРИЙ
opencode mcp list
```

**Ожидаемый вывод (зелёный):**

```
┌  MCP Servers
│
●  ✓ revit-api-docs connected
│      tools/Rvt_Docs_MCP-windows.exe
│
└  1 server(s)
```

Если у тебя в глобальном конфиге (`C:\Users\<имя>\.config\opencode\opencode.json`) уже
есть другие серверы, они тоже попадут в список — это нормально. Реальный пример вывода
на машине с глобальными github/exa/context7 (проверено в пустой тестовой папке
08.09.2026):

```
●  ✓ github          connected
●  ✓ exa             connected
●  ✓ context7        connected
●  ✓ revit-api-docs  connected
│      tools/Rvt_Docs_MCP-windows.exe
└  4 server(s)
```

Критерий один: строка **`revit-api-docs connected`**, а не `failed`.

Если используешь opencode V2:

```powershell
opencode2 debug config
# в выводе ищем блок: "revit-api-docs": { "type": "local", "command": [...], "disabled": false }
```

Проверка области действия (так и задумано — сервер проектный):

```powershell
cd C:\Windows\Temp
opencode mcp list        # ожидаем: revit-api-docs В СПИСКЕ НЕТ
```

---

## 7. Шаг 6 — смоук-тест внутри сессии (главная проверка)

`mcp list` доказывает только что процесс запустился. Настоящая проверка — вызвать
инструменты. Открой opencode в папке репозитория и попроси агента:

> «Вызови MCP-инструмент `revit-api-docs` → `search-docs` с `queryString: "Wall"`,
> `year: 2025`, `maxResults: 3`. Покажи сырой ответ.»

**Ожидаемый ответ** (значит поиск по новому API работает):

```json
[
  { "title": "Wall Class", "description": "Represents a wall in Autodesk Revit.",
    "namespace": "Autodesk.Revit.DB", "type": "Class", "url": "/2025/Autodesk.Revit.DB.Wall" },
  { "title": "WallType Class", ... },
  { "title": "WallPaint Class", ... }
]
```

Затем:

> «Вызови `retrieve-doc` с `urlSlug: "/2025/Autodesk.Revit.DB.Wall"` и покажи первые 40 строк.»

**Ожидаемо:** markdown с секциями `Description`, `Remarks`, `Hierarchy`, `## Syntax`
(только C#), `## Methods` (таблица с колонкой `Inherited From`). Объём ~15 000 символов.

И контроль версии метода:

> «Вызови `retrieve-doc` с `urlSlug: "/2025/Autodesk.Revit.DB.Wall.Create(Document,Curve,ElementId,ElementId,Double,Double,Boolean,Boolean)"`.»

**Ожидаемо:** `Declaring Type`, `## Syntax` (C#), `## Parameters` (таблица 8 строк),
`**Return Value:** \`Wall\``, `## Exceptions` (таблица 5 строк). Объём ~2 400 символов.

Если все три ответа такие — **установка завершена, всё работает.** Переходи к §8.

---

## 8. Что прописать в `AGENTS.md` (обязательно, иначе агент будет пользоваться криво)

Создай/дополни файл `AGENTS.md` в корне репозитория и вставь блок ниже **как есть**.
Он закрывает три реальные проблемы: агент начинает задавать поиску вопросы человеческим
языком (поиск возвращает мусор), агент путает `retrieve-docs` со списком URL, и агент
ждёт от MCP примеров кода, которых там нет.

````markdown
## Revit API: инструменты поиска (MCP `revit-api-docs`)

В проекте подключён локальный MCP-сервер `revit-api-docs`
(форк <https://github.com/Alexandrisius/Rvt_Docs_MCP>, exe в `tools/`, конфиг в `opencode.json`).
Сервер парсит `rvtdocs.com` + `revitapidocs.com` и возвращает справку Revit API в
компактном markdown. **Собственных знаний у него нет, примеры кода он не отдаёт,
работает только онлайн.**

### Иерархия инструментов (что чем искать)

| Задача | Инструмент |
|---|---|
| Сигнатура класса/метода, параметры, исключения, Remarks, состав класса, доступность по версиям Revit | MCP `revit-api-docs` |
| Примеры кода, best practices, Jeremy Tammik / The Building Coder, StackOverflow, GitHub open-source плагины, известные баги | Exa (`exa_web_search_exa`) |
| Официальная документация .NET / WPF / NuGet-библиотек | Context7 |
| Revit API через Context7 | **ЗАПРЕЩЕНО** (нет в их базе) |

### Доступные инструменты и их параметры

| Инструмент | Принимает | Возвращает | Когда использовать |
|---|---|---|---|
| `search-docs` | `queryString`, `queryTypes?`, `year?`, `maxResults?` | список сущностей `{title, description, namespace, type, url}` — БЕЗ текста документации | всегда первым, чтобы получить `url` |
| `retrieve-doc` | `urlSlug` (строка из ответа поиска) | одна страница полным markdown | нужна конкретная страница |
| `retrieve-docs` | `queryString`, `queryTypes?`, `year?`, `maxResults?` | полные тексты ВСЕХ найденных страниц | нужно содержимое нескольких страниц сразу |

### Жёсткие правила вызова

1. **`queryString` — это ИМЯ сущности, а не фраза и не вопрос.**
   - правильно: `Wall`, `Connector`, `ElementTransformUtils.MoveElement`, `FilteredElementCollector`
   - неправильно: `how do I move a wall`, `как передвинуть стену`, `methods for creating pipe`
   - Формат `Class.Member` работает только при `year >= 2025`.
   - Формат `Constructor(arg1, arg2)` — для поиска конкретного конструктора.
2. **`retrieve-docs` — это «найти И сразу отдать полные тексты».** Он принимает
   `queryString`, а НЕ список URL. Передать туда свой перечень slug'ов нельзя
   (валидация ответит `queryString: Missing key`).
3. **`retrieve-doc` принимает только slug** вида `/2025/Autodesk.Revit.DB.Wall`,
   полученный из поиска. Полные `https://...` URL не подставляй.
4. **`year` = версия Revit, под которую пишется код** (диапазон 2020–2027, default 2025).
   Для кросс-версионного кода проверяй сигнатуру в каждой целевой версии — они отличаются.
5. **`queryTypes` сужает выборку:** `Class`, `Constructor`, `Method`, `Methods`,
   `Property`, `Properties`, `Interface`, `Enumeration`.
6. **Экономь токены:** страница класса ≈ 15 000 символов (~4k токенов), страница метода
   ≈ 2 500 символов. Не выгружай десяток страниц класса подряд — сначала `search-docs`,
   потом точечно `retrieve-doc` по методу.
7. **`maxResults` держи ≤ 5** для разведки (по умолчанию 10, максимум 50).

### Порядок работы при любой задаче с Revit API

1. `search-docs` → найти сущность и получить `url`
2. `retrieve-doc` → проверить сигнатуру, параметры, исключения, Remarks
3. Exa → минимум 3 запроса за живым примером кода и известными проблемами
4. Только потом писать код

### Чего MCP НЕ знает и НЕ отдаёт

- **Примеры кода.** Секции `Examples`, `Community Snippets`, `Discussion` намеренно
  вырезаны при парсинге (`lib/extractDocs.ts`, `SKIPPED_SECTION_LABELS`). За примерами — в Exa.
- Вкладки синтаксиса VB / C++ / F# — отдаётся только C#.
- Мнения, «как лучше», архитектурные рекомендации.
- Всё, чего нет на `rvtdocs.com` / `revitapidocs.com`.
- Офлайн-режим: кэша нет, каждый вызов идёт в сеть.

### Как понять, что MCP сломался (уже случалось 04–05.09.2026)

| Симптом в ответе инструмента | Причина | Лечение |
|---|---|---|
| `404 Not Found` при `search-docs` | сайт снова сменил поисковый API | пересобрать exe из свежего форка |
| `Main content section not found` при `retrieve-doc` | страницы сайта снова перевёрстаны | то же |
| Инструменты видны, но падают при вызове; сервер «connected» | стоит старый exe (сборки до 09.2026) | пересобрать exe, перезапустить opencode |

Пересборка: `git pull` в клоне форка → `deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts`
→ заменить exe в `tools/` → перезапустить opencode.

### Инструмент `search-library` отсутствует — это норма

В форке есть четвёртый инструмент (семантический поиск по The Building Coder), но он
регистрируется только при наличии `OPENAI_API_KEY` **и** `OPENAI_VECTOR_STORE_ID`.
Без них видно ровно 3 инструмента. Не считай это поломкой.
````

---

## 9. Если не работает — таблица диагностики

| Симптом | Причина | Что делать |
|---|---|---|
| `opencode mcp list` → `✗ revit-api-docs failed` | неверный путь к exe / exe нет на месте | `dir tools` — файл есть? Имя совпадает с конфигом? Попробуй абсолютный путь с `\\` |
| Инструментов нет в сессии, хотя `mcp list` зелёный | сессия запущена до создания конфига | **перезапусти opencode** (закрой и открой заново) |
| `deno` — «не является командой» | терминал открыт до установки Deno | открой **новый** терминал; или зови exe по полному пути из WinGet Packages |
| `search-docs` → `404 Not Found` | старый exe (до Search V2) | пересобери из форка Alexandrisius (§2B) |
| `retrieve-doc` → `Main content section not found` | сайт снова переехал | проверь форк на новые коммиты, пересобери; сообщи владельцу |
| `Invalid arguments ... queryString: Missing key` | в `retrieve-docs` передали список URL | `retrieve-docs` принимает `queryString` (поиск+выдача), для конкретного slug — `retrieve-doc` |
| Поиск возвращает пустой/мусорный список | `queryString` задан фразой | только имена сущностей: `Wall`, `Class.Member` |
| `FileNotFoundException` / SmartScreen блокирует exe | защита Windows против неподписанного бинарника | свойства файла → «Разблокировать»; или собери exe сам (§2B) |
| Сервер подключается, но строгой MCP-клиент рвёт handshake | сервер печатает инфо-строки в stdout (`console.info` в `main.ts`) | opencode это переносит нормально; для другого клиента — убрать/перенаправить вывод в stderr |
| В другом репозитории сервера нет | так и задумано: конфиг проектный | скопируй `opencode.json` туда или пропиши в глобальном конфиге |
| `git push` отклонён: файл >100 МБ | exe попал в git | добавь `*.exe` в `.gitignore`, `git rm --cached tools/Rvt_Docs_MCP-windows.exe`, коммит заново |

---

## 10. Не Windows (macOS / Linux)

Для macOS готовые бинарники **есть** в релизе `v1.0.6` и новее:
`Rvt_Docs_MCP-macos-arm64` (Apple Silicon, ~82 МБ) и `Rvt_Docs_MCP-macos-x64`
(Intel, ~93 МБ). Скачай нужный ассет, положи в `tools/` своего репозитория и
выполни `chmod +x tools/Rvt_Docs_MCP-macos-arm64`. В `opencode.json` пропиши
`"command": ["tools/Rvt_Docs_MCP-macos-arm64"]` (без `.exe`), в `.gitignore` —
вместо `*.exe` укажь имена бинарников или используй `tools/Rvt_Docs_MCP-*`.

Для Linux готовой сборки в CI нет (матрица воркфлоу покрывает Windows и macOS) —
собирай на своей машине:

```bash
git clone https://github.com/Alexandrisius/Rvt_Docs_MCP.git
cd Rvt_Docs_MCP
deno compile -A --output Rvt_Docs_MCP main.ts
chmod +x Rvt_Docs_MCP
mkdir -p ../ТВОЙ-РЕПО/tools && cp Rvt_Docs_MCP ../ТВОЙ-РЕПО/tools/
```

В `opencode.json`: `"command": ["tools/Rvt_Docs_MCP"]` (без `.exe`),
в `.gitignore` — вместо `*.exe` укажи `tools/Rvt_Docs_MCP`.

Кросс-сборка под другую ОС (как делает CI форка):

```bash
deno compile -A --target x86_64-pc-windows-msvc --output Rvt_Docs_MCP-windows.exe main.ts
deno compile -A --target aarch64-apple-darwin  --output Rvt_Docs_MCP-macos-arm64   main.ts
```

---

## 11. Опционально — включить четвёртый инструмент `search-library`

Семантический поиск по The Building Coder (блог Jeremy Tammik). Требует OpenAI-ключ и
заранее наполненный vector store (инструкция: `kaitpw/Rvt_Docs_TBC_Embedder`).

```json
{
  "mcp": {
    "revit-api-docs": {
      "type": "local",
      "command": ["tools/Rvt_Docs_MCP-windows.exe", "-k", "sk-...", "-v", "vs_..."],
      "enabled": true
    }
  }
}
```

Либо через переменные окружения `OPENAI_API_KEY` и `OPENAI_VECTOR_STORE_ID`
(в форке подключён `@std/dotenv`, т.е. возможен файл `.env`; он уже в `.gitignore` форка).
**Не коммить ключи в `opencode.json`** — файл лежит в git.

---

## 12. Зачем это вообще нужно (чтобы понимать ценность)

Сравнение на реальной странице класса `Autodesk.Revit.DB.Wall` (Revit 2025):

| Источник | Объём | В токенах (грубо) |
|---|---|---|
| Сырой HTML страницы на rvtdocs.com | 202 575 символов | ~50–60k — в контекст не влезает |
| Ответ `retrieve-doc` через MCP | 15 295 символов | ~4k |
| Ответ `retrieve-doc` по одному методу | 2 425 символов | ~600 |

То есть MCP даёт **сжатие примерно в 13 раз** и выкидывает всё лишнее (вкладки VB/C++/F#,
обсуждения, навигацию), оставляя то, что нужно агенту: сигнатуру, параметры, исключения,
иерархию наследования и список членов класса.

Вторая польза — **версии 2020–2027**: можно проверить, существует ли метод в нужной
версии Revit и не поменялась ли сигнатура (актуально для кросс-версионных плагинов).

Чего MCP не заменит: живых примеров кода и «как правильно». Для этого — Exa
(The Building Coder, GitHub open-source плагины, форумы Autodesk).

---

## 13. Шпаргалка (всё одним экраном)

```powershell
# 1. exe в tools/   (скачать из Releases форка ИЛИ собрать)
winget install DenoLand.Deno                       # новый терминал после установки!
git clone https://github.com/Alexandrisius/Rvt_Docs_MCP.git
cd Rvt_Docs_MCP
deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts
copy Rvt_Docs_MCP-windows.exe C:\path\to\РЕПО\tools\

# 2. в корне РЕПО: opencode.json
#    { "$schema":"https://opencode.ai/config.json",
#      "mcp":{ "revit-api-docs":{ "type":"local",
#        "command":["tools/Rvt_Docs_MCP-windows.exe"], "enabled":true } } }

# 3. в корне РЕПО: .gitignore  ->  *.exe

# 4. проверка (после ПЕРЕЗАПУСКА opencode)
cd C:\path\to\РЕПО ; opencode mcp list             # ✓ revit-api-docs connected
git check-ignore -v tools/Rvt_Docs_MCP-windows.exe # игнорируется
git ls-files "*.exe"                               # пусто

# 5. смоук-тест в сессии: search-docs "Wall" -> url /2025/Autodesk.Revit.DB.Wall
#                        retrieve-doc  "/2025/Autodesk.Revit.DB.Wall" -> Syntax/Methods

# 6. вставить блок из §8 в AGENTS.md
```

---

## 14. Откуда всё это известно (источники для проверки)

| Факт | Где подтверждён |
|---|---|
| Форк адаптирован под Search V2 | `lib/searchDocs.ts:108` → `https://rvtdocs.com/search/v2/api/`, коммит `42b3bfa` |
| Отказоустойчивость поиска | `lib/searchDocs.ts:18` → `Promise.allSettled` по двум источникам |
| Вырезаны Examples/Discussion | `lib/extractDocs.ts:12` → `SKIPPED_SECTION_LABELS` |
| Диапазон версий 2020–2027 | `lib/toolsCommon.ts:67` → `z.number().min(2020).max(2027)` |
| `search-library` gated по ключам | `main.ts` → `if (apiKey && vectorStoreId) createSearchLibrary(server)` |
| Релиз форка с рабочими бинарниками | <https://github.com/Alexandrisius/Rvt_Docs_MCP/releases> → `v1.0.6` (3 ассета: windows, macos-x64, macos-arm64), собран GitHub Actions по тегу |
| Релизы апстрима сломаны | <https://github.com/kaitpw/Rvt_Docs_MCP/issues/3> — разбор причины |
| CI собирает exe по тегу `v*` | `.github/workflows/deno.yml` в форке |
| Относительный путь в конфиге работает | проверено `opencode mcp list` → `connected`, 08.09.2026 |
| Инструкция проверена end-to-end | команды §3–§6 выполнены дословно в пустой тестовой папке: BOM = `123,10,32`, `git check-ignore` → `.gitignore:1:*.exe`, `git ls-files "*.exe"` → пусто, `opencode mcp list` → `✓ revit-api-docs connected` |
| CI-артефакт релиза `v1.0.6` рабочий | скачанный `Rvt_Docs_MCP-windows.exe` (97 433 508 байт) проверен прямым MCP-stdio-клиентом: `initialize` → `revit-docs-mcp v1.0.0`, `tools/list` → `search-docs, retrieve-docs, retrieve-doc`, `search-docs "Wall"` → slug'и, `retrieve-doc` перегрузки `Wall.Create` → 2 425 симв. с Parameters / Exceptions / Return Value / C#-синтаксисом / Overloads |

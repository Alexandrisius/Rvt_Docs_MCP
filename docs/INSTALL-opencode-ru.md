# Установка MCP `revit-api-docs` в проект opencode

**Язык: [English](INSTALL-opencode-en.md) | Русский**

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
2. Возьми последний релиз (**`v1.0.7`** или новее) и скачай ассет
   **`Rvt_Docs_MCP-windows.exe`** (~93 МБ).
   Для macOS: `Rvt_Docs_MCP-macos-arm64` (Apple Silicon) или `Rvt_Docs_MCP-macos-x64` (Intel).
3. Релиз собран GitHub Actions форка из того же кода, что и при ручной сборке, —
   проверять Deno не нужно, переходи сразу к §3.

> ℹ️ Поведение, описанное в блоке §8 (`declaringType` / `isObsolete` в результатах поиска,
> удаление page-id-дубликатов, секция `## Overload Signatures` на страницах-заглушках и
> подсказка slug'а при 404 унаследованного члена), появилось в **`v1.0.8`**. На `v1.0.7`
> этих полей и секций не будет — всё остальное работает так же.

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

exe весит ~93 МБ. GitHub предупреждает на файлах больше 50 МБ и **блокирует** push
файлов больше 100 МБ без Git LFS, а каждый пересбор навсегда добавит в историю ещё
~93 МБ. Поэтому exe в git не коммитим — только конфиг.

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
>
> Сколько именно перезапускать — зависит от того, какой CLI ты используешь; один и тот
> же `opencode.json` подходит обоим:
>
> - **`opencode` (1.18.x)** — фонового демона нет: закрой TUI и открой снова, это
>   перезапустит сервер вместе с его MCP-процессами. Больше ничего не нужно.
> - **`opencode2` (2.0 preview)** — один общий фоновый демон
>   (`opencode2.exe serve --service`) владеет MCP-процессами **всех** окон и переживает
>   их закрытие, поэтому перезапуск окна часто ничего не меняет. Лёгкий способ:
>   переключи `"enabled": false` → `true` в `opencode.json` и подожди несколько секунд.
>   Тяжёлый: `opencode2 service restart` (убьёт активные сессии). Диагностика:
>   `opencode2 service status`.
>
> И не верь одному только `mcp list` — команда создаёт свой инстанс, поэтому может
> показать `✓ connected`, хотя в твоей сессии инструментов нет.

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
`**Return Value:** \`Wall\``, `## Exceptions` (таблица 5 строк). Объём ~2 400 символов
(2 425 на `v1.0.8`).

> ℹ️ Не путай два slug. `/2025/Autodesk.Revit.DB.Wall.Create` **без** списка параметров —
> это страница-заглушка со списком перегрузок, и начиная с `v1.0.8` она дополнительно
> возвращает `## Overload Signatures` (5 сигнатур, ~2 357 символов). Конкретная
> перегрузка — это slug со списком параметров, как в запросе выше.

Если все три ответа такие — **установка завершена, всё работает.** Переходи к §8.

---

## 8. Что прописать в `AGENTS.md` (обязательно, иначе агент будет пользоваться криво)

Создай/дополни файл `AGENTS.md` в корне репозитория и вставь блок ниже **как есть**.
Он закрывает три реальные проблемы: агент начинает задавать поиску вопросы человеческим
языком (поиск возвращает мусор), агент путает `retrieve-docs` со списком URL, и агент
ждёт от MCP community-примеров, которых там нет: официальный пример со страницы
отдаётся только при `includeExamples: true`.

Ещё три проблемы в блоке закрыты по итогам «слепого» теста — всего из него выросло пять
правок `v1.0.8`. Агенту без контекста дали реальную задачу Revit (повернуть колонну на 45°
вокруг Z, проверить pinned, внутри транзакции) и ничего не подсказывали про инструменты.
Задачу он решил, не выдумав ни одной сигнатуры, набор оценил на 7,5/10 (`search-docs` 8,5,
`retrieve-doc` 6,5) и назвал ровно эти боли: формат `urlSlug` нигде не описан,
множественные `queryTypes` выглядят как способ перечислить члены класса (это не так),
а член с перегрузками или унаследованный член стоят лишних вызовов и упираются в тупик 404.

````markdown
## Revit API: инструменты поиска (MCP `revit-api-docs`)

В проекте подключён локальный MCP-сервер `revit-api-docs`
(форк <https://github.com/Alexandrisius/Rvt_Docs_MCP>, exe в `tools/`, конфиг в `opencode.json`).
Сервер парсит `rvtdocs.com` + `revitapidocs.com` и возвращает справку Revit API в
компактном markdown. **Собственных знаний у него нет, работает только онлайн. C#-синтаксис
(сигнатуры) есть в каждом ответе; единственный *пример использования* — официальный пример
со страницы доков, и только по явному запросу (`includeExamples: true`).**

### Иерархия инструментов (что чем искать)

| Задача | Инструмент |
|---|---|
| Сигнатура класса/метода, параметры, исключения, Remarks, состав класса, доступность по версиям Revit | MCP `revit-api-docs` |
| Официальный C#-пример, который идёт со страницей доков (есть примерно у половины страниц) | MCP `revit-api-docs` с `includeExamples: true` |
| Примеры кода от сообщества, best practices, Jeremy Tammik / The Building Coder, StackOverflow, GitHub open-source плагины, известные баги | Exa (`exa_web_search_exa`) |
| Официальная документация .NET / WPF / NuGet-библиотек | Context7 |
| Revit API через Context7 | **ЗАПРЕЩЕНО** (нет в их базе) |

### Доступные инструменты и их параметры

| Инструмент | Принимает | Возвращает | Когда использовать |
|---|---|---|---|
| `search-docs` | `queryString`, `queryTypes?`, `year?`, `maxResults?` | список сущностей `{title, description, namespace, type, url}` — БЕЗ текста документации. У членов дополнительно `declaringType` (тип, который их объявляет), у устаревших — `isObsolete` (иначе поля нет). Дубликаты удалены: обе площадки индексируют одну сущность и читаемым slug'ом, и голым page-id, остаётся читаемый (тот, что с описанием) | всегда первым, чтобы получить `url` |
| `retrieve-doc` | `urlSlug` (строка из ответа поиска, формат — правило 3), `includeExamples?` | одна страница полным markdown. Страница-заглушка члена с перегрузками дополнительно содержит `## Overload Signatures` — C#-синтаксис каждой перегрузки (не больше 10). Если у члена своей страницы нет (он унаследован), в тексте ошибки 404 приходит готовый slug объявляющего типа | нужна конкретная страница |
| `retrieve-docs` | `queryString`, `queryTypes?`, `year?`, `maxResults?`, `includeExamples?` | полные тексты ВСЕХ найденных страниц | нужно содержимое нескольких страниц сразу |

### Жёсткие правила вызова

1. **`queryString` — это ИМЯ сущности, а не фраза и не вопрос.**
   - правильно: `Wall`, `Connector`, `ElementTransformUtils.MoveElement`, `FilteredElementCollector`
   - неправильно: `how do I move a wall`, `как передвинуть стену`, `methods for creating pipe`
   - Формат `Class.Member` работает только при `year >= 2025`.
   - Формат `Constructor(arg1, arg2)` — для поиска конкретного конструктора.
2. **`retrieve-docs` — это «найти И сразу отдать полные тексты».** Он принимает
   `queryString`, а НЕ список URL. Передать туда свой перечень slug'ов нельзя
   (валидация ответит `queryString: Missing key`).
3. **`retrieve-doc` принимает только slug**, полученный из поиска: копируй поле `url`
   результата `search-docs` дословно, ведущий слэш необязателен. Формат:
   `/<year>/<Namespace>.<Type>` для класса, `/<year>/<Namespace>.<Type>.<Member>` для члена.
   Конкретная перегрузка — её список параметров ровно как показан, например
   `/2025/Autodesk.Revit.DB.Wall.Create(Document,Curve,ElementId,Boolean)`. Полные
   `https://...` URL не подставляй.
4. **`year` = версия Revit, под которую пишется код** (диапазон 2020–2027, default 2025).
   Для кросс-версионного кода проверяй сигнатуру в каждой целевой версии — они отличаются.
5. **`queryTypes` сужает выборку:** `Class`, `Constructor`, `Method`, `Methods`,
   `Property`, `Properties`, `Interface`, `Enumeration`.
   - Значения в **единственном** числе (Class, Method, Property, Constructor, Interface,
     Enumeration) соответствуют отдельным страницам API с основного источника rvtdocs.com.
   - Значения во **множественном** числе (Methods, Properties) соответствуют странице со
     ВСЕМИ членами класса, приходят только со вторичного источника revitapidocs.com и есть
     лишь у части классов (замерено: `WallType` → 1 результат, `Transaction` → 1,
     `Element` → 0, `Level` → 0).
   - Вывод: перечислить члены класса через `queryTypes: ["Methods"]` **нельзя**. Надёжный
     способ — `retrieve-doc` по странице класса: её таблицы `Methods` / `Properties`
     содержат каждый член и тип, на котором он объявлен.
6. **Экономь токены:** страница класса ≈ 15 000 символов (~4k токенов), страница метода
   ≈ 2 500 символов. Не выгружай десяток страниц класса подряд — сначала `search-docs`,
   потом точечно `retrieve-doc` по методу.
7. **`maxResults` держи ≤ 5** для разведки (по умолчанию 10, максимум 50).
8. **`includeExamples` (по умолчанию `false`)** добавляет официальный C#-пример со
   страницы — от +500 до +3 300 символов, и есть он примерно у половины страниц.
   Включай, когда нужно посмотреть, как API реально вызывается; не включай, когда
   нужна только сигнатура. В `retrieve-docs` флаг применяется к каждой странице,
   поэтому держи `maxResults` = 1–2.
9. **Страница члена живёт на том типе, который его объявил.** У унаследованного члена своей
   страницы нет: `/2025/Autodesk.Revit.DB.LocationPoint.Rotate` → 404, потому что `Rotate`
   объявлен на `Location`. С `v1.0.8` такая ошибка заканчивается подсказкой
   `Try: /2025/Autodesk.Revit.DB.Location.Rotate` — просто вызови этот slug. Объявляющий тип
   видно заранее: поле `declaringType` в результате `search-docs` или колонка
   `Inherited From` в таблице членов на странице класса. Подсказка best effort — она требует
   колонку `Inherited From` (доки 2025+), а если не сработала, придёт обычный текст ошибки.
   Родственное поле `isObsolete` появляется в результатах поиска только у устаревших
   сущностей: если оно есть — ищи неустаревшую альтернативу.

### Порядок работы при любой задаче с Revit API

1. `search-docs` → найти сущность и получить `url`
2. `retrieve-doc` → проверить сигнатуру, параметры, исключения, Remarks
3. `retrieve-doc` с `includeExamples: true` → официальный C#-пример, если он на странице есть
4. Exa → минимум 3 запроса за живым примером от сообщества и известными проблемами
5. Только потом писать код

### Чего MCP НЕ знает и НЕ отдаёт

- **Контент сообщества.** Секции `Community Snippets` (0–1 карточка pyRevit/Python на
  страницу) и `Discussion` (не отрисовывается сервером вообще — сайт грузит комментарии
  через JS под логином) намеренно вырезаны при парсинге (`lib/extractDocs.ts`,
  `SKIPPED_SECTION_LABELS`). Официальная секция `Examples` больше не вырезается, но
  включается по запросу: передай `includeExamples: true`. За примерами от сообщества — в Exa.
- Вкладки синтаксиса VB / C++ / F# — отдаётся только C#.
- Больше 10 перегрузок одного члена: `## Overload Signatures` раскрывает максимум
  `MAX_OVERLOAD_PAGES = 10` страниц (худший случай ≈ +1,5 кБ) и дописывает, сколько
  перегрузок не раскрыто. Недоступная перегрузка пропускается, а не роняет вызов.
- Мнения, «как лучше», архитектурные рекомендации.
- Всё, чего нет на `rvtdocs.com` / `revitapidocs.com`.
- Офлайн-режим: кэша нет, каждый вызов идёт в сеть.

### Как понять, что MCP сломался (уже случалось 04–05.09.2026)

| Симптом в ответе инструмента | Причина | Лечение |
|---|---|---|
| `404 Not Found` при `search-docs` | сайт снова сменил поисковый API | пересобрать exe из свежего форка |
| `Main content section not found` при `retrieve-doc` | страницы сайта снова перевёрстаны | то же |
| Инструменты видны, но падают при вызове; сервер «connected» | стоит старый exe (сборки до 09.2026) | пересобрать exe, затем переключить `"enabled"` в `opencode.json` — одного перезапуска окна может не хватить |
| Непонятно, какая сборка реально запущена | до `v1.0.6` handshake всегда отвечал `serverInfo.version: 1.0.0` | начиная с `v1.0.7` сервер сообщает настоящую версию — смотри `initialize` → `serverInfo.version` |
| Инструменты MCP пропали из сессии после замены exe или убийства процесса | у `opencode2` (2.0 preview) общий фоновый демон владеет MCP-процессами, мёртвый **не** перезапускает и переживает закрытие окна; у `opencode` (1.18.x) демона нет вообще | `opencode`: перезапусти окно. `opencode2`: переключи `"enabled": false` → `true` в `opencode.json` и подожди несколько секунд, либо `opencode2 service restart` (убьёт активные сессии). Не верь `mcp list`: команда поднимает свой инстанс и показывает `✓ connected`, даже когда сервер твоей сессии мёртв |

Пересборка: `git pull` в клоне форка → `deno compile -A --output Rvt_Docs_MCP-windows.exe main.ts`
→ освободить файл (Windows блокирует работающий exe: перезапись падает с `Access is denied`):
полностью закрыть `opencode` (1.18.x) либо выполнить `opencode2 service restart` → заменить exe
в `tools/` → запустить opencode снова (для `opencode2` достаточно переключить `"enabled"` в
`opencode.json`, полный перезапуск не нужен).

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
| Инструментов нет в сессии, хотя `mcp list` зелёный | сессия запущена до создания конфига, либо (у `opencode2`) общий демон держит мёртвый MCP-процесс | **перезапусти opencode** (закрой и открой заново). Если не помогло — ты на `opencode2`, а его демон `serve --service` переживает закрытие окон: переключи `"enabled": false` → `true` в `opencode.json` или выполни `opencode2 service restart` |
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
| Тот же метод с `includeExamples: true` | 2 970 символов | ~750 |

То есть MCP даёт **сжатие примерно в 13 раз** и выкидывает всё лишнее (вкладки VB/C++/F#,
обсуждения, навигацию), оставляя то, что нужно агенту: сигнатуру, параметры, исключения,
иерархию наследования и список членов класса.

Вторая польза — **версии 2020–2027**: можно проверить, существует ли метод в нужной
версии Revit и не поменялась ли сигнатура (актуально для кросс-версионных плагинов).

Чего MCP не заменит: примеров кода от сообщества и «как правильно». Официальный пример
со страницы доступен по явному запросу (`includeExamples: true`), но всё сверх этого — через Exa
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
| Форк адаптирован под Search V2 | `lib/searchDocs.ts:173` → `https://rvtdocs.com/search/v2/api/`, коммит `42b3bfa` |
| Отказоустойчивость поиска | `lib/searchDocs.ts:18` → `Promise.allSettled` по двум источникам |
| Карточки сообщества вырезаны, официальные примеры — opt-in | `lib/extractDocs.ts` → `SKIPPED_SECTION_LABELS` (Discussion, Community Snippets) + `EXAMPLES_SECTION_LABEL` под флагом `includeExamples` |
| `includeExamples` замерен, ответ по умолчанию не изменился | проверено на живых страницах и собранном exe 08.09.2026: `Wall.Create(...)` → 2 425 симв. без флага (идентично базлайну `v1.0.6`) и 2 970 с флагом; `ReferenceIntersector` → 4 571 → 7 872; `Element` (официального примера нет, но есть Python-сниппет сообщества) → 17 652 → 17 652, то есть флаг не добавляет ничего, кроме официального C#-примера. Официальные примеры найдены на 12 из 24 проверенных страниц, по 154–3 272 символа |
| Диапазон версий 2020–2027 | `lib/toolsCommon.ts:78` → `z.number().min(2020).max(2027)` |
| `search-library` gated по ключам | `main.ts` → `if (apiKey && vectorStoreId) createSearchLibrary(server)` |
| Релиз форка с рабочими бинарниками | <https://github.com/Alexandrisius/Rvt_Docs_MCP/releases> → `v1.0.6` (3 ассета: windows, macos-x64, macos-arm64), собран GitHub Actions по тегу |
| Релизы апстрима сломаны | <https://github.com/kaitpw/Rvt_Docs_MCP/issues/3> — разбор причины |
| CI собирает exe по тегу `v*` | `.github/workflows/deno.yml` в форке |
| Относительный путь в конфиге работает | проверено `opencode mcp list` → `connected`, 08.09.2026 |
| Инструкция проверена end-to-end | команды §3–§6 выполнены дословно в пустой тестовой папке: BOM = `123,10,32`, `git check-ignore` → `.gitignore:1:*.exe`, `git ls-files "*.exe"` → пусто, `opencode mcp list` → `✓ revit-api-docs connected` |
| CI-артефакт релиза `v1.0.6` рабочий | скачанный `Rvt_Docs_MCP-windows.exe` (97 433 508 байт) проверен прямым MCP-stdio-клиентом: `initialize` → `revit-docs-mcp v1.0.0`, `tools/list` → `search-docs, retrieve-docs, retrieve-doc`, `search-docs "Wall"` → slug'и, `retrieve-doc` перегрузки `Wall.Create` → 2 425 симв. с Parameters / Exceptions / Return Value / C#-синтаксисом / Overloads |
| Сборки различимы начиная с `v1.0.7` | `main.ts` → `McpServer({ name: "revit-docs-mcp", version: ... })`: с `v1.0.7` там настоящая версия релиза, сейчас — `1.0.8`. CI-артефакт `v1.0.6` в строке выше всё ещё отвечал `1.0.0` — именно поэтому версию надо поднимать перед каждым тегом |
| CI-артефакт релиза `v1.0.7` рабочий | скачанный `Rvt_Docs_MCP-windows.exe` (97 441 696 байт) проверен прямым MCP-stdio-клиентом 08.09.2026: `initialize` → `revit-docs-mcp v1.0.7`, `tools/list` → `search-docs, retrieve-docs, retrieve-doc`, схема `retrieve-doc` → `["urlSlug","includeExamples"]` с `includeExamples` по умолчанию `false`, перегрузка `Wall.Create` → 2 425 симв. без флага (идентично `v1.0.6`) и 2 970 симв. с `includeExamples: true` |
| Пять правок удобства `v1.0.8` выросли из «слепого» теста | 08.09.2026: агенту без контекста дали реальную задачу Revit (повернуть колонну на 45° вокруг Z, проверить pinned, внутри транзакции) и ничего не подсказывали про инструменты. Он оценил набор на 7,5/10 (`search-docs` 8,5, `retrieve-doc` 6,5), решил задачу, не выдумав ни одной сигнатуры, и назвал ровно те пять проблем, которые закрыты строками ниже |
| Формат `urlSlug` описан в самом параметре | `lib/toolsCommon.ts` → `toolValidators.urlSlug` `.describe(...)`: копировать `url` из результата `search-docs` дословно, ведущий слэш необязателен, `/<year>/<Namespace>.<Type>` для класса и `/<year>/<Namespace>.<Type>.<Member>` для члена, конкретная перегрузка — её список параметров как показан |
| Единственное/множественное число `queryTypes` разъяснено | `lib/toolsCommon.ts` → `queryTypes` `.describe(...)`. Замерено для `Methods`: `WallType` → 1 результат, `Transaction` → 1, `Element` → 0, `Level` → 0, то есть перечислить члены класса так нельзя — только через страницу `Class` |
| Результаты поиска полнее и без дублей | `types/index.ts` → опциональные `declaringType` / `isObsolete` (API и раньше возвращал `declaring_type`, он выбрасывался); `lib/searchDocs.ts` → `dedupePageIdTwins` (+ `PAGE_ID_SLUG`, `memberNameOf`) после `dedupeByUrl`. Замерено 08.09.2026: `search-docs "RotateElement"` было 5 результатов (2 page-id-дубля без описания) → стало 3, page-id-slug'ов 0, `declaringType` у всех трёх. `search-docs "WallType"` с `queryTypes: ["Methods"]` → 1 результат типа `Methods`, page-id-slug сохранён (читаемого близнеца нет) — дедупликация не сломала единственный путь к странице состава класса |
| 404 унаследованного члена теперь отдаёт рабочий slug | `lib/extractDocs.ts` → `suggestInheritedMemberSlug` + `findInheritedFrom`, вызываются из catch-блока `tools/retrieve-doc.ts`. Замерено: `retrieve-doc /2025/Autodesk.Revit.DB.LocationPoint.Rotate` → текст ошибки заканчивается на `Try: /2025/Autodesk.Revit.DB.Location.Rotate` |
| Страницы-заглушки перегрузок содержат сигнатуры | `lib/extractDocs.ts` → `isOverloadsStub`, `extractOverloadSignatures`, `fetchSyntaxBlock`, `MAX_OVERLOAD_PAGES = 10`. Замерено: `retrieve-doc /2025/Autodesk.Revit.DB.Transaction.Start` 382 → 548 симв., появилась секция `## Overload Signatures` с `### Start()` и `### Start(String)` и настоящим C# (`public TransactionStatus Start`); заглушка `Wall.Create` раскрылась в 2 357 симв. с 5 сигнатурами |
| Ответ по умолчанию не изменился, типы сходятся | замерено на локальной сборке 08.09.2026 через MCP-stdio: `ElementTransformUtils.RotateElement` с `includeExamples: true` → 1 165 симв. с `## Examples` и примером `RotateColumn`, тот же slug без флага → 827 симв. с `## Parameters` / `## Exceptions` и БЕЗ `## Examples`. `deno check main.ts` → код возврата 0 |

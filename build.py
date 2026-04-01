#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py — читает .md файлы из папки Еда/ и обновляет index.html

Запуск: python build.py
"""

import re
from pathlib import Path

BASE = Path(__file__).parent
EDA = BASE / "Еда"


# ─── Утилиты ──────────────────────────────────────────────────────────────────

def read(path):
    return path.read_text(encoding="utf-8")

def write(path, text):
    path.write_text(text, encoding="utf-8")

def replace_section(html, name, content):
    """Заменяет всё между <!-- BUILD:NAME --> и <!-- /BUILD:NAME -->"""
    pattern = rf"<!-- BUILD:{name} -->.*?<!-- /BUILD:{name} -->"
    replacement = f"<!-- BUILD:{name} -->\n{content.strip()}\n<!-- /BUILD:{name} -->"
    result = re.sub(pattern, replacement, html, flags=re.DOTALL)
    if result == html:
        print(f"  ⚠️  Маркер BUILD:{name} не найден в index.html")
    return result

def bold(text):
    """Конвертирует **текст** в <b>текст</b>"""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)

def parse_md_table(text):
    """Парсит markdown-таблицу, возвращает строки данных (без заголовка и разделителя)"""
    rows = []
    for line in text.strip().split("\n"):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(re.match(r"^[-: ]+$", c) for c in cells if c):
            continue  # строка-разделитель
        rows.append(cells)
    return rows[1:] if len(rows) > 1 else []  # пропускаем заголовок


# ─── ЗАПАСЫ ───────────────────────────────────────────────────────────────────

def badge(amount):
    """Оборачивает количество в цветной бейдж"""
    if not amount:
        return amount
    if amount.startswith("✅"):
        val = amount[1:].strip()
        return f'<span class="badge ok">{val}</span>'
    if amount.startswith("❌") or amount.startswith("⚠️"):
        val = re.sub(r"^[❌⚠️]\s*", "", amount)
        return f'<span class="badge low">{val}</span>'
    return f'<span class="badge ok">{amount}</span>'

def build_zapasy():
    text = read(EDA / "запасы_продуктов.md")
    html = ""

    date_m = re.search(r"_Обновлено:\s*(.+?)_", text)
    updated = date_m.group(1) if date_m else ""

    # Разбиваем по ## секциям
    parts = re.split(r"\n## (.+?)\n", text)
    # parts: [вступление, заголовок1, контент1, заголовок2, контент2, ...]

    for i in range(1, len(parts), 2):
        title = parts[i].strip()
        content = parts[i + 1] if i + 1 < len(parts) else ""

        rows = parse_md_table(content)
        rows = [r for r in rows if len(r) >= 2 and r[0].strip()]

        if not rows:
            continue

        html += f'<div class="card">\n<h2>{title}</h2>\n<table>\n'
        html += "<tr><th>Продукт</th><th>Количество</th></tr>\n"
        for row in rows:
            product = row[0]
            amount = row[1] if len(row) > 1 else ""
            html += f"<tr><td>{product}</td><td>{badge(amount)}</td></tr>\n"
        html += "</table>\n</div>\n"

    if updated:
        html += f'<p class="updated">Обновлено: {updated}</p>\n'

    return html


# ─── МОРОЗИЛКА ────────────────────────────────────────────────────────────────

def build_morozilka():
    text = read(EDA / "заморозка_готовое.md")
    html = ""

    # Готовые блюда (таблица)
    html += '<div class="card">\n<h2>Готовые блюда</h2>\n'
    table_m = re.search(r"## Что сейчас есть\n\n(.*?)\n---", text, re.DOTALL)
    if table_m:
        rows = parse_md_table(table_m.group(1))
        rows = [r for r in rows if r and r[0].strip()]
        if rows:
            html += "<table>\n<tr><th>Блюдо</th><th>Порций</th><th>Дата</th><th>Заметки</th></tr>\n"
            for row in rows:
                cells = (row + ["", "", "", ""])[:4]
                html += "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>\n"
            html += "</table>\n"
        else:
            html += '<p style="color:#aaa; font-size:14px; padding:8px 0;">Пока пусто — заполни после первой готовки!</p>\n'
    html += "</div>\n"

    # Что замораживается
    html += '<div class="card">\n<h2>Что хорошо замораживается</h2>\n'
    good_m = re.search(r"## Что хорошо замораживается\n\n(.*?)(?=\n## )", text, re.DOTALL)
    if good_m:
        for line in good_m.group(1).strip().split("\n"):
            if line.startswith("- ✅"):
                html += f'<div class="freeze-good">{line[2:].strip()}</div>\n'
    html += "<br>\n"
    bad_m = re.search(r"## Что плохо замораживается\n\n(.*?)$", text, re.DOTALL)
    if bad_m:
        for line in bad_m.group(1).strip().split("\n"):
            if line.startswith("- ❌"):
                html += f'<div class="freeze-bad">{line[2:].strip()}</div>\n'
    html += "</div>\n"

    return html


# ─── СПИСОК ПОКУПОК ───────────────────────────────────────────────────────────

def build_shop():
    text = read(EDA / "список_покупок.md")
    html = '<div class="card">\n<h2>Список покупок</h2>\n'

    idx = 0
    has_items = False

    for line in text.split("\n"):
        if line.startswith("## "):
            section = line[3:].strip()
            html += f'<div class="shop-section">{section}</div>\n'
        elif line.startswith("- ["):
            item_text = re.sub(r"^- \[[ xX]\]\s*", "", line).strip()
            if not item_text:
                continue
            checked = line.startswith("- [x]") or line.startswith("- [X]")
            idx += 1
            checked_attr = " checked" if checked else ""
            checked_class = " checked" if checked else ""
            html += (
                f'<div class="shop-item{checked_class}" id="si{idx}">'
                f'<input type="checkbox" id="c{idx}"{checked_attr} onchange="toggleItem(\'si{idx}\')">'
                f'<label for="c{idx}">{item_text}</label></div>\n'
            )
            has_items = True

    if not has_items:
        html += '<p style="color:#aaa; font-size:13px; padding:8px 0;">Список пуст — составляется вместе с планом</p>\n'

    html += '<button class="clear-btn" onclick="clearAll()">✓ Очистить список</button>\n'
    html += "</div>\n"
    return html


# ─── ПЛАН НЕДЕЛИ ──────────────────────────────────────────────────────────────

def build_plan():
    text = read(EDA / "план_недели.md")
    html = '<div class="tip">3 готовки в неделю · ~1–1.5 часа каждая · часть сразу в заморозку</div>\n'

    sessions = re.findall(
        r"## (Готовка\s*\d+[^\n]*)\n(.*?)(?=\n## |\Z)", text, re.DOTALL
    )

    if not sessions:
        for i, day in enumerate(["воскресенье", "вторник", "четверг"], 1):
            html += f'<div class="plan-block"><h3>🟠 Готовка {i} ({day})</h3><p>Пока не заполнено</p></div>\n'
        return html

    for title, body in sessions:
        html += f'<div class="plan-block">\n<h3>🟠 {title.strip()}</h3>\n'

        cooking_m = re.search(r"\*\*Что готовим:\*\*\n(.*?)(?=\*\*|---|\Z)", body, re.DOTALL)
        if cooking_m:
            items = [
                re.sub(r"^- \[[ xX]\]\s*", "", l).strip()
                for l in cooking_m.group(1).split("\n")
                if l.strip().startswith("- [")
            ]
            items = [i for i in items if i]
            if items:
                html += '<ul style="margin:4px 0 4px 16px; font-size:13px; color:#444;">\n'
                for item in items:
                    html += f"<li>{item}</li>\n"
                html += "</ul>\n"
            else:
                html += "<p>Пока не заполнено</p>\n"
        else:
            html += "<p>Пока не заполнено</p>\n"

        for label in ["В холодильник", "В заморозку"]:
            m = re.search(rf"\*\*{label}:\*\*(.+?)(?=\*\*|---|\Z)", body, re.DOTALL)
            if m:
                val = m.group(1).strip()
                if val:
                    html += f'<p style="font-size:12px; color:#777; margin-top:3px;"><b>{label}:</b> {val}</p>\n'

        html += "</div>\n"

    return html


# ─── РЕЦЕПТЫ ──────────────────────────────────────────────────────────────────

EMOJI_MAP = {
    "панкейки_йогурт": "🥞",
    "панкейки_коттедж": "🥞",
    "мясные_шарики": "🍖",
    "куриное_филе": "🍗",
    "куриная_печень": "🫀",
    "лосось": "🐟",
    "запечённые_овощи": "🥦",
    "заливной_пирог": "🥧",
    "запеканка": "🍰",
}

def get_emoji(stem):
    for key, emoji in EMOJI_MAP.items():
        if key in stem.lower():
            return emoji
    return "🍽️"

def parse_recipe_body(content):
    """Парсит тело рецепта (после первого ---) в HTML"""
    parts = content.split("---", 1)
    body = parts[1] if len(parts) > 1 else parts[0]

    html = ""
    ul_items = []
    ol_items = []

    def flush():
        nonlocal html, ul_items, ol_items
        if ul_items:
            html += "<ul>\n" + "".join(f"<li>{i}</li>\n" for i in ul_items) + "</ul>\n"
            ul_items = []
        if ol_items:
            html += "<ol>\n" + "".join(f"<li>{i}</li>\n" for i in ol_items) + "</ol>\n"
            ol_items = []

    for line in body.split("\n"):
        s = line.strip()
        if not s or s == "---":
            flush()
        elif s.startswith("## "):
            flush()
            html += f"<h4>{s[3:].strip()}</h4>\n"
        elif s.startswith("- ") and not s.startswith("- ["):
            if ol_items:
                flush()
            ul_items.append(bold(s[2:]))
        elif re.match(r"^\d+\.", s):
            if ul_items:
                flush()
            ol_items.append(bold(re.sub(r"^\d+\.\s*", "", s)))
        elif s.startswith("_(") and s.endswith(")_"):
            pass  # пропускаем заметки-шаблоны
        elif s:
            flush()
            text_html = bold(s)
            if any(m in s for m in ["💡", "⚠️", "❄️"]):
                html += f'<div class="warn">{text_html}</div>\n'
            elif not s.startswith("_"):
                html += f'<p style="font-size:13px; color:#555; margin:4px 0;">{text_html}</p>\n'

    flush()
    return html

def build_recepty():
    recipes_dir = EDA / "рецепты"
    html = '<div class="card">\n<h2>Рецепты — нажми чтобы открыть</h2>\n'

    for idx, path in enumerate(sorted(recipes_dir.glob("*.md")), 1):
        r_id = f"r{idx}"
        content = read(path)
        lines = content.split("\n")

        # Заголовок
        title_line = next((l for l in lines if l.startswith("# ")), path.stem)
        title = re.sub(r"^# ", "", title_line).strip()
        verified = "✅ Проверено" in title
        title = title.replace("✅ Проверено", "").replace("✅", "").strip()

        # Метаданные
        time_m = re.search(r"\*\*Время:\*\*\s*(.+)", content)
        time_str = time_m.group(1).strip() if time_m else ""
        freeze_m = re.search(r"\*\*Подходит для заморозки:\*\*\s*(.+)", content)
        freeze_ok = freeze_m and "✅" in freeze_m.group(1)

        meta = []
        if time_str:
            meta.append(time_str)
        if freeze_ok:
            meta.append("✅ в заморозку")
        if verified:
            meta.append("✅ Проверено")

        emoji = get_emoji(path.stem)
        body_html = parse_recipe_body(content)

        html += f"""<div class="recipe-item">
  <div class="recipe-header" onclick="toggleRecipe('{r_id}')">
    <div>
      <div class="recipe-title">{emoji} {title}</div>
      <div class="recipe-time">{" · ".join(meta)}</div>
    </div>
    <div class="recipe-arrow" id="arr-{r_id}">›</div>
  </div>
  <div class="recipe-body" id="{r_id}">
{body_html}  </div>
</div>
"""

    html += "</div>\n"
    html += """<div class="card">
<h2>Подсказки</h2>
<table>
  <tr><td>🍬 Сахарозаменитель</td><td>в 10 раз слаще — брать в 10 раз меньше</td></tr>
  <tr><td>🌡️ Аэрогриль</td><td>205°C, 12–16 мин</td></tr>
  <tr><td>🥞 Панкейки</td><td>переворачивать когда верх матовый + пузырьки</td></tr>
  <tr><td>🧂 Печень</td><td>солить только в конце!</td></tr>
</table>
</div>
"""
    return html


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    html_path = BASE / "index.html"
    print("📖 Читаем index.html...")
    html = read(html_path)

    sections = {
        "PLAN":      build_plan,
        "SHOP":      build_shop,
        "ZAPASY":    build_zapasy,
        "MOROZILKA": build_morozilka,
        "RECEPTY":   build_recepty,
    }

    for name, builder in sections.items():
        print(f"⚙️  Обновляем {name}...")
        html = replace_section(html, name, builder())

    write(html_path, html)
    print("✅ index.html успешно обновлён!")
    print("💡 Открой index.html в браузере чтобы проверить")

if __name__ == "__main__":
    main()

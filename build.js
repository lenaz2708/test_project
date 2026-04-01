#!/usr/bin/env node
// build.js — читает .md файлы из папки Еда/ и обновляет index.html
// Запуск: node build.js

const fs = require("fs");
const path = require("path");

const BASE = __dirname;
const EDA = path.join(BASE, "Еда");

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function read(filePath) {
  return fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
}

function write(filePath, text) {
  fs.writeFileSync(filePath, text, "utf-8");
}

function replaceSection(html, name, content) {
  const start = `<!-- BUILD:${name} -->`;
  const end = `<!-- /BUILD:${name} -->`;
  const startIdx = html.indexOf(start);
  const endIdx = html.indexOf(end);
  if (startIdx === -1 || endIdx === -1) {
    console.log(`  ⚠️  Маркер BUILD:${name} не найден в index.html`);
    return html;
  }
  return (
    html.slice(0, startIdx) +
    start + "\n" + content.trim() + "\n" + end +
    html.slice(endIdx + end.length)
  );
}

function bold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

function parseMdTable(text) {
  // Возвращает строки данных (без заголовка и разделителя)
  const lines = text.trim().split("\n").filter(l => l.startsWith("|"));
  const rows = lines
    .map(l => l.replace(/^\||\|$/g, "").split("|").map(c => c.trim()))
    .filter(cells => !cells.every(c => /^[-: ]+$/.test(c)));
  return rows.slice(1); // убираем заголовок
}


// ─── ЗАПАСЫ ───────────────────────────────────────────────────────────────────

function badge(amount) {
  if (!amount) return amount;
  if (amount.startsWith("✅")) {
    const val = amount.slice(1).trim();
    return `<span class="badge ok">${val}</span>`;
  }
  if (amount.startsWith("❌") || amount.startsWith("⚠️")) {
    const val = amount.replace(/^[❌⚠️]\s*/, "");
    return `<span class="badge low">${val}</span>`;
  }
  return `<span class="badge ok">${amount}</span>`;
}

function buildZapasy() {
  const text = read(path.join(EDA, "запасы_продуктов.md"));
  let html = "";

  const dateM = text.match(/_Обновлено:\s*(.+?)_/);
  const updated = dateM ? dateM[1] : "";

  // Разбиваем по ## секциям
  const parts = text.split(/\n## (.+?)\n/);
  // parts: [вступление, заголовок1, контент1, заголовок2, контент2, ...]

  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    const content = parts[i + 1] || "";

    let rows = parseMdTable(content);
    rows = rows.filter(r => r.length >= 2 && r[0].trim());

    if (rows.length === 0) continue;

    html += `<div class="card">\n<h2>${title}</h2>\n<table>\n`;
    html += "<tr><th>Продукт</th><th>Количество</th></tr>\n";
    for (const row of rows) {
      html += `<tr><td>${row[0]}</td><td>${badge(row[1] || "")}</td></tr>\n`;
    }
    html += "</table>\n</div>\n";
  }

  if (updated) {
    html += `<p class="updated">Обновлено: ${updated}</p>\n`;
  }

  return html;
}


// ─── МОРОЗИЛКА ────────────────────────────────────────────────────────────────

function buildMorozilka() {
  const text = read(path.join(EDA, "заморозка_готовое.md"));
  let html = "";

  // Готовые блюда
  html += `<div class="card">\n<h2>Готовые блюда</h2>\n`;
  const tableM = text.match(/## Что сейчас есть\n\n([\s\S]*?)\n---/);
  if (tableM) {
    let rows = parseMdTable(tableM[1]);
    rows = rows.filter(r => r && r[0].trim());
    if (rows.length > 0) {
      html += "<table>\n<tr><th>Блюдо</th><th>Порций</th><th>Дата</th><th>Заметки</th></tr>\n";
      for (const row of rows) {
        const cells = [...row, "", "", "", ""].slice(0, 4);
        html += "<tr>" + cells.map(c => `<td>${c}</td>`).join("") + "</tr>\n";
      }
      html += "</table>\n";
    } else {
      html += `<p style="color:#aaa; font-size:14px; padding:8px 0;">Пока пусто — заполни после первой готовки!</p>\n`;
    }
  }
  html += "</div>\n";

  // Что замораживается
  html += `<div class="card">\n<h2>Что хорошо замораживается</h2>\n`;
  const goodM = text.match(/## Что хорошо замораживается\n\n([\s\S]*?)(?=\n## )/);
  if (goodM) {
    for (const line of goodM[1].trim().split("\n")) {
      if (line.startsWith("- ✅")) {
        html += `<div class="freeze-good">${line.slice(2).trim()}</div>\n`;
      }
    }
  }
  html += "<br>\n";
  const badM = text.match(/## Что плохо замораживается\n\n([\s\S]*?)$/);
  if (badM) {
    for (const line of badM[1].trim().split("\n")) {
      if (line.startsWith("- ❌")) {
        html += `<div class="freeze-bad">${line.slice(2).trim()}</div>\n`;
      }
    }
  }
  html += "</div>\n";

  return html;
}


// ─── СПИСОК ПОКУПОК ───────────────────────────────────────────────────────────

function buildShop() {
  const text = read(path.join(EDA, "список_покупок.md"));
  let html = `<div class="card">\n<h2>Список покупок</h2>\n`;

  let idx = 0;
  let hasItems = false;

  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      const section = line.slice(3).trim();
      html += `<div class="shop-section">${section}</div>\n`;
    } else if (line.startsWith("- [")) {
      const itemText = line.replace(/^- \[[ xX]\]\s*/, "").trim();
      if (!itemText) continue;
      const checked = line.startsWith("- [x]") || line.startsWith("- [X]");
      idx++;
      const checkedAttr = checked ? " checked" : "";
      const checkedClass = checked ? " checked" : "";
      html +=
        `<div class="shop-item${checkedClass}" id="si${idx}">` +
        `<input type="checkbox" id="c${idx}"${checkedAttr} onchange="toggleItem('si${idx}')">` +
        `<label for="c${idx}">${itemText}</label></div>\n`;
      hasItems = true;
    }
  }

  if (!hasItems) {
    html += `<p style="color:#aaa; font-size:13px; padding:8px 0;">Список пуст — составляется вместе с планом</p>\n`;
  }

  html += `<button class="clear-btn" onclick="clearAll()">✓ Очистить список</button>\n`;
  html += "</div>\n";
  return html;
}


// ─── ПЛАН НЕДЕЛИ ──────────────────────────────────────────────────────────────

function buildPlan() {
  const text = read(path.join(EDA, "план_недели.md"));
  let html = `<div class="tip">3 готовки в неделю · ~1–1.5 часа каждая · часть сразу в заморозку</div>\n`;

  const sessions = [...text.matchAll(/## (Готовка\s*\d+[^\n]*)\n([\s\S]*?)(?=\n## |\n*$)/g)];

  if (sessions.length === 0) {
    for (const [i, day] of ["воскресенье", "вторник", "четверг"].entries()) {
      html += `<div class="plan-block"><h3>🟠 Готовка ${i + 1} (${day})</h3><p>Пока не заполнено</p></div>\n`;
    }
    return html;
  }

  for (const [, title, body] of sessions) {
    html += `<div class="plan-block">\n<h3>🟠 ${title.trim()}</h3>\n`;

    const cookingM = body.match(/\*\*Что готовим:\*\*\n([\s\S]*?)(?=\*\*|---|\s*$)/);
    if (cookingM) {
      const items = cookingM[1]
        .split("\n")
        .filter(l => l.trim().startsWith("- ["))
        .map(l => l.replace(/^- \[[ xX]\]\s*/, "").trim())
        .filter(Boolean);
      if (items.length > 0) {
        html += `<ul style="margin:4px 0 4px 16px; font-size:13px; color:#444;">\n`;
        for (const item of items) html += `<li>${item}</li>\n`;
        html += "</ul>\n";
      } else {
        html += "<p>Пока не заполнено</p>\n";
      }
    } else {
      html += "<p>Пока не заполнено</p>\n";
    }

    for (const label of ["В холодильник", "В заморозку"]) {
      const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*([\\s\\S]*?)(?=\\*\\*|---|\\s*$)`));
      if (m) {
        const val = m[1].trim();
        if (val) {
          html += `<p style="font-size:12px; color:#777; margin-top:3px;"><b>${label}:</b> ${val}</p>\n`;
        }
      }
    }

    html += "</div>\n";
  }

  return html;
}


// ─── РЕЦЕПТЫ ──────────────────────────────────────────────────────────────────

const EMOJI_MAP = {
  "панкейки_йогурт": "🥞",
  "панкейки_коттедж": "🥞",
  "мясные_шарики": "🍖",
  "куриное_филе": "🍗",
  "куриная_печень": "🫀",
  "лосось": "🐟",
  "запечённые_овощи": "🥦",
  "заливной_пирог": "🥧",
  "запеканка": "🍰",
};

function getEmoji(stem) {
  for (const [key, emoji] of Object.entries(EMOJI_MAP)) {
    if (stem.toLowerCase().includes(key)) return emoji;
  }
  return "🍽️";
}

function parseRecipeBody(content) {
  const parts = content.split("---");
  const body = parts.length > 1 ? parts.slice(1).join("---") : parts[0];

  let html = "";
  let ulItems = [];
  let olItems = [];

  function flush() {
    if (ulItems.length > 0) {
      html += "<ul>\n" + ulItems.map(i => `<li>${i}</li>\n`).join("") + "</ul>\n";
      ulItems = [];
    }
    if (olItems.length > 0) {
      html += "<ol>\n" + olItems.map(i => `<li>${i}</li>\n`).join("") + "</ol>\n";
      olItems = [];
    }
  }

  for (const line of body.split("\n")) {
    const s = line.trim();
    if (!s || s === "---") {
      flush();
    } else if (s.startsWith("## ")) {
      flush();
      html += `<h4>${s.slice(3).trim()}</h4>\n`;
    } else if (s.startsWith("- ") && !s.startsWith("- [")) {
      if (olItems.length > 0) flush();
      ulItems.push(bold(s.slice(2)));
    } else if (/^\d+\./.test(s)) {
      if (ulItems.length > 0) flush();
      olItems.push(bold(s.replace(/^\d+\.\s*/, "")));
    } else if (s.startsWith("_(") && s.endsWith(")_")) {
      // пропускаем заметки-шаблоны
    } else if (s) {
      flush();
      const textHtml = bold(s);
      if (["💡", "⚠️", "❄️"].some(m => s.includes(m))) {
        html += `<div class="warn">${textHtml}</div>\n`;
      } else if (!s.startsWith("_")) {
        html += `<p style="font-size:13px; color:#555; margin:4px 0;">${textHtml}</p>\n`;
      }
    }
  }
  flush();
  return html;
}

function buildRecepty() {
  const recipesDir = path.join(EDA, "рецепты");
  let html = `<div class="card">\n<h2>Рецепты — нажми чтобы открыть</h2>\n`;

  const files = fs.readdirSync(recipesDir)
    .filter(f => f.endsWith(".md"))
    .sort();

  files.forEach((file, index) => {
    const rId = `r${index + 1}`;
    const content = read(path.join(recipesDir, file));
    const lines = content.split("\n");
    const stem = path.basename(file, ".md");

    // Заголовок
    const titleLine = lines.find(l => l.startsWith("# ")) || stem;
    let title = titleLine.replace(/^# /, "").trim();
    const verified = title.includes("✅ Проверено");
    title = title.replace("✅ Проверено", "").replace("✅", "").trim();

    // Метаданные
    const timeM = content.match(/\*\*Время:\*\*\s*(.+)/);
    const timeStr = timeM ? timeM[1].trim() : "";
    const freezeM = content.match(/\*\*Подходит для заморозки:\*\*\s*(.+)/);
    const freezeOk = freezeM && freezeM[1].includes("✅");

    const meta = [];
    if (timeStr) meta.push(timeStr);
    if (freezeOk) meta.push("✅ в заморозку");
    if (verified) meta.push("✅ Проверено");

    const emoji = getEmoji(stem);
    const bodyHtml = parseRecipeBody(content);

    html += `<div class="recipe-item">
  <div class="recipe-header" onclick="toggleRecipe('${rId}')">
    <div>
      <div class="recipe-title">${emoji} ${title}</div>
      <div class="recipe-time">${meta.join(" · ")}</div>
    </div>
    <div class="recipe-arrow" id="arr-${rId}">›</div>
  </div>
  <div class="recipe-body" id="${rId}">
${bodyHtml}  </div>
</div>\n`;
  });

  html += `</div>\n`;
  html += `<div class="card">
<h2>Подсказки</h2>
<table>
  <tr><td>🍬 Сахарозаменитель</td><td>в 10 раз слаще — брать в 10 раз меньше</td></tr>
  <tr><td>🌡️ Аэрогриль</td><td>205°C, 12–16 мин</td></tr>
  <tr><td>🥞 Панкейки</td><td>переворачивать когда верх матовый + пузырьки</td></tr>
  <tr><td>🧂 Печень</td><td>солить только в конце!</td></tr>
</table>
</div>\n`;

  return html;
}


// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  const htmlPath = path.join(BASE, "index.html");
  console.log("📖 Читаем index.html...");
  let html = read(htmlPath);

  const sections = {
    PLAN:      buildPlan,
    SHOP:      buildShop,
    ZAPASY:    buildZapasy,
    MOROZILKA: buildMorozilka,
    RECEPTY:   buildRecepty,
  };

  for (const [name, builder] of Object.entries(sections)) {
    console.log(`⚙️  Обновляем ${name}...`);
    html = replaceSection(html, name, builder());
  }

  write(htmlPath, html);
  console.log("✅ index.html успешно обновлён!");
  console.log("💡 Открой index.html в браузере чтобы проверить");
}

main();

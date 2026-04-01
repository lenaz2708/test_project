#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const baseDir = __dirname;
const dataDir = path.join(baseDir, "Еда");
const recipesDir = path.join(dataDir, "рецепты");
const indexPath = path.join(baseDir, "index.html");
const logPath = path.join(dataDir, "лог_движения.csv");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInline(text) {
  let value = escapeHtml(String(text).trim());
  value = value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/`(.+?)`/g, "<code>$1</code>");
  return value;
}

function replaceSection(document, section, content) {
  const start = `<!-- BUILD:${section} -->`;
  const end = `<!-- /BUILD:${section} -->`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!pattern.test(document)) {
    throw new Error(`Missing build markers for ${section}`);
  }
  const replacement = `${start}\n${content.trim()}\n${end}`;
  return document.replace(pattern, replacement);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTable(block) {
  const rows = [];
  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    if (cells.every((cell) => /^[-: ]*$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows.length > 1 ? rows.slice(1) : [];
}

function parseSections(text) {
  const matches = [...text.matchAll(/^##\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return [match[1].trim(), text.slice(start, end).trim()];
  });
}

function firstItalicMeta(text) {
  for (const line of text.split("\n")) {
    const value = line.trim();
    if (value.startsWith("_") && value.endsWith("_") && value.length > 2) {
      return value.slice(1, -1);
    }
  }
  return "";
}

function buildPlan() {
  const text = readText(path.join(dataDir, "план_недели.md"));
  const sections = parseSections(text);
  const cards = [];

  const tip = '<div class="tip">План собирается из markdown-файла недели. Обнови записи в папке Еда и снова запусти сборку.</div>';

  for (const [title, body] of sections) {
    if (!title.toLowerCase().startsWith("готовка")) continue;
    const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
    const items = lines
      .filter((line) => line.startsWith("- ["))
      .map((line) => formatInline(line.replace(/^- \[[ xX]\]\s*/, "")));
    const notes = lines
      .filter((line) => !line.startsWith("- [") && !line.startsWith("---"))
      .map((line) => formatInline(line));
    const listHtml = items.length
      ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
      : "<p>Пока ничего не запланировано.</p>";
    const notesHtml = notes.map((note) => `<p class="plan-note">${note}</p>`).join("");
    cards.push(`<div class="plan-block"><h3>${formatInline(title)}</h3>${listHtml}${notesHtml}</div>`);
  }

  if (!cards.length) {
    cards.push('<div class="plan-block"><h3>Готовка</h3><p>План пока пуст.</p></div>');
  }

  return `${tip}\n${cards.join("\n")}`;
}

function buildShop() {
  const text = readText(path.join(dataDir, "список_покупок.md"));
  const parts = ['<div class="card">', "<h2>Список покупок</h2>"];
  let itemId = 0;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      parts.push(`<div class="shop-section">${formatInline(line.slice(3))}</div>`);
      continue;
    }
    if (!line.startsWith("- [")) continue;
    const label = line.replace(/^- \[[ xX]\]\s*/, "").trim();
    if (!label) continue;
    itemId += 1;
    parts.push(
      `<label class="shop-item" data-shop-item="${itemId}">` +
      `<input type="checkbox" data-shop-checkbox="${itemId}">` +
      `<span>${formatInline(label)}</span>` +
      "</label>"
    );
  }

  if (!itemId) {
    parts.push('<p class="empty-state">Список пуст. Добавь пункты в markdown-файл.</p>');
  }

  parts.push('<button class="clear-btn" type="button" id="clear-shopping">Очистить отметки</button>');
  parts.push("</div>");
  return parts.join("\n");
}

function badgeClass(amount) {
  const lowered = amount.toLowerCase();
  return ["мало", "заканч", "нужно"].some((token) => lowered.includes(token)) ? "low" : "ok";
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}

function buildInventoryLogCard() {
  if (!fs.existsSync(logPath)) return "";
  const lines = readText(logPath).split("\n").map((line) => line.trim()).filter(Boolean);
  const rows = lines
    .slice(1)
    .map(parseCsvLine)
    .filter((row) => row.length >= 6)
    .map((row) => ({
      date: row[0].trim(),
      product: row[1].trim(),
      type: row[2].trim(),
      amount: row[3].trim(),
      unit: row[4].trim(),
    }));

  if (!rows.length) return "";

  const body = rows.slice(-5).reverse().map((row) => (
    "<tr>" +
    `<td>${escapeHtml(row.date)}</td>` +
    `<td>${formatInline(row.product)}</td>` +
    `<td>${formatInline(row.type)}</td>` +
    `<td>${formatInline([row.amount, row.unit].filter(Boolean).join(" "))}</td>` +
    "</tr>"
  )).join("");

  return '<div class="card"><h2>Последние изменения</h2><table><tr><th>Дата</th><th>Продукт</th><th>Действие</th><th>Количество</th></tr>' + body + "</table></div>";
}

function buildZapasy() {
  const text = readText(path.join(dataDir, "запасы_продуктов.md"));
  const cards = [];

  for (const [title, body] of parseSections(text)) {
    const rows = parseTable(body);
    if (!rows.length) continue;
    const bodyRows = rows.map((row) => {
      const product = row[0] || "";
      const amount = row[1] || "";
      return "<tr>" +
        `<td>${formatInline(product)}</td>` +
        `<td><span class="badge ${badgeClass(amount)}">${formatInline(amount)}</span></td>` +
        "</tr>";
    }).join("");
    cards.push(`<div class="card"><h2>${formatInline(title)}</h2><table><tr><th>Продукт</th><th>Количество</th></tr>${bodyRows}</table></div>`);
  }

  const logCard = buildInventoryLogCard();
  if (logCard) cards.push(logCard);
  return cards.join("\n");
}

function buildMorozilka() {
  const text = readText(path.join(dataDir, "заморозка_готовое.md"));
  const sections = parseSections(text);
  const cards = [];
  let currentRows = [];
  const goodItems = [];
  const badItems = [];

  for (const [, body] of sections) {
    const rows = parseTable(body);
    if (rows.length && !currentRows.length) {
      currentRows = rows;
      continue;
    }
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("- ")) continue;
      const item = formatInline(line.slice(2));
      if (line.includes("✅") || line.toLowerCase().includes("можно")) {
        goodItems.push(item);
      } else {
        badItems.push(item);
      }
    }
  }

  if (currentRows.length) {
    const rowsHtml = currentRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => "<tr>" + row.slice(0, 4).map((cell) => `<td>${formatInline(cell)}</td>`).join("") + "</tr>")
      .join("");
    cards.push('<div class="card"><h2>Готовые блюда</h2><table><tr><th>Блюдо</th><th>Порций</th><th>Дата</th><th>Заметки</th></tr>' + rowsHtml + "</table></div>");
  } else {
    cards.push('<div class="card"><h2>Готовые блюда</h2><p class="empty-state">Пока ничего не заморожено.</p></div>');
  }

  const tips = ['<div class="card"><h2>Памятка</h2>'];
  goodItems.forEach((item) => tips.push(`<div class="freeze-good">${item}</div>`));
  if (goodItems.length && badItems.length) tips.push("<br>");
  badItems.forEach((item) => tips.push(`<div class="freeze-bad">${item}</div>`));
  tips.push("</div>");
  cards.push(tips.join("\n"));

  return cards.join("\n");
}

function extractRecipeMeta(lines) {
  const meta = firstItalicMeta(lines.join("\n"));
  if (meta) return formatInline(meta);
  for (const line of lines) {
    const value = line.trim();
    const match = value.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (match) {
      return formatInline(match[2]);
    }
  }
  return "";
}

function markdownToHtml(text) {
  const output = [];
  let listType = null;

  function closeList() {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line === "---") {
      closeList();
      continue;
    }
    if (line.startsWith("# ")) continue;
    if (line.startsWith("_") && line.endsWith("_")) continue;
    if (line.startsWith("## ")) {
      closeList();
      output.push(`<h4>${formatInline(line.slice(3))}</h4>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (listType !== "ol") {
        closeList();
        output.push("<ol>");
        listType = "ol";
      }
      output.push(`<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (listType !== "ul") {
        closeList();
        output.push("<ul>");
        listType = "ul";
      }
      output.push(`<li>${formatInline(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    const className = ["Важно", "Совет", "Примечание", "⚠"].some((token) => line.includes(token)) ? ' class="warn"' : "";
    output.push(`<p${className}>${formatInline(line)}</p>`);
  }

  closeList();
  return output.join("\n");
}

function recipeEmoji(name) {
  const lowered = name.toLowerCase();
  const mapping = [
    ["панкей", "🥞"],
    ["лосос", "🐟"],
    ["овощ", "🥕"],
    ["филе", "🍗"],
    ["печень", "🫕"],
    ["шарик", "🍖"],
    ["пирог", "🥧"],
    ["запекан", "🍲"],
  ];
  const found = mapping.find(([key]) => lowered.includes(key));
  return found ? found[1] : "🍽️";
}

function buildRecepty() {
  const parts = ['<div class="card">', "<h2>Рецепты</h2>"];
  const recipeFiles = fs.readdirSync(recipesDir).filter((file) => file.endsWith(".md")).sort();

  recipeFiles.forEach((file, index) => {
    const text = readText(path.join(recipesDir, file));
    const lines = text.split("\n");
    const titleLine = lines.find((line) => line.startsWith("# "));
    const title = titleLine ? titleLine.slice(2).trim() : path.basename(file, ".md").replace(/_/g, " ");
    const meta = extractRecipeMeta(lines);
    const bodyHtml = markdownToHtml(text);
    const icon = recipeEmoji(title);
    parts.push(
      '<article class="recipe-item">' +
      `<button class="recipe-header" type="button" data-recipe-trigger="${index + 1}" aria-expanded="false" aria-controls="recipe-${index + 1}">` +
      '<span class="recipe-heading">' +
      `<span class="recipe-title">${icon} ${formatInline(title)}</span>` +
      `<span class="recipe-time">${meta}</span>` +
      "</span>" +
      '<span class="recipe-arrow" aria-hidden="true">›</span>' +
      "</button>" +
      `<div class="recipe-body" id="recipe-${index + 1}" data-recipe-body="${index + 1}" hidden>${bodyHtml}</div>` +
      "</article>"
    );
  });

  if (!recipeFiles.length) {
    parts.push('<p class="empty-state">В папке рецептов пока нет файлов.</p>');
  }

  parts.push("</div>");
  return parts.join("\n");
}

function main() {
  let document = readText(indexPath);
  document = replaceSection(document, "PLAN", buildPlan());
  document = replaceSection(document, "SHOP", buildShop());
  document = replaceSection(document, "ZAPASY", buildZapasy());
  document = replaceSection(document, "MOROZILKA", buildMorozilka());
  document = replaceSection(document, "RECEPTY", buildRecepty());
  writeText(indexPath, document);
  console.log("index.html rebuilt from markdown sources");
}

main();


import fs from "node:fs";

const csv = fs.readFileSync("public/mentors.csv", "utf8");

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  const headers = rows.shift().map((h) => h.replace(/^\uFEFF/, "").trim());

  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, i) => [header, (values[i] ?? "").trim()])
    )
  );
}

const mentors = parseCSV(csv)
  .filter((row) => row["Mentor ID"])
  .map((row) => ({
    mentor_id: row["Mentor ID"],
    profile: row,
  }));

console.log(`Found ${mentors.length} mentor records.`);

fs.writeFileSync(
  "mentors-import.json",
  JSON.stringify(mentors, null, 2)
);

console.log("Created mentors-import.json in the project root.");

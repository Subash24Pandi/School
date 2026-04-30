const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const pdfPath = path.join(__dirname, "students.pdf");

async function debug() {
  const buffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(buffer);

  const lines = pdfData.text
    .split("\n")
    .map(x => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  console.log("Total lines:", lines.length);

  console.log("\n--- FIRST 80 LINES ---");
  lines.slice(0, 80).forEach((line, index) => {
    console.log(index + 1, "=>", line);
  });

  console.log("\n--- LINES WITH EMAIL ---");
  lines
    .filter(line => line.includes("@"))
    .slice(0, 30)
    .forEach((line, index) => {
      console.log(index + 1, "=>", line);
    });
}

debug();
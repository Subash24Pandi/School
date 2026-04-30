const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { MongoClient } = require("mongodb");

const uri =
  "mongodb+srv://TheAitel:theaitel2025@cluster0.vl95v.mongodb.net/school_students_db?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri);
const pdfPath = path.join(__dirname, "students.pdf");

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function detectSchool(line) {
  if (line.includes("Sidhartha Public School")) return "Sidhartha Public School";
  if (line.includes("Orchids International School")) return "Orchids International School";
  if (line.includes("Innovera Public School") || line.includes("CHE")) return "Innovera Public School - CHE Chennai";
  if (line.includes("Innovera") && (line.includes("CBE") || line.includes("Coimbatore"))) return "Innovera CBE Coimbatore";
  return null;
}

function extractEmails(afterGender) {
  const compact = afterGender.replace(/\s+/g, "");

  const domains = [
    "innoveracbe.in",
    "innovera.in",
    "orchids.in",
    "sps.in",
    "ips.in",
    "csadamy.in",
    "nachiar"
  ];

  for (const domain of domains) {
    const marker = "@" + domain;
    if (!compact.includes(marker)) continue;

    const firstEnd = compact.indexOf(marker) + marker.length;
    const firstEmail = compact.slice(0, firstEnd);

    const remaining = compact.slice(firstEnd);
    let secondEmail = firstEmail;

    if (remaining.includes(marker)) {
      const secondEnd = remaining.indexOf(marker) + marker.length;
      secondEmail = remaining.slice(0, secondEnd);
    }

    return {
      emailId: firstEmail,
      loginId: secondEmail
    };
  }

  return null;
}

function parseStudents(text) {
  const lines = text.split("\n").map(clean).filter(Boolean);
  const students = [];
  let currentSchool = "";

  const stdSecRegex = /(XII|XI|VIII|VII|VI|IX|IV|III|X|V)([A-Z])/;

  for (const line of lines) {
    const school = detectSchool(line);
    if (school) {
      currentSchool = school;
      continue;
    }

    if (
      line.includes("First Name") ||
      line.includes("Combined Student Database") ||
      line.includes("All Schools") ||
      line.includes("Note on Roll Numbers")
    ) {
      continue;
    }

    const genderMatch = line.match(/(Male|Female)/);
    if (!genderMatch || !currentSchool) continue;

    const gender = genderMatch[1];
    const beforeGender = clean(line.slice(0, genderMatch.index));
    const afterGender = clean(line.slice(genderMatch.index + gender.length));

    const emailData = extractEmails(afterGender);
    if (!emailData) continue;

    const stdMatch = beforeGender.match(stdSecRegex);
    if (!stdMatch) continue;

    const stdSec = stdMatch[0];
    const std = stdMatch[1];
    const sec = stdMatch[2];

    const splitIndex = beforeGender.indexOf(stdSec);
    const namePart = clean(beforeGender.slice(0, splitIndex).replace(/\./g, " "));

    // Roll number WITH section, exactly like PDF style
    const rollNoSpoken = clean(
      beforeGender
        .slice(splitIndex + stdSec.length)
        .replace(/"/g, "")
    );

    const nameParts = namePart.split(" ").filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || ".";

    students.push({
      schoolName: currentSchool,
      firstName,
      lastName,
      std,
      sec,
      rollNoSpoken,
      gender,
      emailId: emailData.emailId,
      loginId: emailData.loginId
    });
  }

  return students;
}

function groupBySchool(students) {
  const map = {};

  for (const s of students) {
    if (!map[s.schoolName]) {
      map[s.schoolName] = {
        schoolName: s.schoolName,
        totalStudents: 0,
        classes: {}
      };
    }

    if (!map[s.schoolName].classes[s.std]) {
      map[s.schoolName].classes[s.std] = {};
    }

    if (!map[s.schoolName].classes[s.std][s.sec]) {
      map[s.schoolName].classes[s.std][s.sec] = [];
    }

    map[s.schoolName].classes[s.std][s.sec].push({
      firstName: s.firstName,
      lastName: s.lastName,
      std: s.std,
      sec: s.sec,
      rollNoSpoken: s.rollNoSpoken,
      gender: s.gender,
      emailId: s.emailId,
      loginId: s.loginId
    });

    map[s.schoolName].totalStudents++;
  }

  return Object.values(map);
}

async function run() {
  try {
    console.log("Reading PDF...");

    if (!fs.existsSync(pdfPath)) {
      console.log("students.pdf not found");
      return;
    }

    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(buffer);

    const students = parseStudents(pdfData.text);

    console.log("Total parsed:", students.length);
    console.log("Sample:", students[0]);

    if (students.length === 0) {
      console.log("Parsing failed. DB not changed.");
      return;
    }

    await client.connect();
    console.log("MongoDB connected ✅");

    const db = client.db("school_students_db");

    await db.collection("students").deleteMany({});
    await db.collection("schools").deleteMany({});

    await db.collection("students").insertMany(students);

    const grouped = groupBySchool(students);
    await db.collection("schools").insertMany(grouped);

    console.log(`${students.length} students inserted ✅`);
    console.log(`${grouped.length} school-wise records inserted ✅`);
    console.log("Done 🔥");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
    console.log("Connection closed");
  }
}

run();
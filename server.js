const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.static("public"));

const uri =
  "mongodb+srv://TheAitel:theaitel2025@cluster0.vl95v.mongodb.net/school_students_db?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri);

function norm(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function studentName(s) {
  return `${s.firstName || ""} ${s.lastName || ""}`.replace(" .", "").trim();
}

function detectField(q) {
  q = String(q || "").toLowerCase();

  if (q.includes("email")) return "emailId";
  if (q.includes("login")) return "loginId";
  if (q.includes("roll")) return "rollNoSpoken";
  if (q.includes("gender")) return "gender";
  if (q.includes("school")) return "schoolName";
  if (q.includes("first name")) return "firstName";
  if (q.includes("last name")) return "lastName";
  if (q.includes("class") || q.includes("std") || q.includes("standard")) return "std";
  if (q.includes("section") || q.includes("sec")) return "sec";

  return "all";
}

function cleanStudent(s) {
  return {
    firstName: s.firstName || "",
    lastName: s.lastName || ".",
    name: studentName(s),
    schoolName: s.schoolName,
    std: s.std,
    sec: s.sec,
    rollNoSpoken: s.rollNoSpoken,
    gender: s.gender,
    emailId: s.emailId,
    loginId: s.loginId
  };
}

function buildAnswer(s, field) {
  const name = studentName(s);

  if (field === "emailId") return `${name}'s email id is ${s.emailId}`;
  if (field === "loginId") return `${name}'s login id is ${s.loginId}`;
  if (field === "rollNoSpoken") return `${name}'s roll number is ${s.rollNoSpoken}`;
  if (field === "gender") return `${name}'s gender is ${s.gender}`;
  if (field === "schoolName") return `${name}'s school name is ${s.schoolName}`;
  if (field === "firstName") return `First name is ${s.firstName}`;
  if (field === "lastName") return `Last name is ${s.lastName}`;
  if (field === "std") return `${name}'s class is ${s.std}`;
  if (field === "sec") return `${name}'s section is ${s.sec}`;

  return `${name}'s details found.`;
}

async function start() {
  try {
    await client.connect();
    console.log("MongoDB connected ✅");

    const db = client.db("school_students_db");
    const studentsCollection = db.collection("students");

    app.get("/", (req, res) => {
      res.sendFile(__dirname + "/public/index.html");
    });

    app.post("/ask", async (req, res) => {
      try {
        const question = req.body.question || "";
        const field = detectField(question);
        const qNorm = norm(question);

        const students = await studentsCollection.find().toArray();

        let matches = [];

        // 1. Email exact search
        matches = students.filter((s) => {
          const email = norm(s.emailId);
          return email && qNorm.includes(email);
        });

        // 2. Login exact search
        if (matches.length === 0) {
          matches = students.filter((s) => {
            const login = norm(s.loginId);
            return login && qNorm.includes(login);
          });
        }

        // 3. Roll number exact search
        if (matches.length === 0) {
          matches = students.filter((s) => {
            const roll = norm(s.rollNoSpoken);
            return roll && qNorm.includes(roll);
          });
        }

        // 4. Full name exact search
        if (matches.length === 0) {
          matches = students.filter((s) => {
            const fullName1 = norm(`${s.firstName || ""}${s.lastName || ""}`);
            const fullName2 = norm(`${s.lastName || ""}${s.firstName || ""}`);

            return (
              (fullName1 && qNorm.includes(fullName1)) ||
              (fullName2 && qNorm.includes(fullName2))
            );
          });
        }

        // 5. First name exact fallback
        if (matches.length === 0) {
          matches = students.filter((s) => {
            const first = norm(s.firstName);
            return first.length >= 5 && qNorm.includes(first);
          });
        }

        if (matches.length === 0) {
          return res.json({
            answer: "No matching student found. Try exact name, email id, login id, or roll number.",
            count: 0,
            results: []
          });
        }

        // Remove bad records like S .
        matches = matches.filter((s) => {
          const name = studentName(s);
          return name && name.length >= 3 && name !== "S";
        });

        const results = matches.map((s) => ({
          answer: buildAnswer(s, field),
          student: cleanStudent(s)
        }));

        res.json({
          question,
          count: results.length,
          answer:
            results.length === 1
              ? results[0].answer
              : "Multiple matching students found. Please give exact full name, email id, login id, or roll number.",
          results
        });
      } catch (err) {
        res.status(500).json({ answer: err.message });
      }
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running → http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Server failed ❌", err);
  }
}

start();
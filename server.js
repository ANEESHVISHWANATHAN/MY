// server.js
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/res2", (_req, res) => res.sendFile(path.join(__dirname, "res2.html")));

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function parseNum(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function bmiFrom(heightCm, weightKg) {
  const h = parseNum(heightCm, 0) / 100, w = parseNum(weightKg, 0);
  return h > 0 && w > 0 ? +(w / (h * h)).toFixed(1) : 0;
}
function countryFromPOB(pob = "") {
  const s = String(pob).toLowerCase();
  const map = [
    [/india|delhi|mumbai|kolkata|chennai|bengaluru|hyderabad/, 69],
    [/pakistan|karachi|lahore|islamabad/, 67],
    [/bangladesh|dhaka/, 72],
    [/sri\s*lanka|colombo/, 77],
    [/nepal|kathmandu/, 71],
    [/indonesia|jakarta|bali/, 71],
    [/china|beijing|shanghai|guangzhou|shenzhen/, 78],
    [/japan|tokyo|osaka|kyoto/, 84],
    [/usa|united states|new york|los angeles|chicago|houston|boston|seattle|san|miami/, 77],
    [/canada|toronto|vancouver|montreal/, 82],
    [/uk|united kingdom|england|london|manchester|birmingham|scotland/, 80],
    [/australia|sydney|melbourne|brisbane|perth/, 83],
    [/germany|berlin|munich|frankfurt|hamburg/, 81],
    [/france|paris|lyon|marseille/, 82],
    [/russia|moscow|st\.? petersburg/, 70],
    [/nigeria|lagos|abuja/, 55],
    [/south africa|johannesburg|cape town|durban/, 64],
  ];
  for (const [re, val] of map) if (re.test(s)) return val;
  return 73; // default global-ish baseline
}
function baselineLE(gender, pob) {
  const base = countryFromPOB(pob);
  const g = String(gender || "").toLowerCase();
  let adj = 0;
  if (g.includes("female")) adj += 3;
  if (g.includes("male")) adj += -2;
  return base + adj;
}

function randNoise(range = 2) {
  // small symmetric noise (-range..+range)
  return Math.floor((Math.random() * (2 * range + 1)) - range);
}

app.post("/predict", (req, res) => {
  const {
    name, dob, tob, pob, gender,
    smoke, alcohol, drugs,
    sleep, screen, exercise, diet,
    job, jobs, workHours, stress,
    single, happiness, height, weight
  } = req.body;

  // ------- Derive basics -------
  const now = new Date();
  const by = new Date(dob).getFullYear();
  const birthYear = Number.isFinite(by) ? by : (now.getFullYear() - 30);
  const currentYear = now.getFullYear();
  const age = clamp(currentYear - birthYear, 0, 120);
  const BMI = bmiFrom(height, weight);
  const hasJob = (job === "yes");
  const jobsCount = parseInt(jobs || (hasJob ? 1 : 0), 10) || 0;
  const hrs = clamp(parseNum(workHours, hasJob ? 40 : 0), 0, 120);
  const str = clamp(parseInt(stress || "5", 10), 1, 10);
  const slp = clamp(parseNum(sleep, 7), 0, 24);
  const scr = clamp(parseNum(screen, 4), 0, 24);
  const happy = clamp(parseInt(happiness || "5", 10), 1, 10);

  // ------- Life expectancy model -------
  let le = baselineLE(gender, pob);

  // Smoking
  if (smoke === "yes") le -= 9;
  // Alcohol
  if (alcohol === "yes") le -= 3;
  // Drugs
  if (drugs === "yes") le -= 10;

  // Exercise
  if (exercise === "Regularly") le += 4;
  else if (exercise === "Never") le -= 4;

  // Diet
  if (diet === "Balanced") le += 2;
  else if (diet === "Junk-heavy") le -= 4;
  else if (diet === "Vegan" || diet === "Vegetarian") le += 1;

  // Stress
  le -= (str - 5) * 0.7;

  // Sleep
  if (slp >= 6 && slp <= 8) le += 1;
  if (slp < 6) le -= 3;
  if (slp > 9) le -= 1;

  // Screen time (proxy sedentary)
  if (scr > 8) le -= 1;

  // Work intensity
  if (hrs > 55) le -= 3;
  if (jobsCount >= 2) le -= 2;

  // Relationship support
  if (single === "yes") le -= 2;
  if (happy >= 8) le += 1;
  if (happy <= 3) le -= 2;

  // BMI effects
  if (BMI) {
    if (BMI < 18.5) le -= 2;
    else if (BMI >= 25 && BMI < 30) le -= 2;
    else if (BMI >= 30 && BMI < 35) le -= 5;
    else if (BMI >= 35) le -= 8;
    else le += 1; // normal BMI slight plus
  }

  // Mild randomness
  le += randNoise(2);

  // Ensure reasonable band
  le = clamp(Math.round(le), 40, 100);

  // Convert to predicted death year
  let deathAge = clamp(le, age + 1, 105);
  let deathYear = birthYear + deathAge;
  if (deathYear <= currentYear) deathYear = currentYear + 1;

  // ------- Cause of death scoring -------
  // Causes list
  const causes = {
    "Cardiovascular disease": 0,
    "Stroke": 0,
    "Respiratory disease (COPD/Asthma)": 0,
    "Cancer": 0,
    "Type 2 diabetes complications": 0,
    "Liver disease": 0,
    "Kidney failure": 0,
    "Serious infection (pneumonia/sepsis)": 0,
    "Accident / trauma": 0,
    "Neurodegenerative disease": 0
  };

  // Feature-driven weights
  // Smoking
  if (smoke === "yes") {
    causes["Cardiovascular disease"] += 6;
    causes["Respiratory disease (COPD/Asthma)"] += 7;
    causes["Cancer"] += 5;
    causes["Stroke"] += 2;
  }
  // Alcohol
  if (alcohol === "yes") {
    causes["Liver disease"] += 7;
    causes["Cancer"] += 2;
    causes["Accident / trauma"] += 3;
    if (hrs > 55) causes["Cardiovascular disease"] += 1;
  }
  // Drugs
  if (drugs === "yes") {
    causes["Accident / trauma"] += 6;
    causes["Liver disease"] += 2;
    causes["Serious infection (pneumonia/sepsis)"] += 2;
  }
  // BMI
  if (BMI) {
    if (BMI >= 25 && BMI < 30) {
      causes["Cardiovascular disease"] += 2;
      causes["Type 2 diabetes complications"] += 2;
    } else if (BMI >= 30 && BMI < 35) {
      causes["Cardiovascular disease"] += 4;
      causes["Type 2 diabetes complications"] += 4;
      causes["Stroke"] += 2;
      causes["Kidney failure"] += 1;
    } else if (BMI >= 35) {
      causes["Cardiovascular disease"] += 6;
      causes["Type 2 diabetes complications"] += 6;
      causes["Stroke"] += 3;
      causes["Kidney failure"] += 3;
    } else if (BMI < 18.5) {
      causes["Serious infection (pneumonia/sepsis)"] += 3;
      causes["Cancer"] += 1;
    }
  }
  // Sleep + stress
  if (slp < 6) {
    causes["Cardiovascular disease"] += 2;
    causes["Accident / trauma"] += 3;
    causes["Serious infection (pneumonia/sepsis)"] += 1;
  }
  if (str >= 7) {
    causes["Cardiovascular disease"] += 3;
    causes["Stroke"] += 2;
  }
  // Sedentary proxy
  const noExercise = exercise === "Never";
  if (noExercise || scr > 8) {
    causes["Cardiovascular disease"] += 2;
    causes["Type 2 diabetes complications"] += 2;
    if (noExercise) causes["Stroke"] += 1;
  }
  // Diet
  if (diet === "Junk-heavy") {
    causes["Cardiovascular disease"] += 2;
    causes["Type 2 diabetes complications"] += 2;
    causes["Cancer"] += 1;
  } else if (diet === "Balanced") {
    causes["Cancer"] -= 1;
    causes["Cardiovascular disease"] -= 1;
  }
  // Workload & jobs
  if (hrs > 55 || jobsCount >= 2) {
    causes["Accident / trauma"] += 2;
    causes["Cardiovascular disease"] += 2;
  }
  // Relationship
  if (single === "yes" || happy <= 3) {
    causes["Accident / trauma"] += 1;
    causes["Serious infection (pneumonia/sepsis)"] += 1; // weaker social support
  }
  // Age-at-death tilt
  if (deathAge >= 80) {
    causes["Neurodegenerative disease"] += 6;
    causes["Cancer"] += 2;
  } else if (deathAge <= 55) {
    causes["Accident / trauma"] += 3;
    if (smoke === "yes") causes["Respiratory disease (COPD/Asthma)"] += 1;
  }

  // Tiny randomness so ties feel organic
  for (const k of Object.keys(causes)) causes[k] += Math.random() * 0.5;

  // Pick top cause
  const topCause = Object.entries(causes).sort((a, b) => b[1] - a[1])[0][0];

  // Build a short, grounded reason snippet
  const hints = [];
  if (smoke === "yes") hints.push("smoking");
  if (alcohol === "yes") hints.push("alcohol");
  if (drugs === "yes") hints.push("drug use");
  if (BMI >= 30) hints.push(`high BMI (${BMI})`);
  if (BMI && BMI < 18.5) hints.push(`low BMI (${BMI})`);
  if (noExercise) hints.push("no exercise");
  if (diet === "Junk-heavy") hints.push("poor diet");
  if (str >= 7) hints.push(`high stress (${str}/10)`);
  if (slp < 6) hints.push(`low sleep (${slp}h)`);
  if (hrs > 55) hints.push(`overwork (${hrs}h/wk)`);

  const reason = `${topCause} — driven by ${hints.length ? hints.join(", ") : "overall profile"}.${
    BMI ? ` BMI ${BMI}.` : ""
  }`;

  // Redirect to result page with params
  res.redirect(`/res2.html?year=${encodeURIComponent(deathYear)}&reason=${encodeURIComponent(reason)}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Spooky predictor running on ${PORT}`));
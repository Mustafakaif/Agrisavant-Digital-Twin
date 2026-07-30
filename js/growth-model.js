// Tomato digital-twin growth engine — ported from digital_twin/growth_model.py
// Anchors are sourced from Tomato_DAS_Daily_Baseline_0_to_120.xlsx (see data/growth_anchors.csv).
export const MIN_DAS = 1;
export const MAX_DAS = 120;

const ANCHORS = {
  das: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
  height_cm: [0.0, 6.0, 14.5, 26.0, 38.0, 51.33, 62.67, 72.0, 77.0, 82.0, 84.67, 87.33, 90.0],
  biomass_g: [0.0, 3.33, 7.5, 15.0, 25.0, 38.33, 51.67, 65.0, 75.0, 85.0, 90.0, 95.0, 100.0],
  flowers: [0, 0, 0, 1, 2, 5, 9, 12, 10, 8, 7, 6, 5],
  fruits: [0, 0, 0, 0, 0, 1, 2, 5, 8, 10, 11, 11, 12],
  lead_diameter_mm: [0.0, 0.0, 0.0, 0.0, 0.0, 5.33, 13.67, 25.0, 37.5, 50.0, 51.67, 53.33, 55.0],
};

export const STAGES = [
  [1, 14, "Seedling"],
  [15, 24, "Establishment"],
  [25, 44, "Vegetative Growth"],
  [45, 54, "Flowering & Initial Fruit Set"],
  [55, 80, "Fruit Enlargement"],
  [81, 95, "Ripening"],
  [96, 120, "Harvesting"],
];

const FRUIT_STAGES = [
  { index: 1, name: "Bright Lime-Green", quality: 2, color: "#A9D43B" },
  { index: 2, name: "Solid Glossy Green", quality: 3, color: "#3F8F31" },
  { index: 3, name: "Whitish / Pale Green", quality: 5, color: "#C6D78D" },
  { index: 4, name: "Yellow", quality: 6, color: "#F1CE43" },
  { index: 5, name: "Yellowish-Pink", quality: 7, color: "#E9A36F" },
  { index: 6, name: "Solid Pink", quality: 8, color: "#E8757B" },
  { index: 7, name: "Orange", quality: 9, color: "#EC7138" },
  { index: 8, name: "Red", quality: 10, color: "#D9322B" },
];

const FRUIT_BIRTH_DAS = [50, 54, 57, 60, 62, 65, 68, 71, 74, 77, 80, 84, 88, 92, 96, 100, 105, 110, 115, 120];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function gaussianScore(value, optimum, sigma) {
  return Math.exp(-0.5 * ((value - optimum) / sigma) ** 2);
}

export function environmentScore(env) {
  const scores = {
    humidity: gaussianScore(env.humidity, 65, 24),
    gdd: gaussianScore(env.gdd, 20, 7),
    soil: gaussianScore(env.soilHumidity, 65, 27),
    sun: gaussianScore(env.sunHours, 8, 3.2),
  };
  return (
    0.2 * scores.humidity +
    0.28 * scores.gdd +
    0.3 * scores.soil +
    0.22 * scores.sun
  );
}

export function growthFactor(env) {
  return clamp(0.72 + 0.36 * environmentScore(env), 0.72, 1.08);
}

function smoothInterpolate(das, values) {
  const x = ANCHORS.das;
  const d = clamp(das, MIN_DAS, MAX_DAS);
  let idx = -1;
  for (let i = 0; i < x.length; i++) {
    if (d >= x[i]) idx = i;
  }
  if (idx >= x.length - 1) return values[values.length - 1];
  idx = Math.max(0, idx);
  const x0 = x[idx], x1 = x[idx + 1];
  const y0 = values[idx], y1 = values[idx + 1];
  let t = (d - x0) / (x1 - x0);
  t = t * t * (3.0 - 2.0 * t);
  return y0 + (y1 - y0) * t;
}

export function stageForDas(das) {
  for (const [low, high, name] of STAGES) {
    if (das >= low && das <= high) return name;
  }
  return das > MAX_DAS ? STAGES[STAGES.length - 1][2] : STAGES[0][2];
}

function fruitStageFromAge(ageDays) {
  const thresholds = [4, 8, 12, 16, 20, 24, 28];
  let idx = 0;
  for (const t of thresholds) if (ageDays >= t) idx++;
  return FRUIT_STAGES[Math.min(idx, FRUIT_STAGES.length - 1)];
}

function fruitAges(das, requestedCount) {
  const ages = [];
  for (const birth of FRUIT_BIRTH_DAS) {
    if (das >= birth) ages.push(Math.max(0, das - birth));
  }
  return ages.slice(0, Math.max(0, requestedCount));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function smoothstep01(x, a, b) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Pest/disease pressure follows the crop's growth stage (per the excel-sourced DAS/stage
// timeline): DAS 1-60 (seedling -> vegetative growth) is always LOW risk; DAS 60-90
// (flowering / fruit set, canopy closing in) is a MEDIUM baseline that conditions can push
// into HIGH; DAS 90-120 (ripening -> harvest) is always a HIGH baseline, with conditions only
// setting how severe. Within each phase the four inputs (humidity, GDD, soil, sun) drive how
// unfavourable conditions are (0 = ideal, 1 = worst), which moves the needle within that phase.
function riskScores(das, env, envScoreValue) {
  const wetAir = clamp((env.humidity - 62) / 38, 0, 1);
  const wetSoil = clamp((env.soilHumidity - 72) / 28, 0, 1);
  const drySoil = clamp((38 - env.soilHumidity) / 37, 0, 1);
  const lowSun = clamp((6 - env.sunHours) / 6, 0, 1);
  const heatStress = clamp(Math.abs(env.gdd - 20) / 10, 0, 1);

  const pestStress = clamp(0.35 * wetAir + 0.25 * drySoil + 0.20 * heatStress + 0.20 * lowSun, 0, 1);
  const diseaseStress = clamp(0.35 * wetAir + 0.30 * wetSoil + 0.20 * lowSun + 0.15 * heatStress, 0, 1);

  let pest, disease;
  if (das <= 60) {
    const t = smoothstep01(das, 1, 60);
    const base = 3 + 27 * t; // gradual rise across the LOW zone (0-33) as DAS advances
    pest = clamp(base + 8 * pestStress, 2, 33);
    disease = clamp(base + 8 * diseaseStress, 2, 33);
  } else if (das <= 90) {
    const t = smoothstep01(das, 60, 90);
    const floor = 34 + 8 * t; // MEDIUM floor (34-42), conditions can carry it into HIGH
    pest = floor + pestStress * (99 - floor);
    disease = floor + diseaseStress * (99 - floor);
  } else {
    const t = smoothstep01(das, 90, 120);
    const floor = 67 + 8 * t; // HIGH floor (67-75); conditions only set severity above it
    pest = floor + pestStress * (99 - floor);
    disease = floor + diseaseStress * (99 - floor);
  }

  const pestI = Math.round(clamp(pest, 2, 99));
  const diseaseI = Math.round(clamp(disease, 2, 99));

  const stress = (1.0 - envScoreValue) * 45;
  const health = 100 - 0.28 * pestI - 0.38 * diseaseI - stress;
  const healthI = Math.round(clamp(health, 5, 99));
  return { pest: pestI, disease: diseaseI, health: healthI };
}

export function calculateSummary(das, env) {
  das = Math.round(clamp(das, MIN_DAS, MAX_DAS));
  const score = environmentScore(env);
  const factor = growthFactor(env);

  const height = smoothInterpolate(das, ANCHORS.height_cm) * (0.92 + 0.08 * factor);
  const biomass = smoothInterpolate(das, ANCHORS.biomass_g) * (0.78 + 0.22 * factor);
  const flowersBase = smoothInterpolate(das, ANCHORS.flowers);
  const fruitsBase = smoothInterpolate(das, ANCHORS.fruits);
  const diameter = smoothInterpolate(das, ANCHORS.lead_diameter_mm) * (0.82 + 0.18 * factor);

  const isDeadOrDying =
    score < 0.22 || env.sunHours === 0 || env.soilHumidity < 8 || env.humidity < 8;

  let flowers, fruits;
  if (isDeadOrDying) {
    flowers = 0;
    fruits = 0;
  } else {
    const flowerFactor = clamp(0.65 + 0.45 * score, 0.6, 1.1);
    const fruitFactor = clamp(0.55 + 0.55 * score, 0.5, 1.1);
    flowers = Math.max(0, Math.round(flowersBase * flowerFactor));
    fruits = Math.max(0, Math.round(fruitsBase * fruitFactor));
  }

  const ages = fruitAges(das, fruits);
  let qualityScore = null, qualityName, qualityColor;
  if (ages.length) {
    const stages = ages.map(fruitStageFromAge);
    const medianQuality = Math.round(median(stages.map((s) => s.quality)));
    let chosen = stages[0];
    let bestDiff = Infinity;
    for (const s of FRUIT_STAGES) {
      const diff = Math.abs(s.quality - medianQuality);
      if (diff < bestDiff) { bestDiff = diff; chosen = s; }
    }
    qualityScore = chosen.quality;
    qualityName = chosen.name;
    qualityColor = chosen.color;
  } else {
    qualityScore = null;
    qualityName = isDeadOrDying ? "Severe Stress - No Fruit" : "No visible fruit";
    qualityColor = "#A7B0A6";
  }

  const risk = riskScores(das, env, score);
  let health = risk.health;
  if (isDeadOrDying) health = Math.min(health, 8);

  return {
    das,
    stage: stageForDas(das),
    heightCm: Math.round(height * 10) / 10,
    biomassG: Math.round(biomass * 10) / 10,
    flowersCount: flowers,
    fruitsCount: fruits,
    fruitQualityScore: qualityScore,
    fruitQualityName: qualityName,
    fruitQualityColor: qualityColor,
    fruitSizeCm: Math.round((diameter / 10) * 10) / 10,
    fruitDiameterMm: diameter,
    pestRiskPct: risk.pest,
    diseaseRiskPct: risk.disease,
    plantHealthPct: health,
    growthFactor: Math.round(factor * 1000) / 1000,
    environmentScore: Math.round(score * 1000) / 1000,
    isDeadOrDying,
    visibleFruitAges: ages,
  };
}

import { calculateSummary, MIN_DAS, MAX_DAS } from './growth-model.js';
import { gaugeSvg, qualityBadge } from './ui-components.js';
import { createPlant } from './plant3d.js';

const GREEN = '#6fbf7a', AMBER = '#d9c184', RED = '#d98484';

const els = {
  humidity: document.getElementById('humidity'),
  gdd: document.getElementById('gdd'),
  soil: document.getElementById('soil'),
  sun: document.getElementById('sun'),
  das: document.getElementById('das'),

  humidityVal: document.getElementById('humidityVal'),
  gddVal: document.getElementById('gddVal'),
  soilVal: document.getElementById('soilVal'),
  sunVal: document.getElementById('sunVal'),

  envScoreVal: document.getElementById('envScoreVal'),
  growthFactorVal: document.getElementById('growthFactorVal'),

  stageTag: document.getElementById('stageTag'),
  healthTag: document.getElementById('healthTag'),
  stageStripName: document.getElementById('stageStripName'),
  stageStripDas: document.getElementById('stageStripDas'),

  dasPill: document.getElementById('dasPill'),
  heightVal: document.getElementById('heightVal'),
  biomassVal: document.getElementById('biomassVal'),
  flowersVal: document.getElementById('flowersVal'),
  fruitsVal: document.getElementById('fruitsVal'),
  fruitSizeVal: document.getElementById('fruitSizeVal'),
  currentStageVal: document.getElementById('currentStageVal'),

  qualityBadge: document.getElementById('qualityBadge'),
  gauges: document.getElementById('gauges'),
  healthPanel: document.getElementById('healthPanel'),
  healthPct: document.getElementById('healthPct'),
};

const state = { das: 55, humidity: 65, gdd: 20, soil: 65, sun: 8 };

function healthTone(healthPct, dead) {
  if (dead || healthPct < 25) return RED;
  if (healthPct >= 85) return GREEN;
  return AMBER;
}

function render(ctrl) {
  const env = { humidity: state.humidity, gdd: state.gdd, soilHumidity: state.soil, sunHours: state.sun };
  const summary = calculateSummary(state.das, env);

  els.humidityVal.textContent = state.humidity;
  els.gddVal.textContent = state.gdd;
  els.soilVal.textContent = state.soil;
  els.sunVal.textContent = state.sun;

  els.envScoreVal.textContent = Math.round(summary.environmentScore * 100);
  els.growthFactorVal.textContent = summary.growthFactor.toFixed(2);

  const tone = healthTone(summary.plantHealthPct, summary.isDeadOrDying);
  els.stageTag.textContent = summary.stage;
  els.healthTag.textContent = `Health ${summary.plantHealthPct}%`;
  els.healthTag.style.setProperty('--tag-color', tone);
  els.stageStripName.textContent = summary.stage;
  els.stageStripDas.textContent = summary.das;

  els.dasPill.textContent = summary.das;
  els.heightVal.textContent = summary.heightCm;
  els.biomassVal.textContent = summary.biomassG;
  els.flowersVal.textContent = summary.flowersCount;
  els.fruitsVal.textContent = summary.fruitsCount;
  els.fruitSizeVal.textContent = summary.fruitSizeCm;
  els.currentStageVal.textContent = summary.stage;

  els.qualityBadge.innerHTML = qualityBadge(summary.fruitQualityColor, summary.fruitQualityName, summary.fruitQualityScore);
  els.gauges.innerHTML = gaugeSvg(summary.pestRiskPct, 'PEST RISK') + gaugeSvg(summary.diseaseRiskPct, 'DISEASE RISK');
  els.healthPanel.style.setProperty('--health', `${summary.plantHealthPct}%`);
  els.healthPct.textContent = `${summary.plantHealthPct}%`;

  if (ctrl) {
    ctrl.update({
      heightCm: summary.heightCm,
      biomass01: Math.max(0, Math.min(1, summary.biomassG / 100)),
      health01: Math.max(0, Math.min(1, summary.plantHealthPct / 100)),
      flowers: summary.flowersCount,
      fruits: summary.fruitsCount,
      diaMM: summary.fruitDiameterMm,
      pest01: Math.max(0, Math.min(1, summary.pestRiskPct / 100)),
      dis01: Math.max(0, Math.min(1, summary.diseaseRiskPct / 100)),
      das: summary.das,
      dead: summary.isDeadOrDying,
    });
  }
}

function bindSlider(el, key, valEl) {
  el.addEventListener('input', () => {
    state[key] = Number(el.value);
    if (valEl) valEl.textContent = el.value;
    render(plantCtrl);
  });
}

let plantCtrl = null;

els.das.min = MIN_DAS;
els.das.max = MAX_DAS;

bindSlider(els.humidity, 'humidity', els.humidityVal);
bindSlider(els.gdd, 'gdd', els.gddVal);
bindSlider(els.soil, 'soil', els.soilVal);
bindSlider(els.sun, 'sun', els.sunVal);
bindSlider(els.das, 'das', null);

render(null);

createPlant(document.getElementById('plantCanvas'), { ghost: false })
  .then((ctrl) => {
    plantCtrl = ctrl;
    render(plantCtrl);
  })
  .catch((err) => {
    console.error('Plant renderer failed to load', err);
  });

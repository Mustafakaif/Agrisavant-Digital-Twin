// Reusable SVG UI fragments — ported from digital_twin/ui_components.py
export function riskLevel(value) {
  if (value < 34) return "LOW";
  if (value < 67) return "MEDIUM";
  return "HIGH";
}

export function gaugeSvg(value, title) {
  value = Math.max(0, Math.min(100, Math.round(value)));
  // 0 -> 180deg (left/LOW), 50 -> 270deg (top/MEDIUM), 100 -> 360deg (right/HIGH) —
  // must match the LOW/MED/HIGH arc segments drawn below, not an arbitrary offset.
  const angle = 180 + (180 * value) / 100;
  const rad = (angle * Math.PI) / 180;
  const cx = 120, cy = 115, length = 72;
  const x2 = cx + length * Math.cos(rad);
  const y2 = cy + length * Math.sin(rad);
  const level = riskLevel(value);
  return `
    <div class="gauge-card">
      <div class="gauge-title">${title}</div>
      <svg viewBox="0 0 240 150" class="gauge-svg" aria-label="${title} ${value} percent">
        <path d="M35 115 A85 85 0 0 1 77.5 41.4" fill="none" stroke="#789C3D" stroke-width="30" stroke-linecap="butt"/>
        <path d="M77.5 41.4 A85 85 0 0 1 162.5 41.4" fill="none" stroke="#F2B43B" stroke-width="30"/>
        <path d="M162.5 41.4 A85 85 0 0 1 205 115" fill="none" stroke="#E65C35" stroke-width="30" stroke-linecap="butt"/>
        <text x="53" y="107" class="gauge-zone">LOW</text>
        <text x="120" y="46" text-anchor="middle" class="gauge-zone">MED</text>
        <text x="187" y="107" text-anchor="middle" class="gauge-zone">HIGH</text>
        <line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#17221B" stroke-width="7" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="13" fill="#17221B"/><circle cx="${cx}" cy="${cy}" r="5" fill="#5E7064"/>
      </svg>
      <div class="gauge-reading"><span class="gauge-level">${level}</span></div>
    </div>`;
}

export function qualityBadge(color, name, score) {
  const scoreText = score === null || score === undefined ? "—" : String(score);
  return `
      <div class="quality-wrap">
        <div class="tomato-icon" style="--fruit:${color}"><span></span></div>
        <div><div class="quality-name">${name}</div><div class="quality-score">Quality score ${scoreText}</div></div>
      </div>`;
}

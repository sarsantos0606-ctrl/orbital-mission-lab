const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const P = require('../physics.js');
global.window = { OrbitalPhysics: P, katex: require('../vendor/katex/katex.min.js') };
require('../math-format.js');
const Guide = require('../guide.js');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

test('Guide includes three accessible panels, all requested topics and no removed simulator blocks', () => {
  for (const id of ['fundamentals', 'engineering', 'model']) {
    assert.ok(html.includes('id="guide-tab-' + id + '" role="tab" aria-controls="guide-' + id + '"'));
    assert.ok(html.includes('id="guide-' + id + '" role="tabpanel" aria-labelledby="guide-tab-' + id + '"'));
  }
  for (const text of ['Gravitação e energia potencial', 'Órbita circular', 'Posição angular',
    'Elipse: geometria', 'A transferência de Hohmann', 'Como calcular as duas manobras',
    'fase e repetição da janela', 'Exemplo calculado', 'Pressupostos e limites']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes('class="propulsion-detail"'));
  assert.ok(!html.includes('class="map-explanation"'));
  assert.ok(!html.includes('id="arrival-card"'));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, 'All HTML/SVG IDs must be unique');
});

test('Every static guide equation renders as accessible LaTeX without errors', () => {
  const formulas = [...html.matchAll(/data-tex="([^"]*)"/g)].map(m => m[1]);
  assert.ok(formulas.length > 60);
  for (const formula of formulas) {
    const output = window.OrbitalMath.tex(formula, true);
    assert.ok(output.includes('<math'), formula);
    assert.ok(!output.includes('katex-error'), formula);
  }
});

test('Worked examples compile for all 72 routes, with Hohmann time, phase and energy', () => {
  for (const origin of Object.keys(P.planets)) {
    for (const destination of Object.keys(P.planets)) {
      if (origin === destination) continue;
      const m = P.transfer(origin, destination, 2000);
      const output = Guide.workedExample(m);
      assert.ok(output.facts.includes('kg'));
      assert.ok(output.calculations.includes('<math'));
      assert.ok(!output.calculations.includes('NaN'));
      assert.ok(!output.calculations.includes('undefined'));
      assert.equal((output.calculations.match(/<h3>/g) || []).length, 6);
      assert.equal(Guide.reference(m).seconds, m.seconds);
      const tFromSI = Math.PI * Math.sqrt((m.a * 1000) ** 3 / (P.MU * 1e9));
      assert.ok(Math.abs(tFromSI / m.seconds - 1) < 1e-12);
      const energyFromSI = .5 * m.mass * ((m.vt1 * 1000) ** 2 - (m.v1 * 1000) ** 2) / 1e6;
      assert.ok(Math.abs(energyFromSI - m.dE1) < 1e-6);
    }
  }
});

test('Non-ideal phase still produces an explicitly Hohmann analytic reference without mutating the mission', () => {
  const ideal = P.transfer();
  const alternative = P.rendezvous('earth', 'mars', 1500, ideal.phase + 25);
  const before = JSON.stringify(alternative);
  const reference = Guide.reference(alternative);
  assert.equal(reference.days, ideal.days);
  assert.equal(reference.phase, ideal.phase);
  assert.equal(reference.mass, 1500);
  assert.notEqual(reference.days, alternative.days);
  assert.equal(JSON.stringify(alternative), before);
});

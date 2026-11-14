const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
global.window = { katex: require('../vendor/katex/katex.min.js') };
require('../math-format.js');
const M = window.OrbitalMath, P = require('../physics.js');
test('All support and learning formulas compile as TeX with accessible MathML', () => {
  const app = fs.readFileSync(__dirname + '/../app.js','utf8');
  const formulas = [...app.matchAll(/formula: ("(?:[^"\\]|\\.)*"),/g)].map(m=>JSON.parse(m[1]));
  assert.equal(formulas.length,6);
  for (const source of [...M.support,...formulas]) {
    const result=M.tex(source,true); assert.ok(result.includes('katex-html')); assert.ok(result.includes('<math'));
  }
  assert.ok(M.tex(M.support[5],true).includes('<mfrac>'));
});
test('Worked substitutions render on every directed planetary route', () => {
  const year=2*Math.PI*Math.sqrt(P.AU**3/P.MU)/P.DAY;
  for(const a of Object.keys(P.planets)) for(const b of Object.keys(P.planets)) {
    if(a===b) continue;
    const m=P.transfer(a,b), output=M.calculations(m,year,m.n1*P.DAY*180/Math.PI,m.n2*P.DAY*180/Math.PI);
    assert.equal(output.length,6); assert.ok(output.every(html=>html.includes('katex')&&!html.includes('katex-error')));
  }
});
test('Removed copy stays removed; energy expression and conditional map notice are present', () => {
  const html=fs.readFileSync(__dirname+'/../index.html','utf8');
  for(const text of ['nav-count','PREVÊ · CALCULA · EXPLICA','AS LEIS POR TRÁS DA VIAGEM','Três desafios com fórmulas','um Δv maior exige mais propelente']) assert.ok(!html.includes(text));
  assert.match(html,/class="energy-expression"/); assert.match(html,/id="non-hohmann-notice"[^>]*hidden/);
});

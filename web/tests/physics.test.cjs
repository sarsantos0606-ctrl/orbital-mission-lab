const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../physics.js');
function near(actual, expected, tolerance, message) { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`); }

test('Earth–Mars reference: time, phase, semi-major axis, delta-v and launch cadence', () => {
  const m = P.transfer();
  near(m.aAU, 1.2618395, 1e-8, 'a');
  near(m.days, 258.87, .1, 'travel days');
  near(m.phase, 44.34, .1, 'phase degrees');
  near(m.dv1, 2.945, .005, 'departure km/s');
  near(m.dv2, 2.649, .005, 'arrival km/s');
  near(m.synodicDays, 780, 1, 'synodic days');
  near(P.arrivalMiss(m, m.phase), 0, 1e-6, 'ideal rendezvous');
});
test('All 72 directed transfers reach both orbital radii and conserve orbital energy', () => {
  const ids = Object.keys(P.planets);
  for (const origin of ids) for (const destination of ids) {
    if (origin === destination) continue;
    const m = P.transfer(origin, destination, 1200);
    const start = P.spacecraft(m, 0), end = P.spacecraft(m, 1);
    near(start.x, m.r1 / P.AU, 1e-8, `${origin} departure radius`);
    near(end.x, -m.r2 / P.AU, 1e-8, `${destination} arrival radius`);
    near(start.y, 0, 1e-8, 'departure y'); near(end.y, 0, 1e-8, 'arrival y');
    near(start.speed, m.vt1, 1e-7, 'departure velocity'); near(end.speed, m.vt2, 1e-7, 'arrival velocity');
    const atArrival = P.planetPositions(m, 1, m.phase).destination;
    near(atArrival.x, end.x, 1e-7, 'planet meets ship, x'); near(atArrival.y, end.y, 1e-7, 'planet meets ship, y');
    for (let t = 0; t <= 1; t += .05) {
      const s = P.spacecraft(m, t);
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.speed));
      const specificEnergy = .5 * s.speed ** 2 - P.MU / (s.r * P.AU);
      near(specificEnergy, -P.MU / (2 * m.a), 1e-7, 'constant specific energy');
    }
  }
});
test('Return transfers reverse radial motion while keeping prograde angular motion', () => {
  const m = P.transfer('mars', 'earth');
  const points = [.1,.5,.9].map(t => P.spacecraft(m,t));
  assert.ok(points.every(s => s.y > 0)); assert.ok(points[0].r > points[1].r && points[1].r > points[2].r);
  assert.ok(points[0].speed < points[1].speed && points[1].speed < points[2].speed);
  near(m.days, P.transfer().days, 1e-10, 'symmetric travel time');
});
test('Kepler propagation uses non-uniform speed, not a uniform angular animation', () => {
  const m = P.transfer();
  const quarter = P.spacecraft(m, .25), threeQuarter = P.spacecraft(m, .75);
  assert.ok(quarter.speed > threeQuarter.speed);
  assert.ok(Math.atan2(quarter.y, quarter.x) > Math.PI / 4);
  for (const e of [0,.2,.85,.98]) for (const mean of [.001,.5,Math.PI,5,6.28]) {
    const E = P.eccentricAnomaly(mean,e); near(E - e * Math.sin(E), mean, 1e-11, 'Kepler residual');
  }
});
test('A fixed Hohmann trajectory misses if its launch phase is changed without replanning', () => {
  const m = P.transfer();
  const missed = P.arrivalMiss(m, m.phase + 25);
  near(missed, 2 * m.r2 * Math.sin(25 * Math.PI / 360), 1e-7, 'chord length');
  assert.ok(missed > 90e6); near(P.arrivalMiss(m,m.phase + 360),0,1e-5,'equivalent phase');
});
test('Energy uses SI conversion and is proportional to mass; orbit is unchanged', () => {
  const m = P.transfer('earth','mars',1000), doubled = P.transfer('earth','mars',2000);
  near(m.dE1, .5 * 1000 * ((m.vt1 * 1000) ** 2 - (m.v1 * 1000) ** 2) / 1e6, 1e-7, 'energy MJ');
  near(doubled.energyMJ, 2 * m.energyMJ, 1e-7, 'double energy'); near(doubled.days,m.days,0,'same time');
  near(doubled.dv,m.dv,0,'same delta-v'); assert.deepEqual(P.spacecraft(m,.6),P.spacecraft(doubled,.6));
});
test('Educational answers accept decimal commas and equivalent phases but reject empty/non-finite input', () => {
  assert.equal(P.parseAnswer('1,26'),1.26); assert.equal(P.parseAnswer('1.26e2'),126);
  for (const bad of ['', ' ', '1,2,3','12x', 'Infinity','NaN', '1e999']) assert.equal(P.parseAnswer(bad),null);
  assert.equal(P.grade('404,3',44.3,1,true).correct,true);
  assert.equal(P.grade('258,9',258.87,3).correct,true);
  assert.equal(P.grade('259',128,3).correct,false);
  assert.equal(P.grade('',0,1).valid,false);
});
test('Invalid missions fail explicitly; elapsed time is bounded', () => {
  assert.throws(() => P.transfer('earth','earth'),RangeError);
  assert.throws(() => P.transfer('moon','mars'),RangeError);
  for (const mass of [NaN,Infinity,0,-10]) assert.throws(() => P.transfer('earth','mars',mass),RangeError);
  const m = P.transfer(); assert.deepEqual(P.spacecraft(m,-1),P.spacecraft(m,0)); assert.deepEqual(P.spacecraft(m,2),P.spacecraft(m,1));
  assert.throws(() => P.spacecraft(m,NaN),RangeError); assert.throws(() => P.arrivalMiss(m,NaN),RangeError);
});

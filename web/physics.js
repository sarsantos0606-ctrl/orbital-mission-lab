(function (root) {
  'use strict';
  const AU = 149597870.7, DAY = 86400, MU = 1.32712440018e11, TAU = 2 * Math.PI;
  const planets = Object.freeze({
    mercury: { name: 'Mercúrio', au: .387098, color: '#c4beb4' },
    venus: { name: 'Vénus', au: .723332, color: '#e4c18a' },
    earth: { name: 'Terra', au: 1, color: '#77baff' },
    mars: { name: 'Marte', au: 1.523679, color: '#ff926c' },
    jupiter: { name: 'Júpiter', au: 5.2044, color: '#ddb397' },
    saturn: { name: 'Saturno', au: 9.5826, color: '#e1ce92' },
    uranus: { name: 'Urano', au: 19.1913, color: '#86d8de' },
    neptune: { name: 'Neptuno', au: 30.07, color: '#929bff' },
    pluto: { name: 'Plutão (planeta anão)', shortName: 'Plutão', au: 39.482, color: '#beaaa2' }
  });
  const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;
  function transfer(origin = 'earth', destination = 'mars', mass = 1000) {
    if (!planets[origin] || !planets[destination]) throw new RangeError('Seleciona dois destinos válidos.');
    if (origin === destination) throw new RangeError('Escolhe uma origem diferente do destino.');
    if (!Number.isFinite(mass) || mass <= 0) throw new RangeError('A massa deve ser um número positivo.');
    const r1 = planets[origin].au * AU, r2 = planets[destination].au * AU;
    const a = (r1 + r2) / 2, e = Math.abs(r2 - r1) / (r1 + r2);
    const v1 = Math.sqrt(MU / r1), v2 = Math.sqrt(MU / r2);
    const vt1 = Math.sqrt(MU * (2 / r1 - 1 / a)), vt2 = Math.sqrt(MU * (2 / r2 - 1 / a));
    const seconds = Math.PI * Math.sqrt(a ** 3 / MU);
    const n1 = Math.sqrt(MU / r1 ** 3), n2 = Math.sqrt(MU / r2 ** 3);
    const phase = wrap(180 - n2 * seconds * 180 / Math.PI);
    const dE1 = .5 * mass * (vt1 ** 2 - v1 ** 2);
    const dE2 = .5 * mass * (v2 ** 2 - vt2 ** 2);
    return { origin, destination, mass, r1, r2, a, e, v1, v2, vt1, vt2, n1, n2, phase,
      seconds, days: seconds / DAY, aAU: a / AU, outward: r2 > r1,
      dv1: Math.abs(vt1 - v1), dv2: Math.abs(v2 - vt2),
      dv: Math.abs(vt1 - v1) + Math.abs(v2 - vt2),
      dE1, dE2, energyMJ: Math.abs(dE1) + Math.abs(dE2),
      synodicDays: TAU / Math.abs(n1 - n2) / DAY };
  }
  function eccentricAnomaly(mean, e) {
    // Monotonic Kepler equation, with bisection for highly eccentric transfers.
    let lo = 0, hi = TAU, E = mean;
    for (let i = 0; i < 70; i++) {
      const f = E - e * Math.sin(E) - mean;
      if (Math.abs(f) < 1e-13) return E;
      if (f > 0) hi = E; else lo = E;
      const candidate = E - f / (1 - e * Math.cos(E));
      E = candidate > lo && candidate < hi ? candidate : (lo + hi) / 2;
    }
    return E;
  }
  function spacecraft(mission, progress) {
    if (!Number.isFinite(progress)) throw new RangeError('O tempo deve ser finito.');
    const fraction = Math.min(1, Math.max(0, progress));
    if (mission.kind === 'lambert') {
      const E = eccentricAnomaly(((mission.mean0 + mission.motion * mission.seconds * fraction) % TAU + TAU) % TAU, mission.e);
      const x0 = mission.a * (Math.cos(E) - mission.e), y0 = mission.a * Math.sqrt(1 - mission.e ** 2) * Math.sin(E);
      const c = Math.cos(mission.omega), s = Math.sin(mission.omega), r = Math.hypot(x0, y0);
      return { x: (c * x0 - s * y0) / AU, y: (s * x0 + c * y0) / AU, r: r / AU,
        speed: Math.sqrt(MU * (2 / r - 1 / mission.a)), days: fraction * mission.days };
    }
    const mean = (mission.outward ? 0 : Math.PI) + Math.PI * fraction;
    const E = eccentricAnomaly(mean, mission.e), sign = mission.outward ? 1 : -1;
    const x = sign * mission.a * (Math.cos(E) - mission.e);
    const y = sign * mission.a * Math.sqrt(1 - mission.e ** 2) * Math.sin(E);
    const r = Math.hypot(x, y);
    return { x: x / AU, y: y / AU, r: r / AU,
      speed: Math.sqrt(MU * (2 / r - 1 / mission.a)), days: fraction * mission.days };
  }
  function planetPositions(mission, progress, phase = mission.launchPhase ?? mission.phase) {
    if (!Number.isFinite(phase)) throw new RangeError('O ângulo deve ser finito.');
    const t = Math.min(1, Math.max(0, progress)) * mission.seconds;
    const p = (radius, angle) => ({ x: radius * Math.cos(angle) / AU, y: radius * Math.sin(angle) / AU });
    return { origin: p(mission.r1, mission.n1 * t), destination: p(mission.r2, phase * Math.PI / 180 + mission.n2 * t) };
  }
  function arrivalMiss(mission, phase) {
    if (!Number.isFinite(phase)) throw new RangeError('O ângulo deve ser finito.');
    if (mission.kind === 'lambert') {
      const end = spacecraft(mission, 1), planet = planetPositions(mission, 1, phase).destination;
      return AU * Math.hypot(end.x - planet.x, end.y - planet.y);
    }
    return 2 * mission.r2 * Math.abs(Math.sin(wrap(phase - mission.phase) * Math.PI / 360));
  }
  // Universal-variable Lambert solution: prograde, elliptic, zero revolution.
  // The endpoints are heliocentric positions; both impulses are vector differences.
  function lambert(base, phase, seconds) {
    const theta = ((phase * Math.PI / 180 + base.n2 * seconds) % TAU + TAU) % TAU;
    if (Math.abs(Math.sin(theta)) < 1e-7) return null; // Collinear singularity; Hohmann handled analytically.
    const { r1, r2 } = base, A = Math.sin(theta) * Math.sqrt(r1 * r2 / (1 - Math.cos(theta)));
    function timeAt(z) {
      const q = Math.sqrt(z), C = z < 1e-7 ? .5 - z / 24 + z * z / 720 : (1 - Math.cos(q)) / z;
      const S = z < 1e-7 ? 1 / 6 - z / 120 + z * z / 5040 : (q - Math.sin(q)) / (q * q * q);
      const y = r1 + r2 + A * (z * S - 1) / Math.sqrt(C);
      if (y <= 0) return null;
      return { y, time: ((y / C) ** 1.5 * S + A * Math.sqrt(y)) / Math.sqrt(MU) };
    }
    let lo = 0, hi = 4 * Math.PI ** 2 - 1e-5;
    const first = timeAt(lo);
    if (!first || first.time >= seconds) return null; // Excludes parabolic/hyperbolic trajectories.
    let solution;
    for (let i = 0; i < 65; i++) {
      const z = (lo + hi) / 2; solution = timeAt(z);
      if (!solution || solution.time < seconds) lo = z; else hi = z;
    }
    if (!solution || Math.abs(solution.time - seconds) > Math.max(.01, seconds * 1e-9)) return null;
    const { y } = solution, f = 1 - y / r1, g = A * Math.sqrt(y / MU), gd = 1 - y / r2;
    const endX = r2 * Math.cos(theta), endY = r2 * Math.sin(theta);
    const vx = (endX - f * r1) / g, vy = endY / g;
    const wx = (gd * endX - r1) / g, wy = gd * endY / g;
    const vt1 = Math.hypot(vx, vy), vt2 = Math.hypot(wx, wy);
    const a = 1 / (2 / r1 - vt1 ** 2 / MU);
    const ex = r1 * vy ** 2 / MU - 1, ey = -r1 * vx * vy / MU, e = Math.hypot(ex, ey);
    if (!(a > 0 && e < 1 && vy > 0 && a * (1 - e) > 696340)) return null;
    const omega = Math.atan2(ey, ex), motion = Math.sqrt(MU / a ** 3);
    if (motion * seconds >= TAU) return null;
    const E0 = Math.atan2(-r1 * Math.sin(omega) / (a * Math.sqrt(1 - e * e)), r1 * Math.cos(omega) / a + e);
    const mean0 = E0 - e * Math.sin(E0);
    const dv1 = Math.hypot(vx, vy - base.v1), dv2 = Math.hypot(-base.v2 * Math.sin(theta) - wx, base.v2 * Math.cos(theta) - wy);
    const dE1 = .5 * base.mass * (vt1 ** 2 - base.v1 ** 2), dE2 = .5 * base.mass * (base.v2 ** 2 - vt2 ** 2);
    const mission = { ...base, kind: 'lambert', launchPhase: wrap(phase), seconds, days: seconds / DAY,
      a, aAU: a / AU, e, omega, motion, mean0, vt1, vt2, dv1, dv2, dv: dv1 + dv2,
      dE1, dE2, energyMJ: Math.abs(dE1) + Math.abs(dE2), departureVelocity: { x: vx, y: vy }, arrivalVelocity: { x: wx, y: wy } };
    if (arrivalMiss(mission, phase) > 1) return null;
    return mission;
  }
  function rendezvous(origin = 'earth', destination = 'mars', mass = 1000, phase) {
    const base = transfer(origin, destination, mass);
    if (phase === undefined) phase = base.phase;
    if (!Number.isFinite(phase)) throw new RangeError('O ângulo deve ser finito.');
    const bounds = { minDays: .4 * base.days, maxDays: 2 * base.days };
    if (Math.abs(wrap(phase - base.phase)) < 1e-8) return { ...base, kind: 'hohmann', launchPhase: wrap(phase), search: bounds };
    const count = 200, step = (bounds.maxDays - bounds.minDays) / count;
    let best = null, bestIndex = 0;
    for (let i = 0; i <= count; i++) {
      const trial = lambert(base, phase, (bounds.minDays + i * step) * DAY);
      if (trial && (!best || trial.dv < best.dv)) { best = trial; bestIndex = i; }
    }
    if (!best) throw new RangeError('Não foi encontrada uma transferência elíptica neste intervalo de tempos.');
    // Refine the best sampled basin, without claiming a global optimum.
    let lo = bounds.minDays + Math.max(0, bestIndex - 1) * step, hi = bounds.minDays + Math.min(count, bestIndex + 1) * step;
    for (let i = 0; i < 32; i++) {
      const t1 = lo + (hi - lo) / 3, t2 = hi - (hi - lo) / 3;
      const m1 = lambert(base, phase, t1 * DAY), m2 = lambert(base, phase, t2 * DAY);
      for (const m of [m1, m2]) if (m && m.dv < best.dv) best = m;
      if ((m1?.dv ?? Infinity) < (m2?.dv ?? Infinity)) hi = t2; else lo = t1;
    }
    return { ...best, search: bounds };
  }
  function parseAnswer(input) {
    const value = String(input).trim().replace(',', '.');
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
  }
  function grade(input, reference, tolerance, angular = false) {
    const value = parseAnswer(input);
    if (value === null) return { valid: false, correct: false };
    const error = angular ? Math.abs(wrap(value - reference)) : Math.abs(value - reference);
    return { valid: true, correct: error <= tolerance + 1e-10, error, value };
  }
  const api = Object.freeze({ AU, DAY, MU, planets, wrap, transfer, rendezvous, lambert, eccentricAnomaly, spacecraft, planetPositions, arrivalMiss, parseAnswer, grade });
  root.OrbitalPhysics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);

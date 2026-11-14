(function (root) {
  'use strict';
  const P = root.OrbitalPhysics;
  const fmt = (value, digits = 2) => Number(value).toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const number = (value, digits = 2) => fmt(value, digits).replace(/\s/g, '').replace(',', '{,}');
  const equation = source => '<div class="guide-equation">' + root.OrbitalMath.tex(source, true) + '</div>';
  const label = id => P.planets[id].shortName || P.planets[id].name;

  // Always an analytic Hohmann reference, independent of the simulator's Lambert phase.
  function reference(mission) {
    return P.transfer(mission.origin, mission.destination, mission.mass);
  }
  function workedExample(m) {
    const n1 = m.n1 * P.DAY * 180 / Math.PI, n2 = m.n2 * P.DAY * 180 / Math.PI;
    const period1 = 360 / n1, period2 = 360 / n2;
    const rawPhase = 180 - n2 * m.days;
    const fact = (title, value) => '<div class="guide-fact"><span>' + title + '</span><strong>' + value + '</strong></div>';
    const facts = fact('Raio da origem', fmt(m.r1 / P.AU, 6) + ' UA')
      + fact('Raio do destino', fmt(m.r2 / P.AU, 6) + ' UA')
      + fact('Massa da nave', fmt(m.mass, 0) + ' kg')
      + fact('Período do destino', fmt(period2, 3) + ' dias');
    const calculations = '<h3>1. Dimensão da elipse</h3>'
      + equation('a=\\frac{' + number(m.r1 / P.AU, 6) + '+' + number(m.r2 / P.AU, 6) + '}{2}=' + number(m.aAU, 6) + '\\,\\mathrm{UA}')
      + equation('a=' + number(m.a, 3) + '\\,\\mathrm{km}')
      + '<h3>2. Tempo de viagem</h3>'
      + equation('t_H=\\pi\\sqrt{\\frac{' + number(m.a, 3) + '^3}{1{,}32712440018\\times10^{11}}}\\;\\mathrm{s}')
      + equation('t_H\\approx' + number(m.seconds, 0) + '\\,\\mathrm{s}\\approx' + number(m.days, 2) + '\\,\\mathrm{dias}')
      + '<h3>3. Fase inicial</h3>'
      + equation('n_2=\\frac{360^\\circ}{' + number(period2, 3) + '}\\approx' + number(n2, 6) + '\\;^\\circ/\\mathrm{dia}')
      + equation('\\varphi\\approx180^\\circ-' + number(n2, 6) + '\\times' + number(m.days, 2) + '^\\circ')
      + equation('\\varphi\\approx' + number(rawPhase, 2) + '^\\circ\\equiv' + number(m.phase, 2) + '^\\circ\\pmod{360^\\circ}')
      + '<h3>4. Repetição do alinhamento</h3>'
      + equation('T_1=' + number(period1, 3) + '\\,\\mathrm{dias},\\quad n_1\\approx' + number(n1, 6) + '\\;^\\circ/\\mathrm{dia}')
      + equation('S=\\frac{360^\\circ}{|' + number(n1, 6) + '-' + number(n2, 6) + '|}\\approx' + number(m.synodicDays, 2) + '\\,\\mathrm{dias}')
      + '<h3>5. Variações de velocidade</h3>'
      + equation('v_1=' + number(m.v1, 3) + ',\\quad v_{t1}=' + number(m.vt1, 3) + '\\quad[\\mathrm{km/s}]')
      + equation('\\Delta v_1=|' + number(m.vt1, 3) + '-' + number(m.v1, 3) + '|\\approx' + number(m.dv1, 3) + '\\,\\mathrm{km/s}')
      + equation('v_2=' + number(m.v2, 3) + ',\\quad v_{t2}=' + number(m.vt2, 3) + '\\quad[\\mathrm{km/s}]')
      + equation('\\Delta v_2=|' + number(m.v2, 3) + '-' + number(m.vt2, 3) + '|\\approx' + number(m.dv2, 3) + '\\,\\mathrm{km/s}')
      + equation('\\Delta v_{\\mathrm{total}}\\approx' + number(m.dv, 3) + '\\,\\mathrm{km/s}')
      + '<h3>6. Variações de energia cinética</h3>'
      + equation('\\Delta E_1=\\tfrac12\\times' + number(m.mass, 0) + '\\times(' + number(m.vt1, 3) + '^2-' + number(m.v1, 3) + '^2)\\;\\mathrm{MJ}')
      + equation('\\Delta E_1\\approx' + number(m.dE1, 2) + '\\,\\mathrm{MJ}')
      + equation('\\Delta E_2=\\tfrac12\\times' + number(m.mass, 0) + '\\times(' + number(m.v2, 3) + '^2-' + number(m.vt2, 3) + '^2)\\;\\mathrm{MJ}')
      + equation('\\Delta E_2\\approx' + number(m.dE2, 2) + '\\,\\mathrm{MJ}')
      + equation('|\\Delta E_1|+|\\Delta E_2|\\approx' + number(m.energyMJ, 2) + '\\,\\mathrm{MJ}')
      + '<p>Os valores apresentados estão arredondados; o programa conserva os algarismos intermédios. Mantém mais casas decimais na calculadora para reproduzir os resultados.</p>';
    return { facts, calculations };
  }
  function refresh(mission, valid = true) {
    const m = reference(valid ? mission : P.transfer());
    const example = workedExample(m);
    document.getElementById('guide-example-route').textContent = label(m.origin) + ' → ' + label(m.destination);
    document.getElementById('guide-example-note').textContent = !valid
      ? 'A configuração atual é inválida. Este exemplo usa Terra–Marte, 1 000 kg e a fase ideal de Hohmann.'
      : mission.kind === 'lambert'
        ? 'Referência de Hohmann para os planetas e a massa escolhidos. O simulador está noutra fase; os resultados desta referência não descrevem essa trajetória alternativa.'
        : 'Referência de Hohmann para os planetas e a massa escolhidos no simulador.';
    document.getElementById('guide-example-data').innerHTML = example.facts;
    document.getElementById('guide-example-calculations').innerHTML = example.calculations;
  }
  function init() {
    const dialog = document.getElementById('model-dialog');
    const tabs = Array.from(dialog.querySelectorAll('[role="tab"]'));
    const body = dialog.querySelector('.guide-body');
    function selectTab(tab, focus = false) {
      tabs.forEach(item => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
      });
      body.scrollTop = 0;
      if (focus) tab.focus();
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); selectTab(tabs[next], true); }
      });
    });
    dialog.addEventListener('close', () => document.body.classList.remove('guide-open'));
    document.getElementById('guide-planet-data').innerHTML = Object.values(P.planets)
      .map(planet => '<tr><th scope="row">' + planet.name + '</th><td>' + fmt(planet.au, 6) + '</td></tr>').join('');
    refresh(P.transfer());
  }
  const api = Object.freeze({ init, refresh, reference, workedExample });
  root.OrbitalGuide = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);

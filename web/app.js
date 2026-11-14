(function () {
  'use strict';
  const P = window.OrbitalPhysics, $ = id => document.getElementById(id);
  const name = id => P.planets[id].shortName || P.planets[id].name;
  const fmt = (v, digits = 1) => Number(v).toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const state = { mission: P.transfer(), phase: P.transfer().phase, progress: 0, playing: false, speed: 1, lastFrame: null, view: 'simulador', frame: null, valid: true };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let geometry = null;
  function rangeFill(input) { input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`); }
  function distanceText(km) { return km < 1 ? '≈ 0 km' : km >= 1e6 ? `${fmt(km / 1e6, 2)} milhões de km` : `${fmt(km, 0)} km`; }
  function setText(id, value) { $(id).textContent = value; }
  function initializeControls() {
    for (const [id, planet] of Object.entries(P.planets)) {
      for (const input of ['origin', 'destination']) {
        const option = document.createElement('option'); option.value = id; option.textContent = planet.name; $(input).append(option);
      }
    }
    $('origin').value = 'earth'; $('destination').value = 'mars';
    ['origin', 'destination'].forEach(id => $(id).addEventListener('change', configureFromControls));
    $('mass').addEventListener('input', configureMass);
    $('phase').addEventListener('input', () => configurePhase(Number($('phase').value)));
    $('align').addEventListener('click', () => configurePhase(state.mission.phase));
    $('play').addEventListener('click', () => state.playing ? pause() : play());
    $('reset').addEventListener('click', () => seek(0));
    $('timeline').addEventListener('input', () => seek(Number($('timeline').value) / 1000));
    $('speed').addEventListener('change', () => { state.speed = Number($('speed').value); });
    $('experiment-phase').addEventListener('click', () => {
      if (!state.valid) return;
      configurePhase(P.wrap(state.mission.phase + 25));
      if (!state.valid) return;
      showExperiment(`Com mais 25° de fase, a trajetória foi recalculada para encontrar ${name(state.mission.destination)}: ${fmt(state.mission.days)} dias e Δv total de ${fmt(state.mission.dv, 2)} km/s. Usa «Usar a fase ideal» para comparar com Hohmann.`);
      if (!reducedMotion) play();
      $('map-title').scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    });
    $('experiment-mass').addEventListener('click', () => {
      if (!state.valid) return;
      const before = P.rendezvous(state.mission.origin, state.mission.destination, 1000, state.phase);
      $('mass').value = '2000'; configureMass();
      showExperiment(`1 000 kg → ${fmt(before.energyMJ, 0)} MJ. 2 000 kg → ${fmt(state.mission.energyMJ, 0)} MJ. A energia duplica; o tempo (${fmt(before.days)} dias), o Δv (${fmt(before.dv, 2)} km/s) e a trajetória mantêm-se.`);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('hashchange', navigate);
    $('open-model').addEventListener('click', () => {
      pause();
      window.OrbitalGuide.refresh(state.mission, state.valid);
      $('model-dialog').showModal();
      document.body.classList.add('guide-open');
    });
    $('close-model').addEventListener('click', () => $('model-dialog').close());
    $('model-dialog').addEventListener('click', event => { if (event.target === $('model-dialog')) { const rect = $('model-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('model-dialog').close(); } });
  }
  function showExperiment(text) { $('experiment-result').hidden = false; setText('experiment-result', text); window.OrbitalMath.format($('experiment-result')); }
  function configurePhase(phase) {
    const ideal = P.transfer($('origin').value, $('destination').value).phase;
    if (Math.abs(P.wrap(phase - ideal)) <= .05) phase = ideal; // Match the slider's 0.1° display precision.
    pause(); state.phase = phase; state.progress = 0; $('experiment-result').hidden = true;
    try {
      state.mission = P.rendezvous($('origin').value, $('destination').value, P.parseAnswer($('mass').value), phase);
      setValid(true); updateMission();
    } catch (error) {
      setValid(false, error.message);
      // Keep phase controls available so a numerical failure can be corrected.
      $('phase').disabled = false; $('align').disabled = false;
      setText('phase-value', `${fmt(phase)}°`); rangeFill($('phase'));
    }
  }
  function setValid(valid, message = '') {
    state.valid = valid;
    $('orbit-map').style.opacity = valid ? '1' : '.25';
    $('orbit-map').setAttribute('aria-label', valid ? 'Mapa da missão configurada' : 'Configuração inválida; mapa anterior desativado.');
    $('route-error').hidden = !message; setText('route-error', message);
    ['play', 'phase', 'align', 'timeline', 'reset', 'experiment-phase', 'experiment-mass'].forEach(id => $(id).disabled = !valid);
    if (!valid) { pause(); ['metric-time','metric-a','metric-phase','metric-window','control-energy','control-dv'].forEach(id => setText(id, '—')); setText('mission-status', 'Configuração inválida'); $('energy-details').hidden = true; }
  }
  function configureFromControls() {
    pause(); $('experiment-result').hidden = true;
    const origin = $('origin').value, destination = $('destination').value;
    if (origin === destination) { setValid(false, 'Escolhe uma origem diferente do destino.'); return; }
    const mass = P.parseAnswer($('mass').value);
    if (mass === null || mass < 100 || mass > 10000) { configureMass(); return; }
    setValid(true); state.mission = P.transfer(origin, destination, mass); state.phase = state.mission.phase; state.progress = 0;
    updateMission();
  }
  function configureMass() {
    const mass = P.parseAnswer($('mass').value), valid = mass !== null && mass >= 100 && mass <= 10000;
    $('mass-error').hidden = valid; $('mass').setAttribute('aria-invalid', String(!valid));
    if (!valid) { setText('mass-error', 'Introduz uma massa entre 100 e 10 000 kg.'); setValid(false); return; }
    if ($('origin').value === $('destination').value) { setValid(false, 'Escolhe uma origem diferente do destino.'); return; }
    const changedRoute = state.mission.origin !== $('origin').value || state.mission.destination !== $('destination').value;
    try { state.mission = P.rendezvous($('origin').value, $('destination').value, mass, changedRoute ? undefined : state.phase); }
    catch (error) { setValid(false, error.message); $('phase').disabled = false; $('align').disabled = false; return; }
    setValid(true);
    if (changedRoute) { state.phase = state.mission.phase; seek(0); }
    updateMission();
  }
  function updateMission() {
    const m = state.mission;
    setText('metric-time', fmt(m.days)); setText('metric-a', fmt(m.aAU, 3)); setText('metric-phase', fmt(m.phase)); setText('metric-window', fmt(m.synodicDays, 0));
    setText('control-energy', `${fmt(m.energyMJ, 0)} MJ`);
    const reference = P.transfer(m.origin, m.destination, m.mass), alternative = m.kind === 'lambert';
    setText('control-dv', `${fmt(m.dv, 2)} km/s`);
    $('non-hohmann-notice').hidden = !alternative;
    $('energy-details').hidden = alternative;
    setText('transfer-type', alternative ? 'Trajetória de encontro recalculada' : 'Transferência de Hohmann');
    setText('transfer-comparison', `Hohmann: ${fmt(reference.days)} dias · Δv ${fmt(reference.dv, 2)} km/s. ${alternative ? `Esta trajetória: ${fmt(m.days)} dias · Δv ${fmt(m.dv, 2)} km/s.` : 'Fase ideal.'}`);
    setText('transfer-policy', `Fora da fase ideal, procuramos o menor Δv entre trajetórias elípticas diretas, sem voltas completas, com tempos entre ${fmt(.4 * reference.days)} e ${fmt(2 * reference.days)} dias. É uma procura numérica limitada, não a única solução possível. Uma alternativa pode ser mais rápida ou mais lenta.`);
    setText('metric-phase-caption', `${name(m.destination)} ${m.phase >= 0 ? 'à frente de' : 'atrás de'} ${name(m.origin)}`);
    $('map-title').innerHTML = `${name(m.origin)} <span class="route-arrow">→</span> ${name(m.destination)}`;
    setText('orbit-title', `Transferência orbital de ${name(m.origin)} para ${name(m.destination)}`);
    $('mission-title').innerHTML = `Como chegamos a <span>${name(m.destination)}?</span>`;
    setText('origin-legend', name(m.origin)); setText('destination-legend', name(m.destination));
    $('origin-key').style.background = P.planets[m.origin].color; $('destination-key').style.background = P.planets[m.destination].color;
    setText('departure-step', `Δv = ${fmt(m.dv1, 2)} km/s · ajustar a velocidade${alternative ? ' e a direção' : ''}.`);
    setText('arrival-step', `Δv final ideal = ${fmt(m.dv2, 2)} km/s. Não representa captura pelo planeta.`);
    drawGeometry(); updatePhase(); updateFrame(); window.OrbitalMath.format($('view-simulador'));
    if (state.view === 'aprender') renderLearning();
  }
  function updatePhase() {
    $('phase').value = String(state.phase); rangeFill($('phase')); setText('phase-value', `${fmt(state.phase)}°`);
    updateFrame();
  }
  function mapPoint(x, y) {
    const rotation = -18 * Math.PI / 180, s = geometry.scale;
    return { x: 400 + (x * Math.cos(rotation) - y * Math.sin(rotation)) * s, y: 264 - (x * Math.sin(rotation) + y * Math.cos(rotation)) * s };
  }
  function pathOf(points) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }
  function drawGeometry() {
    const m = state.mission;
    const samples = Array.from({ length: 201 }, (_, i) => P.spacecraft(m, i / 200));
    geometry = { scale: 195 / Math.max(m.r1 / P.AU, m.r2 / P.AU, ...samples.map(p => p.r)) };
    const symbolRadius = { mercury: 4, venus: 6, earth: 6, mars: 4.5, jupiter: 12, saturn: 11, uranus: 9, neptune: 9, pluto: 3.5 };
    const scale = geometry.scale, originColor = P.planets[m.origin].color, destinationColor = P.planets[m.destination].color;
    const trail = Array.from({ length: 201 }, (_, i) => { const p = P.spacecraft(m, i / 200); return mapPoint(p.x, p.y); });
    const endpoint = P.spacecraft(m, 1), arrival = mapPoint(endpoint.x, endpoint.y), depart = mapPoint(m.r1 / P.AU, 0);
    $('orbit-geometry').innerHTML = `
      <line x1="400" y1="49" x2="400" y2="479" stroke="var(--map-axis)" stroke-dasharray="2 7" opacity=".35"/><line x1="185" y1="264" x2="615" y2="264" stroke="var(--map-axis)" stroke-dasharray="2 7" opacity=".35"/>
      <circle cx="400" cy="264" r="${m.r1 / P.AU * scale}" stroke="${originColor}" stroke-opacity=".42" stroke-width="1.1" fill="none"/>
      <circle cx="400" cy="264" r="${m.r2 / P.AU * scale}" stroke="${destinationColor}" stroke-opacity=".42" stroke-width="1.1" fill="none"/>
      <path d="${pathOf(trail)}" fill="none" stroke="var(--map-path)" stroke-width="1.6" stroke-dasharray="5 6" opacity=".65"/>
      <path id="flight-trail" fill="none" stroke="var(--map-trail)" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="400" cy="264" r="47" fill="url(#sun-halo)"/><circle cx="400" cy="264" r="22" fill="#ffbf72"/>
      <text x="400" y="305" text-anchor="middle" style="font-size:12px;fill:var(--map-subtle);letter-spacing:2px">SOL</text>
      <circle cx="${depart.x}" cy="${depart.y}" r="4" fill="var(--map-bg)" stroke="var(--map-path)"/>
      <circle cx="${arrival.x}" cy="${arrival.y}" r="13" fill="none" stroke="var(--map-subtle)" stroke-dasharray="3 4" opacity=".65"/>
      <text x="${arrival.x - 18}" y="${arrival.y - 22}" text-anchor="end" style="font-size:12px;fill:var(--map-subtle)">PONTO DE ENCONTRO</text>
      <path id="phase-arc" fill="none" stroke="var(--map-path)" stroke-width="1" opacity=".55"/>
      <line id="arrival-miss-line" stroke="#ff956b" stroke-width="1.4" stroke-dasharray="4 5"/>
      <text x="31" y="45" style="font-size:12px;fill:var(--map-subtle);letter-spacing:2px">VISTA SUPERIOR</text>
      <line x1="665" x2="745" y1="459" y2="459" stroke="var(--map-subtle)"/><line x1="665" x2="665" y1="455" y2="463" stroke="var(--map-subtle)"/><line x1="745" x2="745" y1="455" y2="463" stroke="var(--map-subtle)"/><text x="705" y="481" text-anchor="middle" style="font-size:12px;fill:var(--map-subtle)">${fmt(80 / scale, 2)} UA</text>`;
    $('orbit-moving').innerHTML = `<g id="body-origin"><circle r="14" fill="${originColor}" opacity=".08"/><circle r="${symbolRadius[m.origin]}" fill="${originColor}" stroke="#e9f3ff" stroke-width=".6"/><text id="label-origin" x="15" y="-12">${name(m.origin)}</text></g><g id="body-destination"><circle r="15" fill="${destinationColor}" opacity=".09"/><circle r="${symbolRadius[m.destination]}" fill="${destinationColor}" stroke="#ffe2d4" stroke-width=".6"/><text id="label-destination" x="16" y="-12">${name(m.destination)}</text></g><g id="body-spacecraft"><circle r="14" fill="#fff3dc" opacity=".1"/><path d="M 0,-5 L 5,0 L 0,5 L -5,0 Z" fill="var(--map-ship)" stroke="#fff" stroke-width=".8"/><text id="label-spacecraft" x="12" y="21" style="font-size:12px;fill:var(--map-text)">NAVE</text></g>`;
  }
  function updateFrame() {
    if (!geometry) return;
    const m = state.mission, sc = P.spacecraft(m, state.progress), planets = P.planetPositions(m, state.progress, state.phase);
    const origin = mapPoint(planets.origin.x, planets.origin.y), destination = mapPoint(planets.destination.x, planets.destination.y), ship = mapPoint(sc.x, sc.y);
    for (const [id, point] of [['body-origin', origin], ['body-destination', destination], ['body-spacecraft', ship]]) $(id).setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
    // Labels remain readable when markers meet, even at very different orbital radii.
    $('label-spacecraft').style.opacity = state.progress < .025 || (state.progress > .98 && P.arrivalMiss(m, state.phase) <= 10000) ? '0' : '1';
    if (Math.hypot(origin.x - destination.x, origin.y - destination.y) < 55) { $('label-destination').setAttribute('y', '27'); } else $('label-destination').setAttribute('y', '-12');
    const trail = Array.from({ length: 81 }, (_, i) => { const p = P.spacecraft(m, state.progress * i / 80); return mapPoint(p.x, p.y); });
    $('flight-trail').setAttribute('d', pathOf(trail));
    const radians = state.phase * Math.PI / 180;
    const arc = Array.from({ length: 35 }, (_, i) => mapPoint(48 / geometry.scale * Math.cos(radians * i / 34), 48 / geometry.scale * Math.sin(radians * i / 34)));
    $('phase-arc').setAttribute('d', pathOf(arc)); $('phase-arc').style.opacity = state.progress < .002 ? '.55' : '0';
    const showMiss = state.progress >= .999 && P.arrivalMiss(m, state.phase) > 10000;
    const missLine = $('arrival-miss-line'); missLine.style.opacity = showMiss ? '.9' : '0';
    missLine.setAttribute('x1', ship.x); missLine.setAttribute('y1', ship.y); missLine.setAttribute('x2', destination.x); missLine.setAttribute('y2', destination.y);
    $('flight-day').innerHTML = `Dia ${fmt(sc.days, 0)} <small>/ ${fmt(m.days, 0)}</small>`;
    $('flight-speed').innerHTML = `${fmt(sc.speed, 2)} <small>km/s</small>`;
    $('flight-radius').innerHTML = `${fmt(sc.r, 2)} <small>UA</small>`;
    $('timeline').value = String(state.progress * 1000); $('timeline').setAttribute('aria-valuetext', `Dia ${fmt(sc.days, 0)} de ${fmt(m.days, 0)}`); rangeFill($('timeline'));
    let status = state.playing ? 'Em transferência' : state.progress > 0 ? 'Missão em pausa' : 'Pronta para partir';
    if (state.progress >= 1) status = showMiss ? 'Encontro falhado' : 'Encontro previsto atingido';
    if (state.valid) setText('mission-status', status);
    $('mission-status').classList.toggle('running', state.playing);
  }

  function pause() { state.playing = false; state.lastFrame = null; if (state.frame !== null) cancelAnimationFrame(state.frame); state.frame = null; setText('play-symbol', '▶'); setText('play-label', state.progress >= 1 ? 'Repetir missão' : state.progress > 0 ? 'Continuar' : 'Iniciar missão'); updateFrame(); }
  function seek(progress) { pause(); state.progress = Math.max(0, Math.min(1, progress)); updateFrame(); setText('play-label', state.progress >= 1 ? 'Repetir missão' : state.progress > 0 ? 'Continuar' : 'Iniciar missão'); }
  function play() { if (!state.valid) return; if (state.playing) return; if (state.progress >= 1) state.progress = 0; state.playing = true; state.lastFrame = null; setText('play-symbol', 'Ⅱ'); setText('play-label', 'Pausar'); state.frame = requestAnimationFrame(animate); }
  function animate(timestamp) { if (!state.playing) return; if (state.lastFrame !== null) state.progress = Math.min(1, state.progress + Math.min(timestamp - state.lastFrame, 100) / 26000 * state.speed); state.lastFrame = timestamp; updateFrame(); if (state.progress >= 1) { pause(); return; } state.frame = requestAnimationFrame(animate); }
  function navigate() {
    const view = location.hash.slice(1); state.view = ['simulador','aprender','desafios'].includes(view) ? view : 'simulador';
    if (state.view !== 'simulador') pause();
    document.querySelectorAll('.view').forEach(section => section.hidden = section.id !== `view-${state.view}`);
    document.querySelectorAll('[data-view]').forEach(link => { if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    if (state.view === 'aprender') renderLearning();
    if (state.view === 'desafios') renderChallenge();
  }
  const math = expression => window.OrbitalMath.tex(expression, true);
  function renderLearning() {
    const m = P.transfer(state.mission.origin, state.mission.destination, state.mission.mass), earthYear = 2 * Math.PI * Math.sqrt(P.AU ** 3 / P.MU) / P.DAY;
    const n1 = m.n1 * P.DAY * 180 / Math.PI, n2 = m.n2 * P.DAY * 180 / Math.PI;
    const lessons = [
      { title: 'Semi-eixo maior da elipse', result: `${fmt(m.aAU, 3)} UA`, open: true,
        explanation: 'O semi-eixo maior, a, é metade do comprimento maior da elipse. Nesta transferência, calcula-se fazendo a média dos raios das duas órbitas — não é a distância entre os planetas.',
        formula: "a=\\frac{r_1+r_2}{2}",
        takeaway: 'r₁ e r₂ são distâncias ao Sol, medidas na mesma unidade.' },
      { title: 'Tempo de viagem', result: `${fmt(m.days)} dias`,
        explanation: 'A 3.ª lei de Kepler relaciona o tamanho de uma órbita com o tempo de uma volta completa. Para órbitas em torno do Sol, usando a em UA e T em anos terrestres, T² ≈ a³. Na transferência de Hohmann, a nave percorre metade da elipse.',
        formula: "T\\approx\\sqrt{a^3}\\qquad t=\\frac{T}{2}",
        takeaway: 'T é o período da elipse inteira. t é o tempo até ao destino. Usa cerca de 365,25 dias por ano.' },
      { title: 'Fase de lançamento', result: `${fmt(m.phase)}°`,
        explanation: 'Durante a viagem, o planeta continua em movimento. Calcula primeiro os graus que percorre por dia (n). Multiplica pelo tempo de viagem. A nave chega ao lado oposto da posição inicial de partida, a 180°.',
        formula: "n=\\frac{360^\\circ}{T_{\\mathrm{destino}}}\\qquad\\varphi=180^\\circ-nt",
        takeaway: `Ângulos que diferem de 360° são a mesma direção. Na escala de −180° a 180°, a fase ideal é ${fmt(m.phase, 2)}°. Um valor positivo significa destino à frente da origem; negativo, atrás.` },
      { title: 'Repetição da janela de lançamento', result: `${fmt(m.synodicDays, 0)} dias`,
        explanation: 'A diferença entre as velocidades angulares dos planetas determina a variação da fase por dia. Divide uma volta completa por essa diferença para saber quando a mesma configuração se repete.',
        formula: "S=\\frac{360^\\circ}{|n_1-n_2|}",
        takeaway: 'Esta é a repetição de uma configuração ideal. Não é a duração da janela nem uma previsão de uma data real de lançamento.' },
      { title: 'Variação de velocidade', result: `${fmt(m.dv, 2)} km/s`,
        explanation: 'Δ significa «variação». Δv mede quanto temos de mudar a velocidade com o motor. A equação abaixo dá a velocidade numa órbita elíptica.',
        formula: "v=\\sqrt{\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)}",
        takeaway: `μ = GM do Sol = 1,32712440018 × 10¹¹ km³/s². Aqui r e a entram em km. Estas manobras ajustam órbitas em torno do Sol; a travagem para captura pelo planeta é outro problema, não simulado.` },
      { title: 'Variações de energia cinética', result: `${fmt(m.energyMJ, 0)} MJ`,
        explanation: 'A energia cinética depende da massa e do quadrado da velocidade. Para cada manobra, subtrai a energia antes à energia depois. Somamos os módulos das duas variações para medir a energia envolvida, mesmo quando uma manobra reduz a velocidade.',
        formula: "E_c=\\frac12 mv^2",
        takeaway: 'Para obter joules, usa massa em kg e velocidade em m/s. 1 km/s = 1 000 m/s; 1 MJ = 1 000 000 J. O cálculo assume massa constante e não determina o consumo de combustível.' }
    ];
    const calculations = window.OrbitalMath.calculations(m, earthYear, n1, n2);
    $('learning-content').innerHTML = `<div class="basics-grid"><article><h3>Movimento orbital</h3><p>A gravidade curva o movimento. A nave continua a avançar, enquanto a sua trajetória é desviada para o Sol.</p></article><article><h3>Manobras de transferência</h3><p>A primeira manobra coloca a nave na elipse de transferência. Entre as manobras, atua a gravidade do Sol. A segunda ajusta a velocidade à órbita de destino.</p></article><article><h3>Encontro com o destino</h3><p>O destino move-se. A nave deve chegar onde o planeta estará, e não onde o vemos na partida.</p></article></div>
    <div class="learning-intro"><h2>${name(m.origin)} → ${name(m.destination)}</h2><p>Abre cada cartão para consultar a fórmula e a substituição dos valores.</p><div class="facts-row"><span>Raio da origem r₁<strong>${fmt(m.r1 / P.AU, 6)} UA</strong></span><span>Raio do destino r₂<strong>${fmt(m.r2 / P.AU, 6)} UA</strong></span><span>Volta completa do destino<strong>${fmt(360 / n2, 2)} dias</strong></span></div></div>
    <div class="learning-layout"><div>${lessons.map((lesson, i) => `<details class="formula-card" ${lesson.open ? 'open' : ''}><summary><span class="step-number">${String(i + 1).padStart(2, '0')}</span><h3>${lesson.title}</h3><span class="formula-preview">${lesson.result}</span><span class="chevron" aria-hidden="true">›</span></summary><div class="formula-body"><p>${lesson.explanation}</p><div class="math-equation">${math(lesson.formula)}</div><div class="substitution">${calculations[i]}</div><div class="formula-result">${lesson.takeaway}</div></div></details>`).join('')}</div><aside class="concept-sidebar"><article class="concept-card"><h3>Vídeo: transferência de Hohmann</h3><p>Vídeo de Maggie Lieu (Space Mog).</p><a href="https://www.youtube.com/watch?v=Si4OaDzziOg&t=33s" target="_blank" rel="noopener noreferrer">00:33 · A trajetória de Hohmann ↗</a><a href="https://www.youtube.com/watch?v=Si4OaDzziOg&t=204s" target="_blank" rel="noopener noreferrer">03:24 · Quanto tempo demora? ↗</a><a href="https://www.youtube.com/watch?v=Si4OaDzziOg&t=381s" target="_blank" rel="noopener noreferrer">06:21 · Quando lançar? ↗</a><p>No exemplo Terra–Marte, o vídeo arredonda o raio de Marte para 1,5 UA e apresenta cerca de 256 dias, 47° e 766 dias entre oportunidades. O simulador usa 1,523679 UA e valores consistentes sem arredondar as contas intermédias: cerca de 259 dias, 44,3° e 780 dias.</p></article><article class="concept-card"><h3>Glossário</h3><p><strong>UA:</strong> unidade astronómica, a distância média Terra–Sol.</p><p><strong>Período:</strong> tempo de uma volta completa.</p><p><strong>Elipse:</strong> curva fechada alongada, com dois focos.</p><p><strong>Fase:</strong> ângulo entre as direções dos dois planetas, visto do Sol.</p><p><strong>Δv:</strong> variação de velocidade.</p><a href="#desafios">Abrir desafios ↗</a></article></aside></div>`;
    window.OrbitalMath.format($('learning-content'));
  }
  const challenge = { mission: P.transfer(), step: 0, selected: [null, null, null], answers: ['', '', '', ''], feedback: [null, null, null], points: [0, 0, 0], hints: [false, false, false] };
  function newChallenge() {
    const choices = ['venus', 'mars', 'jupiter'].filter(id => id !== challenge.mission.destination);
    challenge.mission = P.transfer('earth', choices[Math.floor(Math.random() * choices.length)], [500,1000,1500,2000][Math.floor(Math.random() * 4)]);
    challenge.step = 0; challenge.selected = [null,null,null]; challenge.answers = ['','','','']; challenge.feedback = [null,null,null]; challenge.points = [0,0,0]; challenge.hints = [false,false,false]; renderChallenge();
  }
  function challengeFields() {
    const m = challenge.mission;
    return [
      { name: 'Semi-eixo maior a', unit: 'UA', ref: m.aAU, tolerance: .01, decimals: 3, hint: 'Faz a média dos dois raios.' },
      { name: 'Tempo de viagem t', unit: 'dias', ref: m.days, tolerance: 3, decimals: 1, hint: 'Calcula o período e divide por dois.' },
      { name: 'Fase de lançamento φ', unit: '°', ref: m.phase, tolerance: 2, decimals: 1, angular: true, hint: 'Subtrai a 180° o ângulo percorrido pelo destino.' },
      { name: 'Repetição da janela S', unit: 'dias', ref: m.synodicDays, tolerance: 4, decimals: 1, hint: 'Divide 360° pela diferença das velocidades angulares.' }
    ];
  }
  function renderChallenge() {
    const m = challenge.mission, step = challenge.step, points = challenge.points.reduce((a,b) => a + b, 0);
    const n1 = m.n1 * P.DAY * 180 / Math.PI, n2 = m.n2 * P.DAY * 180 / Math.PI;
    const descriptions = ['Fase de lançamento', 'Cálculos', 'Efeito da massa'];
    const prompts = [
      { title: 'Fase de lançamento', copy: `Na transferência de Hohmann, a nave vai demorar ${fmt(m.days)} dias. Nesse tempo, ${name(m.destination)} continua a mover-se. Qual é a configuração adequada à partida?`, options: [
        { title: 'Os dois planetas alinhados do mesmo lado do Sol.', text: 'Fase de 0°: partir em direção ao planeta que vemos agora.' },
        { title: `${name(m.destination)} ${m.phase >= 0 ? 'à frente' : 'atrás'} da Terra por ${fmt(Math.abs(m.phase))}°.`, text: 'Deixar o destino avançar até ao ponto de encontro durante a viagem.' },
        { title: 'Os planetas em lados opostos do Sol.', text: 'Fase de 180°: colocar já o destino no ponto final da elipse.' }
      ] },
      { title: 'Cálculo da transferência', copy: 'Calcula o semi-eixo maior, o tempo de viagem, a fase e a repetição da janela. Consulta as fórmulas de apoio; podes usar vírgula ou ponto decimal.' },
      { title: 'Efeito da massa', copy: `A missão foi planeada para ${fmt(m.mass, 0)} kg. A equipa aumenta a massa para ${fmt(m.mass * 2, 0)} kg, mantendo a mesma órbita e as mesmas velocidades. O que acontece ao tempo de viagem e à energia das manobras?`, options: [
        { title: 'O tempo e a energia duplicam.', text: 'Uma nave mais pesada demora duas vezes mais a percorrer a mesma órbita.' },
        { title: 'O tempo mantém-se e a energia duplica.', text: 'A órbita determina o tempo; para a mesma velocidade, a energia é proporcional à massa.' },
        { title: 'O tempo e a energia mantêm-se.', text: 'No espaço não é preciso energia para alterar a velocidade.' }
      ] }
    ];
    const current = prompts[step];
    $('challenge-content').innerHTML = `<div class="challenge-tabs" aria-label="Escolher desafio">${descriptions.map((title, i) => `<button type="button" data-challenge-step="${i}" aria-pressed="${i === step}"><span class="step-number">${i + 1}</span>${title}</button>`).join('')}</div>
    <div class="challenge-layout"><article class="question-card"><span class="eyebrow">DESAFIO ${step + 1} DE 3 <span>/</span> ${step === 1 ? '40' : '30'} PONTOS</span><h2>${current.title}</h2><p>${current.copy}</p>
    <div class="challenge-data"><span>Missão<strong>Terra → ${name(m.destination)}</strong></span><span>Massa da nave<strong>${fmt(m.mass,0)} kg</strong></span>${step === 1 ? `<span>r₁ da Terra<strong>1 UA</strong></span><span>r₂ do destino<strong>${fmt(m.r2 / P.AU, 6)} UA</strong></span><span>n₁ da Terra<strong>${fmt(n1, 6)} °/dia</strong></span><span>n₂ do destino<strong>${fmt(n2, 6)} °/dia</strong></span>` : ''}</div>
    <form id="challenge-form" novalidate>${step === 1 ? `<div class="answer-grid">${challengeFields().map((field, i) => `<div class="answer-item"><label for="answer-${i}">${field.name} (${field.unit})</label><input id="answer-${i}" type="text" inputmode="decimal" autocomplete="off" placeholder="Resposta" aria-describedby="tolerance-${i} answer-feedback-${i}"><span class="answer-tolerance" id="tolerance-${i}">Tolerância: ±${fmt(field.tolerance, field.tolerance < 1 ? 2 : 0)} ${field.unit}</span><p id="answer-feedback-${i}" class="answer-feedback"></p></div>`).join('')}</div>` : `<fieldset class="options"><legend>Seleciona uma resposta.</legend>${current.options.map((option, i) => `<label class="option"><input type="radio" name="choice" value="${i}" ${challenge.selected[step] === i ? 'checked' : ''}><span>${option.title}<span class="option-description">${option.text}</span></span></label>`).join('')}</fieldset>`}
    <div class="question-actions"><button type="submit" class="play-button">Verificar ${step === 1 ? 'cálculos' : 'resposta'} <span aria-hidden="true">↗</span></button><button type="button" class="text-button" id="hint-button" aria-expanded="${challenge.hints[step]}" aria-controls="hint-content">${challenge.hints[step] ? 'Ocultar pista' : 'Mostrar pista'}</button></div></form>
    <div id="hint-content" class="hint-box" ${challenge.hints[step] ? '' : 'hidden'}>${[
      'Ao fim da viagem, a nave está a 180° da direção inicial da Terra. Quanto avançará o destino até lá? A posição de partida tem de compensar esse avanço.',
      `<div class="hint-formulas">${window.OrbitalMath.support.slice(0,5).map(math).join('')}</div>Para a fase, podes somar ou subtrair voltas completas de 360°.`,
      'Compara T² ≈ a³ com E = ½mv². Qual das expressões depende da massa? Substitui m por 2m, mantendo a e v.'
    ][step]}</div><div id="challenge-feedback" role="status" aria-live="polite"></div>
    <div class="question-actions"><button type="button" class="secondary-button" id="challenge-next">${step < 2 ? 'Próximo desafio →' : 'Voltar ao primeiro ↺'}</button><button type="button" class="text-button" id="challenge-simulate">Ver esta missão no simulador ↗</button></div></article>
    <aside class="concept-sidebar"><article class="concept-card"><h3>Pontuação</h3><div class="score-display" id="score">${points}<small> / 100</small></div><div class="score-track"><span id="score-bar" style="width:${points}%"></span></div><p>Fase: 30 pontos. Cálculos: 40 pontos. Massa: 30 pontos. As respostas podem ser corrigidas.</p><div class="mission-summary">Missão: <strong>Terra → ${name(m.destination)}</strong></div></article><article class="concept-card"><span class="eyebrow">FÓRMULAS DE APOIO</span>${window.OrbitalMath.support.map(source => `<div class="challenge-formula">${math(source)}</div>`).join('')}<p>Na lei de Kepler simplificada, a está em UA e T em anos. Nos cálculos de fase, t está em dias e n em graus por dia.</p><a href="#aprender">Consultar os cálculos ↗</a></article></aside></div>`;
    document.querySelectorAll('[data-challenge-step]').forEach(button => button.addEventListener('click', () => { challenge.step = Number(button.dataset.challengeStep); renderChallenge(); }));
    if (step === 1) challenge.answers.forEach((value, i) => { $(`answer-${i}`).value = value; $(`answer-${i}`).addEventListener('input', event => { challenge.answers[i] = event.target.value; }); });
    else document.querySelectorAll('input[name="choice"]').forEach(input => input.addEventListener('change', () => { challenge.selected[step] = Number(input.value); }));
    $('challenge-form').addEventListener('submit', event => { event.preventDefault(); gradeChallenge(); });
    $('hint-button').addEventListener('click', () => { challenge.hints[step] = !challenge.hints[step]; $('hint-content').hidden = !challenge.hints[step]; $('hint-button').setAttribute('aria-expanded', String(challenge.hints[step])); setText('hint-button', challenge.hints[step] ? 'Ocultar pista' : 'Mostrar pista'); });
    $('challenge-next').addEventListener('click', () => { challenge.step = (step + 1) % 3; renderChallenge(); });
    $('challenge-simulate').addEventListener('click', () => { $('origin').value = m.origin; $('destination').value = m.destination; $('mass').value = String(m.mass); configureFromControls(); location.hash = 'simulador'; });
    showChallengeFeedback(); window.OrbitalMath.format($('challenge-content'));
  }
  function gradeChallenge() {
    const step = challenge.step, m = challenge.mission;
    if (step === 1) {
      const results = challengeFields().map((field, i) => P.grade(challenge.answers[i], field.ref, field.tolerance, field.angular));
      challenge.points[step] = results.filter(result => result.correct).length * 10;
      challenge.feedback[step] = { correct: results.every(result => result.correct), results, title: `${results.filter(result => result.correct).length} de 4 cálculos corretos.`, copy: 'Cada campo vale 10 pontos. Os valores de referência aparecem junto às respostas.' };
    } else {
      if (challenge.selected[step] === null) { challenge.feedback[step] = { correct: false, title: 'Falta escolher uma opção.', copy: 'Seleciona uma resposta antes de verificar.' }; showChallengeFeedback(); return; }
      const correct = challenge.selected[step] === 1;
      challenge.points[step] = correct ? 30 : 0;
      const n2 = m.n2 * P.DAY * 180 / Math.PI;
      const explanation = step === 0 ? `${name(m.destination)} avança ${fmt(n2 * m.days)}° durante os ${fmt(m.days)} dias de viagem. Por isso, deve começar a ${fmt(m.phase)}° da Terra (considerando voltas completas de 360°). Mantendo esta trajetória de Hohmann e mudando só a fase, falharíamos o encontro. Ao alterar a fase no simulador, a trajetória é recalculada para manter o encontro.` : `A massa não aparece na lei de Kepler para esta órbita em torno do Sol: o tempo mantém-se em ${fmt(m.days)} dias. A energia é proporcional à massa: passa de ${fmt(m.energyMJ, 0)} para ${fmt(2 * m.energyMJ, 0)} MJ. Isto pressupõe conseguir executar as mesmas mudanças de velocidade.`;
      challenge.feedback[step] = { correct, title: correct ? 'Resposta correta.' : 'Resposta incorreta.', copy: explanation };
    }
    showChallengeFeedback(); window.OrbitalMath.format($('challenge-content'));
  }
  function showChallengeFeedback() {
    const feedback = challenge.feedback[challenge.step], points = challenge.points.reduce((a,b) => a + b, 0);
    $('score').innerHTML = `${points}<small> / 100</small>`; $('score-bar').style.width = `${points}%`;
    if (!feedback) { $('challenge-feedback').innerHTML = ''; return; }
    $('challenge-feedback').innerHTML = `<div class="feedback ${feedback.correct ? 'correct' : ''}"><strong>${feedback.title}</strong><p>${feedback.copy}</p></div>`;
    if (feedback.results && challenge.step === 1) feedback.results.forEach((result, i) => {
      const field = challengeFields()[i], output = $(`answer-feedback-${i}`);
      $(`answer-${i}`).setAttribute('aria-invalid', String(!result.correct)); output.classList.toggle('correct', result.correct);
      output.textContent = !result.valid ? 'Introduz um número válido (por exemplo, 1,26). Não incluas a unidade no campo.' : result.correct ? `Correto. Referência: ${fmt(field.ref, field.decimals)} ${field.unit}.` : `Referência: ${fmt(field.ref, field.decimals)} ${field.unit}. ${field.hint}`;
    });
  }
  function readMission() { return { origin: state.mission.origin, destination: state.mission.destination, massKg: state.mission.mass, phaseDegrees: state.phase, idealPhaseDegrees: state.mission.phase, days: state.mission.days, dvKmS: state.mission.dv, energyMJ: state.mission.energyMJ, transferKind: state.mission.kind || 'hohmann', search: state.mission.search, progress: state.progress, playing: state.playing, valid: state.valid, arrivalMissKm: P.arrivalMiss(state.mission,state.phase), view: state.view, challenge: { step: challenge.step, destination: challenge.mission.destination, points: challenge.points.slice(), total: challenge.points.reduce((a,b) => a+b,0) } }; }
  function registerTools() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== 'function') return;
    const lifecycle = new AbortController(); window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
    const register = tool => { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Browser may expose an experimental, unsupported API. */ } };
    register({ name: 'orbital_read_mission', title: 'Ler a missão orbital', description: 'Lê os parâmetros, resultados e progresso atuais do simulador.', inputSchema: { type:'object', properties:{}, additionalProperties:false }, annotations:{ readOnlyHint:true }, execute: () => readMission() });
    register({ name: 'orbital_configure_mission', title: 'Configurar uma missão orbital', description: 'Configura origem, destino, massa e fase. Atualiza o simulador e volta ao início da viagem.', inputSchema: { type:'object', properties:{ origin:{type:'string',enum:Object.keys(P.planets)}, destination:{type:'string',enum:Object.keys(P.planets)}, massKg:{type:'number',minimum:100,maximum:10000}, phaseDegrees:{type:'number',minimum:-180,maximum:180} }, required:['origin','destination','massKg'], additionalProperties:false }, annotations:{ readOnlyHint:false }, execute: input => {
      if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['origin','destination','massKg','phaseDegrees'].includes(k))) throw new Error('Parâmetros inválidos.');
      P.transfer(input.origin,input.destination,input.massKg);
      if (!Number.isFinite(input.massKg) || input.massKg < 100 || input.massKg > 10000 || input.phaseDegrees !== undefined && (!Number.isFinite(input.phaseDegrees) || Math.abs(input.phaseDegrees) > 180)) throw new Error('Massa ou fase fora dos limites.');
      $('origin').value=input.origin; $('destination').value=input.destination; $('mass').value=String(input.massKg); configureFromControls();
      if (input.phaseDegrees !== undefined) configurePhase(input.phaseDegrees);
      location.hash='simulador'; navigate(); return readMission();
    } });
    register({ name:'orbital_set_time', title:'Escolher um instante da viagem', description:'Pausa a animação e mostra um instante entre a partida (0) e a chegada (1).', inputSchema:{type:'object',properties:{progress:{type:'number',minimum:0,maximum:1}},required:['progress'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input || !Number.isFinite(input.progress) || input.progress<0 || input.progress>1 || Object.keys(input).some(k=>k!=='progress'))throw new Error('Progresso inválido.');if(!state.valid)throw new Error('A missão não é válida.');seek(input.progress);return readMission();} });
    register({ name:'orbital_answer_challenge', title:'Responder a um desafio de Física I', description:'Abre e corrige um dos três desafios da missão atual de exercícios. Nos desafios 0 e 2, envia choice (0 a 2). No desafio 1, envia quatro answers: semi-eixo, tempo, fase e repetição da janela.', inputSchema:{type:'object',properties:{step:{type:'integer',minimum:0,maximum:2},choice:{type:'integer',minimum:0,maximum:2},answers:{type:'array',items:{type:'string'},minItems:4,maxItems:4}},required:['step'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{
      if(!input || ![0,1,2].includes(input.step) || Object.keys(input).some(k=>!['step','choice','answers'].includes(k)))throw new Error('Desafio inválido.');
      if(input.step===1 ? !Array.isArray(input.answers) || input.answers.length!==4 || input.answers.some(v=>typeof v!=='string' || v.length>100) || input.choice!==undefined : ![0,1,2].includes(input.choice) || input.answers!==undefined)throw new Error('Resposta mal formada.');
      challenge.step=input.step;
      if(input.step===1)challenge.answers=input.answers.slice();else challenge.selected[input.step]=input.choice;
      location.hash='desafios';navigate();gradeChallenge();
      return {step:challenge.step,feedback:challenge.feedback[challenge.step],points:challenge.points.slice(),total:challenge.points.reduce((a,b)=>a+b,0)};
    } });
  }
  $('new-challenge').addEventListener('click', newChallenge);
  window.OrbitalGuide.init();
  initializeControls(); updateMission(); navigate();
  window.OrbitalMath.format(document.body);
  registerTools();
})();

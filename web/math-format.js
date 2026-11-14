(function () {
  'use strict';
  const tex = (source, display = false) => window.katex.renderToString(source, { displayMode: display, throwOnError: true, trust: false, output: 'htmlAndMathml' });
  const support = [String.raw`a=\frac{r_1+r_2}{2}`, String.raw`T^2\approx a^3`, String.raw`t=\frac{T}{2}\times365{,}25\;\mathrm{dias}`, String.raw`\varphi=180^\circ-n_2t`, String.raw`S=\frac{360^\circ}{|n_1-n_2|}`, String.raw`E_c=\frac12 mv^2`];
  const pairs = [
    ['|ΔE₁| + |ΔE₂|', String.raw`|\Delta E_1|+|\Delta E_2|`],
    ['T² ≈ a³', String.raw`T^2\approx a^3`], ['E = ½mv²', String.raw`E_c=\frac12 mv^2`],
    ['μ = GM do Sol = 1,32712440018 × 10¹¹ km³/s²', String.raw`\mu=GM_{\odot}=1{,}32712440018\times10^{11}\;\frac{\mathrm{km}^3}{\mathrm{s}^2}`],
    ['1 km/s = 1 000 m/s', String.raw`1\;\frac{\mathrm{km}}{\mathrm{s}}=1000\;\frac{\mathrm{m}}{\mathrm{s}}`],
    ['1 MJ = 1 000 000 J', String.raw`1\;\mathrm{MJ}=10^6\;\mathrm{J}`],
    ['ΔE₁', String.raw`\Delta E_1`], ['ΔE₂', String.raw`\Delta E_2`], ['Δv', String.raw`\Delta v`],
    ['r₁', 'r_1'], ['r₂', 'r_2'], ['n₁', 'n_1'], ['n₂', 'n_2'], ['T²', 'T^2'], ['a³', 'a^3'], ['2m', '2m'],
    ['km/s²', String.raw`\mathrm{km}/\mathrm{s}^2`], ['km³/s²', String.raw`\mathrm{km}^3/\mathrm{s}^2`]
  ];
  const lookup = new Map(pairs);
  const pattern = new RegExp(pairs.map(([key]) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  function format(root) {
    root.querySelectorAll('[data-tex]').forEach(el => { if (el.dataset.rendered) return; el.innerHTML = tex(el.dataset.tex, el.dataset.display === 'true'); el.dataset.rendered = 'true'; });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      return node.parentElement.closest('.katex, math, script, style, svg, textarea, input, select, option, [data-tex]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      pattern.lastIndex = 0; const matches = [...node.textContent.matchAll(pattern)]; if (!matches.length) continue;
      const fragment = document.createDocumentFragment(); let start = 0;
      for (const match of matches) {
        fragment.append(document.createTextNode(node.textContent.slice(start, match.index)));
        const span = document.createElement('span'); span.className = 'inline-math'; span.innerHTML = tex(lookup.get(match[0])); fragment.append(span); start = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(node.textContent.slice(start))); node.replaceWith(fragment);
    }
  }
  function calculations(m, year, n1, n2) {
    const N = (v, d = 2) => Number(v).toLocaleString('pt-PT', {minimumFractionDigits:d, maximumFractionDigits:d}).replace(/\s/g,'').replace(',', '{,}');
    const eq = source => tex(source, true), unit = name => '\\;\\mathrm{' + name + '}';
    return [
      eq('a=\\frac{' + N(m.r1/149597870.7,6) + '+' + N(m.r2/149597870.7,6) + '}{2}=' + N(m.aAU,6) + unit('UA')),
      eq('T\\approx\\sqrt{' + N(m.aAU,6) + '^3}=' + N(2*m.days/year,4) + unit('anos')) + eq('t=\\frac{T}{2}\\times' + N(year,3) + '=' + N(m.days) + unit('dias')),
      eq('n=\\frac{360^\\circ}{' + N(360/n2) + '}=' + N(n2,5) + '\\;^\\circ/\\mathrm{dia}') + eq('\\varphi=180^\\circ-' + N(n2,5) + '\\times' + N(m.days) + '=' + N(180-n2*m.days) + '^\\circ'),
      eq('S=\\frac{360^\\circ}{|' + N(n1,6) + '-' + N(n2,6) + '|}=' + N(m.synodicDays) + unit('dias')),
      eq('\\Delta v_1=|' + N(m.vt1,3) + '-' + N(m.v1,3) + '|=' + N(m.dv1,3) + unit('km/s')) + eq('\\Delta v_2=|' + N(m.v2,3) + '-' + N(m.vt2,3) + '|=' + N(m.dv2,3) + unit('km/s')) + eq('\\Delta v_{\\mathrm{total}}=' + N(m.dv,3) + unit('km/s')),
      eq('m=' + N(m.mass,0) + unit('kg')) + eq('\\Delta E_1=' + N(m.dE1) + unit('MJ')) + eq('\\Delta E_2=' + N(m.dE2) + unit('MJ')) + eq('|\\Delta E_1|+|\\Delta E_2|=' + N(m.energyMJ) + unit('MJ'))
    ];
  }
  window.OrbitalMath = Object.freeze({ tex, support, format, calculations });
})();

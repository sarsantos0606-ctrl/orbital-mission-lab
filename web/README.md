# Orbital · Mission Lab

## Fórmulas
 
O guia de física no canto superior direito contém três separadores: Conceitos fundamentais, Engenharia e Modelo computacional. Inclui definições, unidades, gravitação, energia potencial, movimento circular, geometria da elipse, período e energia orbital, manobras de Hohmann, fase de lançamento e período sinódico. Os esquemas são SVG acessíveis.

O exemplo numérico acompanha a origem, o destino e a massa selecionados quando se abre o guia. É sempre uma referência de Hohmann, explicitamente identificada se a simulação estiver numa fase alternativa. Uma configuração inválida usa Terra–Marte de 1 000 kg, com aviso.

Os ficheiros guide.js e guide.css também fazem parte da aplicação e devem ser incluídos nas publicações e no ZIP de distribuição. O conteúdo dos painéis está em index.html. Os separadores suportam teclado (setas, Home/End); Escape fecha o diálogo e devolve o foco ao botão.

As fórmulas usam LaTeX renderizado por KaTeX 0.18.7 (HTML e MathML acessível). A biblioteca e as fontes estão em `vendor/katex`, com licença MIT incluída. `math-format.js` contém a notação partilhada e as contas formatadas. Estes ficheiros fazem parte da aplicação e do ZIP.

Laboratório educativo em português para Física I: **Como chegamos a Marte?**

## Abrir

Para abrir o protótipo localmente, faz duplo clique em **index.html**. A interface está preparada para alojamento como site estático.

Mantém `index.html`, `styles.css`, `theme.css`, `theme.js`, `physics.js`, `app.js` e `icon.svg` juntos. Para distribuir aos alunos, partilha o ZIP `Orbital-alunos.zip` e pede que o extraiam antes de abrir `index.html`. A pasta `python-original` guarda a cópia do projeto anterior e não é usada pela aplicação web.

## Temas e leitura da missão

A primeira visita usa o modo claro. O botão no cabeçalho alterna entre claro e escuro e guarda a escolha no navegador, quando o armazenamento está disponível.

Os três cartões são explicativos e não interativos: manobra de partida, todo o voo sem propulsão e manobra de chegada. Apenas os controlos de reprodução e a linha do tempo alteram o instante mostrado. Os impulsos são instantâneos no modelo; não existe cálculo de duração das queimas. Δv é uma variação de velocidade, não uma aceleração. Os corpos são símbolos fora de escala; o Sol é visualmente maior, sem representar a proporção real dos diâmetros.

## O que permite fazer

- **Simulador:** escolher origem e destino, alterar a fase inicial e a massa, reproduzir/pausar a viagem, mudar a velocidade e arrastar a linha do tempo.
- **Aprender:** começar por órbita, elipse e fase; calcular tamanho da elipse, tempo, fase e repetição da janela. Δv e energia são aprofundamentos opcionais.
- **Desafios:** escolher a configuração de partida, fazer quatro cálculos guiados e interpretar o efeito de duplicar a massa. Há pistas, tolerâncias explícitas, correção e pontuação de 0 a 100.
- **Experiências:** provocar um desvio de fase de 25° e comparar naves de 1 000 e 2 000 kg.

O percurso inicial é Terra–Marte. O simulador permite os oito planetas e Plutão (identificado como planeta anão); o gerador de desafios escolhe Vénus, Marte ou Júpiter. As respostas mantêm-se ao mudar de secção, mas são reiniciadas ao atualizar/fechar a página ou gerar outra missão. Não existem contas, recolha de dados, classificações online ou serviços externos obrigatórios.

## Sugestão de aula (Física I, 30–45 minutos)

1. **Observar (5 min):** iniciar Terra–Marte, pausar a meio e explicar por que a nave se move com o motor desligado.
2. **Prever (5 min):** perguntar como mudar a fase altera a trajetória de encontro e as manobras. Experimentar mais 25° de fase e comparar com a fase ideal.
3. **Calcular (10–15 min):** em Aprender, trabalhar média dos raios, raiz de a³, metade do período, velocidade angular × tempo e repetição do alinhamento.
4. **Aplicar (10 min):** realizar os três desafios, usando as pistas quando necessário. Pedir uma justificação, além da opção ou número escolhido.
5. **Discutir (5 min):** duplicar a massa. Distinguir massa, velocidade, tempo, energia e combustível.

## Relação com o vídeo da professora

Maggie Lieu / Space Mog — [Hohmann transfer orbit: How do we actually get to Mars?](https://www.youtube.com/watch?v=Si4OaDzziOg).

O percurso acompanha os capítulos: órbita de transferência (00:33), tempo de viagem (03:24), fase e janela de lançamento (06:21). A parte final também discute a repetição da oportunidade.

O vídeo usa aproximações sucessivas: raio de Marte de 1,5 UA, aproximadamente 256 dias, 47° e 766 dias entre oportunidades. Aqui usamos 1,523679 UA e o mesmo parâmetro gravitacional em todos os cálculos: cerca de 259 dias, 44,3° e 780 dias. A diferença é explicada em Aprender. O laboratório não reproduz arredondamentos intermédios inconsistentes.

Referências complementares:

- [NASA/JPL — Let's Go to Mars! Calculating Launch Windows](https://www.jpl.nasa.gov/edu/resources/lesson-plan/lets-go-to-mars-calculating-launch-windows/)
- [NASA — Basics of Space Flight, Chapter 4: Trajectories](https://science.nasa.gov/learn/basics-of-space-flight/chapter4-1/)

## Modelo físico e limites

Órbitas planetárias circulares, coplanares, atração do Sol e duas manobras instantâneas. Na fase ideal a nave percorre meia elipse de Hohmann. Noutras fases, um solver de Lambert calcula uma elipse de encontro. A propagação pela equação de Kepler usa velocidade variável. O Sol está num foco. São suportadas transferências para órbitas exteriores e interiores. A posição dos planetas evolui com o mesmo tempo simulado.

- Distâncias orbitais à escala; corpos e marcadores ampliados. Para destinos muito afastados, a órbita interior aparece naturalmente pequena.
- A fase é representada no intervalo −180° a 180°. Valores separados por 360° são equivalentes; os desafios aceitam essa equivalência.
- O Δv mostrado é heliocêntrico. Não inclui lançamento da superfície, fuga ou captura planetária, aterragem, propulsão contínua ou combustível.
- A energia das manobras é a soma dos módulos das variações de energia cinética, em MJ, não a energia química do combustível.
- O encontro é avaliado no instante final da transferência, com tolerância pedagógica de 10 000 km. Não é um cálculo de captura nem uma análise de distância mínima ao longo de toda a missão.
- Não se usam efemérides nem datas reais. A repetição da fase ideal não representa a duração de uma janela real.
- A lei T² ≈ a³ com T em anos e a em UA é uma relação em unidades escolhidas; o motor usa μ solar e quilómetros de forma consistente.

## Ficheiros e verificação

- `index.html`: interface sem dependências remotas.
- `styles.css`: design responsivo, texto nítido e acessibilidade.
- `physics.js`: cálculos e propagação orbital; também importável em Node para testes.
- `app.js`: interação, animação, aprendizagem e desafios.
- `tests/physics.test.cjs`: referências Terra–Marte, conservação da energia, 72 transferências dirigidas, equivalência angular e validação de respostas.

Para quem desenvolve (não é necessário para os alunos): `node --test tests/physics.test.cjs`.

Não é necessário compilar. A aplicação também pode ser alojada como site estático; esta entrega é a versão local pedida em Orbital2. Não foi publicada na Internet.

## Trajetórias alternativas (15 setembro 2026)

`rendezvous` mantém Hohmann na fase ideal. Fora dela, resolve Lambert em variáveis universais para 201 tempos entre 0,4 e 2 vezes o tempo de Hohmann e refina a melhor vizinhança em Δv total. Apenas elipses prógradas, sem revoluções completas e com periélio acima do raio solar. É uma procura limitada, não otimização global. O intervalo é indicado na interface. Se não houver solução, a simulação é desativada com uma mensagem, sem mostrar uma trajetória fictícia.

As duas manobras são diferenças **vetoriais** de velocidade. |ΔEc₁| + |ΔEc₂| pode continuar igual apesar de Δv aumentar: quando ambas as variações têm o mesmo sinal, a soma é fixada pela diferença de energia entre as órbitas circulares. Esta energia é recalculada, mas não mede custo de combustível. Aprender e Desafios continuam explicitamente focados em Hohmann, sem aplicar as suas fórmulas às elipses alternativas.

Referência: [ESA — Lambert problems](https://godot.io.esa.int/docs/tutorials2/fundamentals/astro/03-lambert-problems.html).

Testes novos: `node --test --test-isolation=none tests/rendezvous.test.cjs`. Incluem 432 encontros (72 percursos × 6 fases), propagação independente RK4, conservação da energia e escala com a massa.

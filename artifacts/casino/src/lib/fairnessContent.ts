type FSection = { title: string; body: string };
type FGame = {
  key: string; label: string; color: string; soon: boolean;
  how: string;
  sections: FSection[];
  tags: string[];
};

const DATA: Record<string, FGame[]> = {
  es: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice es un juego de dados donde tú eliges un número objetivo y apuestas a que el resultado cae por encima o por debajo de ese número. El rango va del 0 al 100, y puedes ajustar tu probabilidad de ganar según tu estrategia.",
      sections:[
        { title:"Cómo se determina el resultado", body:"Cada tirada genera un número entre 0 y 100 de forma completamente aleatoria en el momento exacto en que confirmas tu apuesta. Ningún sistema interno ni externo puede predecir o influir en el resultado antes de que ocurra." },
        { title:"Sistema de aleatoriedad", body:"Utilizamos generadores de números aleatorios de alta entropía, independientes del casino. Esto significa que cada resultado es estadísticamente impredecible y no está relacionado con tiradas anteriores o futuras." },
        { title:"Sin ventaja oculta", body:"El house edge de Mander Dice es fijo, visible y no varía entre rondas. No existe ningún mecanismo que ajuste los resultados según tu historial de apuestas o tu balance actual." },
      ],
      tags:["Resultados 100% aleatorios","House edge fijo y visible","Sin memoria entre rondas"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"En Mander Plinko, una pelota cae desde la parte superior de un tablero de clavijas y rebota aleatoriamente hasta aterrizar en una de las ranuras inferiores, cada una con un multiplicador distinto.",
      sections:[
        { title:"Cómo se determina la trayectoria", body:"La trayectoria de la pelota se calcula a partir de un proceso de decisión aleatorio en cada clavija. En cada punto de bifurcación, la pelota tiene una probabilidad igual de ir a la izquierda o a la derecha, lo que hace que el destino final sea imposible de predecir." },
        { title:"Física del juego", body:"El movimiento de la pelota simula física real con aleatoriedad pura en cada rebote. El casino no tiene control sobre en qué ranura aterrizará la pelota una vez que inicia su caída." },
        { title:"Transparencia de multiplicadores", body:"Los multiplicadores de cada ranura son fijos y visibles antes de realizar tu apuesta. El juego no ajusta los multiplicadores ni el comportamiento de la pelota en función de tu historial." },
      ],
      tags:["Trayectoria generada aleatoriamente","Multiplicadores fijos y visibles","Sin interferencia externa"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno es un juego de lotería donde seleccionas entre 1 y 10 números del 1 al 40. Luego el sistema extrae una serie de números ganadores de forma aleatoria y recibes un premio según cuántos de tus números coinciden.",
      sections:[
        { title:"Cómo se extraen los números", body:"Los números ganadores se seleccionan mediante un generador de números aleatorios que garantiza que cada número del tablero tiene exactamente la misma probabilidad de ser elegido. El proceso de extracción es completamente independiente de los números que hayas seleccionado." },
        { title:"Imparcialidad garantizada", body:"El casino no tiene información sobre qué números elegiste en el momento de la extracción. Los resultados no pueden ser ajustados para favorecer o perjudicar a ningún jugador en particular." },
        { title:"Tabla de premios", body:"Los multiplicadores y premios para cada cantidad de aciertos son fijos y están disponibles antes de realizar tu apuesta. No existen cambios dinámicos en los premios según el balance de la sala." },
      ],
      tags:["Extracción completamente aleatoria","Probabilidades iguales para todos","Premios fijos y transparentes"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack es el clásico juego de cartas donde el objetivo es llegar lo más cerca posible a 21 sin pasarse, superando al dealer. Puedes pedir carta, plantarte, doblar o dividir según tu mano.",
      sections:[
        { title:"Cómo se reparten las cartas", body:"Antes de cada ronda, la baraja completa se mezcla de forma aleatoria utilizando un algoritmo de barajado estándar. Cada carta repartida se extrae de esta baraja mezclada sin ningún tipo de pre-selección ni manipulación." },
        { title:"El dealer no tiene ventaja oculta", body:"Las reglas del dealer están fijas y son visibles: el dealer siempre pide carta con 16 o menos y se planta con 17 o más. Esta regla no cambia entre partidas ni se ajusta según el resultado de rondas anteriores." },
        { title:"Sin cartas marcadas", body:"No existe ningún mecanismo que permita al casino saber de antemano qué cartas tienen los jugadores. El proceso de reparto es ciego para todos los sistemas del casino hasta que las cartas se revelan." },
      ],
      tags:["Baraja mezclada aleatoriamente","Reglas del dealer fijas","Sin ventaja oculta"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"En Mander Mines, se ocultan un número de minas en una cuadrícula. Debes revelar casillas sin tocar ninguna mina para acumular ganancias. Cuanto más avances, mayor será tu multiplicador.",
      sections:[
        { title:"Cómo se colocan las minas", body:"Las posiciones de todas las minas se determinan de forma aleatoria en el instante en que confirmas tu apuesta, antes de que hagas tu primera selección. Una vez colocadas, sus posiciones no cambian durante la ronda." },
        { title:"El casino no conoce tu estrategia", body:"El sistema que coloca las minas opera de forma independiente a tu comportamiento de juego. Las posiciones de las minas no se ajustan en respuesta a las casillas que hayas elegido o tu historial de partidas." },
        { title:"Multiplicadores progresivos", body:"Los multiplicadores que obtienes al revelar cada casilla segura son fijos y calculados en base a las probabilidades reales del juego. No existen ajustes dinámicos que alteren tu potencial de ganancia durante una ronda activa." },
      ],
      tags:["Posiciones fijadas al inicio","Sin ajustes durante la ronda","Multiplicadores calculados con probabilidades reales"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo es un juego de cartas donde se revela una carta y debes predecir si la siguiente será mayor o menor. Cada predicción correcta incrementa tu multiplicador.",
      sections:[
        { title:"Cómo se generan las cartas", body:"Cada carta revelada se extrae de forma aleatoria de una baraja estándar mezclada. El sistema no tiene información sobre qué carta saldrá a continuación al momento de mostrarte la carta actual." },
        { title:"Predicciones sin trampa", body:"Las probabilidades de que la siguiente carta sea mayor o menor son calculadas en base a las cartas que ya salieron. El casino no manipula la siguiente carta para invalidar tu predicción." },
        { title:"Riesgo ajustable", body:"Puedes elegir entre opciones de mayor o menor riesgo según tu estrategia. Los multiplicadores asociados reflejan con precisión las probabilidades reales de cada opción." },
      ],
      tags:["Cartas extraídas aleatoriamente","Probabilidades calculadas en tiempo real","Sin manipulación de resultados"],
    },
    {
      key:"Roulette", label:"Ruleta", color:"#f43f5e", soon:false,
      how:"Mander Ruleta ofrece la experiencia clásica del casino con una ruleta europea. Apuesta a un número, color, par/impar o grupo de números y observa dónde cae la bola.",
      sections:[
        { title:"Cómo se determina el número ganador", body:"Cada giro de la ruleta produce un número completamente aleatorio entre 0 y 36. El proceso es instantáneo y ocurre en el momento exacto del giro, sin pre-determinación ni ciclos predecibles." },
        { title:"Ruleta europea", body:"Mander Ruleta utiliza el formato europeo con un solo cero, lo que ofrece mejores probabilidades para el jugador en comparación con la versión americana. El house edge es fijo y transparente." },
        { title:"Cada giro es independiente", body:"El resultado de un giro no tiene ninguna relación estadística con los giros anteriores. No existen patrones, ciclos ni ajustes que hagan que ciertos números salgan con más o menos frecuencia a lo largo del tiempo." },
      ],
      tags:["Número aleatorio por giro","Ruleta europea (un solo cero)","Cada giro es independiente"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat utiliza un mazo de 8 barajas estándar barajado de forma aleatoria antes de cada ronda. Las cartas se reparten siguiendo las reglas clásicas del Punto Banco: el jugador y el banquero reciben dos cartas cada uno, y se puede agregar una tercera carta según reglas fijas. Puedes apostar al Jugador, al Banquero (con 5% de comisión sobre las ganancias) o al Empate.",
      sections:[
        { title:"Aleatoriedad del mazo", body:"Cada ronda de Baccarat extrae cartas de un mazo de 8 barajas barajado con el mismo sistema de aleatoriedad auditado que usamos en todos nuestros juegos. Cuando quedan menos de 15 cartas, el mazo se rebaraja automáticamente para garantizar imparcialidad total en cada mano." },
        { title:"Reglas de la tercera carta", body:"Las reglas de la tercera carta son fijas y públicas: el Jugador pide carta si su total es 0–5; el Banquero pide carta según su total y la tercera carta del Jugador siguiendo el cuadro estándar del Punto Banco. No hay decisiones discrecionales del casino — el resultado sigue siempre las mismas reglas deterministas." },
        { title:"Comisión del Banquero", body:"La apuesta al Banquero paga con una comisión del 5% sobre las ganancias netas, lo cual refleja la ligera ventaja estadística que tiene el Banquero según las reglas del juego. El Empate paga 8x la apuesta. Todas las comisiones y pagos se calculan automáticamente y son visibles antes de apostar." },
      ],
      tags:["Mazo de 8 barajas auditado","Reglas Punto Banco estándar","Comisión 5% en Banquero"],
    },
  ],
  en: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice is a dice game where you choose a target number and bet on whether the result falls above or below it. The range is 0 to 100, and you can adjust your win probability according to your strategy.",
      sections:[
        { title:"How the result is determined", body:"Each roll generates a number between 0 and 100 in a completely random manner at the exact moment you confirm your bet. No internal or external system can predict or influence the outcome beforehand." },
        { title:"Randomness system", body:"We use high-entropy random number generators that are independent of the casino. This means each result is statistically unpredictable and unrelated to previous or future rolls." },
        { title:"No hidden edge", body:"The house edge in Mander Dice is fixed, visible, and does not vary between rounds. There is no mechanism that adjusts results based on your betting history or current balance." },
      ],
      tags:["100% random results","Fixed and visible house edge","No memory between rounds"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"In Mander Plinko, a ball drops from the top of a peg board and bounces randomly until it lands in one of the bottom slots, each with a different multiplier.",
      sections:[
        { title:"How the path is determined", body:"The ball's trajectory is calculated from a random decision process at each peg. At every branching point, the ball has an equal probability of going left or right, making the final destination impossible to predict." },
        { title:"Game physics", body:"The ball's movement simulates real physics with pure randomness at each bounce. The casino has no control over which slot the ball will land in once it begins its fall." },
        { title:"Multiplier transparency", body:"The multipliers for each slot are fixed and visible before you place your bet. The game does not adjust multipliers or the ball's behavior based on your history." },
      ],
      tags:["Randomly generated path","Fixed and visible multipliers","No external interference"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno is a lottery game where you select between 1 and 10 numbers from 1 to 40. The system then draws a series of winning numbers randomly, and you receive a prize based on how many of your numbers match.",
      sections:[
        { title:"How numbers are drawn", body:"The winning numbers are selected by a random number generator that guarantees every number on the board has exactly the same probability of being chosen. The draw process is completely independent of the numbers you selected." },
        { title:"Guaranteed fairness", body:"The casino has no information about which numbers you chose at the time of the draw. Results cannot be adjusted to favor or disadvantage any particular player." },
        { title:"Prize table", body:"The multipliers and prizes for each hit count are fixed and available before you place your bet. There are no dynamic prize changes based on the room's balance." },
      ],
      tags:["Completely random draw","Equal probabilities for all","Fixed and transparent prizes"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack is the classic card game where the goal is to get as close to 21 as possible without going over, beating the dealer. You can hit, stand, double down, or split depending on your hand.",
      sections:[
        { title:"How cards are dealt", body:"Before each round, the full deck is shuffled randomly using a standard shuffling algorithm. Each card dealt is drawn from this shuffled deck without any pre-selection or manipulation." },
        { title:"The dealer has no hidden advantage", body:"The dealer's rules are fixed and visible: the dealer always hits with 16 or less and stands with 17 or more. This rule does not change between games or adjust based on previous round results." },
        { title:"No marked cards", body:"There is no mechanism that allows the casino to know in advance what cards players have. The dealing process is blind to all casino systems until the cards are revealed." },
      ],
      tags:["Randomly shuffled deck","Fixed dealer rules","No hidden edge"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"In Mander Mines, a number of mines are hidden in a grid. You must reveal tiles without hitting any mine to accumulate winnings. The further you advance, the higher your multiplier.",
      sections:[
        { title:"How mines are placed", body:"The positions of all mines are determined randomly the instant you confirm your bet, before you make your first selection. Once placed, their positions do not change during the round." },
        { title:"The casino doesn't know your strategy", body:"The system that places mines operates independently of your gameplay behavior. Mine positions are not adjusted in response to the tiles you have chosen or your game history." },
        { title:"Progressive multipliers", body:"The multipliers you receive when revealing each safe tile are fixed and calculated based on the real probabilities of the game. There are no dynamic adjustments that alter your earning potential during an active round." },
      ],
      tags:["Positions fixed at start","No mid-round adjustments","Multipliers based on real probabilities"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo is a card game where a card is revealed and you must predict whether the next one will be higher or lower. Each correct prediction increases your multiplier.",
      sections:[
        { title:"How cards are generated", body:"Each revealed card is drawn randomly from a shuffled standard deck. The system has no information about which card will come next at the moment it shows you the current card." },
        { title:"Predictions without cheating", body:"The probabilities of the next card being higher or lower are calculated based on the cards already dealt. The casino does not manipulate the next card to invalidate your prediction." },
        { title:"Adjustable risk", body:"You can choose between higher or lower risk options according to your strategy. The associated multipliers accurately reflect the real probabilities of each option." },
      ],
      tags:["Randomly drawn cards","Real-time probability calculation","No result manipulation"],
    },
    {
      key:"Roulette", label:"Roulette", color:"#f43f5e", soon:false,
      how:"Mander Roulette offers the classic casino experience with a European wheel. Bet on a number, color, odd/even, or group of numbers and watch where the ball lands.",
      sections:[
        { title:"How the winning number is determined", body:"Each spin of the roulette produces a completely random number between 0 and 36. The process is instantaneous and occurs at the exact moment of the spin, with no pre-determination or predictable cycles." },
        { title:"European roulette", body:"Mander Roulette uses the European format with a single zero, which offers better odds for the player compared to the American version. The house edge is fixed and transparent." },
        { title:"Each spin is independent", body:"The outcome of one spin has no statistical relationship with previous spins. There are no patterns, cycles, or adjustments that make certain numbers appear more or less frequently over time." },
      ],
      tags:["Random number per spin","European roulette (single zero)","Each spin is independent"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat uses an 8-deck shoe shuffled randomly before each round. Cards are dealt following classic Punto Banco rules: the player and banker each receive two cards, with a possible third card drawn according to fixed rules. You can bet on Player, Banker (with a 5% commission on winnings), or Tie.",
      sections:[
        { title:"Deck randomness", body:"Each Baccarat round draws cards from an 8-deck shoe shuffled with the same audited randomness system we use across all our games. When fewer than 15 cards remain, the shoe is automatically reshuffled to guarantee total fairness in every hand." },
        { title:"Third card rules", body:"The third-card rules are fixed and public: the Player draws if their total is 0–5; the Banker draws based on their total and the Player's third card following the standard Punto Banco chart. There are no discretionary casino decisions — the outcome always follows the same deterministic rules." },
        { title:"Banker commission", body:"The Banker bet pays with a 5% commission on net winnings, which reflects the slight statistical advantage the Banker has under the game's rules. Tie pays 8x the bet. All commissions and payouts are calculated automatically and are visible before betting." },
      ],
      tags:["8-deck audited shoe","Standard Punto Banco rules","5% Banker commission"],
    },
  ],
  pt: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice é um jogo de dados onde você escolhe um número alvo e aposta se o resultado cai acima ou abaixo dele. O intervalo vai de 0 a 100 e você pode ajustar sua probabilidade de vitória conforme sua estratégia.",
      sections:[
        { title:"Como o resultado é determinado", body:"Cada lançamento gera um número entre 0 e 100 de forma completamente aleatória no momento exato em que você confirma sua aposta. Nenhum sistema interno ou externo pode prever ou influenciar o resultado antes que ele ocorra." },
        { title:"Sistema de aleatoriedade", body:"Usamos geradores de números aleatórios de alta entropia, independentes do cassino. Isso significa que cada resultado é estatisticamente imprevisível e não está relacionado com lançamentos anteriores ou futuros." },
        { title:"Sem vantagem oculta", body:"A vantagem da casa no Mander Dice é fixa, visível e não varia entre rodadas. Não existe nenhum mecanismo que ajuste os resultados com base no seu histórico de apostas ou saldo atual." },
      ],
      tags:["Resultados 100% aleatórios","Vantagem da casa fixa e visível","Sem memória entre rodadas"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"No Mander Plinko, uma bola cai do topo de um tabuleiro de pinos e ricocheteia aleatoriamente até pousar em uma das ranhuras inferiores, cada uma com um multiplicador diferente.",
      sections:[
        { title:"Como o caminho é determinado", body:"A trajetória da bola é calculada a partir de um processo de decisão aleatório em cada pino. Em cada ponto de bifurcação, a bola tem probabilidade igual de ir para a esquerda ou direita, tornando o destino final impossível de prever." },
        { title:"Física do jogo", body:"O movimento da bola simula física real com aleatoriedade pura em cada ricochete. O cassino não tem controle sobre em qual ranhura a bola pousará depois de iniciar sua queda." },
        { title:"Transparência dos multiplicadores", body:"Os multiplicadores de cada ranhura são fixos e visíveis antes de você fazer sua aposta. O jogo não ajusta os multiplicadores nem o comportamento da bola com base no seu histórico." },
      ],
      tags:["Trajetória gerada aleatoriamente","Multiplicadores fixos e visíveis","Sem interferência externa"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno é um jogo de loteria onde você seleciona entre 1 e 10 números de 1 a 40. O sistema então sorteia uma série de números vencedores aleatoriamente e você recebe um prêmio de acordo com quantos dos seus números coincidem.",
      sections:[
        { title:"Como os números são sorteados", body:"Os números vencedores são selecionados por um gerador de números aleatórios que garante que cada número do tabuleiro tem exatamente a mesma probabilidade de ser escolhido. O processo de sorteio é completamente independente dos números que você selecionou." },
        { title:"Imparcialidade garantida", body:"O cassino não tem informações sobre quais números você escolheu no momento do sorteio. Os resultados não podem ser ajustados para favorecer ou prejudicar nenhum jogador em particular." },
        { title:"Tabela de prêmios", body:"Os multiplicadores e prêmios para cada quantidade de acertos são fixos e disponíveis antes de você fazer sua aposta. Não há mudanças dinâmicas nos prêmios com base no saldo da sala." },
      ],
      tags:["Sorteio completamente aleatório","Probabilidades iguais para todos","Prêmios fixos e transparentes"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack é o clássico jogo de cartas onde o objetivo é chegar o mais perto possível de 21 sem ultrapassar, superando o dealer. Você pode pedir carta, parar, dobrar ou dividir conforme sua mão.",
      sections:[
        { title:"Como as cartas são distribuídas", body:"Antes de cada rodada, o baralho completo é embaralhado aleatoriamente usando um algoritmo de embaralhamento padrão. Cada carta distribuída é retirada deste baralho embaralhado sem qualquer pré-seleção ou manipulação." },
        { title:"O dealer não tem vantagem oculta", body:"As regras do dealer são fixas e visíveis: o dealer sempre pede carta com 16 ou menos e para com 17 ou mais. Esta regra não muda entre partidas nem se ajusta com base nos resultados de rodadas anteriores." },
        { title:"Sem cartas marcadas", body:"Não existe nenhum mecanismo que permita ao cassino saber antecipadamente quais cartas os jogadores têm. O processo de distribuição é cego para todos os sistemas do cassino até que as cartas sejam reveladas." },
      ],
      tags:["Baralho embaralhado aleatoriamente","Regras do dealer fixas","Sem vantagem oculta"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"No Mander Mines, um número de minas é escondido em uma grade. Você deve revelar células sem tocar em nenhuma mina para acumular ganhos. Quanto mais avançar, maior será seu multiplicador.",
      sections:[
        { title:"Como as minas são posicionadas", body:"As posições de todas as minas são determinadas aleatoriamente no instante em que você confirma sua aposta, antes de fazer sua primeira seleção. Uma vez posicionadas, suas posições não mudam durante a rodada." },
        { title:"O cassino não conhece sua estratégia", body:"O sistema que posiciona as minas opera de forma independente do seu comportamento de jogo. As posições das minas não são ajustadas em resposta às células que você escolheu ou ao seu histórico de partidas." },
        { title:"Multiplicadores progressivos", body:"Os multiplicadores que você recebe ao revelar cada célula segura são fixos e calculados com base nas probabilidades reais do jogo. Não há ajustes dinâmicos que alterem seu potencial de ganho durante uma rodada ativa." },
      ],
      tags:["Posições fixadas no início","Sem ajustes durante a rodada","Multiplicadores calculados com probabilidades reais"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo é um jogo de cartas onde uma carta é revelada e você deve prever se a próxima será maior ou menor. Cada previsão correta aumenta seu multiplicador.",
      sections:[
        { title:"Como as cartas são geradas", body:"Cada carta revelada é retirada aleatoriamente de um baralho padrão embaralhado. O sistema não tem informações sobre qual carta sairá a seguir no momento em que mostra a carta atual." },
        { title:"Previsões sem trapaça", body:"As probabilidades de a próxima carta ser maior ou menor são calculadas com base nas cartas já distribuídas. O cassino não manipula a próxima carta para invalidar sua previsão." },
        { title:"Risco ajustável", body:"Você pode escolher entre opções de maior ou menor risco de acordo com sua estratégia. Os multiplicadores associados refletem com precisão as probabilidades reais de cada opção." },
      ],
      tags:["Cartas retiradas aleatoriamente","Probabilidades calculadas em tempo real","Sem manipulação de resultados"],
    },
    {
      key:"Roulette", label:"Roleta", color:"#f43f5e", soon:false,
      how:"Mander Roleta oferece a experiência clássica do cassino com uma roleta europeia. Aposte em um número, cor, par/ímpar ou grupo de números e observe onde a bola para.",
      sections:[
        { title:"Como o número vencedor é determinado", body:"Cada giro da roleta produz um número completamente aleatório entre 0 e 36. O processo é instantâneo e ocorre no momento exato do giro, sem pré-determinação ou ciclos previsíveis." },
        { title:"Roleta europeia", body:"Mander Roleta usa o formato europeu com um único zero, o que oferece melhores probabilidades para o jogador em comparação com a versão americana. A vantagem da casa é fixa e transparente." },
        { title:"Cada giro é independente", body:"O resultado de um giro não tem nenhuma relação estatística com giros anteriores. Não existem padrões, ciclos ou ajustes que façam certos números aparecer com mais ou menos frequência ao longo do tempo." },
      ],
      tags:["Número aleatório por giro","Roleta europeia (zero único)","Cada giro é independente"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat usa um sapato de 8 baralhos embaralhados aleatoriamente antes de cada rodada. As cartas são distribuídas seguindo as regras clássicas do Ponto Banco: o jogador e o banqueiro recebem duas cartas cada, com uma possível terceira carta conforme regras fixas. Você pode apostar no Jogador, no Banqueiro (com comissão de 5% sobre os ganhos) ou no Empate.",
      sections:[
        { title:"Aleatoriedade do baralho", body:"Cada rodada de Baccarat retira cartas de um sapato de 8 baralhos embaralhados com o mesmo sistema de aleatoriedade auditado que usamos em todos os nossos jogos. Quando restam menos de 15 cartas, o sapato é automaticamente reembaralhado para garantir total imparcialidade em cada mão." },
        { title:"Regras da terceira carta", body:"As regras da terceira carta são fixas e públicas: o Jogador pede carta se seu total for 0–5; o Banqueiro pede carta com base em seu total e na terceira carta do Jogador seguindo o quadro padrão do Ponto Banco. Não há decisões discricionárias do cassino — o resultado sempre segue as mesmas regras determinísticas." },
        { title:"Comissão do Banqueiro", body:"A aposta no Banqueiro paga com uma comissão de 5% sobre os ganhos líquidos, o que reflete a ligeira vantagem estatística que o Banqueiro tem pelas regras do jogo. O Empate paga 8x a aposta. Todas as comissões e pagamentos são calculados automaticamente e visíveis antes de apostar." },
      ],
      tags:["Sapato de 8 baralhos auditado","Regras padrão do Ponto Banco","Comissão de 5% no Banqueiro"],
    },
  ],
  de: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice ist ein Würfelspiel, bei dem du eine Zielzahl wählst und darauf setzt, ob das Ergebnis darüber oder darunter liegt. Der Bereich geht von 0 bis 100, und du kannst deine Gewinnwahrscheinlichkeit je nach Strategie anpassen.",
      sections:[
        { title:"Wie das Ergebnis bestimmt wird", body:"Jeder Wurf generiert eine Zahl zwischen 0 und 100 auf vollkommen zufällige Weise genau in dem Moment, in dem du deine Wette bestätigst. Kein internes oder externes System kann das Ergebnis vorhersagen oder beeinflussen." },
        { title:"Zufallssystem", body:"Wir verwenden hochentropische Zufallszahlengeneratoren, die unabhängig vom Casino sind. Das bedeutet, dass jedes Ergebnis statistisch unvorhersehbar und nicht mit vorherigen oder zukünftigen Würfen verbunden ist." },
        { title:"Kein versteckter Hausvorteil", body:"Der Hausvorteil bei Mander Dice ist fest, sichtbar und variiert nicht zwischen Runden. Es gibt keinen Mechanismus, der Ergebnisse basierend auf deiner Wetthistorie oder deinem aktuellen Guthaben anpasst." },
      ],
      tags:["100% zufällige Ergebnisse","Fester und sichtbarer Hausvorteil","Kein Gedächtnis zwischen Runden"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"Bei Mander Plinko fällt eine Kugel von der Spitze eines Stiftbretts und prallt zufällig ab, bis sie in einem der unteren Slots landet, von denen jeder einen anderen Multiplikator hat.",
      sections:[
        { title:"Wie der Pfad bestimmt wird", body:"Die Flugbahn der Kugel wird durch einen zufälligen Entscheidungsprozess an jedem Stift berechnet. An jeder Verzweigung hat die Kugel die gleiche Wahrscheinlichkeit, links oder rechts zu gehen, was das endgültige Ziel unvorhersehbar macht." },
        { title:"Spielphysik", body:"Die Bewegung der Kugel simuliert echte Physik mit reiner Zufälligkeit bei jedem Aufprall. Das Casino hat keine Kontrolle darüber, in welchem Slot die Kugel landet, sobald sie zu fallen beginnt." },
        { title:"Multiplikator-Transparenz", body:"Die Multiplikatoren für jeden Slot sind fest und vor der Wette sichtbar. Das Spiel passt weder die Multiplikatoren noch das Verhalten der Kugel basierend auf deiner Historie an." },
      ],
      tags:["Zufällig generierter Pfad","Feste und sichtbare Multiplikatoren","Keine externe Einflussnahme"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno ist ein Lotteriespiel, bei dem du zwischen 1 und 10 Zahlen von 1 bis 40 auswählst. Das System zieht dann zufällig eine Reihe von Gewinnzahlen und du erhältst einen Preis je nachdem, wie viele deiner Zahlen übereinstimmen.",
      sections:[
        { title:"Wie Zahlen gezogen werden", body:"Die Gewinnzahlen werden durch einen Zufallszahlengenerator ausgewählt, der garantiert, dass jede Zahl auf dem Brett genau die gleiche Wahrscheinlichkeit hat, gewählt zu werden. Der Ziehungsprozess ist völlig unabhängig von den Zahlen, die du ausgewählt hast." },
        { title:"Garantierte Fairness", body:"Das Casino hat keine Informationen darüber, welche Zahlen du zum Zeitpunkt der Ziehung ausgewählt hast. Ergebnisse können nicht angepasst werden, um bestimmte Spieler zu begünstigen oder zu benachteiligen." },
        { title:"Gewinntabelle", body:"Die Multiplikatoren und Gewinne für jede Trefferanzahl sind fest und vor der Wette verfügbar. Es gibt keine dynamischen Preisänderungen basierend auf dem Saldo der Runde." },
      ],
      tags:["Vollständig zufällige Ziehung","Gleiche Chancen für alle","Feste und transparente Preise"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack ist das klassische Kartenspiel, bei dem es darum geht, so nah wie möglich an 21 zu kommen, ohne zu überbieten und den Dealer zu schlagen. Du kannst je nach Hand eine Karte nehmen, stehen bleiben, verdoppeln oder teilen.",
      sections:[
        { title:"Wie Karten ausgeteilt werden", body:"Vor jeder Runde wird das vollständige Deck mithilfe eines Standard-Mischalgorithmus zufällig gemischt. Jede ausgeteilte Karte wird aus diesem gemischten Deck ohne jegliche Vorauswahl oder Manipulation gezogen." },
        { title:"Der Dealer hat keinen versteckten Vorteil", body:"Die Regeln des Dealers sind fest und sichtbar: Der Dealer nimmt immer eine Karte bei 16 oder weniger und bleibt bei 17 oder mehr stehen. Diese Regel ändert sich nicht zwischen Spielen und passt sich nicht an vorherige Rundenergebnisse an." },
        { title:"Keine markierten Karten", body:"Es gibt keinen Mechanismus, der es dem Casino ermöglicht, im Voraus zu wissen, welche Karten die Spieler haben. Der Ausgabeprozess ist für alle Casino-Systeme blind, bis die Karten aufgedeckt werden." },
      ],
      tags:["Zufällig gemischtes Deck","Feste Dealer-Regeln","Kein versteckter Vorteil"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"Bei Mander Mines sind eine Anzahl von Minen in einem Raster versteckt. Du musst Felder aufdecken, ohne eine Mine zu treffen, um Gewinne anzusammeln. Je weiter du vorankommst, desto höher ist dein Multiplikator.",
      sections:[
        { title:"Wie Minen platziert werden", body:"Die Positionen aller Minen werden zufällig in dem Moment bestimmt, in dem du deine Wette bestätigst, bevor du deine erste Auswahl triffst. Einmal platziert, ändern sich ihre Positionen während der Runde nicht." },
        { title:"Das Casino kennt deine Strategie nicht", body:"Das System, das Minen platziert, arbeitet unabhängig von deinem Spielverhalten. Minenpositionen werden nicht als Reaktion auf die von dir gewählten Felder oder deine Spielhistorie angepasst." },
        { title:"Progressive Multiplikatoren", body:"Die Multiplikatoren, die du beim Aufdecken jedes sicheren Feldes erhältst, sind fest und werden basierend auf den realen Wahrscheinlichkeiten des Spiels berechnet. Es gibt keine dynamischen Anpassungen, die dein Gewinnpotenzial während einer aktiven Runde verändern." },
      ],
      tags:["Positionen zu Beginn festgelegt","Keine Anpassungen während der Runde","Multiplikatoren auf Basis realer Wahrscheinlichkeiten"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo ist ein Kartenspiel, bei dem eine Karte aufgedeckt wird und du vorhersagen musst, ob die nächste höher oder niedriger sein wird. Jede richtige Vorhersage erhöht deinen Multiplikator.",
      sections:[
        { title:"Wie Karten generiert werden", body:"Jede aufgedeckte Karte wird zufällig aus einem gemischten Standarddeck gezogen. Das System hat keine Information darüber, welche Karte als nächstes kommt, wenn es dir die aktuelle Karte zeigt." },
        { title:"Vorhersagen ohne Betrug", body:"Die Wahrscheinlichkeiten, dass die nächste Karte höher oder niedriger ist, werden basierend auf den bereits ausgeteilten Karten berechnet. Das Casino manipuliert die nächste Karte nicht, um deine Vorhersage zu entkräften." },
        { title:"Anpassbares Risiko", body:"Du kannst je nach Strategie zwischen höheren oder niedrigeren Risikooptionen wählen. Die zugehörigen Multiplikatoren spiegeln die realen Wahrscheinlichkeiten jeder Option genau wider." },
      ],
      tags:["Zufällig gezogene Karten","Echtzeit-Wahrscheinlichkeitsberechnung","Keine Ergebnismanipulation"],
    },
    {
      key:"Roulette", label:"Roulette", color:"#f43f5e", soon:false,
      how:"Mander Roulette bietet das klassische Casino-Erlebnis mit einem europäischen Roulette-Rad. Setze auf eine Zahl, Farbe, gerade/ungerade oder eine Gruppe von Zahlen und beobachte, wo die Kugel landet.",
      sections:[
        { title:"Wie die Gewinnzahl bestimmt wird", body:"Jede Drehung des Roulette-Rads erzeugt eine vollkommen zufällige Zahl zwischen 0 und 36. Der Prozess ist sofortig und erfolgt genau im Moment der Drehung, ohne Vorbestimmung oder vorhersehbare Zyklen." },
        { title:"Europäisches Roulette", body:"Mander Roulette verwendet das europäische Format mit einer einzigen Null, was dem Spieler im Vergleich zur amerikanischen Version bessere Chancen bietet. Der Hausvorteil ist fest und transparent." },
        { title:"Jede Drehung ist unabhängig", body:"Das Ergebnis einer Drehung hat keine statistische Beziehung zu vorherigen Drehungen. Es gibt keine Muster, Zyklen oder Anpassungen, die bestimmte Zahlen über die Zeit häufiger oder seltener erscheinen lassen." },
      ],
      tags:["Zufällige Zahl pro Drehung","Europäisches Roulette (einzige Null)","Jede Drehung ist unabhängig"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat verwendet einen Schuh mit 8 Decks, der vor jeder Runde zufällig gemischt wird. Karten werden nach den klassischen Punto-Banco-Regeln ausgeteilt: Spieler und Banker erhalten jeweils zwei Karten, mit einer möglichen dritten Karte nach festen Regeln. Du kannst auf Spieler, Banker (mit 5% Provision auf Gewinne) oder Unentschieden setzen.",
      sections:[
        { title:"Zufälligkeit des Decks", body:"Jede Baccarat-Runde zieht Karten aus einem 8-Deck-Schuh, der mit demselben geprüften Zufallssystem gemischt wird, das wir in allen unseren Spielen verwenden. Wenn weniger als 15 Karten übrig sind, wird der Schuh automatisch neu gemischt, um totale Fairness bei jeder Hand zu gewährleisten." },
        { title:"Regeln für die dritte Karte", body:"Die Dritte-Karte-Regeln sind fest und öffentlich: Der Spieler zieht, wenn sein Gesamtwert 0–5 beträgt; der Banker zieht basierend auf seinem Gesamtwert und der dritten Karte des Spielers gemäß der Standard-Punto-Banco-Tabelle. Es gibt keine diskreten Casino-Entscheidungen — das Ergebnis folgt immer denselben deterministischen Regeln." },
        { title:"Banker-Provision", body:"Die Banker-Wette zahlt mit einer Provision von 5% auf die Nettogewinne, was den leichten statistischen Vorteil widerspiegelt, den der Banker gemäß den Spielregeln hat. Unentschieden zahlt 8x den Einsatz. Alle Provisionen und Auszahlungen werden automatisch berechnet und sind vor dem Wetten sichtbar." },
      ],
      tags:["Geprüfter 8-Deck-Schuh","Standard Punto-Banco-Regeln","5% Banker-Provision"],
    },
  ],
  fr: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice est un jeu de dés où vous choisissez un nombre cible et pariez que le résultat tombera au-dessus ou en dessous de celui-ci. La plage va de 0 à 100 et vous pouvez ajuster votre probabilité de gain selon votre stratégie.",
      sections:[
        { title:"Comment le résultat est déterminé", body:"Chaque lancer génère un nombre entre 0 et 100 de manière entièrement aléatoire au moment exact où vous confirmez votre mise. Aucun système interne ou externe ne peut prédire ou influencer le résultat avant qu'il se produise." },
        { title:"Système d'aléatoire", body:"Nous utilisons des générateurs de nombres aléatoires à haute entropie, indépendants du casino. Cela signifie que chaque résultat est statistiquement imprévisible et sans rapport avec les lancers précédents ou futurs." },
        { title:"Aucun avantage caché", body:"L'avantage de la maison dans Mander Dice est fixe, visible et ne varie pas entre les rondes. Il n'existe aucun mécanisme ajustant les résultats en fonction de votre historique de mises ou de votre solde actuel." },
      ],
      tags:["Résultats 100% aléatoires","Avantage maison fixe et visible","Aucune mémoire entre les rondes"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"Dans Mander Plinko, une balle tombe du sommet d'un plateau de chevilles et rebondit aléatoirement jusqu'à atterrir dans l'une des fentes inférieures, chacune avec un multiplicateur différent.",
      sections:[
        { title:"Comment le chemin est déterminé", body:"La trajectoire de la balle est calculée à partir d'un processus de décision aléatoire à chaque cheville. À chaque point de bifurcation, la balle a une probabilité égale d'aller à gauche ou à droite, rendant la destination finale impossible à prédire." },
        { title:"Physique du jeu", body:"Le mouvement de la balle simule une physique réelle avec un pur aléatoire à chaque rebond. Le casino n'a aucun contrôle sur la fente dans laquelle atterrira la balle une fois sa chute entamée." },
        { title:"Transparence des multiplicateurs", body:"Les multiplicateurs de chaque fente sont fixes et visibles avant de placer votre mise. Le jeu n'ajuste ni les multiplicateurs ni le comportement de la balle en fonction de votre historique." },
      ],
      tags:["Trajectoire générée aléatoirement","Multiplicateurs fixes et visibles","Aucune interférence externe"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno est un jeu de loterie où vous sélectionnez entre 1 et 10 numéros de 1 à 40. Le système tire ensuite une série de numéros gagnants aléatoirement et vous recevez un prix selon le nombre de vos numéros qui correspondent.",
      sections:[
        { title:"Comment les numéros sont tirés", body:"Les numéros gagnants sont sélectionnés par un générateur de nombres aléatoires qui garantit que chaque numéro du plateau a exactement la même probabilité d'être choisi. Le processus de tirage est entièrement indépendant des numéros que vous avez sélectionnés." },
        { title:"Équité garantie", body:"Le casino n'a aucune information sur les numéros que vous avez choisis au moment du tirage. Les résultats ne peuvent pas être ajustés pour favoriser ou défavoriser un joueur particulier." },
        { title:"Tableau des prix", body:"Les multiplicateurs et prix pour chaque nombre de correspondances sont fixes et disponibles avant de placer votre mise. Il n'existe aucune modification dynamique des prix selon le solde de la salle." },
      ],
      tags:["Tirage entièrement aléatoire","Probabilités égales pour tous","Prix fixes et transparents"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack est le jeu de cartes classique où l'objectif est de s'approcher le plus possible de 21 sans dépasser, en battant le croupier. Vous pouvez tirer une carte, rester, doubler ou séparer selon votre main.",
      sections:[
        { title:"Comment les cartes sont distribuées", body:"Avant chaque manche, le jeu complet est mélangé aléatoirement à l'aide d'un algorithme de mélange standard. Chaque carte distribuée est tirée de ce jeu mélangé sans aucune présélection ni manipulation." },
        { title:"Le croupier n'a pas d'avantage caché", body:"Les règles du croupier sont fixes et visibles : le croupier tire toujours une carte avec 16 ou moins et reste avec 17 ou plus. Cette règle ne change pas entre les parties et ne s'ajuste pas selon les résultats des rondes précédentes." },
        { title:"Aucune carte marquée", body:"Il n'existe aucun mécanisme permettant au casino de savoir à l'avance quelles cartes ont les joueurs. Le processus de distribution est aveugle pour tous les systèmes du casino jusqu'à ce que les cartes soient révélées." },
      ],
      tags:["Jeu mélangé aléatoirement","Règles du croupier fixes","Aucun avantage caché"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"Dans Mander Mines, un nombre de mines est caché dans une grille. Vous devez révéler des cases sans toucher aucune mine pour accumuler des gains. Plus vous avancez, plus votre multiplicateur est élevé.",
      sections:[
        { title:"Comment les mines sont placées", body:"Les positions de toutes les mines sont déterminées aléatoirement à l'instant où vous confirmez votre mise, avant de faire votre première sélection. Une fois placées, leurs positions ne changent pas pendant la manche." },
        { title:"Le casino ne connaît pas votre stratégie", body:"Le système qui place les mines fonctionne indépendamment de votre comportement de jeu. Les positions des mines ne sont pas ajustées en réponse aux cases que vous avez choisies ou à votre historique de parties." },
        { title:"Multiplicateurs progressifs", body:"Les multiplicateurs que vous obtenez en révélant chaque case sûre sont fixes et calculés sur la base des probabilités réelles du jeu. Il n'existe aucun ajustement dynamique modifiant votre potentiel de gains pendant une manche active." },
      ],
      tags:["Positions fixées au début","Aucun ajustement en cours de manche","Multiplicateurs basés sur les probabilités réelles"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo est un jeu de cartes où une carte est révélée et vous devez prédire si la suivante sera plus haute ou plus basse. Chaque prédiction correcte augmente votre multiplicateur.",
      sections:[
        { title:"Comment les cartes sont générées", body:"Chaque carte révélée est tirée aléatoirement d'un jeu standard mélangé. Le système n'a aucune information sur quelle carte sortira ensuite au moment où il vous montre la carte actuelle." },
        { title:"Prédictions sans triche", body:"Les probabilités que la prochaine carte soit plus haute ou plus basse sont calculées sur la base des cartes déjà distribuées. Le casino ne manipule pas la prochaine carte pour invalider votre prédiction." },
        { title:"Risque ajustable", body:"Vous pouvez choisir entre des options à risque plus élevé ou plus faible selon votre stratégie. Les multiplicateurs associés reflètent avec précision les probabilités réelles de chaque option." },
      ],
      tags:["Cartes tirées aléatoirement","Calcul des probabilités en temps réel","Aucune manipulation des résultats"],
    },
    {
      key:"Roulette", label:"Roulette", color:"#f43f5e", soon:false,
      how:"Mander Roulette offre l'expérience classique du casino avec une roulette européenne. Misez sur un numéro, une couleur, pair/impair ou un groupe de numéros et regardez où tombe la bille.",
      sections:[
        { title:"Comment le numéro gagnant est déterminé", body:"Chaque rotation de la roulette produit un numéro entièrement aléatoire entre 0 et 36. Le processus est instantané et se produit au moment exact de la rotation, sans prédétermination ni cycles prévisibles." },
        { title:"Roulette européenne", body:"Mander Roulette utilise le format européen avec un seul zéro, ce qui offre de meilleures chances au joueur par rapport à la version américaine. L'avantage de la maison est fixe et transparent." },
        { title:"Chaque rotation est indépendante", body:"Le résultat d'une rotation n'a aucune relation statistique avec les rotations précédentes. Il n'existe aucun schéma, cycle ou ajustement faisant apparaître certains numéros plus ou moins fréquemment au fil du temps." },
      ],
      tags:["Numéro aléatoire par rotation","Roulette européenne (zéro unique)","Chaque rotation est indépendante"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat utilise un sabot de 8 jeux mélangés aléatoirement avant chaque manche. Les cartes sont distribuées selon les règles classiques du Punto Banco : le joueur et le banquier reçoivent deux cartes chacun, avec une possible troisième carte selon des règles fixes. Vous pouvez miser sur le Joueur, le Banquier (avec une commission de 5% sur les gains) ou l'Égalité.",
      sections:[
        { title:"Aléatoire du sabot", body:"Chaque manche de Baccarat tire des cartes d'un sabot de 8 jeux mélangés avec le même système d'aléatoire audité que nous utilisons dans tous nos jeux. Lorsqu'il reste moins de 15 cartes, le sabot est automatiquement retiré pour garantir une équité totale à chaque main." },
        { title:"Règles de la troisième carte", body:"Les règles de la troisième carte sont fixes et publiques : le Joueur tire si son total est 0–5 ; le Banquier tire selon son total et la troisième carte du Joueur en suivant le tableau standard du Punto Banco. Il n'y a aucune décision discrétionnaire du casino — le résultat suit toujours les mêmes règles déterministes." },
        { title:"Commission du Banquier", body:"La mise sur le Banquier paie avec une commission de 5% sur les gains nets, ce qui reflète le léger avantage statistique que le Banquier possède selon les règles du jeu. L'Égalité paie 8x la mise. Toutes les commissions et paiements sont calculés automatiquement et visibles avant de miser." },
      ],
      tags:["Sabot de 8 jeux audité","Règles Punto Banco standard","Commission 5% sur le Banquier"],
    },
  ],
  id: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice adalah permainan dadu di mana kamu memilih angka target dan bertaruh apakah hasilnya akan lebih tinggi atau lebih rendah. Rentangnya dari 0 hingga 100, dan kamu bisa menyesuaikan probabilitas menangmu sesuai strategi.",
      sections:[
        { title:"Bagaimana hasil ditentukan", body:"Setiap lemparan menghasilkan angka antara 0 dan 100 secara acak sempurna pada saat kamu mengonfirmasi taruhan. Tidak ada sistem internal maupun eksternal yang bisa memprediksi atau mempengaruhi hasilnya." },
        { title:"Sistem keacakan", body:"Kami menggunakan generator angka acak entropi tinggi yang independen dari kasino. Ini berarti setiap hasil secara statistik tidak dapat diprediksi dan tidak terkait dengan lemparan sebelumnya atau berikutnya." },
        { title:"Tanpa keunggulan tersembunyi", body:"House edge di Mander Dice tetap, terlihat, dan tidak berubah antar putaran. Tidak ada mekanisme yang menyesuaikan hasil berdasarkan riwayat taruhan atau saldo saat ini." },
      ],
      tags:["Hasil 100% acak","House edge tetap dan terlihat","Tanpa memori antar putaran"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"Di Mander Plinko, bola jatuh dari atas papan pasak dan memantul secara acak hingga mendarat di salah satu slot bawah, masing-masing dengan pengganda yang berbeda.",
      sections:[
        { title:"Bagaimana jalur ditentukan", body:"Lintasan bola dihitung dari proses keputusan acak di setiap pasak. Di setiap titik percabangan, bola memiliki probabilitas yang sama untuk ke kiri atau kanan, membuat tujuan akhir tidak dapat diprediksi." },
        { title:"Fisika permainan", body:"Gerakan bola mensimulasikan fisika nyata dengan keacakan murni di setiap pantulan. Kasino tidak memiliki kendali atas slot mana tempat bola akan mendarat setelah mulai jatuh." },
        { title:"Transparansi pengganda", body:"Pengganda untuk setiap slot sudah tetap dan terlihat sebelum kamu memasang taruhan. Permainan tidak menyesuaikan pengganda atau perilaku bola berdasarkan riwayatmu." },
      ],
      tags:["Jalur yang dihasilkan secara acak","Pengganda tetap dan terlihat","Tanpa interferensi eksternal"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno adalah permainan lotere di mana kamu memilih antara 1 dan 10 angka dari 1 hingga 40. Sistem kemudian mengundi sejumlah angka pemenang secara acak dan kamu mendapatkan hadiah berdasarkan berapa banyak angkamu yang cocok.",
      sections:[
        { title:"Bagaimana angka diundi", body:"Angka pemenang dipilih oleh generator angka acak yang memastikan setiap angka di papan memiliki probabilitas yang sama untuk dipilih. Proses pengundian sepenuhnya independen dari angka yang kamu pilih." },
        { title:"Keadilan terjamin", body:"Kasino tidak memiliki informasi tentang angka mana yang kamu pilih pada saat pengundian. Hasil tidak dapat disesuaikan untuk menguntungkan atau merugikan pemain tertentu." },
        { title:"Tabel hadiah", body:"Pengganda dan hadiah untuk setiap jumlah kecocokan sudah tetap dan tersedia sebelum kamu memasang taruhan. Tidak ada perubahan hadiah dinamis berdasarkan saldo ruangan." },
      ],
      tags:["Pengundian sepenuhnya acak","Probabilitas sama untuk semua","Hadiah tetap dan transparan"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack adalah permainan kartu klasik di mana tujuannya adalah mendekati 21 tanpa melampaui, mengalahkan dealer. Kamu bisa minta kartu, berdiri, menggandakan, atau membagi tergantung tanganmu.",
      sections:[
        { title:"Bagaimana kartu dibagikan", body:"Sebelum setiap putaran, dek lengkap dikocok secara acak menggunakan algoritma pengocok standar. Setiap kartu yang dibagikan diambil dari dek yang dikocok ini tanpa pra-seleksi atau manipulasi apapun." },
        { title:"Dealer tidak memiliki keunggulan tersembunyi", body:"Aturan dealer sudah tetap dan terlihat: dealer selalu minta kartu dengan 16 atau kurang dan berdiri dengan 17 atau lebih. Aturan ini tidak berubah antar permainan atau disesuaikan berdasarkan hasil putaran sebelumnya." },
        { title:"Tanpa kartu yang ditandai", body:"Tidak ada mekanisme yang memungkinkan kasino mengetahui lebih awal kartu apa yang dimiliki pemain. Proses pembagian buta bagi semua sistem kasino sampai kartu diungkapkan." },
      ],
      tags:["Dek dikocok secara acak","Aturan dealer tetap","Tanpa keunggulan tersembunyi"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"Di Mander Mines, sejumlah ranjau tersembunyi di kotak. Kamu harus mengungkap kotak tanpa menyentuh ranjau apapun untuk mengumpulkan kemenangan. Semakin jauh kamu melangkah, semakin tinggi penggandamu.",
      sections:[
        { title:"Bagaimana ranjau ditempatkan", body:"Posisi semua ranjau ditentukan secara acak pada saat kamu mengonfirmasi taruhan, sebelum kamu membuat pilihan pertama. Setelah ditempatkan, posisi mereka tidak berubah selama putaran." },
        { title:"Kasino tidak tahu strategimu", body:"Sistem yang menempatkan ranjau beroperasi secara independen dari perilaku bermainmu. Posisi ranjau tidak disesuaikan sebagai respons terhadap kotak yang kamu pilih atau riwayat permainanmu." },
        { title:"Pengganda progresif", body:"Pengganda yang kamu dapatkan saat mengungkap setiap kotak aman sudah tetap dan dihitung berdasarkan probabilitas nyata permainan. Tidak ada penyesuaian dinamis yang mengubah potensi penghasilanmu selama putaran aktif." },
      ],
      tags:["Posisi ditetapkan di awal","Tanpa penyesuaian di tengah putaran","Pengganda berdasarkan probabilitas nyata"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo adalah permainan kartu di mana sebuah kartu diungkapkan dan kamu harus memprediksi apakah kartu berikutnya akan lebih tinggi atau lebih rendah. Setiap prediksi yang benar meningkatkan penggandamu.",
      sections:[
        { title:"Bagaimana kartu dihasilkan", body:"Setiap kartu yang diungkapkan diambil secara acak dari dek standar yang dikocok. Sistem tidak memiliki informasi tentang kartu apa yang akan keluar berikutnya pada saat menunjukkan kartu saat ini." },
        { title:"Prediksi tanpa kecurangan", body:"Probabilitas kartu berikutnya lebih tinggi atau lebih rendah dihitung berdasarkan kartu yang sudah keluar. Kasino tidak memanipulasi kartu berikutnya untuk membatalkan prediksimu." },
        { title:"Risiko yang dapat disesuaikan", body:"Kamu bisa memilih antara opsi risiko lebih tinggi atau lebih rendah sesuai strategimu. Pengganda yang terkait mencerminkan dengan tepat probabilitas nyata setiap opsi." },
      ],
      tags:["Kartu diambil secara acak","Perhitungan probabilitas real-time","Tanpa manipulasi hasil"],
    },
    {
      key:"Roulette", label:"Roulette", color:"#f43f5e", soon:false,
      how:"Mander Roulette menawarkan pengalaman kasino klasik dengan roda roulette Eropa. Taruhan pada angka, warna, genap/ganjil, atau kelompok angka dan saksikan di mana bola berhenti.",
      sections:[
        { title:"Bagaimana angka pemenang ditentukan", body:"Setiap putaran roulette menghasilkan angka yang sepenuhnya acak antara 0 dan 36. Prosesnya seketika dan terjadi pada saat tepat putaran, tanpa pra-penentuan atau siklus yang dapat diprediksi." },
        { title:"Roulette Eropa", body:"Mander Roulette menggunakan format Eropa dengan satu nol, yang menawarkan peluang lebih baik bagi pemain dibandingkan versi Amerika. House edge sudah tetap dan transparan." },
        { title:"Setiap putaran independen", body:"Hasil satu putaran tidak memiliki hubungan statistik dengan putaran sebelumnya. Tidak ada pola, siklus, atau penyesuaian yang membuat angka tertentu muncul lebih atau kurang sering dari waktu ke waktu." },
      ],
      tags:["Angka acak per putaran","Roulette Eropa (nol tunggal)","Setiap putaran independen"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat menggunakan sepatu 8 dek yang dikocok secara acak sebelum setiap putaran. Kartu dibagikan mengikuti aturan Punto Banco klasik: pemain dan bankir masing-masing menerima dua kartu, dengan kemungkinan kartu ketiga sesuai aturan tetap. Kamu bisa bertaruh pada Pemain, Bankir (dengan komisi 5% atas kemenangan), atau Seri.",
      sections:[
        { title:"Keacakan dek", body:"Setiap putaran Baccarat mengambil kartu dari sepatu 8 dek yang dikocok dengan sistem keacakan teraudit yang sama yang kami gunakan di semua permainan kami. Ketika kurang dari 15 kartu tersisa, sepatu secara otomatis dikocok ulang untuk memastikan keadilan total di setiap tangan." },
        { title:"Aturan kartu ketiga", body:"Aturan kartu ketiga sudah tetap dan publik: Pemain minta kartu jika totalnya 0–5; Bankir minta kartu berdasarkan total mereka dan kartu ketiga Pemain mengikuti tabel Punto Banco standar. Tidak ada keputusan diskresioner kasino — hasilnya selalu mengikuti aturan deterministik yang sama." },
        { title:"Komisi Bankir", body:"Taruhan Bankir membayar dengan komisi 5% atas kemenangan bersih, yang mencerminkan keunggulan statistik sedikit yang dimiliki Bankir berdasarkan aturan permainan. Seri membayar 8x taruhan. Semua komisi dan pembayaran dihitung secara otomatis dan terlihat sebelum bertaruh." },
      ],
      tags:["Sepatu 8 dek teraudit","Aturan Punto Banco standar","Komisi 5% Bankir"],
    },
  ],
  it: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice è un gioco di dadi in cui scegli un numero target e scommetti se il risultato cadrà al di sopra o al di sotto di esso. L'intervallo va da 0 a 100 e puoi regolare la tua probabilità di vincita secondo la tua strategia.",
      sections:[
        { title:"Come viene determinato il risultato", body:"Ogni lancio genera un numero tra 0 e 100 in modo completamente casuale nel momento esatto in cui confermi la tua scommessa. Nessun sistema interno o esterno può prevedere o influenzare il risultato prima che accada." },
        { title:"Sistema di casualità", body:"Utilizziamo generatori di numeri casuali ad alta entropia, indipendenti dal casino. Ciò significa che ogni risultato è statisticamente imprevedibile e non correlato a lanci precedenti o futuri." },
        { title:"Nessun vantaggio nascosto", body:"Il vantaggio della casa in Mander Dice è fisso, visibile e non varia tra i round. Non esiste alcun meccanismo che aggiusta i risultati in base alla cronologia delle tue scommesse o al saldo attuale." },
      ],
      tags:["Risultati 100% casuali","Vantaggio casa fisso e visibile","Nessuna memoria tra i round"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"In Mander Plinko, una pallina cade dalla cima di un pannello di pioli e rimbalza casualmente fino ad atterrare in uno degli slot inferiori, ciascuno con un moltiplicatore diverso.",
      sections:[
        { title:"Come viene determinato il percorso", body:"La traiettoria della pallina viene calcolata da un processo decisionale casuale ad ogni piolo. Ad ogni punto di diramazione, la pallina ha uguale probabilità di andare a sinistra o a destra, rendendo la destinazione finale impossibile da prevedere." },
        { title:"Fisica di gioco", body:"Il movimento della pallina simula fisica reale con pura casualità ad ogni rimbalzo. Il casino non ha controllo su quale slot atterrerà la pallina una volta che inizia la caduta." },
        { title:"Trasparenza dei moltiplicatori", body:"I moltiplicatori di ogni slot sono fissi e visibili prima di effettuare la scommessa. Il gioco non aggiusta né i moltiplicatori né il comportamento della pallina in base alla cronologia dell'utente." },
      ],
      tags:["Percorso generato casualmente","Moltiplicatori fissi e visibili","Nessuna interferenza esterna"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno è un gioco a lotteria dove selezioni da 1 a 10 numeri da 1 a 40. Il sistema estrae quindi una serie di numeri vincenti casualmente e ricevi un premio in base a quanti dei tuoi numeri corrispondono.",
      sections:[
        { title:"Come vengono estratti i numeri", body:"I numeri vincenti vengono selezionati da un generatore di numeri casuali che garantisce che ogni numero sul tabellone abbia esattamente la stessa probabilità di essere scelto. Il processo di estrazione è completamente indipendente dai numeri che hai selezionato." },
        { title:"Equità garantita", body:"Il casino non ha informazioni su quali numeri hai scelto al momento dell'estrazione. I risultati non possono essere modificati per favorire o svantaggiare nessun giocatore in particolare." },
        { title:"Tabella dei premi", body:"I moltiplicatori e i premi per ogni numero di corrispondenze sono fissi e disponibili prima di effettuare la scommessa. Non esistono modifiche dinamiche ai premi in base al saldo della stanza." },
      ],
      tags:["Estrazione completamente casuale","Probabilità uguali per tutti","Premi fissi e trasparenti"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack è il classico gioco di carte in cui l'obiettivo è avvicinarsi il più possibile a 21 senza superarlo, battendo il dealer. Puoi chiedere carta, stare, raddoppiare o dividere a seconda della tua mano.",
      sections:[
        { title:"Come vengono distribuite le carte", body:"Prima di ogni round, il mazzo completo viene mischiato casualmente usando un algoritmo di mescolamento standard. Ogni carta distribuita viene estratta da questo mazzo mischiato senza alcuna pre-selezione o manipolazione." },
        { title:"Il dealer non ha vantaggio nascosto", body:"Le regole del dealer sono fisse e visibili: il dealer chiede sempre carta con 16 o meno e sta con 17 o più. Questa regola non cambia tra le partite e non si adatta ai risultati dei round precedenti." },
        { title:"Nessuna carta segnata", body:"Non esiste alcun meccanismo che consenta al casino di sapere in anticipo quali carte hanno i giocatori. Il processo di distribuzione è cieco per tutti i sistemi del casino fino a quando le carte non vengono rivelate." },
      ],
      tags:["Mazzo mischiato casualmente","Regole del dealer fisse","Nessun vantaggio nascosto"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"In Mander Mines, un numero di mine è nascosto in una griglia. Devi rivelare celle senza colpire nessuna mina per accumulare vincite. Più avanzi, maggiore è il tuo moltiplicatore.",
      sections:[
        { title:"Come vengono posizionate le mine", body:"Le posizioni di tutte le mine vengono determinate casualmente nel momento in cui confermi la tua scommessa, prima di effettuare la prima selezione. Una volta posizionate, le loro posizioni non cambiano durante il round." },
        { title:"Il casino non conosce la tua strategia", body:"Il sistema che posiziona le mine opera indipendentemente dal tuo comportamento di gioco. Le posizioni delle mine non vengono adattate in risposta alle celle che hai scelto o alla cronologia delle partite." },
        { title:"Moltiplicatori progressivi", body:"I moltiplicatori che ottieni rivelando ogni cella sicura sono fissi e calcolati in base alle probabilità reali del gioco. Non esistono adeguamenti dinamici che alterino il tuo potenziale di guadagno durante un round attivo." },
      ],
      tags:["Posizioni fissate all'inizio","Nessun adeguamento durante il round","Moltiplicatori basati su probabilità reali"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo è un gioco di carte in cui viene rivelata una carta e devi prevedere se quella successiva sarà più alta o più bassa. Ogni previsione corretta aumenta il tuo moltiplicatore.",
      sections:[
        { title:"Come vengono generate le carte", body:"Ogni carta rivelata viene estratta casualmente da un mazzo standard mischiato. Il sistema non ha informazioni su quale carta uscirà dopo nel momento in cui ti mostra la carta attuale." },
        { title:"Previsioni senza imbrogli", body:"Le probabilità che la prossima carta sia più alta o più bassa vengono calcolate in base alle carte già distribuite. Il casino non manipola la prossima carta per invalidare la tua previsione." },
        { title:"Rischio regolabile", body:"Puoi scegliere tra opzioni a rischio più alto o più basso in base alla tua strategia. I moltiplicatori associati riflettono accuratamente le probabilità reali di ogni opzione." },
      ],
      tags:["Carte estratte casualmente","Calcolo probabilità in tempo reale","Nessuna manipolazione dei risultati"],
    },
    {
      key:"Roulette", label:"Roulette", color:"#f43f5e", soon:false,
      how:"Mander Roulette offre l'esperienza classica del casino con una roulette europea. Scommetti su un numero, colore, pari/dispari o gruppo di numeri e osserva dove cade la pallina.",
      sections:[
        { title:"Come viene determinato il numero vincente", body:"Ogni giro della roulette produce un numero completamente casuale tra 0 e 36. Il processo è istantaneo e avviene nel momento esatto del giro, senza pre-determinazione o cicli prevedibili." },
        { title:"Roulette europea", body:"Mander Roulette usa il formato europeo con un singolo zero, che offre maggiori probabilità per il giocatore rispetto alla versione americana. Il vantaggio della casa è fisso e trasparente." },
        { title:"Ogni giro è indipendente", body:"Il risultato di un giro non ha alcuna relazione statistica con i giri precedenti. Non esistono schemi, cicli o aggiustamenti che facciano apparire certi numeri più o meno frequentemente nel tempo." },
      ],
      tags:["Numero casuale per giro","Roulette europea (zero singolo)","Ogni giro è indipendente"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat utilizza una scarpa da 8 mazzi mescolata casualmente prima di ogni round. Le carte vengono distribuite seguendo le regole classiche del Punto Banco: il giocatore e il banco ricevono due carte ciascuno, con una possibile terza carta secondo regole fisse. Puoi scommettere sul Giocatore, sul Banco (con commissione del 5% sulle vincite) o sul Pareggio.",
      sections:[
        { title:"Casualità del mazzo", body:"Ogni round di Baccarat estrae carte da una scarpa da 8 mazzi mescolati con lo stesso sistema di casualità verificato che usiamo in tutti i nostri giochi. Quando rimangono meno di 15 carte, la scarpa viene automaticamente rimescolata per garantire totale equità in ogni mano." },
        { title:"Regole della terza carta", body:"Le regole della terza carta sono fisse e pubbliche: il Giocatore chiede carta se il suo totale è 0–5; il Banco chiede carta in base al suo totale e alla terza carta del Giocatore seguendo il quadro standard del Punto Banco. Non ci sono decisioni discrezionali del casino — il risultato segue sempre le stesse regole deterministiche." },
        { title:"Commissione del Banco", body:"La scommessa sul Banco paga con una commissione del 5% sulle vincite nette, che riflette il leggero vantaggio statistico che il Banco ha in base alle regole del gioco. Il Pareggio paga 8x la scommessa. Tutte le commissioni e i pagamenti vengono calcolati automaticamente e sono visibili prima di scommettere." },
      ],
      tags:["Scarpa da 8 mazzi verificata","Regole Punto Banco standard","Commissione 5% sul Banco"],
    },
  ],
  ko: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice는 목표 숫자를 선택하고 결과가 그보다 높거나 낮을지에 베팅하는 주사위 게임입니다. 범위는 0에서 100이며 전략에 따라 승리 확률을 조정할 수 있습니다.",
      sections:[
        { title:"결과 결정 방식", body:"각 굴림은 베팅을 확인하는 순간 완전히 무작위로 0에서 100 사이의 숫자를 생성합니다. 어떠한 내부 또는 외부 시스템도 결과를 미리 예측하거나 영향을 줄 수 없습니다." },
        { title:"무작위성 시스템", body:"카지노와 독립적인 고엔트로피 난수 생성기를 사용합니다. 이는 각 결과가 통계적으로 예측 불가능하며 이전 또는 이후 굴림과 무관함을 의미합니다." },
        { title:"숨겨진 이점 없음", body:"Mander Dice의 하우스 엣지는 고정되어 있고, 가시적이며, 라운드 간에 변하지 않습니다. 베팅 기록이나 현재 잔액에 따라 결과를 조정하는 메커니즘은 존재하지 않습니다." },
      ],
      tags:["100% 무작위 결과","고정되고 가시적인 하우스 엣지","라운드 간 기억 없음"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"Mander Plinko에서 공은 핀 보드 상단에서 떨어져 무작위로 튀어 각각 다른 배수기가 있는 하단 슬롯 중 하나에 착지합니다.",
      sections:[
        { title:"경로 결정 방식", body:"공의 궤적은 각 핀에서의 무작위 결정 과정으로 계산됩니다. 각 분기점에서 공은 왼쪽 또는 오른쪽으로 갈 확률이 동일하여 최종 목적지를 예측할 수 없습니다." },
        { title:"게임 물리학", body:"공의 움직임은 각 바운스에서 순수한 무작위성으로 실제 물리학을 시뮬레이션합니다. 카지노는 공이 떨어지기 시작한 후 어느 슬롯에 착지할지 제어할 수 없습니다." },
        { title:"배수기 투명성", body:"각 슬롯의 배수기는 베팅 전에 고정되어 있고 가시적입니다. 게임은 기록에 따라 배수기나 공의 행동을 조정하지 않습니다." },
      ],
      tags:["무작위 생성 경로","고정되고 가시적인 배수기","외부 간섭 없음"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno는 1에서 40 중 1개에서 10개의 숫자를 선택하는 복권 게임입니다. 시스템은 무작위로 당첨 번호를 추첨하며 일치하는 번호 수에 따라 상금을 받습니다.",
      sections:[
        { title:"번호 추첨 방식", body:"당첨 번호는 보드의 모든 번호가 정확히 같은 선택 확률을 갖도록 보장하는 난수 생성기에 의해 선택됩니다. 추첨 과정은 선택한 번호와 완전히 독립적입니다." },
        { title:"보장된 공정성", body:"카지노는 추첨 시점에 어떤 번호를 선택했는지에 대한 정보가 없습니다. 특정 플레이어에게 유리하거나 불리하도록 결과를 조정할 수 없습니다." },
        { title:"상금 테이블", body:"각 적중 수에 대한 배수기와 상금은 베팅 전에 고정되어 있고 이용 가능합니다. 방의 잔액에 따른 동적 상금 변경은 없습니다." },
      ],
      tags:["완전히 무작위 추첨","모든 사람에게 동등한 확률","고정되고 투명한 상금"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack은 딜러를 이기며 21을 초과하지 않고 최대한 가까이 가는 것을 목표로 하는 클래식 카드 게임입니다. 손에 따라 히트, 스탠드, 더블다운, 스플릿을 할 수 있습니다.",
      sections:[
        { title:"카드 배분 방식", body:"각 라운드 전에 전체 덱은 표준 셔플 알고리즘을 사용하여 무작위로 섞습니다. 배분되는 각 카드는 사전 선택이나 조작 없이 이 셔플된 덱에서 뽑힙니다." },
        { title:"딜러에게 숨겨진 이점 없음", body:"딜러 규칙은 고정되어 있고 가시적입니다: 딜러는 항상 16 이하에서 히트하고 17 이상에서 스탠드합니다. 이 규칙은 게임 간에 변하지 않으며 이전 라운드 결과에 따라 조정되지 않습니다." },
        { title:"마킹된 카드 없음", body:"카지노가 플레이어가 어떤 카드를 갖고 있는지 미리 알 수 있는 메커니즘은 없습니다. 배분 과정은 카드가 공개될 때까지 모든 카지노 시스템에 불투명합니다." },
      ],
      tags:["무작위 셔플된 덱","고정된 딜러 규칙","숨겨진 이점 없음"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"Mander Mines에서는 지뢰가 격자에 숨겨져 있습니다. 지뢰를 건드리지 않고 타일을 드러내 상금을 쌓아야 합니다. 더 많이 진행할수록 배수기가 높아집니다.",
      sections:[
        { title:"지뢰 배치 방식", body:"모든 지뢰의 위치는 첫 번째 선택 전 베팅을 확인하는 순간 무작위로 결정됩니다. 배치되면 라운드 동안 위치가 변하지 않습니다." },
        { title:"카지노는 전략을 모름", body:"지뢰를 배치하는 시스템은 게임플레이 행동과 독립적으로 작동합니다. 지뢰 위치는 선택한 타일이나 게임 기록에 반응하여 조정되지 않습니다." },
        { title:"점진적 배수기", body:"각 안전한 타일을 드러낼 때 받는 배수기는 고정되어 있고 게임의 실제 확률에 따라 계산됩니다. 활성 라운드 동안 수익 잠재력을 변경하는 동적 조정은 없습니다." },
      ],
      tags:["시작 시 위치 고정","라운드 중 조정 없음","실제 확률 기반 배수기"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo는 카드가 공개되고 다음 카드가 더 높거나 낮을지 예측해야 하는 카드 게임입니다. 올바른 예측마다 배수기가 증가합니다.",
      sections:[
        { title:"카드 생성 방식", body:"공개된 각 카드는 셔플된 표준 덱에서 무작위로 뽑힙니다. 시스템은 현재 카드를 보여주는 시점에 다음에 어떤 카드가 나올지에 대한 정보가 없습니다." },
        { title:"속임수 없는 예측", body:"다음 카드가 더 높거나 낮을 확률은 이미 나온 카드를 기반으로 계산됩니다. 카지노는 예측을 무효화하기 위해 다음 카드를 조작하지 않습니다." },
        { title:"조정 가능한 위험", body:"전략에 따라 높거나 낮은 위험 옵션 중에서 선택할 수 있습니다. 관련 배수기는 각 옵션의 실제 확률을 정확하게 반영합니다." },
      ],
      tags:["무작위 뽑힌 카드","실시간 확률 계산","결과 조작 없음"],
    },
    {
      key:"Roulette", label:"룰렛", color:"#f43f5e", soon:false,
      how:"Mander 룰렛은 유럽식 룰렛 휠로 클래식 카지노 경험을 제공합니다. 숫자, 색상, 홀수/짝수, 또는 숫자 그룹에 베팅하고 공이 어디에 착지하는지 관찰하세요.",
      sections:[
        { title:"당첨 번호 결정 방식", body:"룰렛의 각 스핀은 0에서 36 사이의 완전히 무작위 번호를 생성합니다. 프로세스는 즉각적이며 스핀의 정확한 순간에 발생하고, 사전 결정이나 예측 가능한 사이클이 없습니다." },
        { title:"유럽식 룰렛", body:"Mander 룰렛은 단일 제로의 유럽 형식을 사용하여 미국 버전에 비해 플레이어에게 더 나은 확률을 제공합니다. 하우스 엣지는 고정되어 있고 투명합니다." },
        { title:"각 스핀은 독립적", body:"한 스핀의 결과는 이전 스핀과 통계적 관계가 없습니다. 시간이 지남에 따라 특정 번호가 더 자주 또는 덜 자주 나타나게 하는 패턴, 사이클 또는 조정은 없습니다." },
      ],
      tags:["스핀당 무작위 번호","유럽식 룰렛 (단일 제로)","각 스핀은 독립적"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat는 각 라운드 전에 무작위로 섞인 8덱 슈를 사용합니다. 카드는 클래식 Punto Banco 규칙에 따라 배분됩니다: 플레이어와 뱅커 각각 두 장을 받고, 고정 규칙에 따라 세 번째 카드가 가능합니다. 플레이어, 뱅커 (수익의 5% 수수료) 또는 타이에 베팅할 수 있습니다.",
      sections:[
        { title:"덱 무작위성", body:"각 Baccarat 라운드는 모든 게임에서 사용하는 동일한 감사된 무작위성 시스템으로 섞인 8덱 슈에서 카드를 뽑습니다. 15장 미만의 카드가 남으면 슈는 자동으로 다시 섞어 모든 패의 완전한 공정성을 보장합니다." },
        { title:"세 번째 카드 규칙", body:"세 번째 카드 규칙은 고정되어 있고 공개적입니다: 플레이어의 합이 0–5이면 카드를 뽑고; 뱅커는 합과 플레이어의 세 번째 카드를 기반으로 표준 Punto Banco 차트에 따라 카드를 뽑습니다. 카지노의 재량적 결정은 없습니다 — 결과는 항상 동일한 결정론적 규칙을 따릅니다." },
        { title:"뱅커 수수료", body:"뱅커 베팅은 순 수익의 5% 수수료를 지불하며, 이는 게임 규칙에 따라 뱅커가 갖는 약간의 통계적 우위를 반영합니다. 타이는 베팅의 8배를 지급합니다. 모든 수수료와 지급은 자동으로 계산되며 베팅 전에 가시적입니다." },
      ],
      tags:["8덱 감사된 슈","표준 Punto Banco 규칙","뱅커 5% 수수료"],
    },
  ],
  nl: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice is een dobbelspel waarbij je een doelgetal kiest en wedt of het resultaat daarboven of daaronder valt. Het bereik gaat van 0 tot 100 en je kunt je winstkans aanpassen naar jouw strategie.",
      sections:[
        { title:"Hoe het resultaat wordt bepaald", body:"Elke worp genereert een getal tussen 0 en 100 op volledig willekeurige wijze op het exacte moment dat je jouw inzet bevestigt. Geen enkel intern of extern systeem kan het resultaat van tevoren voorspellen of beïnvloeden." },
        { title:"Willekeurigheidssysteem", body:"We gebruiken hoogentropische willekeurige getallengeneratoren die onafhankelijk zijn van het casino. Dit betekent dat elk resultaat statistisch onvoorspelbaar is en niet gerelateerd aan vorige of toekomstige worpen." },
        { title:"Geen verborgen voordeel", body:"Het huisvoordeel in Mander Dice is vast, zichtbaar en varieert niet tussen rondes. Er is geen mechanisme dat resultaten aanpast op basis van jouw wetgeschiedenis of huidig saldo." },
      ],
      tags:["100% willekeurige resultaten","Vast en zichtbaar huisvoordeel","Geen geheugen tussen rondes"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"In Mander Plinko valt een bal van de bovenkant van een penbord en stuitert willekeurig tot hij in een van de onderste sleuven belandt, elk met een andere vermenigvuldiger.",
      sections:[
        { title:"Hoe het pad wordt bepaald", body:"De baan van de bal wordt berekend door een willekeurig beslissingsproces bij elke pen. Bij elk vertakkingspunt heeft de bal gelijke kans om links of rechts te gaan, waardoor de eindbestemming onmogelijk te voorspellen is." },
        { title:"Spelfysica", body:"De beweging van de bal simuleert echte fysica met pure willekeur bij elke stuit. Het casino heeft geen controle over in welke sleuf de bal zal belanden zodra hij begint te vallen." },
        { title:"Transparantie van vermenigvuldigers", body:"De vermenigvuldigers voor elke sleuf zijn vast en zichtbaar voordat je jouw inzet plaatst. Het spel past noch de vermenigvuldigers noch het gedrag van de bal aan op basis van jouw geschiedenis." },
      ],
      tags:["Willekeurig gegenereerd pad","Vaste en zichtbare vermenigvuldigers","Geen externe inmenging"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno is een loterij spel waarbij je tussen 1 en 10 getallen kiest van 1 tot 40. Het systeem trekt vervolgens willekeurig een reeks winnende getallen en je ontvangt een prijs op basis van hoeveel van jouw getallen overeenkomen.",
      sections:[
        { title:"Hoe getallen worden getrokken", body:"De winnende getallen worden geselecteerd door een willekeurige getallengenerator die garandeert dat elk getal op het bord exact dezelfde kans heeft om gekozen te worden. Het trekkingsproces is volledig onafhankelijk van de getallen die jij hebt geselecteerd." },
        { title:"Gegarandeerde eerlijkheid", body:"Het casino heeft geen informatie over welke getallen je hebt gekozen op het moment van de trekking. Resultaten kunnen niet worden aangepast om een specifieke speler te bevoordelen of te benadelen." },
        { title:"Prijzentabel", body:"De vermenigvuldigers en prijzen voor elk aantal overeenkomsten zijn vast en beschikbaar voordat je jouw inzet plaatst. Er zijn geen dynamische prijswijzigingen op basis van het saldo van de kamer." },
      ],
      tags:["Volledig willekeurige trekking","Gelijke kansen voor iedereen","Vaste en transparante prijzen"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack is het klassieke kaartspel waarbij het doel is zo dicht mogelijk bij 21 te komen zonder over te gaan, en de dealer te verslaan. Je kunt een kaart nemen, blijven staan, verdubbelen of splitsen afhankelijk van jouw hand.",
      sections:[
        { title:"Hoe kaarten worden gedeeld", body:"Vóór elke ronde wordt het volledige dek willekeurig geschud met een standaard schudalgoritme. Elke gedeelde kaart wordt getrokken uit dit geschudde dek zonder enige voorselectie of manipulatie." },
        { title:"De dealer heeft geen verborgen voordeel", body:"De regels van de dealer zijn vast en zichtbaar: de dealer neemt altijd een kaart met 16 of minder en blijft staan met 17 of meer. Deze regel verandert niet tussen spellen en past zich niet aan op basis van vorige rondeuitkomsten." },
        { title:"Geen gemarkeerde kaarten", body:"Er is geen mechanisme dat het casino in staat stelt vooraf te weten welke kaarten spelers hebben. Het deelproces is blind voor alle casinosystemen totdat de kaarten worden onthuld." },
      ],
      tags:["Willekeurig geschud dek","Vaste dealerregels","Geen verborgen voordeel"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"In Mander Mines zijn een aantal mijnen verstopt in een raster. Je moet tegels onthullen zonder een mijn te raken om winst te accumuleren. Hoe verder je vordert, hoe hoger jouw vermenigvuldiger.",
      sections:[
        { title:"Hoe mijnen worden geplaatst", body:"De posities van alle mijnen worden willekeurig bepaald op het moment dat je jouw inzet bevestigt, vóór je jouw eerste selectie maakt. Eenmaal geplaatst veranderen hun posities niet tijdens de ronde." },
        { title:"Het casino kent jouw strategie niet", body:"Het systeem dat mijnen plaatst werkt onafhankelijk van jouw spelgedrag. Mijnposities worden niet aangepast als reactie op de tegels die je hebt gekozen of jouw spelgeschiedenis." },
        { title:"Progressieve vermenigvuldigers", body:"De vermenigvuldigers die je ontvangt bij het onthullen van elke veilige tegel zijn vast en berekend op basis van de werkelijke kansen van het spel. Er zijn geen dynamische aanpassingen die jouw winstpotentieel tijdens een actieve ronde veranderen." },
      ],
      tags:["Posities vastgesteld bij aanvang","Geen aanpassingen tijdens de ronde","Vermenigvuldigers op basis van echte kansen"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo is een kaartspel waarbij een kaart wordt onthuld en je moet voorspellen of de volgende hoger of lager zal zijn. Elke correcte voorspelling verhoogt jouw vermenigvuldiger.",
      sections:[
        { title:"Hoe kaarten worden gegenereerd", body:"Elke onthulde kaart wordt willekeurig getrokken uit een geschud standaardspel. Het systeem heeft geen informatie over welke kaart als volgende zal komen op het moment dat het je de huidige kaart laat zien." },
        { title:"Voorspellingen zonder bedrog", body:"De kansen dat de volgende kaart hoger of lager is worden berekend op basis van de al uitgedeelde kaarten. Het casino manipuleert de volgende kaart niet om jouw voorspelling ongeldig te maken." },
        { title:"Aanpasbaar risico", body:"Je kunt kiezen tussen opties met hoger of lager risico afhankelijk van jouw strategie. De bijbehorende vermenigvuldigers weerspiegelen nauwkeurig de werkelijke kansen van elke optie." },
      ],
      tags:["Willekeurig getrokken kaarten","Realtime kansberekening","Geen resultaatmanipulatie"],
    },
    {
      key:"Roulette", label:"Roulette", color:"#f43f5e", soon:false,
      how:"Mander Roulette biedt de klassieke casinoervaring met een Europees roulettewiel. Zet in op een getal, kleur, even/oneven of een groep getallen en kijk waar de bal landt.",
      sections:[
        { title:"Hoe het winnende getal wordt bepaald", body:"Elke draai van de roulette produceert een volledig willekeurig getal tussen 0 en 36. Het proces is onmiddellijk en vindt plaats op het exacte moment van de draai, zonder voorbestemming of voorspelbare cycli." },
        { title:"Europese roulette", body:"Mander Roulette gebruikt het Europese formaat met een enkele nul, wat betere kansen biedt voor de speler vergeleken met de Amerikaanse versie. Het huisvoordeel is vast en transparant." },
        { title:"Elke draai is onafhankelijk", body:"De uitkomst van een draai heeft geen statistisch verband met vorige draaien. Er zijn geen patronen, cycli of aanpassingen die bepaalde getallen in de loop van de tijd vaker of minder vaak laten verschijnen." },
      ],
      tags:["Willekeurig getal per draai","Europese roulette (enkele nul)","Elke draai is onafhankelijk"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat gebruikt een schoen van 8 decks die willekeurig wordt geschud voor elke ronde. Kaarten worden gedeeld volgens de klassieke Punto Banco regels: de speler en de bank ontvangen elk twee kaarten, met een mogelijke derde kaart volgens vaste regels. Je kunt wedden op Speler, Bank (met 5% commissie op winst) of Gelijkspel.",
      sections:[
        { title:"Willekeurigheid van het dek", body:"Elke Baccarat-ronde trekt kaarten uit een schoen van 8 decks geschud met hetzelfde gecontroleerde willekeurigheidssysteem dat we in al onze spellen gebruiken. Wanneer minder dan 15 kaarten overblijven, wordt de schoen automatisch opnieuw geschud om totale eerlijkheid bij elke hand te garanderen." },
        { title:"Regels voor de derde kaart", body:"De regels voor de derde kaart zijn vast en openbaar: de Speler trekt als zijn totaal 0–5 is; de Bank trekt op basis van zijn totaal en de derde kaart van de Speler volgens het standaard Punto Banco schema. Er zijn geen discretionaire casinobeslissingen — het resultaat volgt altijd dezelfde deterministische regels." },
        { title:"Bankcommissie", body:"De Bankweddenschap betaalt met een commissie van 5% op de netto winst, wat het lichte statistische voordeel weerspiegelt dat de Bank heeft volgens de spelregels. Gelijkspel betaalt 8x de inzet. Alle commissies en uitbetalingen worden automatisch berekend en zijn zichtbaar vóór het inzetten." },
      ],
      tags:["Gecontroleerde schoen van 8 decks","Standaard Punto Banco regels","5% bankcommissie"],
    },
  ],
  pl: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice to gra w kości, w której wybierasz docelową liczbę i obstawiasz, czy wynik będzie wyższy czy niższy. Zakres wynosi od 0 do 100, a prawdopodobieństwo wygranej możesz dostosować do swojej strategii.",
      sections:[
        { title:"Jak ustalany jest wynik", body:"Każdy rzut generuje liczbę z zakresu 0–100 w sposób całkowicie losowy w momencie potwierdzenia zakładu. Żaden system wewnętrzny ani zewnętrzny nie może przewidzieć ani wpłynąć na wynik przed jego wystąpieniem." },
        { title:"System losowości", body:"Używamy generatorów liczb losowych o wysokiej entropii, niezależnych od kasyna. Oznacza to, że każdy wynik jest statystycznie nieprzewidywalny i niezwiązany z poprzednimi ani przyszłymi rzutami." },
        { title:"Brak ukrytej przewagi", body:"Przewaga domu w Mander Dice jest stała, widoczna i nie zmienia się między rundami. Nie istnieje żaden mechanizm dostosowujący wyniki na podstawie historii zakładów lub bieżącego salda." },
      ],
      tags:["100% losowe wyniki","Stała i widoczna przewaga domu","Brak pamięci między rundami"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"W Mander Plinko kulka spada ze szczytu planszy z kołkami i odbija się losowo, aż wyląduje w jednym z dolnych slotów, z których każdy ma inny mnożnik.",
      sections:[
        { title:"Jak ustalana jest trajektoria", body:"Tor kulki obliczany jest na podstawie losowego procesu decyzyjnego przy każdym kołku. W każdym punkcie rozgałęzienia kulka ma równe prawdopodobieństwo pójścia w lewo lub w prawo, co sprawia, że ostateczny cel jest niemożliwy do przewidzenia." },
        { title:"Fizyka gry", body:"Ruch kulki symuluje prawdziwą fizykę z czystą losowością przy każdym odbiciu. Kasyno nie ma kontroli nad tym, w którym slocie wyląduje kulka po rozpoczęciu spadania." },
        { title:"Przejrzystość mnożników", body:"Mnożniki dla każdego slotu są stałe i widoczne przed postawieniem zakładu. Gra nie dostosowuje mnożników ani zachowania kulki na podstawie historii gracza." },
      ],
      tags:["Losowo generowana trajektoria","Stałe i widoczne mnożniki","Brak zewnętrznej ingerencji"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno to gra loteryjna, w której wybierasz od 1 do 10 liczb z zakresu 1–40. System losuje następnie serię wygrywających liczb, a ty otrzymujesz nagrodę w zależności od tego, ile twoich liczb pasuje.",
      sections:[
        { title:"Jak losowane są liczby", body:"Wygrywające liczby są wybierane przez generator liczb losowych, który gwarantuje, że każda liczba na planszy ma dokładnie takie samo prawdopodobieństwo wyboru. Proces losowania jest całkowicie niezależny od wybranych przez ciebie liczb." },
        { title:"Gwarantowana uczciwość", body:"Kasyno nie posiada informacji o tym, które liczby wybrałeś w momencie losowania. Wyniki nie mogą być dostosowywane, aby faworyzować lub szkodzić żadnemu konkretnemu graczowi." },
        { title:"Tabela nagród", body:"Mnożniki i nagrody dla każdej liczby trafień są stałe i dostępne przed postawieniem zakładu. Nie ma dynamicznych zmian nagród w zależności od salda pokoju." },
      ],
      tags:["Całkowicie losowe losowanie","Równe szanse dla wszystkich","Stałe i przejrzyste nagrody"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack to klasyczna gra karciana, w której celem jest zbliżenie się jak najbardziej do 21 bez przekroczenia tej wartości i pokonanie krupiera. Możesz dobrać kartę, zatrzymać się, podwoić lub podzielić w zależności od swojej ręki.",
      sections:[
        { title:"Jak rozdawane są karty", body:"Przed każdą rundą pełna talia jest losowo tasowana przy użyciu standardowego algorytmu tasowania. Każda rozdana karta jest dobierana z tej przetasowanej talii bez żadnej wstępnej selekcji ani manipulacji." },
        { title:"Krupier nie ma ukrytej przewagi", body:"Zasady krupiera są stałe i widoczne: krupier zawsze dobiera kartę przy 16 lub mniej i zatrzymuje się przy 17 lub więcej. Ta zasada nie zmienia się między grami i nie dostosowuje się do wyników poprzednich rund." },
        { title:"Brak oznaczonych kart", body:"Nie istnieje żaden mechanizm pozwalający kasynu wiedzieć z góry, jakie karty mają gracze. Proces rozdawania jest ślepy dla wszystkich systemów kasyna, dopóki karty nie zostaną ujawnione." },
      ],
      tags:["Losowo potasowana talia","Stałe zasady krupiera","Brak ukrytej przewagi"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"W Mander Mines pewna liczba min jest ukryta w siatce. Musisz odkrywać pola bez trafienia w żadną minę, aby gromadzić wygrane. Im dalej postępujesz, tym wyższy jest twój mnożnik.",
      sections:[
        { title:"Jak rozmieszczane są miny", body:"Pozycje wszystkich min są losowo ustalane w momencie potwierdzenia zakładu, zanim dokonasz pierwszego wyboru. Po rozmieszczeniu ich pozycje nie zmieniają się podczas rundy." },
        { title:"Kasyno nie zna twojej strategii", body:"System rozmieszczający miny działa niezależnie od twojego zachowania w grze. Pozycje min nie są dostosowywane w odpowiedzi na wybrane przez ciebie pola lub historię gier." },
        { title:"Progresywne mnożniki", body:"Mnożniki, które otrzymujesz przy odkrywaniu każdego bezpiecznego pola, są stałe i obliczane na podstawie rzeczywistych prawdopodobieństw gry. Nie ma dynamicznych korekt zmieniających twój potencjał zarobkowy podczas aktywnej rundy." },
      ],
      tags:["Pozycje ustalone na początku","Brak korekt podczas rundy","Mnożniki oparte na rzeczywistym prawdopodobieństwie"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo to gra karciana, w której odkrywana jest karta i musisz przewidzieć, czy następna będzie wyższa czy niższa. Każda poprawna przewidywanie zwiększa twój mnożnik.",
      sections:[
        { title:"Jak generowane są karty", body:"Każda odkryta karta jest losowo dobierana z przetasowanej standardowej talii. System nie posiada informacji o tym, jaka karta pojawi się następna w momencie pokazywania ci aktualnej karty." },
        { title:"Przewidywania bez oszustwa", body:"Prawdopodobieństwa, że następna karta jest wyższa lub niższa, są obliczane na podstawie kart już rozdanych. Kasyno nie manipuluje następną kartą, aby unieważnić twoje przewidywanie." },
        { title:"Regulowane ryzyko", body:"Możesz wybrać między opcjami o wyższym lub niższym ryzyku zgodnie ze swoją strategią. Powiązane mnożniki dokładnie odzwierciedlają rzeczywiste prawdopodobieństwa każdej opcji." },
      ],
      tags:["Losowo dobierane karty","Obliczanie prawdopodobieństwa w czasie rzeczywistym","Brak manipulacji wynikami"],
    },
    {
      key:"Roulette", label:"Ruletka", color:"#f43f5e", soon:false,
      how:"Mander Ruletka oferuje klasyczne doświadczenie kasyna z europejskim kołem ruletki. Obstaw liczbę, kolor, parzyste/nieparzyste lub grupę liczb i obserwuj, gdzie wyląduje kulka.",
      sections:[
        { title:"Jak ustalana jest wygrywająca liczba", body:"Każdy obrót ruletki produkuje całkowicie losową liczbę z zakresu 0–36. Proces jest natychmiastowy i odbywa się w dokładnym momencie obrotu, bez predestygnacji ani przewidywalnych cykli." },
        { title:"Europejska ruletka", body:"Mander Ruletka używa europejskiego formatu z pojedynczym zerem, co oferuje lepsze szanse dla gracza w porównaniu z wersją amerykańską. Przewaga domu jest stała i przejrzysta." },
        { title:"Każdy obrót jest niezależny", body:"Wynik jednego obrotu nie ma żadnego statystycznego związku z poprzednimi obrotami. Nie istnieją wzorce, cykle ani korekty powodujące, że pewne liczby pojawiają się częściej lub rzadziej z biegiem czasu." },
      ],
      tags:["Losowa liczba na obrót","Europejska ruletka (pojedyncze zero)","Każdy obrót jest niezależny"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Baccarat używa buta z 8 taliami losowo przetasowanymi przed każdą rundą. Karty są rozdawane zgodnie z klasycznymi zasadami Punto Banco: gracz i bank otrzymują po dwie karty, z możliwością trzeciej karty według stałych zasad. Możesz obstawiać na Gracza, Bank (z 5% prowizją od wygranych) lub Remis.",
      sections:[
        { title:"Losowość talii", body:"Każda runda Bakarata dobiera karty z buta 8 talii przetasowanego tym samym audytowanym systemem losowości, którego używamy we wszystkich naszych grach. Gdy pozostaje mniej niż 15 kart, but jest automatycznie tasowany ponownie, aby zapewnić całkowitą uczciwość w każdej ręce." },
        { title:"Zasady trzeciej karty", body:"Zasady trzeciej karty są stałe i publiczne: Gracz dobiera kartę, jeśli jego suma wynosi 0–5; Bank dobiera kartę na podstawie swojej sumy i trzeciej karty Gracza zgodnie ze standardową tabelą Punto Banco. Nie ma dyskrecjonalnych decyzji kasyna — wynik zawsze podąża za tymi samymi deterministycznymi zasadami." },
        { title:"Prowizja banku", body:"Zakład na Bank wypłaca się z 5% prowizją od zysku netto, co odzwierciedla nieznaczną przewagę statystyczną, jaką Bank posiada zgodnie z zasadami gry. Remis wypłaca 8x zakład. Wszystkie prowizje i wypłaty są obliczane automatycznie i widoczne przed postawieniem zakładu." },
      ],
      tags:["Audytowany but 8 talii","Standardowe zasady Punto Banco","5% prowizja banku"],
    },
  ],
  ru: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice — игра в кости, где вы выбираете целевое число и делаете ставку на то, окажется ли результат выше или ниже него. Диапазон — от 0 до 100, и вы можете настроить вероятность выигрыша в соответствии со своей стратегией.",
      sections:[
        { title:"Как определяется результат", body:"Каждый бросок генерирует число от 0 до 100 полностью случайным образом в тот момент, когда вы подтверждаете ставку. Ни одна внутренняя или внешняя система не может предсказать или повлиять на результат до его получения." },
        { title:"Система случайности", body:"Мы используем генераторы случайных чисел с высокой энтропией, независимые от казино. Это означает, что каждый результат статистически непредсказуем и не связан с предыдущими или будущими бросками." },
        { title:"Никакого скрытого преимущества", body:"Преимущество дома в Mander Dice фиксировано, видимо и не варьируется между раундами. Не существует механизма, корректирующего результаты в зависимости от истории ставок или текущего баланса." },
      ],
      tags:["100% случайные результаты","Фиксированное и видимое преимущество дома","Нет памяти между раундами"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"В Mander Plinko шарик падает с верхушки доски со штырьками и отскакивает случайным образом, пока не приземлится в один из нижних слотов, каждый из которых имеет свой множитель.",
      sections:[
        { title:"Как определяется путь", body:"Траектория шарика рассчитывается на основе случайного процесса принятия решений у каждого штырька. В каждой точке разветвления шарик имеет равную вероятность пойти влево или вправо, делая конечный пункт назначения непредсказуемым." },
        { title:"Физика игры", body:"Движение шарика имитирует реальную физику с чистой случайностью при каждом отскоке. Казино не контролирует, в какой слот упадёт шарик после начала падения." },
        { title:"Прозрачность множителей", body:"Множители для каждого слота фиксированы и видны до размещения ставки. Игра не корректирует ни множители, ни поведение шарика в зависимости от истории игрока." },
      ],
      tags:["Случайно сгенерированный путь","Фиксированные и видимые множители","Никакого внешнего вмешательства"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno — лотерейная игра, в которой вы выбираете от 1 до 10 чисел от 1 до 40. Затем система случайным образом вытягивает ряд выигрышных чисел, и вы получаете приз в зависимости от того, сколько ваших чисел совпало.",
      sections:[
        { title:"Как вытягиваются числа", body:"Выигрышные числа выбираются генератором случайных чисел, гарантирующим, что каждое число на поле имеет точно такую же вероятность быть выбранным. Процесс розыгрыша полностью независим от чисел, которые вы выбрали." },
        { title:"Гарантированная честность", body:"Казино не имеет информации о том, какие числа вы выбрали на момент розыгрыша. Результаты не могут быть скорректированы в пользу или против конкретного игрока." },
        { title:"Таблица призов", body:"Множители и призы для каждого количества совпадений фиксированы и доступны до размещения ставки. Нет динамических изменений призов в зависимости от баланса комнаты." },
      ],
      tags:["Полностью случайный розыгрыш","Равные шансы для всех","Фиксированные и прозрачные призы"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack — классическая карточная игра, цель которой — приблизиться как можно ближе к 21, не превысив это число, и обыграть дилера. В зависимости от руки вы можете взять карту, остановиться, удвоить ставку или разделить.",
      sections:[
        { title:"Как раздаются карты", body:"Перед каждым раундом полная колода перемешивается случайным образом с помощью стандартного алгоритма перемешивания. Каждая выданная карта извлекается из этой перемешанной колоды без какого-либо предварительного отбора или манипуляции." },
        { title:"У дилера нет скрытого преимущества", body:"Правила дилера фиксированы и видны: дилер всегда берёт карту при 16 или меньше и останавливается при 17 или больше. Это правило не меняется между играми и не корректируется в зависимости от результатов предыдущих раундов." },
        { title:"Нет меченых карт", body:"Не существует механизма, позволяющего казино заранее знать, какие карты у игроков. Процесс раздачи слеп для всех систем казино до тех пор, пока карты не будут открыты." },
      ],
      tags:["Случайно перемешанная колода","Фиксированные правила дилера","Никакого скрытого преимущества"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"В Mander Mines определённое количество мин спрятано в сетке. Вы должны открывать клетки, не задевая ни одной мины, чтобы накапливать выигрыши. Чем дальше вы продвигаетесь, тем выше ваш множитель.",
      sections:[
        { title:"Как расставляются мины", body:"Позиции всех мин определяются случайным образом в тот момент, когда вы подтверждаете ставку, до первого выбора. После расстановки их позиции не меняются в течение раунда." },
        { title:"Казино не знает вашей стратегии", body:"Система, расставляющая мины, работает независимо от вашего игрового поведения. Позиции мин не корректируются в ответ на выбранные вами клетки или историю игр." },
        { title:"Прогрессивные множители", body:"Множители, которые вы получаете при открытии каждой безопасной клетки, фиксированы и рассчитаны на основе реальных вероятностей игры. Нет динамических корректировок, изменяющих ваш потенциал заработка во время активного раунда." },
      ],
      tags:["Позиции зафиксированы в начале","Без корректировок во время раунда","Множители на основе реальных вероятностей"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo — карточная игра, в которой открывается карта и нужно предсказать, будет ли следующая выше или ниже. Каждое правильное предсказание увеличивает ваш множитель.",
      sections:[
        { title:"Как генерируются карты", body:"Каждая открытая карта случайным образом извлекается из перемешанной стандартной колоды. Система не имеет информации о том, какая карта выйдет следующей в момент показа текущей карты." },
        { title:"Предсказания без мошенничества", body:"Вероятности того, что следующая карта будет выше или ниже, рассчитываются на основе уже сыгранных карт. Казино не манипулирует следующей картой, чтобы аннулировать ваше предсказание." },
        { title:"Регулируемый риск", body:"Вы можете выбирать между опциями с более высоким или низким риском в соответствии со своей стратегией. Связанные множители точно отражают реальные вероятности каждой опции." },
      ],
      tags:["Карты извлекаются случайно","Расчёт вероятностей в реальном времени","Нет манипуляций с результатами"],
    },
    {
      key:"Roulette", label:"Рулетка", color:"#f43f5e", soon:false,
      how:"Mander Рулетка предлагает классический опыт казино с европейским колесом. Ставьте на число, цвет, чётное/нечётное или группу чисел и наблюдайте, куда упадёт шарик.",
      sections:[
        { title:"Как определяется выигрышный номер", body:"Каждое вращение рулетки производит совершенно случайное число от 0 до 36. Процесс мгновенный и происходит в точный момент вращения, без предопределения или предсказуемых циклов." },
        { title:"Европейская рулетка", body:"Mander Рулетка использует европейский формат с одним нулём, что предлагает лучшие шансы для игрока по сравнению с американской версией. Преимущество дома фиксировано и прозрачно." },
        { title:"Каждое вращение независимо", body:"Результат одного вращения не имеет статистической связи с предыдущими вращениями. Нет паттернов, циклов или корректировок, заставляющих определённые числа появляться чаще или реже со временем." },
      ],
      tags:["Случайное число за вращение","Европейская рулетка (один ноль)","Каждое вращение независимо"],
    },
    {
      key:"Baccarat", label:"Баккара", color:"#eab308", soon:false,
      how:"Mander Баккара использует башмак из 8 колод, случайно перемешанных перед каждым раундом. Карты раздаются по классическим правилам Пунто Банко: игрок и банкир получают по две карты, с возможной третьей картой по фиксированным правилам. Вы можете ставить на Игрока, Банкира (с комиссией 5% от выигрыша) или Ничью.",
      sections:[
        { title:"Случайность колоды", body:"Каждый раунд Баккары берёт карты из башмака 8 колод, перемешанного той же проверенной системой случайности, которую мы используем во всех наших играх. Когда остаётся менее 15 карт, башмак автоматически перемешивается заново для обеспечения полной честности в каждой руке." },
        { title:"Правила третьей карты", body:"Правила третьей карты фиксированы и публичны: Игрок берёт карту, если его сумма 0–5; Банкир берёт карту в зависимости от своей суммы и третьей карты Игрока согласно стандартной таблице Пунто Банко. Нет дискреционных решений казино — результат всегда следует тем же детерминированным правилам." },
        { title:"Комиссия банкира", body:"Ставка на Банкира выплачивается с комиссией 5% от чистого выигрыша, что отражает небольшое статистическое преимущество, которым обладает Банкир по правилам игры. Ничья платит 8x ставку. Все комиссии и выплаты рассчитываются автоматически и видны до ставки." },
      ],
      tags:["Проверенный башмак из 8 колод","Стандартные правила Пунто Банко","Комиссия банкира 5%"],
    },
  ],
  tr: [
    {
      key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
      how:"Mander Dice, bir hedef sayı seçtiğiniz ve sonucun bu sayının üzerinde mi yoksa altında mı kalacağına bahsettiğiniz bir zar oyunudur. Aralık 0'dan 100'e kadardır ve stratejinize göre kazanma olasılığınızı ayarlayabilirsiniz.",
      sections:[
        { title:"Sonuç nasıl belirlenir", body:"Her atış, bahsinizi onayladığınız tam anda tamamen rastgele olarak 0 ile 100 arasında bir sayı üretir. Hiçbir dahili veya harici sistem, sonucu gerçekleşmeden önce tahmin edemez veya etkileyemez." },
        { title:"Rastgelelik sistemi", body:"Kumarhaneden bağımsız, yüksek entropili rastgele sayı üreteçleri kullanıyoruz. Bu, her sonucun istatistiksel olarak öngörülemez olduğu ve önceki veya gelecekteki atışlarla ilişkili olmadığı anlamına gelir." },
        { title:"Gizli avantaj yok", body:"Mander Dice'taki ev avantajı sabit, görünür ve turlar arasında değişmez. Bahis geçmişinize veya mevcut bakiyenize göre sonuçları ayarlayan bir mekanizma yoktur." },
      ],
      tags:["100% rastgele sonuçlar","Sabit ve görünür ev avantajı","Turlar arasında bellek yok"],
    },
    {
      key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
      how:"Mander Plinko'da bir top, pim tahtasının tepesinden düşer ve her biri farklı bir çarpana sahip olan alt slotlardan birine rastgele sekerek iner.",
      sections:[
        { title:"Yol nasıl belirlenir", body:"Topun yörüngesi, her pimdeki rastgele karar sürecinden hesaplanır. Her dallanma noktasında topun sola veya sağa gitme olasılığı eşittir, bu da nihai varış noktasını tahmin edilemez kılar." },
        { title:"Oyun fiziği", body:"Topun hareketi, her sekmede saf rastgelelikle gerçek fiziği simüle eder. Kumar hanesi, top düşmeye başladıktan sonra hangi slota ineceği üzerinde hiçbir kontrole sahip değildir." },
        { title:"Çarpan şeffaflığı", body:"Her slot için çarpanlar sabittir ve bahsinizi yapmadan önce görünürdür. Oyun, ne çarpanları ne de topun davranışını geçmişinize göre ayarlamaz." },
      ],
      tags:["Rastgele oluşturulan yol","Sabit ve görünür çarpanlar","Harici müdahale yok"],
    },
    {
      key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
      how:"Mander Keno, 1'den 40'a kadar 1 ile 10 arasında sayı seçtiğiniz bir piyango oyunudur. Sistem daha sonra rastgele bir dizi kazanan sayı çeker ve eşleşen sayılarınızın sayısına göre bir ödül alırsınız.",
      sections:[
        { title:"Sayılar nasıl çekilir", body:"Kazanan sayılar, tahtadaki her sayının seçilme olasılığının tam olarak aynı olmasını garantileyen bir rastgele sayı üreteci tarafından seçilir. Çekiliş süreci, seçtiğiniz sayılardan tamamen bağımsızdır." },
        { title:"Garantili adalet", body:"Kumarhanesi, çekiliş anında hangi sayıları seçtiğiniz hakkında hiçbir bilgiye sahip değildir. Sonuçlar, belirli bir oyuncuyu lehine veya aleyhine çevirmek için ayarlanamaz." },
        { title:"Ödül tablosu", body:"Her isabet sayısı için çarpanlar ve ödüller sabittir ve bahsinizi yapmadan önce mevcuttur. Odanın bakiyesine göre dinamik ödül değişiklikleri yoktur." },
      ],
      tags:["Tamamen rastgele çekiliş","Herkes için eşit olasılıklar","Sabit ve şeffaf ödüller"],
    },
    {
      key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
      how:"Mander Blackjack, amacın kartı aşmadan 21'e mümkün olduğunca yaklaşmak ve krupiyeyi yenmek olduğu klasik kart oyunudur. Elinize göre kart çekebilir, durabilir, katabilir veya bölebilirsiniz.",
      sections:[
        { title:"Kartlar nasıl dağıtılır", body:"Her turdan önce tam deste, standart bir karıştırma algoritması kullanılarak rastgele karıştırılır. Dağıtılan her kart, önceden seçim veya manipülasyon yapılmadan bu karıştırılmış desteden çekilir." },
        { title:"Krupiyenin gizli avantajı yok", body:"Krupiye kuralları sabittir ve görünürdür: krupiye her zaman 16 veya altında kart çeker ve 17 veya üzerinde durur. Bu kural oyunlar arasında değişmez ve önceki tur sonuçlarına göre ayarlanmaz." },
        { title:"İşaretli kart yok", body:"Kumarhanenin oyuncuların hangi kartlara sahip olduğunu önceden bilmesini sağlayan bir mekanizma yoktur. Dağıtma süreci, kartlar ortaya çıkana kadar tüm kumarhane sistemleri için kördür." },
      ],
      tags:["Rastgele karıştırılmış deste","Sabit krupiye kuralları","Gizli avantaj yok"],
    },
    {
      key:"Mines", label:"Mines", color:"#22c55e", soon:false,
      how:"Mander Mines'ta bir ızgarada bir dizi mayın gizlidir. Kazanç biriktirmek için herhangi bir mayına çarpmadan kareleri açmalısınız. Ne kadar ilerlerséniz, çarpanınız o kadar yüksek olur.",
      sections:[
        { title:"Mayınlar nasıl yerleştirilir", body:"Tüm mayınların konumları, ilk seçiminizi yapmadan önce bahsinizi onayladığınız anda rastgele belirlenir. Yerleştirildikten sonra konumları tur boyunca değişmez." },
        { title:"Kumarhane stratejinizi bilmiyor", body:"Mayınları yerleştiren sistem, oyun davranışınızdan bağımsız olarak çalışır. Mayın konumları, seçtiğiniz karelere veya oyun geçmişinize yanıt olarak ayarlanmaz." },
        { title:"Aşamalı çarpanlar", body:"Her güvenli kareyi açtığınızda aldığınız çarpanlar sabittir ve oyunun gerçek olasılıklarına göre hesaplanır. Aktif bir tur sırasında kazanç potansiyelinizi değiştiren dinamik ayarlamalar yoktur." },
      ],
      tags:["Konumlar başlangıçta belirlenir","Tur sırasında ayarlama yok","Gerçek olasılıklara dayalı çarpanlar"],
    },
    {
      key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
      how:"Mander Hilo, bir kartın açıldığı ve bir sonrakinin daha yüksek mi yoksa daha düşük mü olacağını tahmin etmeniz gereken bir kart oyunudur. Her doğru tahmin çarpanınızı artırır.",
      sections:[
        { title:"Kartlar nasıl oluşturulur", body:"Açılan her kart, karıştırılmış standart bir desteden rastgele çekilir. Sistem, mevcut kartı size gösterdiği anda bir sonraki kartın ne olacağı hakkında hiçbir bilgiye sahip değildir." },
        { title:"Hile olmadan tahminler", body:"Bir sonraki kartın daha yüksek veya daha düşük olma olasılıkları, halihazırda dağıtılmış kartlara göre hesaplanır. Kumarhane, tahmininizi geçersiz kılmak için bir sonraki kartı manipüle etmez." },
        { title:"Ayarlanabilir risk", body:"Stratejinize göre daha yüksek veya daha düşük risk seçenekleri arasından seçim yapabilirsiniz. İlgili çarpanlar, her seçeneğin gerçek olasılıklarını doğru şekilde yansıtır." },
      ],
      tags:["Rastgele çekilen kartlar","Gerçek zamanlı olasılık hesabı","Sonuç manipülasyonu yok"],
    },
    {
      key:"Roulette", label:"Rulet", color:"#f43f5e", soon:false,
      how:"Mander Rulet, Avrupa rulet tekerleğiyle klasik kumarhane deneyimini sunar. Bir sayıya, renge, tek/çift veya sayı grubuna bahis yapın ve topun nereye düştüğünü izleyin.",
      sections:[
        { title:"Kazanan sayı nasıl belirlenir", body:"Ruletin her dönüşü, 0 ile 36 arasında tamamen rastgele bir sayı üretir. Süreç anlıktır ve dönüşün tam anında gerçekleşir; önceden belirlenmiş veya öngörülebilir döngüler yoktur." },
        { title:"Avrupa ruleti", body:"Mander Rulet, Amerikan versiyonuna kıyasla oyuncu için daha iyi olasılıklar sunan tek sıfırlı Avrupa formatını kullanır. Ev avantajı sabittir ve şeffaftır." },
        { title:"Her dönüş bağımsızdır", body:"Bir dönüşün sonucu, önceki dönüşlerle istatistiksel ilişkisi yoktur. Belirli sayıların zaman içinde daha sık veya daha az sıklıkta görünmesine neden olan kalıplar, döngüler veya ayarlamalar yoktur." },
      ],
      tags:["Dönüş başına rastgele sayı","Avrupa ruleti (tek sıfır)","Her dönüş bağımsızdır"],
    },
    {
      key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
      how:"Mander Bakara, her turdan önce rastgele karıştırılmış 8 desteli bir kundak kullanır. Kartlar klasik Punto Banco kurallarına göre dağıtılır: oyuncu ve bankacı her biri iki kart alır ve sabit kurallara göre olası bir üçüncü kart eklenir. Oyuncuya, Bankacıya (kazançların %5 komisyonuyla) veya Berabere bahis yapabilirsiniz.",
      sections:[
        { title:"Deste rastgeleliği", body:"Her Bakara turu, kartları tüm oyunlarımızda kullandığımız aynı denetlenmiş rastgelelik sistemiyle karıştırılmış 8 desteli bir kundaktan çeker. 15'ten az kart kaldığında, kundak her elde tam adalet sağlamak için otomatik olarak yeniden karıştırılır." },
        { title:"Üçüncü kart kuralları", body:"Üçüncü kart kuralları sabittir ve kamuya açıktır: Oyuncu toplamı 0–5 ise kart çeker; Bankacı, standart Punto Banco tablosunu takip ederek toplamına ve Oyuncunun üçüncü kartına göre kart çeker. Kumarhanenin takdir kararları yoktur — sonuç her zaman aynı deterministik kuralları izler." },
        { title:"Bankacı komisyonu", body:"Bankacı bahsi, oyunun kurallarına göre Bankacının sahip olduğu hafif istatistiksel avantajı yansıtan net kazançlar üzerinden %5 komisyonla ödeme yapar. Berabere 8x bahsi öder. Tüm komisyonlar ve ödemeler otomatik olarak hesaplanır ve bahis yapmadan önce görünürdür." },
      ],
      tags:["8 desteli denetlenmiş kundak","Standart Punto Banco kuralları","Bankacı %5 komisyonu"],
    },
  ],
};

export function getFairnessGames(lang: string): FGame[] {
  return DATA[lang] ?? DATA["en"];
}

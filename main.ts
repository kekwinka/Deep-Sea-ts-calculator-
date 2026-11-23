import "./style.css";

type OperationType = "add" | "subtract" | "multiply" | "divide" | "power" | "sqrt" | "clear";
type BinaryOperation = Exclude<OperationType, "sqrt" | "clear">;
type Operation = (left: number, right?: number) => number;
type Operand = { kind: "number"; value: number; display: string; rooted: boolean };
type OperatorToken = { kind: "operator"; op: BinaryOperation };
type ExpressionToken = Operand | OperatorToken;

interface CalculatorState {
  tokens: ExpressionToken[];
  current: string | null;
  sqrtMode: boolean;
  currentRooted: boolean;
  error: string | null;
  animating: boolean;
  resultVisible: boolean;
}

const normalize = (value: number): number =>
  Number.isFinite(value) ? parseFloat(value.toFixed(10)) : value;

const createOperation = (type: string): Operation => {
  const operations: Record<string, Operation> = {
    add: (a, b = 0) => normalize(a + b),
    subtract: (a, b = 0) => normalize(a - b),
    multiply: (a, b = 0) => normalize(a * b),
    divide: (a, b = 1) => normalize(a / b),
    power: (a, b = 1) => normalize(a ** b),
    sqrt: (a) => normalize(Math.sqrt(a))
  };
  return operations[type] ?? (() => Number.NaN);
};

const initialState = (): CalculatorState => ({
  tokens: [], current: "0", sqrtMode: false, currentRooted: false, error: null,
  animating: false, resultVisible: false
});

let state: CalculatorState = initialState();
const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент: ${selector}`);
  return element;
};

const screen = $(".screen");
const readout = $("#readout");
const equation = $("#equation");
const hint = $("#hint");
const creature = $("#seaCreature");
const resultOperands = $(".result-operands");
const pearl = $("#pearl");
const pearlValue = $("#pearlValue");
const sceneError = $("#sceneError");
const bubbleField = $("#bubbleField");
const equalsButton = $('.key[data-action="equals"]') as HTMLButtonElement;
const sqrtButton = $('.key[data-op="sqrt"]') as HTMLButtonElement;
const planktonField = $("#planktonField");

const symbols: Record<BinaryOperation, string> = {
  add: "+", subtract: "−", multiply: "×", divide: "÷", power: "^"
};
const operatorArt: Record<BinaryOperation, string> = {
  add: "add", subtract: "subtract", multiply: "multiply",
  divide: "divide", power: "power"
};

const formatted = (value: number): string => {
  const clean = normalize(value);
  return Object.is(clean, -0) ? "0" : String(clean);
};

const operandFrom = (raw: string, sqrtMode: boolean): Operand | null => {
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric) || (sqrtMode && numeric < 0)) return null;
  const value = sqrtMode ? createOperation("sqrt")(numeric) : normalize(numeric);
  return { kind: "number", value, display: sqrtMode ? `√${raw}` : raw, rooted: sqrtMode };
};

const isOperand = (token: ExpressionToken): token is Operand => token.kind === "number";
const isOperator = (token: ExpressionToken): token is OperatorToken => token.kind === "operator";

const appendOperand = (tokens: ExpressionToken[], operand: Operand): ExpressionToken[] =>
  [...tokens, operand];

const replaceLastOperator = (tokens: ExpressionToken[], op: BinaryOperation): ExpressionToken[] =>
  tokens.length > 0 && isOperator(tokens[tokens.length - 1])
    ? [...tokens.slice(0, -1), { kind: "operator", op }]
    : [...tokens, { kind: "operator", op }];

const reduceBy = (
  parts: ExpressionToken[],
  accepted: BinaryOperation[],
  rightAssociative = false
): ExpressionToken[] => {
  const index = rightAssociative
    ? [...parts].map((token, i) => isOperator(token) && accepted.includes(token.op) ? i : -1).filter(i => i >= 0).at(-1) ?? -1
    : parts.findIndex(token => isOperator(token) && accepted.includes(token.op));
  if (index < 0) return parts;
  const left = parts[index - 1];
  const operator = parts[index];
  const right = parts[index + 1];
  if (!left || !right || !isOperand(left) || !isOperator(operator) || !isOperand(right)) return parts;
  const value = createOperation(operator.op)(left.value, right.value);
  const combined: Operand = {
    kind: "number", value, display: formatted(value), rooted: false
  };
  const next = [...parts.slice(0, index - 1), combined, ...parts.slice(index + 2)];
  return reduceBy(next, accepted, rightAssociative);
};

const evaluateExpression = (parts: ExpressionToken[]): number => {
  const powers = reduceBy(parts, ["power"], true);
  const products = reduceBy(powers, ["multiply", "divide"]);
  const sums = reduceBy(products, ["add", "subtract"]);
  const result = sums[0];
  return result && isOperand(result) && sums.length === 1 ? result.value : Number.NaN;
};

const validateExpression = (tokens: ExpressionToken[], current: string | null, currentRooted: boolean): string | null => {
  if (tokens.length === 0) {
    if (current === null) return "Некорректный ввод";
    const single = operandFrom(current, currentRooted);
    return single && Number.isFinite(single.value) ? null : "Некорректный ввод";
  }
  if (current === null) return "Некорректный ввод";
  if (currentRooted && Number(current) < 0) return "Некорректный ввод";
  const complete = operandFrom(current, currentRooted);
  if (!complete) return "Некорректный ввод";
  const parts = [...tokens, complete];
  if (parts.length < 3 || parts.length % 2 === 0 || parts.some((token, index) =>
    index % 2 === 0 ? !isOperand(token) : !isOperator(token))) return "Некорректный ввод";
  for (let index = 1; index < parts.length; index += 2) {
    const op = parts[index];
    const right = parts[index + 1];
    if (isOperator(op) && op.op === "divide" && isOperand(right) && right.value === 0) {
      return "Некорректный ввод";
    }
  }
  const answer = evaluateExpression(parts);
  return Number.isFinite(answer) ? null : "Некорректный ввод";
};

const digitPaths: Record<string, string> = {
  "0": "M37 8 C17 8 13 25 17 43 C20 62 53 65 61 46 C69 27 58 8 37 8Z",
  "1": "M24 23 C33 15 42 9 47 8 C45 28 44 48 46 63",
  "2": "M17 23 C21 5 54 4 60 21 C67 39 27 45 17 62 C31 61 49 62 64 59",
  "3": "M18 15 C34 5 60 10 60 25 C60 35 48 39 37 39 C51 37 65 44 61 55 C57 70 31 68 17 57",
  "4": "M51 64 C51 44 52 25 52 8 C43 24 30 39 15 46 C29 46 48 46 65 45",
  "5": "M59 10 C45 9 30 10 20 11 L18 34 C29 28 51 29 59 41 C71 60 48 71 27 62",
  "6": "M57 11 C40 7 22 20 18 39 C13 58 28 68 44 64 C62 60 65 39 49 34 C37 30 24 37 18 47",
  "7": "M15 12 C31 11 49 10 64 12 C52 29 42 45 31 64",
  "8": "M38 37 C13 34 14 8 38 8 C62 8 63 34 38 37 C9 40 12 67 39 66 C66 65 66 39 38 37Z",
  "9": "M57 36 C52 49 30 49 20 38 C7 23 20 7 39 9 C60 10 64 29 59 48 C56 57 50 62 42 65"
};

const digitFins: Record<string, string> = {
  "0": "M18 28 L5 19 L8 39Z M51 12 Q63 2 69 11",
  "1": "M43 19 L29 7 L37 29Z M47 50 L60 62 L48 60",
  "2": "M19 22 L6 13 L10 31Z M43 61 L56 70 L56 57",
  "3": "M49 13 L64 5 L57 22Z M49 56 L65 67 L56 48",
  "4": "M24 39 L8 30 L15 49Z M50 17 L65 7 L57 26",
  "5": "M23 12 L9 4 L13 23Z M47 60 L63 69 L56 50",
  "6": "M20 43 L5 34 L12 52Z M46 60 L61 69 L54 48",
  "7": "M49 12 L65 4 L58 23Z M35 48 L20 59 L37 57",
  "8": "M21 19 L7 8 L12 29Z M54 52 L69 61 L58 40",
  "9": "M50 13 L66 4 L58 24Z M36 57 L21 69 L40 64"
};


let fishSvgCounter = 0;

function fishDigitSvg(digit: string, index = 0): string {
  const id = `fish-${digit}-${index}-${fishSvgCounter++}`;
  const path = digitPaths[digit] ?? digitPaths["0"];
  const fins = digitFins[digit] ?? "";
  return `<svg class="fish-number" viewBox="0 0 76 76" role="img" aria-label="Цифра ${digit}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e1fff6"/><stop offset=".34" stop-color="#8df0df"/><stop offset=".72" stop-color="#63bcd7"/><stop offset="1" stop-color="#a9b9fa"/></linearGradient>
      <linearGradient id="${id}-edge"><stop stop-color="#f3ffff"/><stop offset="1" stop-color="#7de4ed"/></linearGradient>
      <filter id="${id}-glow"><feGaussianBlur stdDeviation="2.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="${path}" fill="none" stroke="url(#${id})" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" filter="url(#${id}-glow)"/>
    <path d="${path}" fill="none" stroke="rgba(255,255,255,.56)" stroke-width="2.1" stroke-linecap="round" stroke-dasharray="2 7"/>
    <path d="${fins}" fill="#8beee7" stroke="#d9fff9" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="0" cy="0" r="0" fill="none"/>
    <circle cx="58" cy="18" r="1.7" fill="#fff" opacity=".9"/>
    <path d="M52 20 Q58 25 63 21" fill="none" stroke="#eaffff" stroke-width="1" opacity=".8"/>
  </svg>`;
}

const opSvgs: Record<string, string> = {
  clear: `<svg viewBox="0 0 180 140" role="img" aria-label="Водоворот">
    <defs>
      <radialGradient id="vortex-core"><stop stop-color="#f4ffff"/><stop offset=".18" stop-color="#7df4ed"/><stop offset=".58" stop-color="#238cb7"/><stop offset="1" stop-color="#123c70"/></radialGradient>
      <linearGradient id="vortex-flow" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#efffff"/><stop offset=".35" stop-color="#65e6df"/><stop offset="1" stop-color="#438cc9"/></linearGradient>
      <filter id="vortex-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="M22 62C22 20 74 4 117 24C158 43 164 94 129 119C91 145 34 123 36 81C38 49 78 31 107 48C132 63 125 94 102 101C82 107 66 91 75 75C81 64 96 63 103 72" fill="none" stroke="#164f7b" stroke-width="18" opacity=".35"/>
    <path d="M22 62C22 20 74 4 117 24C158 43 164 94 129 119C91 145 34 123 36 81C38 49 78 31 107 48C132 63 125 94 102 101C82 107 66 91 75 75C81 64 96 63 103 72" fill="none" stroke="url(#vortex-flow)" stroke-width="10" stroke-linecap="round" filter="url(#vortex-glow)"/>
    <path d="M31 56C38 27 77 17 107 31M42 102C57 127 99 128 121 108M58 70C67 48 99 42 116 58" fill="none" stroke="#eaffff" stroke-width="2.3" stroke-linecap="round" opacity=".8"/>
    <path d="M103 72L116 67L111 83" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="#eaffff"><circle cx="21" cy="39" r="3"/><circle cx="145" cy="37" r="2.4"/><circle cx="151" cy="99" r="3"/><circle cx="48" cy="119" r="2"/></g>
  </svg>`,
  backspace: `<svg viewBox="0 0 72 72"><path d="M27 15H59Q64 15 64 20V52Q64 57 59 57H27L8 36Z" fill="rgba(129,230,235,.18)" stroke="#b9fff6" stroke-width="2.2" stroke-linejoin="round"/><path d="M38 27L53 45M53 27L38 45" stroke="#e7ffff" stroke-width="3" stroke-linecap="round"/></svg>`,
  sqrt: `<svg viewBox="0 0 180 140" role="img" aria-label="Наутилус">
    <defs>
      <radialGradient id="nautilus-shell" cx="35%" cy="28%"><stop stop-color="#fff8ed"/><stop offset=".28" stop-color="#f1c8e8"/><stop offset=".62" stop-color="#8bd9df"/><stop offset="1" stop-color="#367fa8"/></radialGradient>
      <linearGradient id="nautilus-rim"><stop stop-color="#fff"/><stop offset=".45" stop-color="#d5fff6"/><stop offset="1" stop-color="#77c9df"/></linearGradient>
      <filter id="nautilus-glow"><feGaussianBlur stdDeviation="3" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="M21 108C42 120 62 117 76 104C90 91 82 79 68 82C55 85 57 99 69 99C82 98 94 84 88 68C82 51 57 49 47 66C34 89 55 112 83 111C119 110 144 78 133 48C122 17 83 12 58 30" fill="none" stroke="#235d83" stroke-width="21" stroke-linecap="round" opacity=".5"/>
    <path d="M21 108C42 120 62 117 76 104C90 91 82 79 68 82C55 85 57 99 69 99C82 98 94 84 88 68C82 51 57 49 47 66C34 89 55 112 83 111C119 110 144 78 133 48C122 17 83 12 58 30" fill="none" stroke="url(#nautilus-shell)" stroke-width="16" stroke-linecap="round" filter="url(#nautilus-glow)"/>
    <path d="M21 108C42 120 62 117 76 104C90 91 82 79 68 82C55 85 57 99 69 99C82 98 94 84 88 68C82 51 57 49 47 66C34 89 55 112 83 111C119 110 144 78 133 48C122 17 83 12 58 30" fill="none" stroke="url(#nautilus-rim)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M58 30Q77 5 111 17Q145 29 148 57Q149 78 132 94" fill="none" stroke="#fff3f7" stroke-width="3" opacity=".8"/>
    <path d="M23 108L8 124L42 117Z" fill="#8bd8df" stroke="#f1ffff" stroke-width="1.4"/>
    <g fill="#fff"><circle cx="83" cy="27" r="2.4"/><circle cx="117" cy="38" r="1.8"/><circle cx="130" cy="65" r="1.6"/><circle cx="53" cy="76" r="1.5"/></g>
  </svg>`,
  divide: `<svg viewBox="0 0 180 140" role="img" aria-label="Морской конёк">
    <defs><linearGradient id="seahorse-body" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#447bc0"/><stop offset=".38" stop-color="#8fe7dc"/><stop offset=".72" stop-color="#f3c2a7"/><stop offset="1" stop-color="#fff0d4"/></linearGradient><filter id="seahorse-glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d="M31 119C50 111 57 95 72 81C88 66 106 56 117 39C127 24 119 12 105 15C94 17 92 29 101 34C112 40 130 29 135 17" fill="none" stroke="#1b527b" stroke-width="24" stroke-linecap="round" opacity=".42"/>
    <path d="M31 119C50 111 57 95 72 81C88 66 106 56 117 39C127 24 119 12 105 15C94 17 92 29 101 34C112 40 130 29 135 17" fill="none" stroke="url(#seahorse-body)" stroke-width="17" stroke-linecap="round" filter="url(#seahorse-glow)"/>
    <path d="M66 87Q46 76 38 91Q51 104 64 100M82 70Q69 53 57 62Q65 78 78 81" fill="#73d9d9" stroke="#eaffff" stroke-width="1.5"/>
    <path d="M104 47Q88 42 83 54Q94 62 109 57" fill="#a6e7dc" stroke="#f1ffff" stroke-width="1.5"/>
    <path d="M103 17Q91 2 103 2Q111 5 112 13Q121 0 127 8Q129 14 119 20" fill="#e7b4a6" stroke="#fff1dd" stroke-width="1.5"/>
    <path d="M32 118Q13 119 15 132Q31 135 41 122" fill="none" stroke="#f1d3b7" stroke-width="5" stroke-linecap="round"/>
    <circle cx="111" cy="25" r="2.8" fill="#0b3659" stroke="#fff" stroke-width="1.2"/>
    <path d="M115 31Q125 34 130 29" fill="none" stroke="#fff" stroke-width="1.2"/>
    <g fill="#f4ffff" opacity=".8"><circle cx="58" cy="97" r="1.6"/><circle cx="76" cy="76" r="1.4"/><circle cx="94" cy="56" r="1.4"/></g>
  </svg>`,
  multiply: `<svg viewBox="0 0 180 140" role="img" aria-label="Морская звезда">
    <defs><radialGradient id="star-orange"><stop stop-color="#ffe9ad"/><stop offset=".38" stop-color="#ffb35f"/><stop offset=".72" stop-color="#ed713f"/><stop offset="1" stop-color="#a94743"/></radialGradient><filter id="star-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g transform="translate(90 70) rotate(45)">
      <path d="M0-62C12-50 14-34 18-20C28-30 42-40 58-38C60-21 48-9 30 0C48 8 60 20 58 38C39 42 25 30 16 18C13 38 8 53 0 62C-12 51-15 34-18 19C-30 32-43 42-59 37C-60 20-48 7-30 0C-48-9-60-22-57-39C-38-40-24-29-16-18C-13-38-8-53 0-62Z" fill="#743c3d" opacity=".5" transform="translate(0 5)"/>
      <path d="M0-62C12-50 14-34 18-20C28-30 42-40 58-38C60-21 48-9 30 0C48 8 60 20 58 38C39 42 25 30 16 18C13 38 8 53 0 62C-12 51-15 34-18 19C-30 32-43 42-59 37C-60 20-48 7-30 0C-48-9-60-22-57-39C-38-40-24-29-16-18C-13-38-8-53 0-62Z" fill="url(#star-orange)" stroke="#ffe4ae" stroke-width="2" filter="url(#star-glow)"/>
      <path d="M0-49Q7-25 0-7M43-29Q20-17 7-3M44 28Q21 17 7 5M0 49Q-6 24-2 8M-43 28Q-21 17-7 4M-44-29Q-20-17-7-4" fill="none" stroke="#fff1c9" stroke-width="2.2" opacity=".7"/>
      <g fill="#fff2bd"><circle cx="0" cy="-39" r="2.2"/><circle cx="34" cy="-24" r="2"/><circle cx="38" cy="24" r="2.4"/><circle cx="0" cy="40" r="2"/><circle cx="-37" cy="22" r="2.2"/><circle cx="-38" cy="-25" r="2"/></g>
      <g fill="#b84e42"><circle cx="13" cy="-15" r="2"/><circle cx="-14" cy="15" r="2.2"/><circle cx="17" cy="13" r="1.6"/><circle cx="-17" cy="-13" r="1.8"/></g>
      <circle r="13" fill="#ffce80" stroke="#fff1c9" stroke-width="2"/><circle r="5" fill="#fff8dc"/>
    </g>
  </svg>`,
  subtract: `<svg viewBox="0 0 180 140" role="img" aria-label="Спинной плавник акулы">
    <defs><linearGradient id="shark-fin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#efffff"/><stop offset=".22" stop-color="#8abed0"/><stop offset=".62" stop-color="#356b91"/><stop offset="1" stop-color="#142e50"/></linearGradient><filter id="shark-glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d="M12 96Q49 83 85 88Q124 92 168 96" fill="none" stroke="#4ebdd1" stroke-width="5" opacity=".6"/>
    <path d="M18 91Q47 83 67 57Q91 25 112 8Q117 47 137 66Q151 80 166 91Q112 106 66 101Q35 99 18 91Z" fill="url(#shark-fin)" stroke="#d9f8ff" stroke-width="2" filter="url(#shark-glow)"/>
    <path d="M112 10Q109 49 137 67Q122 59 105 55Q91 49 79 64" fill="none" stroke="#f1ffff" stroke-width="2.3" opacity=".72"/>
    <path d="M47 91Q84 83 111 91M67 78L91 64M80 88L103 73M98 92L120 80" fill="none" stroke="#c3e9f1" stroke-width="1.5" opacity=".6"/>
    <path d="M10 91L1 80M10 93L0 101M169 91L178 80M168 94L180 103" stroke="#cfffff" stroke-width="2.5" stroke-linecap="round"/>
    <g fill="#eaffff"><circle cx="20" cy="72" r="2.2"/><circle cx="31" cy="62" r="1.4"/><circle cx="155" cy="68" r="2"/><circle cx="164" cy="77" r="1.3"/></g>
  </svg>`,
  add: `<svg viewBox="0 0 180 140" role="img" aria-label="Две креветки образуют плюс">
    <defs><linearGradient id="shrimp-shell" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0cf"/><stop offset=".3" stop-color="#ffbd83"/><stop offset=".7" stop-color="#ed7d70"/><stop offset="1" stop-color="#a64f70"/></linearGradient><filter id="shrimp-glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g transform="translate(90 70)">
      <g transform="rotate(-90)">
        <path d="M-4 0Q-18-13-16-34Q-12-51 0-59Q12-51 16-34Q18-13 4 0Q15 13 10 28Q5 42 0 51Q-5 42-10 28Q-15 13-4 0Z" fill="url(#shrimp-shell)" stroke="#ffe8d2" stroke-width="2" filter="url(#shrimp-glow)"/>
        <path d="M-12-39Q0-30 12-39M-15-24Q0-15 15-24M-12-8Q0 1 12-8M-8 12Q0 20 8 12" fill="none" stroke="#fff0d7" stroke-width="2.4"/>
        <path d="M-6-53Q-18-67-26-64M6-53Q18-68 27-64" fill="none" stroke="#fff2df" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M-8 20L-20 29L-8 31M8 20L20 29L8 31" fill="#f28c83" stroke="#ffe4cb" stroke-width="1.2"/>
        <circle cx="7" cy="-48" r="2.7" fill="#173d5a" stroke="#fff" stroke-width="1"/>
      </g>
      <g transform="rotate(0)">
        <path d="M-4 0Q-18-13-16-34Q-12-51 0-59Q12-51 16-34Q18-13 4 0Q15 13 10 28Q5 42 0 51Q-5 42-10 28Q-15 13-4 0Z" fill="url(#shrimp-shell)" stroke="#ffe8d2" stroke-width="2" filter="url(#shrimp-glow)"/>
        <path d="M-12-39Q0-30 12-39M-15-24Q0-15 15-24M-12-8Q0 1 12-8M-8 12Q0 20 8 12" fill="none" stroke="#fff0d7" stroke-width="2.4"/>
        <path d="M-6-53Q-18-67-26-64M6-53Q18-68 27-64" fill="none" stroke="#fff2df" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M-8 20L-20 29L-8 31M8 20L20 29L8 31" fill="#f28c83" stroke="#ffe4cb" stroke-width="1.2"/>
        <circle cx="7" cy="-48" r="2.7" fill="#173d5a" stroke="#fff" stroke-width="1"/>
      </g>
      <circle r="8" fill="#fff6dc" opacity=".88"/><circle r="16" fill="none" stroke="#fff1d7" stroke-width="1.5" opacity=".8"/>
    </g>
  </svg>`,
  power: `<svg viewBox="0 0 180 140" role="img" aria-label="Стая рыб в форме шеврона">
    <defs><linearGradient id="school-fish" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff9c9"/><stop offset=".45" stop-color="#91fff0"/><stop offset="1" stop-color="#59a9e5"/></linearGradient><filter id="school-glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g filter="url(#school-glow)" stroke="#eaffff" stroke-width="1">
      <g fill="url(#school-fish)">
        <path d="M14 111Q25 100 39 111Q25 122 14 111L6 103L7 119Z"/>
        <path d="M43 73Q55 61 69 73Q55 85 43 73L35 65L36 81Z"/>
        <path d="M78 27Q91 14 105 27Q91 40 78 27L70 19L71 35Z"/>
        <path d="M111 73Q125 61 139 73Q125 85 111 73L103 65L104 81Z"/>
        <path d="M141 111Q154 100 168 111Q154 122 141 111L133 103L134 119Z"/>
      </g>
      <g fill="#163e60" stroke="#fff"><circle cx="30" cy="110" r="1.5"/><circle cx="59" cy="72" r="1.5"/><circle cx="94" cy="26" r="1.5"/><circle cx="127" cy="72" r="1.5"/><circle cx="157" cy="110" r="1.5"/></g>
    </g>
    <path d="M13 122Q90 5 168 122" fill="none" stroke="#bffff5" stroke-width="1.5" stroke-dasharray="2 7" opacity=".55"/>
  </svg>`
};


function renderFishValue(value: string): string {
  return value.split("").map((char, index) => {
    if (char === "-") return `<span class="fish-minus" aria-label="минус">−</span>`;
    if (char === ".") return `<span class="fish-decimal" aria-label="десятичная точка"></span>`;
    return fishDigitSvg(char, index);
  }).join("");
}

function renderOperand(operand: Operand): string {
  const raw = operand.rooted ? operand.display.slice(1) : formatted(operand.value);
  return `${operand.rooted ? `<span class="root-mark">${opSvgs.sqrt}</span>` : ""}${renderFishValue(raw)}`;
}

function renderExpression(): string {
  const parts: ExpressionToken[] = [...state.tokens];
  const currentOperand = state.current === null ? null : (operandFrom(state.current, state.currentRooted) ??
    (state.currentRooted ? { kind: "number" as const, value: Number(state.current), display: `√${state.current}`, rooted: true } : null));
  const tokens = currentOperand ? [...parts, currentOperand] : parts;
  return tokens.map((token, index) => {
    if (isOperand(token)) {
      return `<span class="expression-number" aria-label="${token.display}">${renderOperand(token)}</span>`;
    }
    return `<span class="expression-operation" aria-label="${symbols[token.op]}">${opSvgs[operatorArt[token.op]]}</span>`;
  }).join("");
}

function currentExpressionText(): string {
  return [...state.tokens, ...(state.current === null ? [] : [state.current])]
    .map((part) => typeof part === "string" ? part : isOperand(part) ? part.display : symbols[part.op])
    .join(" ");
}

function render(): void {
  readout.innerHTML = state.tokens.length || state.current !== null
    ? renderExpression()
    : "";
  readout.classList.toggle("is-initial", state.tokens.length === 0 && state.current === "0" && !state.resultVisible);
  readout.setAttribute("aria-label", currentExpressionText() || "Пустое выражение");
  equation.textContent = state.sqrtMode ? "Режим квадратного корня включён" : "";
  sqrtButton.classList.toggle("mode-active", state.sqrtMode);
  sqrtButton.setAttribute("aria-pressed", String(state.sqrtMode));
  const invalid = validateExpression(state.tokens, state.current, state.currentRooted);
  const blocked = state.animating || invalid !== null;
  equalsButton.classList.toggle("is-disabled", blocked);
  equalsButton.setAttribute("aria-disabled", String(blocked));
  screen.classList.toggle("error", Boolean(state.error));
  if (state.error) sceneError.textContent = state.error;
  else sceneError.textContent = "";
}

function setState(next: CalculatorState): void {
  state = next;
  render();
}

function cleanScene(): void {
  resultOperands.classList.remove("visible");
  screen.classList.remove("animating", "result", "gather", "flash-phase", "error",
    "anim-add", "anim-subtract", "anim-multiply", "anim-divide", "anim-power", "anim-sqrt", "anim-clear");
  $(".ocean").classList.remove("gather");
  pearl.classList.remove("negative", "fractional");
  creature.innerHTML = "";
  pearlValue.innerHTML = "";
  sceneError.textContent = "";
}

let invalidMessageTimer: number | undefined;

function showInvalid(): void {
  if (invalidMessageTimer !== undefined) window.clearTimeout(invalidMessageTimer);
  screen.classList.remove("shake", "error");
  void screen.offsetWidth;
  screen.classList.add("shake", "error");
  sceneError.textContent = "Некорректный ввод";
  invalidMessageTimer = window.setTimeout(() => {
    screen.classList.remove("shake", "error");
    sceneError.textContent = "";
    invalidMessageTimer = undefined;
  }, 2000);
}

function sparkFrom(button: HTMLButtonElement): void {
  const source = button.getBoundingClientRect();
  const target = readout.getBoundingClientRect();
  const spark = document.createElement("span");
  spark.className = "click-spark";
  spark.style.left = `${source.left + source.width / 2}px`;
  spark.style.top = `${source.top + source.height / 2}px`;
  spark.style.setProperty("--spark-x", `${target.left + target.width / 2 - source.left - source.width / 2}px`);
  spark.style.setProperty("--spark-y", `${target.top + target.height / 2 - source.top - source.height / 2}px`);
  document.body.append(spark);
  window.setTimeout(() => spark.remove(), 850);
}

function inputDigit(digit: string, source?: HTMLButtonElement): void {
  if (state.animating) return;
  cleanScene();
  resultOperands.classList.remove("visible");
  if (source) sparkFrom(source);
  const current = state.current;
  const startsNumber = current === null || current === "0";
  const nextCurrent = startsNumber ? digit : current === "-0" ? `-${digit}` : current + digit;
  setState({ ...state, current: nextCurrent, currentRooted: startsNumber ? state.sqrtMode : state.currentRooted, error: null, resultVisible: false });
  const last = state.tokens[state.tokens.length - 1];
  if (last && isOperator(last) && last.op === "divide" && Number(nextCurrent) === 0) showInvalid();
  if (state.currentRooted && Number(nextCurrent) < 0) showInvalid();
  hint.textContent = "Продолжай — океан слушает";
}

function commitCurrent(): Operand | null {
  if (state.current === null) return null;
  return operandFrom(state.current, state.currentRooted);
}

function chooseOperation(type: BinaryOperation): void {
  if (state.animating) return;
  cleanScene();
  resultOperands.classList.remove("visible");
  const last = state.tokens[state.tokens.length - 1];
  if (state.current === null && last && isOperator(last)) {
    setState({ ...state, tokens: replaceLastOperator(state.tokens, type), currentRooted: false, error: null });
    return;
  }
  const operand = commitCurrent();
  if (!operand) {
    showInvalid();
    return;
  }
  const tokens = replaceLastOperator(appendOperand(state.tokens, operand), type);
  setState({ ...state, tokens, current: null, currentRooted: false, error: null, resultVisible: false });
  hint.textContent = "Выбери следующее число";
}

let resultPair: { left: Operand; right: Operand; op: BinaryOperation } | null = null;
let resultExpression: ExpressionToken[] = [];

function calculate(): void {
  if (state.animating) return;
  const invalid = validateExpression(state.tokens, state.current, state.currentRooted);
  if (invalid) {
    showInvalid();
    return;
  }
  const current = commitCurrent();
  if (!current) {
    showInvalid();
    return;
  }
  const parts = [...state.tokens, current];
  const answer = evaluateExpression(parts);
  resultExpression = parts;
  const firstOperatorIndex = parts.findIndex(isOperator);
  const left = parts[firstOperatorIndex - 1];
  const op = parts[firstOperatorIndex];
  const right = parts[firstOperatorIndex + 1];
  resultPair = left && isOperand(left) && op && isOperator(op) && right && isOperand(right)
    ? { left, right, op: op.op } : null;

  const reactionType: OperationType = resultPair?.op ?? (state.currentRooted ? "sqrt" : "add");
  setState({ ...state, animating: true, error: null, resultVisible: false });
  startReaction(reactionType, answer);
}

function renderResultExpression(parts: ExpressionToken[]): string {
  return parts.map((token, index) => {
    if (isOperand(token)) {
      return `<div class="orb result-orb result-value" data-value-index="${Math.floor(index / 2) + 1}"><span class="orb-number">${renderOperand(token)}</span></div>`;
    }
    return `<div class="result-operator" aria-label="${symbols[token.op]}">${opSvgs[operatorArt[token.op]]}</div>`;
  }).join("");
}

function creatureSvg(type: OperationType): string {
  const artwork = opSvgs[type] ?? opSvgs.clear;
  return `<div class="creature-art creature-${type}">${artwork}</div>`;
}

function startReaction(type: OperationType, answer: number): void {
  cleanScene();
  screen.classList.add("animating", `anim-${type}`);
  creature.innerHTML = creatureSvg(type);
  hint.textContent = "Морская магия уже началась…";
  const duration = type === "clear" ? 1300 : 2200;
  window.setTimeout(() => {
    screen.classList.remove("animating", `anim-${type}`);
    beginPearl(answer);
  }, duration);
}

function beginPearl(answer: number): void {
  screen.classList.add("gather");
  $(".ocean").classList.add("gather");
  hint.textContent = "Всё сходится в одну жемчужину";
  window.setTimeout(() => {
    screen.classList.remove("gather");
    $(".ocean").classList.remove("gather");
    screen.classList.add("flash-phase");
    window.setTimeout(() => {
      screen.classList.remove("flash-phase");
      screen.classList.add("result");
      pearlValue.innerHTML = renderFishValue(formatted(answer));
      resultOperands.innerHTML = renderResultExpression(resultExpression);
      resultOperands.classList.add("visible");
      creature.innerHTML = "";
      setState({
        ...state, tokens: [], current: formatted(answer), currentRooted: false,
        animating: false, resultVisible: true, error: null
      });
      hint.textContent = "Твой ответ найден";
    }, 480);
  }, 900);
}

function toggleSqrt(): void {
  if (state.animating) return;
  cleanScene();
  const nextMode = !state.sqrtMode;
  if (nextMode && state.current !== null && Number(state.current) < 0) {
    showInvalid();
    return;
  }
  setState({
    ...state, sqrtMode: nextMode,
    currentRooted: nextMode && state.current !== null ? true : state.currentRooted,
    error: null, resultVisible: false
  });
}

function toggleSign(): void {
  if (state.animating) return;
  cleanScene();
  const current = state.current ?? "0";
  const next = current.startsWith("-") ? current.slice(1) : `-${current}`;
  setState({ ...state, current: next, currentRooted: state.current === null ? state.sqrtMode : state.currentRooted, error: null, resultVisible: false });
  if ((state.currentRooted || state.sqrtMode) && Number(next) < 0) showInvalid();
}

function handleAction(action: string): void {
  if (state.animating) return;
  if (action === "clear") {
    cleanScene();
    setState({ ...state, animating: true, error: null, resultVisible: false });
    screen.classList.add("animating", "anim-clear");
    creature.innerHTML = creatureSvg("clear");
    $(".ocean").classList.add("gather");
    hint.textContent = "Водоворот собирает глубины…";
    window.setTimeout(() => {
      screen.classList.add("flash-phase");
      window.setTimeout(() => {
        cleanScene();
        setState({ ...initialState(), sqrtMode: state.sqrtMode });
        resultPair = null;
        resultExpression = [];
        resultOperands.innerHTML = "";
        resultOperands.classList.remove("visible");
        hint.textContent = "Выбери цифры и создай свой ответ";
      }, 420);
    }, 920);
    return;
  }
  if (action === "backspace") {
    cleanScene();
    const current = state.current;
    const next = current === null ? null : current.length > 1 ? current.slice(0, -1) : "0";
    setState({ ...state, current: next, error: null, resultVisible: false });
    return;
  }
  if (action === "decimal") {
    cleanScene();
    const current = state.current;
    const next = current === null ? "0." : current.includes(".") ? current : `${current}.`;
    setState({ ...state, current: next, currentRooted: current === null ? state.sqrtMode : state.currentRooted, error: null, resultVisible: false });
    return;
  }
  if (action === "sign") {
    toggleSign();
    return;
  }
  if (action === "equals") {
    calculate();
  }
}

document.querySelectorAll<HTMLButtonElement>(".key").forEach((button) => {
  const digit = button.dataset.digit;
  const action = button.dataset.action;
  const operation = button.dataset.op as OperationType | undefined;
  if (digit !== undefined) button.innerHTML = fishDigitSvg(digit);
  else if (action === "clear") button.innerHTML = opSvgs.clear;
  else if (action === "backspace") button.innerHTML = opSvgs.backspace;
  else if (action === "decimal") button.innerHTML = `<svg viewBox="0 0 72 72" role="img" aria-label="Капля"><defs><linearGradient id="drop-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".28" stop-color="#9ffff0"/><stop offset="1" stop-color="#3a9fcb"/></linearGradient><filter id="drop-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M36 5C29 20 12 37 14 49C16 66 55 70 59 49C62 35 44 17 36 5Z" fill="url(#drop-fill)" stroke="#efffff" stroke-width="2" filter="url(#drop-glow)"/><path d="M25 44Q25 33 34 23" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/></svg>`;
  else if (action === "sign") button.innerHTML = `<svg viewBox="0 0 72 72" role="img" aria-label="Плюс или минус"><circle cx="36" cy="36" r="25" fill="rgba(145,240,230,.18)" stroke="#cffff7" stroke-width="2"/><path d="M36 22V50M22 36H50" stroke="#efffff" stroke-width="4" stroke-linecap="round"/></svg>`;
  else if (operation === "sqrt") button.innerHTML = opSvgs.sqrt;
  else if (operation && operation !== "clear") button.innerHTML = opSvgs[operatorArt[operation as BinaryOperation]];
  else if (action === "equals") button.innerHTML = `<svg viewBox="0 0 72 72" role="img" aria-label="Равно"><path d="M14 25H58M14 45H58" stroke="#f1ffff" stroke-width="5" stroke-linecap="round"/></svg>`;
  button.addEventListener("click", () => {
    if (state.animating) return;
    if (digit !== undefined) inputDigit(digit, button);
    else if (operation === "sqrt") toggleSqrt();
    else if (operation && operation !== "clear") chooseOperation(operation as BinaryOperation);
    else if (action) handleAction(action);
  });
});

document.addEventListener("keydown", (event: KeyboardEvent) => {
  if (/^[0-9]$/.test(event.key) || ["Enter", "=", "Backspace", "Escape", "+", "-", "*", "/", "^", "."].includes(event.key)) event.preventDefault();
  if (/^[0-9]$/.test(event.key)) inputDigit(event.key);
  else if (event.key === ".") handleAction("decimal");
  else if (event.key === "Enter" || event.key === "=") calculate();
  else if (event.key === "Backspace") handleAction("backspace");
  else if (event.key === "Escape") handleAction("clear");
  else if (event.key === "+") chooseOperation("add");
  else if (event.key === "-") chooseOperation("subtract");
  else if (event.key === "*") chooseOperation("multiply");
  else if (event.key === "/") chooseOperation("divide");
  else if (event.key === "^") chooseOperation("power");
});

for (let index = 0; index < 28; index += 1) {
  const plankton = document.createElement("span");
  plankton.className = "plankton";
  plankton.style.left = `${(index * 37 + 7) % 100}%`;
  plankton.style.top = `${(index * 53 + 11) % 100}%`;
  plankton.style.setProperty("--drift-x", `${((index * 19) % 46) - 23}px`);
  plankton.style.setProperty("--drift-y", `${((index * 13) % 50) - 25}px`);
  plankton.style.animationDelay = `${-((index * 1.73) % 17)}s`;
  planktonField.append(plankton);
}

for (let index = 0; index < 23; index += 1) {
  const bubble = document.createElement("span");
  bubble.className = "bubble";
  const size = 7 + ((index * 17) % 24);
  bubble.style.left = `${(index * 43 + 5) % 100}%`;
  bubble.style.width = `${size}px`;
  bubble.style.height = `${size}px`;
  bubble.style.animationDuration = `${13 + ((index * 11) % 18)}s`;
  bubble.style.animationDelay = `${-((index * 2.7) % 28)}s`;
  bubbleField.append(bubble);
}

render();

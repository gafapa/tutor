import type { ArithmeticStep } from '../shared/pedagogy.js';
type Rational = { n: bigint; d: bigint };
type Node = { type: 'number'; value: Rational } | { type: 'unary'; op: string; child: Node } | { type: 'binary'; op: string; left: Node; right: Node };
function gcd(a: bigint, b: bigint): bigint { a = a < 0n ? -a : a; while (b) { const next = a % b; a = b; b = next; } return a || 1n; }
function rational(n: bigint, d = 1n): Rational {
  if (!d) throw new Error('No se puede dividir por cero.');
  if (n.toString(2).length > 2048 || d.toString(2).length > 2048) throw new Error('El cálculo supera el límite de tamaño.');
  if (d < 0n) { n = -n; d = -d; } const factor = gcd(n, d); return { n: n / factor, d: d / factor };
}
function normalize(expression: string) {
  const digits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  return expression.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, value => `^(${[...value].map(c => c === '⁻' ? '-' : digits.indexOf(c)).join('')})`).replaceAll('×', '*').replaceAll('·', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('**', '^').replaceAll(',', '.');
}
function parse(expression: string): Node {
  if (expression.length > 300) throw new Error('La expresión es demasiado larga.');
  const input = normalize(expression); const tokens = input.match(/\d+(?:\.\d+)?|[+\-*/^()%]|\S/g) ?? []; let index = 0;
  if (!tokens.length || tokens.length > 100) throw new Error('La expresión no se puede comprobar.');
  const primary = (): Node => {
    const token = tokens[index++];
    if (token === '+' || token === '-') return { type: 'unary', op: token, child: expressionNode(25) };
    if (token === '(') { const child = expressionNode(0); if (tokens[index++] !== ')') throw new Error('Falta cerrar el paréntesis.'); return child; }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token) || token.length > 100) throw new Error('Solo se comprueban operaciones numéricas.');
    const [whole, fraction = ''] = token.split('.'); return { type: 'number', value: rational(BigInt(whole + fraction), 10n ** BigInt(fraction.length)) };
  };
  const expressionNode = (min: number): Node => {
    let left = primary();
    while (index < tokens.length) {
      const op = tokens[index]; if (op === '%') { if (40 < min) break; index++; left = { type: 'unary', op, child: left }; continue; }
      const precedence = ({ '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 } as Record<string, number>)[op];
      if (precedence === undefined || precedence < min) break;
      index++; left = { type: 'binary', op, left, right: expressionNode(op === '^' ? precedence : precedence + 1) };
    } return left;
  };
  const result = expressionNode(0); if (index !== tokens.length) throw new Error('La expresión contiene elementos no admitidos.'); return result;
}
function calculate(node: Node): Rational {
  if (node.type === 'number') return node.value;
  if (node.type === 'unary') { const v = calculate(node.child); return node.op === '%' ? rational(v.n, v.d * 100n) : rational(node.op === '-' ? -v.n : v.n, v.d); }
  const a = calculate(node.left), b = calculate(node.right);
  if (node.op === '+') return rational(a.n * b.d + b.n * a.d, a.d * b.d);
  if (node.op === '-') return rational(a.n * b.d - b.n * a.d, a.d * b.d);
  if (node.op === '*') return rational(a.n * b.n, a.d * b.d);
  if (node.op === '/') return rational(a.n * b.d, a.d * b.n);
  if (b.d !== 1n || b.n < -100n || b.n > 100n) throw new Error('Solo se comprueban exponentes enteros entre −100 y 100.');
  const power = b.n < 0n ? -b.n : b.n;
  if (power * BigInt(Math.max(a.n.toString(2).length, a.d.toString(2).length)) > 2048n) throw new Error('La potencia supera el límite de tamaño.');
  if (a.n === 0n && b.n === 0n) throw new Error('No se interpreta cero elevado a cero.');
  return b.n < 0n ? rational(a.d ** power, a.n ** power) : rational(a.n ** power, a.d ** power);
}
function format(value: Rational) { return value.d === 1n ? value.n.toString() : `${value.n}/${value.d}`; }
export function arithmeticValue(expression: string): string { return format(calculate(parse(expression))); }
export function sameArithmeticValue(answer: string, expected: string) { try { return arithmeticValue(answer) === arithmeticValue(expected); } catch { return false; } }
export function arithmeticSteps(text: string): ArithmeticStep[] {
  const steps: ArithmeticStep[] = []; let offset = 0, line = 0;
  for (const full of text.split(/(?<=\n)/)) {
    line++; const match = /^(\s*(?:(?:\d+[.)]|Paso\s+\d+\s*:)\s+)?)([^\r\n]*?)\s*$/i.exec(full);
    if (match) {
      const expression = match[2].trim(); const parts = expression.split('=');
      if (parts.length >= 2 && parts.length <= 6 && parts.every(p => p.trim())) {
        try {
          const values = parts.map(p => arithmeticValue(p.trim())); const firstWrong = values.findIndex(v => v !== values[0]);
          const start = offset + full.indexOf(expression, match[1].length);
          steps.push({ start, end: start + expression.length, text: expression, expression: parts[0].trim(), value: values[0], claimed: parts.slice(1).join('=').trim(), correct: firstWrong === -1, line });
        } catch { /* Unknown syntax is left ungraded; it is not an educational error. */ }
      }
    } offset += full.length;
  } return steps;
}
function display(node: Node): string {
  if (node.type === 'number') return format(node.value);
  if (node.type === 'unary') return node.op === '%' ? `(${display(node.child)})%` : `${node.op}(${display(node.child)})`;
  return `(${display(node.left)} ${node.op === '*' ? '×' : node.op} ${display(node.right)})`;
}
export function arithmeticVariants(expression: string, count = 3): string[] {
  const original = parse(expression), result: string[] = [];
  for (let delta = 1; result.length < count && delta <= 12; delta++) {
    let changed = false;
    const modify = (node: Node): Node => {
      if (node.type === 'number' && !changed) { changed = true; return { type: 'number', value: rational(node.value.n + BigInt(delta) * node.value.d, node.value.d) }; }
      if (node.type === 'unary') return { ...node, child: modify(node.child) };
      if (node.type === 'binary') return { ...node, left: modify(node.left), right: modify(node.right) }; return node;
    };
    const variation = display(modify(original)); try { const value = arithmeticValue(variation); if (value !== arithmeticValue(expression) && !result.includes(variation)) result.push(variation); } catch { /* Skip variations that become invalid or exceed bounds. */ }
  }
  if (result.length < count) throw new Error('No se pueden generar variantes seguras de este cálculo. Puedes practicar con el banco o con una actividad abierta.'); return result;
}

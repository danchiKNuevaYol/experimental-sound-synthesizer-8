// Блок .meter — индикатор уровня канала (светодиодная шкала).
// Разметка: <div class="meter" data-meter="a"></div>; значение подаёт main.js из engine.meters().

const SEGMENTS = 10;

export function mountMeter(el) {
  el.innerHTML = Array.from({ length: SEGMENTS }, (_, i) => `<i class="meter__led${i < 2 ? ' meter__led--hot' : ''}"></i>`).join('');
  const leds = [...el.children].reverse();      // зажигаем снизу вверх, два верхних — перегрузка
  let lit = -1;
  return function update(level) {
    const n = Math.round(Math.min(1, level * 2.2) * SEGMENTS);
    if (n === lit) return;
    lit = n;
    leds.forEach((led, i) => led.classList.toggle('is-on', i < n));
  };
}

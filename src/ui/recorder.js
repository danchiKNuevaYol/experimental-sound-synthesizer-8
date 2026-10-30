// Блок .recorder — запись исполнения: большая кнопка, дисплей .lcd, транспорт.
// Действия приходят из main.js: { play, stop, toggleRec, save }.

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function mountRecorder(el, actions) {
  const q = (s) => el.querySelector(s);
  const pad = q('.recorder__pad'), dot = q('.lcd__dot'), time = q('.lcd__time'), status = q('.lcd__status');
  const play = q('[data-action="play"]'), save = q('[data-action="save"]');
  pad.addEventListener('click', actions.toggleRec);
  play.addEventListener('click', actions.play);
  q('[data-action="stop"]').addEventListener('click', actions.stop);
  save.addEventListener('click', actions.save);

  return {
    update({ playing, rec, hasTake }) {
      const recording = rec === 'recording';
      pad.classList.toggle('is-on', recording);
      dot.classList.toggle('is-on', recording);
      play.classList.toggle('is-on', playing);
      play.classList.toggle('key--a', playing);
      save.disabled = !hasTake || recording;
      status.textContent = recording ? 'ИДЁТ ЗАПИСЬ' : rec === 'saving' ? 'СОХРАНЕНИЕ…' : hasTake ? 'ЗАПИСЬ ГОТОВА' : 'ГОТОВ К ЗАПИСИ';
    },
    tick(seconds) {
      time.textContent = mmss(seconds);
    },
  };
}

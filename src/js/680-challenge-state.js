'use strict';
/* ---- Состояние режима, задания, панель ---- */

function startChallenge() {
  if (chal) return;
  cancelTutorial();
  /* авто-анимация двигала бы руку сама — задания решает пользователь */
  chkAnimate.checked = false;
  syncAnimToggle();
  for (const c of components) delete c._anim;
  chal = { task: 0, done: [false, false, false], lastNow: 0, lastHud: 0, held: null, holdables: [],
           log: [], replay: null, startConfig: cleanConfig() };
  document.body.classList.add('challenge');
  btnChal.classList.add('on');
  setChalCollapsed(false);
  setTask(0);
  const active = document.querySelector('#tabs button.active')?.dataset.tab;
  if (active === 'jsonarea' || active === 'urdfarea') selectTab('actarea');
  renderLog();
}

function stopChallenge() {
  if (!chal) return;
  stopReplay();
  clearTask();
  chal = null;
  invalidate();
  document.body.classList.remove('challenge');
  btnChal.classList.remove('on', 'collapsed');
  chalPanel.hidden = true;
  renderChalButton();
  if (document.querySelector('#tabs button.active')?.dataset.tab === 'actarea') selectTab('components');
}

function clearTask() {
  releaseHeld();
  disposeGroup(chalRoot);
  chal.holdables = [];
  chal.t1 = chal.t2 = chal.t3 = null;
}

/* стартовая поза каждого задания: рука вверх — все углы, выдвижения и позиции в 0,
   шпиндели выключены, схват раскрыт. Висящий промах IK снимается: иначе ikRetry()
   после buildArm() тут же вернул бы руку к старой цели, и сброс не был бы виден. */
function resetPose() {
  if (ikMiss) ikClearMiss();
  for (const c of components) {
    for (const p of TYPES[c.type].params) {
      if (p.build) continue; // габариты — часть конструкции
      c[p.key] = c.type === 'gripper' ? p.max : Math.min(p.max, Math.max(p.min, 0));
    }
    delete c._actFrom;
  }
  buildArm();
  renderPanel();
}

function setTask(i) {
  clearTask();
  chal.task = i;
  chal.done[i] = false;
  resetPose();
  [buildTask1, buildTask2, buildTask3][i]();
  /* при воспроизведении камерой управляет пользователь — не трогаем */
  if (!chal.replay) fitCameraToSphere(boundsSphere([armRoot, chalRoot]));
  renderChalHUD();
}

function gotoTask(i) {
  const from = chal.task;
  setTask(i);
  recordAction({ kind: 'task', from, to: i });
}

/* Сброс задания — вернуться к его началу в записи: журнал обрезается до последнего
   перехода к этому заданию (без него — до начала записи), рука собирается заново
   из startConfig повторным применением оставшихся записей, поза — нулевая (setTask).
   Записи применяются вперёд, а не откатываются: после остановленного на середине
   повтора текущее состояние хвосту журнала не соответствует. Выполненные другие
   задания не трогаются. */
function resetTask() {
  stopReplay();
  const log = chal.log;
  let k = log.length;
  while (k > 0 && !(log[k - 1].kind === 'task' && log[k - 1].to === chal.task)) k--;
  log.length = k;
  components = clone(chal.startConfig);
  buildArm();
  renderPanel();
  for (const a of log) { if (a.kind === 'task') resetPose(); else applyAction(a, false); }
  setTask(chal.task);
  renderLog();
}

function completeTask() {
  if (chal.done[chal.task]) return;
  chal.done[chal.task] = true;
  if (chalCollapsed) setChalCollapsed(false); // поздравление не должно потеряться
  renderChalHUD();
}

function renderChalHUD() {
  if (!chal) return;
  renderChalButton();
  document.getElementById('chalTitle').textContent = t('chalTitle');
  document.getElementById('chalMin').title = t('chalMin');
  document.getElementById('chalClose').title = t('chalExit');
  const tasks = document.getElementById('chalTasks');
  tasks.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const row = document.createElement('div');
    row.className = 'chal-task' + (i === chal.task ? ' cur' : '') + (chal.done[i] ? ' done' : '');
    row.innerHTML = `<span>${chal.done[i] ? '✅' : i === chal.task ? '▶' : '○'}</span>`
      + `<span>${i + 1}. ${t('chalTask' + (i + 1))}</span>`;
    if (i !== chal.task) {
      row.title = t('chalGoTip');
      row.onclick = () => { if (!chal.replay) gotoTask(i); }; // задания — в любом порядке
    }
    tasks.appendChild(row);
  }
  document.getElementById('chalDesc').textContent = t('chalDesc' + (chal.task + 1));
  const actions = document.getElementById('chalActions');
  actions.innerHTML = '';
  const mk = (label, cb, primary) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.onclick = cb;
    actions.appendChild(b);
  };
  const next = [1, 2].map(k => (chal.task + k) % 3).find(k => !chal.done[k]);
  if (chal.done.every(Boolean)) {
    mk(t('logReplay'), startReplay, true);
    mk(t('chalExit'), stopChallenge);
  } else if (chal.done[chal.task]) {
    mk(t('chalNext'), () => gotoTask(next), true);
  } else {
    mk(t('chalReset'), resetTask);
  }
  renderChalStatus();
}

/* динамическая часть панели: шаги, счётчики, предупреждения */
function renderChalStatus() {
  if (!chal) return;
  const need = CHAL_TOOLS[chal.task], lines = [];
  if (chal.done[chal.task]) {
    lines.push(`<span class="ok">${t(chal.done.every(Boolean) ? 'chalAllDone' : 'chalTaskDone')}</span>`);
    /* выполнено одно задание — не победа: сразу видно, какие ещё не сделаны */
    const left = chal.done.map((d, i) => (d ? null : i + 1)).filter(Boolean);
    if (left.length) lines.push(t('chalLeft', left.join(', ')));
  } else if (!components.some(c => c.type === need)) {
    lines.push(`<span class="warn">${t('chalNeed', tr(TYPES[need].label))}</span>`);
  }
  if (chal.task === 0 && chal.t1) {
    const T = chal.t1, step = (ok, key) => `${ok ? '✅' : '○'} ${t(key)}`;
    lines.push(step(chal.holdables[0].grabbed, 'chalStepGrab'), step(T.phase >= 1, 'chalStepRing'),
               step(T.phase >= 2, 'chalStepPen'));
  } else if (chal.task === 1 && chal.t2) {
    lines.push(t('chalHoles', chal.t2.drilled.filter(Boolean).length, 4));
    if (chal.t2.spindleOff) lines.push(`<span class="warn">${t('chalSpindleOff')}</span>`);
  } else if (chal.task === 2 && chal.t3) {
    lines.push(t('chalCut', chal.t3.progress));
    if (chal.t3.offCut && !chal.done[2]) lines.push(`<span class="warn">${t('chalOffCut')}</span>`);
  }
  if (chal.held) lines.push(t('chalHeld'));
  if (chal.replay) lines.push(`<span class="ok">${t('logReplaying', chal.replay.idx + 1, chal.log.length)}</span>`);
  document.getElementById('chalStatus').innerHTML = lines.join('<br>');
}

/* кадр режима: воспроизведение, физика текущего задания, обновление панели */
function challengeTick(now) {
  const dt = chal.lastNow ? Math.max(0, Math.min(0.05, (now - chal.lastNow) / 1000)) : 0;
  chal.lastNow = now;
  if (chal.replay) replayTick(now);
  armRoot.updateWorldMatrix(true, true);
  tickHold(dt);
  if (chal.task === 0) tickTask1();
  else if (chal.task === 1) tickDrill();
  else tickMill();
  tickPush();
  if (now - chal.lastHud > 200) { chal.lastHud = now; renderChalStatus(); }
}

btnChal.onclick = () => (chal ? setChalCollapsed(!chalCollapsed) : startChallenge());
document.getElementById('chalMin').onclick = () => setChalCollapsed(true);

/* Есть ли что терять при выходе: выполненные задания или действия рукой. Сам по себе
   переход между заданиями прогрессом не считается — за него переспрашивать не о чем. */
function chalProgress() {
  return !!chal && (chal.done.some(Boolean) || chal.log.some(a => a.kind !== 'task'));
}

/* ✕ обрывает прохождение: с прогрессом — переспрашиваем, с чистого листа — молча */
document.getElementById('chalClose').onclick = () => {
  if (!chalProgress()) { stopChallenge(); return; }
  showModal(t('chalQuitTitle'), t('chalQuitText', chal.done.filter(Boolean).length), [
    { label: t('chalQuitStay'), cb: hideTutModal, primary: true },
    { label: t('chalQuitLeave'), cb: () => { hideTutModal(); stopChallenge(); } },
  ]);
};

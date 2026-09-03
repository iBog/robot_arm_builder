'use strict';
/* ---- Запись действий: журнал, отмена последнего, воспроизведение ---- */

/* Действие: {kind:'param', i, type, key, from, to} — слайдер (одна запись на перетаскивание);
   {kind:'pose', items:[{i, type, key, from, to}]} — перетаскивание мишени IK (все параметры разом);
   {kind:'add', i, comp} / {kind:'del', i, comp} — кнопки; {kind:'config', from, to} — массовые
   изменения (генерация, новый проект, Undo, Apply); {kind:'task', from, to} / {kind:'reset', task}. */
function recordAction(a) {
  if (!chal || chal.replay) return;
  if (a.kind === 'param' && a.from === a.to) return;
  if (a.kind === 'config' && JSON.stringify(a.from) === JSON.stringify(a.to)) return;
  chal.log.push(a);
  renderLog();
}

/* оборачивает массовое изменение цепочки: снимок до и после — одна запись */
function withLog(fn) {
  const before = chal && !chal.replay ? cleanConfig() : null;
  fn();
  if (before) recordAction({ kind: 'config', from: before, to: cleanConfig() });
}

function syncSlider(c, key) {
  const s = c._sliders?.[key], p = TYPES[c.type].params.find(q => q.key === key);
  if (s && p) { s.slider.value = c[key]; s.val.textContent = quantParam(c[key], p); }
}

/* применение действия вперёд (воспроизведение) или назад (отмена) */
function applyAction(a, reverse) {
  if (a.kind === 'param') {
    const c = components[a.i];
    if (!c || c.type !== a.type) return;
    setParamChecked(c, a.key, reverse ? a.from : a.to);
    syncSlider(c, a.key);
  } else if (a.kind === 'pose') {
    applyPose(a.items, reverse ? 0 : 1, true);
  } else if (a.kind === 'add') {
    if (reverse) components.splice(a.i, 1); else components.splice(a.i, 0, clone(a.comp));
    buildArm(); renderPanel();
  } else if (a.kind === 'del') {
    if (reverse) components.splice(a.i, 0, clone(a.comp)); else components.splice(a.i, 1);
    buildArm(); renderPanel();
  } else if (a.kind === 'config') {
    components = clone(reverse ? a.from : a.to);
    buildArm(); renderPanel();
  } else if (a.kind === 'task') {
    setTask(reverse ? a.from : a.to);
  } else if (a.kind === 'reset') {
    setTask(a.task);
  }
}

/* Поза из записи IK — все параметры сразу, k ∈ [0,1] между from и to. По одному их
   применять нельзя: мишень двигала параметры вместе, а промежуточное сочетание (кронштейн
   уже вниз, наклон ещё старый) может уйти под пол и обрезаться — тогда повтор разъезжается
   с записью. Промежуточный кадр повтора под полом просто пропускается; конечная поза была
   принята при записи, а если рука с тех пор другая — параметры дожимаются по одному с полом. */
function applyPose(items, k, final) {
  const live = items.filter(x => components[x.i]?.type === x.type);
  const prev = live.map(x => components[x.i][x.key]);
  const set = vals => live.forEach((x, j) => { const c = components[x.i]; c[x.key] = vals[j]; applyParam3D(c, x.key); });
  set(live.map(x => x.from + (x.to - x.from) * k));
  if (armMinY() < -0.005) {
    set(prev); // applyParamChecked отталкивается от текущего значения как от допустимого
    if (!final) return;
    for (const x of live) applyParamChecked(components[x.i], x.key, x.from + (x.to - x.from) * k);
  }
  for (const x of live) syncSlider(components[x.i], x.key);
  updateJSONView();
  updateURDFView();
}

function undoLastAction() {
  if (!chal || chal.replay || !chal.log.length) return;
  applyAction(chal.log.pop(), true);
  renderLog();
}

/* Откат записи до шага k (первые k записей остаются): рука, задание, предметы и ✅ —
   как сразу после этого шага, дальше запись продолжается за ним. Хвост не откатывается
   назад — запись проигрывается заново мгновенно штатным повтором с синтетическим
   временем (кадр 16 мс), так что захват, падение, отверстия и распил происходят
   по-настоящему и отметки выполнения выставляются сами. Камера не трогается. */
function rollbackLog(k) {
  if (!chal) return;
  stopReplay();
  chal.log.length = k;
  chal.replay = { idx: -1, until: 0, cur: null, t0: 0, dur: 0 };
  replayReset();
  let now = chal.lastNow;
  for (let guard = 0; guard < 60000; guard++) {
    const r = chal.replay, next = now + 16;
    /* шаг k-1 доигран и пауза после него выдержана — следующий тик взял бы запись k */
    if (r.idx >= k - 1 && !r.cur && next >= r.until) break;
    now = next;
    challengeTick(now);
  }
  chal.replay = null;
  chal.lastNow = chal.lastHud = 0; // следующий живой кадр — с нулевым dt
  renderLog();
  renderChalHUD();
  invalidate();
}

function askRollback(k) {
  if (!chal || chal.replay || k >= chal.log.length) return;
  showModal(t('logBackTitle'), t('logBackText', k, chal.log.length), [
    { label: t('logBackNo'), cb: hideTutModal, primary: true },
    { label: t('logBackYes'), cb: () => { hideTutModal(); rollbackLog(k); } },
  ]);
}

function actionLabel(a) {
  if (a.kind === 'param') {
    const ty = TYPES[a.type], p = ty.params.find(q => q.key === a.key);
    return `${iconSVG(a.type, 14)} ${t('logParam', tr(ty.label), a.i + 1, tr(p.label), quantParam(a.from, p), quantParam(a.to, p))}`;
  }
  if (a.kind === 'pose') {
    const parts = a.items.map(x => {
      const ty = TYPES[x.type], p = ty.params.find(q => q.key === x.key);
      return t('logParam', tr(ty.label), x.i + 1, tr(p.label), quantParam(x.from, p), quantParam(x.to, p));
    });
    return `🎯 ${t('logPose')} ${parts.join('; ')}`;
  }
  if (a.kind === 'add') return `${iconSVG(a.comp.type, 14)} ${t('logAdd', tr(TYPES[a.comp.type].label))}`;
  if (a.kind === 'del') return `${iconSVG(a.comp.type, 14)} ${t('logDel', tr(TYPES[a.comp.type].label), a.i + 1)}`;
  if (a.kind === 'config') return `🔧 ${t('logConfig', a.to.length)}`;
  if (a.kind === 'task') return `🏁 ${t('logTask', a.to + 1)}`;
  return `↺ ${t('logReset', a.task + 1)}`;
}

function renderLog() {
  if (!chal) return;
  document.getElementById('actTitle').textContent = t('logTitle');
  const bUndo = document.getElementById('btnActUndo'), bPlay = document.getElementById('btnActReplay');
  bUndo.textContent = t('logUndo');
  bUndo.disabled = !chal.log.length || !!chal.replay;
  bPlay.textContent = t(chal.replay ? 'logStop' : 'logReplay');
  bPlay.disabled = !chal.log.length;
  document.getElementById('loopLbl').textContent = t('logLoop');
  document.getElementById('actLoop').title = t('logLoopTip');
  actList.innerHTML = '';
  if (!chal.log.length) { actList.innerHTML = `<div id="actEmpty">${t('logEmpty')}</div>`; return; }
  chal.log.forEach((a, i) => {
    const row = document.createElement('div');
    const r = chal.replay;
    row.className = 'act' + (r && i === r.idx ? ' cur' : '') + (r && i < r.idx ? ' past' : '');
    row.innerHTML = `<span class="act-n">${i + 1}</span><span class="act-txt">${actionLabel(a)}</span>`;
    /* стрелка отката — на всех шагах, кроме последнего (откат до него ничего не меняет) */
    if (i < chal.log.length - 1) {
      const back = document.createElement('button');
      back.className = 'act-back';
      back.title = t('logBack');
      back.textContent = '↶';
      back.onclick = () => askRollback(i + 1);
      row.appendChild(back);
    }
    actList.appendChild(row);
  });
  const cur = actList.querySelector('.act.cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' }); else actList.scrollTop = actList.scrollHeight;
}

const chkLoop = document.getElementById('chkLoop');
document.getElementById('btnActUndo').onclick = undoLastAction;
document.getElementById('btnActReplay').onclick = () => (chal?.replay ? stopReplay() : startReplay());

/* Воспроизведение: рука и задания возвращаются к состоянию на момент включения режима,
   дальше действия применяются по очереди; слайдеры плавно едут от from к to, так что
   захват, сверление и распил происходят заново по-настоящему. */
/* возврат к исходному состоянию: рука на момент включения режима, первое задание */
function replayReset() {
  chal.done = [false, false, false];
  components = clone(chal.startConfig);
  buildArm();
  renderPanel();
  setTask(0);
}

function startReplay() {
  if (!chal || chal.replay || !chal.log.length) return;
  chal.replay = { idx: -1, until: 0, cur: null, t0: 0, dur: 0 }; // до replayReset: камера не трогается
  document.body.classList.add('replaying');
  replayReset();
  renderLog();
  renderChalHUD();
}

function stopReplay() {
  if (!chal?.replay) return;
  const a = chal.replay.cur;
  chal.replay = null;
  if (a) applyAction(a, false); // незавершённый шаг — довести до конца
  document.body.classList.remove('replaying');
  renderLog();
  renderChalHUD();
}

function replayTick(now) {
  const r = chal.replay;
  if (r.cur) {
    /* плавное движение слайдера (или всей позы IK) */
    const a = r.cur, k = Math.min(1, (now - r.t0) / r.dur);
    if (a.kind === 'pose') applyPose(a.items, k, false);
    else {
      const c = components[a.i];
      if (c && c.type === a.type) {
        setParamChecked(c, a.key, a.from + (a.to - a.from) * k);
        syncSlider(c, a.key);
      }
    }
    if (k < 1) return;
    r.cur = null;
    applyAction(a, false);
    r.until = now + 250;
    return;
  }
  if (now < r.until) return;
  r.idx++;
  if (r.idx >= chal.log.length) {
    if (!chkLoop.checked) { stopReplay(); return; }
    /* зацикленный повтор: всё сначала */
    replayReset();
    r.idx = -1; r.until = now + 800;
    renderLog();
    return;
  }
  const a = chal.log[r.idx];
  renderLog();
  const span = x => { const p = TYPES[x.type].params.find(q => q.key === x.key); return Math.abs(x.to - x.from) / (p.max - p.min); };
  const bp = a.kind === 'param' ? TYPES[a.type].params.find(q => q.key === a.key) : null;
  if (a.kind === 'pose') {
    r.cur = a; r.t0 = now;
    r.dur = 300 + 900 * Math.max(...a.items.map(span));
  } else if (bp && !bp.build) {
    r.cur = a; r.t0 = now;
    r.dur = 300 + 900 * span(a);
  } else {
    applyAction(a, false); // структурные шаги и габариты — сразу
    r.until = now + 500;
  }
}

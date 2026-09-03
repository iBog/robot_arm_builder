'use strict';
/* ================= Запуск ================= */

applyI18n();
applyTheme();
applyStyle();
syncAnimToggle();
syncFitToggle();
checkCodeSpec(); // формат ссылок не должен разъезжаться с TYPES
checkGeomSpec(); // размеры деталей согласованы между собой и с заданиями
checkCatalog(); // ALTS/NEEDS ссылаются на существующие детали, цены — числа

/* Отладочный API страницы под ?debug=1 (window.roboArm): агенты, внешние скрипты
   и тесты управляют рукой без инжекции кода в модуль. Состав — в tests/README.md. */
if (urlParam('debug') !== null) {
  window.roboArm = {
    get components() { return components; },
    get pivots() { return pivots; },
    config: () => cleanConfig(),
    setArm(cfg) { components = validateConfig(clone(cfg)); buildArm(); renderPanel(); return cleanConfig(); },
    setParam(i, key, v) { const c = components[i]; const acc = setParamChecked(c, key, v); syncSlider(c, key); return acc; },
    tip: () => armTip().toArray(),
    minY: () => armMinY(),
    ik: { on: setIK, solve: (x, y, z) => ikSolve(new THREE.Vector3(x, y, z)), get miss() { return ikMiss?.target.toArray() ?? null; } },
    tick(now) { if (chal) challengeTick(now); },
    state: () => ({
      version: VERSION, lang, theme, style, print: armPrint(), components: cleanConfig(), tip: armTip().toArray(), minY: armMinY(),
      challenge: chal ? { task: chal.task, done: [...chal.done], held: chal.held?.h.kind ?? null,
                          log: chal.log.length, replaying: !!chal.replay } : null,
    }),
    challenge: { start: startChallenge, stop: stopChallenge, goto: gotoTask, reset: resetTask, get data() { return chal; } },
    share: { full: shareURL, short: structShareURL, encode: encodeArmCode, decode: decodeArmCode,
             encodeStruct: encodeStructCode, decodeStruct: decodeStructCode },
    cart: { get data() { return { ...cart }; }, add: cartAdd, clear: cartClear, text: cartText },
    twin: { addLink: twinAddLink, removeLink: twinRemoveLink, handle: twinHandle, get links() { return twin.links; }, get state() { return twinStateMessage(); } },
    setLang, setTheme, setStyle, THREE, scene, camera, controls, renderer,
  };
}
const fromLink = loadFromURL(); // рука из ссылки — раньше первой сборки
buildArm();
renderPanel();
if (fromLink) {
  fitCameraToArm();
  if (!components.length) showStartHint(); // ссылка на пустую руку — подсказать, с чего начать
} else if (badLink) showBadLink(); // код был, но битый: пустая рука + предупреждение

renderer.setAnimationLoop((now) => {
  /* «живая» сцена: анимация, задания или вращающийся шпиндель — рисуем каждый кадр */
  const live = chkAnimate.checked || !!chal || components.some(c => c._spin && (c.speed ?? 0) > 0);
  if (chkAnimate.checked) animateArm(now);
  /* шпиндели сверла/фрезы крутятся всегда, пропорционально оборотам */
  for (const c of components) {
    if (c._spin) c._spin.rotation.y += (c.speed ?? 0) * 0.004;
  }
  if (chal) challengeTick(now);
  twinTick(now); // поза → двойник (только при изменении, с троттлингом)
  const moved = controls.update(); // true, пока камера движется (в том числе затухание)
  if (chkFit.checked && cameraAutoExpand()) invalidate();
  if (!live && !moved && renderPending <= 0) return; // ничего не изменилось — кадр пропускаем
  if (renderPending > 0) renderPending--;
  if (ikOn && !ikDrag && !ikMiss) armTip(ikGizmo.position); // мишень следует за концом руки
  if (ikLine.visible) ikUpdateLine();
  updateFog();
  renderer.render(scene, camera);
});

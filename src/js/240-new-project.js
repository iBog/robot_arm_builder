'use strict';
/* ================= Новый проект ================= */

/* очищает цепочку и возвращает стартовый вид: чистый лист */
function newProject() {
  cancelTutorial();
  stopChallenge(); // чистый лист — это и выход из режима заданий
  if (components.length) pushUndo();
  withLog(() => { components = []; buildArm(); renderPanel(); });
  camera.position.copy(CAM_HOME.pos);
  controls.target.copy(CAM_HOME.target);
  invalidate();
  showStartHint();
}

document.getElementById('btnNew').onclick = newProject;

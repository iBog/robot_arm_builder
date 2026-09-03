'use strict';
/* ================= Вкладки панели ================= */

function selectTab(id) {
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === id);
  for (const pane of document.querySelectorAll('.tabpane')) pane.classList.toggle('active', pane.id === id);
  if (id === 'jsonarea') updateJSONView();
  if (id === 'urdfarea') updateURDFView();
}
for (const btn of document.querySelectorAll('#tabs button')) btn.onclick = () => selectTab(btn.dataset.tab);

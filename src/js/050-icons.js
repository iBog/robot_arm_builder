'use strict';
/* ---- SVG-иконки компонентов: единый линейный стиль ---- */
const ICONS = {
  /* вертикальная ось + эллипс вращения со стрелкой */
  yaw: `<line x1="9" y1="2.5" x2="9" y2="7.5"/>
        <path d="M12.8 9.6a4.8 2.2 0 1 1-1.6-1.7"/>
        <path d="M13.6 7.6l-.6 2.2-2.2-.5"/>`,
  /* шарнир: ось, горизонтальное и наклонённое плечо, дуга */
  pitch: `<circle cx="5" cy="13.5" r="1.6" fill="currentColor" stroke="none"/>
          <path d="M6.2 13.5h7.3"/>
          <path d="M5.8 12.2l4.4-5.8"/>
          <path d="M13 10.6a6.5 6.5 0 0 0-1.9-3.2"/>`,
  /* стержень + кольцо вращения вокруг собственной оси */
  roll: `<line x1="9" y1="2" x2="9" y2="16"/>
         <path d="M4.8 8.2a4.2 2 0 0 0 8.4 0"/>
         <path d="M13.6 9.7l.3-2.1-2-.3"/>`,
  /* звено: два шарнира, соединённые тягой */
  link: `<circle cx="4.5" cy="13.5" r="1.7" fill="currentColor" stroke="none"/>
         <circle cx="13.5" cy="4.5" r="1.7" fill="currentColor" stroke="none"/>
         <line x1="6" y1="12" x2="12" y2="6"/>`,
  /* клешня: ножка и два пальца с загибом */
  gripper: `<line x1="9" y1="16" x2="9" y2="11.5"/>
            <path d="M5.5 3.5v4.5a3.5 3.5 0 0 0 7 0V3.5"/>
            <line x1="5.5" y1="3.5" x2="6.8" y2="4.4"/>
            <line x1="12.5" y1="3.5" x2="11.2" y2="4.4"/>`,
  /* телескоп: корпус, шток, стрелка выдвижения */
  prismatic: `<rect x="5.8" y="9" width="6.4" height="6.5" rx="1"/>
              <rect x="7.4" y="4.5" width="3.2" height="4.5" rx="0.8"/>
              <line x1="9" y1="3.5" x2="9" y2="1.2"/>
              <path d="M7.9 2.2 9 1.1l1.1 1.1"/>`,
  /* шаровой: сфера в чашке + хвостовик */
  spherical: `<circle cx="9" cy="8" r="3"/>
              <line x1="9" y1="5" x2="9" y2="2"/>
              <path d="M4.2 10.5a5 5 0 0 0 9.6 0"/>`,
  /* Г-кронштейн с крепёжными точками */
  offset: `<path d="M4.5 2.5v11h9"/>
           <circle cx="4.5" cy="2.5" r="1.4" fill="currentColor" stroke="none"/>
           <circle cx="13.5" cy="13.5" r="1.4" fill="currentColor" stroke="none"/>`,
  /* рельс: направляющая, каретка, двунаправленная стрелка */
  rail: `<line x1="1.8" y1="14" x2="16.2" y2="14"/>
         <rect x="6.3" y="8.5" width="5.4" height="4" rx="1"/>
         <path d="M4 5h10M4 5l1.6-1.4M4 5l1.6 1.4M14 5l-1.6-1.4M14 5l-1.6 1.4"/>`,
  /* присоска: купол, шток, поверхность пунктиром */
  suction: `<path d="M4.3 10.5a4.7 4.7 0 0 1 9.4 0"/>
            <line x1="3.2" y1="10.5" x2="14.8" y2="10.5"/>
            <line x1="9" y1="5.8" x2="9" y2="2.5"/>
            <line x1="4" y1="14.5" x2="14" y2="14.5" stroke-dasharray="2.2 2"/>`,
  /* сверло: корпус, бит с витками, остриё */
  drill: `<rect x="5.5" y="2" width="7" height="5" rx="1"/>
          <line x1="9" y1="7" x2="9" y2="12.5"/>
          <path d="M7.4 8.8h3.2M7.4 10.6h3.2"/>
          <path d="M9 15.6l-1.3-2.6h2.6z"/>`,
  /* фреза: шток и шестерня с зубьями */
  mill: `<line x1="9" y1="1.8" x2="9" y2="6.6"/>
         <circle cx="9" cy="10.4" r="3"/>
         <circle cx="9" cy="10.4" r="0.9"/>
         <path d="M9 6.2v1.2M9 13.4v1.2M4.8 10.4H6M12 10.4h1.2M6 7.4l.9.9M11.1 12.5l.9.9M12 7.4l-.9.9M6.9 12.5l-.9.9"/>`,
};

function iconSVG(type, size = 16) {
  const hex = '#' + TYPES[type].color.toString(16).padStart(6, '0');
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 18 18" fill="none"
    style="color:${hex}" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round">${ICONS[type]}</svg>`;
}

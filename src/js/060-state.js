'use strict';
/* Состояние: цепочка компонентов от основания к концу */
let components = [
  { type: 'yaw', angle: 0 },
  { type: 'pitch', angle: 40 },
  { type: 'link', length: 1.2 },
  { type: 'pitch', angle: -60 },
  { type: 'link', length: 1.0 },
  { type: 'roll', angle: 0 },
  { type: 'gripper', open: 60 },
];

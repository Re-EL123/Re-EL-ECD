'use strict';

const modules = [
  require('./auth'),
  require('./access'),
  require('./platform'),
  require('./organisation'),
  require('./media'),
  require('./learners'),
  require('./admissions'),
  require('./curriculum'),
  require('./assessments'),
  require('./attendance'),
  require('./staff'),
  require('./forms'),
  require('./communications'),
  require('./finance'),
  require('./safety'),
  require('./operations'),
  require('./parent')
];

function register(router) {
  for (const module of modules) module.register(router);
  return router;
}

module.exports = { register, modules };

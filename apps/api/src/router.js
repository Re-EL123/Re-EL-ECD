'use strict';

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, options = {}) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern
          .split('/')
          .map((segment) => {
            if (segment.startsWith(':')) {
              keys.push(segment.slice(1));
              return '([^/]+)';
            }
            return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/') +
        '/?$'
    );
    this.routes.push({ method, pattern, regex, keys, handler, options });
    return this;
  }

  get(pattern, handler, options) { return this.add('GET', pattern, handler, options); }
  post(pattern, handler, options) { return this.add('POST', pattern, handler, options); }
  patch(pattern, handler, options) { return this.add('PATCH', pattern, handler, options); }
  put(pattern, handler, options) { return this.add('PUT', pattern, handler, options); }
  delete(pattern, handler, options) { return this.add('DELETE', pattern, handler, options); }

  match(method, path) {
    let pathMatched = false;
    for (const route of this.routes) {
      const match = route.regex.exec(path);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1]);
      });
      return { route, params };
    }
    if (pathMatched) return { methodNotAllowed: true };
    return null;
  }
}

module.exports = { Router };

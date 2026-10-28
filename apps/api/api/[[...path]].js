const url = require('url');

module.exports = (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Health check
  if (path === '/api/v1/health') {
    res.status(200).json({
      status: 'ok',
      message: 'Re-EL ECD API is running',
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // Auth endpoints
  if (path === '/api/v1/auth/session') {
    res.status(200).json({
      data: {
        authenticated: false,
        user: null
      },
      meta: { requestId: 'req-' + Date.now() }
    });
    return;
  }
  
  // Platform overview
  if (path === '/api/v1/platform/overview') {
    res.status(200).json({
      data: {
        totalOrganisations: 3,
        activeOrganisations: 2,
        totalLearners: 125,
        totalStaff: 28,
        revenue: 45600
      },
      meta: { requestId: 'req-' + Date.now() }
    });
    return;
  }
  
  // Default response
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      requestId: 'req-' + Date.now()
    }
  });
};

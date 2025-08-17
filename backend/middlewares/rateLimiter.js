import rateLimit from 'express-rate-limit';

// Rate limiting configuration for verification endpoints
export const verificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 verification requests per windowMs
  message: {
    success: false,
    message: "Too many verification attempts from this IP, please try again later",
    retryAfter: "15 minutes"
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many verification attempts from this IP, please try again later",
      retryAfter: "15 minutes",
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(Date.now() + req.rateLimit.resetTime)
    });
  },
  keyGenerator: (req) => {
    // Use IP address and user ID if available for more granular rate limiting
    return req.user ? `${req.ip}-${req.user.id}` : req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user && req.user.role === 'admin';
  }
});

// Stricter rate limiting for bulk verification
export const bulkVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 bulk verification requests per windowMs
  message: {
    success: false,
    message: "Too many bulk verification attempts from this IP, please try again later",
    retryAfter: "15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many bulk verification attempts from this IP, please try again later",
      retryAfter: "15 minutes",
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(Date.now() + req.rateLimit.resetTime)
    });
  },
  keyGenerator: (req) => {
    return req.user ? `${req.ip}-${req.user.id}` : req.ip;
  },
  skip: (req) => {
    return req.user && req.user.role === 'admin';
  }
});

// Rate limiting for QR code scanning (most strict)
export const qrScanRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Limit each IP to 50 QR scans per 5 minutes
  message: {
    success: false,
    message: "Too many QR code scans from this IP, please try again later",
    retryAfter: "5 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many QR code scans from this IP, please try again later",
      retryAfter: "5 minutes",
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(Date.now() + req.rateLimit.resetTime)
    });
  },
  keyGenerator: (req) => {
    return req.user ? `${req.ip}-${req.user.id}` : req.ip;
  },
  skip: (req) => {
    return req.user && req.user.role === 'admin';
  }
});

// Rate limiting for manual ticket number verification
export const manualVerificationRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // Limit each IP to 30 manual verifications per 10 minutes
  message: {
    success: false,
    message: "Too many manual verification attempts from this IP, please try again later",
    retryAfter: "10 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many manual verification attempts from this IP, please try again later",
      retryAfter: "10 minutes",
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(Date.now() + req.rateLimit.resetTime)
    });
  },
  keyGenerator: (req) => {
    return req.user ? `${req.ip}-${req.user.id}` : req.ip;
  },
  skip: (req) => {
    return req.user && req.user.role === 'admin';
  }
});

// Dynamic rate limiting based on user role and event size
export const dynamicVerificationRateLimiter = (req, res, next) => {
  // Base limits
  let maxRequests = 100;
  let windowMs = 15 * 60 * 1000; // 15 minutes
  
  // Adjust based on user role
  if (req.user) {
    switch (req.user.role) {
      case 'admin':
        maxRequests = 1000; // Very high limit for admins
        windowMs = 5 * 60 * 1000; // 5 minutes
        break;
      case 'organizer':
        maxRequests = 500; // Higher limit for organizers
        windowMs = 10 * 60 * 1000; // 10 minutes
        break;
      default:
        maxRequests = 100; // Standard limit for regular users
        windowMs = 15 * 60 * 1000; // 15 minutes
    }
  }
  
  // Create dynamic rate limiter
  const limiter = rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      success: false,
      message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 60000} minutes`,
      retryAfter: `${windowMs / 60000} minutes`
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user ? `${req.ip}-${req.user.id}` : req.ip;
    }
  });
  
  // Apply the limiter
  limiter(req, res, next);
};

// IP-based blocking for suspicious activity
export const suspiciousIPBlocker = (req, res, next) => {
  // This is a placeholder for IP blocking logic
  // In production, you'd integrate with a service like:
  // - AbuseIPDB
  // - IPQualityScore
  // - Your own blacklist database
  
  const suspiciousIPs = [
    // Add known suspicious IPs here
    // '192.168.1.100',
    // '10.0.0.50'
  ];
  
  if (suspiciousIPs.includes(req.ip)) {
    return res.status(403).json({
      success: false,
      message: "Access denied from this IP address",
      reason: "IP address flagged as suspicious"
    });
  }
  
  next();
};

// Device fingerprinting for additional security
export const deviceFingerprinter = (req, res, next) => {
  // Extract device information from user agent
  const userAgent = req.get('User-Agent') || '';
  
  // Simple device detection
  let deviceType = 'unknown';
  if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
    deviceType = 'mobile';
  } else if (/Tablet|iPad/.test(userAgent)) {
    deviceType = 'tablet';
  } else if (/Windows|Mac|Linux/.test(userAgent)) {
    deviceType = 'desktop';
  }
  
  // Add device info to request for logging
  req.deviceInfo = {
    type: deviceType,
    userAgent,
    ip: req.ip,
    timestamp: new Date()
  };
  
  next();
};

// Export all rate limiters
export default {
  verificationRateLimiter,
  bulkVerificationRateLimiter,
  qrScanRateLimiter,
  manualVerificationRateLimiter,
  dynamicVerificationRateLimiter,
  suspiciousIPBlocker,
  deviceFingerprinter
};

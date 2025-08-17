import AdminLog from "../models/AdminLog.js";
import { generateAdminLog } from "../utils/adminUtils.js";

/**
 * Admin Activity Logging Middleware
 * Automatically logs all admin actions for audit purposes
 */

// Middleware to start logging admin actions
export const startAdminLogging = (action, targetType, targetModel) => {
  return async (req, res, next) => {
    // Only log for admin users
    if (!req.user || req.user.role !== 'admin') {
      return next();
    }

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    // Create admin log entry
    const adminLog = new AdminLog({
      adminId: req.user.id,
      action,
      targetType,
      targetModel,
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        method: req.method,
        requestId: req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      },
      performance: {
        startTime: new Date(),
        memoryUsage: startMemory.heapUsed
      }
    });

    // Store the log entry in the request for later use
    req.adminLog = adminLog;

    // Override res.json to capture response data
    const originalJson = res.json;
    res.json = function(data) {
      // Capture response data for logging
      if (req.adminLog) {
        req.adminLog.details.after = data;
        
        // Mark as completed
        req.adminLog.status = 'completed';
        req.adminLog.performance.endTime = new Date();
        req.adminLog.performance.duration = Date.now() - startTime;
        req.adminLog.performance.memoryUsage = process.memoryUsage().heapUsed - startMemory.heapUsed;
        
        // Save the log entry
        req.adminLog.save().catch(err => {
          console.error('Failed to save admin log:', err);
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };

    // Override res.status to capture error responses
    const originalStatus = res.status;
    res.status = function(code) {
      if (code >= 400 && req.adminLog) {
        req.adminLog.status = 'failed';
        req.adminLog.error = {
          code: `HTTP_${code}`,
          message: `HTTP ${code} response`
        };
      }
      return originalStatus.call(this, code);
    };

    next();
  };
};

// Middleware to log specific admin actions with custom logic
export const logAdminAction = (action, targetType, targetModel, customLogic = null) => {
  return async (req, res, next) => {
    try {
      // Start logging
      await startAdminLogging(action, targetType, targetModel)(req, res, next);

      // Execute custom logic if provided
      if (customLogic && typeof customLogic === 'function') {
        await customLogic(req, res, next);
      }

    } catch (error) {
      // Log error if admin log exists
      if (req.adminLog) {
        req.adminLog.markFailed(error);
      }
      next(error);
    }
  };
};

// Middleware to log user management actions
export const logUserAction = (action) => {
  return logAdminAction(action, 'user', 'User', async (req, res, next) => {
    if (req.adminLog && req.params.id) {
      // Capture user data before changes
      try {
        const User = (await import('../models/User.js')).default;
        const user = await User.findById(req.params.id).select('-password');
        if (user) {
          req.adminLog.details.before = user.toObject();
          req.adminLog.targetId = user._id;
        }
      } catch (err) {
        console.error('Failed to capture user data for logging:', err);
      }
    }
    next();
  });
};

// Middleware to log event management actions
export const logEventAction = (action) => {
  return logAdminAction(action, 'event', 'Event', async (req, res, next) => {
    if (req.adminLog && req.params.id) {
      // Capture event data before changes
      try {
        const Event = (await import('../models/Event.js')).default;
        const event = await Event.findById(req.params.id);
        if (event) {
          req.adminLog.details.before = event.toObject();
          req.adminLog.targetId = event._id;
        }
      } catch (err) {
        console.error('Failed to capture event data for logging:', err);
      }
    }
    next();
  });
};

// Middleware to log system configuration changes
export const logSystemAction = (action) => {
  return logAdminAction(action, 'system', 'System', async (req, res, next) => {
    if (req.adminLog) {
      req.adminLog.details.before = { timestamp: new Date() };
      req.adminLog.details.after = req.body;
      req.adminLog.details.changes = Object.keys(req.body);
    }
    next();
  });
};

// Middleware to log security actions
export const logSecurityAction = (action) => {
  return logAdminAction(action, 'security', 'Security', async (req, res, next) => {
    if (req.adminLog) {
      req.adminLog.details.before = { timestamp: new Date() };
      req.adminLog.details.after = req.body;
      req.adminLog.details.changes = Object.keys(req.body);
    }
    next();
  });
};

// Middleware to capture changes in request body
export const captureChanges = (req, res, next) => {
  if (req.adminLog && req.body && Object.keys(req.body).length > 0) {
    req.adminLog.details.changes = Object.keys(req.body);
    req.adminLog.details.notes = `Modified fields: ${Object.keys(req.body).join(', ')}`;
  }
  next();
};

// Middleware to add custom notes to admin log
export const addAdminLogNote = (note) => {
  return (req, res, next) => {
    if (req.adminLog) {
      req.adminLog.details.notes = note;
    }
    next();
  };
};

// Middleware to set custom risk factors
export const setCustomRiskFactors = (riskFactors) => {
  return (req, res, next) => {
    if (req.adminLog && Array.isArray(riskFactors)) {
      req.adminLog.riskAssessment.riskFactors = [
        ...(req.adminLog.riskAssessment.riskFactors || []),
        ...riskFactors
      ];
    }
    next();
  };
};

// Middleware to require approval for specific actions
export const requireApproval = (req, res, next) => {
  if (req.adminLog) {
    req.adminLog.approval.required = true;
    req.adminLog.status = 'requires_approval';
  }
  next();
};

// Utility function to manually log admin actions
export const manualAdminLog = async (adminId, action, targetType, targetModel, targetId, details = {}) => {
  try {
    const adminLog = new AdminLog({
      adminId,
      action,
      targetType,
      targetModel,
      targetId,
      details,
      context: {
        ipAddress: 'manual',
        userAgent: 'manual',
        endpoint: 'manual',
        method: 'manual'
      },
      performance: {
        startTime: new Date(),
        endTime: new Date(),
        duration: 0
      }
    });

    await adminLog.save();
    return adminLog;
  } catch (error) {
    console.error('Failed to create manual admin log:', error);
    throw error;
  }
};

// Export all middleware functions
export default {
  startAdminLogging,
  logAdminAction,
  logUserAction,
  logEventAction,
  logSystemAction,
  logSecurityAction,
  captureChanges,
  addAdminLogNote,
  setCustomRiskFactors,
  requireApproval,
  manualAdminLog
};

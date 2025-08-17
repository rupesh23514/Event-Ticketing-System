// Admin Utilities - Helper functions for common admin operations

/**
 * Generate admin activity log entry
 * @param {string} action - The action performed
 * @param {string} targetType - Type of target (user, event, ticket, etc.)
 * @param {string} targetId - ID of the target
 * @param {string} adminId - ID of the admin performing the action
 * @param {Object} details - Additional details about the action
 * @returns {Object} Log entry object
 */
export const generateAdminLog = (action, targetType, targetId, adminId, details = {}) => {
  return {
    action,
    targetType,
    targetId,
    adminId,
    timestamp: new Date(),
    details,
    ipAddress: null, // Will be set by middleware
    userAgent: null   // Will be set by middleware
  };
};

/**
 * Validate admin action permissions
 * @param {Object} admin - Admin user object
 * @param {string} action - Action to perform
 * @param {string} targetType - Type of target
 * @param {Object} target - Target object
 * @returns {Object} Validation result
 */
export const validateAdminAction = (admin, action, targetType, target) => {
  const validation = {
    allowed: false,
    reason: null,
    requiresApproval: false
  };

  // Super admin can do everything
  if (admin.role === 'admin' && admin.isSuperAdmin) {
    validation.allowed = true;
    return validation;
  }

  // Regular admin permissions
  switch (action) {
    case 'view':
      validation.allowed = true;
      break;
    
    case 'edit':
      if (targetType === 'user' && target.role === 'admin') {
        validation.allowed = false;
        validation.reason = 'Cannot edit other admin users';
      } else {
        validation.allowed = true;
      }
      break;
    
    case 'delete':
      if (targetType === 'user' && target.role === 'admin') {
        validation.allowed = false;
        validation.reason = 'Cannot delete admin users';
      } else {
        validation.allowed = true;
        validation.requiresApproval = true;
      }
      break;
    
    case 'approve':
      validation.allowed = true;
      break;
    
    case 'reject':
      validation.allowed = true;
      break;
    
    default:
      validation.allowed = false;
      validation.reason = 'Unknown action';
  }

  return validation;
};

/**
 * Calculate risk score for various entities
 * @param {Object} entity - Entity to evaluate
 * @param {string} entityType - Type of entity
 * @returns {number} Risk score (0-100)
 */
export const calculateRiskScore = (entity, entityType) => {
  let score = 0;

  switch (entityType) {
    case 'user':
      if (entity.loginAttempts > 5) score += 20;
      if (entity.isLocked) score += 15;
      if (entity.lastLoginAttempt && 
          Date.now() - entity.lastLoginAttempt.getTime() < 24 * 60 * 60 * 1000) {
        score += 10;
      }
      break;
    
    case 'event':
      if (entity.status === 'rejected') score += 10;
      if (entity.workflowHistory && entity.workflowHistory.length > 5) score += 15;
      break;
    
    case 'ticket':
      if (entity.status === 'cancelled') score += 5;
      if (entity.paymentStatus === 'failed') score += 10;
      break;
    
    case 'payment':
      if (entity.status === 'failed') score += 20;
      if (entity.status === 'pending' && 
          Date.now() - entity.createdAt.getTime() > 24 * 60 * 60 * 1000) {
        score += 15;
      }
      break;
  }

  return Math.min(score, 100);
};

/**
 * Generate admin dashboard filters
 * @param {Object} query - Query parameters
 * @returns {Object} MongoDB filter object
 */
export const generateAdminFilters = (query) => {
  const filters = {};

  // Date range filters
  if (query.startDate || query.endDate) {
    filters.createdAt = {};
    if (query.startDate) filters.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filters.createdAt.$lte = new Date(query.endDate);
  }

  // Status filters
  if (query.status) {
    if (Array.isArray(query.status)) {
      filters.status = { $in: query.status };
    } else {
      filters.status = query.status;
    }
  }

  // Role filters (for users)
  if (query.role) {
    if (Array.isArray(query.role)) {
      filters.role = { $in: query.role };
    } else {
      filters.role = query.role;
    }
  }

  // Category filters (for events)
  if (query.category) {
    if (Array.isArray(query.category)) {
      filters.category = { $in: query.category };
    } else {
      filters.category = query.category;
    }
  }

  // Search filters
  if (query.search) {
    const searchRegex = new RegExp(query.search, 'i');
    if (query.searchField) {
      filters[query.searchField] = searchRegex;
    } else {
      // Default search fields based on entity type
      filters.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { title: searchRegex }
      ];
    }
  }

  return filters;
};

/**
 * Generate pagination options
 * @param {Object} query - Query parameters
 * @returns {Object} Pagination options
 */
export const generatePaginationOptions = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 10, 100); // Max 100 items per page
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    sort: query.sort || { createdAt: -1 }
  };
};

/**
 * Format admin response data
 * @param {Object} data - Raw data
 * @param {Object} options - Formatting options
 * @returns {Object} Formatted response
 */
export const formatAdminResponse = (data, options = {}) => {
  const {
    includeMetadata = true,
    includeTimestamps = true,
    includeStats = false,
    formatDates = true
  } = options;

  let formatted = { ...data };

  // Format dates if requested
  if (formatDates) {
    Object.keys(formatted).forEach(key => {
      if (formatted[key] instanceof Date) {
        formatted[key] = formatted[key].toISOString();
      }
    });
  }

  // Remove timestamps if not requested
  if (!includeTimestamps) {
    delete formatted.createdAt;
    delete formatted.updatedAt;
  }

  // Add metadata if requested
  if (includeMetadata) {
    formatted._metadata = {
      formattedAt: new Date().toISOString(),
      version: '1.0'
    };
  }

  // Add stats if requested
  if (includeStats && Array.isArray(formatted)) {
    formatted._stats = {
      total: formatted.length,
      timestamp: new Date().toISOString()
    };
  }

  return formatted;
};

/**
 * Validate admin input data
 * @param {Object} data - Input data to validate
 * @param {string} schema - Validation schema name
 * @returns {Object} Validation result
 */
export const validateAdminInput = (data, schema) => {
  const errors = [];

  switch (schema) {
    case 'userUpdate':
      if (data.role && !['user', 'organizer', 'admin'].includes(data.role)) {
        errors.push('Invalid user role');
      }
      if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
        errors.push('isActive must be a boolean');
      }
      break;
    
    case 'eventApproval':
      if (data.status && !['approved', 'rejected'].includes(data.status)) {
        errors.push('Invalid approval status');
      }
      if (data.status === 'rejected' && !data.rejectionReason) {
        errors.push('Rejection reason is required when rejecting an event');
      }
      break;
    
    case 'systemConfig':
      if (data.maintenanceMode !== undefined && typeof data.maintenanceMode !== 'boolean') {
        errors.push('maintenanceMode must be a boolean');
      }
      break;
    
    default:
      errors.push('Unknown validation schema');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default {
  generateAdminLog,
  validateAdminAction,
  calculateRiskScore,
  generateAdminFilters,
  generatePaginationOptions,
  formatAdminResponse,
  validateAdminInput
};

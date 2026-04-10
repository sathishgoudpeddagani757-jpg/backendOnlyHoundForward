const AuditLog = require('../models/AuditLog');

const getIpAddress = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

const recordAudit = async ({ req, actor, action, entityType, entityId, details = {} }) => {
  try {
    await AuditLog.create({
      actor: actor?._id || null,
      actorRole: actor?.role || 'system',
      action,
      entityType,
      entityId: entityId ? String(entityId) : '',
      ipAddress: req ? getIpAddress(req) : '',
      details
    });
  } catch (error) {
    console.error('Audit logging failed:', error.message);
  }
};

module.exports = {
  recordAudit
};

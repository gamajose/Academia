const { handleMemberActions } = require('./memberActions');
const { handlePlanActions } = require('./planActions');
const { handleCancelActions } = require('./cancelActions');
const { handleAuditRoutes } = require('./auditRoutes');

async function handleAdminRoutes(req, res, user, url, helpers) {
  const member = await handleMemberActions(req, res, user, url, helpers);
  if (member !== false) return member;

  const plan = await handlePlanActions(req, res, user, url, helpers);
  if (plan !== false) return plan;

  const end = await handleCancelActions(req, res, user, url, helpers);
  if (end !== false) return end;

  const audit = await handleAuditRoutes(req, res, user, url, helpers);
  if (audit !== false) return audit;

  return false;
}

module.exports = { handleAdminRoutes };

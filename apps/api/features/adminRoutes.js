const { handleMemberActions } = require('./memberActions');
const { handlePlanActions } = require('./planActions');
const { handleCancelActions } = require('./cancelActions');
const { handleAuditRoutes } = require('./auditRoutes');
const { handleReportsRoutes } = require('./reportsRoutes');
const { handleUserRoutes } = require('./userRoutes');
const { handleExportRoutes } = require('./exportRoutes');
const { handleProfileRoutes } = require('./profileRoutes');
const { handleGymRoutes } = require('./gymRoutes');
const { handleTrainingExecutionRoutes } = require('./trainingExecutionRoutes');

async function handleAdminRoutes(req, res, user, url, helpers) {
  const profile = await handleProfileRoutes(req, res, user, url, helpers);
  if (profile !== false) return profile;

  const gym = await handleGymRoutes(req, res, user, url, helpers);
  if (gym !== false) return gym;

  const trainingExecution = await handleTrainingExecutionRoutes(req, res, user, url, helpers);
  if (trainingExecution !== false) return trainingExecution;

  const users = await handleUserRoutes(req, res, user, url, helpers);
  if (users !== false) return users;

  const member = await handleMemberActions(req, res, user, url, helpers);
  if (member !== false) return member;

  const plan = await handlePlanActions(req, res, user, url, helpers);
  if (plan !== false) return plan;

  const end = await handleCancelActions(req, res, user, url, helpers);
  if (end !== false) return end;

  const audit = await handleAuditRoutes(req, res, user, url, helpers);
  if (audit !== false) return audit;

  const reports = await handleReportsRoutes(req, res, user, url, helpers);
  if (reports !== false) return reports;

  const exportsHandled = await handleExportRoutes(req, res, user, url, helpers);
  if (exportsHandled !== false) return exportsHandled;

  return false;
}

module.exports = { handleAdminRoutes };

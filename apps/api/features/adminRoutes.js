const { handleMemberActions } = require('./memberActions');
const { handleMemberDetailRoutes } = require('./memberDetailRoutes');
const { handlePlanActions } = require('./planActions');
const { handleCancelActions } = require('./cancelActions');
const { handleAuditRoutes } = require('./auditRoutes');
const { handleReportsRoutes } = require('./reportsRoutes');
const { handleUserRoutes } = require('./userRoutes');
const { handleExportRoutes } = require('./exportRoutes');
const { handleProfileRoutes } = require('./profileRoutes');
const { handleGymRoutes } = require('./gymRoutes');
const { handleTrainingExecutionRoutes } = require('./trainingExecutionRoutes');
const { handleAssessmentRoutes } = require('./assessmentRoutes');
const { handleAlertRoutes } = require('./alertRoutes');

async function handleAdminRoutes(req, res, user, url, helpers) {
  const memberDetail = await handleMemberDetailRoutes(req, res, user, url, helpers);
  if (memberDetail !== false) return memberDetail;

  const profile = await handleProfileRoutes(req, res, user, url, helpers);
  if (profile !== false) return profile;

  const gym = await handleGymRoutes(req, res, user, url, helpers);
  if (gym !== false) return gym;

  const alerts = await handleAlertRoutes(req, res, user, url, helpers);
  if (alerts !== false) return alerts;

  const assessment = await handleAssessmentRoutes(req, res, user, url, helpers);
  if (assessment !== false) return assessment;

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

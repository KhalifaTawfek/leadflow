// Data layer — Sequelize ORM over PostgreSQL.
// Sequelize parameterizes every query, which is how the app prevents SQL
// injection (a brief requirement). Models below map to the required tables:
// users, services, leads, lead_notes, ai_analysis, activity_logs.

const { Sequelize, DataTypes } = require("sequelize");

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/leadflow";

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  define: { underscored: true }
});

const uuid = { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true };

const User = sequelize.define("User", {
  id: uuid,
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM("ADMIN", "SALES", "CUSTOMER"), defaultValue: "CUSTOMER" }
}, { tableName: "users" });

const Service = sequelize.define("Service", {
  id: uuid,
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: false },
  basePrice: { type: DataTypes.STRING, allowNull: false },
  keywords: { type: DataTypes.STRING, defaultValue: "" }
}, { tableName: "services" });

const Lead = sequelize.define("Lead", {
  id: uuid,
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  serviceType: { type: DataTypes.STRING, allowNull: false },
  problem: { type: DataTypes.TEXT, allowNull: false },
  urgency: { type: DataTypes.STRING, defaultValue: "normal" },
  budget: { type: DataTypes.STRING, defaultValue: "Not stated" },
  status: { type: DataTypes.ENUM("NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"), defaultValue: "NEW" },
  assignedToId: { type: DataTypes.UUID, allowNull: true },
  customerId: { type: DataTypes.UUID, allowNull: true }   // the customer account that placed this request
}, { tableName: "leads" });

const LeadNote = sequelize.define("LeadNote", {
  id: uuid,
  text: { type: DataTypes.TEXT, allowNull: false }
}, { tableName: "lead_notes" });

const AiAnalysis = sequelize.define("AiAnalysis", {
  id: uuid,
  category: { type: DataTypes.STRING, allowNull: false },
  priority: { type: DataTypes.INTEGER, allowNull: false },
  urgencyLabel: { type: DataTypes.STRING, allowNull: false },
  estimateHours: { type: DataTypes.STRING, allowNull: false },
  summary: { type: DataTypes.TEXT, allowNull: false },
  questions: { type: DataTypes.TEXT, allowNull: false },
  draftReply: { type: DataTypes.TEXT, allowNull: false },
  priorityReason: { type: DataTypes.TEXT, allowNull: true },   // how the agent reached the priority
  aiUrgency: { type: DataTypes.STRING, allowNull: true }       // urgency the AI detected from the text
}, { tableName: "ai_analysis" });

const ActivityLog = sequelize.define("ActivityLog", {
  id: uuid,
  action: { type: DataTypes.STRING, allowNull: false },
  detail: { type: DataTypes.STRING, defaultValue: "" }
}, { tableName: "activity_logs" });

// ---- Associations ----
User.hasMany(Lead, { as: "assignedLeads", foreignKey: "assignedToId" });
Lead.belongsTo(User, { as: "assignedTo", foreignKey: "assignedToId" });

User.hasMany(Lead, { as: "customerLeads", foreignKey: "customerId" });
Lead.belongsTo(User, { as: "customer", foreignKey: "customerId" });

Lead.hasMany(LeadNote, { as: "notes", foreignKey: "leadId", onDelete: "CASCADE" });
LeadNote.belongsTo(Lead, { foreignKey: "leadId" });
LeadNote.belongsTo(User, { as: "author", foreignKey: "authorId" });
User.hasMany(LeadNote, { foreignKey: "authorId" });

Lead.hasOne(AiAnalysis, { as: "analysis", foreignKey: "leadId", onDelete: "CASCADE" });
AiAnalysis.belongsTo(Lead, { foreignKey: "leadId" });

User.hasMany(ActivityLog, { foreignKey: "userId" });
ActivityLog.belongsTo(User, { foreignKey: "userId" });

// Authenticate + create tables if missing. Called on startup and by the seed.
async function initDb() {
  await sequelize.authenticate();
  await sequelize.sync();
  // Safe, idempotent additive migration for the priority-reason column
  // (so existing databases pick it up without a destructive sync/alter).
  await sequelize.query('ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS priority_reason TEXT');
  await sequelize.query('ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS ai_urgency VARCHAR(255)');
}

module.exports = { sequelize, initDb, User, Service, Lead, LeadNote, AiAnalysis, ActivityLog };

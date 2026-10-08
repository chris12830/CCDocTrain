import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
export const businesses = sqliteTable('businesses', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/Toronto'), sample: integer('sample').notNull().default(1), createdAt: text('created_at').notNull(),
  reminderEnabled: integer('reminder_enabled').notNull().default(1), reminderEveryDays: integer('reminder_every_days').notNull().default(1), reminderLastRun: text('reminder_last_run'),
  documentNumberingMode: text('document_numbering_mode').notNull().default('custom'),
}, t => [uniqueIndex('idx_business_owner').on(t.ownerId)]);
export const members = sqliteTable('members', {
  id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id),
  userId: text('user_id'), name: text('name').notNull(), email: text('email').notNull(), role: text('role').notNull(),
  job: text('job').notNull(), sample: integer('sample').notNull().default(0), inviteHash: text('invite_hash'), inviteExpires: text('invite_expires'),
  active: integer('active').notNull().default(1), createdAt: text('created_at').notNull(), startDate: text('start_date'),
  trainingRoleId: text('training_role_id').references(() => trainingRoles.id),
}, t => [index('idx_members_business').on(t.businessId), index('idx_members_user').on(t.userId), uniqueIndex('idx_member_email').on(t.businessId,t.email)]);
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id), title: text('title').notNull(),
  code: text('code').notNull(), category: text('category').notNull(), currentRevisionId: text('current_revision_id'),
  archived: integer('archived').notNull().default(0), staffAccess: text('staff_access').notNull().default('view_print'), createdAt: text('created_at').notNull(),
  deletedAt:text('deleted_at'),deletionReason:text('deletion_reason'),deletedBy:text('deleted_by'),
  systemControlNumber: text('system_control_number'),
}, t => [index('idx_documents_business').on(t.businessId), uniqueIndex('idx_document_code').on(t.businessId,t.code), uniqueIndex('idx_system_control_number').on(t.systemControlNumber)]);
export const documentControlNumbers = sqliteTable('document_control_numbers', {
  id: integer('id').primaryKey({autoIncrement:true}), createdAt:text('created_at').notNull(),
});
export const revisions = sqliteTable('revisions', {
  id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id), documentId: text('document_id').notNull().references(() => documents.id),
  version: integer('version').notNull(), status: text('status').notNull(), fileKey: text('file_key'), filename: text('filename'), mime: text('mime'),
  content: text('content').notNull().default(''), changes: text('changes').notNull(), createdAt: text('created_at').notNull(), releasedAt: text('released_at'), author: text('author').notNull(),
  releaseRolePlan:text('release_role_plan'),approvedBy:text('approved_by'),approvedAt:text('approved_at'),
}, t => [index('idx_revisions_document').on(t.documentId), uniqueIndex('idx_revision_number').on(t.documentId,t.version)]);
export const training = sqliteTable('training', {
  id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id), documentId: text('document_id').notNull().references(() => documents.id),
  revisionId: text('revision_id').notNull().references(() => revisions.id), memberId: text('member_id').notNull().references(() => members.id),
  startDate: text('start_date').notNull(), dueDate: text('due_date').notNull(), status: text('status').notNull().default('pending'),
  viewedAt: text('viewed_at'), acknowledgedAt: text('acknowledged_at'), acknowledgedBy: text('acknowledged_by'), comment: text('comment'),
  reminderCount: integer('reminder_count').notNull().default(0), lastReminder: text('last_reminder'), createdAt: text('created_at').notNull(),
  roleNeedId: text('role_need_id').references(() => trainingNeeds.id),
  cycleKey: text('cycle_key').notNull().default(''),
}, t => [index('idx_training_business').on(t.businessId), index('idx_training_member').on(t.memberId), uniqueIndex('idx_training_revision_member_cycle').on(t.revisionId,t.memberId,t.cycleKey)]);
export const certifications = sqliteTable('certifications', {
  id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id), memberId: text('member_id').notNull().references(() => members.id),
  title: text('title').notNull(), issuer: text('issuer').notNull(), number: text('number'), issuedAt: text('issued_at').notNull(), expiresAt: text('expires_at').notNull(),
  reminderDays: integer('reminder_days').notNull().default(60), fileKey: text('file_key'), filename: text('filename'), mime: text('mime'),
  replacesId: text('replaces_id'), superseded: integer('superseded').notNull().default(0), createdAt: text('created_at').notNull(),
  photoSubmittedBy: text('photo_submitted_by').references(() => members.id), photoSubmittedAt: text('photo_submitted_at'), submissionId: text('submission_id'), photoHash: text('photo_hash'),
  certificationTypeId:text('certification_type_id').references(()=>certificationTypes.id),
}, t => [index('idx_certifications_business').on(t.businessId), index('idx_certifications_member').on(t.memberId),uniqueIndex('idx_certification_submission').on(t.businessId,t.submissionId)]);
export const reminders = sqliteTable('reminders', {
 id:text('id').primaryKey(),businessId:text('business_id').notNull().references(()=>businesses.id),memberId:text('member_id').notNull().references(()=>members.id),
 kind:text('kind').notNull(),sourceId:text('source_id').notNull(),title:text('title').notNull(),body:text('body').notNull(),sentDate:text('sent_date').notNull(),createdAt:text('created_at').notNull(),readAt:text('read_at'),resolvedAt:text('resolved_at'),
},t=>[uniqueIndex('idx_reminder_delivery').on(t.businessId,t.memberId,t.kind,t.sourceId,t.sentDate),index('idx_reminder_member').on(t.businessId,t.memberId)]);
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id), actor: text('actor').notNull(),
  actorId: text('actor_id').notNull(), action: text('action').notNull(), detail: text('detail').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('idx_audit_business_date').on(t.businessId,t.createdAt)]);
export const staffRecords = sqliteTable('staff_records', {
 id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id),
 memberId: text('member_id').notNull().references(() => members.id), kind: text('kind').notNull(),
 title: text('title').notNull(), recordDate: text('record_date').notNull(), appraisalYear: integer('appraisal_year'),
 status: text('status').notNull().default('draft'), content: text('content').notNull(),
 version: integer('version').notNull().default(1), author: text('author').notNull(), createdBy: text('created_by').notNull(),
 createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), filedAt: text('filed_at'),
 followUpDate: text('follow_up_date'), completedAt: text('completed_at'), followUpNotes: text('follow_up_notes'),
}, t => [index('idx_staff_records_business_member').on(t.businessId,t.memberId)]);
export const staffMessages = sqliteTable('staff_messages', {
 id: text('id').primaryKey(), businessId: text('business_id').notNull().references(() => businesses.id),
 requestId: text('request_id').notNull(), audience: text('audience').notNull(), targetMemberIds: text('target_member_ids').notNull(),
 subject: text('subject').notNull(), body: text('body').notNull(), sender: text('sender').notNull(),
 senderId: text('sender_id').notNull(), sentAt: text('sent_at').notNull(),
}, t => [index('idx_staff_messages_business_date').on(t.businessId,t.sentAt), uniqueIndex('idx_staff_messages_request').on(t.businessId,t.requestId)]);
export const staffMessageRecipients = sqliteTable('staff_message_recipients', {
 messageId: text('message_id').notNull().references(() => staffMessages.id),
 memberId: text('member_id').notNull().references(() => members.id), readAt: text('read_at'),
}, t => [primaryKey({columns:[t.messageId,t.memberId]}),index('idx_staff_message_recipients_member').on(t.memberId)]);
export const trainingRoles = sqliteTable('training_roles', {
 id:text('id').primaryKey(),businessId:text('business_id').notNull().references(()=>businesses.id),
 name:text('name').notNull(),description:text('description').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('idx_training_role_name').on(t.businessId,t.name)]);
export const certificationTypes=sqliteTable('certification_types',{
 id:text('id').primaryKey(),businessId:text('business_id').notNull().references(()=>businesses.id),
 name:text('name').notNull(),nameKey:text('name_key').notNull(),description:text('description').notNull().default(''),
 createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('idx_certification_type_name').on(t.businessId,t.nameKey)]);
export const trainingNeeds = sqliteTable('training_needs', {
 id:text('id').primaryKey(),businessId:text('business_id').notNull().references(()=>businesses.id),
 roleId:text('role_id').references(()=>trainingRoles.id),memberId:text('member_id').references(()=>members.id),
 kind:text('kind').notNull(),documentId:text('document_id').references(()=>documents.id),title:text('title').notNull(),
 startOffsetDays:integer('start_offset_days').notNull().default(0),dueOffsetDays:integer('due_offset_days').notNull().default(7),
 startDate:text('start_date'),dueDate:text('due_date'),renewalLeadDays:integer('renewal_lead_days').notNull().default(60),
 repeatEveryMonths:integer('repeat_every_months').notNull().default(0),
 certificationTypeId:text('certification_type_id').references(()=>certificationTypes.id),
 active:integer('active').notNull().default(1),createdAt:text('created_at').notNull(),
},t=>[index('idx_training_needs_role').on(t.businessId,t.roleId),index('idx_training_needs_member').on(t.businessId,t.memberId)]);

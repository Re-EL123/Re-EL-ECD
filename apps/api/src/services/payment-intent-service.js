'use strict';

/**
 * Payment intents bridge an invoice and a hosted PayFast checkout.
 *
 * The intent is created before the guardian leaves the app, so the ITN that
 * arrives later can be matched back to an invoice even if the browser never
 * returns. References are unguessable and globally unique in practice, which
 * lets the public webhook resolve an intent without a tenant header.
 */

const payfast = require('./payfast-service');
const { resolveCheckoutAccount } = require('./payment-accounts-service');

function outstandingFor(invoice) {
  const total = Number(invoice.total_amount || 0);
  const paid = Number(invoice.amount_paid || 0);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

function isPayable(invoice) {
  return ['issued', 'partially_paid', 'overdue'].includes(invoice.status) && outstandingFor(invoice) > 0;
}

async function guardianForInvoice(db, invoice) {
  if (invoice.guardian_id) {
    const guardian = await db.one('SELECT * FROM guardians WHERE id = $1 AND organisation_id = $2',
      [invoice.guardian_id, invoice.organisation_id]);
    if (guardian) return guardian;
  }
  if (!invoice.learner_id) return null;
  return db.one(
    `SELECT g.* FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
     WHERE lg.learner_id = $1 AND lg.organisation_id = $2
     ORDER BY lg.is_primary_contact DESC, lg.created_at LIMIT 1`,
    [invoice.learner_id, invoice.organisation_id]
  );
}

async function learnerName(db, invoice) {
  if (!invoice.learner_id) return null;
  const learner = await db.one('SELECT first_name, last_name FROM learners WHERE id = $1', [invoice.learner_id]);
  return learner ? `${learner.first_name} ${learner.last_name}` : null;
}

/**
 * Create the intent row and the signed checkout payload.
 *
 * A single hosted checkout can only carry one amount, so `purpose` records
 * what the payment is for and `metadata` carries whatever the ITN needs to
 * settle it (for a statement, the invoice ids it covers).
 */
async function createPaymentIntent(db, options) {
  const {
    organisation, invoice = null, guardian = null, amount, createdBy, req, currency,
    scope = 'parent', itemName, itemDescription, purpose = 'invoice', metadata = {}, payer = null,
    returnUrl, cancelUrl
  } = options;
  const reference = payfast.newReference();
  const value = Math.round(Number(amount) * 100) / 100;
  const contact = payer || guardian;
  // Tenant fees are collected on the tenant's own PayFast account when the
  // organisation configured one; otherwise the platform collects and settles
  // by EFT. The chosen mode is pinned on the intent so the ITN verifies
  // against the same account that produced this checkout.
  const resolved = await resolveCheckoutAccount(db, organisation, purpose);
  const metadataWithSettlement = { ...(metadata || {}), settlement: resolved.settlement };
  const intent = await db.one(
    `INSERT INTO payment_intents (organisation_id, invoice_id, guardian_id, reference, amount, currency,
      provider, status, created_by, purpose, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,'payfast','pending',$7,$8,$9::jsonb) RETURNING *`,
    [organisation.id, invoice ? invoice.id : null, guardian ? guardian.id : null, reference, value,
      currency || (invoice && invoice.currency) || organisation.currency || 'ZAR', createdBy || null,
      purpose, JSON.stringify(metadataWithSettlement)]
  );
  const urls = payfast.checkoutUrls(req, reference, scope);
  const checkout = payfast.buildCheckout({
    amount: value,
    itemName: itemName || (invoice ? 'School fees — ' + invoice.invoice_number : 'Payment'),
    itemDescription: itemDescription || (invoice ? invoice.description : null) || null,
    reference,
    email: contact ? contact.email : null,
    nameFirst: contact ? (contact.first_name || contact.display_name) : 'Parent',
    nameLast: contact ? (contact.last_name || '') : 'Guardian',
    organisationId: organisation.id,
    invoiceId: invoice ? invoice.id : undefined,
    returnUrl: returnUrl || urls.returnUrl,
    cancelUrl: cancelUrl || urls.cancelUrl,
    notifyUrl: urls.notifyUrl
  }, resolved.credentials || undefined);
  return { intent, checkout };
}

async function createInvoiceIntent(db, options) {
  return createPaymentIntent(db, Object.assign({}, options, { purpose: 'invoice' }));
}

/**
 * A statement payment covers every open invoice for one guardian, so the
 * intent carries the invoice ids and the ITN allocates across them in order.
 */
async function createStatementIntent(db, options) {
  const { invoices } = options;
  const covered = (invoices || [])
    .map((invoice) => ({ id: invoice.id, amount: outstandingFor(invoice) }))
    .filter((entry) => entry.amount > 0);
  const total = Math.round(covered.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100;
  return createPaymentIntent(db, Object.assign({}, options, {
    amount: total,
    purpose: 'statement',
    metadata: { invoiceIds: covered.map((entry) => entry.id) },
    itemName: options.itemName || 'Account statement',
    itemDescription: options.itemDescription || (covered.length + ' invoice(s)')
  }));
}

module.exports = {
  outstandingFor,
  isPayable,
  guardianForInvoice,
  learnerName,
  createPaymentIntent,
  createInvoiceIntent,
  createStatementIntent
};

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
 */
async function createInvoiceIntent(db, options) {
  const {
    organisation, invoice, guardian, amount, createdBy, req, scope = 'parent', itemName
  } = options;
  const reference = payfast.newReference();
  const value = Math.round(Number(amount) * 100) / 100;
  const intent = await db.one(
    `INSERT INTO payment_intents (organisation_id, invoice_id, guardian_id, reference, amount, currency,
      provider, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'payfast','pending',$7) RETURNING *`,
    [organisation.id, invoice.id, guardian ? guardian.id : null, reference, value,
      invoice.currency || organisation.currency || 'ZAR', createdBy || null]
  );
  const urls = payfast.checkoutUrls(req, reference, scope);
  const checkout = payfast.buildCheckout({
    amount: value,
    itemName: itemName || ('School fees — ' + invoice.invoice_number),
    itemDescription: invoice.description || null,
    reference,
    email: guardian ? guardian.email : null,
    nameFirst: guardian ? guardian.first_name : 'Parent',
    nameLast: guardian ? guardian.last_name : 'Guardian',
    organisationId: organisation.id,
    invoiceId: invoice.id,
    returnUrl: urls.returnUrl,
    cancelUrl: urls.cancelUrl,
    notifyUrl: urls.notifyUrl
  });
  return { intent, checkout };
}

module.exports = { outstandingFor, isPayable, guardianForInvoice, learnerName, createInvoiceIntent };

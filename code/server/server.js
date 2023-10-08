/* eslint-disable no-console */
const express = require('express');

const app = express();
const { resolve } = require('path');
// Replace if using a different env file or config
require('dotenv').config({ path: './.env' });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const fs = require('fs');

app.use(express.static(process.env.STATIC_DIR));

app.use(
  express.json(
    {
      // Should use middleware or a function to compute it only when
      // hitting the Stripe webhook endpoint.
      verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/webhook')) {
          req.rawBody = buf.toString();
        }
      },
    },
  ),
);
app.use(cors({ origin: true }));

// const asyncMiddleware = fn => (req, res, next) => {
//   Promise.resolve(fn(req, res, next)).catch(next);
// };

app.post("/webhook", async (req, res) => {
  // TODO: Integrate Stripe
});

// Routes
app.get('/', (req, res) => {
  try {
    const path = resolve(`${process.env.STATIC_DIR}/index.html`);
    if (!fs.existsSync(path)) throw Error();
    res.sendFile(path);
  } catch (error) {
    const path = resolve('./public/static-file-error.html');
    res.sendFile(path);
  }
});

// Fetch the Stripe publishable key
//
// Example call:
// curl -X GET http://localhost:4242/config \
//
// Returns: a JSON response of the pubblishable key
//   {
//        key: <STRIPE_PUBLISHABLE_KEY>
//   }
app.get("/config", (req, res) => {
  res.json({
    key: process.env.STRIPE_PUBLISHABLE_KEY
  })
});

// Milestone 1: Signing up
// Shows the lesson sign up page.
app.get('/email-search', async (req, res) => {
  const email = req.query.email
    try {
      const result = await stripe.customers.list({ email: email})
      res.json(result)
    } catch (e) {
      res.json(e)
    }
})

app.post('/create-setup-intent', async (req, res) => {
  const stripe = require('stripe')(`${process.env.STRIPE_SECRET_KEY}`);
    const name = req.body.name
    const email = req.body.email
    let customer = null
    let existingCustomer = null
    let error = null

    if (name?.length && email?.length) {
      existingCustomer = await stripe.customers.list(
        {
          email: `${email}`
        }
      )
    }
    
    if (existingCustomer?.data?.length) {
      customer = existingCustomer.data[0]
      error = { status: 304, message: 'Customer email already exists!'}
    } else {
      customer = await stripe.customers.create({
        name, 
        email,
        metadata: {
          'first_lesson': `${req.body.lesson}`,
        }
      });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      {customer: customer?.id},
      {apiVersion: '2023-08-16'}
    );
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      automatic_payment_methods: {
        enabled: true,
      },
    })
    res.json({
      error: error, 
      setupIntent,
      clientSecret: setupIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer,
      publishableKey: `${process.env.STRIPE_PUBLISHABLE_KEY}`
    })
});

// Milestone 2: '/schedule-lesson'
// Authorize a payment for a lesson
//
// Parameters:
// customer_id: id of the customer
// amount: amount of the lesson in cents
// description: a description of this lesson
//
// Example call:
// curl -X POST http://localhost:4242/schedule-lesson \
//  -d customer_id=cus_GlY8vzEaWTFmps \
//  -d amount=4500 \
//  -d description='Lesson on Feb 25th'
//
// Returns: a JSON response of one of the following forms:
// For a successful payment, return the Payment Intent:
//   {
//        payment: <payment_intent>
//    }
//
// For errors:
//  {
//    error:
//       code: the code returned from the Stripe error if there was one
//       message: the message returned from the Stripe error. if no payment method was
//         found for that customer return an msg 'no payment methods found for <customer_id>'
//    payment_intent_id: if a payment intent was created but not successfully authorized
// }
app.post("/schedule-lesson", async (req, res) => {
  const customer = req.body.customer_id
  try {
    const payment_methods = await stripe.customers.listPaymentMethods(
      customer,
      {type: 'card'}
    )


    let paymentIntent = await stripe.paymentIntents.create({
      customer,
      amount: req.body.amount,
      description:  req.body.description,
      currency: 'usd',
      metadata: { 
        'type': 'lessons-payment'
      },
      payment_method_types: ['card'],
      capture_method: 'manual',
    })

    const paymentConfirm = await stripe.paymentIntents.confirm(
      paymentIntent.id,
      { payment_method: payment_methods.data[0]?.id }
    );

    res.json({ payment: paymentConfirm })
  } catch (e) {
    if (e.code === 'resource_missing') {
      const error = {
        code: e.code,
        message: `No such customer: '${customer}'`
      }
      res.json({ error })
    } else {
      res.json({ error: e })
    }
  }
});


// Milestone 2: '/complete-lesson-payment'
// Capture a payment for a lesson.
//
// Parameters:
// amount: (optional) amount to capture if different than the original amount authorized
//
// Example call:
// curl -X POST http://localhost:4242/complete_lesson_payment \
//  -d payment_intent_id=pi_XXX \
//  -d amount=4500
//
// Returns: a JSON response of one of the following forms:
//
// For a successful payment, return the payment intent:
//   {
//        payment: <payment_intent>
//    }
//
// for errors:
//  {
//    error:
//       code: the code returned from the error
//       message: the message returned from the error from Stripe
// }
//
app.post("/complete-lesson-payment", async (req, res) => {
  const {payment_intent_id, amount } = req.body
  try {

    let payment = await stripe.paymentIntents.capture(
      payment_intent_id,
      { amount_to_capture: amount }
    )

    res.json({ payment })
  } catch (e) {
    if (e.code === 'resource_missing') {
      const error = {
        code: e.code,
        message: `No such payment_intent: '${payment_intent_id}'`
      }
      res.json({ error })
    } else {
      res.json({ error: e })
    }
  }
});

// Milestone 2: '/refund-lesson'
// Refunds a lesson payment.  Refund the payment from the customer (or cancel the auth
// if a payment hasn't occurred).
// Sets the refund reason to 'requested_by_customer'
//
// Parameters:
// payment_intent_id: the payment intent to refund
// amount: (optional) amount to refund if different than the original payment
//
// Example call:
// curl -X POST http://localhost:4242/refund-lesson \
//   -d payment_intent_id=pi_XXX \
//   -d amount=2500
//
// Returns
// If the refund is successfully created returns a JSON response of the format:
//
// {
//   refund: refund.id
// }
//
// If there was an error:
//  {
//    error: {
//        code: e.error.code,
//        message: e.error.message
//      }
//  }
app.post("/refund-lesson", async (req, res) => {
  const {payment_intent_id, amount } = req.body
  try {
    const refund = await stripe.refunds.create({
      payment_intent: payment_intent_id,
      amount }
    )

    res.json({refund: refund.id, amount})
  } catch (e) {
      const error = {
        code: e.code,
        message: e.message
      }
      res.json({ error })
  }
});

// Milestone 3: Managing account info
// Displays the account update page for a given customer
app.get("/account-update/:customer_id", async (req, res) => {
  try {
    const paymentMethod = await stripe.paymentMethods.list({
      customer: req.params.customer_id,
      type: 'card',
    });
    const p = paymentMethod.data.length ? paymentMethod.data[0] : null
    res.json(p)
  } catch (err) {
    res.json({ error: err })
  }
});

app.get("/payment-method/:customer_id", async (req, res) => {
  try {
    const paymentMethod = await  stripe.paymentMethods.retrieve(
      req.params.customer_id
    )
    res.json(paymentMethod)
  } catch (err) {
    res.json({ error: err })
  }
});


app.post("/payment-method", async (req, res) => {
  try {
    const customer = req.body.customer_id
    const new_payment_method_id = req.body.new_payment_method

    const paymentMethodsList = await stripe.paymentMethods.list({
      customer,
      type: 'card',
    });

    paymentMethodsList.data.forEach(async (m) => {
      if (m.id !== new_payment_method_id) {
        await stripe.paymentMethods.detach(m.id);
      }
    })

    const paymentMethod = await  stripe.paymentMethods.retrieve(
      new_payment_method_id
    )

    res.json(paymentMethod)
  } catch (err) {
    res.json({ error: err })
  }
});


app.post("/update-payment-details/:customer_id", async (req, res) => {
  const email = req.body.email;
  const name = req.body.name;
  let existingCustomerSearch = null
  
  if (email?.length) {
    existingCustomerSearch = await stripe.customers.list(
      {
        email: `${email}`
      }
    )
  }

  if (existingCustomerSearch?.data?.length) {
    res.send({ status: 304, message: 'Customer email already exists!'})
    return
  }

  try {
    const name = req.body.name
    const customer = req.body.customerId
    const metadata = req.body.metadata || {}
    const paymentMethodId = req.body.paymentMethod

    const billingPayload = {}
    if (email?.length) billingPayload = { ...billingPayload, email }
    if (name?.length) billingPayload = { ...billingPayload, name }
    const paymentMethod = await stripe.paymentMethods.update(paymentMethodId,
      { billing_details: billingPayload }
    )
    
    // await stripe.paymentMethods.detach(paymentMethodId)

    const payload = {}
    if (email?.length) payload = { ...payload, email }
    if (name?.length) payload = { ...payload, name }
    if (metadata) payload = { ...payload, metadata }
    const updated = await stripe.customers.update(
      customer, {
        ...payload,
        invoice_settings: {
          default_payment_method: paymentMethod.id,
        },
      })
      res.json(updated)
    } catch (e) {
      res.json(e)
    }
});

// Handle account updates
app.post("/account-update", async (req, res) => {
  // TODO: Handle updates to any of the customer's account details
  const customerId = req.body.customerId
  const email = req.body.email
  const name = req.body.name
  const lesson = req.body.lesson

  const existingCustomerSearch = null
  if (email?.length) {
    existingCustomerSearch = await stripe.customers.search(
      {
        query: `email:\'${email}\'`,
      }
    )
  }

  if (existingCustomerSearch?.data?.length) {
    res.send({ status: 304, message: 'Customer email already exists!'})
  } else {
    const customer = await stripe.customers.update(
      customerId,
      name,
      email
    );
    
    res.json(
      customer
    )
  }
});

// Milestone 3: '/delete-account'
// Deletes a customer object if there are no uncaptured payment intents for them.
//
// Parameters:
//   customer_id: the id of the customer to delete
//
// Example request
//   curl -X POST http://localhost:4242/delete-account/:customer_id \
//
// Returns 1 of 3 responses:
// If the customer had no uncaptured charges and was successfully deleted returns the response:
//   {
//        deleted: true
//   }
//
// If the customer had uncaptured payment intents, return a list of the payment intent ids:
//   {
//     uncaptured_payments: ids of any uncaptured payment intents
//   }
//
// If there was an error:
//  {
//    error: {
//        code: e.error.code,
//        message: e.error.message
//      }
//  }
//
app.post("/delete-account/:customer_id", async (req, res) => {
  try {
    const customer = req.params.customer_id

    const payments = await stripe.paymentIntents.list({
      customer
    });

    const succeeded = []
    const uncaptured_payments = payments.data.reduce((acc, p) => {
      if (p.status === 'requires_capture') {
        acc = [...acc, p.id]
      } else if (p.status === 'succeeded') {
        succeeded.push(p.id)
      }
      return acc
    }, [])

    if (succeeded.length) {
      const deletion = await stripe.customers.del(
        customer
      )
      if (deletion) {
        res.json({ deleted: deletion.deleted })
      } else {
        throw new Error(`cannot delete: ${customer}`)
      }
    } else if (uncaptured_payments?.length) {
      res.json({ uncaptured_payments })
    } else {
      const deletion = await stripe.customers.del(
        customer
      )
      if (deletion) {
        res.json({ deleted: deletion.deleted })
      } else {
        throw new Error(`cannot delete: ${customer}`)
      }
    }
  } catch (e) {
      const error = {
        code: e.code,
        message: e.message
      }
      res.json({ error })
  }
});


// Milestone 4: '/calculate-lesson-total'
// Returns the total amounts for payments for lessons, ignoring payments
// for videos and concert tickets, ranging over the last 36 hours.
//
// Example call: curl -X GET http://localhost:4242/calculate-lesson-total
//
// Returns a JSON response of the format:
// {
//      payment_total: Total before fees and refunds (including disputes), and excluding payments
//         that haven't yet been captured.
//      fee_total: Total amount in fees that the store has paid to Stripe
//      net_total: Total amount the store has collected from payments, minus their fees.
// }
//

app.get("/calculate-lesson-total", async (req, res) => {
    try {
        const d = new Date();
        d.setHours(d.getHours() - 36);
        let pi = await stripe.paymentIntents.list({
          created: { 
            gte: d
          },
          limit: 100,
          expand: ['data.latest_charge.balance_transaction']
        })
        pi = pi.data.filter(p => p.status !== 'requires_capture' && p.metadata.type === 'lessons-payment')

        let fee_total = 0
        const payment_total = pi.reduce((acc, p) => {
          fee_total += p.latest_charge?.balance_transaction?.fee || 0
          return acc = acc + p.amount_received
        }, 0)

        // Sum net total
        const net_total = (payment_total - fee_total)

        res.json({payment_total, fee_total, net_total})
   
    } catch (e) {
      const error = {
        code: e.code,
        message: e.message
      }
      res.json({ error })
    }
});


// Milestone 4: '/find-customers-with-failed-payments'
// Returns any customer who meets the following conditions:
// The last attempt to make a payment for that customer failed.
// The payment method associated with that customer is the same payment method used
// for the failed payment, in other words, the customer has not yet supplied a new payment method.
//
// Example request: curl -X GET http://localhost:4242/find-customers-with-failed-payments
//
// Returns a JSON response with information about each customer identified and
// their associated last payment
// attempt and, info about the payment method on file.
// [
//   {
//     customer: {
//       id: customer.id,
//       email: customer.email,
//       name: customer.name,
//     },
//     payment_intent: {
//       created: created timestamp for the payment intent
//       description: description from the payment intent
//       status: the status of the payment intent
//       error: the error returned from the payment attempt
//     },
//     payment_method: {
//       last4: last four of the card stored on the customer
//       brand: brand of the card stored on the customer
//     }
//   },
//   {},
//   {},
// ]

app.get("/find-customers-with-failed-payments", async (req, res) => {
  try {
    const d = new Date();
    d.setHours(d.getHours() - 36);
    let failed = []
    let previousSearch
    let listResult = { has_more: true }
    let query = {
      expand: ['data.latest_charge', 'data.customer', 'data.payment_method'],
      limit: 100, // default
      created: { 
        gte: d
      }
    }

    async function searchPaymentsList (query) {
      previousSearch = { ...query }
      const result = await stripe.paymentIntents.list(query)
      listResult = result
      failed = failed.concat(listResult.data)
      query.starting_after = failed[failed.length-1]?.id
      return result
    }
    
    await searchPaymentsList(query)
    while (listResult.has_more) {
      if (query?.starting_after !== previousSearch.starting_after) {
        await searchPaymentsList(query)
      }
    }
    
    failed = failed.filter(pi => pi.status === "requires_payment_method")

    
    let result = []
    await Promise.all(failed.map(async (pi) => {
      const customer = pi.customer
      const charges = pi.charges.data[0]
      const outcome = charges.outcome
      const brand =  charges?.payment_method_details.card.brand
      const last4 = charges?.payment_method_details.card.last4
      result.push({
        customer: {
          id: customer?.id,
          email: customer?.email,
          name: customer?.name,
        },
        payment_intent: {
          created: pi.created,
          description: pi.description,
          status: charges.status,
          error: outcome?.type
        },
        payment_method: {
          brand,
          last4
        }
      })
    }))

    res.json(result)
   } catch (e) {
    const error = {
      code: e.code,
      message: e.message
    }
    res.json({ error })
  }

});

function errorHandler(err, req, res, next) {
  res.status(500).send({ error: { message: err.message } });
}

app.use(errorHandler);

app.listen(4242, () => console.log(`Node server listening on port http://localhost:${4242}`));

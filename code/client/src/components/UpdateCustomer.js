import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import React, { useEffect, useState } from "react";
import CardSetupForm from "./CardSetupForm";

const UpdateCustomer = ({
  customerId,
  customerName,
  customerEmail,
  onSuccessfulConfirmation,
}) => {
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState("");
  const [oldEmail, setOldEmail] = useState(customerEmail);
  const [oldName, setOldName] = useState(customerName);
  const [email, setEmail] = useState(customerEmail);
  const [name, setName] = useState(customerName);
  const [stripePromise, setStripePromise] = useState(null);
  const [loadPaymentElement, setLoadPaymentElement] = useState(false);
  const [, setExistingCustomer] = useState(null);
  const [succeeded, setSucceeded] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const selected = 1;
  const appearance = {}
  // TODO: Integrate Stripe

  //Get info to load page, User payment information, config API route in package.json "proxy"
  useEffect(() => {
    if (email !== "" && name !== "") {
      setProcessing(false);
    }
    async function setUp() {
      const { key } = await fetch("http://localhost:4242/config").then((res) => res.json());
      setStripePromise(loadStripe(key));
    
      let payload = {}
      if (email?.length) payload = {...payload, email };
      if (name?.length) payload = {...payload, name };  
      const intent = await fetch('http://localhost:4242/create-setup-intent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...payload,
            customerId
          })
      });
      const data = await intent.json()
      localStorage.setItem('customer', JSON.stringify(data.customer))
      setExistingCustomer(null)
      setClientSecret(data.clientSecret)
    }

    setUp();
  }, []);

  const handleClick = async () => {
    try {
      if ((!email?.length && !name?.length) || (name === oldName && email === oldEmail)) {
        setLoadPaymentElement(true)
        setSucceeded(true)
        return
      }
  
      const response = await fetch(`http://localhost:4242/update-payment-details/${customerId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            customerId,
            name,
            email,
            lesson: `${selected}`
          })
      });

      const update = await response.json()

      if (update.status === 304) {
        setError(update.message)
        return 
      }
      setEmail(update.email);
      setName(update.name);
      setOldEmail(update.email);
      setOldName(update.name);
      setLoadPaymentElement(true)
      onSuccessfulConfirmation(update.id, update)
      localStorage.setItem('customer', JSON.stringify(update))
    } catch (e) {
      setExistingCustomer(true)
      setError(e.message)
      setLoadPaymentElement(true)
    }
  };

  return (
    <div className="lesson-form">
      {!succeeded ? (
        <div className="lesson-desc">
          <h3>Update your Payment details</h3>
          <div className="lesson-info">
            Fill out the form below if you'd like to us to use a new card.
          </div>
          <div className="lesson-grid">
            <div className="lesson-inputs">
              <div className="lesson-input-box">
                <input
                  type="text"
                  id="name"
                  placeholder="Name"
                  autoComplete="cardholder"
                  className="sr-input"
                  value={name || ''}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="lesson-input-box">
                <input
                  type="text"
                  id="email"
                  placeholder="Email"
                  autoComplete="cardholder"
                  value={email || ''}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            {error ? (
              <div id="card-errors">
                <div
                  className="sr-field-error"
                  id="customer-exists-error"
                  role="alert"
                >
                  {error}
                </div>
              </div>
            ) : null}
          </div>
          {!loadPaymentElement && (
            <button
              id="checkout-btn"
              disabled={processing}
              onClick={handleClick}
            >
              {processing ? (
                <div className="spinner" id="spinner"></div>
              ) : (
                <span id="button-text">Update Payment Method</span>
              )}
            </button>
          )}
          <div className="lesson-legal-info">
            Your card will not be charged. By registering, you hold a session
            slot which we will confirm within 24 hrs.
          </div>
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{appearance, clientSecret}}>
          <CardSetupForm
            selected={selected}
            mode="update"
            learnerEmail={email}
            learnerName={name}
            customerId={customerId}
            onSuccessfulConfirmation={onSuccessfulConfirmation}
          />
        </Elements>
      )}
    </div>
  );
};
export default UpdateCustomer;

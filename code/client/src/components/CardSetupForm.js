import {
  PaymentElement, useElements, useStripe
} from "@stripe/react-stripe-js";
import React, { useState } from "react";
import SignupComplete from "./SignupComplete";
  
  const CardSetupForm = (props) => {
    const { selected, clientSecret, mode, details, customerId, learnerEmail, learnerName, onSuccessfulConfirmation } =
      props;
    const [paymentSucceeded, setPaymentSucceeded] = useState(false);
    const [error, setError] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [last4, setLast4] = useState("");
    const stripe = useStripe();
    const elements = useElements();
    const [learnerEmailUpdated, setLearnerEmailUpdated] = useState(learnerEmail);
    const [learnerNameUpdated, setLearnerNameUpdated] =  useState(learnerName);
    const [existingCustomer, setExistingCustomer] = useState(null);

    const handleClick = async (event) => {
      event.preventDefault()
      // Trigger form validation and wallet collection
      const {error: submitError} = await elements.submit();
      if (submitError) {
        setError(submitError.message);
        return;
      }

      if (!stripe || !elements) {
        // Stripe.js hasn't yet loaded.
        // Make sure to disable form submission until Stripe.js has loaded.
        return null;
      }

      setProcessing(true)

      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.href}`,
          payment_method_data: {
            billing_details: {
              name: learnerName,
              email: learnerEmail
            }
          },
        },
        redirect: 'if_required'
      });
      
      if (setupIntent) {
        setExistingCustomer({ id: customerId, email: learnerEmail })
      } else {
        setExistingCustomer(null)
      }
  
      if (error) {
        // This point will only be reached if there is an immediate error when
        // confirming the payment. Show error to your customer (for example, payment
        // details incomplete)
        setError(error.message);
      } else {
        if (setupIntent && setupIntent.payment_method_types.includes('card')) {
          try {
            let result = await fetch(`http://localhost:4242/payment-method/${setupIntent.payment_method}`, {
              method: 'GET',
              headers: { 
                'Content-Type': 'application/json'
              }
            })
            result = await result.json()
            setLast4(result.card.last4)
            setPaymentSucceeded(true)
          } catch (e) {
            setError(e.message)
          }
        }
      }

      setProcessing(false)
    };

    const handleChange = async(value, field) => {
      switch(field) {
        case 'learnerName':
          setLearnerNameUpdated(value);
          break;
        case 'learnerEmail':
          setLearnerEmailUpdated(value)
          break;
        default: 
      }
    }
  
    if (selected === -1) return null;
    if (paymentSucceeded) return (
      <div className={`lesson-form`}>
        <SignupComplete
          active={paymentSucceeded}
          email={learnerEmail}
          last4={last4}
          customer_id={customerId}
        />
      </div>
    )
    return (
      // The actual checkout form, inside the !paymentSucceeded clause
        <div className={`lesson-form`}>
            <div className={`lesson-desc`}>
              <h3>Registration details</h3>
              <div id="summary-table" className="lesson-info">
                {details}
              </div>
              <div className="lesson-legal-info">
                Your card will not be charged. By registering, you hold a session
                slot which we will confirm within 24 hrs.
              </div>
              <div className="lesson-grid">
                <div className="lesson-inputs">
                <form>
                  <div className="lesson-input-box first">
                    <label>Name</label>
                    <input
                      type="text"
                      id="name"
                      value={learnerNameUpdated}
                      placeholder="Name"
                      autoComplete="cardholder"
                      className="sr-input"
                      onChange={(e) => handleChange(e.target.value, "learnerName")}
                    />
                  </div>
                  <div className="lesson-input-box middle">
                    <label>Email</label>
                    <input
                      type="text"
                      id="email"
                      value={learnerEmailUpdated}
                      placeholder="Email"
                      autoComplete="cardholder"
                      onChange={(e) => handleChange(e.target.value, "learnerEmail")}
                    />
                    </div>
                    <div className="lesson-payment-element">
                      <PaymentElement id="payment-element" />
                    </div>
                    <button id="submit"  
                        disabled={!learnerNameUpdated || !learnerEmailUpdated || processing }
                        onClick={handleClick}>
                          {processing ? (
                        <div className="spinner" id="spinner"></div>
                      ) : (
                        <span id="button-text">Submit</span>
                      )}
                    </button>
                  </form>
                </div>
              </div>
              {error && (
                <div className="sr-field-error" id="card-errors" role="alert">
                  <div className="card-error" role="alert">
                    {error}
                  </div>
                </div>
              )}
            </div>
        </div>
    )
  };
  export default CardSetupForm;
  
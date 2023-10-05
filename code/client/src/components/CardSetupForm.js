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
    const [, setExistingCustomer] = useState(null);
    const [email] = useState(learnerEmail);
    const [name] = useState(learnerName);
    

    const handleClick = async (event) => {
      event.preventDefault()
      // Trigger form validation and wallet collection
      const {error: submitError} = await elements.submit();
      if (submitError) {
        setError(submitError.message);
        return;
      }

      if (!stripe || !elements) {
        return null;
      }

      setProcessing(true)
      let result = null
      let billing_details = {}
      if (email?.length) billing_details = {...billing_details, email }
      if (name?.length) billing_details = {...billing_details, name }
      let payment_method_data = {}
      if (Object.keys(billing_details).length) {
        payment_method_data.billing_details = billing_details
      }

      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.href}`,
          payment_method_data
        },
        redirect: 'if_required'
      });

      if (error) {
        setError(error.message);
        setProcessing(false)
        return
      }
        
      if (setupIntent) {
        setExistingCustomer({ id: customerId, email: learnerEmail })
      } else {
        setExistingCustomer(null)
      }

      if (mode === 'update') {
        try {
          let result = null
          result = await fetch(`http://localhost:4242/payment-method`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              customer_id: customerId,
              new_payment_method: setupIntent.payment_method
            })
          })
          if (result.error) {
            setError(result.error.message)
            setProcessing(false)
            return 
          }
          result = await result.json()
          onSuccessfulConfirmation(customerId, result)
          setLast4(result.card.last4)
          setPaymentSucceeded(true)
        } catch (e) {
          setError(e.message)
        }
      } else if (setupIntent && setupIntent.payment_method_types.includes('card')) {
          try {
            result = await fetch(`http://localhost:4242/payment-method/${setupIntent.payment_method}`, {
              method: 'GET',
              headers: { 
                'Content-Type': 'application/json'
              }
            })
            if (result.error) {
              setError(result.error.message)
              setProcessing(false)
              return 
            }
            result = await result.json()
            setLast4(result.card.last4)
            setPaymentSucceeded(true)
          } catch (e) {
            setError(e.message)
          }
        }
      setProcessing(false)
    };
  
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
                    <div className="lesson-payment-element">
                      <PaymentElement id="payment-element" />
                    </div>
                    <button id="submit"  
                        disabled={processing }
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
  
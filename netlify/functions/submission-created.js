// netlify/functions/submission-created.js
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch'; // npm install node-fetch

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  NETLIFY_ADMIN_ACCESS_TOKEN,
  SITE_ID // Netlify provides this automatically
} = process.env;

let supabase;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Helper to construct redirect URL for error/success messages on the signup page
function getErrorRedirectUrl(baseUrl, errorMessage) {
  const url = new URL(baseUrl); // Assuming baseUrl is like "/signup/"
  url.searchParams.set('error', errorMessage);
  return url.toString();
}
function getSuccessRedirectUrl(baseUrl, successMessage) {
  const url = new URL(baseUrl);
  url.searchParams.set('message', successMessage);
  return url.toString();
}


export const handler = async (event) => {
  if (!supabase || !NETLIFY_ADMIN_ACCESS_TOKEN || !SITE_ID) {
    console.error('submission-created: Missing required environment variables.');
    // Cannot redirect here, as Netlify already served the form's action page.
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error for signup processing.' }) };
  }

  const { payload } = JSON.parse(event.body);
  const formData = payload.data;
  const formName = payload.form_name;

  // IMPORTANT: Only process submissions for your 'unified-signup' form
  if (formName !== 'unified-signup') {
    console.log(`submission-created: Submission for form '${formName}', not 'unified-signup'. Skipping.`);
    return { statusCode: 200, body: `Ignoring submission for ${formName}.` };
  }

  console.log('submission-created: Processing "unified-signup" form data:', formData);

  const { name, email, password, username, phone, subscription_plan } = formData;

  if (!name || !email || !password || !username || !subscription_plan) {
    console.error('submission-created: Required fields missing from "unified-signup" submission.');
    // This error won't be directly visible to the user on the success page.
    // It's primarily for server-side logging. Consider more robust error feedback if needed.
    return { statusCode: 400, body: JSON.stringify({ error: 'Required fields missing in submission.' }) };
  }

  let netlifyIdentityUser;
  const identityApiUrl = `https://api.netlify.com/api/v1/sites/${SITE_ID}/users`;
  const userSignupData = {
    email: email,
    password: password,
    user_metadata: {
      full_name: name,
      // You can optionally store username here too if Netlify Identity is your primary source for it
      // custom_username: username, 
    },
    // Set email_confirm to true to force email confirmation.
    // If your Netlify Identity settings already enforce confirmation, this can be omitted or true.
    // Set to false to auto-confirm (use with caution).
    email_confirm: true,
  };

  try {
    console.log(`submission-created: Attempting to create Netlify Identity user for ${email}`);
    const identityResponse = await fetch(identityApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NETLIFY_ADMIN_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(userSignupData),
    });

    const identityResponseData = await identityResponse.json();

    if (!identityResponse.ok) {
      console.error('submission-created: Netlify Identity user creation FAILED.', identityResponse.status, identityResponseData);
      let userMessage = 'Failed to create user account with our identity provider.';
      if (identityResponse.status === 409 || (identityResponseData.msg && identityResponseData.msg.includes("already exists")) || (identityResponseData.message && identityResponseData.message.includes("already exists"))) {
        userMessage = 'An account with this email already exists. Please try logging in.';
      } else if (identityResponseData.errors) {
        // Try to get a more specific message from Netlify's error response
        const firstError = identityResponseData.errors[0];
        if (firstError && firstError.message) userMessage = firstError.message;
      }
      // This function's return is primarily for Netlify's internal logging of the event.
      // The user has already been shown the form's "action" page.
      // For better UX, you might consider client-side validation before submission,
      // or a more complex setup where the form submits via JS to this function directly
      // and handles the response to show errors on the same page.
      // Since the requirement was "without JS for form submission", this is a limitation.
      return { statusCode: identityResponse.status, body: JSON.stringify({ error: userMessage, details: identityResponseData }) };
    }

    netlifyIdentityUser = identityResponseData;
    console.log('submission-created: Netlify Identity user created successfully:', netlifyIdentityUser.id);

    // Step 2: Insert data into Supabase
    console.log(`submission-created: Inserting profile into Supabase for Netlify ID ${netlifyIdentityUser.id}`);
    const { data: supabaseProfile, error: supabaseError } = await supabase
      .from('user_profiles')
      .insert({
        netlify_id: netlifyIdentityUser.id,
        email: netlifyIdentityUser.email, // Use email from Identity response
        name: name, 
        username: username,
        phone: phone || null,
        subscription_plan: subscription_plan,
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('submission-created: Supabase insert FAILED:', supabaseError);
      // CRITICAL: User in Netlify Identity, but Supabase failed.
      // This needs manual intervention or a cleanup mechanism.
      // Log as much detail as possible.
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'User account created with identity provider, but profile data could not be saved to our database. Please contact support.', 
          netlify_user_id: netlifyIdentityUser.id, // For tracing
          supabase_error_details: supabaseError.message 
        }),
      };
    }

    console.log('submission-created: Supabase profile created successfully:', supabaseProfile);
    // Function execution was successful. Netlify has already shown the form's action page.
    return { statusCode: 200, body: JSON.stringify({ message: 'User processing complete.' }) };

  } catch (error) {
    console.error('submission-created: Unhandled exception in handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected server error occurred during signup.', details: error.message }),
    };
  }
};

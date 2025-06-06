// netlify/functions/submission-created.js
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  NETLIFY_ADMIN_ACCESS_TOKEN,
  SITE_ID 
} = process.env;

// --- Enhanced Startup Logging ---
console.log('Function starting up...');
console.log('Is SUPABASE_URL set?', !!SUPABASE_URL);
console.log('Is SUPABASE_SERVICE_KEY set?', !!SUPABASE_SERVICE_KEY);
console.log('Is NETLIFY_ADMIN_ACCESS_TOKEN set?', !!NETLIFY_ADMIN_ACCESS_TOKEN);
console.log('Is SITE_ID set?', !!SITE_ID);
// ------------------------------

let supabase;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async (event) => {
  if (!supabase || !NETLIFY_ADMIN_ACCESS_TOKEN || !SITE_ID) {
    const missingVars = [
        !supabase && "Supabase Client",
        !NETLIFY_ADMIN_ACCESS_TOKEN && "NETLIFY_ADMIN_ACCESS_TOKEN",
        !SITE_ID && "SITE_ID"
    ].filter(Boolean).join(', ');
    console.error(`submission-created: Missing required environment variables: ${missingVars}.`);
    return { statusCode: 500, body: JSON.stringify({ error: `Server configuration error. Missing: ${missingVars}` }) };
  }

  const { payload } = JSON.parse(event.body);
  const formData = payload.data;
  const formName = payload.form_name;

  if (formName !== 'unified-signup') {
    return { statusCode: 200, body: `Ignoring submission for ${formName}.` };
  }

  console.log('submission-created: Processing "unified-signup" form data:', formData);

  const { name, email, password, username, phone, subscription_plan } = formData;

  if (!name || !email || !password || !username || !subscription_plan) {
    console.error('submission-created: Required fields missing from submission.');
    return { statusCode: 400, body: JSON.stringify({ error: 'Required fields missing in submission.' }) };
  }

  const identityApiUrl = `https://api.netlify.com/api/v1/sites/${SITE_ID}/users`;
  const userSignupData = {
    email: email,
    password: password,
    user_metadata: { full_name: name },
    email_confirm: true, // This will send a confirmation email
  };

  try {
    console.log(`submission-created: Calling Netlify Identity API at ${identityApiUrl}`);
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
      console.error('submission-created: Netlify Identity user creation FAILED.', {
        status: identityResponse.status,
        statusText: identityResponse.statusText,
        responseData: identityResponseData
      });
      const userMessage = identityResponseData.message || identityResponseData.msg || 'Failed to create user account.';
      return { statusCode: identityResponse.status, body: JSON.stringify({ error: userMessage, details: identityResponseData }) };
    }

    const netlifyIdentityUser = identityResponseData;
    console.log('submission-created: Netlify Identity user created successfully:', netlifyIdentityUser.id);

    console.log(`submission-created: Inserting profile into Supabase for Netlify ID ${netlifyIdentityUser.id}`);
    const { data: supabaseProfile, error: supabaseError } = await supabase
      .from('user_profiles')
      .insert({
        netlify_id: netlifyIdentityUser.id,
        email: netlifyIdentityUser.email,
        name: name, 
        username: username,
        phone: phone || null,
        subscription_plan: subscription_plan,
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('submission-created: Supabase insert FAILED:', supabaseError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Account created, but profile data could not be saved. Please contact support.', 
          details: supabaseError.message 
        }),
      };
    }

    console.log('submission-created: Supabase profile created successfully:', supabaseProfile);
    return { statusCode: 200, body: JSON.stringify({ message: 'User processing complete.' }) };

  } catch (error) {
    console.error('submission-created: Unhandled exception in handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected server error occurred during signup.', details: error.message }),
    };
  }
};

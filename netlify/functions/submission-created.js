// netlify/functions/submission-created.js
// A final, simplified test to isolate the Netlify Identity user creation API call.
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  NETLIFY_ADMIN_ACCESS_TOKEN,
  SITE_ID 
} = process.env;

let supabase;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async (event) => {
  if (!supabase || !NETLIFY_ADMIN_ACCESS_TOKEN || !SITE_ID) {
    console.error('Final-Test: Missing required environment variables.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error.' }) };
  }

  const { payload } = JSON.parse(event.body);
  const formName = payload.form_name;

  if (formName !== 'unified-signup') {
    return { statusCode: 200, body: `Ignoring submission for ${formName}.` };
  }

  console.log('Final-Test: Processing "unified-signup" form data:', payload.data);

  // Use a hardcoded, unique email for this test to ensure it's not a data issue.
  // Generate a new random part each time to avoid "user already exists" errors during testing.
  const randomId = Math.random().toString(36).substring(2, 10);
  const testEmail = `test-user-${randomId}@example.com`;
  const testPassword = `password-${randomId}`; // A secure, random password

  const identityApiUrl = `https://api.netlify.com/api/v1/sites/${SITE_ID}/users`;
  const userSignupData = {
    email: testEmail,
    password: testPassword,
    user_metadata: {
      full_name: "API Test User",
    },
    email_confirm: true,
  };

  const trimmedAdminToken = NETLIFY_ADMIN_ACCESS_TOKEN.trim();
  const apiHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${trimmedAdminToken}`,
  };

  try {
    console.log(`Final-Test: Attempting to create user with hardcoded data: ${testEmail}`);
    const identityResponse = await fetch(identityApiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(userSignupData),
    });

    const identityResponseData = await identityResponse.json();

    if (!identityResponse.ok) {
      console.error('Final-Test: Netlify Identity user creation FAILED.', {
        status: identityResponse.status,
        statusText: identityResponse.statusText,
        responseData: identityResponseData
      });
      // If this fails with 401, you have isolated the problem.
      return { 
        statusCode: identityResponse.status, 
        body: JSON.stringify({ 
          message: "FINAL TEST FAILED: The API call to create a user was rejected.",
          details: identityResponseData 
        }) 
      };
    }

    console.log('Final-Test: Netlify Identity user creation SUCCEEDED. Netlify User ID:', identityResponseData.id);

    // If we get here, the token works! We can proceed to save to Supabase.
    // We use the actual form data for the Supabase insert.
    const { name, email, username, phone, subscription_plan } = payload.data;
    const { data: supabaseProfile, error: supabaseError } = await supabase
      .from('user_profiles')
      .insert({
        netlify_id: identityResponseData.id,
        email: email, // Use the original email from the form
        name: name, 
        username: username,
        phone: phone || null,
        subscription_plan: subscription_plan,
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('Final-Test: Supabase insert FAILED after successful user creation:', supabaseError);
      return { statusCode: 500, body: JSON.stringify({ error: 'User account created, but profile data could not be saved.' }) };
    }

    console.log('Final-Test: Supabase profile created successfully.');
    return { statusCode: 200, body: JSON.stringify({ message: 'FINAL TEST SUCCEEDED: User processing complete.' }) };

  } catch (error) {
    console.error('Final-Test: Unhandled exception in handler:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'An unexpected server error occurred during signup.'}) };
  }
};

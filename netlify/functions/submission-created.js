// netlify/functions/submission-created.js
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NETLIFY_ADMIN_ACCESS_TOKEN = process.env.NETLIFY_ADMIN_ACCESS_TOKEN;
const NETLIFY_SITE_ID = process.env.SITE_ID; // Provided by Netlify build environment

let supabase;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async (event) => {
  if (!supabase || !NETLIFY_ADMIN_ACCESS_TOKEN || !NETLIFY_SITE_ID) {
    console.error('submission-created: Missing required environment variables.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error.' }) };
  }

  const { payload } = JSON.parse(event.body);
  const formData = payload.data;

  if (payload.form_name !== 'unified-signup') {
    console.log(`submission-created: Ignoring submission for form '${payload.form_name}'.`);
    return { statusCode: 200, body: 'Submission not for unified-signup form.' };
  }

  console.log('submission-created: Processing unified-signup:', formData);

  const { name, email, password, username, phone, subscription_plan } = formData;

  if (!name || !email || !password || !username || !subscription_plan) {
    console.error('submission-created: Missing required fields.');
    // For a better UX, you'd redirect to the form with an error message.
    // Netlify's default behavior is to show the action page.
    // Returning 400 might show a generic Netlify error page for the form post.
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: name, email, password, username, or subscription plan.' }),
    };
  }

  let netlifyIdentityUser;
  try {
    // Step 1: Create user in Netlify Identity
    console.log(`submission-created: Creating Netlify Identity user for ${email}`);
    const identityApiUrl = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/users`;
    const identityResponse = await fetch(identityApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NETLIFY_ADMIN_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        email: email,
        password: password,
        user_metadata: {
          full_name: name,
          // You could store username here too if desired, e.g., for display in Netlify UI
          // custom_username: username 
        },
        // Set email_confirm to true to send a confirmation email.
        // Set to false to auto-confirm the user (use with caution).
        // email_confirm: false, // Example: auto-confirm
      }),
    });

    if (!identityResponse.ok) {
      const errorData = await identityResponse.json();
      console.error('submission-created: Netlify Identity user creation FAILED.', identityResponse.status, errorData);
      let userMessage = 'Failed to create user account.';
      if (identityResponse.status === 409 || (errorData.msg && errorData.msg.includes("already exists")) || (errorData.message && errorData.message.includes("already exists"))) {
        userMessage = 'An account with this email already exists.';
      }
      // Ideally, redirect back to the form with an error query param.
      // e.g., return { statusCode: 302, headers: { Location: `/signup/?error=${encodeURIComponent(userMessage)}` } };
      // For now, returning an error status. Netlify might show a generic error.
      return { statusCode: identityResponse.status, body: JSON.stringify({ error: userMessage, details: errorData }) };
    }

    netlifyIdentityUser = await identityResponse.json();
    console.log('submission-created: Netlify Identity user created:', netlifyIdentityUser.id);

    // Step 2: Insert data into Supabase
    const { data: supabaseProfile, error: supabaseError } = await supabase
      .from('user_profiles')
      .insert({
        netlify_id: netlifyIdentityUser.id,
        email: netlifyIdentityUser.email,
        name: name, // Storing the full name from the form
        username: username,
        phone: phone || null,
        subscription_plan: subscription_plan,
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('submission-created: Supabase insert FAILED:', supabaseError);
      // CRITICAL: User created in Netlify Identity, but Supabase failed.
      // Requires compensation: attempt to delete Netlify Identity user or log for manual fix.
      // For now, we log and return an error. The user will likely see the form's success page
      // but their Supabase profile won't exist.
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Account created, but profile data could not be saved.', details: supabaseError.message }),
      };
    }

    console.log('submission-created: Supabase profile created:', supabaseProfile);
    // Netlify will redirect to the form's 'action' URL (e.g., /signup-success/)
    // or show its default success message if no action is specified.
    // This function's return value for a 200 doesn't directly control that redirection for HTML forms.
    return { statusCode: 200, body: JSON.stringify({ message: 'Signup successful.' }) };

  } catch (error) {
    console.error('submission-created: Unhandled exception:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected error occurred.', details: error.message }),
    };
  }
};

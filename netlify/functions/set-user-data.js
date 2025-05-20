// netlify/functions/set-user-data.js

// Import the Supabase client library
import { createClient } from '@supabase/supabase-js';

// Retrieve Supabase URL and Service Role Key from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Check if Supabase credentials are set
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Supabase URL or Service Key is not set. Functions may not work correctly.');
  // Note: This check runs at deployment/initialization time.
  // The handler should also check to ensure it doesn't proceed if they are missing.
}

// Initialize the Supabase client
// This client will be reused for all invocations of this function in this instance.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    // Supabase client options, e.g., to disable auto-refreshing of tokens if not needed
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

// Handler function for the Netlify Function
export const handler = async (event, context) => {
  // Ensure Supabase URL and Service Key are available at runtime
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase environment variables not available at runtime.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: Supabase credentials missing.' }),
    };
  }

  // Ensure the request is a POST request
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Get the authenticated user from Netlify Identity (passed in context)
  const { user } = context.clientContext;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: No user context.' }) };
  }

  // Parse the request body to get additional data (e.g., username)
  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request: Invalid JSON.' }) };
  }
  
  const { username } = requestBody;

  if (!username || typeof username !== 'string' || username.trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Username is required and must be a non-empty string.' }) };
  }

  const netlify_id = user.sub; // 'sub' is the standard JWT field for subject (user ID)
  const email = user.email;   // User's email from Netlify Identity

  try {
    // Check if a user profile with this netlify_id already exists
    const { data: existingProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id') // Only need to check for existence
      .eq('netlify_id', netlify_id)
      .maybeSingle(); // Returns one record or null if not found, not an error for 0 rows.

    // Handle potential errors during the select query, excluding "0 rows" which is fine.
    if (selectError && selectError.code !== 'PGRST116') { // PGRST116: "The result contains 0 rows"
      console.error('Supabase select error:', selectError);
      throw selectError;
    }

    let userProfileData;
    const currentTime = new Date().toISOString();

    if (existingProfile) {
      // User profile exists, update it
      const { data: updatedData, error: updateError } = await supabase
        .from('user_profiles')
        .update({
          email: email, // Keep email in sync with Netlify Identity
          username: username.trim(),
          updated_at: currentTime,
        })
        .eq('netlify_id', netlify_id)
        .select('username, email, netlify_id') // Select the fields you want to return
        .single(); // Expects a single row to be returned after update

      if (updateError) {
        console.error('Supabase update error:', updateError);
        throw updateError;
      }
      userProfileData = updatedData;
      console.log(`User profile for ${netlify_id} updated in Supabase.`);
    } else {
      // User profile does not exist, create a new one
      const { data: insertedData, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          netlify_id: netlify_id,
          email: email,
          username: username.trim(),
          created_at: currentTime, // Set explicitly, though DB default would also work
          updated_at: currentTime, // Set explicitly
        })
        .select('username, email, netlify_id') // Select the fields you want to return
        .single(); // Expects a single row to be returned after insert

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw insertError;
      }
      userProfileData = insertedData;
      console.log(`User profile for ${netlify_id} created in Supabase.`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User data processed successfully.',
        profile: userProfileData,
      }),
    };

  } catch (error) {
    console.error('Error processing user data with Supabase:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process user data.', details: error.message || 'Unknown error' }),
    };
  }
};


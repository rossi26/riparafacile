// netlify/functions/set-user-data.js
import { createClient } from '@supabase/supabase-js';

export const handler = async (event, context) => {
  // Log environment variables to ensure they are present at runtime
  console.log('set-user-data: SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not Set');
  console.log('set-user-data: SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Not Set');

  // Ensure Supabase URL and Service Key are available at runtime
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('set-user-data: Supabase environment variables not available at runtime.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: Supabase credentials missing.' }),
    };
  }

  // Initialize Supabase client inside the handler for consistency and runtime variable access
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  // Ensure the request is a POST request
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Get the authenticated user from Netlify Identity (passed in context)
  const { user } = context.clientContext;
  if (!user) {
    console.warn('set-user-data: Unauthorized access attempt - no user context.');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: No user context.' }) };
  }

  // Parse the request body to get additional data (e.g., username)
  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
    console.log('set-user-data: Request body parsed:', requestBody);
  } catch (e) {
    console.error('set-user-data: Bad request: Invalid JSON.', e);
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request: Invalid JSON.' }) };
  }

  const { username } = requestBody;

  if (!username || typeof username !== 'string' || username.trim() === '') {
    console.error('set-user-data: Validation error: Username is required.');
    return { statusCode: 400, body: JSON.stringify({ error: 'Username is required and must be a non-empty string.' }) };
  }

  const netlify_id = user.sub;
  const email = user.email;
  console.log(`set-user-data: Processing profile for Netlify ID: ${netlify_id}, Email: ${email}, Username: ${username}`);

  try {
    // Check if a user profile with this netlify_id already exists
    const { data: existingProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id')
      .eq('netlify_id', netlify_id)
      .maybeSingle();

    // Handle potential errors during the select query, excluding "0 rows" which is fine.
    if (selectError && selectError.code !== 'PGRST116') { // PGRST116: "The result contains 0 rows"
      console.error('set-user-data: Supabase select error during existence check:', selectError);
      throw selectError;
    }

    let userProfileData;
    const currentTime = new Date().toISOString();

    if (existingProfile) {
      console.log(`set-user-data: Existing profile found for ${netlify_id}, attempting update.`);
      // User profile exists, update it
      const { data: updatedData, error: updateError } = await supabase
        .from('user_profiles')
        .update({
          email: email,
          username: username.trim(),
          updated_at: currentTime,
        })
        .eq('netlify_id', netlify_id)
        .select('username, email, netlify_id, created_at, updated_at') // Select all fields needed for client-side update
        .single();

      if (updateError) {
        console.error('set-user-data: Supabase update error:', updateError);
        throw updateError;
      }
      userProfileData = updatedData;
      console.log(`set-user-data: User profile for ${netlify_id} updated in Supabase.`, userProfileData);
    } else {
      console.log(`set-user-data: No existing profile for ${netlify_id}, attempting insert.`);
      // User profile does not exist, create a new one
      const { data: insertedData, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          netlify_id: netlify_id,
          email: email,
          username: username.trim(),
          created_at: currentTime,
          updated_at: currentTime,
        })
        .select('username, email, netlify_id, created_at, updated_at') // Select all fields needed for client-side update
        .single();

      if (insertError) {
        console.error('set-user-data: Supabase insert error:', insertError);
        throw insertError;
      }
      userProfileData = insertedData;
      console.log(`set-user-data: User profile for ${netlify_id} created in Supabase.`, userProfileData);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User data processed successfully.',
        profile: userProfileData,
      }),
    };

  } catch (error) {
    console.error('set-user-data: Error processing user data with Supabase:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process user data.', details: error.message || 'Unknown error' }),
    };
  }
};
// netlify/functions/get-user-data.js
import { createClient } from '@supabase/supabase-js';

export const handler = async (event, context) => {
  // Log environment variables to ensure they are present at runtime
  console.log('get-user-data: SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not Set');
  console.log('get-user-data: SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Not Set');

  // Ensure Supabase URL and Service Key are available at runtime
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('get-user-data: Supabase environment variables not available at runtime.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: Supabase credentials missing.' }),
    };
  }

  // Initialize Supabase client inside the handler to ensure it uses runtime environment variables
  // and to avoid potential issues with cold starts or global scope in some environments.
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  // Ensure the request is a GET request
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Get the authenticated user from Netlify Identity
  const { user } = context.clientContext;
  if (!user) {
    console.warn('get-user-data: Unauthorized access attempt - no user context.');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: You must be logged in to fetch user data.' }) };
  }

  const netlify_id = user.sub;
  console.log(`get-user-data: Attempting to fetch profile for Netlify ID: ${netlify_id}`);

  try {
    // Query Supabase for the user data using the netlify_id
    const { data: userProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id, email, username, phone, subscription_plan, created_at, updated_at')
      .eq('netlify_id', netlify_id)
      .single();

    if (selectError) {
      // If the error indicates that no rows were found (e.g., for .single() when 0 rows)
      if (selectError.code === 'PGRST116') {
        console.warn(`get-user-data: User profile not found for Netlify ID: ${netlify_id}`);
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'User profile not found in Supabase.' }),
        };
      }
      // For other errors
      console.error('get-user-data: Supabase select error:', selectError);
      throw selectError;
    }

    // If data is null but no error (e.g. using maybeSingle() and no record found, though .single() would error)
    // This check is mostly for robustness, as .single() should throw an error if no record is found.
    if (!userProfile) {
      console.warn(`get-user-data: User profile data is null for Netlify ID: ${netlify_id}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User profile not found in Supabase (no data returned).' }),
      };
    }

    console.log(`get-user-data: Successfully fetched profile for Netlify ID: ${netlify_id}`, userProfile);
    return {
      statusCode: 200,
      body: JSON.stringify(userProfile),
    };

  } catch (error) {
    console.error('get-user-data: Error fetching user profile from Supabase:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch user profile.', details: error.message || 'Unknown error' }),
    };
  }
};
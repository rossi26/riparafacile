// netlify/functions/get-user-data.js
import { createClient } from '@supabase/supabase-js'; // Already imported if in same file, but good for clarity if separate

const SUPABASE_URL = process.env.SUPABASE_URL; // Already defined
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Already defined
//const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { ... }); // Client already initialized

export const handler = async (event, context) => {
  // Ensure Supabase URL and Service Key are available at runtime
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase environment variables not available at runtime for get-user-data.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: Supabase credentials missing.' }),
    };
  }
  
  // Ensure the request is a GET request
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Get the authenticated user from Netlify Identity
  const { user } = context.clientContext;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: You must be logged in to fetch user data.' }) };
  }

  const netlify_id = user.sub;

  try {
    // Query Supabase for the user data using the netlify_id
    const { data: userProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id, email, username, created_at, updated_at') // Specify columns you want to return
      .eq('netlify_id', netlify_id)
      .single(); // Fetches a single record. Returns error if not exactly one row (unless .maybeSingle())

    if (selectError) {
      // If the error indicates that no rows were found (e.g., for .single() when 0 rows)
      // Supabase error code 'PGRST116' means "The result contains 0 rows"
      if (selectError.code === 'PGRST116') {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'User profile not found in Supabase.' }),
        };
      }
      // For other errors
      console.error('Supabase select error:', selectError);
      throw selectError;
    }
    
    // If data is null but no error (e.g. using maybeSingle() and no record found, though .single() would error)
    if (!userProfile) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'User profile not found in Supabase (no data).' }),
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(userProfile),
    };

  } catch (error) {
    console.error('Error fetching user profile from Supabase:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch user profile.', details: error.message || 'Unknown error' }),
    };
  }
};

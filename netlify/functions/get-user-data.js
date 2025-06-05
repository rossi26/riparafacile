// netlify/functions/get-user-data.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async (event, context) => {
  if (!supabase) {
    console.error('get-user-data: Supabase client not initialized.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error.' }) };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { user } = context.clientContext;
  if (!user || !user.token) { // Check for token as well
    console.warn('get-user-data: Unauthorized - No user context or token.');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: You must be logged in.' }) };
  }

  const netlify_id = user.sub;

  try {
    const { data: userProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id, email, name, username, phone, subscription_plan, created_at, updated_at') // Added 'name'
      .eq('netlify_id', netlify_id)
      .single();

    if (selectError) {
      if (selectError.code === 'PGRST116') { // No rows found
        return { statusCode: 404, body: JSON.stringify({ error: 'User profile not found in Supabase.' }) };
      }
      console.error('get-user-data: Supabase select error:', selectError);
      throw selectError;
    }
     
    if (!userProfile) { // Should be caught by PGRST116, but as a safeguard
        return { statusCode: 404, body: JSON.stringify({ error: 'User profile not found (no data).' }) };
    }

    console.log('get-user-data: Profile fetched for', netlify_id, userProfile.name);
    return { statusCode: 200, body: JSON.stringify(userProfile) };

  } catch (error) {
    console.error('get-user-data: Generic error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch user profile.', details: error.message })};
  }
};

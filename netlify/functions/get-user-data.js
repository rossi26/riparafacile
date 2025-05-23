// netlify/functions/get-user-data.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

export const handler = async (event, context) => {
  if (!supabase) {
    console.error('Supabase client not initialized in get-user-data.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: Supabase client not initialized.' }),
    };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { user } = context.clientContext;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: You must be logged in to fetch user data.' }) };
  }

  const netlify_id = user.sub;

  try {
    const { data: userProfile, error: selectError } = await supabase
      .from('user_profiles')
      // *** ASSICURATI CHE phone E subscription_plan SIANO QUI ***
      .select('netlify_id, email, username, created_at, updated_at, phone, subscription_plan')
      .eq('netlify_id', netlify_id)
      .single();

    if (selectError) {
      if (selectError.code === 'PGRST116') {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'User profile not found in Supabase.' }),
        };
      }
      console.error('Supabase select error in get-user-data:', selectError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to query user profile from Supabase.', details: selectError.message }),
      };
    }
     
    if (!userProfile) {
        console.error('Supabase returned no error and no user profile with .single() in get-user-data. Netlify ID:', netlify_id);
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'User profile data inexplicably missing after Supabase query.' }),
        };
    }

    // *** LOG PER DEBUG: Controlla i log della tua funzione Netlify ***
    console.log('User profile fetched from Supabase in get-user-data:', userProfile);

    return {
      statusCode: 200,
      body: JSON.stringify(userProfile), // Restituisce l'intero oggetto userProfile
    };

  } catch (error) {
    console.error('Generic error in get-user-data handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch user profile due to a server error.', details: error.message || 'Unknown error' }),
    };
  }
};

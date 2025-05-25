// netlify/functions/set-user-data.js
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
    console.error('Supabase client not initialized in set-user-data.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: Supabase client not initialized.' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { user } = context.clientContext;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: No user context.' }) };
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request: Invalid JSON.' }) };
  }
   
  const { username, phone, subscription_plan } = requestBody; // Destructure new fields

  if (!username || typeof username !== 'string' || username.trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Username is required and must be a non-empty string.' }) };
  }
  // Add validation for subscription_plan if it's mandatory
  if (!subscription_plan || typeof subscription_plan !== 'string' || subscription_plan.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Subscription plan is required.' }) };
  }
  // Phone can be optional, so we might not validate its presence as strictly,
  // but we should ensure it's a string if provided.
  if (phone && typeof phone !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Phone, if provided, must be a string.' }) };
  }


  const netlify_id = user.sub;
  const email = user.email;

  try {
    const { data: existingProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id')
      .eq('netlify_id', netlify_id)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') { 
      console.error('Supabase select error in set-user-data:', selectError);
      throw selectError;
    }

    let userProfileData;
    const currentTime = new Date().toISOString();
    const trimmedUsername = username.trim();
    const trimmedPhone = phone ? phone.trim() : null; // Trim phone if it exists, otherwise null
    const trimmedPlan = subscription_plan.trim();


    const profilePayload = {
        email: email,
        username: trimmedUsername,
        phone: trimmedPhone, // Add phone to payload
        subscription_plan: trimmedPlan, // Add plan to payload
        updated_at: currentTime,
    };

    if (existingProfile) {
      const { data: updatedData, error: updateError } = await supabase
        .from('user_profiles')
        .update(profilePayload) // Use the combined payload
        .eq('netlify_id', netlify_id)
        .select('username, email, netlify_id, created_at, updated_at, phone, subscription_plan') // Select new fields
        .single();

      if (updateError) {
        console.error('Supabase update error in set-user-data:', updateError);
        throw updateError;
      }
      userProfileData = updatedData;
      console.log(`User profile for ${netlify_id} updated in Supabase.`);
    } else {
      // For new profiles, also set created_at
      const insertPayload = {
        ...profilePayload,
        netlify_id: netlify_id,
        created_at: currentTime,
      };
      const { data: insertedData, error: insertError } = await supabase
        .from('user_profiles')
        .insert(insertPayload) // Use the combined payload including netlify_id and created_at
        .select('username, email, netlify_id, created_at, updated_at, phone, subscription_plan') // Select new fields
        .single();

      if (insertError) {
        console.error('Supabase insert error in set-user-data:', insertError);
        throw insertError;
      }
      userProfileData = insertedData;
      console.log(`User profile for ${netlify_id} created in Supabase.`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: existingProfile ? 'User data updated successfully.' : 'User data created successfully.',
        profile: userProfileData,
      }),
    };

  } catch (error) {
    console.error('Error processing user data with Supabase in set-user-data:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process user data.', details: error.message || 'Unknown error' }),
    };
  }
};

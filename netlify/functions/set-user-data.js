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
    console.error('set-user-data: Supabase client not initialized.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: Supabase client not initialized.' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { user } = context.clientContext;
  if (!user || !user.token) { // Also check for token presence
    console.error('set-user-data: Unauthorized - No user context or token.');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: No user context or token.' }) };
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request: Invalid JSON.' }) };
  }
   
  const { username, phone, subscription_plan } = requestBody;

  if (!username || typeof username !== 'string' || username.trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Username is required and must be a non-empty string.' }) };
  }
  
  if (phone && typeof phone !== 'string') { // Phone is optional, but if provided, must be string
    return { statusCode: 400, body: JSON.stringify({ error: 'Phone, if provided, must be a string.' }) };
  }
  // Subscription plan validation will be conditional based on new/existing user

  const netlify_id = user.sub;
  const email = user.email;
  const currentTime = new Date().toISOString();

  try {
    const { data: existingProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id') // Only need to check for existence
      .eq('netlify_id', netlify_id)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') { 
      console.error('set-user-data: Supabase select error:', selectError);
      throw selectError;
    }

    let userProfileData;
    const trimmedUsername = username.trim();
    
    // Prepare base payload for update/insert
    const profileChanges = {
        email: email,
        username: trimmedUsername,
        updated_at: currentTime,
    };

    // Add phone to changes if it was provided in the request
    if (phone !== undefined) { // Allows explicit null or empty string to clear phone
        profileChanges.phone = phone ? phone.trim() : null;
    }

    // Add subscription_plan to changes if it was provided
    if (subscription_plan !== undefined) {
        if (typeof subscription_plan === 'string' && subscription_plan.trim() !== '') {
            profileChanges.subscription_plan = subscription_plan.trim();
        } else if (subscription_plan === null || (typeof subscription_plan === 'string' && subscription_plan.trim() === '')) {
            // Allow explicitly setting plan to null or empty string (which will be stored as null if column allows)
            // For existing users. For new users, this will be caught below.
            profileChanges.subscription_plan = null; 
        } else if (typeof subscription_plan !== 'string') {
             return { statusCode: 400, body: JSON.stringify({ error: 'Subscription plan, if provided, must be a string or null.' }) };
        }
        // If subscription_plan is undefined, it's not included in profileChanges, so it won't be updated.
    }


    if (existingProfile) {
      // User exists, update. Only fields in profileChanges will be updated.
      console.log(`set-user-data: Updating existing profile for ${netlify_id} with payload:`, profileChanges);
      const { data: updatedData, error: updateError } = await supabase
        .from('user_profiles')
        .update(profileChanges)
        .eq('netlify_id', netlify_id)
        .select('username, email, netlify_id, created_at, updated_at, phone, subscription_plan')
        .single();

      if (updateError) {
        console.error('set-user-data: Supabase update error:', updateError);
        throw updateError;
      }
      userProfileData = updatedData;
      console.log(`set-user-data: User profile for ${netlify_id} updated successfully.`);
    } else {
      // New user: subscription_plan from request is now mandatory here.
      // profileChanges already contains username, email, updated_at, and potentially phone/plan.
      // We need to ensure 'subscription_plan' is valid for new user.
      if (!profileChanges.subscription_plan || typeof profileChanges.subscription_plan !== 'string' || profileChanges.subscription_plan.trim() === '') {
          // This check is after we've processed `subscription_plan` into `profileChanges.subscription_plan`
          return { statusCode: 400, body: JSON.stringify({ error: 'Subscription plan is required for new user registration and cannot be empty.' }) };
      }

      const insertPayload = {
        ...profileChanges, // Contains email, username, updated_at, and validated phone/plan
        netlify_id: netlify_id,
        created_at: currentTime,
      };
      console.log(`set-user-data: Creating new profile for ${netlify_id} with payload:`, insertPayload);

      const { data: insertedData, error: insertError } = await supabase
        .from('user_profiles')
        .insert(insertPayload)
        .select('username, email, netlify_id, created_at, updated_at, phone, subscription_plan')
        .single();

      if (insertError) {
        console.error('set-user-data: Supabase insert error:', insertError);
        throw insertError;
      }
      userProfileData = insertedData;
      console.log(`set-user-data: User profile for ${netlify_id} created successfully.`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: existingProfile ? 'User data updated successfully.' : 'User data created successfully.',
        profile: userProfileData,
      }),
    };

  } catch (error) {
    console.error('set-user-data: Error processing user data:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process user data.', details: error.message || 'Unknown error' }),
    };
  }
};

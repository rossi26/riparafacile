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
  if (!user || !user.token) { // Aggiunto controllo per user.token
    console.error('set-user-data: Unauthorized - No user context or token.');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: No user context or token.' }) };
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request: Invalid JSON.' }) };
  }
   
  // Rinomino planFromRequest per chiarezza, phone rimane phone
  const { username, phone, subscription_plan: planFromRequest } = requestBody;

  if (!username || typeof username !== 'string' || username.trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Username is required and must be a non-empty string.' }) };
  }
  // Validazione per phone: se fornito e non nullo, deve essere una stringa.
  if (phone !== undefined && phone !== null && typeof phone !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Phone, if provided, must be a string.' }) };
  }
  // Validazione per planFromRequest: se fornito e non nullo, deve essere una stringa.
  if (planFromRequest !== undefined && planFromRequest !== null && typeof planFromRequest !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Subscription plan, if provided, must be a string.' }) };
  }

  const netlify_id = user.sub;
  const email = user.email;
  const currentTime = new Date().toISOString();
  const trimmedUsername = username.trim();

  try {
    const { data: existingProfile, error: selectError } = await supabase
      .from('user_profiles')
      .select('netlify_id') // Seleziona solo un campo per verificare l'esistenza
      .eq('netlify_id', netlify_id)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') { 
      console.error('Supabase select error in set-user-data:', selectError);
      throw selectError; // Lascia che il blocco catch principale gestisca questo
    }

    let userProfileData;
    
    if (existingProfile) {
      // Utente esistente: costruisci il payload per l'aggiornamento
      const updatePayload = {
        email: email, // Sincronizza sempre l'email
        username: trimmedUsername, // Sincronizza sempre lo username
        updated_at: currentTime,
      };

      // Aggiungi phone al payload solo se è stato fornito nella richiesta
      if (phone !== undefined) {
        updatePayload.phone = (phone === null) ? null : phone.trim();
      }

      // Aggiungi subscription_plan al payload solo se è stato fornito nella richiesta
      if (planFromRequest !== undefined) {
        if (planFromRequest === null || !planFromRequest.trim()) {
            // Se il piano è esplicitamente nullo o una stringa vuota per un utente esistente,
            // potresti volerlo impostare a null o generare un errore se non è permesso.
            // Per ora, se fornito vuoto, lo impostiamo a null (o potresti restituire un errore 400).
            // Se la logica di business richiede che un piano non possa essere rimosso una volta impostato,
            // aggiungi qui un controllo.
            updatePayload.subscription_plan = null; 
            // Oppure: return { statusCode: 400, body: JSON.stringify({ error: 'Subscription plan cannot be empty if provided for update.' }) };
        } else {
            updatePayload.subscription_plan = planFromRequest.trim();
        }
      }
      // Se phone o planFromRequest sono undefined, non vengono inclusi in updatePayload,
      // quindi Supabase non modificherà quei campi.

      const { data: updatedData, error: updateError } = await supabase
        .from('user_profiles')
        .update(updatePayload)
        .eq('netlify_id', netlify_id)
        .select('username, email, netlify_id, created_at, updated_at, phone, subscription_plan')
        .single();

      if (updateError) {
        console.error('Supabase update error in set-user-data:', updateError);
        throw updateError;
      }
      userProfileData = updatedData;
      console.log(`User profile for ${netlify_id} updated in Supabase.`);
    } else {
      // Nuovo utente: subscription_plan è obbligatorio
      if (planFromRequest === undefined || planFromRequest === null || typeof planFromRequest !== 'string' || !planFromRequest.trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Subscription plan is required for new user registration.' }) };
      }

      const insertPayload = {
        netlify_id: netlify_id,
        email: email,
        username: trimmedUsername,
        // Phone è opzionale per i nuovi utenti, imposta a null se non fornito o fornito come null
        phone: (phone === undefined || phone === null) ? null : phone.trim(),
        subscription_plan: planFromRequest.trim(),
        created_at: currentTime,
        updated_at: currentTime,
      };
      
      const { data: insertedData, error: insertError } = await supabase
        .from('user_profiles')
        .insert(insertPayload)
        .select('username, email, netlify_id, created_at, updated_at, phone, subscription_plan')
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

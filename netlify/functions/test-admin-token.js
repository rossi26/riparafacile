// netlify/functions/test-admin-token.js
// This is a simple function to test if your NETLIFY_ADMIN_ACCESS_TOKEN is valid
// for making any administrative API call.
import fetch from 'node-fetch';

const {
  NETLIFY_ADMIN_ACCESS_TOKEN,
  SITE_ID 
} = process.env;

export const handler = async (event) => {
  // 1. Check if the required environment variables are available.
  if (!NETLIFY_ADMIN_ACCESS_TOKEN || !SITE_ID) {
    const missingVars = [
        !NETLIFY_ADMIN_ACCESS_TOKEN && "NETLIFY_ADMIN_ACCESS_TOKEN",
        !SITE_ID && "SITE_ID"
    ].filter(Boolean).join(', ');
    console.error(`test-admin-token: Missing required environment variables: ${missingVars}.`);
    return { 
      statusCode: 500, 
      body: `Server configuration error. The following environment variables are missing: ${missingVars}` 
    };
  }

  // 2. Prepare the request to a simple, read-only endpoint.
  const trimmedAdminToken = NETLIFY_ADMIN_ACCESS_TOKEN.trim();
  const apiHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${trimmedAdminToken}`,
  };
  const deploysApiUrl = `https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys`;

  console.log(`test-admin-token: Attempting to call Netlify API at ${deploysApiUrl}`);
  console.log(`test-admin-token: Using token of length ${trimmedAdminToken.length}.`);

  try {
    // 3. Make the API call.
    const response = await fetch(deploysApiUrl, {
      method: 'GET',
      headers: apiHeaders,
    });

    const responseData = await response.json();

    // 4. Check the response.
    if (!response.ok) {
      console.error('test-admin-token: API call FAILED.', {
        status: response.status,
        statusText: response.statusText,
        responseData: responseData
      });
      // This is the critical part. If you see this, the token is invalid.
      return {
        statusCode: response.status, // e.g., 401
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: "TEST FAILED: The Personal Access Token was rejected by the Netlify API.",
          details: responseData,
        }),
      };
    }

    // 5. If successful, return a success message.
    console.log('test-admin-token: API call SUCCEEDED.');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "TEST SUCCEEDED: The Personal Access Token is valid and can authenticate with the Netlify API.",
        deploys_found: responseData.length, // Should be a number
      }),
    };

  } catch (error) {
    console.error('test-admin-token: Unhandled exception in handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected server error occurred during the test.', details: error.message }),
    };
  }
};

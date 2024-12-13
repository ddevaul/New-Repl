import { config } from "../config.js";

export const PLACEHOLDER_IMAGE = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIGZpbGw9IiNmNGY0ZjUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNHB4Ij5HZW5lcmF0aW5nIGltYWdlLi4uPC90ZXh0Pjwvc3ZnPg==";

export async function generateImage(prompt: string): Promise<string> {
  try {
    const apiKey = process.env.STABILITY_API_KEY;
    
    console.log('Starting image generation with prompt:', { prompt });

    if (!apiKey || apiKey.trim() === '') {
      console.error('STABILITY_API_KEY is not set or empty');
      return PLACEHOLDER_IMAGE;
    }

    // Log the API key length to verify it's present (don't log the actual key)
    console.log('API Key check:', {
      keyPresent: !!apiKey,
      keyLength: apiKey.length,
      keyStartsWith: apiKey.substring(0, 4) + '...'
    });

    // Default to stable-diffusion-xl-1024-v1-0 if not configured
    const engineId = 'stable-diffusion-xl-1024-v1-0';
    const apiUrl = `https://api.stability.ai/v1/generation/${engineId}/text-to-image`;
    
    console.log('Using Stability AI configuration:', {
      engine: engineId,
      apiUrl: apiUrl
    });

    const requestBody = {
      text_prompts: [{ 
        text: prompt,
        weight: 1
      }],
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      samples: 1,
      steps: 30,
      style_preset: "digital-art"
    };

    console.log('Preparing Stability AI request:', {
      method: 'POST',
      url: apiUrl,
      bodyLength: JSON.stringify(requestBody).length,
      prompt: requestBody.text_prompts[0].text
    });

    // Test API key validity first
    try {
      const balanceResponse = await fetch('https://api.stability.ai/v1/user/balance', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!balanceResponse.ok) {
        console.error('Invalid API key or API access error:', await balanceResponse.text());
        return PLACEHOLDER_IMAGE;
      }

      console.log('API key validated successfully');
    } catch (balanceError: any) {
      console.error('Failed to validate API key:', balanceError);
      return PLACEHOLDER_IMAGE;
    }

    // Make the API request with detailed error handling
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      console.log('Sending request to Stability AI...');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('Received initial response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      // Read the response as text first
      const responseText = await response.text();
      console.log('Response body preview:', responseText.substring(0, 200) + '...');

      if (!response.ok) {
        console.error('API error response:', responseText);
        return PLACEHOLDER_IMAGE;
      }

      // Try to parse the response as JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        return PLACEHOLDER_IMAGE;
      }

      // Validate the response structure
      if (!responseData.artifacts || !Array.isArray(responseData.artifacts)) {
        console.error('Invalid response structure:', responseData);
        return PLACEHOLDER_IMAGE;
      }

      const firstArtifact = responseData.artifacts[0];
      if (!firstArtifact || !firstArtifact.base64) {
        console.error('Invalid artifact structure:', firstArtifact);
        return PLACEHOLDER_IMAGE;
      }

      console.log('Successfully processed API response:', {
        artifactsCount: responseData.artifacts.length,
        base64Length: firstArtifact.base64.length,
        finishReason: firstArtifact.finishReason
      });

      return `data:image/png;base64,${firstArtifact.base64}`;

    } catch (fetchError: any) {
      console.error('Stability AI API Error:', {
        name: fetchError.name,
        message: fetchError.message,
        cause: fetchError.cause,
        stack: fetchError.stack
      });
      return PLACEHOLDER_IMAGE;
    }
  } catch (error: any) {
    console.error('Image Generation Error:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
      stack: error.stack
    });
    return PLACEHOLDER_IMAGE;
  }
}

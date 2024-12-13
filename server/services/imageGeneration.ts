import { config } from "../config.js";

// We'll throw an error instead of using a placeholder
export const IMAGE_GENERATION_ERROR = "Failed to generate or retrieve image";

export async function generateImage(prompt: string): Promise<string> {
  try {
    const apiKey = process.env.STABILITY_API_KEY;
    
    console.log('Starting image generation with prompt:', { prompt });

    if (!apiKey || apiKey.trim() === '') {
        throw new Error('STABILITY_API_KEY is not set or empty');
      }

      console.log('Verifying API key configuration...');

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
        const errorText = await balanceResponse.text();
        console.error('Invalid API key or API access error:', errorText);
        throw new Error(`API key validation failed: ${errorText}`);
      }

      console.log('API key validated successfully');
    } catch (balanceError: any) {
      console.error('Failed to validate API key:', balanceError);
      throw new Error(`API key validation failed: ${balanceError.message}`);
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
        throw new Error(`API request failed: ${responseText}`);
      }

      // Try to parse the response as JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        throw new Error(`JSON parsing failed: ${parseError.message}`);
      }

      // Validate the response structure
      if (!responseData.artifacts || !Array.isArray(responseData.artifacts)) {
        console.error('Invalid response structure:', responseData);
        throw new Error('Invalid response structure from Stability AI');
      }

      const firstArtifact = responseData.artifacts[0];
      if (!firstArtifact || !firstArtifact.base64) {
        console.error('Invalid artifact structure:', firstArtifact);
        throw new Error('Invalid artifact structure from Stability AI');
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
      throw new Error(`Stability AI API request failed: ${fetchError.message}`);
    }
  } catch (error: any) {
    console.error('Image Generation Error:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
      stack: error.stack
    });
    throw new Error(`Image generation failed: ${error.message}`);
  }
}
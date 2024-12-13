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

    // Default to stable-diffusion-xl-1024-v1-0 if not configured
    const engineId = 'stable-diffusion-xl-1024-v1-0';
    console.log('Using Stability AI engine:', engineId);

    const requestBody = {
      text_prompts: [{ 
        text: `A simple, clear illustration of ${prompt}. Minimalist style, clean lines, white background.`
      }],
      cfg_scale: 7,
      height: 512,
      width: 512,
      samples: 1,
      style_preset: "digital-art"
    };

    console.log('Sending request to Stability AI:', {
      url: `https://api.stability.ai/v1/generation/${engineId}/text-to-image`,
      apiKeyLength: apiKey.length,
      requestBody
    });

    try {
      const response = await fetch(
        `https://api.stability.ai/v1/generation/${engineId}/text-to-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      console.log('Received response from Stability AI:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      const responseText = await response.text();
      console.log('Raw API Response:', responseText);

      if (!response.ok) {
        console.error('Stability AI API error:', {
          status: response.status,
          statusText: response.statusText,
          responseText
        });
        return PLACEHOLDER_IMAGE;
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse API response:', parseError);
        return PLACEHOLDER_IMAGE;
      }

      console.log('Parsed API Response:', {
        hasArtifacts: !!responseData.artifacts,
        artifactsLength: responseData.artifacts?.length,
        firstArtifactHasBase64: !!responseData.artifacts?.[0]?.base64
      });

      if (!responseData.artifacts?.[0]?.base64) {
        console.error('Invalid response format from Stability AI');
        return PLACEHOLDER_IMAGE;
      }

      const base64Image = responseData.artifacts[0].base64;
      console.log('Successfully generated image');
      
      return `data:image/png;base64,${base64Image}`;
    } catch (fetchError) {
      console.error('Failed to fetch from Stability AI:', fetchError);
      return PLACEHOLDER_IMAGE;
    }
  } catch (error: any) {
    console.error('Image generation failed:', error.message);
    return PLACEHOLDER_IMAGE;
  }
}
